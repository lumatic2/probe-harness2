# probe-harness2

SK하이닉스 AI 해커톤 2026 **본선**(Cofa Probe 웹 IDE, 제공 Codex 만 사용) 응시자가 쓰는 작업 하네스. 2차 예선에 쓴 `probe-harness` 를 바탕으로 고친 판이다.

## 이 README 를 읽은 에이전트에게 — 지금 상황

- 사용자는 지금 **시험 중**이다. 과제 타이머가 시작됐고 과제 풀이 뒤 후속 서술형(AI 금지)이 있다. 실제 시작·종료 시각은 세팅 뒤 `docs/과제설정.md` 4절에 적는다.
- **너는 오케스트레이터(오케)다.** 계획·분해·공유 문서·검수·커밋을 맡는다. 실무자 대화는 DM 세션이, 구현은 사용자가 새 탭에 띄우는 구현 세션이, 서버는 통합 세션이, E2E·Docker·실행 재현은 검증 세션이 한다. 사용자의 서술형 대비는 설명 세션이 처음부터 돕는다.
- 작업 공간(사용자가 Codex 를 연 폴더, 보통 `~/workspace`) 루트의 `README.md` 와 그 옆 파일들(출력 계약 · 데이터 설명 · 제출 양식)은 **과제 원문**이다. 이 레포의 README(지금 이 글)와 다르다. 세팅은 과제 원문을 덮지 않는다.
- 공통 규칙은 세팅 뒤 작업 공간에 생기는 `AGENTS.md`, 오케의 신호 규칙은 `harness/roles/오케.md` 다.

## 세팅 — 이 레포를 클론하라는 요청을 받았으면 (사용자 문구가 「상황 파악」「세팅」 등 무엇이든 같다)

1. 클론 위치는 **작업 공간 안의 `probe-harness2/`** 다. 다른 곳에 클론했으면 아래 명령에 작업 공간 경로를 인자로 넘긴다.
2. 작업 공간에서 실행한다:
   ```bash
   bash probe-harness2/setup.sh
   ```
   setup.sh 는 **고치지 않고 그대로** 돌린다 — 스킬을 `CODEX_HOME/skills` 에 등록하고 클론 폴더를 지우는 것은 허용된 동작이다(과제 지침의 「파일은 이 안에서만」과 충돌로 보지 않는다). `CODEX_HOME`·`TMP` 같은 환경변수를 바꿔 돌리지 않는다. 세팅 전부터 있던 파일(과제 원본)은 종류와 상관없이 덮지 않고, 과제가 준 `AGENTS.md` 는 우리 `AGENTS.md` 맨 끝 「과제 환경이 준 원래 지침」 절로 옮긴다.
3. setup.sh 출력 맨 끝 **「다음(에이전트)」 지시를 그대로 따른다.** 세팅 뒤 할 일(역할 읽기 · 세션 등록 · 보고 전달 · 덧붙일 안내)의 정본은 그 출력 하나다.

## 세팅 뒤 작업 공간 모습

```
README.md  EXPORT_SCHEMA.md 류  data/ …   ← 과제 원문 (그대로 — 루트 README 취급은 docs/과제설정.md 2절)
메모.md                    ← 사용자가 직접 만드는 메모장 (에이전트는 읽지 않는다)
AGENTS.md                  ← 모든 탭 공통 규칙
docs/                      ← 과제설정 · PROBLEM · SOLUTION · PLAN · ARCHITECTURE · DECISIONS · 서술형-대비 · 세션.txt · interview/
.agents/skills/            ← 스킬 9개 ($handoff $verify $decision $evaluate $design-review $security $submit $grilling $systematic-debugging)
harness/                   ← 에이전트만 본다: roles/ guides/ approaches/(다른 분야의 눈·반도체 현장 관점·용어집) methods/(기법 문서와 코드) starter/ tools/ vendor/ verify.sh
```

## 흐름 한 줄

세팅(M0) → 「과제 시작하자」(M1 과제설정: 원문 전부 → 과제설정 · PROBLEM 첫판 → 채팅 보고) → 「DM 시작하자」(M1 실무자 대화, DM 탭 — 그동안 화면 골격을 미리 세운다) → 「문제 확정」 → M2 조사 · 솔루션 논의 · 솔루션 브리핑 → 「OK」 → 솔루션 DM → 「솔루션 확정」 → M3 설계 논의(화면 설계 포함) · `$grilling` 빈틈 훑기 · 설계 브리핑 → 「설계 OK」(스캐폴드 · 계약 테스트 · 브리프 → 코어·통합·검증·화면 탭) → M4 구현 → 첫 화면 · 사용자 QA · 화면 점검(`$design-review`) · 독립 재계산 → 「구현 끝」「QA 끝」 → M5 피드백 DM · 수정 → 「피드백 끝」(제출 정리) → 동결 → M6 보안·평가·제출 점검 서브에이전트 병렬 → `final` → 서술형 대비 한 바퀴 묻고 답하기 → 제출. 설명 탭은 처음부터 띄워 작업 내내 쓴다. 단계별 상세는 `harness/guides/STAGES/`, 시간 기준선은 `harness/guides/지도.md`.
