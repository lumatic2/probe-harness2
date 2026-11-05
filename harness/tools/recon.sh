#!/usr/bin/env bash
# harness/tools/recon.sh — 응시 시작 3분 환경 정찰. 의존성 0, 설치·쓰기 없음(읽기만).
# 사용: bash harness/tools/recon.sh   → setup.sh 가 docs/RECON.txt 로 저장한다.
# 시크릿 원칙: 환경변수는 **이름만** 찍는다. 값은 절대 출력하지 않는다.
set -u
sec() { printf '\n== %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }
ver() { if have "$1"; then printf '%-8s %s\n' "$1" "$("$@" 2>&1 | head -n 1)"; else printf '%-8s (없음)\n' "$1"; fi; }

sec "위치"
echo "pwd: $(pwd)"; echo "user: $(id -un 2>/dev/null || echo ?)"; uname -a 2>/dev/null | head -n 1

sec "언어·도구"
ver python3 --version; ver python --version; ver node --version; ver npm --version
ver git --version; ver uv --version; ver curl --version

sec "AI CLI (있으면 버전만 — 로그인 상태는 직접 1회 호출로 확인)"
ver codex --version

sec "파이썬 표준 외 패키지 (있으면 쓰고, 없으면 표준 라이브러리로)"
PY="$(command -v python3 || command -v python || true)"
if [ -n "$PY" ]; then
  for m in pandas numpy openpyxl matplotlib sklearn; do
    "$PY" -c "import $m" >/dev/null 2>&1 && echo "  $m: 있음" || echo "  $m: 없음"
  done
fi

sec "키 환경변수 (이름만)"
# env | cut 은 여러 줄 값의 둘째 줄부터 값 그대로 내보낸다 — 이름만 주는 compgen 을 쓴다
compgen -e | grep -Ei 'key|token|secret|api|openai|anthropic' | sort || echo "  (없음)"

sec "인터넷 (3초)"
if have curl; then
  curl -sS -o /dev/null -m 3 -w 'pypi %{http_code}\n' https://pypi.org/simple/ 2>&1 | tail -n 1
else echo "  curl 없음 — 확인 못 함"; fi

sec "과제 파일 후보"
for d in . ./uploads "$HOME/Desktop/assignment" "$HOME/assignment"; do
  [ -d "$d" ] && { echo "-- $d"; ls -la "$d" 2>/dev/null | head -n 30; }
done

sec "git"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git log --oneline -3 2>/dev/null || echo "  git 저장소 아님 — git init 필요(커밋 타임라인이 채점 데이터다)"

sec "디스크"
df -h . 2>/dev/null | tail -n 1
echo; echo "recon 끝 — 위 결과로 검증 수단(언어·테스트 러너)을 지금 정한다."
