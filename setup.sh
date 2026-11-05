#!/usr/bin/env bash
# setup.sh — 클론한 하네스를 작업 공간에 합친다. 에이전트가 README 「세팅」 절대로 실행한다.
# 사용: (작업 공간에서) bash probe-harness/setup.sh [작업공간]
# 결과: 루트에 AGENTS.md·docs/·.agents/·harness/(guides·roles·starter·tools·vendor·verify.sh) 가 생긴다.
#   작업공간 기본값 = 현재 폴더. 클론 폴더 안에서 실행했으면 그 부모.
# 규칙: 과제가 준 파일은 덮어쓰지 않는다. AGENTS.md 만 예외 — 우리 것 + 원래 내용을 맨 끝 절에 붙인다.
set -eu
SRC="$(cd "$(dirname "$0")" && pwd)"
TGT="${1:-$PWD}"
TGT="$(cd "$TGT" && pwd)"
[ "$TGT" = "$SRC" ] && TGT="$(dirname "$SRC")"
[ "$TGT" = "$SRC" ] && { echo "작업 공간과 클론 폴더가 같다 — 인자로 작업 공간을 넘겨라" >&2; exit 1; }
cd "$TGT"

# 0. 과제 원본 목록 — 합치기 전에 있던 파일 전부(종류·깊이 조건 없음). 이 목록이 곧 보호 대상이다(과제설정 1절).
#    같은 클론으로 다시 돌리는 경우(AGENTS.md 앞부분이 이미 키트 것)면 목록은 첫 실행이 적었으니 다시 찍지 않는다 — 키트 파일이 원본으로 잡힌다.
CLONE="$(basename "$SRC")"
RERUN=""
if [ -s AGENTS.md ] && head -c "$(wc -c < "$SRC/AGENTS.md")" AGENTS.md | cmp -s - "$SRC/AGENTS.md"; then RERUN=1; fi
ORIGIN=""; TASK_FILES="(재실행 — 과제설정 1절 참고)"
if [ -z "$RERUN" ]; then
ORIGIN="$(find . -mindepth 1 -type f -not -path './.git/*' -not -path "./$CLONE/*" -not -path '*/node_modules/*' -not -name '메모.md' -printf '%P\n' 2>/dev/null | sort)"
TASK_FILES="$(find . -mindepth 1 -type f -not -path './.git/*' -not -path "./$CLONE/*" -not -path '*/node_modules/*' -not -name '메모.md' -printf '%P(%s B) ' 2>/dev/null | head -c 600)"
fi
DATA_FILES="$(printf '%s\n' "$ORIGIN" | grep -Ei '\.(csv|tsv|xlsx|xls|parquet|jsonl|json|sqlite|db)$' | grep -Ev '(^|/)(package[^/]*|tsconfig[^/]*)\.json$' || true)"
in_dir='{ d=$0; if (sub(/\/[^\/]*$/, "", d) == 0) d="."; n[d]++; f[NR]=$0; g[NR]=d }'
DATA_DIRS="$(printf '%s\n' "$DATA_FILES" | sed '/^$/d' | awk "$in_dir"' END { for (k in n) print k "|" n[k] }' | sort)"
# 데이터가 아닌 원본은 파일마다 적고, 파일이 많은 폴더(10개 초과)만 한 줄로 묶는다
ROOT_MD="$(printf '%s\n' "$ORIGIN" | grep -vxF -f <(printf '%s\n' "$DATA_FILES") | grep -vxF 'AGENTS.md' | sed '/^$/d' | awk "$in_dir"' END { for (i=1; i<=NR; i++) { if (n[g[i]] > 10 && g[i] != ".") { if (!s[g[i]]++) print g[i] "/ (파일 " n[g[i]] "개)" } else print f[i] } }' || true)"

KEPT=""
merge() {  # $1 = SRC 기준 상대 경로
  local rel="$1"
  if [ -d "$SRC/$rel" ]; then
    mkdir -p "$rel"
    local c; for c in "$SRC/$rel"/* "$SRC/$rel"/.[!.]*; do if [ -e "$c" ]; then merge "$rel/$(basename "$c")"; fi; done
  elif [ -e "$rel" ]; then
    KEPT="$KEPT $rel"
  else
    cp "$SRC/$rel" "$rel"
  fi
}

# 1. AGENTS.md — 과제가 준 내용이 있으면 우리 것 뒤에 붙인다
# 같은 클론으로 실패 후 재실행할 때 이미 붙인 과제 지침을 다시 감싸지 않는다.
if [ -s AGENTS.md ] && head -c "$(wc -c < "$SRC/AGENTS.md")" AGENTS.md | cmp -s - "$SRC/AGENTS.md"; then
  echo "AGENTS.md: 이미 설치한 키트 지침과 뒤의 과제 지침을 보존했다"
elif [ -s AGENTS.md ]; then
  ORIG="$(cat AGENTS.md)"
  { cat "$SRC/AGENTS.md"; printf '\n## 과제 환경이 준 원래 지침 (충돌하면 이쪽이 우선)\n\n%s\n' "$ORIG"; } > AGENTS.md
  echo "AGENTS.md: 과제 원래 지침을 맨 끝 절에 붙였다"
else
  cp "$SRC/AGENTS.md" AGENTS.md
fi

# 2. 나머지 — README.md(과제 원문 자리)·.git·이 스크립트는 건너뛴다
for c in "$SRC"/* "$SRC"/.[!.]*; do
  [ -e "$c" ] || continue
  b="$(basename "$c")"
  case "$b" in .git|README.md|setup.sh|AGENTS.md) continue;; esac
  merge "$b"
done
if [ -n "$KEPT" ]; then echo "보존(과제 파일, 안 덮음):$KEPT"; fi
CLASH="$(printf '%s' "$KEPT" | tr ' ' '\n' | grep -vxF '.gitignore' | sed '/^$/d' | tr '\n' ' ' || true)"
CLASH_NOTE=""
if [ -n "$CLASH" ] && [ -z "$RERUN" ]; then CLASH_NOTE="   이름 충돌(과제 파일을 보존해 킷 파일이 안 깔림): ${CLASH}
"; fi
# 세 문서 틀은 지금 준비하고, 사실/합의/구현 내용은 해당 단계에서 채운다.
for doc in docs/과제설정.md docs/PROBLEM.md docs/SOLUTION.md docs/ARCHITECTURE.md docs/PLAN.md; do
  [ -e "$doc" ] || { echo "필수 문서 틀 누락: $doc" >&2; exit 1; }
done
echo "문서 준비: 과제설정.md(이번 과제 값) · PROBLEM.md(문제) · SOLUTION.md(무엇을 왜) · ARCHITECTURE.md(서비스 구조) · PLAN.md(작업 계획) — 기존 과제 문서는 보존"
# 2a. 과제설정 1절 — 0 에서 찍은 과제 원본 전부와 데이터 폴더를 표에 적어 둔다(역할·취급은 오케가 과제 시작 때 채운다)
if [ -n "$ROOT_MD$DATA_DIRS" ]; then
  PYC="$(command -v python3 || command -v python || true)"
  [ -n "$PYC" ] && ROOT_MD="$ROOT_MD" DATA_DIRS="$DATA_DIRS" "$PYC" harness/tools/task_config_seed.py docs/과제설정.md
fi
chmod +x harness/verify.sh harness/tools/recon.sh

# 2b. 레포 스킬을 먼저 확인한다. 인식되면 전역 사본을 만들 필요가 없다.
PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "스킬 확인에 Python 3 필요" >&2; exit 1; }
SKILL_LOADER="미확인"
if "$PY" harness/tools/check_skills.py --workspace "$TGT"; then
  SKILL_LOADER="PASS(정확한 키트 사본 발견; 전역 복사 생략)"
else
  echo "레포 스킬 로더 미통과 — 활성 홈 등록을 한 번 시도한다"
  if "$PY" harness/tools/install_skills.py --workspace "$TGT"; then
    if "$PY" harness/tools/check_skills.py --workspace "$TGT"; then
      SKILL_LOADER="PASS(등록 후 별도 로더)"
    else
      echo "자동 호출 미확인 — .agents/skills/<이름>/SKILL.md를 직접 읽어 진행한다"
    fi
  else
    echo "전역 스킬 보존; 등록 실패. 이 레포의 .agents/skills/<이름>/SKILL.md를 직접 읽어 진행한다. 설치 성공으로 보고하지 않는다."
  fi
fi

# 3. 정찰 (환경 한 줄 — 복원 검증은 하지 않는다. 시작점 코드 검증은 구현 때 verify.sh 로)
bash harness/tools/recon.sh > docs/RECON.txt 2>&1 || true
# 3b. 시간 기준선 — 종료 시각 기본값 22:00(재응시 19:00 시작 + 과제 풀이 180분, 늦게 들어가도 연장 없음). PROBE_END=HH:MM 이 주어지면 그 값.
#     정본은 docs/과제설정.md 4절. 원문·화면과 다르면 오케가 과제 시작 때 고치고 PLAN 기준선을 재계산한다 — setup.sh 는 다시 돌리지 않는다.
END="${PROBE_END:-22:00}"; END_SRC="$([ -n "${PROBE_END:-}" ] && echo "PROBE_END" || echo "기본값 — 화면 남은 시간과 다르면 과제 시작 때 재계산")"
EM=$(( 10#${END%%:*} * 60 + 10#${END##*:} ))
at() { local m=$(( EM - $1 )); printf '%02d:%02d' $(( m / 60 )) $(( m % 60 )); }
BASELINE="종료 $END($END_SRC) · 기준선(이쯤이면 원활하다는 참고, 강제 아님): DM 시작 $(at 165) · 문제 확정 $(at 140) · 솔루션 브리핑 OK $(at 120) · 솔루션 확정·구현 시작 $(at 110) · 얇은 결과 시연 $(at 80) · 계획한 구현 끝 $(at 60) · 피드백 끝·동결 $(at 40) · final $(at 20) · 제출 버튼까지 여유 20분"
if [ -f docs/PLAN.md ]; then
  PYW="$(command -v python3 || command -v python || true)"
  [ -n "$PYW" ] && "$PYW" - "$BASELINE" <<'PY'
import sys, re
p = 'docs/PLAN.md'; s = open(p, encoding='utf-8').read()
n = re.sub(r'(## 1\. 시간 기준선\n)[^\n|]*\n', lambda m: m.group(1) + sys.argv[1] + ' (setup.sh 계산)\n', s, count=1)
if n != s: open(p, 'w', encoding='utf-8').write(n)  # 과제가 준 PLAN 이면 손대지 않는다
PY
fi
# 4. 클론 폴더 정리 → git 첫 커밋 (git 신원이 없으면 이 저장소에만 익명 신원)
# 지우는 것은 작업 공간 안의 「클론」(.git 있음)뿐 — 정본 harness/ 같은 원본 폴더에서 돌렸으면 남긴다
if [ -d "$SRC/.git" ]; then
  case "$SRC" in "$TGT"/*) rm -rf "$SRC" 2>/dev/null || echo "클론 폴더 삭제가 막혔다(샌드박스) — git 에서 제외하고 그대로 둔다. 해로울 것 없음: $SRC" ;; *) echo "클론 폴더가 작업 공간 밖이라 남겨 둔다: $SRC" ;; esac
else
  echo "클론이 아닌 폴더라 남겨 둔다: $SRC"
fi
[ -d .git ] || git init -q
git config user.name >/dev/null 2>&1 || git config user.name "probe"
git config user.email >/dev/null 2>&1 || git config user.email "probe@localhost"
# 과제가 준 .gitignore 를 보존하되 시크릿 제외 규칙은 반드시 있게 한다(없으면 덧붙인다)
# 끝 개행이 없으면 첫 규칙이 마지막 줄에 붙어 둘 다 무효가 된다(dist + .env → dist.env)
if [ -s .gitignore ] && [ -n "$(tail -c 1 .gitignore)" ]; then echo >> .gitignore; fi
for rule in ".env" ".env.*" "!.env.example" "*.key" "*.pem" "credentials*.json" "node_modules/" "__pycache__/" "src/ui/data/store/" "메모.md"; do
  grep -qxF -- "$rule" .gitignore 2>/dev/null || echo "$rule" >> .gitignore
done
if [ -d "$SRC/.git" ]; then echo "/$(basename "$SRC")/" >> .git/info/exclude; fi   # 삭제가 막힌 클론 폴더는 커밋에서 제외
git add -A 2>/dev/null
# 커밋 직전 검사 — 시크릿 파일이 staged 면 빼고 경고한다
if leaked="$(git diff --cached --name-only | grep -E '(^|/)\.env(\.[^/]*)?$|\.(key|pem)$|credentials[^/]*\.json$' | grep -v '\.env\.example$')" && [ -n "$leaked" ]; then
  echo "$leaked" | while IFS= read -r f; do git rm -q --cached "$f" 2>/dev/null || true; done
  echo "경고: 시크릿 파일을 커밋에서 뺐다(값은 출력하지 않음): $(echo "$leaked" | tr '\n' ' ')" >&2
fi
git commit -q -m "scaffold: 하네스 세팅" -m "probe-harness clone 후 setup.sh" || echo "커밋 없음(변경 없음)"

N="$(find .agents/skills -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"

NOW="$(TZ=KST-9 date +%H:%M)"

# 6. 환경 한 줄 — RECON 을 에이전트가 요약하지 않아도 되게
ENV_LINE="$(python3 --version 2>/dev/null || python --version 2>/dev/null || echo 'python 없음') · node $(node --version 2>/dev/null || echo 없음) · $(codex --version 2>/dev/null || echo 'codex ?') · 인터넷 $(grep -o 'pypi [0-9]*' docs/RECON.txt | head -1 || echo '?')"

DATA_NOTE=""
if [ -n "$DATA_DIRS" ] || { [ -n "$RERUN" ] && grep -q '데이터 파일' docs/과제설정.md; }; then DATA_NOTE="2b. 데이터 파일이 있다 — 데이터 서브에이전트를 띄운다(프롬프트 = harness/roles/데이터.md + docs/과제설정.md 1절의 데이터 폴더, wait_agent 없이 — 세팅 보고는 이 결과를 기다리지 않는다). 결과 docs/research/데이터.md 는 과제설정·DM·코어가 쓴다.
"; fi

cat <<REPORT
세팅 완료 보고 (setup.sh 가 만든 문장 — 에이전트는 그대로 전한다)
① 깐 것: 스킬 ${N}개 · 로더 ${SKILL_LOADER} · scaffold $(git rev-parse --short HEAD) · 루트 = 과제 원문·AGENTS.md·docs/(과제설정 포함)·.agents/·harness/
② 환경: ${ENV_LINE} (자세히 docs/RECON.txt)
③ 과제 파일: ${TASK_FILES:-(없음 — 과제 파일 위치를 사용자에게 묻는다)}
   과제 원본(전부 docs/과제설정.md 1절에 적어 둠 — 지우거나 옮기거나 덮어쓰지 않는다. 과제 시작 때 문서는 전부 읽는다): $(printf '%s' "$ROOT_MD" | tr '\n' ' ')
${CLASH_NOTE}④ 시간(지금 ${NOW}): ${BASELINE}
다음(에이전트) — 세팅 뒤 할 일의 정본은 이 지시 하나다:
1. 너는 오케다. AGENTS.md · harness/roles/오케.md · harness/guides/지도.md 를 읽는다.
2. \`echo "오케 \${CODEX_THREAD_ID:-미확인} 탭 보고→사용자" >> docs/세션.txt\` — 「미확인」으로 찍혔으면 사용자에게 「/status 에 보이는 thread id 를 붙여 주세요」 한 줄만 묻고 그 값으로 줄을 고친다.
${DATA_NOTE}3. 위 보고 ①~④ 를 그대로 사용자에게 전하고, 아래 줄만 덧붙인다:
   - 「\`\$\` 를 쳐서 handoff 가 목록에 보이면 그대로, 안 보이면 /quit → codex resume」
   - 「설명 탭: 새 탭 → codex → /permissions Full Access → /model → 「harness/roles/설명.md 읽고 역할 파악해. 이 세션은 설명 세션으로 쓸 거야」 → 탭 이름 설명」
   - (이름 충돌 줄이 있을 때만) 「이 파일은 과제 원본이라 덮지 않았습니다 — 어떻게 할까요?」 한 줄을 묻고 답을 받을 때까지 그 파일에 쓰지 않는다
   - \`다음 입력(오케): M0 종료 조건 충족(scaffold 커밋 · 스킬 목록) — 「과제 시작하자」를 치면 M1\`
과제 원문은 아직 읽지 않고(「과제 시작하자」 때 읽는다) 다른 문서도 만들지 않는다. 스킬 목록(\`\$\`)이 resume 뒤에도 안 보이면 \`python3 harness/tools/install_skills.py --workspace .\` 를 한 번 더 돌린 뒤 다시 본다 — 그래도 없으면 .agents/skills/<이름>/SKILL.md 를 직접 읽어 진행한다.
REPORT
