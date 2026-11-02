# stelscope

스텔라이브 공식 MUSIC 카탈로그([stellive.me/music](https://stellive.me/music))를 수집해 정규화된 JSON/CSV로 만드는 파이프라인.
> 비공식 팬 프로젝트. 스텔라이브 및 소속 멤버와 무관하며, 음원·영상 파일은 수집하지 않는다(메타데이터 + YouTube ID만).

## 실행
```bash
npm i
npm run collect        # 증분: 목록 갱신 + 캐시에 없는 상세만 요청
npm run collect:full   # 전체 재수집
npm run validate       # 검증 리포트
```
Node ≥ 22.6 (TS를 `--experimental-strip-types`로 직접 실행, 빌드 없음). 요청 간격 기본 400ms (`--delay=ms`).

## 출력 (`data/`)
| 파일 | 내용 |
|---|---|
| `tracks.json` / `tracks.csv` | 곡 목록 (최신순). CSV는 UTF-8 BOM, 배열은 `\|` 구분 |
| `members.json` | 멤버·유닛 마스터 |
| `meta.json` | 수집 시각, 목록/수집 건수, 실패 id |
| `cache/details/{id}.json` | 상세 페이지 파싱 캐시 (커밋됨 → CI 증분 수집) |

### Track 스키마
| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | number | 공식 게시물 id (`/music/{id}`) |
| `title` | string | 공식 제목 원문 |
| `kind` | `cover` \| `original` | 제목의 `Cover` 표기 + 카테고리(EP/SINGLE/ALBUM)로 판정 |
| `isMedley` | boolean | 메들리/매시업/플레이리스트 |
| `titleKo` / `titleOriginal` | string / null | 표시 제목 / 괄호 안 원제 |
| `source` | string / null | `『』` 안 원문 (커버=원곡자, 오리지널=앨범·출처) |
| `sourceArtists` | string[] | 원곡자 정규화·분리 결과 (커버만). 별칭은 `src/artists.ts` |
| `date` | YYYY-MM-DD | **공식 게시물 날짜** (실제 발매일과 다를 수 있음) |
| `youtubeId` | string | 임베드용 영상 ID |
| `singer` | string | 공식 가수 표기 원문 |
| `members` | slug[] | 참여 멤버 (유닛 명의는 구성원으로 전개) |
| `units` | Unit[] | 유닛 명의 (MYSTIC/EVERYS/UNIVERSE/CLICHE/ABYSS) |
| `group` | boolean | STELLIVE 전체 명의 |
| `guests` | string[] | 외부 아티스트 |
| `label` / `category` / `categoryId` | | 공식 목록 라벨 / 카테고리 |

## YouTube·치지직 단계 (`npm run youtube`)
`.env`에 `YT_API_KEY` 필요 (`.env.example` 참고). `npm run all` = collect → youtube → validate.

| 출력 | 내용 |
|---|---|
| `data/youtube/channels.json` | 채널별 구독자·총조회수·영상수 (`src/channels.ts`의 채널, 멤버당 메인/서브) |
| `data/youtube/videos.json` | 공식 곡 ∪ 채널 업로드 전체: 조회수·좋아요·댓글·게시일·길이 + 가용성 (**git 제외**, 매 실행 재생성) |
| `data/youtube/uploads.json` | 채널별 업로드 ID 캐시 (증분 기준) |
| `data/chzzk.json` | 치지직 팔로워·라이브 여부 (**비공식 엔드포인트**, 깨질 수 있음) |
| `data/youtube/candidates.json` | 공식 목록에 없는 업로드 중 곡 후보 (휴리스틱, 검수용) |
| `data/stats/YYYY-MM-DD.json` | 일별 스냅샷 (곡 조회수/좋아요/댓글, 채널, 치지직) — 추이·마일스톤 계산용 |

가용성 필드:
| 필드 | 의미 |
|---|---|
| `available: false` | API 응답 없음 = 삭제 또는 비공개 |
| `embeddable: false` | 임베드 차단 → 웹 플레이어에서 재생 불가 |
| `ageRestricted` | 연령 제한 → 로그아웃·시크릿 모드 재생 불가 |
| `regionBlockedKR` | 한국 지역 차단 |
| `privacy: unlisted` | 일부 공개 |

쿼터: 첫 실행 약 (채널 업로드 수 + 영상 수) / 50 units, 이후 약 50 units/회. 기본 일일 한도 10,000.

곡 후보 판정(`songCandidate`): 공식 목록 포함, 또는 [라이브 아카이브 아님 + 1~12분 + 제목에 Cover/커버/歌ってみた/Original/MV/『』 등]. 휴리스틱이라 candidates는 검수 필요.

## 검색 노출 단계 (`npm run search`)
로그아웃 상태(시크릿 모드 상당) YouTube 검색 첫 페이지에 곡이 뜨는지 점검 → `data/search.json`.
- 검색어: `{멤버 약칭} {곡명}` (유닛곡은 유닛명, 구두점 제거). 없으면 `{검색어} cover`로 재검색.
- 호출: YouTube 웹이 내부적으로 쓰는 검색 API(InnerTube, 응답 약 0.44MB) → 실패 시 검색어 단위로 HTML 결과 페이지(약 1.3MB) 예비. `--engine=html`로 고정 가능.
- `status`:
  | 값 | 의미 |
  |---|---|
  | `visible` | 기본 검색어로 첫 페이지 노출 |
  | `cover_only` | `cover`를 붙여야 노출 |
  | `suspected` | 이번에 둘 다 없음 (1회) — 검색 결과 노이즈일 수 있어 다음 실행에서 우선 재점검 |
  | `hidden` | **2회 연속** 둘 다 없음 (확정) |
  | `error` | 점검 실패 — 다음 실행에서 재점검 |
- `noResults: true` = 기본 검색어 자체가 "검색결과 없음" 화면 (검색어 단위 차단)
- 점검 주기 (등급):
  | 등급 | 조건 | 주기 |
  |---|---|---|
  | 우선 | 미점검 · `error` · `suspected` | 매 실행 |
  | 일반 | 그 외, 또는 공식 게시 30일 이내 신곡 | `--stale` (기본 8h, CI 7h) |
  | 안정 | 최근 `--stable-runs`(3)회 연속 1위 | `--stable-stale` (기본 24h, CI 23h) |
- 옵션: `--budget=초`(기본 160, 넘으면 끊고 다음 실행에서 이어서) `--delay=ms`(기본 1500) `--concurrency=N`(기본 2, 같은 IP에서 높이면 YouTube 일시 제한) `--shard=i/n` `--out=경로` `--only=게시물id`
- 거짓 `hidden`(자동 검색어가 실제 검색 습관과 다른 경우)은 `src/queries.ts`에 검색어 수동 지정.
- YouTube 웹/내부 API 자동 접근이라 YouTube 약관상 허용되지 않는 방식이며, 구조 변경·차단 시 깨질 수 있음.

## 병합 (`npm run build`) → `data/songs.json`
공식 곡(`tracks.json`) + `availability`(가용성) + `search`(검색 노출). **조회수·채널·치지직 통계는 넣지 않음** — `youtube/`, `chzzk.json`, `stats/`에서 별도 관리.

## 알려진 데이터 특이점 (2026-11-01, 298건 기준)
- `#431` 아이리 칸나 「나는 최강」 날짜 2022-08-20: 스텔라이브 데뷔(2023-01) 이전 업로드로 추정. 공식 데이터 그대로 둠.
- `date`는 게시물 날짜: 예) Milky Way 2024-02-24, Starry Way 2024-02-21.
- 외부 게스트 3건: Todoroki Hajime, Nerissa Ravencroft, VESPERBELL 요미.
- `group: true`(STELLIVE 명의)는 멤버로 전개하지 않음 — 발매 시점 구성원이 불명확.

## 유지보수
- 사이트 구조 변경 시 `src/parse.ts`의 셀렉터만 수정 (`.gallery_wrap .bh_item`, `table.extra`, `.content_body`).
- `validate`의 「원곡자 표기 중복 후보」「멤버 미해석」가 0이 아니면 `src/artists.ts` / `src/members.ts` 별칭 보강.
- 신규 멤버 데뷔 시 `src/members.ts`의 `MEMBERS`, `UNIT_MEMBERS` 갱신.

## 자동 실행 (GitHub Actions, `.github/workflows/collect.yml`)
- 일정: KST 07:47 / 15:47 / 23:47 (하루 3회) + 수동 실행(Actions 탭 → collect → Run workflow, `search_all`로 점검 주기 무시하고 전체 재점검)
- 구조:
  | 잡 | 내용 |
  |---|---|
  | `prepare` | collect → youtube → `data/`를 아티팩트로 전달 |
  | `search` ×3 | 검색 노출을 3개 샤드로 나눠 **서로 다른 러너(IP)에서 동시 실행** (YouTube 제한이 IP 단위) |
  | `finalize` | 샤드 병합(`merge-search`) → build → validate(Summary 표시) → `data/` 커밋 |
- youtube·search 일부가 실패해도 나머지 데이터는 커밋하고, 실행 결과만 실패로 표시(메일 알림)
- 필요한 시크릿: `YT_API_KEY` (Settings → Secrets and variables → Actions)
- 샤드 수 변경: `matrix.shard` 배열과 `env.SHARDS`를 같이 수정
- 맥북 등 로컬 단독 실행은 기존처럼 `npm run search` (샤드 없이 `data/search.json`에 직접 기록)

## API (`https://stella-api.vercel.app`)
`main`에 커밋될 때마다 Vercel이 `npm run export-api`로 `public/v1`을 만들어 배포 (Actions 데이터 커밋 → 자동 갱신). 경로는 `.json` 없이 호출, 붙여도 동작. CORS `*`, CDN 캐시 1시간(배포 시 갱신).

| 경로 | 내용 |
|---|---|
| `/v1` | 엔드포인트 목록·갱신 시각 |
| `/v1/meta` | 갱신 시각·건수 |
| `/v1/songs` | 전체 곡 (공식 MUSIC + `availability` + `search`) |
| `/v1/songs/{id}` | 곡 1개 + 검색 노출 이력 (`id` = 공식 게시물 id) |
| `/v1/members` | 멤버 목록 + 곡 수 |
| `/v1/members/{slug}` | 멤버 1명 + 참여 곡 (`slug` 예: `rin`, `hina`, `mary`) |
| `/v1/channels` | 멤버별 YouTube 채널·치지직 |
| `/v1/search/hidden` | 검색 노출 문제 곡 (hidden → suspected → cover_only) |
| `/v1/stats/latest` | 최신 조회수·좋아요·댓글(+전일 대비), 채널 구독자, 치지직 팔로워 |
| `/v1/stats/songs/{id}` | 곡별 일별 조회수 추이 |

```js
const rin = await fetch('https://stella-api.vercel.app/v1/members/rin').then((r) => r.json());
```
