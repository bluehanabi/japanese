#!/usr/bin/env bash
# GitHub에서 최신 코드를 주기적으로 확인해, 변경이 있으면 자동으로
# 내려받아 Kanji Flow 서버를 재시작한다. (launchd가 일정 간격으로 호출)
set -e
cd "$(dirname "$0")"

BRANCH="${BRANCH:-claude/gallant-albattani-XvrfY}"
PORT=8005

# 최신 원격 상태 확인 (네트워크 오류 시 조용히 종료 — 다음 주기에 재시도)
git fetch origin "$BRANCH" --quiet 2>/dev/null || { echo "[$(date)] git fetch 실패, 다음 주기에 재시도"; exit 0; }

LOCAL="$(git rev-parse HEAD 2>/dev/null || echo none)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

need_restart=0

# 새 커밋이 있으면 강제로 원격 상태에 맞춘다 (배포 전용 체크아웃이라 로컬 수정 없음)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date)] 새 버전 감지: ${LOCAL:0:7} -> ${REMOTE:0:7}"
  git checkout "$BRANCH" --quiet 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH" --quiet
  git reset --hard "origin/$BRANCH" --quiet
  need_restart=1
fi

# 서버가 떠 있지 않으면 되살린다
if ! lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "[$(date)] 서버 미동작 감지"
  need_restart=1
fi

if [ "$need_restart" = "1" ]; then
  echo "[$(date)] 서버 재시작"
  bash kanji-flow-v2/serve.sh --bg
fi
