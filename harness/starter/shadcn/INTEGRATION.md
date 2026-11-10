# 준비 UI를 실전 솔루션에 연결하기

UI는 실제 업무의 입력·판단·행동·근거를 담는 틀이다. 먼저 과제에 필요한 행만 아래 표에서 고르고 나머지 메뉴/위젯은 노출하지 않는다. App·라우팅·페이지를 통째로 다시 쓰지 않는다.

## 화면 커버리지

| 업무에서 필요한 것 | 이미 있는 화면/부품 | 연결할 것 |
|---|---|---|
| 현황·우선순위·추세 | dashboard / 지표·추세·분포·히트맵·알림·지도·이력 | rows, metrics, alerts, 실제 시계열 series, 설비 units |
| 검색·분류·정렬·선택·내보내기 | list / 공통 필터·표·CSV·xlsx | cols·roles·enum·단위, 원본 ID |
| 한 건의 원인·증거·관련 건 | item / 원 데이터·규칙·변경 이력 | 안정적인 ID, 실제 판정 근거·원문 |
| 담당자 판단·조치 입력 | form / 필수값 검증·저장·피드백 | form.fields, 판정/조치 저장 계약 |
| 보고·전후 비교·인수인계 | report / 조건 비교·문장·인쇄 | 동일한 필터·지표, 실제 기준선·측정값 |
| 배정·자원 충돌·일정 | schedule (선택) | 자원·시작/종료·충돌 규칙, 확정 저장 |
| 문서 분류·검토·불확실 건 | review (선택) | 실제 문서/태그/확신값·검토 상태 |
| AI 제안·질의·근거 문서 | assist, 채팅 패널, 녹음 부품 (선택) | 서버 어댑터·근거·실패 처리. 제품 AI 사용 허용 별도 확인 |
| CSV 열 매핑·검증·미리보기·되돌림 | import (선택) | 브라우저 파일 반입이 가능한 환경에서만 사용 |
| 규칙 기준값·가정 비교 | settings (선택) | params·단위·기본값·허용 범위 |
| 데이터 준비 중·오류·빈 결과 | main.tsx / DataState | 결과 연결 상태. API 실패 때 견본으로 바꾸지 않음 |
| 데이터셋 선택·검증·적용(업로드 없이) · 현재 적용 표시 · 실패 시 기존 유지 | pages/datasets · server/datasets.mjs | `data/datasets/<이름>/*.csv` + `schema.json`(필수 열·키·형식·참조). 아래 「데이터셋·실행·그래프 연결」 |
| 조건 입력 → 실행 → 진행 → 결과 요약 → JSON 내보내기 · 재생성 필요 알림 | pages/run · server/run.mjs · server/engine.mjs | 엔진은 engine.mjs 한 파일 교체. 조건 칸은 domain.json `run.params` |
| 노드 그래프(지도 없이 경로·흐름) · 노드 상세 · 그룹 범례 | pages/graph · widgets/node-graph(W19, React Flow) | 실행 결과 `result.graph` 또는 `data/graph.json` — `{nodes:[{id,label,sub?,x,y,kind?:'hub'|'stop',group?,seq?,tone?:'warn'|'urgent'}], edges:[{id?,from,to,label?,group?}], groups:[{key,label,color?}], flipY?}`(정본은 widgets/node-graph.tsx 의 타입) |
| 사이드바 「문서」 그룹 — 과제 산출물 바로가기 | components/nav-documents | domain.json `docs:[{name,href}]`. 없으면 그룹 자체가 없다(인수인계 메모 기본 항목 폐지) |
| 사이드바 보조 메뉴 — 설정(화면 설정 시트: 글자 크기·표 밀도·기본 기간·시작 화면) · 도움말(켜진 메뉴 순서대로 이용 안내 자동) · 검색(⌘K, 페이지·대상 건) | components/nav-secondary · lib/prefs · lib/pages HELP | 도움말 문구는 domain.json `help: {intro, steps:[…]}` 로 덮어쓴다. 빈 버튼 없음 |
| 내 정보(역할별 첫 화면) | pages/me · lib/auth(HOME_BY_ROLE) · nav-user 「내 정보」 | 구성원 역할은 `HOME_BY_ROLE = { user: 'me' }` 로 로그인 직후 여기로. MyThings 를 그 사용자 것으로 채운다 |
| 로그인 · 사용자/운영자 역할 분리 · 서버 측 권한 검사 | pages/login · lib/auth(PAGE_ROLES) · RequireRole · server/auth.mjs | `.env` AUTH_ON=1 + AUTH_USERS, 페이지별 허용 역할, 쓰기 허용 역할(AUTH_WRITE_ROLES). 아래 「로그인 켜기」 |
| 부품 선택 | `#/widgets` — 데이터 위젯 W1~W19 · 기본 부품 U1~U19 · 결정 부품 D1~D5 · 보기 부품 V1~V7 · 검토 부품 R1~R8 | 실전 메뉴에서 빼고 개발 시 참고. 새로 짜기 전에 여기서 찾는다(`harness/guides/DESIGN.md` 「부품 고르기」) |
| 접기·탭·단계·계층·기간·파일·태그·조건 필터·알림 띠·로딩·경로·분할 · 설정형 레이아웃·설정 행·선택 카드·반복 줄·다중 선택 필터·카드 격자·상태 화면 | widgets/parts.tsx (U3~U10 · U13~U19) · components/ui/{accordion,tabs,calendar,breadcrumb,skeleton,resizable} | props 만 채운다. 파일 끌어다 놓기는 브라우저에서 읽기까지 — 전송·검증은 받는 쪽 |
| AI 제안에 대한 사람의 승인·수정·반려 · 결정 기록 · 근거 종류 표시 | widgets/decision.tsx (D1~D5) | 아래 「결정 부품 연결」 |
| 지표를 눌러 추세 바꾸기 · 카드 안 탭 · 크게 보기 · 차트↔표 · 사건 표시 · 갱신 시각 · 임계값 상태 | widgets/insight.tsx (V1~V7) | props 만 채운다 — `MetricTrend` 의 `metrics[].points` 와 `events[].x` 는 같은 x 값 · `ChartOrTable` 의 `rows` 는 차트에 넘긴 것과 같은 배열 · `ThresholdStat` 의 기준은 기준값 설정(`settings`)에서 읽은 숫자 · `RefreshBar` 의 `onRefresh` 는 실제 재조회를 await |
| 짧은 입력·중요 행동 확인·상세 패널 | Dialog / ConfirmAction / DetailSheet | 입력 검증, 실제 async handler, 실패 후 입력 유지 |
| 즉답·보조 설명·행 메뉴 | Sonner / Popover / Tooltip / DropdownMenu | 성공은 실제 작업 완료 뒤 표시, 접근 가능한 제목·라벨 |

