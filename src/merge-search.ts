/**
 * 검색 결과 병합 → data/search.json (곡별로 checkedAt이 가장 최근인 항목 채택)
 * 사용: npm run merge-search [-- 파일...]
 *   인자 없음: data/search-shards/*.json (Actions 샤드 결과)
 *   인자 있음: 지정 파일 (예: data/search-kr.json — 맥북 한국 IP 측정 결과)
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DATA = join(import.meta.dirname, '..', 'data');
const BASE = join(DATA, 'search.json');
const DIR = join(DATA, 'search-shards');

const argFiles = process.argv.slice(2).map((f) => resolve(f)).filter((f) => existsSync(f));
const files = process.argv.length > 2
  ? argFiles
  : existsSync(DIR) ? (await readdir(DIR, { recursive: true })).filter((f) => String(f).endsWith('.json')).map((f) => join(DIR, String(f))) : [];
if (!files.length) {
  console.log('병합할 결과 없음 — search.json 유지');
  process.exit(0);
}
const merged: Record<string, any> = existsSync(BASE) ? JSON.parse(await readFile(BASE, 'utf8')) : {};
// 한국(KR) 측정이 24시간 안이면 그 뒤의 미국(US) 측정으로 덮어쓰지 않음 (US는 맥북이 꺼졌을 때의 대비용)
const KR_HOLD_MS = 24 * 3600e3;
const keepKR = (cur: any, next: any) => cur?.source === 'KR' && next.source === 'US' && Date.parse(next.checkedAt) - Date.parse(cur.checkedAt) < KR_HOLD_MS;
let updated = 0, kept = 0;
for (const f of files) {
  const part: Record<string, any> = JSON.parse(await readFile(f, 'utf8'));
  for (const [id, e] of Object.entries(part)) {
    if (merged[id] && Date.parse(e.checkedAt) <= Date.parse(merged[id].checkedAt)) continue;
    if (keepKR(merged[id], e)) { kept++; continue; }
    merged[id] = e; updated++;
  }
}
await writeFile(BASE, JSON.stringify(merged, null, 1));
const bySource: Record<string, number> = {};
Object.values(merged).forEach((e: any) => (bySource[e.source ?? '미표기'] = (bySource[e.source ?? '미표기'] ?? 0) + 1));
console.log(`${files.length}개 파일 병합 · 갱신 ${updated}곡 · 한국 측정 유지 ${kept}곡 · 전체 ${Object.keys(merged).length}곡 · 측정 위치 ${JSON.stringify(bySource)}`);
