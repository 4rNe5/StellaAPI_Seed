#!/bin/bash
# 맥북 보조 측정 등록 (macOS launchd). 저장소 루트에서 한 번 실행:  bash scripts/install-kr-agent.sh
# 해제:  bash scripts/install-kr-agent.sh --uninstall
# 실행 시각: KST 03:17 / 07:17 / 11:17 / 15:17 / 19:17 / 23:17 (Actions 30분 전). 잠자기 중 놓친 실행은 깨어날 때 1회 실행
set -euo pipefail
LABEL=com.4rne5.stellaapi.kr
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"; echo "해제 완료"; exit 0
fi

[[ "$(uname)" == Darwin ]] || { echo "macOS 전용입니다"; exit 1; }
NODE="$(command -v node || true)"; [[ -n "$NODE" ]] || { echo "node를 찾을 수 없습니다 (Node 22.6 이상 설치 필요)"; exit 1; }
grep -q '^KR_GITHUB_TOKEN=.\+' "$ROOT/.env" 2>/dev/null || { echo ".env에 KR_GITHUB_TOKEN=... 을 먼저 넣어주세요 (.env.example 참고)"; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/.kr"
HOURS=""; for h in 3 7 11 15 19 23; do HOURS+="<dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>17</integer></dict>"; done
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$ROOT/scripts/kr-run.sh</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key><array>$HOURS</array>
  <key>StandardOutPath</key><string>$ROOT/.kr/launchd.log</string>
  <key>StandardErrorPath</key><string>$ROOT/.kr/launchd.log</string>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "등록 완료: $LABEL (node: $NODE)"
echo "지금 1회 시험 실행:  launchctl kickstart gui/$(id -u)/$LABEL   → 로그: $ROOT/.kr/agent.log"
