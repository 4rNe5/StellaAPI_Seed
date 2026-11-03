/**
 * 맥북(한국 IP) 검색 측정 결과 업로드: 로컬 파일 → 저장소 data/search-kr.json (GitHub Contents API)
 * git 푸시 권한 없이 동작 — KR_GITHUB_TOKEN(이 저장소 fine-grained 토큰: Contents·Actions Read and write) 사용
 * 업로드 후 collect.yml을 workflow_dispatch로 바로 실행 (KR_DISPATCH=0이면 생략)
 * 사용: node --experimental-strip-types --env-file-if-exists=.env src/kr-upload.ts .kr/search-kr.json
 */
import { readFile } from 'node:fs/promises';

const REPO = process.env.KR_REPO ?? '4rNe5/StellaAPI_Seed';
const PATH = 'data/search-kr.json';
const TOKEN = process.env.KR_GITHUB_TOKEN;
const file = process.argv[2];
if (!TOKEN) { console.error('KR_GITHUB_TOKEN이 없습니다 (.env 확인)'); process.exit(2); }
if (!file) { console.error('업로드할 파일 경로가 필요합니다'); process.exit(2); }

const api = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
const headers = { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'stellaapi-kr-upload' };

const body = await readFile(file, 'utf8');
const db = JSON.parse(body);
const kr = Object.values(db).filter((e: any) => e.source === 'KR').length;

for (let i = 1; ; i++) {
  const cur = await fetch(`${api}?ref=main`, { headers });
  const sha = cur.ok ? ((await cur.json()) as any).sha : undefined;
  if (!cur.ok && cur.status !== 404) throw new Error(`조회 실패 HTTP ${cur.status}: ${(await cur.text()).slice(0, 200)}`);
  const res = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `data: 한국 IP 검색 노출 측정 ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} KST`,
      content: Buffer.from(body).toString('base64'),
      branch: 'main',
      ...(sha && { sha }),
    }),
  });
  if (res.ok) { console.log(`업로드 완료 → ${PATH} (KR 측정 ${kr}곡)`); break; }
  // 409: 그 사이 다른 커밋으로 sha가 바뀜 → 다시 조회 후 재시도
  if (res.status === 409 && i < 3) continue;
  throw new Error(`업로드 실패 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// 업로드 직후 Actions(collect.yml) 바로 실행 — GitHub 예약 실행은 수 시간씩 밀려서 대비용으로만 둠
// 토큰에 Actions: Read and write 권한 필요. 실패해도 업로드는 이미 끝났으므로 경고만 (다음 예약 실행이 병합)
if (process.env.KR_DISPATCH !== '0') {
  const d = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/collect.yml/dispatches`, {
    method: 'POST', headers, body: JSON.stringify({ ref: 'main' }),
  });
  console.log(d.status === 204 ? 'Actions 실행 요청 완료 (collect.yml)' : `Actions 실행 요청 실패 HTTP ${d.status}: ${(await d.text()).slice(0, 200)} — 예약 실행 때 병합됨`);
}
