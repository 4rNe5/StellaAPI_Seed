/**
 * YouTube·치지직 수집 단계 (collect.ts 이후 실행)
 * 사용: npm run youtube   (.env 에 YT_API_KEY 필요)
 *  1) channels.list   채널 통계 + 업로드 재생목록          ~1 unit
 *  2) playlistItems   채널별 업로드 목록 (증분)            1 unit / 50개
 *  3) videos.list     공식 곡 ∪ 업로드 전체 통계·가용성    1 unit / 50개
 *  4) 치지직           팔로워·라이브 여부 (비공식 엔드포인트)
 *  출력: data/youtube/{channels,videos,candidates,uploads}.json, data/chzzk.json, data/stats/YYYY-MM-DD.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CHANNELS } from './channels.ts';

const KEY = process.env.YT_API_KEY;
if (!KEY) {
  console.error('YT_API_KEY가 없습니다. .env 파일에 YT_API_KEY=... 를 넣어주세요 (.env.example 참고)');
  process.exit(2);
}
const DATA = join(import.meta.dirname, '..', 'data');
const YT_DIR = join(DATA, 'youtube');
const API = 'https://www.googleapis.com/youtube/v3';
let quota = 0;

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const readJson = async <T,>(p: string, fallback: T): Promise<T> => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : fallback);
const num = (s?: string) => (s == null ? null : Number(s));

async function yt(path: string, params: Record<string, string>): Promise<any> {
  const url = `${API}/${path}?${new URLSearchParams({ ...params, key: KEY! })}`;
  for (let i = 1; ; i++) {
    const res = await fetch(url);
    quota += 1;
    if (res.ok) return res.json();
    const body = await res.text();
    if (res.status === 403 && /quotaExceeded/.test(body)) throw new Error('YouTube API 일일 쿼터 초과');
    if (i >= 3 || (res.status >= 400 && res.status < 500)) throw new Error(`${path} HTTP ${res.status}: ${body.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 1000 * i));
  }
}

/** ISO8601 PT#H#M#S → 초 */
const durationSec = (iso?: string) => {
  const m = iso?.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + (+(m[4] ?? 0)) : null;
};

const SONG_TITLE = /cover|커버|歌ってみた|カバー|original|오리지널|\bM\/?V\b|『.+』|「.+」|official/i;

