/**
 * 스텔라이브 공식 MUSIC 카탈로그 수집기
 * 사용: node --experimental-strip-types src/collect.ts [--full] [--delay=400]
 *  - 기본: 목록을 새로 받고, 캐시에 없는 상세만 요청 (증분)
 *  - --full: 모든 상세를 다시 요청
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, parseList, parseDetail, parseTitle, type Detail } from './parse.ts';
import { MEMBERS, resolveArtists } from './members.ts';
import { splitSource } from './artists.ts';

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const FULL = args.has('full');
const DELAY = Number(args.get('delay') ?? 400);
const DATA = join(import.meta.dirname, '..', 'data');
const CACHE = join(DATA, 'cache', 'details');
const UA = 'SOUNDOFSTELLA-collector/0.1 (unofficial fan project; +https://github.com/4rNe5)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, tries = 3): Promise<string> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${(e as Error).message}`);
      await sleep(1000 * i);
    }
  }
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : Array.isArray(v) ? v.join('|') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main() {
  await mkdir(CACHE, { recursive: true });

  console.log('[1/3] 목록 수집');
  const list = parseList(await get(`${BASE}/music`));
  if (list.length === 0) throw new Error('목록 파싱 결과 0건 — 사이트 구조 변경 의심');
  console.log(`  목록 ${list.length}건`);

  const cached = new Set((await readdir(CACHE)).map((f) => Number(f.replace('.json', ''))));
  const todo = list.filter((i) => FULL || !cached.has(i.id));
  console.log(`[2/3] 상세 수집: ${todo.length}건 (캐시 ${cached.size}건)`);
  const failed: number[] = [];
  for (const [n, item] of todo.entries()) {
    try {
      const d = parseDetail(item.id, await get(`${BASE}/music/${item.id}`));
      await writeFile(join(CACHE, `${item.id}.json`), JSON.stringify(d));
    } catch (e) {
      failed.push(item.id);
      console.warn(`  실패 ${item.id}: ${(e as Error).message}`);
    }
    if ((n + 1) % 25 === 0 || n === todo.length - 1) console.log(`  ${n + 1}/${todo.length}`);
    await sleep(DELAY);
  }

  console.log('[3/3] 정규화·출력');
  const tracks = [];
  for (const item of list) {
    const p = join(CACHE, `${item.id}.json`);
    if (!existsSync(p)) continue;
    const d: Detail = JSON.parse(await readFile(p, 'utf8'));
    const singer = d.singer || item.singer;
    const t = parseTitle(d.title || item.title, item.label);
    const a = resolveArtists(singer);
    tracks.push({
      id: d.id,
      url: `${BASE}/music/${d.id}`,
      title: d.title || item.title,
      kind: t.kind,
      isMedley: t.isMedley,
      titleKo: t.titleKo,
      titleOriginal: t.titleOriginal,
      source: t.source,
      sourceArtists: t.kind === 'cover' ? splitSource(t.source) : [],
      date: d.date,
      youtubeId: d.youtubeId,
      singer,
      members: a.members,
      units: a.units,
      group: a.group,
      guests: a.guests,
      label: item.label,
      category: d.category,
      categoryId: d.categoryId,
    });
  }
  tracks.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? '') || y.id - x.id);

  await writeFile(join(DATA, 'tracks.json'), JSON.stringify(tracks, null, 2));
  const cols = Object.keys(tracks[0]) as (keyof (typeof tracks)[number])[];
  await writeFile(join(DATA, 'tracks.csv'), '﻿' + [cols.join(','), ...tracks.map((t) => cols.map((c) => csvCell(t[c])).join(','))].join('\n'));
  await writeFile(join(DATA, 'members.json'), JSON.stringify(MEMBERS, null, 2));
  await writeFile(
    join(DATA, 'meta.json'),
    JSON.stringify({ source: `${BASE}/music`, fetchedAt: new Date().toISOString(), listCount: list.length, trackCount: tracks.length, failed }, null, 2),
  );
  console.log(`완료: ${tracks.length}/${list.length}건 → data/tracks.json, tracks.csv` + (failed.length ? ` (실패 ${failed.length}건, 재실행 시 재시도)` : ''));
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
