/**
 * 정적 JSON API 생성: data/ → public/v1/**.json (Vercel 배포용, vercel.json이 확장자 없는 경로로 연결)
 * 사용: npm run export-api
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DATA = join(ROOT, 'data');
const OUT = join(ROOT, 'public', 'v1');
const read = async (p: string, fb: any = null) => (existsSync(join(DATA, p)) ? JSON.parse(await readFile(join(DATA, p), 'utf8')) : fb);

const songs: any[] = await read('songs.json', []);
if (!songs.length) throw new Error('data/songs.json 없음 — npm run build 먼저 실행');
const members: any[] = await read('members.json', []);
const meta = await read('meta.json', {});
const search: Record<string, any> = await read('search.json', {});
const channels: any[] = await read('youtube/channels.json', []);
const chzzk: any[] = await read('chzzk.json', []);
const statDays = existsSync(join(DATA, 'stats')) ? (await readdir(join(DATA, 'stats'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
const stats = await Promise.all(statDays.map(async (f) => ({ date: f.slice(0, 10), ...(await read(`stats/${f}`)) })));

let files = 0;
async function emit(path: string, body: unknown) {
  const p = join(OUT, `${path}.json`);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(body));
  files++;
}

await rm(join(ROOT, 'public'), { recursive: true, force: true });
const generatedAt = new Date().toISOString();
const latestSearchAt = Object.values(search).reduce((m: string, e: any) => (e.checkedAt > m ? e.checkedAt : m), '');
const latest = stats.at(-1);
const prevDay = stats.at(-2);

// /v1/meta
const metaBody = {
  generatedAt,
  sources: {
    officialMusic: { url: meta.source, fetchedAt: meta.fetchedAt },
    youtubeStats: latest ? { date: latest.date, fetchedAt: latest.at } : null,
    search: { checkedAt: latestSearchAt || null },
  },
  counts: { songs: songs.length, members: members.length, channels: channels.length, statDays: stats.length },
  notice: '비공식 팬 프로젝트. 스텔라이브 및 소속 멤버와 무관합니다.',
};
await emit('meta', metaBody);

// /v1/songs, /v1/songs/{id}
await emit('songs', songs);
for (const s of songs) await emit(`songs/${s.id}`, { ...s, searchHistory: search[s.id]?.history?.map(([at, rank, fallbackRank]: any) => ({ at, rank, fallbackRank })) ?? [] });

// /v1/members, /v1/members/{slug}
const songsOf = (slug: string) => songs.filter((s) => s.members.includes(slug));
await emit('members', members.map((m) => ({ ...m, songCount: songsOf(m.slug).length })));
for (const m of members) await emit(`members/${m.slug}`, { ...m, songs: songsOf(m.slug) });

// /v1/channels — YouTube 채널·치지직 (곡 데이터와 별도)
const owners = [...new Set([...channels.map((c) => c.owner), ...chzzk.map((c) => c.owner)])];
await emit(
  'channels',
  owners.map((owner) => ({
    owner,
    youtube: channels.filter((c) => c.owner === owner).map(({ uploads, ...c }) => c),
    chzzk: chzzk.find((c) => c.owner === owner) ?? null,
  })),
);

// /v1/search/hidden — 노출 문제 있는 곡
const SEVERITY: Record<string, number> = { hidden: 0, suspected: 1, cover_only: 2 };
await emit(
  'search/hidden',
  songs.filter((s) => s.search && s.search.status in SEVERITY).sort((a, b) => SEVERITY[a.search.status] - SEVERITY[b.search.status] || b.id - a.id),
);

// /v1/stats/latest, /v1/stats/songs/{id} — 조회수 등 통계 (곡 데이터와 별도, 일별 스냅샷 기반)
const vidStat = (snap: any, yt: string) => snap?.videos?.[yt] ?? null;
if (latest) {
  await emit('stats/latest', {
    date: latest.date,
    fetchedAt: latest.at,
    songs: Object.fromEntries(
      songs.filter((s) => vidStat(latest, s.youtubeId)).map((s) => {
        const [views, likes, comments] = vidStat(latest, s.youtubeId);
        const prev = vidStat(prevDay, s.youtubeId);
        return [s.id, { youtubeId: s.youtubeId, views, likes, comments, viewsDelta1d: prev ? views - prev[0] : null }];
      }),
    ),
    channels: channels.map((c) => ({ owner: c.owner, channelId: c.channelId, title: c.title, subscribers: latest.channels?.[c.channelId]?.[0] ?? c.subscribers, views: latest.channels?.[c.channelId]?.[1] ?? c.views })),
    chzzk: latest.chzzk ?? {},
  });
}
for (const s of songs) {
  const series = stats.map((d) => [d.date, vidStat(d, s.youtubeId)] as const).filter(([, v]) => v).map(([date, [views, likes, comments]]: any) => ({ date, views, likes, comments }));
  await emit(`stats/songs/${s.id}`, { id: s.id, youtubeId: s.youtubeId, title: s.title, series });
}

// /v1 — 엔드포인트 안내
await emit('index', {
  name: 'StellaAPI (unofficial)',
  ...metaBody,
  endpoints: {
    '/v1/meta': '갱신 시각·건수',
    '/v1/songs': '전체 곡 (공식 MUSIC + 가용성 + 검색 노출)',
    '/v1/songs/{id}': '곡 1개 + 검색 노출 이력',
    '/v1/members': '멤버 목록 + 곡 수',
    '/v1/members/{slug}': '멤버 1명 + 참여 곡',
    '/v1/channels': '멤버별 YouTube 채널·치지직',
    '/v1/search/hidden': '검색 노출 문제 곡 (hidden → suspected → cover_only)',
    '/v1/stats/latest': '최신 조회수·좋아요·댓글 (+전일 대비), 채널 구독자, 치지직 팔로워',
    '/v1/stats/songs/{id}': '곡별 일별 조회수 추이',
  },
  memberSlugs: members.map((m) => m.slug),
});

console.log(`public/v1 · ${files}개 파일 · 곡 ${songs.length} · 멤버 ${members.length} · 통계 ${stats.length}일`);
