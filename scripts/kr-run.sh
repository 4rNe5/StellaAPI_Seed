#!/bin/bash
# 맥북(한국 IP) 검색 노출 측정 1회 실행: 최신 코드·데이터 받기 → 측정 → data/search-kr.json 업로드
# launchd(install-kr-agent.sh)가 4시간마다 Actions보다 30분 먼저 실행 → Actions는 한국 측정이 최신인 곡을 건너뜀
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .kr
exec >> .kr/agent.log 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') 시작"

# 같은 실행이 겹치지 않게 (맥 잠자기 후 깨어나며 밀린 실행이 몰릴 때)
find .kr -maxdepth 1 -name lock -mmin +120 -exec rmdir {} \; 2>/dev/null || true  # 비정상 종료로 남은 잠금 정리
if ! mkdir .kr/lock 2>/dev/null; then echo "이미 실행 중 — 건너뜀"; exit 0; fi
trap 'rmdir .kr/lock' EXIT

node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<6)){console.error("Node 22.6 이상 필요: "+process.version);process.exit(1)}'

git pull --ff-only -q
npm ci --no-audit --no-fund --silent

node --experimental-strip-types --no-warnings src/search.ts \
  --source=KR --stale=3 --stable-stale=23 --budget=1200 --out=.kr/search-kr.json
node --experimental-strip-types --no-warnings --env-file-if-exists=.env src/kr-upload.ts .kr/search-kr.json
echo "=== $(date '+%H:%M:%S') 완료"