**표 안의 빠른 수정·추가·복제·삭제·순서 변경은 React 메모리의 임시 미리보기**이며 새로고침하면 사라진다. 실제 조치 기록은 form → saveDecision → decisions API 경로로 저장된다. 과제에서 표 편집의 영속 저장을 요구하면 ActionsCtx.update/remove/copy와 백엔드 저장을 연결하고 재조회 검증을 추가한다. 서버 저장처럼 보이던 가짜 대기/성공 문구는 미리보기로 명확히 바꿨다.

빈 목록/차트와 없는 상세 ID는 기존 화면이 처리한다. 이번 공통 틀은 로딩·초기 데이터 연결 실패·전체 데이터 0건을 추가한다. 조직 로그인·실제 권한 분리·동시 편집 충돌·백그라운드 작업 큐·외부 서비스 전송·과제별 최적화 엔진은 완성품으로 들어 있지 않다. 과제에 요구되면 그 계약을 별도로 구현한다. 모든 업무 화면을 미리 만들어 놓았다고 주장하지 않는다.

## 로그인 켜기 (과제가 로그인·역할 분리를 요구할 때만)
1. `cp .env.example .env` → `AUTH_ON=1`, `AUTH_USERS="id:비밀번호:역할:표시이름;…"`(두 역할 계정 하나씩), `AUTH_WRITE_ROLES=operator`. `.env` 는 커밋하지 않는다 — 시연 안내에는 계정 **이름**만 쓴다.
2. 서버가 켜지면 `/api/auth-me` 가 401 을 돌려주고 App 이 사이드바 없이 `pages/login.tsx` 를 그린다. 로그인 뒤 세션 쿠키(HttpOnly)로 모든 `/api/*` 가 통과하고, POST/PUT 은 쓰기 역할만 통과한다(서버가 403 — 버튼 숨김과 별개).
3. 화면 쪽 역할 분리는 `lib/auth.tsx` 의 `PAGE_ROLES`(예 `{ settings: ['operator'], form: ['operator'] }`)와 `<RequireRole roles=…>` · `useAuth().hasRole(…)` 로. 사이드바 사용자 메뉴는 로그인 계정·역할을 보이고 로그아웃이 세션을 끝낸다.
4. 과제가 더 요구하면 `server/auth.mjs` 만 바꾼다: 세션 영속(data/store) · 비밀번호 해시 · 외부 SSO. 화면·API 계약(`auth-login/logout/me`, `{user:{id,name,role}}`)은 그대로.
5. **빠른 로그인**: `.env` 에 `AUTH_QUICK=1` 이면 로그인 화면 아래에 `AUTH_USERS` 의 계정마다 「○○로 로그인」 버튼이 뜬다(예: 운영자로 로그인 · 사용자로 로그인). 누르면 비밀번호 없이 그 계정으로 들어간다 — QA·시연에서 역할을 바로 바꿔 보는 용도다. 배선은 서버 `auth.mjs`(`quick` 목록은 로그인 전 `auth-me` 에, 로그인은 `auth-login` 에 `{quick:id}`) · 화면 `lib/auth.tsx` 의 `quick`·`quickLogin` · `pages/login.tsx` 한 블록. 버튼 글자는 `ROLE_LABEL` 의 역할 이름을 쓴다 — 역할을 더하면 `AUTH_USERS` 에 계정을 더하고 `ROLE_LABEL` 에 이름을 더하면 버튼이 따라 생긴다. 목록에 비밀번호는 실리지 않는다. 과제가 「실제 로그인만」을 요구하면 `AUTH_QUICK=0`.
6. 세션은 쿠키와 `Authorization: Bearer` 두 통로로 받는다. 응시 환경 Browser 는 앱을 다른 사이트의 틀 안에 띄워 쿠키가 돌아오지 않을 수 있어서다(증상·가르는 법은 `harness/guides/BROWSER.md` 「로그인 직후 다시 로그인 필요가 뜨면」). 화면 쪽은 `src/lib/session-fetch.ts` 가 `fetch('/api/…')` 에 토큰을 붙인다 — `fetch` 를 거치지 않는 요청(XHR·EventSource·링크 내려받기)을 새로 쓰지 않는다.
7. 검사: `node --test server/*.test.mjs` 에 auth 테스트가 들어 있다. 통합 워커는 로그인 전 `/api/<이름>` 401 · 사용자 역할로 POST 403 · 운영자 로그인 뒤 200 을 E2E 에 넣는다.

