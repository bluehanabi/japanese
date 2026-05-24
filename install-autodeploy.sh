#!/usr/bin/env bash
# 맥에서 한 번만 실행하면, 2분마다 GitHub를 확인해 자동으로
# 최신 코드를 받아 서버를 재시작하는 launchd 작업을 등록한다.
set -e
cd "$(dirname "$0")"
REPO_DIR="$(pwd)"
LABEL="com.kanjiflow.autodeploy"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
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

# 기존 작업이 있으면 내리고 새로 올린다
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "자동배포 등록 완료!"
echo "  - 1분마다 GitHub 확인 -> 새 코드 있으면 자동 내려받기 + 서버 재시작"
echo "  - 서버가 꺼져 있어도 자동으로 다시 살림"
echo "  - 로그: $REPO_DIR/auto-deploy.log"
echo ""
echo "해제하려면:  launchctl unload \"$PLIST\" && rm \"$PLIST\""
