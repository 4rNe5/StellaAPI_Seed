#!/bin/bash
# 맥북(한국 IP) 검색 측정 — Claude 예약 작업이 맥북 VM에서 단계별로 실행 (한 번 호출이 180초 제한이라 나눠 실행)
#   bash scripts/kr-session.sh prepare   의존성 설치 + 최신 data/search.json을 기준 파일로 복사
#   bash scripts/kr-session.sh run       150초 측정 (출력에 "남은 N곡"이 있으면 다시 run)
#   bash scripts/kr-session.sh upload    .kr/search-kr.json → 저장소 data/search-kr.json
# 토큰: KR_ENV_FILE(기본 ~/mnt/Repo/.stellaapi-kr.env)의 KR_GITHUB_TOKEN
set -euo pipefail
ENV_FILE="${KR_ENV_FILE:-$HOME/mnt/Repo/.stellaapi-kr.env}"
cd "$(dirname "$0")/.."
NODE=(node --experimental-strip-types --no-warnings)
case "${1:-}" in
  prepare)
    npm ci --no-audit --no-fund --silent
    mkdir -p .kr && cp data/search.json .kr/search-kr.json
    echo "준비 완료 ($(node -v))" ;;
  run)
    "${NODE[@]}" src/search.ts --source=KR --stale=7 --stable-stale=23 --budget=150 --in=.kr/search-kr.json --out=.kr/search-kr.json ;;
  upload)
    "${NODE[@]}" --env-file-if-exists="$ENV_FILE" src/kr-upload.ts .kr/search-kr.json ;;
  *) echo "사용: $0 prepare|run|upload"; exit 2 ;;
esac