## 데이터셋·실행·그래프 연결 (최적화·배정·계산 엔진형 과제)
1. domain.json 에 `"datasets": {"title": "데이터셋"}` · `"run": {"title": "계획 생성", "params": [{"key":"days","label":"계획 기간","type":"number","default":5,"unit":"일","min":1,"max":28}, …]}` · `"graph": {"title": "노드 그래프", "hubLabel": "거점", "nodeLabel": "지점"}` 을 넣으면 세 메뉴가 켜진다.
2. 과제가 준 CSV 묶음을 `data/datasets/<이름>/` 에 그대로 둔다(묶음마다 폴더). `data/datasets/schema.json` 에 파일별 필수 열·키·형식(number·date·time·enum)·참조를 적는다(규칙 모양은 `server/datasets.mjs` 머리 주석, 견본은 `data/datasets/schema.example.json` — 복사해 열 이름만 맞춘다). 규칙의 출처는 `docs/experiments/profile.py` 의 assert(M1 데이터 서브에이전트가 만든 것) — 같은 점검을 두 번 쓰지 않는다. 검증 메시지는 파일·행·열·값·규칙을 함께, 한 번에 전부 보인다. CSV 는 UTF-8·CP949 자동. 잘못된 묶음도 하나 만들어 두면 검증 실패 화면을 바로 보일 수 있다.
3. `server/engine.mjs` 의 `runEngine({ params, files, report })` 를 업무 코드로 바꾼다 — files 는 적용된 데이터셋의 CSV 글자(파일명→내용), report(진행률, 단계) 로 진행을 알린다. 돌려주는 `{ summary, items, graph }` 를 실행 화면·그래프·내보내기가 그대로 쓴다. 긴 계산은 그대로 두면 되고(비동기), 실패는 throw 한 메시지가 화면에 뜬다.
4. 출력 계약(EXPORT_SCHEMA 류)이 있으면 `pages/run.tsx` 의 `exportShape()` 를 그 모양으로(리포트 화면의 JSON 내보내기 `pages/report.tsx exportJson` 은 목록 행 내보내기라 별개 — 계약이 결과 파일 하나를 요구하면 실행 화면 것만 쓴다). 실행·적용 버튼은 서버 `auth-me` 의 `canWrite`(AUTH_WRITE_ROLES 판정)를 보므로 역할 이름을 화면에 적지 않는다. 「검증」·대화창·AI 기능·전사는 모든 역할이 부른다(`server/api.mjs` READ_POSTS). 구성원 화면은 `lib/auth.tsx` `HOME_BY_ROLE = { user: 'me' }` + `pages/me.tsx` MyThings 에 내 행(계정 id 로 고른 결과)을 그린다 — 내 지점은 `#/graph?node=<id>` 로 보낸다.
5. 검사: `node --test server/*.test.mjs` 에 datasets·run 테스트가 있다. E2E 는 「잘못된 묶음 적용 → 409 → 기존 유지」 「적용 뒤 실행 전 재생성 필요 알림」 두 줄을 넣는다.

