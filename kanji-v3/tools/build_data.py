"""
상용한자 2136자 데이터 생성 스크립트.

원본: jamdict-data (KANJIDIC2 + JMdict 를 SQLite 로 묶은 패키지)
    pip download jamdict-data --no-deps && tar xzf jamdict_data-*.tar.gz
    xz -dk jamdict_data-*/jamdict_data/jamdict.db.xz
사용: python3 build_data.py <jamdict.db> <출력 json>

핵심 아이디어: 한자별 읽기를 '실제 자주 쓰이는 단어에서 얼마나 나오는가'로 등급화한다.
    tier 0 = 핵심 (먼저 외움) / 1 = 보조 (단어에서 만나면 외움) / 2 = 희귀 (안 외워도 됨)
"""
import json
import re
import sqlite3
import sys
from collections import defaultdict

DB, OUT = sys.argv[1], sys.argv[2]
c = sqlite3.connect(DB)

KATA = {chr(k): chr(k - 0x60) for k in range(0x30A1, 0x30F7)}
RENDAKU = {}
for a, b in zip("かきくけこさしすせそたちつてとはひふへほ", "がぎぐげござじずぜぞだぢづでどばびぶべぼ"):
    RENDAKU[a] = b
for a, b in zip("はひふへほ", "ぱぴぷぺぽ"):
    RENDAKU[a + "p"] = b
HIRA_RE = re.compile(r"^[ぁ-ゟー]+$")
KANJI_RE = re.compile(r"[一-鿿々]")


def hira(s):
    return "".join(KATA.get(ch, ch) for ch in s)


# ── 1. 상용한자 2136자 (grade 1~6 교육한자, 8 = 중학 상용) ─────────────
chars = {}
for cid, lit, sc, grade, freq in c.execute(
        "select ID, literal, stroke_count, grade, freq from character where grade in (1,2,3,4,5,6,8)"):
    chars[lit] = dict(id=cid, c=lit, sc=int(sc), g=int(grade), f=int(freq) if freq else None)
print("상용한자:", len(chars))

for lit, d in chars.items():
    ko, mean, on, kun = [], [], [], []
    for rt, val in c.execute(
            "select r.r_type, r.value from reading r join rm_group g on r.gid=g.ID where g.cid=?", (d["id"],)):
        if rt == "korean_h":
            ko.append(val)
        elif rt == "ja_on":
            on.append(hira(val))
        elif rt == "ja_kun":
            kun.append(val)
    for (v,) in c.execute(
            "select m.value from meaning m join rm_group g on m.gid=g.ID where g.cid=? and m.m_lang=''", (d["id"],)):
        mean.append(v)
    d.update(ko=ko, m=mean[:3], on_all=on, kun_all=kun)

# KANJIDIC2 에 한국음이 비어 있는 글자
KO_FIX = {'収': '수', '塡': '전', '頰': '협', '枠': '테'}
for lit, v in KO_FIX.items():
    if lit in chars and not chars[lit]['ko']:
        chars[lit]['ko'] = [v]

# ── 2. 단어 (JMdict): 한자 표기가 전부 상용한자이고 자주 쓰이는 것만 ─────
kana_first = {}
for idseq, text in c.execute("select idseq, text from Kana order by ID"):
    kana_first.setdefault(idseq, text)
sense_first = {}
for sid, idseq in c.execute("select ID, idseq from Sense order by ID"):
    sense_first.setdefault(idseq, sid)
glosses = defaultdict(list)
first_sids = set(sense_first.values())
for sid, text in c.execute("select sid, text from SenseGloss where lang='eng'"):
    if sid in first_sids:
        glosses[sid].append(text)
pri = defaultdict(list)
for kid, text in c.execute("select kid, text from KJP"):
    pri[kid].append(text)


def priority(tags):
    """작을수록 자주 쓰임."""
    best = None
    for t in tags:
        m = re.match(r"nf(\d+)", t)
        if m:
            v = int(m.group(1))
        elif t in ("news1", "ichi1", "spec1", "gai1"):
            v = 30
        else:
            continue
        best = v if best is None else min(best, v)
    return best


words_by_kanji = defaultdict(list)
for kid, idseq, text in c.execute("select ID, idseq, text from Kanji"):
    p = priority(pri.get(kid, []))
    if p is None or not KANJI_RE.search(text):
        continue
    if any(KANJI_RE.match(ch) and ch not in chars for ch in text):
        continue
    rd = kana_first.get(idseq)
    gl = glosses.get(sense_first.get(idseq), [])
    if not rd or not gl or not HIRA_RE.match(hira(rd)):
        continue
    if not re.match(r"^[\u4e00-\u9fff々ぁ-ゟァ-ヺー]+$", text):  # 숫자·기호 섞인 표기 제외
        continue
    gtxt = ", ".join(re.sub(r"\s*\([^)]*\)", "", g).strip() for g in gl[:2])
    w = dict(w=text, r=hira(rd), m=gtxt, p=p, wt=1.0 / (p + 10) / (1 + 0.3 * max(0, len(text) - 3)))
    for ch in set(text):
        if ch in chars:
            words_by_kanji[ch].append(w)


