/** 수집 결과 검증: node --experimental-strip-types src/validate.ts */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA = join(import.meta.dirname, '..', 'data');
const tracks: any[] = JSON.parse(await readFile(join(DATA, 'tracks.json'), 'utf8'));
const meta = JSON.parse(await readFile(join(DATA, 'meta.json'), 'utf8'));

const issues: string[] = [];
const check = (name: string, rows: any[], fmt: (t: any) => string) => {
  console.log(`- ${name}: ${rows.length}`);
  rows.slice(0, 15).forEach((t) => console.log(`    ${fmt(t)}`));
  if (rows.length) issues.push(name);
};
const show = (t: any) => `#${t.id} ${t.title} | ${t.singer}`;

console.log(`목록 ${meta.listCount} / 수집 ${meta.trackCount}`);
if (meta.listCount !== meta.trackCount) issues.push('건수 불일치');

const ids = tracks.map((t) => t.id);
check('중복 id', tracks.filter((t, i) => ids.indexOf(t.id) !== i), show);
const yts = tracks.filter((t) => t.youtubeId).map((t) => t.youtubeId);
check('중복 youtubeId', tracks.filter((t) => t.youtubeId && yts.indexOf(t.youtubeId) !== yts.lastIndexOf(t.youtubeId)), (t) => `${show(t)} → ${t.youtubeId}`);
check('youtubeId 없음', tracks.filter((t) => !t.youtubeId), show);
check('날짜 없음', tracks.filter((t) => !t.date), show);
check('멤버 미해석(멤버·유닛·그룹 모두 없음)', tracks.filter((t) => !t.members.length && !t.group), show);
check('외부 게스트 포함', tracks.filter((t) => t.guests.length), (t) => `${show(t)} → ${t.guests.join(', ')}`);
check('커버인데 원곡자(source) 없음', tracks.filter((t) => t.kind === 'cover' && !t.source && !t.isMedley), show);

const byKind = tracks.reduce((a, t) => ((a[t.kind] = (a[t.kind] ?? 0) + 1), a), {} as Record<string, number>);
console.log('\n종류별', byKind);
const byYear = tracks.reduce((a, t) => ((a[t.date?.slice(0, 4) ?? '?'] = (a[t.date?.slice(0, 4) ?? '?'] ?? 0) + 1), a), {} as Record<string, number>);
console.log('연도별', byYear);
const byMember: Record<string, number> = {};
tracks.forEach((t) => t.members.forEach((m: string) => (byMember[m] = (byMember[m] ?? 0) + 1)));
console.log('멤버별 참여곡', Object.fromEntries(Object.entries(byMember).sort((a, b) => b[1] - a[1])));
const art: Record<string, number> = {};
tracks.forEach((t) => (t.sourceArtists ?? []).forEach((a: string) => (art[a] = (art[a] ?? 0) + 1)));
console.log('원곡자 TOP 10', Object.entries(art).sort((a, b) => b[1] - a[1]).slice(0, 10));
// 정규화 누락 후보: 소문자·공백·괄호 제거 시 같아지는 표기
const keyOf = (s: string) => s.toLowerCase().replace(/\(.*?\)|[\s.\-_]/g, '');
const groups: Record<string, string[]> = {};
Object.keys(art).forEach((a) => (groups[keyOf(a)] ??= []).push(a));
check('원곡자 표기 중복 후보', Object.values(groups).filter((g) => g.length > 1), (g) => g.join(' / '));

console.log(`\n주의 항목: ${issues.length ? issues.join(', ') : '없음'}`);

// ── 병합 결과 (npm run build 이후) ──
const songsPath = join(DATA, 'songs.json');
if (existsSync(songsPath)) {
  const songs: any[] = JSON.parse(await readFile(songsPath, 'utf8'));
  const av = songs.filter((s) => s.availability);
  if (av.length) {
    console.log('\n[가용성]');
    check('YouTube 조회 불가(삭제·비공개)', av.filter((s) => !s.availability.available), show);
    check('임베드 차단 (웹 플레이어 재생 불가)', av.filter((s) => s.availability.embeddable === false), show);
    check('연령 제한 (로그아웃·시크릿 재생 불가)', av.filter((s) => s.availability.ageRestricted), show);
    check('한국 지역 차단', av.filter((s) => s.availability.regionBlockedKR), show);
    check('일부공개(unlisted)', av.filter((s) => s.availability.privacy === 'unlisted'), show);
  }
  const se = songs.filter((s) => s.search);
  if (se.length) {
    console.log(`\n[검색 노출] 점검 ${se.length}/${songs.length}`);
    const q = (s: any) => `${show(s)} → "${s.search.query}"`;
    check('검색 미노출 확정 (2회 연속, cover 붙여도 없음)', se.filter((s) => s.search.status === 'hidden'), q);
    check('미노출 의심 (1회, 다음 실행 재확인)', se.filter((s) => s.search.status === 'suspected'), q);
    check('cover 붙여야 노출', se.filter((s) => s.search.status === 'cover_only'), q);
    check('점검 오류', se.filter((s) => s.search.status === 'error'), q);
    // 판정 기준이 다름(StellaAPI 첫 페이지 / Stelline 상위 3개) — 차이는 검색어·측정 오류 점검용
    const st = (s: any) => s.stelline?.status;
    check('Stelline과 판정 다름 (우리 visible · Stelline 최근 실패)', se.filter((s) => s.search.status === 'visible' && st(s) === 'not_found'), q);
    check('Stelline 검색어 없음 (자동 생성 검색어 사용)', songs.filter((s) => s.search && !s.stelline), q);
  }
  check('노래방 목록 미매칭 공식 곡 (Stelline에 없거나 매칭 실패)', songs.filter((s) => s.karaoke === null && !s.isMedley), show);
}
const chPath = join(DATA, 'youtube', 'channels.json');
if (existsSync(chPath)) {
  const channels: any[] = JSON.parse(await readFile(chPath, 'utf8'));
  console.log('\n[채널 검증] owner ↔ 채널명 (육안 확인)');
  channels.forEach((c) => console.log(`    ${c.owner.padEnd(9)} ${c.channelId} ${c.title} | 구독 ${c.subscribers?.toLocaleString() ?? '비공개'}`));
}