## 화면 더하기·빼기 — 등록은 한 곳 (`src/lib/pages.ts` 의 `SCREENS`)
왼쪽 메뉴에 무엇이 어떤 순서로 보일지는 `SCREENS` 목록 하나가 정한다. 설계 때 정한 「화면 목록」을 그대로 옮긴다.
1. **더하기**: `src/pages/<key>.tsx` 에 `export default function 이름() { … }` 파일 하나 + `SCREENS` 에 한 줄 `{ key: '<key>', name: '메뉴 이름', help: '이 화면에서 무엇을 하나', group: '현황'|'작업'|'참고', icon: 아이콘 }`. 이것으로 주소(`#/<key>`) · 탭 제목 · 왼쪽 메뉴 · 도움말 · 검색에 모두 생긴다. `App.tsx` 는 고치지 않는다(파일 이름으로 찾는다).
2. **빼기**: 그 줄을 지우거나 `when: false`. 도메인 설정에 따라 켜지는 화면은 `when: !!ctx.d.<키>`.
3. **메뉴에는 없지만 열리는 화면**(상세·내 정보처럼 다른 화면에서 들어가는 것): `group` 을 비운다.
4. **개발용 화면**(`#/widgets` 부품 카탈로그): `dev: true`. 메뉴에는 `VITE_DEV_MENU=1` 로 빌드했을 때만 보인다. `make.sh` 가 앱 폴더의 `.env.local` 에 `VITE_DEV_MENU=1` 을 적어 두므로 **만드는 동안에는 메뉴에 보인다**. 화면 아래의 「이 화면의 한계: …」 줄도 같은 스위치를 따른다(제출 화면에서는 도움말의 「한계」 줄에만 남는다). **제출 전에 `.env.local` 의 그 줄을 지우고 다시 빌드한다**. 지워도 주소 `#/widgets` 로는 열린다.
5. 순서 있는 절차(데이터셋 → 실행 → 그래프 같은)는 `App.tsx` 의 `FLOW` 배열에 키를 순서대로 — 그 화면들 위에 단계 표시가 뜬다.
6. 역할별로 막을 화면은 `lib/auth.tsx` `PAGE_ROLES`, 역할별 첫 화면은 `HOME_BY_ROLE`.
7. **빠른 등록 버튼**(사이드바 맨 위 검정 버튼)은 기본으로 꺼져 있다. 어느 화면에서든 한 번에 등록해야 하는 서비스에서만 `lib/pages.ts` 의 `QUICK` 을 채운다: `{ label: '빠른 등록', href: '#/form' }`(그 화면으로) 또는 `{ label: '빠른 등록', dialog: true }`(모달 — 칸은 `components/nav-main.tsx` 의 `QUICK_FIELDS`, 저장은 `/api/quick-<도메인>`, 모달 부품은 `components/quick-add.tsx` 의 `QuickAddDialog`). 종 아이콘(알림)은 그대로 있다.

## 화면 안내(온보딩) — 처음 온 사람에게 순서대로 짚어 준다
처음 들어오면 나머지를 어둡게 하고 한 곳씩 밝혀 「여기서 무엇을 보고 무엇을 하는가」를 설명한다. 한 번 보면 브라우저에 「봤음」이 남아 다시 뜨지 않고, 도움말의 「화면 안내 다시 보기」로 다시 연다. Esc = 건너뛰기, ← → = 이전·다음.
1. 단계는 `src/lib/tour-steps.ts` 의 목록 하나다. **과제에 맞게 이 목록만 바꾼다** — `{ target, title, text, page? }` 를 5~7개. 기능 나열이 아니라 **일의 순서**로 쓴다(무엇부터 보고 → 어디서 고르고 → 어디서 결정하나).
2. `target` 은 짚을 곳의 CSS 선택자. 요소에 `data-tour="이름"` 을 붙이고 `'[data-tour="이름"]'` 로 가리킨다(위젯 카드는 `'[data-widget="W9"]'`, AI 버튼은 `'[data-chat-open]'`). 이미 붙어 있는 것: `menu`(왼쪽 메뉴) · `filter`(기간·범위) · `metrics`(지표 카드) · `queue`(대시보드 표).
3. 다른 화면의 것을 짚으려면 그 단계에 `page: '<화면 키>'` — 안내가 그 화면으로 옮긴 뒤 짚는다. 화면에 없는 `target` 은 자동으로 건너뛴다.
4. 사람이 결정하는 자리(결정 바)와 결과를 검토하는 자리(결과 검토 카드)는 단계에 **꼭 넣는다** — 처음 보는 사람이 이 서비스의 핵심을 30초 안에 본다.
5. 끄려면 목록을 빈 배열로. 직접 열려면 `startTour()`(`widgets/tour.tsx`). 「봤음」 표식은 `localStorage` 의 `sk-tour-seen:<도메인>`.

