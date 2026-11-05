# StellaAPI

스텔라이브(STELLIVE) 공식 MUSIC 카탈로그를 매일 수집, **곡 정보 · YouTube 가용성 · 검색 노출 여부 · 조회수 추이**를 JSON API로 제공하는 팬 프로젝트입니다.

```
https://stella-api.vercel.app/v1
```

> [!IMPORTANT]
> **비공식 · 비상업 팬 프로젝트**입니다. 스텔라이브 및 소속 멤버와 관계가 없으며, 영리 목적으로 사용할 수 없습니다.
> 곡과 영상의 권리는 각 권리자에게 있습니다. 이 프로젝트는 음원·영상 파일을 수집하거나 제공하지 않고, 공개된 메타데이터와 YouTube 영상 ID만 다룹니다.

## 목차
- [빠른 시작](#빠른-시작)
- [이용 안내](#이용-안내)
- [엔드포인트](#엔드포인트)
- [데이터 필드](#데이터-필드)
- [수집 방식과 갱신 주기](#수집-방식과-갱신-주기)
- [알아둘 점](#알아둘-점)
- [직접 실행하기](#직접-실행하기)
- [운영](#운영)
- [크레딧 · 문의](#크레딧--문의)

## 빠른 시작
```js
const BASE = 'https://stella-api.vercel.app/v1';

const songs = await fetch(`${BASE}/songs`).then((r) => r.json());          // 전체 곡
const rin = await fetch(`${BASE}/members/rin`).then((r) => r.json());      // 멤버 1명 + 참여 곡
const hidden = await fetch(`${BASE}/search/hidden`).then((r) => r.json()); // 검색 노출 문제 곡
```
```bash
curl https://stella-api.vercel.app/v1/songs/14693
```
- 경로에 `.json`을 붙이지 않아도 되고, 붙여도 동작합니다.
- CORS가 허용(`*`)되어 있어 브라우저에서도 호출할 수 있습니다.
- 없는 경로·id는 `404`를 돌려줍니다.

## 이용 안내
이 API는 Vercel 무료 플랜(월 CDN 요청 100만 회)을 이용하여 운영됩니다.
**한도를 넘으면 최대 30일간 API 전체가 정지**되어 모든 이용자가 쓸 수 없게 됩니다.

- **서버에서 받아 캐시해서 쓰세요.** 데이터는 하루 3번 갱신되므로 하루 6-8시간 단위 캐시면 충분합니다.
- 방문자 브라우저에서 페이지를 열 때마다 **직접 호출하는 방식은 피해 주세요**.
- 전체가 필요하면 `/v1/songs` 한 번으로 받고, 곡마다 `/v1/songs/{id}`를 반복 호출하지 마세요.
- 응답 헤더: `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`

## 엔드포인트
| 경로 | 응답 | 내용 |
|---|---|---|
| `/v1` | object | 엔드포인트 목록, 갱신 시각, 건수 |
| `/v1/meta` | object | 소스별 갱신 시각(`sources`), 건수(`counts`) |
| `/v1/songs` | Song[] | 전체 곡 (최신순) |
| `/v1/songs/{id}` | Song + `searchHistory` | 곡 1개와 검색 노출 측정 이력. `id`는 공식 게시물 번호 |
| `/v1/members` | Member[] | 멤버 목록과 곡 수 (졸업 멤버 포함, `graduated` 표시) |
| `/v1/members/{slug}` | Member + `songs` | 멤버 1명과 참여 곡 (예: `riko`, `hina`, `mary`) |
| `/v1/channels` | Channel[] | 멤버별 YouTube 채널(구독자·총조회수·영상 수)과 치지직(팔로워·라이브 여부) |
| `/v1/search/hidden` | Song[] | 검색 노출에 문제가 있는 곡 (`hidden` → `suspected` → `cover_only` 순) |
| `/v1/stats/latest` | object | 최신 곡별 조회수·좋아요·댓글(+전일 대비 `viewsDelta1d`), 채널 구독자, 치지직 팔로워 |
| `/v1/stats/songs/{id}` | object | 곡별 일별 조회수·좋아요·댓글 추이(`series`) |
| `/v1/karaoke` | object | 노래방 TJ·금영 번호 전체 (`songs[]`, 공식 MUSIC에 없는 곡 포함, `songId`로 연결). 출처 [Stelline](#stelline-데이터) |
| `/v1/stelline` | object | Stelline 자체 노출 점검 결과 (`notFound` · `coverOnly` · `recentNotFound`). 출처 [Stelline](#stelline-데이터) |

## 데이터 필드
### Song
```json
{
  "id": 14693,
  "url": "https://stellive.me/music/14693",
  "title": "도쿄 테디베어(東京テディベア)『Neru』Cover",
  "kind": "cover",
  "isMedley": false,
  "titleKo": "도쿄 테디베어",
  "titleOriginal": "東京テディベア",
  "source": "Neru",
  "sourceArtists": ["Neru"],
  "date": "2026-10-16",
  "youtubeId": "rKQptWhAvO0",
  "singer": "Tokino Mary",
  "members": ["mary"],
  "units": [],
  "group": false,
  "guests": [],
  "label": "토키노 메리",
  "category": "토키노 메리",
  "categoryId": 14291,
  "availability": { "available": true, "embeddable": true, "ageRestricted": false, "regionBlockedKR": false, "privacy": "public" },
  "search": { "status": "hidden", "rank": null, "fallbackRank": null, "noResults": false, "query": "메리 도쿄테디베어", "source": "KR", "checkedAt": "2026-11-04T12:12:58.196Z" },
  "karaoke": null,
  "stelline": { "query": "메리 도쿄테디베어", "status": "not_found", "lastNotFoundAt": "2026-11-05T08:10:47.647Z", "roundCheckedAt": "2026-11-05T08:10:47.647Z" }
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | number | 공식 게시물 번호 (`stellive.me/music/{id}`) |
| `title` | string | 공식 제목 원문 |
| `kind` | `cover` \| `original` | 커버 / 오리지널 |
| `isMedley` | boolean | 메들리·매시업 |
| `titleKo` / `titleOriginal` | string / null | 표시 제목 / 괄호 안 원제 |
| `source` | string / null | `『』` 안 원문 (커버는 원곡자, 오리지널은 앨범·출처) |
| `sourceArtists` | string[] | 원곡자를 정규화·분리한 목록 (커버만) |
| `date` | YYYY-MM-DD | **공식 게시물 날짜** (실제 공개일과 다를 수 있음) |
| `youtubeId` | string | YouTube 영상 ID |
| `singer` | string | 공식 가수 표기 원문 |
| `members` | slug[] | 참여 멤버 (유닛 명의는 구성원으로 펼침) |
| `units` | string[] | 유닛 명의 (`MYSTIC` / `EVERYS` / `UNIVERSE` / `CLICHE` / `ABYSS`) |
| `group` | boolean | STELLIVE 전체 명의 (멤버로 펼치지 않음) |
| `guests` | string[] | 외부 아티스트 |
| `label` / `category` / `categoryId` | | 공식 목록의 라벨 / 카테고리 |

### `availability` — 영상 가용성
| 필드 | 의미 |
|---|---|
| `available: false` | 삭제 또는 비공개 |
| `embeddable: false` | 퍼가기 차단 (웹 플레이어에서 재생 불가) |
| `ageRestricted: true` | 연령 제한 (로그아웃·시크릿 모드에서 재생 불가) |
| `regionBlockedKR: true` | 한국에서 차단 |
| `privacy` | `public` / `unlisted` |

### `search` — YouTube 검색 노출
로그아웃 상태(시크릿 모드와 같은 조건)에서 YouTube 검색 결과 첫 페이지에 곡이 나오는지 측정한 값입니다.

| `status` | 의미 |
|---|---|
| `visible` | 기본 검색어로 첫 페이지에 노출 |
| `cover_only` | 검색어에 `cover`를 붙여야 노출 |
| `suspected` | 이번 측정에서 둘 다 없음 (1회). 일시적인 결과일 수 있어 다음 회차에 다시 측정 |
| `hidden` | **2회 연속** 둘 다 없음 (확정) |
| `error` | 측정 실패. 다음 회차에 다시 측정 |
| `unavailable` | 영상이 삭제·비공개라 측정하지 않음 |

| 필드 | 설명 |
|---|---|
| `rank` / `fallbackRank` | 기본 검색어 / `cover` 검색어에서의 순위 (없으면 `null`) |
| `noResults` | 기본 검색어 자체가 "검색결과 없음"으로 나옴 (검색어 단위 차단) |
| `query` | 사용한 기본 검색어 |
| `source` | 측정 위치: `KR`(한국 IP) / `US`(GitHub 서버, 미국 IP) |
| `checkedAt` | 측정 시각 (UTC) |

검색어는 [Stelline](#stelline-데이터)에 등록된 팬 표기를 매 수집마다 받아 우선 사용하고, 없으면 `{멤버 약칭} {곡명}`으로 자동 생성합니다. 검색어 정정은 **Issues**로 알려 주세요.

### `karaoke` — 노래방 번호
| 값 | 의미 |
|---|---|
| `{ "tj": "52455", "ky": "57768" }` | TJ / 금영 번호. 한쪽이 `null`이면 그 노래방에 없거나 아직 입력되지 않음 |
| `null` | Stelline 노래방 목록에서 이 곡을 찾지 못함 (미등록 또는 매칭 실패) |

### `stelline` — Stelline 노출 점검
Stelline이 자체적으로 점검한 결과입니다. **판정 기준이 `search`와 다릅니다** (`search`는 첫 페이지, Stelline은 상위 3개 안).

| 필드 | 설명 |
|---|---|
| `query` | Stelline 등록 검색어 |
| `status` | `not_found`(최근 회차 실패) · `cover_only`(cover로만 찾음) · `null`(최근 회차 실패 목록에 없음 — **정상이라는 뜻은 아님**) |
| `lastNotFoundAt` | 최근 7일 안에 실패한 마지막 시각 (없으면 `null`) |
| `roundCheckedAt` | Stelline 최근 점검 회차 시각 |

### Stelline 데이터
`karaoke` · `stelline` · 검색어는 [Stelline](https://stel-line.vercel.app) 운영자의 허가를 받아 제공합니다.
- 노출 판정은 Stelline 자체 점검(YouTube 검색 상위 3개 안 여부)이며 **YouTube 공식 값이 아닙니다.** 점검 시각을 함께 확인하세요.
- 검색어·노래방 번호·멤버는 직접 입력하는 값이라 빠지거나 늦게 반영될 수 있습니다.
- 노출 점검은 회차마다 일부 곡만 확인합니다.
- 노래방 번호는 영상 ID가 없어 제목과 멤버로 공식 곡에 연결합니다. 잘못 연결된 곡은 Issues로 알려 주세요.

## 수집 방식과 갱신 주기
| 데이터 | 출처 | 주기 |
|---|---|---|
| 곡 목록·상세 | [stellive.me/music](https://stellive.me/music) | 하루 3회 |
| 조회수·가용성·채널 | YouTube Data API v3 | 하루 3회 (일별 스냅샷 보관) |
| 치지직 팔로워·라이브 | 치지직 비공식 엔드포인트 | 하루 3회 |
| 검색 노출 | YouTube 검색 결과 | 하루 3회 (곡 상태에 따라 7시간~하루 간격으로 재측정) |
| 검색어·노래방 번호·Stelline 점검 | [Stelline](https://stel-line.vercel.app) API (허가) | 하루 3회 (실패하면 마지막 값 유지) |

```
한국 IP 검색 측정 (KST 05:07 / 13:07 / 21:07)
   └─ 결과 업로드 → GitHub Actions 실행
        ├─ 공식 MUSIC 수집 → Stelline → YouTube·치지직 통계
        ├─ 검색 노출: 한국 측정이 최신이 아닌 곡만 GitHub 서버 3대에서 나눠 측정
        └─ 병합 → 검증 → data/ 커밋 → Vercel이 /v1 재배포
```
- 한국 IP 측정이 빠진 회차에는 대비용 예약 실행(KST 05:47 / 13:47 / 21:47)이 미국 IP 기준으로 측정합니다. GitHub 예약 실행은 몇 시간씩 늦어질 수 있습니다.
- 정확한 갱신 시각은 `/v1/meta`의 `sources`에서 확인하세요.

## 알아둘 점
- **검색 노출은 측정 조건에 따라 달라집니다.** 같은 곡도 지역·시각·검색어에 따라 결과가 바뀝니다. 미국 IP는 한국 IP보다 `hidden` 판정이 조금 많습니다(2026-11-02 기준, 타 팬 집계 서비스와 대조 시 일치율 한국 97%, 미국 95%). `source`를 함께 확인하세요.
- `date`는 공식 게시물 날짜입니다. 예: `#431` 「나는 최강」은 2022-08-20으로 등록되어 있어 그대로 둡니다.
- YouTube 검색 결과와 치지직 정보는 공식 API가 아닌 방식으로 가져옵니다. Stelline API도 내부 API라 예고 없이 바뀌거나 멈출 수 있으며, 이때는 마지막으로 받은 값을 씁니다. 상대 사이트 구조가 바뀌면 일시적으로 비거나 틀릴 수 있습니다.
- **데이터 오류나 빠진 곡**은 [Issues](https://github.com/4rNe5/StellaAPI_Seed/issues)로 알려 주세요.

## 직접 실행하기
Node.js 22.6 이상이 필요합니다. TypeScript를 빌드 없이 바로 실행합니다(`--experimental-strip-types`).

```bash
npm ci
cp .env.example .env     # YT_API_KEY 입력 (YouTube 단계에만 필요)
npm run all              # collect → stelline → youtube → search → build → validate
npm run export-api       # data/ → public/v1/*.json
```

| 명령 | 내용 |
|---|---|
| `npm run collect` | 공식 MUSIC 증분 수집 (캐시에 없는 상세만 요청). `collect:full`은 전체 재수집 |
| `npm run stelline` | Stelline 검색어·노래방 번호·노출 점검 → `data/stelline/` (`STELLINE=0`이면 건너뜀) |
| `npm run youtube` | YouTube 채널·영상 통계, 가용성, 치지직 (`YT_API_KEY` 필요) |
| `npm run search` | 검색 노출 측정 → `data/search.json` |
| `npm run merge-search -- [파일...]` | 검색 측정 결과 병합 (곡마다 더 최근 측정 채택) |
| `npm run build` | 곡 + 가용성 + 검색 노출 + 노래방 번호 + Stelline 점검 → `data/songs.json` |
| `npm run validate` | 검증 리포트 (원곡자 표기 중복, 멤버 미해석, 노출 현황 등) |
| `npm run export-api` | API 정적 파일 생성 → `public/v1` |

<details>
<summary><code>npm run search</code> 옵션</summary>

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `--budget=초` | 160 | 시간을 넘기면 멈추고 다음 실행에서 이어서 측정 |
| `--stale=시간` | 8 | 일반 곡 재측정 간격 |
| `--stable-stale=시간` | 24 | 최근 3회 연속 1위인 곡 재측정 간격 |
| `--delay=ms` / `--concurrency=N` | 1500 / 2 | 요청 간격 / 동시 요청 수 (높이면 YouTube가 일시 제한) |
| `--shard=i/n` | | n개로 나눈 것 중 i번째만 측정 |
| `--source=KR\|US` | | 측정 위치 표기 |
| `--in=` / `--out=` | `data/search.json` | 입력 / 출력 파일 |
| `--only=id` | | 특정 곡만 측정 |
| `--engine=html` | innertube | 검색 방식 고정 |

재측정 우선순위: 미측정 · `error` · `suspected` · 검색어가 바뀐 곡은 매 실행, 그 외는 위 간격대로 진행합니다.
</details>

<details>
<summary><code>data/</code> 파일 구성</summary>

| 파일 | 내용 |
|---|---|
| `tracks.json` / `tracks.csv` | 공식 곡 목록 (CSV는 UTF-8 BOM, 배열은 `\|` 구분) |
| `songs.json` | 곡 + `availability` + `search` + `karaoke` + `stelline` (API `/v1/songs`의 원본) |
| `members.json` | 멤버·유닛 마스터 |
| `search.json` | 검색 노출 측정 결과와 이력 |
| `search-kr.json` | 한국 IP 측정 결과 (Actions가 병합) |
| `youtube/channels.json` | 채널별 구독자·총조회수·영상 수 |
| `youtube/uploads.json` | 채널별 업로드 목록 캐시 |
| `youtube/candidates.json` | 공식 목록에 없는 업로드 중 곡 후보 (검수용) |
| `chzzk.json` | 치지직 팔로워·라이브 여부 |
| `stelline/*.json` | Stelline 검색어(`search-songs`) · 노출 점검(`not-searched`) · 노래방(`karaoke`) — 받은 시각 포함 |
| `stats/YYYY-MM-DD.json` | 일별 스냅샷 (곡 조회수·좋아요·댓글, 채널, 치지직) |
| `meta.json` | 수집 시각·건수·실패 id |
| `cache/details/{id}.json` | 공식 상세 페이지 파싱 캐시 |

`youtube/videos.json`은 매 실행 다시 만들기 때문에 커밋하지 않습니다.
</details>

## 운영
<details>
<summary>GitHub Actions (<code>.github/workflows/collect.yml</code>)</summary>

| 잡 | 내용 |
|---|---|
| `prepare` | 공식 MUSIC 수집 → Stelline → 한국 측정 결과 병합 → YouTube·치지직 → `data/` 전달 |
| `search` ×3 | 검색 노출을 3개로 나눠 서로 다른 러너(IP)에서 동시 측정 (YouTube 제한이 IP 단위) |
| `finalize` | 결과 병합 → `songs.json` → 검증 리포트(Summary) → `data/` 커밋 |

- 실행: 한국 측정 업로드 직후(`workflow_dispatch`), 대비용 예약 하루 3회, 수동 실행(Actions → collect → Run workflow, `search_all`을 켜면 간격 무시하고 전체 재측정).
- 일부 단계가 실패해도 나머지 데이터는 커밋하고, 실행만 실패로 표시해 알림을 받습니다.
- 시크릿: `YT_API_KEY`.
- 샤드 수를 바꿀 때는 `matrix.shard`와 `env.SHARDS`를 같이 수정합니다.
</details>

<details>
<summary>한국 IP 측정</summary>

GitHub 서버가 미국 IP라 한국에서 검색할 때와 결과가 일부 다르게 나타납니다. 따라서 프로젝트 운영자 PC(한국 IP)에서 먼저 측정해 올립니다.

- `scripts/kr-session.sh prepare | run | upload` — 최신 데이터 준비 → 150초 단위로 이어서 측정 → `data/search-kr.json` 업로드 + Actions 실행
- 토큰: `KR_GITHUB_TOKEN` (fine-grained, 이 저장소만, Contents · Actions: Read and write). 기본 위치 `~/Repo/.stellaapi-kr.env`, `KR_ENV_FILE`로 변경 가능
- macOS에서 launchd로 자동 실행: `bash scripts/install-kr-agent.sh` (해제 `--uninstall`)
</details>

<details>
<summary>유지보수</summary>

- 공식 사이트 구조가 바뀌면 `src/parse.ts`의 셀렉터를 수정합니다 (`.gallery_wrap .bh_item`, `table.extra`, `.content_body`).
- `validate`의 「원곡자 표기 중복 후보」「멤버 미해석」이 0이 아니면 `src/artists.ts` / `src/members.ts`의 별칭을 보강합니다.
- 신규 멤버 데뷔·졸업: `src/members.ts`(`MEMBERS`, `UNIT_MEMBERS`), `src/channels.ts`.
- 검색어 수동 지정: `src/queries.ts` (우선순위 `queries.ts` > Stelline 등록 검색어 > `fan-queries.ts` 스냅샷 > 자동 생성).
- 노래방 매칭 수동 지정: `src/karaoke.ts`의 `KARAOKE_OVERRIDES` (`validate`의 「노래방 목록 미매칭」 참고).
- Stelline 수집 중단 요청 시: 워크플로 `Stelline` 단계의 `STELLINE`을 `'0'`으로 바꾸면 마지막 값으로 고정됩니다.
</details>

## 크레딧 · 문의
- 곡 정보: [STELLIVE 공식 MUSIC](https://stellive.me/music)
- 검색어 · 노래방 번호 · 노출 점검: [Stelline](https://stel-line.vercel.app) (운영자 허가, 2026-11-05)
- 문의·정정·삭제 요청: [GitHub Issues](https://github.com/4rNe5/StellaAPI_Seed/issues)
