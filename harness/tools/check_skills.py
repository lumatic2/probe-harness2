#!/usr/bin/env python3
"""Ask the native Codex loader for skills, without a model call or authentication copy."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time


def list_skills(workspace: Path, timeout: float = 25) -> dict:
    codex = shutil.which("codex")
    if not codex:
        raise RuntimeError("codex not found")
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen([codex, "app-server"], cwd=workspace, stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=errors, text=True, encoding="utf-8")
        messages = queue.Queue()
        def reader():
            for line in process.stdout:
                try:
                    messages.put(json.loads(line))
                except ValueError:
                    pass
            messages.put(None)
        threading.Thread(target=reader, daemon=True).start()
        deadline = time.monotonic() + timeout
        def send(value):
            process.stdin.write(json.dumps(value) + "\n")
            process.stdin.flush()
        def receive(request_id):
            while True:
                left = deadline - time.monotonic()
                if left <= 0:
                    raise RuntimeError("Codex skills/list timed out")
                try:
                    message = messages.get(timeout=left)
                except queue.Empty:
                    raise RuntimeError("Codex skills/list timed out") from None
                if message is None:
                    raise RuntimeError("Codex app-server exited before skills/list")
                if message.get("id") == request_id:
                    if "error" in message:
                        raise RuntimeError("Codex rejected skills/list: " + str(message["error"].get("code")))
                    return message["result"]
        try:
            send({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "probe_harness_setup", "version": "1"}, "capabilities": {"experimentalApi": True}}})
            receive(1)
            send({"method": "initialized"})
            send({"id": 2, "method": "skills/list", "params": {"cwds": [str(workspace.resolve())], "forceReload": True}})
            return receive(2)
        finally:
            process.stdin.close()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


def same_skill_tree(left: Path, right: Path) -> bool:
    def contents(root):
        result = {}
        for p in root.rglob("*"):
            if p.is_symlink():
                return None
            if p.is_file() and p.name != ".probe-harness-install.json" and "__pycache__" not in p.parts:
                result[p.relative_to(root).as_posix()] = p.read_bytes()
        return result
    actual = contents(left)
    return actual is not None and actual == contents(right)


def check(workspace: Path, result: dict) -> tuple[list[str], list[str]]:
    expected = {p.parent.name: p.resolve() for p in (workspace / ".agents/skills").glob("*/SKILL.md")}
    if not expected:
        raise RuntimeError("no repository skills to verify")
    home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex").expanduser().resolve()
    found = set()
    for group in result.get("data", []):
        for skill in group.get("skills", []):
            name = skill.get("name")
            if name not in expected or not skill.get("enabled", True):
                continue
            path = Path(skill.get("path", "")).resolve()
            allowed = (expected[name], (home / "skills" / name / "SKILL.md").resolve())
            if path in allowed and path.is_file() and same_skill_tree(path.parent, expected[name].parent):
                found.add(name)
    return sorted(found), sorted(expected.keys() - found)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    args = parser.parse_args()
    try:
        result = list_skills(args.workspace)
        found, missing = check(args.workspace, result)
    except (OSError, RuntimeError) as exc:
        print(f"스킬 로더 미확인: {exc}. 현재 탭 목록과 실제 스킬 호출로 확인 필요.", file=sys.stderr)
        return 2
    if missing:
        print("스킬 로더 FAIL — 누락/비활성/다른 사본: " + ", ".join(missing), file=sys.stderr)
        return 1
    print(f"스킬 로더 PASS: {len(found)}개 — " + ", ".join(found))
    print("이는 별도 app-server의 발견 확인이다. 현재 TUI 목록과 실제 작업 수행은 별도로 확인한다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