## 검토 부품 연결 (계산·배정·분석 결과를 사람이 믿고 승인하게)
1. **실행 화면은 자동이다.** `server/engine.mjs` 의 결과에 아래 칸을 채워 돌려주면 `#/run` 에 「결과 검토」 카드가 뜬다(모의 엔진이 견본 값을 채워 둔다 — 실제 엔진으로 바꿀 때 같이 바꾼다).
   - `compare: { rows:[{label, before, after, delta?, better?, kind?}], baseLabel?, nextLabel?, note? }` — 지금 운영안과 같은 지표로 계산한 값. 지금 운영안이 데이터에 없으면 「기준안」(가장 단순한 규칙으로 만든 결과)을 만들어 그것과 비교하고 `baseLabel` 에 그렇게 적는다.
   - `worst: { metric, unit, average?, items:[{id, label, value, before?, note?, href?}] }` — 값이 클수록 나쁜 지표로, 엔진이 가진 전체 건을 넘긴다(화면이 위에서 5건을 자른다).
   - `excluded: { total, groups:[{reason, count, examples?}] }` — 입력 전체 건수와, 뺀 이유별 건수.
2. 구성원(보기 역할) 화면에는 **자기 건만**. `worst` 의 다른 사람 이름·ID 는 운영자 화면에만 — 서버가 역할을 보고 걸러 준다(`auth.userFrom`).
3. 다른 화면에서는 `widgets/review.tsx` 에서 가져와 props 만 채운다. 숫자 하나의 내력을 보이려면 `Source` 에 `original`(출처에 적힌 원래 값) · `steps`(환산 과정, 순서대로) · `quote`(출처 문서의 해당 문단 그대로) · `where`(쪽·절)를 채운다 — 꼬리표를 누르면 열린다. 「기한을 못 맞추는 건」처럼 따로 보여야 하는 건은 `<ExcludedNote label=… totalLabel=… noneText=…>` 로 같은 꼴을 쓴다. 학습 경로의 「왜 이 순서인가」는 `PathStep.reason`. `SourceTag` 의 `status` 는 확정(공식 발표·마감) · 잠정(속보·추정) · 환산(우리가 통화·기간을 맞춰 바꾼 값) 셋 중 하나. `CompareMatrix` 의 `aligned` 에는 맞춘 통화·기간·정의를 문장으로.
4. 판정 낱말 바꾸기: `<DecisionBar options={[{value:'pass',label:'통과',tone:'ok'},{value:'rework',label:'재작업',needReason:true},{value:'hold',label:'보류',needReason:true,tone:'urgent'}]} />` — 같은 `options` 를 `<AuditLog>` 에도 넘긴다.
5. 번지는 범위: `<NodeGraph data=… blocked={id} onSelect={setId} />` — 선의 방향(`from → to`)이 영향이 가는 방향이어야 한다. 목록이 따로 필요하면 `impactOf(data, id)`.
6. 퀴즈: `<Quiz questions=… onDone={(r) => …} />` 의 `r` = `{score,total,wrongTopics,answers}` 를 저장해 `<LearningPath doneKeys=…>` 에 반영한다. 정답(`answer`)을 화면 번들에 두면 안 되는 과제라면 채점을 서버로 옮긴다.

