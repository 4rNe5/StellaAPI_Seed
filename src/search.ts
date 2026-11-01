/**
 * 검색 노출 점검: 로그아웃(시크릿 모드 상당) 상태 YouTube 웹 검색 첫 페이지에 곡이 뜨는지 확인
 * 사용: npm run search [-- --budget=160 --stale=8 --delay=1500 --concurrency=2 --only=14693]
 *  - 검색어: "{멤버 약칭} {곡명}" → 없으면 "{검색어} cover" 재검색
 *  - stale 시간(기본 8h)이 지난 곡만 점검, budget 초 안에서 끊고 다음 실행 때 이어서 진행
 *  출력: data/search.json
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Unit } from './members.ts';
import { QUERY_OVERRIDES } from './queries.ts';

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const BUDGET_MS = Number(args.get('budget') ?? 160) * 1000;
const STALE_MS = Number(args.get('stale') ?? 8) * 3600e3;
const DELAY = Number(args.get('delay') ?? 1500);
const CONCURRENCY = Number(args.get('concurrency') ?? 2);
const ONLY = args.get('only');
const DATA = join(import.meta.dirname, '..', 'data');
const OUT = join(DATA, 'search.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const SHORT: Record<string, string> = {
  kanna: '칸나', yuni: '유니', huya: '후야', hina: '히나', mashiro: '마시로', lize: '리제', tabi: '타비',
  shibuki: '시부키', rin: '린', nana: '나나', riko: '리코', toa: '토아', rang: '랑', hiyori: '히요리', mary: '메리',
};
const UNIT_KO: Record<Unit, string> = { MYSTIC: '미스틱', EVERYS: '에버리스', UNIVERSE: '유니버스', CLICHE: '클리셰', ABYSS: '어비스' };

export type SearchStatus = 'visible' | 'cover_only' | 'hidden' | 'error';
export interface SearchEntry {
  query: string;
  rank: number | null; // 기본 검색 첫 페이지 내 순위 (1-base)
  fallbackQuery: string | null;
  fallbackRank: number | null;
  status: SearchStatus;
  resultCount: number;
  noResults: boolean; // 기본 검색어 자체가 "검색결과 없음" (검색어 단위 차단)
  checkedAt: string;
  history: [string, number | null, number | null][]; // [checkedAt, rank, fallbackRank] 최근 60회
}

export function buildQuery(t: any): string {
  if (QUERY_OVERRIDES[t.id]) return QUERY_OVERRIDES[t.id];
  const who = t.units?.length
    ? t.units.map((u: Unit) => UNIT_KO[u]).join(' ')
    : t.members?.length
      ? t.members.map((m: string) => SHORT[m] ?? m).join(' ')
      : '스텔라이브';
  // 사람이 실제로 치는 형태: 구두점·괄호류 제거 (예: "구르는 바위, 네게…" → "구르는 바위 네게…")
  const title = String(t.titleKo).replace(/[,.!?~…·'"‘’“”「」『』()\[\]]/g, ' ');
  return `${who} ${title}`.replace(/\s+/g, ' ').trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 중간 종료돼도 파일이 깨지지 않도록 임시 파일에 쓰고 교체 */
const writeAtomic = async (p: string, data: string) => { await writeFile(`${p}.tmp`, data); await rename(`${p}.tmp`, p); };

/** 검색 결과 첫 페이지의 영상 ID 목록 (화면 순서). noResults = YouTube "검색결과 없음" 화면 */
async function searchIds(q: string, tries = 3): Promise<{ ids: string[]; noResults: boolean }> {
  const url = `https://www.youtube.com/results?${new URLSearchParams({ search_query: q, hl: 'ko', gl: 'KR' })}`;
  for (let i = 1; ; i++) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' } });
    } catch (e) {
      // 연속 요청 시 YouTube가 리다이렉트 루프(redirect count exceeded)로 일시 제한 → 길게 쉬고 재시도
      if (i >= tries) throw e;
      await sleep(15000 * i);
      continue;
    }
    const html = res.ok ? await res.text() : '';
    const m = html.match(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.*?\});\s*<\/script>/s);
    if (!m) {
      if (i >= tries) throw new Error(res.ok ? 'ytInitialData 없음 (차단·동의 페이지 의심)' : `HTTP ${res.status}`);
      await sleep(4000 * i);
      continue;
    }
    const ids: string[] = [];
    let noResults = false;
    (function walk(o: any) {
      if (!o || typeof o !== 'object') return;
      if (o.videoRenderer?.videoId) { ids.push(o.videoRenderer.videoId); return; }
      if (o.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && o.lockupViewModel.contentId) { ids.push(o.lockupViewModel.contentId); return; }
      if (o.backgroundPromoRenderer) noResults = true;
      for (const k in o) walk(o[k]);
    })(JSON.parse(m[1]));
    return { ids: [...new Set(ids)], noResults: noResults && ids.length === 0 };
  }
}

