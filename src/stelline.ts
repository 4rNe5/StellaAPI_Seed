/**
 * Stelline(https://stel-line.vercel.app) 데이터 수집 → data/stelline/*.json
 * 운영자 허가(2026-11-05)를 받아 내부 API를 호출함. 조건:
 *   - StellaAPI임을 알 수 있는 User-Agent
 *   - 과도한 요청 금지 (수집 1회당 엔드포인트별 1회 + 실패 시 1회 재시도)
 *   - 실패하면 마지막으로 받은 값을 유지 (내부 API라 예고 없이 바뀌거나 멈출 수 있음)
 *   - 노출 판정은 "YouTube 검색 상위 3개 안" 자체 점검 결과 — 공식 값 아님, 점검 시각과 함께 표기
 *   - risk는 Stelline 내부 점검 순서 값이라 사용하지 않음
 * 사용: npm run stelline   (STELLINE=0 이면 건너뜀 — 중단 요청 시 워크플로 env로 끔)
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const STELLINE_BASE = 'https://stel-line.vercel.app/api';
export const STELLINE_UA = 'StellaAPI/1.0 (+https://github.com/4rNe5/StellaAPI_Seed; unofficial fan project)';
const DIR = join(import.meta.dirname, '..', 'data', 'stelline');

const ENDPOINTS = {
  'search-songs': '/search/songs',
  'not-searched': '/search/not_searched',
  karaoke: '/karaoke/songs',
} as const;

// 형식이 바뀌어 엉뚱한 값을 덮어쓰지 않도록 최소 형태 검사
const VALID: Record<keyof typeof ENDPOINTS, (d: any) => boolean> = {
  'search-songs': (d) => Array.isArray(d) && d.length > 50 && d.every((x) => typeof x.video_id === 'string' && typeof x.query === 'string'),
  'not-searched': (d) => d && Array.isArray(d.all_songs) && Array.isArray(d.recent) && Array.isArray(d.cover_matches) && typeof d.searched_time === 'number',
  karaoke: (d) => d && Array.isArray(d.songs) && d.songs.length > 50 && d.songs.every((x: any) => typeof x.title === 'string' && Array.isArray(x.members)),
};

async function get(path: string) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(STELLINE_BASE + path, { headers: { 'user-agent': STELLINE_UA, accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

if (import.meta.main) {
  if (process.env.STELLINE === '0') { console.log('Stelline 수집 꺼짐 (STELLINE=0) — 이전 값 유지'); process.exit(0); }
  await mkdir(DIR, { recursive: true });
  for (const [name, path] of Object.entries(ENDPOINTS) as [keyof typeof ENDPOINTS, string][]) {
    const file = join(DIR, `${name}.json`);
    try {
      const data = await get(path);
      if (!VALID[name](data)) throw new Error('응답 형식이 예상과 다름');
      await writeFile(file + '.tmp', JSON.stringify({ source: STELLINE_BASE + path, fetchedAt: new Date().toISOString(), data }, null, 1));
      await rename(file + '.tmp', file);
      const n = Array.isArray(data) ? data.length : (data.songs ?? data.all_songs ?? []).length;
      console.log(`  ${name}: ${n}건`);
    } catch (e) {
      const prev = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')).fetchedAt : '없음';
      console.warn(`  ${name}: 실패 (${(e as Error).message}) — 이전 값 유지 (${prev})`);
    }
  }
}

/** 저장된 Stelline 데이터 읽기 (없으면 null) */
export function loadStelline<T = any>(name: keyof typeof ENDPOINTS): { fetchedAt: string; data: T } | null {
  const file = join(DIR, `${name}.json`);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}
