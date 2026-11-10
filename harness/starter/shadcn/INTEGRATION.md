# 준비 UI를 실전 솔루션에 연결하기

UI는 실제 업무의 입력·판단·행동·근거를 담는 틀이다. 먼저 과제에 필요한 행만 아래 표에서 고르고 나머지 메뉴/위젯은 노출하지 않는다. App·라우팅·페이지를 통째로 다시 쓰지 않는다.

> 이 문서는 입구다. 내용은 읽는 사람에 따라 세 파일로 나뉘어 있다 — **자기 파일만 읽는다.**
> 경로는 **앱 폴더(`src/ui/`) 기준**이다. `src/lib/pages.ts` = 작업 공간의 `src/ui/src/lib/pages.ts`, `server/run.mjs` = `src/ui/server/run.mjs`.

| 누가 | 읽을 파일 | 든 것 |
|---|---|---|
| 화면 워커 | `INTEGRATION-화면.md` | 화면 더하기·빼기 · 화면 틀이 해 주는 것 · 화면 안내 · 결정·검토 부품 연결 · 입력·확인·피드백 |
| 통합 워커 · 검증 워커 | `INTEGRATION-통합.md` | 서버 모듈 지도 · 로그인 · 데이터셋·실행·그래프 · 업무 코드 연결 · AI 연결 · 검증 순서 |
| 화면 워커(피드백 끝 뒤) · 오케(점검 기준 고정 전) | `INTEGRATION-제출.md` | 제출 전에 꼭 하는 것 · 미사용 부품 제거 · AI 비용 |

## 어느 절이 어느 파일에 있나
다른 문서가 `INTEGRATION.md` 「절 이름」으로 가리키면 여기서 파일을 찾는다. 절 이름은 그대로다.

| 절 | 파일 |
|---|---|
| 「화면 커버리지」 | `INTEGRATION-화면.md` |
| 「화면 더하기·빼기」 | `INTEGRATION-화면.md` |
| 「화면 틀이 이미 해 주는 것」 | `INTEGRATION-화면.md` |
| 「화면 안내(온보딩)」 | `INTEGRATION-화면.md` |
| 「결정 부품 연결」 | `INTEGRATION-화면.md` |
| 「검토 부품 연결」 | `INTEGRATION-화면.md` |
| 「입력·확인·피드백 연결」 | `INTEGRATION-화면.md` |
| 「서버 모듈 지도」 | `INTEGRATION-통합.md` |
| 「로그인 켜기」 | `INTEGRATION-통합.md` |
| 「데이터셋·실행·그래프 연결」 | `INTEGRATION-통합.md` |
| 「연결 1」 | `INTEGRATION-통합.md` |
| 「연결 2」 | `INTEGRATION-통합.md` |
| 「구현 워커에게 줄 계약」 | `INTEGRATION-통합.md` |
| 「검증 순서」 | `INTEGRATION-통합.md` |
| 「AI 연결」 | `INTEGRATION-통합.md` |
| 「제출 전에 꼭 하는 것」 | `INTEGRATION-제출.md` |
| 「부품 선택·제출 전 정리·비용」 | `INTEGRATION-제출.md` |