## 화면 틀이 이미 해 주는 것 (다시 만들지 않는다)
- **머리줄** = 사이드바 여닫기 + 화면 이름 + 데이터 기준 시각(`domain.json` `app.asOf`, 비우면 안 보임) + AI 대화 버튼. 다른 화면으로 가는 버튼을 머리줄에 더하지 않는다 — 이동은 사이드바, 그 화면의 할 일은 본문 안 버튼(`components/site-header.tsx`).
- **AI 대화 패널**: `domain.json` 에 `chat: { title, suggestions }` 가 있으면 머리줄 오른쪽에 둥근 버튼이 생긴다. 패널은 **머리줄 아래, 화면 오른쪽에 고정된 둥근 카드**다(머리줄을 덮지 않고 위·아래·오른쪽에 여백). 본문을 스크롤해도 입력창은 제자리에 있고 패널 안의 대화만 따로 스크롤된다. 열리면 본문만 그 폭만큼 좁아져 덮이지 않는다(`App.tsx` 의 `CHAT_GAP`). 페이지를 옮겨도 열린 채이고 대화도 남는다. 좁은 화면(lg 미만)에서만 화면 전체를 덮는다. `widgets/chat.tsx` 의 `ChatButton`·`ChatDock`·`setChatOpen`. 버튼 그림은 `src/assets/ai-mark.svg`(또는 `.png`)를 두면 그것, 없으면 반짝임 아이콘.
  - **실제 AI 연결**: 서버 환경변수(또는 앱 폴더 `.env`)에 `OPENAI_API_KEY`, 과제 환경이 주소를 주면 `OPENAI_BASE_URL`, 모델을 바꾸려면 `OPENAI_MODEL` 을 넣고 서버를 다시 켠다. 화면 코드는 고치지 않는다. 연결되면 패널 맨 아래가 「AI 연결됨 · <모델>」로, 답의 배지가 「AI 응답」으로 바뀐다. 확인은 `GET /api/health` 의 `ai: true`(키 값은 나가지 않는다). 키가 없거나 호출이 실패하면 「모의 응답」으로 답하고 그 이유를 배지 옆에 적는다(`server/chat.mjs`).
  - AI 에게 보내는 것은 지금 화면의 요약(`chatContext`)과 대화뿐이다. 근거 문서를 쓰려면 `chat.docs: true` + `src/domain/<도메인>/docs/*.md`.
- **화면이 옆으로 흔들리지 않게** 두 가지가 걸려 있다(`sk-theme.css`): ① 스크롤바 자리를 항상 비워 둔다(`scrollbar-gutter: stable`) ② 메뉴·선택·모달·시트가 열릴 때 Radix 가 body 에 주는 오른쪽 여백을 0 으로 되돌린다(`body[data-scroll-locked]`). 둘은 한 쌍이다. ①만 있으면 무엇을 열 때마다 화면이 스크롤바 폭만큼 밀린다. 새 겹침 부품을 넣어도 이 두 줄은 지우지 않는다.
- **없는 주소** → 사이드바·머리줄은 그대로 두고 본문에 「없는 화면입니다」(U19)와 뒤로·대시보드로 버튼. 조용히 다른 화면으로 보내지 않는다(`App.tsx`).
- **탭 제목** = 「화면 이름 · 앱 이름」. 화면 이름은 `lib/pages.ts` `SCREENS` 의 `name`.
- **데이터셋 → 실행 → 그래프** 가 둘 이상 켜진 도메인에서는 세 화면 위에 같은 단계 표시(U3)가 뜬다(`App.tsx` `FLOW`). 절차에 화면을 더하면 `FLOW` 배열에 키를 더한다.
- **불러오는 중** 화면은 0.3초 넘게 걸릴 때만 보인다(`main.tsx`).
- **로그인·로그아웃 전환 화면** — 누른 순간부터 최소 1초 동안 「로그인하는 중입니다」「로그아웃하는 중입니다」가 덮여 새로고침 깜박임을 가린다(`lib/transition.ts` · `auth.tsx` 의 `beginTransition` · `App.tsx` 의 `endTransition`). 로그인 방식을 바꿔도 이 두 호출은 남긴다.
- **방금 저장한 행 강조** — 입력·판정의 「최근 저장된 판정」과 결정 기록(D5)은 새 행이 한 번 옅게 강조된다. 새 목록에 붙이려면 `useFreshIds(ids)` 로 새 id 를 받아 그 행에 `className="sk-flash"`.

