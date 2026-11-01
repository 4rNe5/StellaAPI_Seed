/**
 * 곡 데이터 병합: tracks.json + 가용성(youtube/videos.json) + 검색 노출(search.json) → data/songs.json
 * 조회수·채널·치지직 등 통계는 songs.json에 넣지 않음 (youtube/, chzzk.json, stats/ 에서 별도 관리)
 */
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
          rank: s.rank, fallbackRank: s.fallbackRank, noResults: s.noResults ?? false, query: s.query, checkedAt: s.checkedAt,
        }
      : null, // search 단계 미실행 또는 메들리
  };
});
await writeFile(join(DATA, 'songs.json'), JSON.stringify(songs, null, 2));
console.log(`songs.json ${songs.length}곡 · 가용성 ${songs.filter((s) => s.availability).length} · 검색 ${songs.filter((s) => s.search).length}`);
