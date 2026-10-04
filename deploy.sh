#!/usr/bin/env bash
# 맥북 서버에서 최신 코드를 받아 Kanji Flow 서버를 재시작한다.
# 최초 1회:  git clone <repo>  후  cd japanese && bash deploy.sh
# 이후:      bash deploy.sh   (자동으로 git pull + 서버 재시작)
set -e
cd "$(dirname "$0")"

BRANCH="${BRANCH:-claude/gallant-albattani-XvrfY}"

echo "[deploy] 최신 코드 받는 중 (브랜치: $BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git pull origin "$BRANCH"

echo "[deploy] 서버 재시작"
bash kanji-flow-v2/serve.sh --bg

echo ""
echo "[deploy] 완료!"
echo "  내부망 접속:  http://192.168.10.35:8005"
echo "  외부망 접속:  http://211.109.91.64:8005"