# ── 3. 읽기 매칭 ─────────────────────────────────────────
def on_variants(r):
    v = {r}
    if r[0] in RENDAKU:
        v.add(RENDAKU[r[0]] + r[1:])
    if r[0] in "はひふへほ":
        v.add({"は": "ぱ", "ひ": "ぴ", "ふ": "ぷ", "へ": "ぺ", "ほ": "ぽ"}[r[0]] + r[1:])
    if r[-1] in "つくちき" and len(r) >= 2:  # 促音化: 学校 がっこう
        v |= {x[:-1] + "っ" for x in list(v)}
    return v


def kun_stem(k):
    return k.replace("-", "").split(".")[0]


def match(word, ch, d):
    """단어가 한자 ch 의 어떤 읽기를 쓰는지 ('on'|'kun', 읽기) 반환."""
    n_kanji = sum(1 for x in word["w"] if x in chars)
    rd = word["r"]
    if n_kanji >= 2:  # 숙어: 음독 우선
        for r in d["on_all"]:
            if any(v in rd for v in on_variants(r)):
                return "on", r
    for k in d["kun_all"]:
        full = k.replace("-", "").replace(".", "")
        stem = kun_stem(k)
        if not stem:
            continue
        if n_kanji == 1 and (full in rd or (len(stem) >= 2 and stem in rd) or
                             (len(stem) == 1 and rd.startswith(stem) and word["w"][0] == ch)):
            return "kun", k
    if n_kanji == 1:
        for r in d["on_all"]:
            if any(v in rd for v in on_variants(r)):
                return "on", r
    for k in d["kun_all"]:
        stem = kun_stem(k)
        if len(stem) >= 2 and stem in rd:
            return "kun", k
    return None, None


out = []
for ch, d in chars.items():
    ws = words_by_kanji.get(ch, [])
    score = defaultdict(float)
    for w in ws:
        kind, r = match(w, ch, d)
        w["kind"], w["rd"] = kind, r
        if kind:
            score[(kind, r)] += w["wt"]

    tiers = {}
    for kind, pool in (("on", d["on_all"]), ("kun", d["kun_all"])):
        keys = [(kind, r) for r in pool]
        total = sum(score[k] for k in keys)
        ranked = sorted(keys, key=lambda k: -score[k])
        for i, k in enumerate(ranked):
            s = score[k]
            if s == 0:
                tiers[k] = 2
            elif i == 0 or s / total >= 0.25:
                tiers[k] = 0
            else:
                tiers[k] = 1
        # 단어가 하나도 없으면 사전 맨 앞 읽기를 핵심으로
        if ranked and total == 0:
            tiers[ranked[0]] = 0

    def readings(kind, pool):
        seen, res = set(), []
        for r in pool:
            disp = r.replace("-", "") if kind == "on" else r.replace("-", "")
            if kind == "kun":
                stem, _, ok = r.replace("-", "").partition(".")
                disp = stem + ("(" + ok + ")" if ok else "")
            if disp in seen:
                continue
            seen.add(disp)
            res.append([disp, tiers[(kind, r)], r])
        res.sort(key=lambda x: x[1])
        return res

    on_r, kun_r = readings("on", d["on_all"]), readings("kun", d["kun_all"])
    # 카드용 단어: 핵심 읽기를 하나씩 먼저 덮고, 나머지는 빈도순
    ws.sort(key=lambda w: -w["wt"])
    chosen, covered = [], set()
    for w in ws:
        k = (w["kind"], w["rd"])
        if w["kind"] and tiers.get(k) == 0 and k not in covered:
            chosen.append(w)
            covered.add(k)
    for w in ws:
        if len(chosen) >= 5:
            break
        if w not in chosen and w["kind"]:
            chosen.append(w)
    chosen = chosen[:5]
    word_out = []
    for w in chosen:
        disp = None
        if w["kind"] == "on":
            disp = w["rd"]
        elif w["kind"] == "kun":
            disp = kun_stem(w["rd"])
        word_out.append([w["w"], w["r"], w["m"], disp or ""])

    out.append(dict(
        c=ch, ko="·".join(dict.fromkeys(d["ko"])), m=d["m"], sc=d["sc"], g=d["g"], f=d["f"],
        on=[x[:2] for x in on_r], kun=[x[:2] for x in kun_r], w=word_out))

# 빈도순(신문 빈도 1~2501), 빈도 없는 글자는 학년순으로 뒤에
out.sort(key=lambda x: (x["f"] is None, x["f"] or 0, x["g"], x["c"]))
for i, x in enumerate(out):
    x["i"] = i
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("저장:", OUT, len(out), "자")
