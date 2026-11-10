#!/usr/bin/env bash
# verify.sh — 검증 실행 + 기록. 같은 커맨드로 재통과하는 것이 원칙이다.
# 사용: (작업 공간 루트에서) harness/verify.sh "<검증 커맨드>" ["<검증하는 주장 — 요구 ID·한 줄>"]   예) harness/verify.sh "python3 -m unittest discover -s tests -v" "R1 R3 계약"
# 기록: docs/VERIFICATION.md 에 시각(KST)·기준 커밋(+dirty)·커맨드·결과를 append. 전체 출력은 docs/verify-logs/<시각>-<pid>.txt 에 남긴다(.log 는 흔히 ignore 된다 — 제출물·커밋에 남아야 한다)
#       — 승계자가 「무엇을 어느 커밋에서 검사했나」를 재구성할 수 있어야 한다. 옛 PASS 는 다른 커밋에 승계되지 않는다.
# 종료코드 3값: 0 PASS · 1 FAIL(위반) · 2 NOVERIFY(아무것도 검증 안 됨 — 테스트 0개·커맨드 없음).
#   「통과」가 사실은 아무것도 안 돌린 결과일 수 있다. 0개 실행은 통과로 치지 않는다.
set -u
CMD="${1:-}"
CLAIM="${2:--}"
if [ -z "$CMD" ]; then
  echo "사용법: harness/verify.sh \"<검증 커맨드>\"" >&2
  exit 2
fi
LOG_DIR="docs"
LOG="$LOG_DIR/VERIFICATION.md"
FULL_DIR="$LOG_DIR/verify-logs"
mkdir -p "$LOG_DIR" "$FULL_DIR"
TABLE='| 시각 | 기준 커밋 | 주장 | 커맨드 | 결과 | 전체 출력 |\n|---|---|---|---|---|---|\n'
[ -f "$LOG" ] || printf "# VERIFICATION — 검증 실행 기록\n\n$TABLE" > "$LOG"
TS="$(TZ=KST-9 date '+%H:%M:%S')"
REV="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
git diff --quiet HEAD -- . ':(exclude)docs/VERIFICATION.md' 2>/dev/null || REV="$REV+dirty"   # 이 스크립트가 쓰는 기록 파일은 제품 변경이 아니다
FULL="$FULL_DIR/$(TZ=KST-9 date '+%H%M%S')-$$.txt"   # 병렬 실행이 같은 초에 겹쳐도 덮어쓰지 않는다
OUT="$(bash -o pipefail -c "$CMD" 2>&1)"
RC=$?
# 민감값 가림 — 로그는 제출물에 남는다(토큰·키·비밀번호 류 · 키 접두사 · 40자 이상 영숫자 — 밑줄·하이픈이 든 테스트 이름은 가리지 않는다)
OUT="$(printf '%s\n' "$OUT" | sed -E 's/((token|secret|password|passwd|api[_-]?key|authorization)[=: "]+)[^ "]+/\1[가림]/Ig; s/(^|[^A-Za-z0-9])(sk-|ghp_|gho_|github_pat_|xox[abprs]-|AKIA|AIza)[A-Za-z0-9_\-]{16,}/\1[가림]/g; s/[A-Za-z0-9]{40,}/[가림]/g')"
# 테스트 0개 신호 (unittest · pytest · node --test)
if echo "$OUT" | grep -Eq '^Ran 0 tests|collected 0 items|no tests ran|^# tests 0$|^ℹ tests 0$'; then
  RES="NOVERIFY"; RC=2
elif [ $RC -eq 0 ]; then RES="PASS"
else RES="FAIL($RC)"; RC=1
fi
{ printf '# %s · %s · rc=%s · 주장: %s\n$ %s\n\n' "$TS" "$REV" "$RC" "$CLAIM" "$CMD"; echo "$OUT"; } > "$FULL"
tail -n 1 "$LOG" | grep -q '^|' || printf "\n$TABLE" >> "$LOG"   # 그 사이 글로 적은 절(기대값·점검 기준 고정 해시 등)이 있으면 표를 새로 연다
printf '| %s | `%s` | %s | `%s` | **%s** | `%s` |\n' "$TS" "$REV" "$CLAIM" "$CMD" "$RES" "$FULL" >> "$LOG"
echo "$OUT" | tail -n 20
echo "── verify: $RES ($TS · $REV) → $LOG · 전체 $FULL"
exit $RC
