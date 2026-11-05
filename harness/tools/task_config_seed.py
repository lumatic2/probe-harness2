#!/usr/bin/env python3
"""task_config_seed.py — setup.sh 가 찾은 원문 파일 후보·데이터 폴더를 docs/과제설정.md 1절 표에 적어 둔다.
사용: ROOT_MD="<줄바꿈 목록>" DATA_DIRS="<경로|개수 줄바꿈 목록>" python3 harness/tools/task_config_seed.py docs/과제설정.md
역할·취급 칸은 비워 둔다 — 오케가 「과제 시작하자」 턴에 원문을 읽고 채운다. 이미 채워진 표(README 행 외에 행이 있음)는 건드리지 않는다."""
import io
import os
import sys


def main(path: str) -> int:
    s = io.open(path, encoding="utf-8").read()
    anchor = "| `README.md` | | | |\n"
    if anchor not in s:
        return 0  # 이미 오케가 채웠거나 틀이 다르다 — 덮지 않는다
    rows = []
    for f in (os.environ.get("ROOT_MD") or "").splitlines():
        f = f.strip()
        if f and f != "README.md":
            rows.append(f"| `{f}` | | | setup.sh 발견 — 오케가 읽고 채운다 |")
    for d in (os.environ.get("DATA_DIRS") or "").splitlines():
        d = d.strip()
        if not d:
            continue
        p, _, n = d.partition("|")
        p = p[2:] if p.startswith("./") else p
        rows.append(f"| `{p}/` | 데이터 파일 {n}개 | 보존 | setup.sh 발견 |")
    if not rows:
        return 0
    s = s.replace(anchor, anchor + "\n".join(rows) + "\n", 1)
    io.open(path, "w", encoding="utf-8", newline="\n").write(s)
    print(f"과제설정 1절: 원문 후보 {len(rows)}행 기록")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "docs/과제설정.md"))
