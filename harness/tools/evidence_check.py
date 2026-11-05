"""evidence_check.py — README 「된다」 표의 칸마다 증거가 실제로 있는지 점검한다 (표준 라이브러리만).

사용: python3 harness/tools/evidence_check.py README.md
종료코드: 0 통과 · 1 증거 없는 칸 또는 없는 파일·테스트 · 2 「된다」 표를 못 찾음(점검 안 됨)

규칙 (README-TEMPLATE 형식):
- 제목에 「된다」가 있고 「안 된다」가 아닌 절의 첫 표를 읽는다. 둘째 열 = 증거.
- 증거 칸에는 백틱(`) 토큰이 1개 이상 있어야 한다.
- 토큰이 파일 경로처럼 보이면(슬래시나 확장자) 파일이 있어야 한다.
  `파일:12` `파일:12-40` → 그 줄까지 파일이 길어야 한다. `파일::테스트이름` → 파일 안에 그 이름이 있어야 한다.
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
    return (1 if problems else 0), problems or [f"통과 — 「된다」 {len(rows)}행 모두 증거 있음"]


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__.splitlines()[2])
        raise SystemExit(2)
    rc, msgs = check(sys.argv[1])
    print("\n".join(msgs))
    raise SystemExit(rc)
