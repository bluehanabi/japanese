"""
Kanji Flow 2.0 - Flask 백엔드 서버
포트 8005로 실행
"""
import json
import os
import re
import random
import threading
from datetime import date, timedelta
from flask import Flask, jsonify, request, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from database import get_db, init_db, get_setting, set_setting
from srs import calculate_next_review, QUALITY_MAP, get_card_state, predict_interval

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)


@app.after_request
def no_cache_assets(resp):
    """HTML/JS/CSS는 캐시하지 않게 해서 배포 후 항상 최신본이 보이도록 함."""
    if request.path == "/" or request.path.endswith((".html", ".js", ".css")):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp

# ══════════════════════════════════════════════════════════
#  정적 파일 서빙
# ══════════════════════════════════════════════════════════

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/download")
def download_apk():
    """안드로이드 APK 다운로드 (GitHub Actions가 빌드해 둔 파일)."""
    apk_dir = os.path.join(os.path.dirname(__file__), "static", "download")
    apk = os.path.join(apk_dir, "kanji-flow.apk")
    if os.path.exists(apk):
        return send_from_directory(apk_dir, "kanji-flow.apk", as_attachment=True,
                                   download_name="KanjiFlow.apk",
                                   mimetype="application/vnd.android.package-archive")
    return Response(
        "<div style='font-family:sans-serif;padding:40px;text-align:center;color:#333'>"
        "<h2>APK가 아직 준비되지 않았어요</h2>"
        "<p>GitHub Actions에서 'Build APK' 워크플로를 실행하면 생성됩니다.</p></div>",
        mimetype="text/html", status=404)


def _level_scope():
    """레벨 범위만: 한자=漢検 급수, 그 외=JLPT 레벨. (단어장 '전체'용)"""
    levels = [l.strip() for l in get_setting("active_levels", "N5,N4").split(",") if l.strip()] \
             or ["N5", "N4", "N3", "N2", "N1"]
    kanken = [k.strip() for k in get_setting("active_kanken", "10급,9급,8급,7급").split(",") if k.strip()] \
             or ["10급", "9급", "8급", "7급", "6급", "5급", "4급", "3급", "준2급", "2급"]
    cond = (
        "((c.type = 'kanji' AND c.sub_level IN (%s)) OR (c.type <> 'kanji' AND c.jlpt_level IN (%s)))"
        % (",".join(["?"] * len(kanken)), ",".join(["?"] * len(levels)))
    )
    return cond, kanken + levels


def _active_scope():
    """현재 설정(레벨·한자급수·종류·카테고리) 기준 카드 필터 SQL과 파라미터."""
    study_mode = get_setting("study_mode", "both")
    categories = [c.strip() for c in get_setting("active_categories", "").split(",") if c.strip()] \
                 or ["한자", "명사", "동사", "형용사", "부사", "기타", "문법"]
    type_filter = ""
    if study_mode == "kanji_only":   type_filter = "AND c.type = 'kanji'"
    elif study_mode == "word_only":  type_filter = "AND c.type = 'word'"
    elif study_mode == "grammar_only": type_filter = "AND c.type = 'grammar'"
    level_cond, level_params = _level_scope()
    cond = f"{level_cond} AND c.category IN ({','.join(['?'] * len(categories))}) {type_filter}"
    return cond, level_params + categories


# ══════════════════════════════════════════════════════════
#  API: 오늘의 학습
# ══════════════════════════════════════════════════════════

