/**
 * 검색 노출 점검: 로그아웃(시크릿 모드 상당) 상태 YouTube 검색 첫 페이지에 곡이 뜨는지 확인
 * 사용: npm run search [-- 옵션]
 *   --budget=초          기본 160. 넘으면 끊고 다음 실행에서 이어서
 *   --stale=시간         기본 8.  일반 곡 재점검 주기
 *   --stable-stale=시간  기본 24. 안정 곡(최근 --stable-runs회 연속 1위) 재점검 주기
 *   --stable-runs=N      기본 3
 *   --delay=ms           기본 1500 (요청 간 delay~2*delay 대기)
 *   --concurrency=N      기본 2
 *   --engine=innertube|html  기본 innertube (실패 시 검색어 단위로 html 예비)
 *   --shard=i/n          대상 목록을 n개로 나눠 i번째(0부터)만 점검 (GitHub Actions 매트릭스용)
 *   --out=경로           기본 data/search.json (샤드는 별도 파일에 쓰고 merge-search.ts로 병합)
 *   --history=N          곡별 보관 이력 수 (기본 180)
 *   --only=게시물id      한 곡만 강제 점검
 * 검색어: queries.ts(수동) > fan-queries.ts(팬 표기) > 자동. 검색어가 바뀐 곡은 이력 초기화 후 우선 재점검
 * 판정: 기본 검색어 → 없으면 "{검색어} cover" 재검색
 *   visible / cover_only / suspected(미노출 1회, 다음 실행 우선 재점검) / hidden(미노출 2회 연속) / error
 */
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import type { Unit } from './members.ts';
import { QUERY_OVERRIDES } from './queries.ts';
import { FAN_QUERIES } from './fan-queries.ts';

const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? 'true']; }));
const BUDGET_MS = Number(args.get('budget') ?? 160) * 1000;
const STALE_MS = Number(args.get('stale') ?? 8) * 3600e3;
const STABLE_STALE_MS = Number(args.get('stable-stale') ?? 24) * 3600e3;
const STABLE_RUNS = Number(args.get('stable-runs') ?? 3);
const DELAY = Number(args.get('delay') ?? 1500);
const CONCURRENCY = Number(args.get('concurrency') ?? 2);
const ENGINE = (args.get('engine') ?? 'innertube') as 'innertube' | 'html';
const ONLY = args.get('only');
const [SHARD_I, SHARD_N] = (args.get('shard') ?? '0/1').split('/').map(Number);
const HISTORY_MAX = Number(args.get('history') ?? 180); // 4시간 주기 기준 30일
const NEW_DAYS = 30; // 공식 게시일 기준 신곡은 안정 여부와 무관하게 일반 주기
const DATA = join(import.meta.dirname, '..', 'data');
const IN = join(DATA, 'search.json');
const OUT = args.get('out') ? resolve(args.get('out')!) : IN;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const SHORT: Record<string, string> = {
  kanna: '칸나', yuni: '유니', huya: '후야', hina: '히나', mashiro: '마시로', lize: '리제', tabi: '타비',
  shibuki: '시부키', rin: '린', nana: '나나', riko: '리코', toa: '토아', rang: '랑', hiyori: '히요리', mary: '메리',
};
const UNIT_KO: Record<Unit, string> = { MYSTIC: '미스틱', EVERYS: '에버리스', UNIVERSE: '유니버스', CLICHE: '클리셰', ABYSS: '어비스' };

export type SearchStatus = 'visible' | 'cover_only' | 'suspected' | 'hidden' | 'error';
type Hist = [string, number | null, number | null]; // [checkedAt, rank, fallbackRank]
export interface SearchEntry {
  query: string;
  rank: number | null; // 기본 검색 첫 페이지 내 순위 (1-base)
  fallbackQuery: string | null;
  fallbackRank: number | null;
  status: SearchStatus;
  resultCount: number;
  noResults: boolean; // 기본 검색어 자체가 "검색결과 없음" (검색어 단위 차단)
  checkedAt: string;
  history: Hist[]; // 최근 60회
}