async function main() {
  const tracks: any[] = JSON.parse(await readFile(join(DATA, 'tracks.json'), 'utf8'));
  const db: Record<string, SearchEntry> = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : {};
  const now = Date.now();
  const due = tracks
    .filter((t) => t.youtubeId && !t.isMedley)
    .filter((t) => (ONLY ? String(t.id) === ONLY : !db[t.id] || db[t.id].status === 'error' || now - Date.parse(db[t.id].checkedAt) > STALE_MS))
    .sort((a, b) => Date.parse(db[a.id]?.checkedAt ?? '0') - Date.parse(db[b.id]?.checkedAt ?? '0')); // 오래된 것부터
  console.log(`점검 대상 ${due.length}곡 (budget ${BUDGET_MS / 1000}s, 동시 ${CONCURRENCY})`);

  const start = Date.now();
  let done = 0, errors = 0, stop = false, cursor = 0;
  let saving = Promise.resolve();
  const save = () => (saving = saving.then(() => writeAtomic(OUT, JSON.stringify(db, null, 1)))); // 저장 직렬화

  async function worker() {
  while (!stop && cursor < due.length) {
    if (Date.now() - start > BUDGET_MS) break;
    const t = due[cursor++];
    const query = buildQuery(t);
    const prev = db[t.id];
    let entry: SearchEntry;
    try {
      const { ids, noResults } = await searchIds(query);
      const rank = ids.indexOf(t.youtubeId) + 1 || null;
      let fallbackQuery: string | null = null, fallbackRank: number | null = null;
      if (!rank) {
        await sleep(DELAY);
        fallbackQuery = `${query} cover`;
        fallbackRank = (await searchIds(fallbackQuery)).ids.indexOf(t.youtubeId) + 1 || null;
      }
      const checkedAt = new Date().toISOString();
      entry = {
        query, rank, fallbackQuery, fallbackRank,
        status: rank ? 'visible' : fallbackRank ? 'cover_only' : 'hidden',
        resultCount: ids.length, noResults, checkedAt,
        history: [...(prev?.history ?? []), [checkedAt, rank, fallbackRank] as [string, number | null, number | null]].slice(-60),
      };
      errors = 0;
    } catch (e) {
      errors++;
      console.warn(`  #${t.id} ${query}: ${(e as Error).message}${(e as any).cause ? ` (${(e as any).cause.code ?? (e as any).cause.message})` : ""}`);
      entry = { ...(prev ?? { query, rank: null, fallbackQuery: null, fallbackRank: null, resultCount: 0, noResults: false, history: [] }), query, status: 'error', checkedAt: new Date().toISOString() };
      if (errors >= 3 && !stop) { stop = true; console.warn('  연속 오류 3회 → 중단 (차단 의심, 잠시 후 재실행)'); }
    }
    db[t.id] = entry;
    done++;
    if (entry.status !== 'visible') console.log(`  ${entry.status.padEnd(10)} #${t.id} "${query}"`);
    if (done % 25 === 0) console.log(`  진행 ${done}/${due.length}`);
    await save(); // 매 곡 저장 → 중단돼도 이어받기
    await sleep(DELAY + Math.random() * DELAY);
  }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await saving;
  const all = Object.values(db);
  const count = (s: SearchStatus) => all.filter((e) => e.status === s).length;
  const remain = due.length - done;
  console.log(`이번 실행 ${done}곡 · 전체 visible ${count('visible')} / cover_only ${count('cover_only')} / hidden ${count('hidden')} / error ${count('error')}` + (remain > 0 ? ` · 남은 ${remain}곡 (재실행 시 이어서)` : ''));
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