@app.route("/api/today")
def get_today_cards():
    """오늘 복습 예정 카드 + 새 카드 반환 (설정 및 셔플 연동)"""
    today = date.today().isoformat()
    extra = request.args.get("extra") == "1"   # 추가 학습 모드 (오늘 목표 초과)
    study_mode = get_setting("study_mode", "both")
    daily_new = int(get_setting("daily_new_cards", "10"))

    active_levels_str = get_setting("active_levels", "N5,N4")
    active_categories_str = get_setting("active_categories", "한자,명사,동사,형용사,부사,기타,문법")
    active_kanken_str = get_setting("active_kanken", "10급,9급,8급,7급")
    shuffle_study = get_setting("shuffle_study", "1")

    # 콤마 기준 파싱 및 정제
    levels = [l.strip() for l in active_levels_str.split(",") if l.strip()]
    categories = [c.strip() for c in active_categories_str.split(",") if c.strip()]
    kanken = [k.strip() for k in active_kanken_str.split(",") if k.strip()]

    # 빈 리스트 대비 기본값
    if not levels: levels = ["N5", "N4", "N3", "N2", "N1"]
    if not categories: categories = ["한자", "명사", "동사", "형용사", "부사", "기타", "문법"]
    if not kanken: kanken = ["10급", "9급", "8급", "7급", "6급", "5급", "4급", "3급", "준2급", "2급"]

    conn = get_db()

    # 오늘 이미 복습한 신규 카드 수 확인
    new_done_today = conn.execute("""
        SELECT COUNT(DISTINCT rl.card_id) FROM review_log rl
        JOIN cards c ON c.id = rl.card_id
        WHERE rl.reviewed_at = ? AND (SELECT repetitions FROM reviews WHERE card_id = c.id) = 1
    """, (today,)).fetchone()[0]

    # 추가 학습 모드면 오늘 한 개수와 무관하게 새 카드 한 묶음을 더 제공
    remaining_new = daily_new if extra else max(0, daily_new - new_done_today)

    # 모드 필터
    type_filter = ""
    if study_mode == "kanji_only":
        type_filter = "AND c.type = 'kanji'"
    elif study_mode == "word_only":
        type_filter = "AND c.type = 'word'"
    elif study_mode == "grammar_only":
        type_filter = "AND c.type = 'grammar'"

    # 등급 & 카테고리 동적 조건 생성을 위해 플레이스홀더 준비
    category_placeholders = ",".join(["?"] * len(categories))
    # 레벨 조건: 한자는 漢検 급수(sub_level), 그 외(어휘·문법)는 JLPT 레벨
    level_cond = (
        "((c.type = 'kanji' AND c.sub_level IN (%s)) "
        "OR (c.type <> 'kanji' AND c.jlpt_level IN (%s)))"
        % (",".join(["?"] * len(kanken)), ",".join(["?"] * len(levels)))
    )
    level_params = kanken + levels

    # 복습 카드
    #  - 일반 학습: 오늘 복습 예정(next_review <= 오늘)인 카드만
    #  - 추가 학습: 진행 중(학습 중) 카드 전체에서 무작위 (예정일 무관) → '학습중 + @'
    if extra:
        # 추가 학습: 진행 중(학습 중) 카드 무작위로 설정 개수만큼.
        # 단, 오늘 '맞았어/완벽히 알아'(quality>=4)로 푼 카드는 제외 → 다른/새 단어 위주로
        review_cards = conn.execute(f"""
            SELECT c.*, r.ease_factor, r.interval, r.repetitions,
                   r.next_review, r.total_reviews, r.correct_count, r.id as review_id
            FROM cards c
            JOIN reviews r ON r.card_id = c.id
            WHERE r.repetitions > 0
            AND {level_cond}
            AND c.category IN ({category_placeholders})
            AND c.id NOT IN (SELECT card_id FROM review_log WHERE reviewed_at = ? AND quality >= 4)
            {type_filter}
            ORDER BY RANDOM()
            LIMIT ?
        """, level_params + categories + [today, daily_new]).fetchall()
    else:
        review_cards = conn.execute(f"""
            SELECT c.*, r.ease_factor, r.interval, r.repetitions,
                   r.next_review, r.total_reviews, r.correct_count, r.id as review_id
            FROM cards c
            JOIN reviews r ON r.card_id = c.id
            WHERE r.next_review <= ? AND r.repetitions > 0
            AND {level_cond}
            AND c.category IN ({category_placeholders})
            {type_filter}
            ORDER BY r.next_review ASC
        """, [today] + level_params + categories).fetchall()

    # 신규 카드 (한 번도 안 본 것, 오늘 개수 제한)
    # 셔플 켜짐: 무작위로 뽑아 타입(한자·단어·문법)이 골고루 섞이게 함
    new_order = "RANDOM()" if shuffle_study == "1" else "c.jlpt_level DESC, c.type ASC, c.id ASC"
    query_params_new = level_params + categories + [remaining_new]
    new_cards = conn.execute(f"""
        SELECT c.*, r.ease_factor, r.interval, r.repetitions,
               r.next_review, r.total_reviews, r.correct_count, r.id as review_id
        FROM cards c
        JOIN reviews r ON r.card_id = c.id
        WHERE r.repetitions = 0
        AND {level_cond}
        AND c.category IN ({category_placeholders})
        {type_filter}
        ORDER BY {new_order}
        LIMIT ?
    """, query_params_new).fetchall()

    conn.close()

    def row_to_dict(row):
        d = dict(row)
        if d.get("extra_info"):
            try:
                d["extra_info"] = json.loads(d["extra_info"])
            except:
                pass
        d["state"] = get_card_state(d["repetitions"], d["interval"])
        rep, ef, iv = d["repetitions"], d["ease_factor"], d["interval"]
        d["hints"] = {
            a: predict_interval(rep, ef, iv, a)
            for a in ("again", "hard", "good", "easy")
        }
        return d

    review_list = [row_to_dict(r) for r in review_cards]
    new_list = [row_to_dict(r) for r in new_cards]

    if extra:
        # 추가 학습: 설정 개수(daily_new)만큼, 학습 중 카드를 우선 채우고
        # 모자라면 신규로 채운 뒤, 전부 한데 섞어서 출제
        queue = review_list[:daily_new]
        if len(queue) < daily_new:
            queue += new_list[:daily_new - len(queue)]
        random.shuffle(queue)
        review_list, new_list = queue, []
    elif shuffle_study == "1":
        # 일반 학습: 복습/신규를 개별적으로 섞음 (복습 우선 순서 유지)
        random.shuffle(review_list)
        random.shuffle(new_list)

    return jsonify({
        "today": today,
        "review_cards": review_list,
        "new_cards": new_list,
        "review_count": len(review_list),
        "new_count": len(new_list),
        "total_due": len(review_list) + len(new_list),
    })