## 결정 부품 연결 (AI·솔버가 제안하고 사람이 확정하는 화면)
1. 제안이 나오는 화면(상세 `pages/item.tsx` · 실행 결과 `pages/run.tsx` · 검토 `pages/review.tsx` 중 과제에 맞는 곳)에 `<DecisionBar proposal=… confidence=… basis=… onDecide=… canDecide={useAuth().canWrite} decided=… />` 를 둔다. `basis` 에는 `<BeforeAfter>`·`<TraceSteps>`·근거 표를 넣는다.
2. `onDecide({ verdict, reason })` 안에서 저장한다 — 기존 조치 기록 경로 `useApp().saveDecision({ id, ref: <대상 ID>, who: <결정한 계정>, ts: <시각>, verdict, reason, proposal })`(기록 모양은 `lib/derive.ts` 의 `Decision` — `id·ref·who·ts` 필수, 나머지는 글자·숫자 자유)로 보낸다. 서버 응답을 `await` 하고 실패는 `throw` 한다(결정 바가 오류를 보이고 입력을 유지한다).
3. 저장된 것을 다시 읽어 `decided` 에 넘긴다. 새로고침 뒤에도 「사람의 결정: …」이 보여야 저장이 된 것이다.
4. 결정 기록 화면은 `useApp().decisions` 를 `AuditEntry[]`(`id` · `at`←`ts` · `by`←`who` · `target`←`ref` · `verdict` · `reason` · `proposal`)로 옮겨 `<AuditLog entries=… />` 에 넘긴다. 기록을 고치는 API 를 만들지 않는다.
5. 숫자를 그릴 때 `<EvidenceTag kind="measured|predicted|assumed" />` 또는 `<EvidenceFigure …>` 를 쓴다. 종류는 계산한 쪽(코어)이 결과에 실어 보내고 화면이 추측하지 않는다.
6. 검사: 쓰기 권한 없는 계정으로 결정 저장 POST → 403, 화면에는 결정 바 대신 안내 문장 · 반려를 사유 없이 저장 → 화면 오류 · 저장 뒤 새로고침 → 결정과 기록이 그대로.

## 입력·확인·피드백 연결

공식 로고는 생성 시 `public/brand/`에 복사된다. 공통 사이드바 상단에 `/brand/sk-hynix-ci.png`를 110×58 비율로 표시하고, 아래에 도메인별 앱 제목을 둔다. 모든 도메인·페이지가 같은 헤더를 사용한다. 출처·사용 범위는 키트의 `vendor/skhynix/ASSETS.md`를 확인한다.

`#/widgets` 맨 위에서 모달·확인창·상세 드로어·팝오버·토스트·툴팁을 직접 눌러 본다. 기존 표의 Drawer와 AI 대화 Sheet도 유지한다. 모든 부품은 생성된 `src/components/ui/`의 shadcn 원형과 앱의 색·폰트 토큰을 쓴다. 별도 테마나 외부 CDN은 없다.

- `components/action-shells.tsx`의 **ConfirmAction**: `trigger`(Button), `title`, `description`, `confirmLabel`, `onConfirm`을 전달한다. 파괴적 행동은 `destructive`. `onConfirm`은 실제 서버 작업 완료까지 await하고 HTTP 실패를 throw해야 한다. pending 때 중복 실행·취소·Escape 닫기를 막고 실패하면 창과 오류를 유지한다. 성공 때만 닫고 선택적인 `successMessage` 토스트를 낸다. 자동 재시도는 없다. 변경 API가 timeout이면 재시도 전에 서버 상태를 조회해 중복 저장을 피한다.
- **DetailSheet**: `trigger`, `title`, `description`, `children`, 선택 `footer`. 실제 행 ID로 조회한 내용·근거·후속 행동을 넣는다. 내부 세로 스크롤, 모바일 너비, 닫기와 포커스 복귀는 준비돼 있다. 편집용으로 확장하면 저장 중 닫기/미저장 입력 정책은 별도로 연결한다.
- **Dialog**: `interaction-gallery.tsx`의 입력 모달 예시를 복사한다. `open/onOpenChange` 제어, 라벨·오류 연결, 취소와 제출을 구분한다. 예시는 sessionStorage에만 실제 보관하고 서버 저장을 주장하지 않는다. 실전에서는 과제의 검증·저장 API로 바꾼다.
- **Sonner**: 앱 루트에 Toaster가 이미 있다. `toast.success`는 await 성공 뒤, 실패는 `toast.error`와 함께 입력 옆 지속 오류를 둔다. 중요한 오류를 잠깐 나타났다 사라지는 토스트에만 두지 않는다.
- **Popover / Tooltip / DropdownMenu**: 짧은 도움말·보조 설명·행 행동에 쓴다. Tooltip만으로 필수 지시를 전달하지 않는다. 메뉴 항목은 실제 handler와 연결한다.

카탈로그의 연결 확인은 현재 도메인의 `/api/decisions-...`를 실제 GET한다(10초 제한). 목록을 읽을 뿐 저장하지 않는다. 토스트 메뉴의 메시지는 명시된 표현 견본이다. 카탈로그를 제품 메뉴에 남겨 완성 기능처럼 제출하지 않는다.

