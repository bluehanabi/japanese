"""
SM-2 기반 간격 반복 알고리즘 (Anki 스타일로 4단계 버튼에 맞춰 조정)

버튼 → 동작 요약
  again (몰랐음)   : 처음부터 다시 (내일). EF 크게 감소
  hard  (힘들었어) : 살짝만 연장. EF 약간 감소  (※ 더 이상 처음으로 초기화하지 않음)
  good  (맞았어)   : 표준 연장 (1일 → 6일 → interval×EF)
  easy  (완벽)     : 크게 연장 (4일 → 6일×EF → interval×EF×1.3). EF 증가
"""
from datetime import date, timedelta

# UI 버튼 → quality 매핑
QUALITY_MAP = {
    "again": 0,
    "hard":  2,
    "good":  4,
    "easy":  5,
}

EASY_FIRST_INTERVAL = 4   # 신규 카드를 'easy'로 맞췄을 때 첫 간격(일)


def calculate_next_review(repetitions: int, ease_factor: float, interval: int, quality: int):
    """다음 복습 간격/EF/반복수/날짜 계산.

    Returns: (new_interval, new_ease_factor, new_repetitions, next_review_date)
    """
    ef = ease_factor or 2.5
    interval = interval or 0

    if quality <= 0:
        # again — 실패(lapse). 처음부터.
        new_interval = 1
        new_repetitions = 0
        ef -= 0.20
    elif quality == 2:
        # hard — 기억은 했으나 어려움. 초기화하지 않고 소폭 연장.
        if repetitions == 0:
            new_interval = 1
        else:
            new_interval = max(interval + 1, round(interval * 1.2))
        new_repetitions = repetitions + 1
        ef -= 0.15
    elif quality >= 5:
        # easy — 완벽. 크게 연장.
        if repetitions == 0:
            new_interval = EASY_FIRST_INTERVAL
        elif repetitions == 1:
            new_interval = round(6 * ef)
        else:
            new_interval = round(interval * ef * 1.3)
        new_repetitions = repetitions + 1
        ef += 0.15
    else:
        # good — 표준.
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ef)
        new_repetitions = repetitions + 1

    ef = max(1.3, ef)
    new_interval = max(1, new_interval)
    next_review = date.today() + timedelta(days=new_interval)
    return new_interval, round(ef, 4), new_repetitions, next_review.isoformat()


def predict_interval(repetitions: int, ease_factor: float, interval: int, answer: str) -> int:
    """버튼별 예상 간격(일)을 프론트 힌트와 동일하게 미리 계산."""
    q = QUALITY_MAP.get(answer, 0)
    days, _, _, _ = calculate_next_review(repetitions, ease_factor, interval, q)
    return days


def get_card_state(repetitions: int, interval: int) -> str:
    """카드의 현재 학습 상태."""
    if repetitions == 0 and interval == 0:
        return "new"
    elif interval < 21:
        return "learning"
    else:
        return "mastered"
