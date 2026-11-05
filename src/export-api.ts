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
const stKaraoke = await read('stelline/karaoke.json');
const stSongs = await read('stelline/search-songs.json');
const stNs = await read('stelline/not-searched.json');
const isoSec = (sec: number | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);
const STELLINE = {
  name: 'Stelline',
  url: 'https://stel-line.vercel.app',
  notice: 'Stelline 운영자 허가를 받아 제공합니다. 노출 판정은 Stelline 자체 점검(YouTube 검색 상위 3개 안 여부)으로 YouTube 공식 값이 아닙니다. 검색어·노래방 번호·멤버는 직접 입력이라 빠지거나 늦게 반영될 수 있습니다.',
};
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
    stelline: stSongs ? { url: STELLINE.url, fetchedAt: stSongs.fetchedAt, roundCheckedAt: isoSec(stNs?.data?.searched_time) } : null,
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

// /v1/karaoke — Stelline 노래방 번호 (공식 MUSIC에 없는 곡 포함, songId = 매칭된 공식 게시물 id)
if (stKaraoke) {
  const { matchKaraoke } = await import('./karaoke.ts');
  const slugOf = new Map(members.map((m) => [m.nameKo, m.slug]));
  const matched = matchKaraoke(songs, members, stKaraoke.data.songs);
  await emit('karaoke', {
    ...STELLINE,
    fetchedAt: stKaraoke.fetchedAt,
    updatedAt: stKaraoke.data.updatedAt ?? null,
    songs: stKaraoke.data.songs.map((k: any) => ({
      songId: matched.get(k) ?? null,
      title: k.title, titleAlt: k.titleAlt || null, artist: k.artist,
      members: k.members.map((n: string) => slugOf.get(n) ?? n),
      section: k.section, category: k.category, tj: k.tj || null, ky: k.ky || null,
    })),
  });
}

// /v1/stelline — Stelline 노출 점검 결과 (최근 회차 실패 · 7일 내 실패 · cover로만 노출)
if (stNs) {
  const songIdOf = new Map(songs.map((s) => [s.youtubeId, s.id]));
  const row = (x: any) => ({ songId: songIdOf.get(x.video_id) ?? null, youtubeId: x.video_id, query: x.query, ...(x.fallback_query ? { fallbackQuery: x.fallback_query } : {}), ...(x.searched_time ? { checkedAt: isoSec(x.searched_time) } : {}) });
  await emit('stelline', {
    ...STELLINE,
    fetchedAt: stNs.fetchedAt,
    roundCheckedAt: isoSec(stNs.data.searched_time),
    note: 'notFound는 최근 회차에 확인해 실패한 곡만 담습니다. 목록에 없다고 정상이라는 뜻은 아닙니다 (회차마다 일부 곡만 점검).',
    notFound: stNs.data.all_songs.map(row),
    coverOnly: stNs.data.cover_matches.map(row),
    recentNotFound: stNs.data.recent.map(row),
  });
}

// /v1 — 엔드포인트 안내
await emit('index', {
  name: 'StellaAPI (unofficial)',
  ...metaBody,
  endpoints: {
    '/v1/meta': '갱신 시각·건수',
    '/v1/songs': '전체 곡 (공식 MUSIC + 가용성 + 검색 노출 + 노래방 번호 + Stelline 노출 점검)',
    '/v1/songs/{id}': '곡 1개 + 검색 노출 이력',
    '/v1/members': '멤버 목록 + 곡 수',
    '/v1/members/{slug}': '멤버 1명 + 참여 곡',
    '/v1/channels': '멤버별 YouTube 채널·치지직',
    '/v1/search/hidden': '검색 노출 문제 곡 (hidden → suspected → cover_only)',
    '/v1/stats/latest': '최신 조회수·좋아요·댓글 (+전일 대비), 채널 구독자, 치지직 팔로워',
    '/v1/stats/songs/{id}': '곡별 일별 조회수 추이',
    '/v1/karaoke': '노래방 TJ·금영 번호 (출처: Stelline)',
    '/v1/stelline': 'Stelline 자체 노출 점검 결과 (출처: Stelline)',
  },
  memberSlugs: members.map((m) => m.slug),
});

console.log(`public/v1 · ${files}개 파일 · 곡 ${songs.length} · 멤버 ${members.length} · 통계 ${stats.length}일`);