@app.route("/api/review", methods=["POST"])
def submit_review():
    """복습 결과 제출 및 SRS 업데이트"""
    data = request.get_json()
    card_id = data.get("card_id")
    answer = data.get("answer")  # 'again' / 'hard' / 'good' / 'easy'
    today = date.today().isoformat()

    quality = QUALITY_MAP.get(answer, 0)

    conn = get_db()
    row = conn.execute(
        "SELECT * FROM reviews WHERE card_id = ?", (card_id,)
    ).fetchone()

    if not row:
        conn.close()
        return jsonify({"error": "카드를 찾을 수 없습니다"}), 404

    correct = 1 if quality >= 4 else 0
    # 오늘 이미 복습한 카드인지 확인 (같은 날 추가 연습이 간격을 부풀리지 않게)
    already_today = conn.execute(
        "SELECT 1 FROM review_log WHERE card_id = ? AND reviewed_at = ? LIMIT 1", (card_id, today)
    ).fetchone()

    if already_today:
        # 일정(간격/다음복습)은 그대로 두고, 통계와 이력만 갱신 = '오늘은 오늘치만'
        conn.execute("""
            UPDATE reviews SET last_quality = ?, total_reviews = total_reviews + 1,
                correct_count = correct_count + ? WHERE card_id = ?
        """, (quality, correct, card_id))
        new_interval, new_ef, new_reps, next_review = (
            row["interval"], row["ease_factor"], row["repetitions"], row["next_review"]
        )
    else:
        new_interval, new_ef, new_reps, next_review = calculate_next_review(
            row["repetitions"], row["ease_factor"], row["interval"], quality
        )
        conn.execute("""
            UPDATE reviews
            SET ease_factor = ?, interval = ?, repetitions = ?,
                next_review = ?, last_quality = ?,
                total_reviews = total_reviews + 1,
                correct_count = correct_count + ?
            WHERE card_id = ?
        """, (new_ef, new_interval, new_reps, next_review, quality, correct, card_id))

    conn.execute("""
        INSERT INTO review_log (card_id, reviewed_at, quality)
        VALUES (?, ?, ?)
    """, (card_id, today, quality))

    conn.commit()
    conn.close()

    return jsonify({
        "next_review": next_review,
        "interval": new_interval,
        "ease_factor": new_ef,
        "repetitions": new_reps,
        "rescheduled": not bool(already_today),
        "state": get_card_state(new_reps, new_interval),
    })


# ══════════════════════════════════════════════════════════
#  API: 통계
# ══════════════════════════════════════════════════════════

@app.route("/api/stats")
def get_stats():
    """전체 학습 통계 반환"""
    today = date.today().isoformat()
    conn = get_db()

    total = conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0]
    new_cnt = conn.execute("SELECT COUNT(*) FROM reviews WHERE repetitions = 0").fetchone()[0]
    learning = conn.execute(
        "SELECT COUNT(*) FROM reviews WHERE repetitions > 0 AND interval < 21"
    ).fetchone()[0]
    mastered = conn.execute(
        "SELECT COUNT(*) FROM reviews WHERE interval >= 21"
    ).fetchone()[0]

    # 현재 선택한 범위(레벨·급수·종류·카테고리) 기준 집계 — 홈 '학습 현황' 바용
    scope_cond, scope_params = _active_scope()
    base = f"FROM cards c JOIN reviews r ON r.card_id = c.id WHERE {scope_cond}"
    scope_total    = conn.execute(f"SELECT COUNT(*) {base}", scope_params).fetchone()[0]
    scope_new      = conn.execute(f"SELECT COUNT(*) {base} AND r.repetitions = 0", scope_params).fetchone()[0]
    scope_learning = conn.execute(f"SELECT COUNT(*) {base} AND r.repetitions > 0 AND r.interval < 21", scope_params).fetchone()[0]
    scope_mastered = conn.execute(f"SELECT COUNT(*) {base} AND r.interval >= 21", scope_params).fetchone()[0]

    due_today = conn.execute(
        "SELECT COUNT(*) FROM reviews WHERE next_review <= ? AND repetitions > 0", (today,)
    ).fetchone()[0]

    today_done = conn.execute(
        "SELECT COUNT(*) FROM review_log WHERE reviewed_at = ?", (today,)
    ).fetchone()[0]

    today_correct = conn.execute(
        "SELECT COUNT(*) FROM review_log WHERE reviewed_at = ? AND quality >= 3", (today,)
    ).fetchone()[0]

    # 연속 학습 일수 계산
    streak = _calc_streak(conn)

    # 히트맵 데이터 (최근 365일)
    heatmap = conn.execute("""
        SELECT reviewed_at, COUNT(*) as count
        FROM review_log
        WHERE reviewed_at >= date('now', '-365 days')
        GROUP BY reviewed_at
        ORDER BY reviewed_at
    """).fetchall()

    # 취약 카드 TOP 10 (정답률 낮은 순)
    weak_cards = conn.execute("""
        SELECT c.front, c.back_meaning, c.type, r.total_reviews,
               r.correct_count,
               CAST(r.correct_count AS REAL) / MAX(r.total_reviews, 1) as accuracy
        FROM cards c JOIN reviews r ON r.card_id = c.id
        WHERE r.total_reviews >= 3
        ORDER BY accuracy ASC
        LIMIT 10
    """).fetchall()

    conn.close()

    return jsonify({
        "total_cards": total,
        "new": new_cnt,
        "learning": learning,
        "mastered": mastered,
        # 선택 범위 기준 (홈 '학습 현황' 바)
        "scope_total": scope_total,
        "scope_new": scope_new,
        "scope_learning": scope_learning,
        "scope_mastered": scope_mastered,
        "due_today": due_today,
        "today_reviewed": today_done,
        "today_correct": today_correct,
        "today_accuracy": round(today_correct / max(today_done, 1) * 100, 1),
        "streak": streak,
        "heatmap": [{"date": r["reviewed_at"], "count": r["count"]} for r in heatmap],
        "weak_cards": [dict(r) for r in weak_cards],
    })


