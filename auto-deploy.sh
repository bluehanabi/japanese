#!/usr/bin/env bash
# GitHub에서 최신 코드를 주기적으로 확인해, 변경이 있으면 받아서
# launchd가 관리하는 Kanji Flow 서버를 갱신(재시작)한다. (launchd가 1분 간격으로 호출)
# 서버의 "살아있음" 자체는 com.kanjiflow.server 의 KeepAlive가 책임진다.
set -e
cd "$(dirname "$0")"

BRANCH="${BRANCH:-claude/gallant-albattani-XvrfY}"
SERVER_LABEL="com.kanjiflow.server"

# 최신 원격 상태 확인 (네트워크 오류 시 조용히 종료 — 다음 주기에 재시도)
git fetch origin "$BRANCH" --quiet 2>/dev/null || { echo "[$(date)] git fetch 실패, 다음 주기에 재시도"; exit 0; }

LOCAL="$(git rev-parse HEAD 2>/dev/null || echo none)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

# 새 커밋이 있으면 원격 상태에 맞추고 서버를 재시작한다 (배포 전용 체크아웃이라 로컬 수정 없음)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "[$(date)] 새 버전 감지: ${LOCAL:0:7} -> ${REMOTE:0:7}"
  git checkout "$BRANCH" --quiet 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH" --quiet
  git reset --hard "origin/$BRANCH" --quiet
  # 관리 중인 서버를 재시작 → KeepAlive가 새 코드로 즉시 되살린다.
  # (kickstart 실패 = 아직 미설치 → 플리스트를 올려서 시작)
  launchctl kickstart -k "gui/$(id -u)/$SERVER_LABEL" 2>/dev/null \
    || launchctl load "$HOME/Library/LaunchAgents/$SERVER_LABEL.plist" 2>/dev/null \
    || true
  echo "[$(date)] 서버 갱신 요청 완료"
fi
