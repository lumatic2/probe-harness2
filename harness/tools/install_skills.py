#!/usr/bin/env python3
"""Register this workspace's kit in the active Codex home without replacing user skills."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

MARKER = ".probe-harness-install.json"


def files(root: Path) -> dict[str, str]:
    result = {}
    for p in sorted(root.rglob("*")):
        if p.is_symlink():
            raise ValueError(f"symbolic link is not an installable skill file: {p}")
        if p.is_file() and p.name != MARKER and "__pycache__" not in p.parts:
            result[p.relative_to(root).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
    return result


def install(workspace: Path, codex_home: Path) -> list[str]:
    workspace = workspace.resolve()
    source = workspace / ".agents" / "skills"
    roots = sorted(p for p in source.iterdir() if p.is_dir() and (p / "SKILL.md").is_file())
    if not roots:
        raise ValueError(f"no kit skills: {source}")
    target = codex_home.expanduser().resolve() / "skills"
    plans = []
    # Preflight every name before writing any skill. Never adopt an existing user skill.
    for src in roots:
        if src.is_symlink():
            raise ValueError(f"symbolic skill directory is not installable: {src}")
        dst = target / src.name
        expected = files(src)
        if dst.exists() or dst.is_symlink():
            if dst.is_symlink() or not dst.is_dir():
                raise ValueError(f"skill path conflict (preserved): {dst}")
            marker = dst / MARKER
            if not marker.is_file():
                if files(dst) == expected:
                    plans.append((src, dst, expected, False))
                    continue
                raise ValueError(f"existing user skill conflict (preserved): {dst}; use repository SKILL.md explicitly")
            previous = json.loads(marker.read_text(encoding="utf-8"))
            if previous.get("owner") != str(workspace) or previous.get("files") != files(dst):
                raise ValueError(f"different workspace or locally changed skill (preserved): {dst}")
        plans.append((src, dst, expected, True))
    target.mkdir(parents=True, exist_ok=True)
    for src, dst, expected, managed in plans:
        if not managed:
            continue
        dst.mkdir(exist_ok=True)
        old = json.loads((dst / MARKER).read_text(encoding="utf-8"))["files"] if (dst / MARKER).exists() else {}
        for rel in old.keys() - expected.keys():
            (dst / rel).unlink()  # Only unchanged files owned by the preceding manifest.
        for rel in expected:
            out = dst / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src / rel, out)
        (dst / MARKER).write_text(json.dumps({"owner": str(workspace), "files": expected}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if files(dst) != expected:
            raise ValueError(f"installed content differs: {dst}")
    return [p.name for p in roots]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    args = parser.parse_args()
    codex_home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
    try:
        names = install(args.workspace, codex_home)
    except (OSError, ValueError) as exc:
        print(f"스킬 등록 FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"스킬 파일 등록 PASS: {len(names)}개 → {codex_home.expanduser().resolve() / 'skills'}")
    print("등록한 스킬: " + ", ".join(names))
    print("파일 등록은 현재 세션의 목록 인식/실행 확인과 다름. harness/tools/check_skills.py로 로더를 확인한다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
