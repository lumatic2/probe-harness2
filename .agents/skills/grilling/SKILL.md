---
name: grilling
description: M3 설계 논의까지 점검표 ①~⑫ 를 다 돈 뒤 문서 마무리 전에 오케가 「빈틈 훑기」로 호출한다. 아직 안 닫힌 결정·말 없이 가정한 것·다시 열린 것만 라운드로 묻는다. 결정을 처음부터 이 스킬로 몰거나 문제 정의 DM·구현 실행에 쓰지 않는다.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.


## 대회 적용 — 원문 절차에 연결할 작업 맥락

- **언제·범위**: `harness/guides/STAGES/M3.md` 「설계 논의」까지 점검표 ①~⑫(①②③⑤⑪ 은 `M2.md` 「솔루션 논의」)를 사용자와 다 돈 뒤, 문서 마무리 전에 1~2라운드. 결정 나무 = 그 점검표이고, frontier(지금 바로 물을 수 있는 질문 — 앞선 결정이 다 정해진 것)는 그중 아직 안 닫힌 것 · 말 없이 가정한 것 · 앞 결정이 바뀌어 다시 열린 것뿐이다. 새로 물을 것이 없으면 「빈틈 없음」 한 줄로 닫는다. 과제 밖 장기 로드맵은 범위 밖 이유를 남기고 닫는다.
- **질문 꼴**: 원문의 라운드 · 번호 · 추천 · 「네」= 추천 수락을 쓰되, 질문 본문은 `harness/roles/DM.md` 「결정을 물을 때」 칸으로 채운다 — 정할 것 · 배경(낯선 용어 풀이 + 우리 데이터 예시) · A/B → 그러면 누가 어떻게 되나 · 추천과 이유 · 안 정하면 기본값. 사용자가 「무슨 뜻이야」라고 하면 질문을 다시 쓴다. 답하지 않은 것을 동의로 추정하지 않는다.
- **사실은 오케가 찾는다**: 갈래 파일·데이터부터 보고, 새 공백만 서브에이전트(`harness/roles/리서치.md`)에 맡긴다 — 그 사실에 기대는 질문만 미루고 나머지는 묻는다. 실무자만 아는 업무 사실은 사용자에게 추측시키지 않고 PLAN 2절 「가정」 행(기본값)으로 두면 솔루션 DM 이 실무자에게 알린다.
- **고정 제약은 선택 질문으로 만들지 않는다**: 확정된 금지사항 · 권한 없는 외부 전송 보류 · 화면 출발점(`harness/starter/shadcn/make.sh` 뼈대 — 「바닐라로 할까」 같은 선택지를 만들지 않는다).
- **누가 정하나**: 사용자는 우선순위 · 사용 경험 · 절충 · 받아들일 한계. 근거 있는 일상 기술 선택은 오케가 추천하고, 사용자가 맡기면 위임을 기록해 닫는다 — 모듈 이름·라이브러리를 퀴즈로 만들지 않는다.
- **기록**: 닫힌 결정마다 `$decision`, 내용은 점검표의 「적는 곳」(SOLUTION·ARCHITECTURE·PLAN). 별도 grilling 기록은 만들지 않는다. 앞 답이 바뀌면 거기 기댄 결정도 다시 연다.
- **원문의 「Do not act until the user confirms」** 는 여기서 설계 브리핑 뒤 「설계 OK」다. 문서 마무리는 행동이 아니라 그 브리핑의 재료다. 스캐폴드·워커 위임은 「OK」 뒤.

출처: Matt Pocock, https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md (확인 2026-10-30). 설치된 원문 절차 전체를 보존하고 위 대회 맥락과 description만 개량했다. 원 라이선스는 LICENSE에 동봉한다. 원문과 충돌하는 실행 도구/문서 경로는 위 대회 적용을 따른다.
