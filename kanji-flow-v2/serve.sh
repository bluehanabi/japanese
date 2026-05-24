#!/usr/bin/env bash
# Kanji Flow 2.0 — 맥북(또는 서버)에서 실행하는 스크립트
# 사용법:  bash serve.sh          (포그라운드 실행)
#          bash serve.sh --bg     (백그라운드 실행, nohup)
set -e
cd "$(dirname "$0")"

PORT=8005

# python3 찾기 — macOS 비대화식 SSH 세션은 Homebrew 경로가 PATH에 없을 수 있음
PYTHON="${PYTHON:-}"
if [ -z "$PYTHON" ]; then
  for cand in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if command -v "$cand" >/dev/null 2>&1; then PYTHON="$cand"; break; fi
  done
fi
if [ -z "$PYTHON" ]; then
  echo "[serve] python3 를 찾을 수 없습니다. 맥에 파이썬을 설치하세요 (예: brew install python)"
  exit 1
fi
echo "[serve] 사용할 파이썬: $PYTHON"

# 가상환경 준비 (최초 1회만 설치)
if [ ! -d .venv ]; then
  echo "[serve] 가상환경 생성 중..."
  "$PYTHON" -m venv .venv
  ./.venv/bin/pip install -q --upgrade pip
  ./.venv/bin/pip install -q -r requirements.txt
fi

# 기존에 8005 포트를 쓰는 프로세스 정리 (macOS/Linux 공통)
if lsof -ti tcp:$PORT >/dev/null 2>&1; then
  echo "[serve] 포트 $PORT 사용 중인 기존 프로세스 종료..."
  lsof -ti tcp:$PORT | xargs kill 2>/dev/null || true
  sleep 1
fi

if [ "$1" = "--bg" ]; then
  echo "[serve] 백그라운드로 시작 (로그: server.log)"
  nohup ./.venv/bin/python server.py > server.log 2>&1 &
  sleep 2
  echo "[serve] 실행됨. http://0.0.0.0:$PORT"
  tail -n 5 server.log || true
else
  echo "[serve] 포그라운드로 시작. 중지하려면 Ctrl+C"
  exec ./.venv/bin/python server.py
fi