def _calc_streak(conn) -> int:
    """연속 학습 일수 계산"""
    rows = conn.execute("""
        SELECT DISTINCT reviewed_at FROM review_log
        ORDER BY reviewed_at DESC
    """).fetchall()

    if not rows:
        return 0

    streak = 0
    check = date.today()
    for row in rows:
        d = date.fromisoformat(row["reviewed_at"])
        if d == check:
            streak += 1
            check -= timedelta(days=1)
        elif d == check + timedelta(days=1):
            # 오늘 아직 안 했지만 어제부터 연속인 경우
            check = d - timedelta(days=1)
            streak += 1
        else:
            break
    return streak


# ══════════════════════════════════════════════════════════
#  API: 전체 카드 목록 / 검색
# ══════════════════════════════════════════════════════════

@app.route("/api/cards")
def get_all_cards():
    """전체 카드 목록 (타입, JLPT 레벨 필터 가능)"""
    card_type = request.args.get("type")   # 'kanji' / 'word' / 'grammar'
    level = request.args.get("level")      # 'N5' ~ 'N1'
    state = request.args.get("state")      # 'new' / 'learning' / 'mastered'
    kanken = request.args.get("kanken")    # '10급' ~ '2급' (한자 전용)
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 50))
    offset = (page - 1) * per_page

    conn = get_db()
    params = []
    where = []

    # 단어장 '전체' = 설정에서 고른 레벨/급수 범위만
    if request.args.get("scope") == "1":
        lc, lp = _level_scope()
        where.append(lc)
        params.extend(lp)
    if card_type:
        where.append("c.type = ?")
        params.append(card_type)
    if level:
        where.append("c.jlpt_level = ?")
        params.append(level)
    if kanken:
        where.append("c.sub_level = ?")
        params.append(kanken)
    if state == "new":
        where.append("r.repetitions = 0")
    elif state == "learning":
        where.append("r.repetitions > 0 AND r.interval < 21")
    elif state == "mastered":
        where.append("r.interval >= 21")

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = conn.execute(f"""
        SELECT c.*, r.repetitions, r.interval, r.ease_factor, r.next_review,
               r.total_reviews, r.correct_count
        FROM cards c JOIN reviews r ON r.card_id = c.id
        {where_sql}
        ORDER BY c.jlpt_level DESC, c.type ASC, c.id ASC
        LIMIT ? OFFSET ?
    """, params + [per_page, offset]).fetchall()

    total = conn.execute(f"""
        SELECT COUNT(*) FROM cards c JOIN reviews r ON r.card_id = c.id {where_sql}
    """, params).fetchone()[0]

    conn.close()

    def to_dict(row):
        d = dict(row)
        if d.get("extra_info"):
            d["extra_info"] = json.loads(d["extra_info"])
        d["state"] = get_card_state(d["repetitions"], d["interval"])
        return d

    return jsonify({
        "cards": [to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
    })


@app.route("/api/search")
def search_cards():
    """한자/단어 검색"""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"results": []})

    conn = get_db()
    rows = conn.execute("""
        SELECT c.*, r.repetitions, r.interval, r.total_reviews, r.correct_count
        FROM cards c JOIN reviews r ON r.card_id = c.id
        WHERE c.front LIKE ? OR c.back_meaning LIKE ? OR c.back_reading LIKE ?
        LIMIT 20
    """, (f"%{q}%", f"%{q}%", f"%{q}%")).fetchall()
    conn.close()

    def to_dict(row):
        d = dict(row)
        if d.get("extra_info"):
            d["extra_info"] = json.loads(d["extra_info"])
        d["state"] = get_card_state(d["repetitions"], d["interval"])
        return d

    return jsonify({"results": [to_dict(r) for r in rows]})


# ══════════════════════════════════════════════════════════
#  API: 랜덤 사지선다 퀴즈
# ══════════════════════════════════════════════════════════

