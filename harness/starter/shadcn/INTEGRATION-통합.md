# 서버·데이터 연결 — 통합 워커(와 검증 워커)가 읽는다

> 서버 모듈, 로그인, 데이터셋·실행·그래프, 업무 코드 연결, AI 연결, 검증 순서. 화면 부품을 붙이는 법은 `INTEGRATION-화면.md`.
> 경로는 **앱 폴더(`src/ui/`) 기준**이다. `src/lib/pages.ts` = 작업 공간의 `src/ui/src/lib/pages.ts`, `server/run.mjs` = `src/ui/server/run.mjs`.

## 서버 모듈 지도 (문제가 나면 어느 파일인지 — 한 파일이 커지면 여기서 나눈다)

| 파일 | 맡는 것 | 바꿀 때 | 검사 |
|---|---|---|---|
| `vite.config.ts` | 환경변수(OPENAI_*·AUTH_*·PORT) → 서비스 객체 생성 → `/api` 미들웨어 등록 · 빌드 설정(청크 분할 `VENDOR`) | 새 서비스를 꽂거나 환경변수가 늘 때만 | `npx tsc -b && npx vite build` |
| `server/api.mjs` | `/api/<이름>` 라우팅 분기 — 이름 검사 · health · auth-* · 401/403(READ_POSTS) · 메서드 405 · 본문 상한(413) · 저장물 GET/POST/PUT(PROTECTED_STORE) · 예외 → 500 | 새 `/api` 이름을 더하거나 권한 규칙을 바꿀 때 | `server/api.test.mjs`(서비스는 모형) |
| `server/auth.mjs` | 로그인·세션 쿠키·역할·`canWrite` | 세션 영속·해시·SSO 요구 | `auth.test.mjs` |
| `server/datasets.mjs` | 준비된 CSV 묶음 목록·schema 검증·적용(`dataset-current`) | schema 규칙·CSV 형식 | `datasets.test.mjs` |
| `server/run.mjs` · `server/engine.mjs` | 실행 작업 상태·진행·결과(`run-result`) · 업무 계산 | 엔진은 `engine.mjs` 한 파일만 교체 | `run.test.mjs` |
| `server/assist.mjs` · `chat.mjs` · `transcribe.mjs` | OpenAI 어댑터(키 없으면 모의) | 모델·프롬프트 | 각 `*.test.mjs` |

- 전부: `node --test server/*.test.mjs`. 새 `/api` 이름을 더하면 `api.mjs` 분기 한 줄 + `api.test.mjs` 한 줄이 한 쌍이다.
- 화면 쪽 데이터 로딩은 `src/lib/derive.ts` 한 곳 — 도메인 `domain.json` 은 전부 eager, `sample.json` 은 띄우는 도메인 것만 지연 로딩(도메인마다 청크). 큰 라이브러리(React Flow·Recharts·React·Radix·표/드래그)는 `vite.config.ts` `VENDOR` 로 따로 묶여 App 청크가 500kB 를 넘지 않는다 — 경고 한도(`chunkSizeWarningLimit`)를 올려서 덮지 않는다.

