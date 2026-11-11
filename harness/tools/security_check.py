"""security_check.py — 작업 공간 보안 기계 점검 (표준 라이브러리만).

사용: python3 harness/tools/security_check.py [작업 공간 경로]
종료코드: 0 막는 것 없음(「확인 필요」는 있을 수 있다) · 1 막는 것 있음
막는 것(FAIL): 추적되는 .env · 코드·문서에 박힌 키 값 · 추적되는 node_modules
확인 필요(WARN): 외부 주소·HTTP 라이브러리 · 셸 실행·eval · 5MB 넘는 추적 파일 · 캐시 잔재
`security` 스킬 7항목 중 1(시크릿)·3(외부 전송)·5(권한·실행)·7(제출물 위생)을 기계로 센다.
2(입력 검증)·4(의존성)·6(AI 호출)은 사람이 읽고 판정한다 — 이 도구는 그 앞의 기계 점검이다.
M4 오케 검수 · M6 보안 서브에이전트에서 같은 명령으로 돌린다.
"""
import os
import re
import subprocess
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # cp949 콘솔에서도 한글 출력
from pathlib import Path

KIT_DIRS = (".agents/", "harness/guides/", "harness/roles/", "harness/tools/", "harness/approaches/", "harness/methods/", "harness/pitch/")  # 킷 문서 — 패턴 설명·출처 주소(sk-hynix-… 꼴)가 들어 있어 시크릿 검사에서 뺀다. 가져다 쓴 코드는 src/ 에서 검사된다
STARTER = "harness/starter/"  # 화면 출발점 원본 — 「확인 필요」는 세지 않는다(가져다 쓴 복사본은 src/ 등에서 검사된다)
CODE_EXT = {".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".sh", ".go", ".rb", ".java"}
SECRET = re.compile(
    r"(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}"
    r"|(?i:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*[\"'][^\"'\s]{8,}[\"'])"
)
PLACEHOLDER = re.compile(r"(?i)(test|dummy|example|sample|fake|xxx|0000|your[_-]|placeholder|changeme|<[^>]+>)")
EXTERNAL = re.compile(
    r"(\baxios\b|\brequests\.(get|post|put|patch|delete)\b|urllib\.request|http\.client|\bhttpx\b|XMLHttpRequest"
    r"|\bcurl\s|\bwget\s|https?://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[\w.-]+)"
)
EXEC = re.compile(r"(\bsubprocess\b|os\.system|child_process|(?<![.\w])eval\(|(?<![.\w])exec\()")  # 정규식 .exec( 는 제외
JUNK = re.compile(r"(^|/)(__pycache__/|\.DS_Store$|\.pytest_cache/|\.cache/)")


def tracked(root):
    try:
        out = subprocess.run(["git", "ls-files", "-z"], cwd=root, capture_output=True, check=True).stdout
        return [p for p in out.decode("utf-8", "replace").split("\0") if p]
    except (OSError, subprocess.CalledProcessError):
        files = []
        for d, dirs, fs in os.walk(root):
            dirs[:] = [x for x in dirs if x not in (".git", "node_modules")]
            for f in fs:
                files.append(os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/"))
        return files


def main(argv):
    root = Path(argv[1] if len(argv) > 1 else ".").resolve()
    fails, warns = [], []
    for rel in tracked(root):
        p = root / rel
        name = rel.rsplit("/", 1)[-1]
        if (name == ".env" or name.startswith(".env.")) and name != ".env.example":
            fails.append(f"[1 시크릿] {rel} — .env 가 git 에 추적된다 → git rm --cached {rel}")
        if rel.startswith("node_modules/") or "/node_modules/" in rel:
            fails.append(f"[7 위생] {rel} — node_modules 가 추적된다 → .gitignore")
            continue
        if JUNK.search(rel):
            warns.append(f"[7 위생] {rel} — 캐시 잔재")
        try:
            size = p.stat().st_size
        except OSError:
            continue
        if size > 5 * 1024 * 1024:
            warns.append(f"[7 위생] {rel} — {size // (1024 * 1024)}MB 추적 파일(데이터 복사본인가)")
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        is_kit = rel.startswith(KIT_DIRS) or rel == ".env.example"
        scan_code = p.suffix in CODE_EXT and not is_kit and not rel.startswith(STARTER)
        for n, line in enumerate(text.splitlines(), 1):
            m = SECRET.search(line)
            if not is_kit and m and not PLACEHOLDER.search(m.group(0)):
                fails.append(f"[1 시크릿] {rel}:{n} — 키·비밀번호 값이 박혀 있다 → .env 로 옮기고 키를 재발급")
            if scan_code:
                if EXTERNAL.search(line):
                    warns.append(f"[3 외부 전송] {rel}:{n} — 외부 주소·HTTP 라이브러리(과제 데이터가 밖으로 나가나 확인)")
                if EXEC.search(line):
                    warns.append(f"[5 권한·실행] {rel}:{n} — 셸 실행·eval(사용자 입력이 들어가나 확인)")
    for f in fails:
        print("FAIL", f)
    for w in warns:
        print("확인 필요", w)
    print(f"security_check: 막는 것 {len(fails)} · 확인 필요 {len(warns)}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
