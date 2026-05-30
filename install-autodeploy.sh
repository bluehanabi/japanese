#!/usr/bin/env bash
# 맥에서 한 번만 실행하면:
#   1) Kanji Flow 서버를 launchd가 24시간 유지 — 죽으면 즉시 재시작, 재부팅에도 자동 시작,
#      터미널/SSH 세션을 닫아도 계속 돈다 (KeepAlive)
#   2) 1분마다 GitHub를 확인해 새 코드가 있으면 자동으로 받아 서버를 갱신한다
set -e
cd "$(dirname "$0")"
REPO_DIR="$(pwd)"
APP_DIR="$REPO_DIR/kanji-flow-v2"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS"

SERVER_LABEL="com.kanjiflow.server"
DEPLOY_LABEL="com.kanjiflow.autodeploy"
SERVER_PLIST="$AGENTS/$SERVER_LABEL.plist"
DEPLOY_PLIST="$AGENTS/$DEPLOY_LABEL.plist"

# venv가 없으면 먼저 만든다 (serve.sh의 최초 1회 설치 로직과 동일)
if [ ! -d "$APP_DIR/.venv" ]; then
  echo "[설치] 파이썬 가상환경 준비 중..."
  ( cd "$APP_DIR" && for c in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
      command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }
    done
    [ -z "$PY" ] && { echo "python3 를 찾을 수 없습니다 (brew install python)"; exit 1; }
    "$PY" -m venv .venv
    ./.venv/bin/pip install -q --upgrade pip
    ./.venv/bin/pip install -q -r requirements.txt )
fi

# 1) 서버 keep-alive 작업 — launchd가 serve.sh(=python server.py)를 띄우고, 죽으면 즉시 되살린다
cat > "$SERVER_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$SERVER_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$APP_DIR/serve.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$APP_DIR/server.log</string>
  <key>StandardErrorPath</key><string>$APP_DIR/server.log</string>
</dict>
</plist>
EOF

# 2) 자동배포 작업 — 1분마다 GitHub 확인 → 새 코드면 받아서 서버 갱신
cat > "$DEPLOY_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$DEPLOY_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO_DIR/auto-deploy.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO_DIR</string>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$REPO_DIR/auto-deploy.log</string>
  <key>StandardErrorPath</key><string>$REPO_DIR/auto-deploy.log</string>
</dict>
</plist>
EOF

# 기존 작업 내리고, 옛 방식(nohup)으로 떠 있던 잔여 서버 정리 후, 새로 올린다
launchctl unload "$SERVER_PLIST" 2>/dev/null || true
launchctl unload "$DEPLOY_PLIST" 2>/dev/null || true
lsof -ti tcp:8005 2>/dev/null | xargs kill -9 2>/dev/null || true
launchctl load "$SERVER_PLIST"
launchctl load "$DEPLOY_PLIST"

echo "설치 완료!"
echo "  - 서버를 launchd가 24시간 유지 (죽으면 즉시 재시작, 재부팅에도 자동 시작)"
echo "  - 터미널/SSH 창을 닫아도 서버는 계속 돕니다"
echo "  - 1분마다 GitHub 확인 → 새 코드 자동 반영"
echo "  - 로그: $APP_DIR/server.log , $REPO_DIR/auto-deploy.log"
echo ""
echo "상태 확인:  launchctl list | grep kanjiflow"
echo "해제:       launchctl unload \"$SERVER_PLIST\" \"$DEPLOY_PLIST\""