@app.route("/api/quiz")
def build_quiz():
    """사지선다 퀴즈 문제 묶음 생성.

    쿼리 파라미터:
      n      : 문제 수 (기본 15)
      level  : 특정 JLPT 등급만 (예: N5) — 선택
      type   : 'kanji' | 'word' — 선택
      ids    : 콤마로 구분된 카드 id (가사 퀴즈 등 특정 카드 한정) — 선택
    """
    n = max(1, min(50, int(request.args.get("n", 15))))
    level = request.args.get("level")
    ctype = request.args.get("type")
    ids = request.args.get("ids", "").strip()

    conn = get_db()
    pool = conn.execute("SELECT id, type, front, back_meaning, back_reading, jlpt_level FROM cards").fetchall()
    conn.close()
    pool = [dict(r) for r in pool]

    # 출제 대상 선정
    if ids:
        id_set = {int(x) for x in ids.split(",") if x.strip().isdigit()}
        targets = [c for c in pool if c["id"] in id_set]
    elif level:
        targets = [c for c in pool if c["jlpt_level"] == level]
        if ctype:
            targets = [c for c in targets if c["type"] == ctype]
    else:
        # 등급 지정이 없으면 내 학습 설정(레벨·급수·종류·카테고리) 범위로 출제
        cond, sparams = _active_scope()
        conn2 = get_db()
        scope_ids = {row[0] for row in conn2.execute(
            f"SELECT c.id FROM cards c JOIN reviews r ON r.card_id = c.id WHERE {cond}", sparams).fetchall()}
        conn2.close()
        targets = [c for c in pool if c["id"] in scope_ids]
        if ctype:
            targets = [c for c in targets if c["type"] == ctype]

    if not targets:
        return jsonify({"questions": [], "available": 0})

    random.shuffle(targets)
    chosen = targets[:n]

    # 보기(distractor) 풀
    meanings = list({c["back_meaning"] for c in pool})
    fronts = list({c["front"] for c in pool})
    readings = list({c["back_reading"] for c in pool if c["type"] == "word"})

    def sample_distractors(source, answer, k=3):
        cand = [x for x in source if x != answer]
        random.shuffle(cand)
        return cand[:k]

    questions = []
    for c in chosen:
        directions = ["front2meaning", "meaning2front"]
        if c["type"] == "word" and c["back_reading"]:
            directions.append("front2reading")
        direction = random.choice(directions)

        if direction == "front2meaning":
            prompt, answer, source = c["front"], c["back_meaning"], meanings
        elif direction == "meaning2front":
            prompt, answer, source = c["back_meaning"], c["front"], fronts
        else:
            prompt, answer, source = c["front"], c["back_reading"], readings

        distractors = sample_distractors(source, answer, 3)
        if len(distractors) < 3:
            continue  # 보기 부족하면 건너뜀
        options = distractors + [answer]
        random.shuffle(options)

        questions.append({
            "card_id": c["id"],
            "type": c["type"],
            "level": c["jlpt_level"],
            "direction": direction,
            "prompt": prompt,
            "answer": answer,
            "options": options,
            # 정답 공개 후 보여줄 전체 정보 (한자/단어 · 읽기 · 뜻)
            "info": {
                "front": c["front"],
                "reading": c["back_reading"],
                "meaning": c["back_meaning"],
            },
        })

    return jsonify({"questions": questions, "available": len(targets)})


# ══════════════════════════════════════════════════════════
#  API: 가사 분석
# ══════════════════════════════════════════════════════════

@app.route("/api/lyrics/analyze", methods=["POST"])
def analyze_lyrics():
    """가사 텍스트에서 한자 추출 및 DB 매핑"""
    data = request.get_json()
    text = data.get("text", "")

    # 한자 범위: CJK Unified Ideographs
    kanji_chars = list(dict.fromkeys(
        ch for ch in text if '\u4e00' <= ch <= '\u9faf'
    ))

    conn = get_db()
    results = []
    for ch in kanji_chars:
        row = conn.execute("""
            SELECT c.*, r.repetitions, r.interval
            FROM cards c JOIN reviews r ON r.card_id = c.id
            WHERE c.type = 'kanji' AND c.front = ?
        """, (ch,)).fetchone()
        if row:
            d = dict(row)
            if d.get("extra_info"):
                d["extra_info"] = json.loads(d["extra_info"])
            d["state"] = get_card_state(d["repetitions"], d["interval"])
            results.append(d)

    conn.close()
    return jsonify({
        "found": len(results),
        "not_in_db": len(kanji_chars) - len(results),
        "kanji": results,
    })


# ══════════════════════════════════════════════════════════
#  API: 설정
# ══════════════════════════════════════════════════════════

@app.route("/api/kanken")
def get_kanken():
    """한자 漢検 급수 목록 (쉬운 순)."""
    order = ["10급", "9급", "8급", "7급", "6급", "5급", "4급", "3급", "준2급", "2급"]
    conn = get_db()
    rows = conn.execute("SELECT DISTINCT sub_level FROM cards WHERE type='kanji' AND sub_level IS NOT NULL").fetchall()
    conn.close()
    grades = [r["sub_level"] for r in rows]
    grades.sort(key=lambda x: order.index(x) if x in order else 99)
    return jsonify({"grades": grades})


@app.route("/api/categories")
def get_categories():
    """데이터에 존재하는 카테고리 목록 (설정 칩 동적 생성용)."""
    conn = get_db()
    rows = conn.execute("SELECT DISTINCT category FROM cards ORDER BY category").fetchall()
    conn.close()
    # 보기 좋은 순서로 정렬 (한자·품사·문법)
    order = ["한자", "명사", "동사", "형용사", "부사", "기타", "문법"]
    cats = [r["category"] for r in rows]
    cats.sort(key=lambda x: order.index(x) if x in order else 99)
    return jsonify({"categories": cats})


# ══════════════════════════════════════════════════════════
#  API: AI (Gemini) — 설명·예문
# ══════════════════════════════════════════════════════════

def _gemini_generate(prompt, api_key, model):
    """Gemini REST API 호출 (표준 라이브러리만 사용)."""
    import urllib.request
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{model}:generateContent?key={api_key}")
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _gemini_stream(prompt, api_key, model):
    """Gemini 스트리밍 호출 — 생성되는 텍스트 조각을 순서대로 yield."""
    import urllib.request
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{model}:streamGenerateContent?alt=sse&key={api_key}")
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=60)
    for raw in resp:
        line = raw.decode("utf-8", "ignore").strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if not payload:
            continue
        try:
            d = json.loads(payload)
            t = d["candidates"][0]["content"]["parts"][0]["text"]
            if t:
                yield t
        except Exception:
            continue


_NO_MD = "\n\n마크다운 기호(*, #, -, ` 등) 쓰지 말고 일반 문장과 줄바꿈으로만 써줘. 너무 길지 않게."

