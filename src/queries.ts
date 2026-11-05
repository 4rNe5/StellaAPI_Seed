// 검색 노출 점검용 검색어 수동 지정 (공식 게시물 id → 검색어) — 최우선
// 우선순위: QUERY_OVERRIDES(여기) > Stelline 등록 검색어(data/stelline) > FAN_QUERIES(fan-queries.ts 스냅샷) > 자동 생성("{멤버 약칭} {곡명}")
// 팬 표기 검색어가 없거나 틀린 곡만 여기에 추가
export const QUERY_OVERRIDES: Record<number, string> = {};