## 로그인 켜기 (과제가 로그인·역할 분리를 요구할 때만)
1. `cp .env.example .env` → `AUTH_ON=1`, `AUTH_USERS="id:비밀번호:역할:표시이름;…"`(두 역할 계정 하나씩), `AUTH_WRITE_ROLES=operator`. `.env` 는 커밋하지 않는다 — 시연 안내에는 계정 **이름**만 쓴다.
2. 서버가 켜지면 `/api/auth-me` 가 401 을 돌려주고 App 이 사이드바 없이 `pages/login.tsx` 를 그린다. 로그인 뒤 세션 쿠키(HttpOnly)로 모든 `/api/*` 가 통과하고, POST/PUT 은 쓰기 역할만 통과한다(서버가 403 — 버튼 숨김과 별개).
3. 화면 쪽 역할 분리는 `lib/auth.tsx` 의 `PAGE_ROLES`(예 `{ settings: ['operator'], form: ['operator'] }`)와 `<RequireRole roles=…>` · `useAuth().hasRole(…)` 로. 사이드바 사용자 메뉴는 로그인 계정·역할을 보이고 로그아웃이 세션을 끝낸다.
4. 과제가 더 요구하면 `server/auth.mjs` 만 바꾼다: 세션 영속(data/store) · 비밀번호 해시 · 외부 SSO. 화면·API 계약(`auth-login/logout/me`, `{user:{id,name,role}}`)은 그대로.
5. **빠른 로그인**: `.env` 에 `AUTH_QUICK=1` 이면 로그인 화면 아래에 `AUTH_USERS` 의 계정마다 「○○로 로그인」 버튼이 뜬다(예: 운영자로 로그인 · 사용자로 로그인). 누르면 비밀번호 없이 그 계정으로 들어간다 — QA·시연에서 역할을 바로 바꿔 보는 용도다. 배선은 서버 `auth.mjs`(`quick` 목록은 로그인 전 `auth-me` 에, 로그인은 `auth-login` 에 `{quick:id}`) · 화면 `lib/auth.tsx` 의 `quick`·`quickLogin` · `pages/login.tsx` 한 블록. 버튼 글자는 `ROLE_LABEL` 의 역할 이름을 쓴다 — 역할을 더하면 `AUTH_USERS` 에 계정을 더하고 `ROLE_LABEL` 에 이름을 더하면 버튼이 따라 생긴다. 목록에 비밀번호는 실리지 않는다. 과제가 「실제 로그인만」을 요구하면 `AUTH_QUICK=0`.
6. 세션은 쿠키와 `Authorization: Bearer` 두 통로로 받는다. 응시 환경 Browser 는 앱을 다른 사이트의 틀 안에 띄워 쿠키가 돌아오지 않을 수 있어서다(증상·가르는 법은 `harness/guides/BROWSER.md` 「로그인 직후 다시 로그인 필요가 뜨면」). 화면 쪽은 `src/lib/session-fetch.ts` 가 `fetch('/api/…')` 에 토큰을 붙인다 — `fetch` 를 거치지 않는 요청(XHR·EventSource·링크 내려받기)을 새로 쓰지 않는다.
7. 검사: `node --test server/*.test.mjs` 에 auth 테스트가 들어 있다. 검증 워커는 로그인 전 `/api/<이름>` 401 · 사용자 역할로 POST 403 · 운영자 로그인 뒤 200 을 E2E 에 넣는다.

## 데이터셋·실행·그래프 연결 (최적화·배정·계산 엔진형 과제)
1. domain.json 에 `"datasets": {"title": "데이터셋"}` · `"run": {"title": "계획 생성", "params": [{"key":"days","label":"계획 기간","type":"number","default":5,"unit":"일","min":1,"max":28}, …]}` · `"graph": {"title": "노드 그래프", "hubLabel": "거점", "nodeLabel": "지점"}` 을 넣으면 세 메뉴가 켜진다.
2. 과제가 준 CSV 묶음을 `data/datasets/<이름>/` 에 그대로 둔다(묶음마다 폴더). `data/datasets/schema.json` 에 파일별 필수 열·키·형식(number·date·time·enum)·참조를 적는다(규칙 모양은 `server/datasets.mjs` 머리 주석, 견본은 `data/datasets/schema.example.json` — 복사해 열 이름만 맞춘다). 규칙의 출처는 `docs/experiments/profile.py` 의 assert(M1 데이터 서브에이전트가 만든 것) — 같은 점검을 두 번 쓰지 않는다. 검증 메시지는 파일·행·열·값·규칙을 함께, 한 번에 전부 보인다. CSV 는 UTF-8·CP949 자동. 잘못된 묶음도 하나 만들어 두면 검증 실패 화면을 바로 보일 수 있다.
3. `server/engine.mjs` 의 `runEngine({ params, files, report })` 를 업무 코드로 바꾼다 — files 는 적용된 데이터셋의 CSV 글자(파일명→내용), report(진행률, 단계) 로 진행을 알린다. 돌려주는 `{ summary, items, graph }` 를 실행 화면·그래프·내보내기가 그대로 쓴다. 긴 계산은 그대로 두면 되고(비동기), 실패는 throw 한 메시지가 화면에 뜬다.
4. 출력 계약(EXPORT_SCHEMA 류)이 있으면 `pages/run.tsx` 의 `exportShape()` 를 그 모양으로(리포트 화면의 JSON 내보내기 `pages/report.tsx exportJson` 은 목록 행 내보내기라 별개 — 계약이 결과 파일 하나를 요구하면 실행 화면 것만 쓴다). 실행·적용 버튼은 서버 `auth-me` 의 `canWrite`(AUTH_WRITE_ROLES 판정)를 보므로 역할 이름을 화면에 적지 않는다. 「검증」·대화창·AI 기능·전사는 모든 역할이 부른다(`server/api.mjs` READ_POSTS). 구성원 화면은 `lib/auth.tsx` `HOME_BY_ROLE = { user: 'me' }` + `pages/me.tsx` MyThings 에 내 행(계정 id 로 고른 결과)을 그린다 — 내 지점은 `#/graph?node=<id>` 로 보낸다.
5. 검사: `node --test server/*.test.mjs` 에 datasets·run 테스트가 있다. E2E 는 「잘못된 묶음 적용 → 409 → 기존 유지」 「적용 뒤 실행 전 재생성 필요 알림」 두 줄을 넣는다.

