// 원곡자 표기 정규화: 『』 안 표기를 분리하고 대표 표기로 통일
// 새 표기가 생기면 ALIASES에 추가 (validate.ts가 미등록 후보를 출력)

const ALIASES: Record<string, string> = {
  // 일본
  'Kenshi Yonezu': '米津玄師',
  Yorushika: 'ヨルシカ',
  Yuika: 'ユイカ',
  REOL: 'Reol',
  ryo: 'ryo (supercell)',
  'ryo(supercell)': 'ryo (supercell)',
  'ピノキオピ': 'ピノキオピー',
  '결속 밴드 (結束バンド)': '結束バンド',
  'Seiko Matsuda': '松田聖子',
  'Sakamoto Maaya': '坂本真綾',
  '시이나 링고': '椎名林檎',
  '마후마후': 'まふまふ',
  '마유즈미 후유코': '黛冬優子',
  'Fujii kaze': '藤井風',
  'Harumaki Gohan': 'はるまきごはん',
  SAYURI: 'さユり',
  'Natsushiro Takaaki': '夏代孝明',
  // 한국
  '아이유': 'IU',
  '아이유(IU)': 'IU',
  '원필(DAY6)': '원필',
  '지코 (ZICO)': 'ZICO',
  '페노메코 (PENOMECO)': 'PENOMECO',
  '키노시타(kinoshita)': 'kinoshita',
  'DAYOUNG(다영)': '다영',
  'Miiro(미로)': 'Miiro',
  'I-DLE': 'i-dle',
  // 작품(OST·게임)
  '명조': '명조: 워더링 웨이브',
};

/** 콜라보 표기 분리: 「DECO*27・ピノキオピー」「ROSÉ & Bruno Mars」「A × B」「A, B」「A / B」 */
export function splitSource(source: string | null): string[] {
  if (!source) return [];
  const raw = source.replace(/[​-‍﻿]/g, '').trim();
  if (ALIASES[raw]) return [ALIASES[raw]];
  return [
    ...new Set(
      raw
        .split(/\s*[・×]\s*|\s+[x&]\s+|\s*,\s*|\s+\/\s+|&(?=[A-Z])/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => ALIASES[s] ?? s),
    ),
  ];
}

export const KNOWN_ALIASES = ALIASES;