export function buildQuery(t: any): string {
  if (QUERY_OVERRIDES[t.id]) return QUERY_OVERRIDES[t.id];
  if (FAN_QUERIES[t.id]) return FAN_QUERIES[t.id];
  const who = t.units?.length
    ? t.units.map((u: Unit) => UNIT_KO[u]).join(' ')
    : t.members?.length
      ? t.members.map((m: string) => SHORT[m] ?? m).join(' ')
      : '스텔라이브';
  // 사람이 실제로 치는 형태: 구두점·괄호류 제거 (예: "구르는 바위, 네게…" → "구르는 바위 네게…")
  const title = String(t.titleKo).replace(/[,.!?~…·'"‘’“”「」『』()\[\]]/g, ' ');
  return `${who} ${title}`.replace(/\s+/g, ' ').trim();
}

const rawOf = (h: Hist) => (h[1] ? 'visible' : h[2] ? 'cover_only' : 'hidden');

type Tier = 'priority' | 'normal' | 'stable';
/** priority: 신규·오류·suspected → 매 실행 / normal: --stale 주기 / stable: --stable-stale 주기 */
function tierOf(t: any, e: SearchEntry | undefined, now: number): Tier {
  if (!e || e.status === 'error' || e.status === 'suspected' || e.query !== buildQuery(t)) return 'priority';
  if (t.date && now - Date.parse(t.date) < NEW_DAYS * 864e5) return 'normal';
  const last = e.history.slice(-STABLE_RUNS);
  return last.length === STABLE_RUNS && last.every((h) => h[1] === 1) ? 'stable' : 'normal';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 중간 종료돼도 파일이 깨지지 않도록 임시 파일에 쓰고 교체 */
const writeAtomic = async (p: string, data: string) => { await writeFile(`${p}.tmp`, data); await rename(`${p}.tmp`, p); };

/** 검색 결과 JSON에서 영상 ID(화면 순서)와 "검색결과 없음" 여부 추출 — HTML의 ytInitialData와 InnerTube 응답이 같은 구조 */
function extract(data: any): { ids: string[]; noResults: boolean } {
  const ids: string[] = [];
  let noResults = false;
  (function walk(o: any) {
    if (!o || typeof o !== 'object') return;
    if (o.videoRenderer?.videoId) { ids.push(o.videoRenderer.videoId); return; }
    if (o.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' && o.lockupViewModel.contentId) { ids.push(o.lockupViewModel.contentId); return; }
    if (o.backgroundPromoRenderer) noResults = true;
    for (const k in o) walk(o[k]);
  })(data);
  return { ids: [...new Set(ids)], noResults: noResults && ids.length === 0 };
}

/** 연속 요청 시 YouTube가 리다이렉트 루프(redirect count exceeded)·429로 일시 제한 → 길게 쉬고 재시도 */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= tries) throw e;
      await sleep(15000 * i);
    }
  }
}

