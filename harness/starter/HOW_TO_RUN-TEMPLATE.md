# HOW_TO_RUN-TEMPLATE — 과제가 「실행 안내 파일」 양식을 줬을 때의 채움 틀

> 과제가 준 양식(절 번호·제목)이 **그대로 우선**이다 — 이 파일은 7절 양식을 기준으로 **어느 절에 무엇을 넣는지**만 적은 참고다. 양식이 다르면 절 이름만 맞추고 내용 배치는 같게 한다. 루트 README 는 과제 지시문이면 건드리지 않는다(`docs/과제설정.md` 2절).
> 과장 금지가 형식이다. 되는 것·안 되는 것을 같은 무게로, 대표 수치는 지금 커밋에서 뽑은 값만. 비밀 값(비밀번호·키)은 적지 않는다 — 계정은 **이름**만. 다 채운 뒤 `python3 harness/tools/evidence_check.py HOW_TO_RUN.md` — 요구 ID(`docs/PROBLEM.md` 3절)마다 「된다」나 「안 된다」에 한 번은 나와야 한다.

```markdown
# HOW_TO_RUN

## 1. 목적과 범위
<누구>의 <문제>를 <무엇>으로 푼다 (한 문장 — docs/PROBLEM.md 0절. 첫 화면 본문 첫 줄과 같은 문장). 다루는 요구 R1~Rn 한 줄씩. 다루지 않은 범위: <무엇> — 이유 (docs/DECISIONS.md D#).

## 2. 기술 스택
화면 React 19 + Vite + Tailwind 4 + shadcn(dashboard-01) · 노드 그래프 @xyflow/react · 서버 vite preview 미들웨어(/api, Node 20.19+) · 엔진 <언어·라이브러리> · 컨테이너 Dockerfile(node:22-alpine). 외부 서비스: 없음(또는 <무엇> — 키는 서버 환경변수에만).

### 구조와 설계 근거
| 모듈 (`src/…`) | 하는 일 | 받는 것 → 내는 것 (데이터 계약 위치 `파일:줄`) |
|---|---|---|
| `src/<모듈>/` | … | … → … |

- 왜 이렇게 나눴나: … · 기각한 구조: <대안> — <이유> (docs/DECISIONS.md D#) · 상세는 `docs/ARCHITECTURE.md` 0~4절.

### 어떻게 동작하나 (내 파일 이름으로 3줄)
- 입력 … → 처리 `src/…` → 결과 …
- 결정론 부분과 AI 부분의 경계: …
- 어디서 깨지나: 약한 곳 2~3줄(조건과 함께).

## 3. 준비 사항
- Node 20.19 이상(또는 Docker). `cp .env.example src/ui/.env` 뒤 아래 환경변수(앱은 `src/ui/.env` 를 읽는다. `PORT` 는 실행 명령 앞에 준다).
- 환경변수 표: AUTH_ON · AUTH_USERS(형식 "id:비밀번호:역할:표시이름;…" — 값은 적지 않는다) · AUTH_WRITE_ROLES · PORT · <엔진 변수>. 없으면 어떻게 되는지 한 칸씩(README-TEMPLATE 「환경 변수」 표와 같은 것).
- 데이터: 제공 데이터셋은 `data/datasets/<이름>/` 에 그대로(<파일 이름 나열>). 검증 규칙 `data/datasets/schema.json`.

## 4. 실행 방법
- 로컬: `cd src/ui && npm ci && npm run build && npx vite preview` → http://localhost:3000
- 컨테이너: `docker build -t app . && docker run --rm -p 3000:3000 --env-file src/ui/.env app` (기동 확인 `GET /api/health`)
- 역할별 접속: 운영자 계정 <이름> / 구성원 계정 <이름> (비밀번호는 .env AUTH_USERS — 심사 환경에 전달한 값). 운영자 첫 화면 `#/dashboard`, 구성원 첫 화면 `#/me`(`lib/auth.tsx` HOME_BY_ROLE 을 설정했을 때 — 기본은 비어 있다).

## 5. 이용 순서와 대표 결과
1. 운영자 로그인 → 「데이터셋」에서 묶음 선택 → 검증(오류면 파일·행·열·이유 표) → 적용(현재 적용 배지).
2. 「실행」에서 조건(<계획 기간·정원·여유 시간 등>) 입력 → 실행 → 진행 → 요약 → 「JSON 내보내기」(출력 계약 <EXPORT_SCHEMA.md> 모양).
3. 「그래프」에서 그룹별 지점·순서·소요시간 확인(범례 칩으로 한 그룹만).
4. 구성원 로그인 → 「내 정보」에 내 결과 → 「그래프에서 보기」.
- 대표 결과: <지금 커밋에서 뽑은 수치 2~3개 — 예: 결과 N건 · 평균 M분 · 제약 위반 0건> (docs/VERIFICATION.md 의 실행 기록과 같은 값).
- 잘못된 입력 확인: 데이터셋 <이름-bad> 를 적용하면 <어떤 오류>가 표로 뜨고 기존 결과가 유지된다.

## 6. 테스트
- `harness/verify.sh "<테스트 커맨드>"` — 테스트 N개(계약 · 경계값 · E2E). 서버 모듈: `cd src/ui && node --test server/*.test.mjs`.
- 무엇을 확인하나: R1~Rn 과 1:1(테스트 이름에 같은 ID). 실행 기록 `docs/VERIFICATION.md`.

### 된다 (요구 ID → 코드 → 테스트 — `evidence_check.py` 가 이 표를 읽는다)
| 요구 | 증거 |
|---|---|
| R1 <한 줄> | `src/<모듈>/<파일>.py:12` · `tests/<모듈>/test_x.py::test_r1` |

### 안 된다 / 안 했다
- <요구 ID가 있으면 ID> <무엇> — <이유> (docs/DECISIONS.md D#)

## 7. 가정과 제한 사항
- 가정: <실무자와 합의한 규칙·수치 — docs/PROBLEM.md 4절·DM 답변 번호>.
- 제한: <테스트가 덮지 않는 조건 · 데이터 크기 상한 · 모의로 둔 부분(있으면 화면에 「모의」 표시)>.
- 추가 확인 필요: <약한 곳 2~3줄 — 조건과 함께>.

### 합의와 담당자 재량 (애매한 것은 자의로 정하지 않았다)
| 규칙·수치 | 실무자와 합의한 내용 | 근거 | 재량으로 남긴 설정값(기본값) |
|---|---|---|---|
| … | … | `[답변N]` | `설정키` = 기본값 — 바꾸면 무엇이 달라지나 |

### AI 활용 기록
(공식 답변 파일이 따로 있으면 「`AI_COLLABORATION.md` 참조」 한 줄. 없으면 세션.txt·DECISIONS·git log 에서 직접 센 5~8줄 — 역할 수 · AI 제안을 바꾼 횟수 · 위임·시간.)
```