def _gemini_json(prompt, api_key, model):
    """Gemini 호출 — JSON 응답 강제(responseMimeType)하여 파싱된 객체 반환."""
    import urllib.request
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{model}:generateContent?key={api_key}")
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def _build_explain_prompt(c):
    t = c["type"]
    if t == "kanji":
        body = (f"일본어 한자 '{c['front']}' (뜻: {c['back_meaning']}, 읽기: {c['back_reading']})를 "
                f"한국인 일본어 학습자에게 설명해줘.\n"
                f"1) 핵심 의미와 뉘앙스\n2) 외우기 쉬운 연상법(스토리)\n"
                f"3) 자주 쓰는 단어/예문 2개 (일본어 + 후리가나 + 한국어 뜻)")
    elif t == "grammar":
        body = (f"일본어 문법 '{c['front']}' (뜻: {c['back_meaning']})를 한국인 학습자에게 설명해줘.\n"
                f"1) 의미와 쓰임\n2) 접속(연결) 형태\n3) 예문 2개 (일본어 + 후리가나 + 한국어 뜻)\n"
                f"4) 비슷한 표현과의 차이(있으면)")
    else:
        body = (f"일본어 단어 '{c['front']}' (읽기: {c['back_reading']}, 뜻: {c['back_meaning']})를 "
                f"한국인 학습자에게 설명해줘.\n1) 뉘앙스와 쓰임\n2) 외우기 쉬운 연상법\n"
                f"3) 예문 2개 (일본어 + 후리가나 + 한국어 뜻)")
    return body + _NO_MD


def _sse(obj):
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


@app.route("/api/ai/explain", methods=["POST"])
def ai_explain():
    """실시간 AI 설명 (SSE 스트리밍). 캐시에 있으면 즉시, 없으면 생성하며 흘려보냄."""
    body_in = request.get_json() or {}
    card_id = body_in.get("card_id")
    force = body_in.get("force")
    conn = get_db()
    row = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "카드를 찾을 수 없어요."}), 404
    row = dict(row)
    card_key = f"{row['type']}:{row['front']}"

    cached_row = None
    if not force:
        cached_row = conn.execute("SELECT content FROM ai_cache WHERE card_key = ?", (card_key,)).fetchone()
    api_key = get_setting("gemini_api_key", "")
    model = get_setting("gemini_model", "gemini-3.5-flash")
    cached_text = cached_row["content"] if cached_row else None
    conn.close()

    @stream_with_context
    def generate():
        if cached_text:
            yield _sse({"t": cached_text, "cached": True})
            yield _sse({"done": True})
            return
        if not api_key:
            yield _sse({"error": "Gemini API 키가 없어요. 설정 → AI에서 키를 입력해 주세요."})
            return
        acc = []
        try:
            for chunk in _gemini_stream(_build_explain_prompt(row), api_key, model):
                acc.append(chunk)
                yield _sse({"t": chunk})
        except Exception as e:
            import urllib.error
            msg = (f"Gemini 오류 {e.code}: {e.read().decode('utf-8','ignore')[:200]}"
                   if isinstance(e, urllib.error.HTTPError) else f"AI 호출 실패: {e}")
            yield _sse({"error": msg})
            return
        text = "".join(acc)
        if text.strip():
            c2 = get_db()
            c2.execute("INSERT OR REPLACE INTO ai_cache (card_key, content, created_at) VALUES (?, ?, ?)",
                       (card_key, text, date.today().isoformat()))
            c2.commit()
            c2.close()
        yield _sse({"done": True})

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/api/ai/lyrics", methods=["POST"])
def ai_lyrics():
    """일본어 가사를 AI로 분석 (SSE 스트리밍) — 주요 단어·문법·해석."""
    text = ((request.get_json() or {}).get("text") or "").strip()[:3000]
    if not text:
        return jsonify({"error": "가사를 입력해 주세요."}), 400
    api_key = get_setting("gemini_api_key", "")
    if not api_key:
        return jsonify({"error": "Gemini API 키가 없어요. 설정 → AI에서 키를 입력해 주세요."}), 400
    model = get_setting("gemini_model", "gemini-3.5-flash")
    prompt = (
        "다음 일본어 노래 가사를 한국인 일본어 학습자에게 분석해줘.\n"
        "1) 주요 단어/한자: 단어(후리가나) - 뜻  형식으로 목록\n"
        "2) 핵심 문법 표현 2~3개와 간단 설명\n"
        "3) 전체 한국어 해석\n"
        "마크다운 기호 없이 보기 좋게 줄바꿈으로 정리해줘.\n\n가사:\n" + text
    )

    @stream_with_context
    def generate():
        try:
            for chunk in _gemini_stream(prompt, api_key, model):
                yield _sse({"t": chunk})
        except Exception as e:
            import urllib.error
            msg = (f"Gemini 오류 {e.code}: {e.read().decode('utf-8','ignore')[:200]}"
                   if isinstance(e, urllib.error.HTTPError) else f"AI 호출 실패: {e}")
            yield _sse({"error": msg})
            return
        yield _sse({"done": True})

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _generate_sentences_raw(api_key, model, n=6):
    """Gemini로 문장 연습 문제 n개 생성 (학습 범위 단어 활용). 깨끗한 리스트 반환."""
    levels = [l.strip() for l in get_setting("active_levels", "N5,N4").split(",") if l.strip()] or ["N5"]
    order = {"N5": 5, "N4": 4, "N3": 3, "N2": 2, "N1": 1}
    easiest = min(levels, key=lambda x: order.get(x, 5))
    cond, params = _level_scope()
    conn = get_db()
    rows = conn.execute(f"""
        SELECT c.front, c.back_meaning FROM cards c JOIN reviews r ON r.card_id = c.id
        WHERE c.type = 'word' AND {cond}
        ORDER BY (r.repetitions > 0) DESC, RANDOM() LIMIT 8
    """, params).fetchall()
    conn.close()
    words = [f"{r['front']}({r['back_meaning']})" for r in rows]
    words_str = ", ".join(words) if words else "기본 N5 단어"
    prompt = (
        f"너는 일본어 교사야. JLPT {easiest} 수준의 한국인 학습자를 위해 짧고 자연스러운 "
        f"일본어 예문 {n}개를 만들어줘. 가능하면 다음 단어들을 활용해: {words_str}.\n"
        f"각 문장을 다음 형식의 JSON 객체로 만들어줘:\n"
        f'{{"jp": "일본어 문장", "jp_tiles": ["일본어를","의미","단위로","끊은","배열"], '
        f'"kr": "한국어 번역", "kr_tiles": ["한국어를","어절","단위로","끊은","배열"]}}\n'
        f"jp_tiles는 일본어 문장을 어절/단어 단위로 끊어 순서대로 담은 배열, "
        f"kr_tiles는 한국어 번역을 어절 단위로 끊은 배열이야. "
        f"조사도 적절히 붙여서 4~8조각 정도로 끊어줘.\n전체를 JSON 배열로만 출력해."
    )
    data = _gemini_json(prompt, api_key, model)
    items = data if isinstance(data, list) else data.get("sentences", [])
    return [s for s in items
            if s.get("jp") and s.get("kr") and s.get("jp_tiles") and s.get("kr_tiles")]


