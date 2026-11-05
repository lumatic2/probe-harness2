"""problem_check.py — 문제 정의서(docs/PROBLEM.md, 0~7절)의 기계 점검 (표준 라이브러리만).

사용: python3 harness/tools/problem_check.py [docs/PROBLEM.md]
종료코드: 0 기계 항목 통과 · 1 미충족 있음
세는 것: ① 빈 절 ② 출처 태그 없는 내용 줄(0절 한눈에 · 7절 미확인은 면제) ③ [짐작] 이 남은 절([가정:D번호] 붙은 줄은 허용)
④ 1절(일의 흐름)의 [?] ⑤ 4절 숨은 사실 8항목 중 「아직」 ⑥ 7절 미확인 행 수(참고 출력) ⑦ 확정 시각.
판단 항목(실무자 동의 · 물어본 기록 · 모름 처리)은 「문제 확정」 종료 4조건(harness/roles/DM/M1-인터뷰.md)이 정한다.
"""
import re
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # cp949 콘솔에서도 한글 출력
from pathlib import Path

TAG = re.compile(r"\[(README|데이터|답변|사용자|짐작|가정)[^\]]*\]|\[[^\]]+\.\w+:[^\]]+\]")  # 뒤쪽 = [<파일>:줄] (예 [data/README.md:5] [orders.csv:10])
GUESS = "[짐작]"
EXPECT = 8
HIDDEN = ("단위", "중복", "시간대", "제외 대상", "분류 기준", "빈 값 의미", "AI 사용/외부 전송", "개인정보")


def sections(text):
    parts = re.split(r"^## ", text, flags=re.M)[1:]
    out = []
    for p in parts:
        head, _, body = p.partition("\n")
        out.append((head.strip(), body))
    return out


def content_lines(body):
    raw = body.splitlines()
    for n, line in enumerate(raw):
        s = line.strip()
        nxt = raw[n + 1].strip() if n + 1 < len(raw) else ""
        if s.startswith("|") and nxt.startswith("|---"):
            continue  # 표 머리줄
        if not s or s.startswith(("채우는 지침", ">", "|---", "### ")):
            continue
        if s in ("-", "|"):
            continue
        if s.endswith(":") or s.startswith("숨은 사실:") or re.fullmatch(r"[^:]+: \(.*\)", s):
            continue  # 「규칙:」 같은 소제목 · 「숨은 사실: …」 항목 머리 · 「합의문 확인: (답변N · HH:MM)」 빈 양식
        if s.startswith("|"):
            cells = [c.strip() for c in s.strip("|").split("|")]
            if not any(cells[1:]):
                continue  # 빈 행(첫 칸 ID 만 있는 양식 행 포함)
        if re.fullmatch(r"~~.*~~", s.lstrip("- ")):
            continue
        yield s


def main(path):
    text = Path(path).read_text(encoding="utf-8")
    secs = sections(text)
    if len(secs) != EXPECT:
        print(f"절이 {len(secs)}개 — 양식(0~7절)과 다르다")
        return 1
    problems = []
    for head, body in secs:
        no = head.split(".")[0]
        lines = list(content_lines(body))
        if no == "4":
            pending = [h for h in HIDDEN if re.search(rf"^- {re.escape(h)}: *아직", body, re.M)]
            if pending:
                problems.append(f"숨은 사실 「아직」: {len(pending)}개 ({', '.join(pending)})")
            lines = [l for l in lines if not any(l.startswith(f"- {h}:") for h in HIDDEN) or TAG.search(l)]
        if not lines and no == "7":
            print("미확인 행: 0개 — 질문을 다 닫았다 (첫판이면 아직 주제 5개를 적지 않은 것이다 — 비어 있는 게 맞는지 확인)")
            continue
        if not lines:
            problems.append(f"빈 절: {head}")
            continue
        if no not in ("0", "7"):
            untagged = [l for l in lines if not TAG.search(l)]
            if untagged:
                problems.append(f"출처 태그 없음: {head} — {len(untagged)}줄 (첫 줄: {untagged[0][:50]})")
        g = sum(l.count(GUESS) for l in lines if "[가정:" not in l)
        if g and no == "7":
            print(f"참고 — 미확인의 [짐작] {g}개(질문 후보라 허용)")
        elif g:
            problems.append(f"[짐작] 남음: {head} — {g}개")
        if no == "1":
            q = sum(l.count("[?]") for l in lines)
            if q:
                problems.append(f"흐름의 모르는 구간 [?]: {q}개")
        if no == "7":
            print(f"미확인 행: {len(lines)}개 — 「답이 오면 바뀌는 것」이 MUST·성공 기준이면 확정 불가")
    if re.search(r"확정 시각: \(\s*\)", text):
        print("확정 시각: 비어 있음(「문제 확정」 때 적는다)")
    for p in problems:
        print("✖ " + p)
    print("기계 점검: " + ("통과" if not problems else f"미충족 {len(problems)}건") + " — 출처 태그·빈 절·「아직」만 본 결과다. 사실성·실무자 동의·수치의 진위는 사람이 PROBLEM 을 읽어 판단한다")
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "docs/PROBLEM.md"))