async function main() {
  await mkdir(YT_DIR, { recursive: true });
  await mkdir(join(DATA, 'stats'), { recursive: true });
  const tracks: any[] = await readJson(join(DATA, 'tracks.json'), []);
  if (!tracks.length) throw new Error('data/tracks.json 없음 — npm run collect 먼저 실행');

  // 1) 채널
  console.log('[1/4] 채널');
  const owners = new Map(CHANNELS.flatMap((c) => c.youtube.map((id) => [id, c.owner] as const)));
  const chRes = await yt('channels', { part: 'snippet,statistics,contentDetails', id: [...owners.keys()].join(','), maxResults: '50' });
  const channels = (chRes.items ?? []).map((c: any) => ({
    channelId: c.id,
    owner: owners.get(c.id),
    title: c.snippet.title,
    handle: c.snippet.customUrl ?? null,
    subscribers: c.statistics.hiddenSubscriberCount ? null : num(c.statistics.subscriberCount),
    views: num(c.statistics.viewCount),
    videoCount: num(c.statistics.videoCount),
    uploads: c.contentDetails.relatedPlaylists.uploads,
  }));
  const missingCh = [...owners.keys()].filter((id) => !channels.some((c: any) => c.channelId === id));
  if (missingCh.length) console.warn(`  조회 안 된 채널: ${missingCh.join(', ')}`);
  console.log(`  ${channels.length}/${owners.size}개 채널`);

  // 2) 업로드 목록 (증분: 이미 아는 영상만 나오는 페이지에서 중단)
  console.log('[2/4] 업로드 목록');
  const uploadsPath = join(YT_DIR, 'uploads.json');
  const uploads: Record<string, string[]> = await readJson(uploadsPath, {});
  for (const ch of channels) {
    const known = new Set(uploads[ch.channelId] ?? []);
    const fresh: string[] = [];
    let pageToken = '';
    try {
      do {
        const r = await yt('playlistItems', { part: 'contentDetails', playlistId: ch.uploads, maxResults: '50', ...(pageToken && { pageToken }) });
        const ids: string[] = r.items.map((i: any) => i.contentDetails.videoId);
        const newIds = ids.filter((id) => !known.has(id));
        fresh.push(...newIds);
        pageToken = known.size && newIds.length < ids.length ? '' : r.nextPageToken ?? '';
      } while (pageToken);
    } catch (e) {
      // 업로드가 없거나 비공개인 채널은 업로드 재생목록이 404 → 건너뜀
      if (!/HTTP 404/.test((e as Error).message)) throw e;
      console.warn(`  ${ch.title}: 업로드 목록 없음 (404) — 건너뜀`);
    }
    uploads[ch.channelId] = [...new Set([...fresh, ...known])];
    console.log(`  ${ch.title}: ${uploads[ch.channelId].length}개 (+${fresh.length})`);
  }
  await writeFile(uploadsPath, JSON.stringify(uploads));

  // 3) 영상 상세
  console.log('[3/4] 영상 통계·가용성');
  const officialByYt = new Map(tracks.filter((t) => t.youtubeId).map((t) => [t.youtubeId, t]));
  const channelOwner = new Map(channels.map((c: any) => [c.channelId, c.owner]));
  const allIds = [...new Set([...officialByYt.keys(), ...Object.values(uploads).flat()])];
  const items: any[] = [];
  for (const ids of chunk(allIds, 50)) {
    const r = await yt('videos', { part: 'snippet,contentDetails,status,statistics,liveStreamingDetails', id: ids.join(','), maxResults: '50' });
    items.push(...r.items);
  }
  const byId = new Map(items.map((v) => [v.id, v]));
  const videos = allIds.map((id) => {
    const v = byId.get(id);
    const official = officialByYt.get(id);
    if (!v) return { id, available: false, inOfficial: !!official, officialId: official?.id ?? null };
    const rr = v.contentDetails.regionRestriction;
    const dur = durationSec(v.contentDetails.duration);
    const wasLive = !!v.liveStreamingDetails;
    return {
      id,
      available: true,
      channelId: v.snippet.channelId,
      owner: channelOwner.get(v.snippet.channelId) ?? null, // null = 외부 채널 업로드
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt,
      durationSec: dur,
      views: num(v.statistics.viewCount),
      likes: num(v.statistics.likeCount),
      comments: num(v.statistics.commentCount),
      privacy: v.status.privacyStatus, // public | unlisted
      embeddable: v.status.embeddable,
      madeForKids: v.status.madeForKids ?? false,
      ageRestricted: v.contentDetails.contentRating?.ytRating === 'ytAgeRestricted', // 로그아웃·시크릿 재생 불가
      regionBlockedKR: rr ? (rr.blocked?.includes('KR') ?? false) || (rr.allowed ? !rr.allowed.includes('KR') : false) : false,
      liveContent: v.snippet.liveBroadcastContent, // none | live | upcoming
      wasLive,
      liveStartedAt: v.liveStreamingDetails?.actualStartTime ?? null,
      inOfficial: !!official,
      officialId: official?.id ?? null,
      songCandidate: !!official || (!wasLive && dur != null && dur >= 60 && dur <= 720 && SONG_TITLE.test(v.snippet.title)),
    };
  });
  await writeFile(join(YT_DIR, 'channels.json'), JSON.stringify(channels, null, 2));
  await writeFile(join(YT_DIR, 'videos.json'), JSON.stringify(videos, null, 2));
  console.log(`  ${videos.length}개 (조회 불가 ${videos.filter((v) => !v.available).length})`);

  // 4) 치지직
  console.log('[4/4] 치지직');
  const chzzk = [];
  for (const c of CHANNELS.filter((c) => c.chzzk)) {
    try {
      const r = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${c.chzzk}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
      const j: any = await r.json();
      chzzk.push({ owner: c.owner, channelId: c.chzzk, name: j.content?.channelName ?? null, followers: j.content?.followerCount ?? null, live: j.content?.openLive ?? null });
    } catch (e) {
      chzzk.push({ owner: c.owner, channelId: c.chzzk, name: null, followers: null, live: null, error: (e as Error).message });
    }
  }
  await writeFile(join(DATA, 'chzzk.json'), JSON.stringify(chzzk, null, 2));

  // 공식 목록에 없는 곡 후보 (미검증, 검수용)
  await writeFile(join(YT_DIR, 'candidates.json'), JSON.stringify(videos.filter((v) => v.songCandidate && !v.inOfficial), null, 2));

  // 일별 스냅샷 (조회수 추이·마일스톤 계산용)
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // KST
  await writeFile(
    join(DATA, 'stats', `${day}.json`),
    JSON.stringify({
      at: new Date().toISOString(),
      videos: Object.fromEntries(videos.filter((v) => v.available && v.songCandidate).map((v) => [v.id, [v.views, v.likes, v.comments]])),
      channels: Object.fromEntries(channels.map((c: any) => [c.channelId, [c.subscribers, c.views, c.videoCount]])),
      chzzk: Object.fromEntries(chzzk.map((c) => [c.owner, c.followers])),
    }),
  );
  console.log(`완료: 영상 ${videos.length} · 곡 후보(공식 외) ${videos.filter((v) => v.songCandidate && !v.inOfficial).length} · 스냅샷 stats/${day}.json · API 사용 ${quota} units`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