공식 구성 참고(접근 2026-10-30): [Dialog](https://ui.shadcn.com/docs/components/radix/dialog), [Alert Dialog](https://ui.shadcn.com/docs/components/radix/alert-dialog), [Sheet](https://ui.shadcn.com/docs/components/radix/sheet), [Sonner](https://ui.shadcn.com/docs/components/radix/sonner).

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

## 부품 선택·제출 전 정리·비용

- 이미 준비: 기준값 설정, 도움말 Dialog, 입력 모달, 비동기 확인창, 상세 Sheet, 토스트/툴팁/팝오버, AI 대화 Sheet(근거·모의 응답 구분), 로딩/빈 결과/오류·재시도.
- 추가 준비 후보는 미저장 입력 이탈 확인, 오래 걸리는 작업의 실제 진행/취소, 변경 전후 비교다. 과제의 작업 상태·저장 계약이 정해졌을 때 기존 Dialog/Sheet/Progress로 조립한다. 가짜 진행률·작동하지 않는 취소 버튼을 미리 붙이지 않는다.
- 사이드바 하단 「설정」은 화면 설정 시트(글자 크기·표 밀도·기본 기간·시작 화면, `lib/prefs.ts`)다 — 규칙 기준값은 작업 메뉴의 「기준값 설정」(#/settings). 도움말 문구는 domain.json `help`, 데이터 기준·연락처는 과제에 맞게 고친다.

### 최종 검토 전에 제품에서 미사용 부품 제거
오케가 M5 검토 기준을 고정하기 전에 수행한다. 키트 원본을 지우는 작업이 아니라 제출 제품을 정리하는 작업이다.
1. PLAN 요구와 연결된 페이지·위젯·API·데이터만 남길 목록을 정한다. 개발용 widgets/InteractionGallery, 다른 도메인 견본, 가상 사용자·연락처·알림·소개 문구를 대조한다.
2. 메뉴만 숨기지 않는다. `lib/pages.ts` 의 SCREENS 줄과 `src/pages/` 의 그 파일(파일이 남아 있으면 번들에 들어간다), import.meta.glob에 잡히는 다른 도메인/문서, 사용하지 않는 API handler·자산·의존성까지 참조를 확인해 제품에서 제거한다. 공통 컴포넌트는 사용하는 화면이 하나라도 있으면 보존한다. 런타임 동적 경로를 단순 텍스트 검색만으로 미사용 판정하지 않는다.
3. 의존성을 제거했으면 package/lockfile을 함께 갱신한다. 과제 원본·검증 증거·라이선스·필수 제출 파일은 보존한다. 원본 키트 사본은 제품과 구별하고 제출 규칙에 따라 포함 여부를 결정한다.
4. 정리 뒤 build/typecheck·핵심 입력→결과·새로고침 저장·도움말/설정/대화 버튼·삭제된 URL의 안전한 처리·404·브라우저 오류를 확인한다. 최종 커밋을 고정한 뒤 보안/평가/제출 점검에 같은 커밋을 준다. 정리 때문에 생긴 실패를 숨기지 않는다.

### 비용은 제품 AI와 제작 과정으로 나눠 확인
- 제품: 집계·판정·검색은 가능한 한 로컬 규칙 코드. AI는 SOLUTION 1절에서 정한 해석/초안 자리(질문→파라미터 변환 · 결과 설명)에서만 호출한다. 입력 타이핑마다 호출하지 않고 명시 전송에만 호출한다. 원문 전체 대신 현재 화면 요약과 필요한 근거만 보낸다.
- 현재 chat 서버는 대화 최대40개·각2000자, context8000자, 근거5개·각1000자, 출력 max_tokens400, timeout10초, 자동 재시도 없음이다. 이는 요청 크기 제한이며 **전체 비용 상한은 아니다**. 실제 과제에서는 필요한 최근 대화만 보내도록 줄이고 제공 모델·허용 예산을 확인한다. 실제 사용량/호출 수·지연을 관측하고 단가를 확인한 경우에만 비용을 계산한다. 확인하지 않은 비용을 0원이라고 쓰지 않는다.
- 예산/다중사용자 요구가 있으면 서버에서 호출 수·동시 실행·사용량 상한을 집행한다. 지금 준비본에는 전체 세션 예산 차단·공유 요청 중복 제거가 없다. 취소/timeout이 공급자 과금 취소를 보장하지도 않는다. 그 요구가 없으면 범용 과금 플랫폼·복잡한 캐시·모델 라우터부터 만들지 않는다.
- 제작: 같은 조사·검사를 여러 탭에 중복 위임하지 않고, 변경 없는 검증 결과는 재사용한다.

미준비 부품은 앱에 설치된 shadcn 계열과 guides/DESIGN.md의 테마를 유지해 필요한 것만 추가한다. 공식 부품/CLI 문서: https://ui.shadcn.com/docs/components · https://ui.shadcn.com/docs/cli (확인 2026-10-30). 모든 부품 일괄 설치는 하지 않는다.
