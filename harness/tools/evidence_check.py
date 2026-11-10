"""evidence_check.py — README 「된다」 표의 칸마다 증거가 실제로 있는지 점검한다 (표준 라이브러리만).

사용: python3 harness/tools/evidence_check.py README.md
종료코드: 0 통과 · 1 증거 없는 칸 또는 없는 파일·테스트 · 2 「된다」 표를 못 찾음(점검 안 됨)

규칙 (README-TEMPLATE 형식):
- 제목에 「된다」가 있고 「안 된다」가 아닌 절의 첫 표를 읽는다. 둘째 열 = 증거.
- 증거 칸에는 백틱(`) 토큰이 1개 이상 있어야 한다.
- 토큰이 파일 경로처럼 보이면(슬래시나 확장자) 파일이 있어야 한다.
  `파일:12` `파일:12-40` → 그 줄까지 파일이 길어야 한다. `파일::테스트이름` → 파일 안에 그 이름이 있어야 한다.
- docs/PROBLEM.md 3절 표의 요구 ID(R1·R2…, 취소선 행 제외)가 「된다」나 「안 된다」 절에 한 번은 나와야 한다. 그 파일이나 R 형식 ID 가 없으면 대조를 건너뛴다고 출력한다. `R1~R3` 같은 줄임은 양 끝만 센다.
- 「AI 활용 기록」 절(제목)이 있어야 한다 — 숫자 대조는 제출 점검(`submit` 스킬)이 한다.
- README 전체에서 백틱으로 언급한 경로도 존재를 확인한다(없는 파일 인용 = 감점).
왜: 심사는 칸 단위로 대조한다 — README 표의 환경변수 하나 누락으로 「부분 충족」이 됐다(README 「된다」 표 칸마다 증거가 있어야 한다
"""
import re
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # cp949 콘솔에서도 한글 출력
from pathlib import Path

TOKEN = re.compile(r"`([^`]+)`")
REQ_ID = re.compile(r"(?<![A-Za-z0-9_])R\d+(?![0-9])")  # 한글 조사가 붙어도 잡는다(\b 는 「R1을」에서 실패)
# 확장자가 숫자뿐이면 경로가 아니다 — 0.0.0.0:3000 · 0.95 · 20.19 · python3.11
PATHLIKE = re.compile(r"^[\w./-]+\.(?![0-9]+(?::|$))[A-Za-z0-9]{1,6}(?:(?::\d+(?:-\d+)?)|(?:::[\w\[\]-]+))?$|^[\w.-]+/[\w./-]+$")


def is_path(tok):
    return bool(PATHLIKE.match(tok)) and not tok.startswith(("http", "-"))


def check_path(tok, base):
    """경로 토큰 하나 → 문제 문자열 또는 None."""
    test = None
    if "::" in tok:
        tok, test = tok.split("::", 1)
    m = re.match(r"^(.*?):(\d+)(?:-(\d+))?$", tok)
    path, end = (m.group(1), int(m.group(3) or m.group(2))) if m else (tok, None)
    f = base / path
    if not f.exists():
        return f"없는 파일: {path}"
    if f.is_file():
        text = f.read_text(encoding="utf-8", errors="replace")
        if end and len(text.splitlines()) < end:
            return f"{path} 는 {len(text.splitlines())}줄인데 {end}줄을 인용"
        if test and test.split("[")[0] not in text:
            return f"{path} 안에 테스트 {test} 없음"
    return None


def done_table(lines):
    """「된다」 절의 첫 표 → [(줄번호, 기능 칸, 증거 칸)]."""
    rows, in_sec = [], False
    for i, line in enumerate(lines, 1):
        if line.lstrip().startswith("#") or line.strip().startswith("**"):
            title = line.strip("#* \t")
            if "된다" in title and "안 된다" not in title:
                in_sec, rows = True, []
                continue
            if in_sec and rows:
                break
            if in_sec and line.lstrip().startswith("#"):
                in_sec = False
        if in_sec and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 2 and not set(cells[0]) <= set("-: ") and not cells[1].startswith("증거"):
                rows.append((i, cells[0], cells[1]))
    return rows


def requirement_ids(base):
    """docs/PROBLEM.md 3절 표의 요구 ID 집합. 파일·절이 없으면 빈 집합."""
    f = base / "docs" / "PROBLEM.md"
    if not f.is_file():
        return set()
    ids, in_sec = set(), False
    for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("## "):
            in_sec = line.startswith("## 3.")
        elif in_sec and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 2 and re.fullmatch(r"R\d+", cells[0]) and cells[1] and "~~" not in cells[1]:
                ids.add(cells[0])
    return ids


def covered_ids(lines):
    """「된다」·「안 된다」 절 본문에 나온 요구 ID(취소선 안은 안 센다)."""
    ids, level = set(), None
    for line in lines:
        s = line.strip()
        head = re.match(r"(#+)\s", s)
        if head and level and len(head.group(1)) <= level:
            level = None
        if "된다" in s and (head or (s.startswith("**") and s.endswith("**"))):
            level = len(head.group(1)) if head else 6
            continue
        if level:
            ids |= set(REQ_ID.findall(re.sub(r"~~.*?~~", "", line)))
    return ids


def check(readme):
    readme = Path(readme)
    base = readme.parent
    text = readme.read_text(encoding="utf-8")
    lines = text.splitlines()
    problems = []
    rows = done_table(lines)
    if not rows:
        return 2, ["「된다」 표를 못 찾음 — README-TEMPLATE 형식인지 확인"]
    if not any(l.lstrip().startswith("#") and "AI 활용 기록" in l for l in lines):
        problems.append("「AI 활용 기록」 절 없음 — README-TEMPLATE 의 절을 세션.txt·DECISIONS·git log·PLAN 시간 기준선에서 세어 채운다")
    for n, feat, ev in rows:
        toks = TOKEN.findall(ev)
        if not toks:
            problems.append(f"L{n} 「{feat}」: 증거 칸에 백틱 토큰 없음")
    for n, line in enumerate(lines, 1):
        for tok in TOKEN.findall(line):
            if is_path(tok):
                p = check_path(tok, base)
                if p:
                    problems.append(f"L{n}: {p}")
    reqs = requirement_ids(base)
    missing = sorted(reqs - covered_ids(lines), key=lambda r: int(r[1:]))
    if missing:
        problems.append(f"요구 ID 누락: {', '.join(missing)} — 「된다」나 「안 된다」에 적는다(docs/PROBLEM.md 3절)")
    note = f"요구 ID {len(reqs)}개 대조" if reqs else "요구 ID 대조 건너뜀(docs/PROBLEM.md 3절에 R 형식 ID 없음)"
    return (1 if problems else 0), problems or [f"통과 — 「된다」 {len(rows)}행 모두 증거 있음 · {note}"]


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__.splitlines()[2])
        raise SystemExit(2)
    rc, msgs = check(sys.argv[1])
    print("\n".join(msgs))
    raise SystemExit(rc)
