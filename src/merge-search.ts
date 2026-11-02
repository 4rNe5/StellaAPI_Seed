/**
 * 샤드 검색 결과 병합: data/search.json + data/search-shards/*.json → data/search.json
 * 곡별로 checkedAt이 가장 최근인 항목을 채택 (각 곡은 한 샤드만 점검하므로 충돌 없음)
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(import.meta.dirname, '..', 'data');
const BASE = join(DATA, 'search.json');
const DIR = join(DATA, 'search-shards');

const merged: Record<string, any> = existsSync(BASE) ? JSON.parse(await readFile(BASE, 'utf8')) : {};
const files = existsSync(DIR) ? (await readdir(DIR, { recursive: true })).filter((f) => String(f).endsWith('.json')) : [];
if (!files.length) {
  console.log('병합할 샤드 결과 없음 — search.json 유지');
  process.exit(0);
}
let updated = 0;
for (const f of files) {
  const shard: Record<string, any> = JSON.parse(await readFile(join(DIR, String(f)), 'utf8'));
  for (const [id, e] of Object.entries(shard)) {
    if (!merged[id] || Date.parse(e.checkedAt) > Date.parse(merged[id].checkedAt)) { merged[id] = e; updated++; }
  }
}
await writeFile(BASE, JSON.stringify(merged, null, 1));
console.log(`샤드 ${files.length}개 병합 · 갱신 ${updated}곡 · 전체 ${Object.keys(merged).length}곡`);
