/**
 * 곡 데이터 병합: tracks.json + 가용성(youtube/videos.json) + 검색 노출(search.json) → data/songs.json
 * 조회수·채널·치지직 등 통계는 songs.json에 넣지 않음 (youtube/, chzzk.json, stats/ 에서 별도 관리)
 * Stelline(data/stelline, 운영자 허가): 노래방 번호(karaoke), Stelline 자체 노출 점검(stelline)
 */
import { matchKaraoke, type KaraokeSong } from './karaoke.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(import.meta.dirname, '..', 'data');
const read = async (p: string, fb: any) => (existsSync(join(DATA, p)) ? JSON.parse(await readFile(join(DATA, p), 'utf8')) : fb);

const tracks: any[] = await read('tracks.json', []);
const videos: any[] = await read('youtube/videos.json', []);
const search: Record<string, any> = await read('search.json', {});
const vById = new Map(videos.map((v) => [v.id, v]));
// youtube 단계가 이번에 실패·생략돼 videos.json이 없으면 직전 songs.json의 가용성을 유지
const prevSongs: any[] = await read('songs.json', []);
const prevAvail = new Map(prevSongs.map((s) => [s.id, s.availability]));

// Stelline: 노래방 번호 (제목+멤버 매칭) / 노출 점검 (영상 ID 매칭)
const members: any[] = await read('members.json', []);
const kara = await read('stelline/karaoke.json', null);
const karaokeSongs: KaraokeSong[] = kara?.data?.songs ?? [];
const karaokeBySong = new Map<number, any>();
for (const [k, id] of matchKaraoke(tracks, members, karaokeSongs)) {
  if (id == null || (karaokeBySong.has(id) && !(k.tj || k.ky))) continue;
  karaokeBySong.set(id, { tj: k.tj || null, ky: k.ky || null });
}
const iso = (sec: number | undefined) => (sec ? new Date(sec * 1000).toISOString() : null);
const stQ = new Map<string, string>((await read('stelline/search-songs.json', null))?.data?.map((x: any) => [x.video_id, x.query]) ?? []);
const ns = (await read('stelline/not-searched.json', null))?.data;
const stNotFound = new Set<string>(ns?.all_songs?.map((x: any) => x.video_id) ?? []);
const stCoverOnly = new Set<string>(ns?.cover_matches?.map((x: any) => x.video_id) ?? []);
const stRecent = new Map<string, number>();
for (const x of ns?.recent ?? []) stRecent.set(x.video_id, Math.max(stRecent.get(x.video_id) ?? 0, x.searched_time));

const songs = tracks.map((t) => {
  const v = vById.get(t.youtubeId);
  const s = search[t.id];
  return {
    ...t,
    availability: v
      ? { available: v.available, embeddable: v.embeddable ?? null, ageRestricted: v.ageRestricted ?? null, regionBlockedKR: v.regionBlockedKR ?? null, privacy: v.privacy ?? null }
      : prevAvail.get(t.id) ?? null, // youtube 단계 미실행 → 직전 값
    search: s
      ? {
          // 영상 자체가 삭제·비공개면 검색 노출 판정은 의미 없음
          status: v && !v.available ? 'unavailable' : s.status,
          rank: s.rank, fallbackRank: s.fallbackRank, noResults: s.noResults ?? false, query: s.query, source: s.source ?? null, checkedAt: s.checkedAt,
        }
      : null, // search 단계 미실행 또는 메들리
    // TJ·금영 번호. null = Stelline 노래방 목록에서 못 찾음, 번호 null = 노래방에 없거나 미입력
    karaoke: karaokeBySong.get(t.id) ?? null,
    // Stelline 자체 점검(YouTube 검색 상위 3개 안). status null = 최근 회차 실패 목록에 없음 (정상 보장 아님)
    stelline: stQ.has(t.youtubeId)
      ? {
          query: stQ.get(t.youtubeId),
          status: stNotFound.has(t.youtubeId) ? 'not_found' : stCoverOnly.has(t.youtubeId) ? 'cover_only' : null,
          lastNotFoundAt: iso(stRecent.get(t.youtubeId)),
          roundCheckedAt: iso(ns?.searched_time),
        }
      : null,
  };
});
await writeFile(join(DATA, 'songs.json'), JSON.stringify(songs, null, 2));
console.log(`songs.json ${songs.length}곡 · 가용성 ${songs.filter((s) => s.availability).length} · 검색 ${songs.filter((s) => s.search).length} · 노래방 ${songs.filter((s) => s.karaoke).length} · Stelline ${songs.filter((s) => s.stelline).length}`);