def _store_sentences(items):
    conn = get_db()
    for s in items:
        conn.execute(
            "INSERT INTO sentence_cache (jp, jp_tiles, kr, kr_tiles, created_at) VALUES (?, ?, ?, ?, ?)",
            (s["jp"], json.dumps(s["jp_tiles"], ensure_ascii=False),
             s["kr"], json.dumps(s["kr_tiles"], ensure_ascii=False), date.today().isoformat()))
    conn.commit()
    conn.close()


def _pregen_sentences_job():
    """백그라운드로 문장 캐시를 채운다 (풀이 넉넉하면 생략)."""
    api_key = get_setting("gemini_api_key", "")
    if not api_key:
        return
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM sentence_cache").fetchone()[0]
    conn.close()
    if total >= 40:
        return
    model = get_setting("gemini_model", "gemini-3.5-flash")
    try:
        _store_sentences(_generate_sentences_raw(api_key, model, 6))
    except Exception:
        pass


@app.route("/api/ai/sentences", methods=["POST"])
def ai_sentences():
    """문장 연습 — 캐시에서 즉시 제공, 부족하면 동기 생성. 캐시는 백그라운드로 보충."""
    conn = get_db()
    rows = conn.execute(
        "SELECT jp, jp_tiles, kr, kr_tiles FROM sentence_cache ORDER BY RANDOM() LIMIT 5").fetchall()
    total = conn.execute("SELECT COUNT(*) FROM sentence_cache").fetchone()[0]
    conn.close()

    def to_item(r):
        return {"jp": r["jp"], "jp_tiles": json.loads(r["jp_tiles"]),
                "kr": r["kr"], "kr_tiles": json.loads(r["kr_tiles"])}

    if len(rows) >= 5:
        if total < 20:
            threading.Thread(target=_pregen_sentences_job, daemon=True).start()  # 비동기 보충
        return jsonify({"sentences": [to_item(r) for r in rows]})

    # 캐시 부족 → 동기 생성
    api_key = get_setting("gemini_api_key", "")
    if not api_key:
        return jsonify({"error": "Gemini API 키가 없어요. 설정 → AI에서 키를 입력해 주세요."}), 400
    model = get_setting("gemini_model", "gemini-3.5-flash")
    try:
        items = _generate_sentences_raw(api_key, model, 6)
        if not items:
            return jsonify({"error": "문장 생성 결과가 비어 있어요. 다시 시도해 주세요."}), 502
        _store_sentences(items)
        return jsonify({"sentences": items[:5]})
    except Exception as e:
        import urllib.error
        if isinstance(e, urllib.error.HTTPError):
            return jsonify({"error": f"Gemini 오류 {e.code}: {e.read().decode('utf-8','ignore')[:200]}"}), 502
        return jsonify({"error": f"문장 생성 실패: {e}"}), 502


@app.route("/api/ai/pregenerate", methods=["POST"])
def ai_pregenerate():
    """학습 종료 등 시점에 문장 캐시를 백그라운드로 채우도록 트리거 (즉시 반환)."""
    threading.Thread(target=_pregen_sentences_job, daemon=True).start()
    return jsonify({"ok": True})


@app.route("/api/writing_cards")
def writing_cards():
    """쓰기 연습용 한자 카드 (학습 범위, SRS 순서: 복습예정 우선 → 신규)."""
    today = date.today().isoformat()
    daily = int(get_setting("daily_new_cards", "10"))
    cond, params = _level_scope()
    conn = get_db()
    rows = conn.execute(f"""
        SELECT c.*, r.ease_factor, r.interval, r.repetitions, r.next_review,
               r.total_reviews, r.correct_count
        FROM cards c JOIN reviews r ON r.card_id = c.id
        WHERE c.type = 'kanji' AND {cond}
        ORDER BY (r.next_review <= ? AND r.repetitions > 0) DESC,
                 (r.repetitions = 0) DESC, r.next_review ASC, RANDOM()
        LIMIT ?
    """, params + [today, max(daily, 10)]).fetchall()
    conn.close()

    def to_dict(row):
        d = dict(row)
        if d.get("extra_info"):
            try: d["extra_info"] = json.loads(d["extra_info"])
            except: pass
        d["state"] = get_card_state(d["repetitions"], d["interval"])
        return d
    return jsonify({"cards": [to_dict(r) for r in rows]})


