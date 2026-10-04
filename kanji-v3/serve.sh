#!/usr/bin/env bash
# 한자 v3 — 정적 파일 서버 (맥북에서 실행). 포트 8005.
# 사용법:  bash serve.sh          (포그라운드)
#          bash serve.sh --bg     (백그라운드, nohup)
set -e
cd "$(dirname "$0")/web"
PORT=8005

PYTHON="${PYTHON:-}"
if [ -z "$PYTHON" ]; then
  for cand in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if command -v "$cand" >/dev/null 2>&1; then PYTHON="$cand"; break; fi
  done
fi
[ -z "$PYTHON" ] && { echo "[serve] python3 를 찾을 수 없습니다"; exit 1; }

if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  lsof -ti tcp:$PORT | xargs kill 2>/dev/null || true
  sleep 1
fi

if [ "$1" = "--bg" ]; then
  nohup "$PYTHON" -m http.server $PORT --bind 0.0.0.0 > ../server.log 2>&1 &
  sleep 2
  echo "[serve] 실행됨: http://0.0.0.0:$PORT"
  tail -n 3 ../server.log || true
else
  exec "$PYTHON" -m http.server $PORT --bind 0.0.0.0
fi
