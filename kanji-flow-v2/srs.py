"""
SM-2 간격 반복 알고리즘 구현
Anki에서 사용하는 알고리즘과 동일한 방식
"""
from datetime import date, timedelta


def calculate_next_review(repetitions: int, ease_factor: float, interval: int, quality: int):
    """
    SM-2 알고리즘으로 다음 복습 날짜를 계산합니다.

    quality 등급 (사용자가 선택):
        5 = 완벽하게 정답 (즉시/전혀 고민 안 함)
        4 = 정답 (조금 고민)
        3 = 정답 (힘들게 기억)
        2 = 오답이었지만 정답 보고 기억남
        1 = 오답 (어렴풋이 기억)
        0 = 완전히 모름

    Returns:
        (new_interval, new_ease_factor, new_repetitions, next_review_date)
    """
    if quality >= 3:
        # 정답권: 간격 늘리기
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)
        new_repetitions = repetitions + 1
    else:
        # 오답: 처음부터 다시
        new_interval = 1
        new_repetitions = 0

    # Ease Factor 조정 (어려울수록 EF 감소, 쉬울수록 증가)
    new_ef = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ef = max(1.3, new_ef)  # 최솟값 1.3 (너무 쉬워지지 않도록)

    next_review = date.today() + timedelta(days=new_interval)

    return new_interval, round(new_ef, 4), new_repetitions, next_review.isoformat()


# UI 버튼 → quality 매핑
# 4가지 버튼으로 단순화 (0, 1, 3, 5)
QUALITY_MAP = {
    "again": 0,   # 🔴 완전 몰랐음 → 내일 다시
    "hard": 1,    # 🟠 힘들게 기억 → 내일 다시 (EF 감소)
    "good": 3,    # 🟢 맞았어 → 간격 연장
    "easy": 5,    # 💙 완벽히 알아 → 최대 간격
}


def get_card_state(repetitions: int, interval: int) -> str:
    """카드의 현재 학습 상태를 반환"""
    if repetitions == 0 and interval == 0:
        return "new"          # 🆕 신규 (아직 한 번도 안 봄)
    elif interval < 21:
        return "learning"     # 📖 학습 중
    else:
        return "mastered"     # ✅ 마스터