## 연결 1 — 과제 폴더 파일을 그대로 읽는 경우

1. `bash harness/starter/shadcn/make.sh src/ui`로 생성. 이후 수정 위치는 **src/ui/src/domain/<이름>/** 이다. starter 원본만 고쳐 이미 생성한 앱에 반영됐다고 생각하지 않는다.
2. 가장 가까운 도메인을 복사하고 `domain.json`의 app·cols·roles·metrics·규칙을 과제에 맞춘다. `app.today`·`app.asOf`·단위·시간대·중복 처리 기준을 실제 데이터에 맞춘다. 불명확한 규칙을 UI에서 추측하지 않는다.
3. 과제 CSV는 `node harness/starter/domains/csv-to-sample.mjs <이름> <과제.csv>`로 변환한 결과를 앱의 sample.json에 복사한다. 또는 업무 코드가 같은 형태의 JSON을 출력하게 한다.
4. `src/ui/src/domain/active.json`에서 기본 도메인을 선택한다. label·enum·필터 값·가상 데이터 설명도 실제 내용으로 바꾼다.

## 연결 2 — 업무 코드 결과/API (shadcn)

생성된 앱의 domain.json에 다음을 추가한다:

```json
"dataSource": { "url": "/api/result-alarm", "label": "설비 알람 분석 결과" }
```

Python 등 업무 코드는 **src/ui/data/result-alarm.json**에 아래 형식으로 결과를 쓴다(작성 중 읽힘 방지는 임시 파일 작성 후 원자적 교체). 기존 Vite 서버가 같은 포트의 GET `/api/result-alarm`로 제공한다. data/store/result-alarm.json이 있으면 그것이 우선하므로 두 경로를 섞지 않는다.

```json
{"rows":[{"alarm_id":"실제-ID","ts":"2026-10-30T09:00:00","proc":"식각","status":"미완료","severity":"주의","equip":"EQP-1","owner":"담당자","code":"실제 코드"}]}
```

- 키는 해당 domain.json의 cols/roles와 일치. 필수 ID·날짜가 비거나 ID가 중복되면 거절한다. 숫자열은 JSON number, 날짜열은 ISO 형식. ID 안정성은 상세 링크·조치 이력의 기준이다.
- 입력에 행이 없으면 `{ "rows": [] }`. 오류를 0건 응답으로 위장하지 않는다. 응답의 series·units·activity·schedule은 선택이지만 관련 위젯을 쓰면 실제 자료를 제공한다. 견본의 부가 수치는 실제 응답에 합쳐지지 않는다.
- 기준일·표시 시각은 현재 도메인의 app.today/asOf를 사용한다. 실제 결과의 기준일과 함께 갱신한다. 자동으로 오늘 날짜를 추측하지 않는다.
- URL은 같은 서버의 `/api/소문자-이름`만 허용. 서버를 별도로 만들면 `server/api.mjs` 의 분기에 동일 계약으로 연결하거나 같은 포트 뒤로 프록시한다(vite.config.ts 는 서비스 객체를 만들어 넘기기만 한다). API 키는 서버에서만 읽는다.
- 10초 안에 응답이 없거나 HTTP/JSON/필수 필드 오류이면 오류 화면과 재시도 버튼. 견본으로 성공처럼 보이게 하지 않는다. 새로고침하면 다시 읽는다. 자동 폴링은 없다.
- API 모드에서는 CSV 가져오기 메뉴를 숨긴다. 과제 파일은 작업 폴더에서 읽을 수 있으므로 외부 파일 업로드에 의존하지 않는다.
- 저장 연결: 판정 `/api/decisions-<도메인>`, 설정 `/api/settings-<도메인>`, 일정/검토 `/api/schedule-...`, `/api/review-...`. 기본은 단일 사용자 로컬 JSON 저장이다. 실전 서버를 붙이면 GET/POST·오류 계약을 유지하고 실제 저장 후 새로고침으로 확인한다.

## 구현 워커에게 줄 계약 (이 여섯 줄만 채운다)

- 사용자·첫 화면·그 화면에서 결정할 행동:
- 선택한 도메인/페이지/위젯, 숨길 메뉴:
- 원본 입력 → 업무 코드 → 결과 JSON/API 경로:
- ID·날짜·단위·필수 열·enum·기준일 및 판정 책임:
- 사용자 입력/저장 API와 실패 때 행동:
- 검증: 독립 기대값 + 빈 결과 + API 실패 + 저장 후 재조회 + 브라우저 클릭 순서:

## 검증 순서

`node --test harness/starter/domains/source.test.mjs` → 생성된 앱에서 `npx tsc -b && npx vite build` → `npx vite preview`(0.0.0.0:3000, strictPort, `*.e2b.app` Host 허용) → 사용자에게 Browser 포트 칸 `3000` · 경로 칸 `/` 안내(`harness/guides/BROWSER.md`). 다른 Host 로도 200 인지는 `make.sh` 끝의 「미리보기 점검」이 본다.

견본과 다른 ID·건수·합계를 가진 실제/합성 입력으로 지표·목록·상세 연결을 확인한다. API 500 때 견본 숫자가 안 보이는지, 0행 때 정상 판정 대신 데이터 없음이 뜨는지, 재시도 후 복구되는지 확인한다. form의 조치 저장·리포트·선택한 특수 페이지는 과제 데이터로 별도 확인한다. 빌드 통과와 화면 외형 확인만으로 업무 기능을 완료 처리하지 않는다.

## AI 연결 (과제 환경이 OpenAI API 를 줄 때)
1. 서버 환경변수(또는 앱 폴더 `.env`)에 `OPENAI_API_KEY`, 과제 환경이 주소를 주면 `OPENAI_BASE_URL`, 모델을 바꾸려면 `OPENAI_MODEL` 을 넣고 서버를 다시 켠다. 값은 `.env` 에만 두고 코드·문서·로그에 쓰지 않는다. 화면 코드는 고치지 않는다.
2. 확인: `GET /api/health` 의 `ai` 가 `true`(키 값은 나가지 않는다. 있다/없다와 모델 이름만). 화면에서는 AI 대화 패널 맨 아래가 「AI 연결됨 · <모델>」, 답의 배지가 「AI 응답」.
3. 키가 없거나 호출이 실패(시간 초과·HTTP 오류·빈 응답)하면 「모의 응답」으로 답하고 이유를 배지 옆에 적는다(`server/chat.mjs`). 실패를 숨기지 않는다.
4. AI 에게 나가는 것은 지금 화면의 요약(`chatContext`)과 대화, 켰다면 근거 문단뿐이다. 요청 크기 한도는 「부품 선택·제출 전 정리·비용」(`INTEGRATION-제출.md`).