# 점수(0~100) → SRS 평가 버튼 매핑
def _score_to_rating(score):
    if score < 40:  return "again"
    if score < 66:  return "hard"
    if score < 86:  return "good"
    return "easy"


@app.route("/api/ai/score_writing", methods=["POST"])
def ai_score_writing():
    """그린 한자 이미지를 Gemini 비전으로 채점 → 점수·판정 반환."""
    data = request.get_json() or {}
    card_id = data.get("card_id")
    image = data.get("image", "")
    if "," in image:
        image = image.split(",", 1)[1]   # data:image/png;base64, 제거
    if not image:
        return jsonify({"error": "이미지가 없어요."}), 400

    conn = get_db()
    row = conn.execute("SELECT front, back_meaning FROM cards WHERE id = ?", (card_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "카드를 찾을 수 없어요."}), 404
    target, meaning = row["front"], row["back_meaning"]

    api_key = get_setting("gemini_api_key", "")
    if not api_key:
        return jsonify({"error": "Gemini API 키가 없어요. 설정 → AI에서 키를 입력해 주세요."}), 400
    model = get_setting("gemini_model", "gemini-3.5-flash")

    prompt = (
        f"이미지는 학습자가 손으로 쓴 일본어 한자야. 목표 한자는 '{target}'({meaning})야. "
        f"목표 한자를 올바른 모양으로 썼는지 평가해줘. JSON으로만 답해: "
        '{"recognized":"인식한자","correct":true/false,"score":0~100,"feedback":"한국어 한줄 피드백"}. '
        "score는 목표 한자와의 일치도/완성도(0~100). 다른 한자거나 알아볼 수 없으면 낮게."
    )
    import urllib.request
    payload = {
        "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/png", "data": image}}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=40) as resp:
            res = json.loads(resp.read().decode("utf-8"))
        out = json.loads(res["candidates"][0]["content"]["parts"][0]["text"])
    except Exception as e:
        import urllib.error
        if isinstance(e, urllib.error.HTTPError):
            return jsonify({"error": f"Gemini 오류 {e.code}: {e.read().decode('utf-8','ignore')[:200]}"}), 502
        return jsonify({"error": f"채점 실패: {e}"}), 502

    score = int(out.get("score", 0))
    score = max(0, min(100, score))
    return jsonify({
        "score": score,
        "correct": bool(out.get("correct")),
        "recognized": out.get("recognized", ""),
        "feedback": out.get("feedback", ""),
        "rating": _score_to_rating(score),
    })


@app.route("/api/ai/session_summary", methods=["POST"])
def ai_session_summary():
    """학습 세션 종료 시 — AI 요약/조언을 만들고 session_log에 저장 (백데이터)."""
    data = request.get_json() or {}
    studied = int(data.get("studied", 0))
    correct = int(data.get("correct", 0))
    hard = data.get("hard_fronts", [])[:15]   # 어려웠던(몰랐음/힘들었어) 카드들
    accuracy = round(correct / max(studied, 1) * 100, 1)

    summary = ""
    api_key = get_setting("gemini_api_key", "")
    if api_key and studied > 0:
        model = get_setting("gemini_model", "gemini-3.5-flash")
        hard_str = ", ".join(hard) if hard else "없음"
        prompt = (f"나는 일본어를 공부하는 한국인이야. 방금 학습 세션을 끝냈어.\n"
                  f"- 학습한 카드 수: {studied}개\n- 정답 수: {correct}개 (정답률 {accuracy}%)\n"
                  f"- 어려워한 항목: {hard_str}\n"
                  f"이 결과를 보고 따뜻하게 격려하고, 어려워한 항목 위주로 내일 어떻게 복습하면 좋을지 "
                  f"구체적인 팁을 2~3문장으로 한국어로 짧게 말해줘. 마크다운 기호 없이.")
        try:
            summary = _gemini_generate(prompt, api_key, model)
        except Exception as e:
            summary = ""   # 요약 실패해도 세션 기록은 저장

    conn = get_db()
    conn.execute("INSERT INTO session_log (ended_at, studied, correct, accuracy, summary) VALUES (?, ?, ?, ?, ?)",
                 (date.today().isoformat(), studied, correct, accuracy, summary))
    conn.commit()
    conn.close()
    return jsonify({"summary": summary, "accuracy": accuracy})


@app.route("/api/settings", methods=["GET"])
def get_settings():
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return jsonify({r["key"]: r["value"] for r in rows})


@app.route("/api/settings", methods=["POST"])
def update_settings():
    data = request.get_json()
    for key, value in data.items():
        set_setting(key, str(value))
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════
#  실행
# ══════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 50)
    print("  Kanji Flow 2.0 서버 시작 중...")
    print("=" * 50)
    init_db()
    print("[서버] http://0.0.0.0:8005 에서 실행 중")
    app.run(host="0.0.0.0", port=8005, debug=False)
