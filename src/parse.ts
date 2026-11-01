import * as cheerio from 'cheerio';

export const BASE = 'https://stellive.me';

export interface ListItem {
  id: number;
  label: string; // 목록 카테고리 라벨 (멤버명 / 스텔라이브 / EP / SINGLE / COVER / OTHERS / [졸업생] …)
  title: string;
  singer: string;
}

export interface Detail {
  id: number;
  title: string;
  category: string;
  categoryId: number | null;
  singer: string;
  date: string | null; // YYYY-MM-DD
  youtubeId: string | null;
}

const clean = (s: string) => s.replace(/ /g, ' ').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();

export function parseList(html: string): ListItem[] {
  const $ = cheerio.load(html);
  const items: ListItem[] = [];
  $('.gallery_wrap .bh_item').each((_, el) => {
    const $el = $(el);
    const href = $el.find('.bh_title a').attr('href') ?? '';
    const id = Number(href.match(/\/music\/(\d+)/)?.[1]);
    if (!id) return;
    items.push({
      id,
      label: clean($el.find('.category span').first().text()),
      title: clean($el.find('.bh_title').text()),
      singer: clean($el.find('.name').first().text()),
    });
  });
  return items;
}

export function parseDetail(id: number, html: string): Detail {
  const $ = cheerio.load(html);
  const catEl = $('.content_header a.category').first();
  const catId = catEl.attr('href')?.match(/category\/(\d+)/)?.[1];
  let singer = '';
  let date: string | null = null;
  $('table.extra tr').each((_, tr) => {
    const th = clean($(tr).find('th').text());
    const td = clean($(tr).find('td').text());
    if (th === '가수이름') singer = td;
    if (th === '날짜') {
      const m = td.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      if (m) date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
  });
  const body = $('.content_body').html() ?? '';
  const yt =
    body.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/)?.[1] ??
    body.match(/img\.youtube\.com\/vi\/([\w-]{11})\//)?.[1] ??
    body.match(/youtu\.be\/([\w-]{11})/)?.[1] ??
    body.match(/[?&]v=([\w-]{11})/)?.[1] ??
    null;
  return {
    id,
    title: clean($('.content_header h1').text()),
    category: clean(catEl.text()),
    categoryId: catId ? Number(catId) : null,
    singer,
    date,
    youtubeId: yt,
  };
}

export type Kind = 'cover' | 'original';

export interface ParsedTitle {
  kind: Kind;
  isMedley: boolean;
  titleKo: string; // 표시 제목
  titleOriginal: string | null; // 괄호 안 원제
  source: string | null; // 『』 안: 원곡자(커버) 또는 앨범/출처(오리지널)
}

const ORIGINAL_CATEGORIES = new Set(['EP', 'SINGLE', 'ALBUM']);

/** 『』 밖 제목에서 마지막 괄호를 원제로 분리 */
function splitTitle(t: string): { ko: string; orig: string | null } {
  const m = t.match(/^(.*?)\s*[(（]([^()（）]+)[)）]\s*$/);
  if (m && m[1]) return { ko: m[1].trim(), orig: m[2].trim() };
  return { ko: t.trim(), orig: null };
}

export function parseTitle(title: string, category: string): ParsedTitle {
  const isCover = /\bcover\b/i.test(title) || /메들리|medley|mashup/i.test(title);
  const isMedley = /메들리|medley|mashup|playlist/i.test(title);
  const kind: Kind = isCover && !ORIGINAL_CATEGORIES.has(category) ? 'cover' : 'original';

  let head = title;
  let source: string | null = null;
  const br = title.match(/^(.*?)\s*『\s*(.*?)\s*』/);
  if (br) {
    head = br[1];
    source = br[2] || null;
  } else {
    head = title.replace(/\s*\bcover\b\s*$/i, '');
    // 「스텔라이브 Universe '마음악보'」 형태: 따옴표 안을 제목으로
    const q = head.match(/['‘’]([^'‘’]+)['‘’]\s*$/);
    if (q) head = q[1];
  }
  const { ko, orig } = splitTitle(head);
  return { kind, isMedley, titleKo: ko, titleOriginal: orig, source };
}
