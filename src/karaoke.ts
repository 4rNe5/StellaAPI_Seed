/**
 * Stelline 노래방 곡(TJ·금영 번호) ↔ 공식 MUSIC 게시물 매칭
 * Stelline 노래방 데이터에는 영상 ID가 없어 제목 + 참여 멤버로 맞춤
 *   1) 제목(괄호 앞·괄호 안 각각) 정규화 일치 + 멤버 구성 일치(또는 STELLIVE 전체 명의) → 1건이면 확정
 *   2) 멤버가 안 맞아도 제목 후보가 1건뿐이면 확정
 *   3) 그 외(후보 0건·여러 건)는 미매칭 — KARAOKE_OVERRIDES로 수동 지정
 */

/** Stelline 노래방 제목(원문 그대로) → 공식 게시물 id. null = 공식 MUSIC에 없는 곡으로 확정 */
export const KARAOKE_OVERRIDES: Record<string, number | null> = {
  '최종화(Acoustic Ver.) (最終花)': 1837,
  '최종화 (最終花)': 498,
  '내꺼 하는 법': 482, // 1838은 Aiobahn Remix
};

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
function keys(title: string | null | undefined): string[] {
  const s = title ?? '';
  const out = new Set([norm(s)]);
  const m = s.match(/^(.*?)\s*[(（](.*)[)）]\s*$/); // "한글 (原題)" → 각각
  if (m) { out.add(norm(m[1])); out.add(norm(m[2])); }
  out.delete('');
  return [...out];
}

export type KaraokeSong = { id: number; title: string; titleAlt: string; artist: string; members: string[]; section: string; category: string; tj: string; ky: string };

export function matchKaraoke(tracks: any[], members: { slug: string; nameKo: string }[], karaoke: KaraokeSong[]) {
  const slugOf = new Map(members.map((m) => [m.nameKo, m.slug]));
  const byKey = new Map<string, any[]>();
  for (const t of tracks)
    for (const k of new Set([...keys(t.titleKo), ...keys(t.titleOriginal), ...keys(t.title)])) byKey.set(k, [...(byKey.get(k) ?? []), t]);

  const songIdOf = new Map<KaraokeSong, number | null>();
  for (const k of karaoke) {
    if (k.title in KARAOKE_OVERRIDES) { songIdOf.set(k, KARAOKE_OVERRIDES[k.title]); continue; }
    const cands = [...new Map([...keys(k.title), ...keys(k.titleAlt)].flatMap((key) => byKey.get(key) ?? []).map((t) => [t.id, t])).values()];
    const want = new Set(k.members.map((n) => slugOf.get(n) ?? n));
    const exact = cands.filter((t) => t.group || (t.members.length === want.size && t.members.every((m: string) => want.has(m))));
    songIdOf.set(k, exact.length === 1 ? exact[0].id : exact.length === 0 && cands.length === 1 ? cands[0].id : null);
  }
  return songIdOf;
}
