// 멤버·유닛 마스터 데이터 (stellive.me/talents 기준, 2026-11-01)
export type Unit = 'MYSTIC' | 'EVERYS' | 'UNIVERSE' | 'CLICHE' | 'ABYSS';

export interface Member {
  slug: string;
  nameKo: string;
  nameEn: string;
  nameJa: string;
  unit: Unit;
  generation: number;
  birthday: string; // MM-DD
  debut: string; // YYYY-MM(-DD)
  graduated?: string;
}

export const MEMBERS: Member[] = [
  { slug: 'kanna', nameKo: '아이리 칸나', nameEn: 'Airi Kanna', nameJa: '藍璃かんな', unit: 'MYSTIC', generation: 1, birthday: '', debut: '2023-01', graduated: '2024-12' },
  { slug: 'yuni', nameKo: '아야츠노 유니', nameEn: 'Ayatsuno Yuni', nameJa: '純角ユニ', unit: 'EVERYS', generation: 1, birthday: '05-21', debut: '2023-01' },
  { slug: 'huya', nameKo: '사키하네 후야', nameEn: 'Sakihane Huya', nameJa: '咲羽風夜', unit: 'EVERYS', generation: 1, birthday: '07-07', debut: '2025-09' },
  { slug: 'hina', nameKo: '시라유키 히나', nameEn: 'Shirayuki Hina', nameJa: '白雪ひな', unit: 'UNIVERSE', generation: 2, birthday: '01-05', debut: '2023-06' },
  { slug: 'mashiro', nameKo: '네네코 마시로', nameEn: 'Neneko Mashiro', nameJa: 'ねねこましろ', unit: 'UNIVERSE', generation: 2, birthday: '02-22', debut: '2023-06' },
  { slug: 'lize', nameKo: '아카네 리제', nameEn: 'Akane Lize', nameJa: '朱音リゼ', unit: 'UNIVERSE', generation: 2, birthday: '10-01', debut: '2023-06' },
  { slug: 'tabi', nameKo: '아라하시 타비', nameEn: 'Arahashi Tabi', nameJa: '荒波子タビ', unit: 'UNIVERSE', generation: 2, birthday: '09-07', debut: '2023-06' },
  { slug: 'shibuki', nameKo: '텐코 시부키', nameEn: 'Tenko Shibuki', nameJa: '天狐紫吹', unit: 'CLICHE', generation: 3, birthday: '03-21', debut: '2024-05-18' },
  { slug: 'rin', nameKo: '아오쿠모 린', nameEn: 'Aokumo Rin', nameJa: '青雲凛', unit: 'CLICHE', generation: 3, birthday: '05-03', debut: '2024-05-18' },
  { slug: 'nana', nameKo: '하나코 나나', nameEn: 'Hanako Nana', nameJa: '花子ナナ', unit: 'CLICHE', generation: 3, birthday: '08-07', debut: '2024-05-18' },
  { slug: 'riko', nameKo: '유즈하 리코', nameEn: 'Yuzuha Riko', nameJa: '柚葉莉子', unit: 'CLICHE', generation: 3, birthday: '04-13', debut: '2024-05-18' },
  { slug: 'toa', nameKo: '시즈키 토아', nameEn: 'Shizuki Toa', nameJa: '紫月トア', unit: 'ABYSS', generation: 4, birthday: '11-22', debut: '2026-10-17' },
  { slug: 'rang', nameKo: '코가네 랑', nameEn: 'Cogane Rang', nameJa: '琥金朗', unit: 'ABYSS', generation: 4, birthday: '08-22', debut: '2026-10-17' },
  { slug: 'hiyori', nameKo: '하나요 히요리', nameEn: 'Hanayo Hiyori', nameJa: '花音妃世璃', unit: 'ABYSS', generation: 4, birthday: '03-31', debut: '2026-10-18' },
  { slug: 'mary', nameKo: '토키노 메리', nameEn: 'Tokino Mary', nameJa: '常乃メリ', unit: 'ABYSS', generation: 4, birthday: '06-13', debut: '2026-10-18' },
];

// 유닛 → 멤버 (해당 유닛 명의 곡 발매 시점 기준 구성)
export const UNIT_MEMBERS: Record<Unit, string[]> = {
  MYSTIC: ['kanna', 'yuni'],
  EVERYS: ['yuni', 'huya'],
  UNIVERSE: ['hina', 'mashiro', 'lize', 'tabi'],
  CLICHE: ['shibuki', 'rin', 'nana', 'riko'],
  ABYSS: ['toa', 'rang', 'hiyori', 'mary'],
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9가-힣]/g, '');

const UNIT_ALIASES: Record<string, Unit> = {
  mystic: 'MYSTIC',
  everys: 'EVERYS',
  universe: 'UNIVERSE',
  cliche: 'CLICHE',
  abyss: 'ABYSS',
};

const GROUP_ALIASES = new Set(['stellive', '스텔라이브']);

const MEMBER_INDEX = new Map<string, string>();
for (const m of MEMBERS) {
  MEMBER_INDEX.set(norm(m.nameEn), m.slug);
  MEMBER_INDEX.set(norm(m.nameKo), m.slug);
  MEMBER_INDEX.set(norm(m.nameJa), m.slug);
}

export interface ResolvedArtists {
  members: string[]; // 멤버 slug (유닛 전개 포함)
  units: Unit[];
  group: boolean; // 'STELLIVE' 전체 명의
  guests: string[]; // 외부 아티스트
}

/** "Hanako Nana x Shirayuki Hina", "Mystic & Universe", "Airi Kanna & VESPERBELL 요미" 등을 해석 */
export function resolveArtists(raw: string): ResolvedArtists {
  const parts = raw
    .split(/\s+(?:x|X|×|&|,)\s+|\s*,\s*|\s*&\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const members = new Set<string>();
  const units = new Set<Unit>();
  const guests: string[] = [];
  let group = false;
  for (const p of parts) {
    const k = norm(p);
    if (GROUP_ALIASES.has(k)) { group = true; continue; }
    const unit = UNIT_ALIASES[k];
    if (unit) { units.add(unit); UNIT_MEMBERS[unit].forEach((s) => members.add(s)); continue; }
    const slug = MEMBER_INDEX.get(k);
    if (slug) { members.add(slug); continue; }
    guests.push(p);
  }
  return { members: [...members], units: [...units], group, guests };
}