const headers = { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' };

async function htmlSearch(q: string) {
  return withRetry(async () => {
    const res = await fetch(`https://www.youtube.com/results?${new URLSearchParams({ search_query: q, hl: 'ko', gl: 'KR' })}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const m = html.match(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.*?\});\s*<\/script>/s);
    if (!m) throw new Error('ytInitialData 없음 (차단·동의 페이지 의심)');
    return extract(JSON.parse(m[1]));
  });
}

let clientVersion: Promise<string> | null = null;
/** InnerTube 호출에 필요한 웹 클라이언트 버전: 실행당 1회 YouTube 페이지에서 추출 */
function getClientVersion() {
  return (clientVersion ??= withRetry(async () => {
    const res = await fetch('https://www.youtube.com/results?search_query=stellive&hl=ko&gl=KR', { headers });
    const v = (await res.text()).match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
    if (!v) throw new Error('INNERTUBE_CLIENT_VERSION 없음');
    return v;
  }));
}

async function innertubeSearch(q: string) {
  const version = await getClientVersion();
  return withRetry(async () => {
    const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', 'x-youtube-client-name': '1', 'x-youtube-client-version': version },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: version, hl: 'ko', gl: 'KR' } }, query: q }),
    });
    if (!res.ok) throw new Error(`InnerTube HTTP ${res.status}`);
    const data: any = await res.json();
    if (!data?.contents) throw new Error('InnerTube 응답에 contents 없음');
    return extract(data);
  }, 2);
}

let htmlFallbacks = 0;
async function searchIds(q: string) {
  if (ENGINE === 'html') return htmlSearch(q);
  try {
    return await innertubeSearch(q);
  } catch (e) {
    htmlFallbacks++;
    console.warn(`  InnerTube 실패 → HTML 예비 ("${q}"): ${(e as Error).message}`);
    return htmlSearch(q);
  }
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true }); // 샤드 출력 폴더는 러너에 없음
  const tracks: any[] = JSON.parse(await readFile(join(DATA, 'tracks.json'), 'utf8'));
  const db: Record<string, SearchEntry> = existsSync(IN) ? JSON.parse(await readFile(IN, 'utf8')) : {};
  // 삭제·비공개 영상은 검색 노출 판정이 무의미 → 제외 (youtube 단계 결과가 있을 때)
  const VIDEOS = join(DATA, 'youtube', 'videos.json');
  const unavailable = new Set<string>(existsSync(VIDEOS) ? JSON.parse(await readFile(VIDEOS, 'utf8')).filter((v: any) => !v.available).map((v: any) => v.id) : []);
  const now = Date.now();
  const order: Record<Tier, number> = { priority: 0, normal: 1, stable: 2 };
  const tiers = { priority: 0, normal: 0, stable: 0 };
  const due = tracks
    .filter((t) => t.youtubeId && !t.isMedley && !unavailable.has(t.youtubeId))
    .map((t) => ({ t, tier: tierOf(t, db[t.id], now), age: db[t.id] ? now - Date.parse(db[t.id].checkedAt) : Infinity }))
    .filter(({ t, tier, age }) => (ONLY ? String(t.id) === ONLY : tier === 'priority' || age > (tier === 'stable' ? STABLE_STALE_MS : STALE_MS)))
    // 우선순위 → 오래된 순 → id (샤드가 같은 순서를 보도록 결정적 정렬)
    .sort((a, b) => order[a.tier] - order[b.tier] || b.age - a.age || a.t.id - b.t.id)
    .filter((_, i) => i % SHARD_N === SHARD_I);
  due.forEach((d) => tiers[d.tier]++);
  console.log(`점검 대상 ${due.length}곡 (우선 ${tiers.priority} · 일반 ${tiers.normal} · 안정 ${tiers.stable}) · 샤드 ${SHARD_I + 1}/${SHARD_N} · ${ENGINE} · 동시 ${CONCURRENCY} · budget ${BUDGET_MS / 1000}s`);

  const start = Date.now();
  let done = 0, errors = 0, stop = false, cursor = 0;
  let saving = Promise.resolve();
  const save = () => (saving = saving.then(() => writeAtomic(OUT, JSON.stringify(db, null, 1)))); // 저장 직렬화

  async function worker() {
    while (!stop && cursor < due.length) {
      if (Date.now() - start >= BUDGET_MS) break;
      const { t } = due[cursor++];
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
        const cur: Hist = [checkedAt, rank, fallbackRank];
        const sameQuery = prev?.query === query;
        const prevHistory = sameQuery ? prev!.history : []; // 검색어가 바뀌면 이력 초기화
        const prevRaw = prevHistory.at(-1);
        const raw = rawOf(cur);
        // 미노출은 2회 연속일 때만 확정 (IP·시점에 따른 검색 결과 노이즈 대응)
        const status: SearchStatus = raw === 'hidden' ? (prevRaw && rawOf(prevRaw) === 'hidden' ? 'hidden' : 'suspected') : raw;
        entry = {
          query, rank, fallbackQuery, fallbackRank, status,
          resultCount: ids.length, noResults, checkedAt,
          history: [...prevHistory, cur].slice(-HISTORY_MAX),
        };
        errors = 0;
      } catch (e) {
        errors++;
        console.warn(`  #${t.id} ${query}: ${(e as Error).message}${(e as any).cause ? ` (${(e as any).cause.code ?? (e as any).cause.message})` : ''}`);
        entry = { ...(prev ?? { query, rank: null, fallbackQuery: null, fallbackRank: null, resultCount: 0, noResults: false, history: [] }), query, status: 'error', checkedAt: new Date().toISOString() };
        if (errors >= 3 && !stop) { stop = true; console.warn('  연속 오류 3회 → 중단 (차단 의심, 잠시 후 재실행)'); }
      }
      db[t.id] = entry;
      done++;
      if (entry.status !== 'visible') console.log(`  ${entry.status.padEnd(10)} #${t.id} "${query}"`);
      if (done % 25 === 0) console.log(`  진행 ${done}/${due.length} (${Math.round((Date.now() - start) / 1000)}s)`);
      await save(); // 매 곡 저장 → 중단돼도 이어받기
      await sleep(DELAY + Math.random() * DELAY);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (!done) await save(); // 샤드가 비어도 출력 파일은 생성
  await saving;
  const all = Object.values(db);
  const count = (s: SearchStatus) => all.filter((e) => e.status === s).length;
  const remain = due.length - done;
  console.log(
    `이번 실행 ${done}곡 ${Math.round((Date.now() - start) / 1000)}s · 전체 visible ${count('visible')} / cover_only ${count('cover_only')} / suspected ${count('suspected')} / hidden ${count('hidden')} / error ${count('error')}` +
      (htmlFallbacks ? ` · HTML 예비 ${htmlFallbacks}회` : '') +
      (remain > 0 ? ` · 남은 ${remain}곡 (재실행 시 이어서)` : ''),
  );
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
