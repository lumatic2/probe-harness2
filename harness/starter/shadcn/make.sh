#!/usr/bin/env bash
# shadcn 기반 한국어 운영 화면을 한 번에 세운다 — 당일 화면의 유일한 출발점. 페이지 6(대시보드·목록·상세·판정 입력·리포트·위젯 모음) + 도메인 설정에 해당 키가 있을 때만 켜지는 8(일정 격자 #/schedule · 문서 검토 #/review · AI 기능 #/assist · CSV 올리기 #/import · 기준값 설정 #/settings · 데이터셋 #/datasets · 실행 #/run · 노드 그래프 #/graph) + 로그인·내 정보 · 위젯 W1~W19(W17 AI 대화창은 설정 chat 이 있을 때만 헤더 버튼) · 도메인 설정 견본 9종. 숫자의 정본은 harness/guides/DESIGN.md 머리와 overlay/src/lib/pages.ts.
# 사용: (작업 공간 루트에서) bash harness/starter/shadcn/make.sh [폴더=src/ui]   → 끝나면 cd src/ui && npx vite   (0.0.0.0:3000, PORT 환경변수로 바꿀 수 있음, strictPort). Dockerfile·DESIGN.md 도 src/ui 를 기본으로 본다.
# 순서: vite 뼈대 → npm install → tailwind → 별칭 → shadcn init(+토큰 확인·1회 재시도) → dashboard-01 + 필요한 부품 → overlay/ + 도메인 복사 → SK 테마 → tsc + vite build
# 도메인 고르기: VITE_DOMAIN=education npx vite build (또는 주소 ?domain=education). 바꾸는 순서는 harness/starter/DOMAIN.md
# overlay/server/ = /api/assist · /api/chat 의 AI 어댑터(OPENAI_API_KEY 가 있으면 OpenAI, 없으면 모의 응답) — vite.config.ts 가 불러 쓴다.
# overlay/ = 우리 소스만(키트엔 node_modules 를 못 넣는다). 앱 루트 기준 경로로 들어 있고 그대로 복사된다 — data/datasets/schema.example.json 까지(Dockerfile 이 data/ 를 COPY 하므로 비워 두지 않는다).
# 10분 안에 안 끝나면 멈추고 사용자에게 알린다(npm 이 막힌 환경이면 화면 없이 API·CSV 출력으로 간다). macOS 기본 bash 3.2 에서도 돈다.
set -euo pipefail
# Node 하한 = 20.19 — create-vite/vite 의 engines 가 ^20.19 || >=22.12 (shadcn CLI 는 >=20.18.1). Node 18 에서는 생성기가 실패한다 → 모자라면 시작 전에 멈추고 사용자에게 알린다.
NODE_V="$(node -v 2>/dev/null || true)"; NODE_V="${NODE_V#v}"
NODE_MAJOR="${NODE_V%%.*}"; NODE_REST="${NODE_V#*.}"; NODE_MINOR="${NODE_REST%%.*}"
case "$NODE_MAJOR$NODE_MINOR" in ''|*[!0-9]*) NODE_MAJOR=0; NODE_MINOR=0 ;; esac
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  echo "Node ${NODE_V:-없음} — shadcn 생성기는 20.19+ 필요. Node 를 올리거나 사용자에게 알린다"; exit 2
fi
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="${1:-src/ui}"
t0=$(date +%s); step() { echo "▶ [$(( $(date +%s)-t0 ))s] $*"; }
[ -d "$HERE/overlay/src" ] || { echo "overlay/ 가 없습니다: $HERE/overlay"; exit 1; }
step "Vite + React + TS 뼈대"; mkdir -p "$(dirname "$DIR")"; npm create vite@latest "$DIR" -- --template react-ts --no-interactive >/dev/null
cd "$DIR"
step "npm install"; npm install --no-audit --no-fund >/dev/null
step "Tailwind"; npm install --no-audit --no-fund tailwindcss @tailwindcss/vite >/dev/null; npm install --no-audit --no-fund -D @types/node >/dev/null
step "노드 그래프(W19) — React Flow"; npm install --no-audit --no-fund @xyflow/react >/dev/null
cp "$HERE/overlay/vite.config.ts" vite.config.ts
echo '@import "tailwindcss";' > src/index.css
node -e '
const fs=require("fs");
for (const f of ["tsconfig.json","tsconfig.app.json"]) {
  const d=JSON.parse(fs.readFileSync(f,"utf8").replace(/\/\*[\s\S]*?\*\//g,""));
  d.compilerOptions=Object.assign(d.compilerOptions||{},{paths:{"@/*":["./src/*"]}});
  // 도메인 설정(JSON)에서 온 값은 모양이 설정마다 달라 any — 콜백 인자 타입 표기를 강제하지 않는다(나머지 strict 는 그대로)
  if (f==="tsconfig.app.json") d.compilerOptions.noImplicitAny=false;
  fs.writeFileSync(f,JSON.stringify(d,null,2));
}'
# init 이 가끔(네트워크 흔들림) src/index.css 에 색 토큰(--primary 등)을 못 쓰고 끝난다(동시 실행 중 자주) → 토큰을 확인하고 없으면 init 부터 한 번 다시, 그래도 없으면 동봉 index.base.css.
install_ui() {
  npx -y shadcn@latest init -y "$@" -b radix -p nova --no-monorepo </dev/null >/dev/null
  # 부품은 한 번의 add 에 이름을 나열한다(dashboard-01 이 sidebar·sheet·select·table·tabs·chart·sonner·toggle-group·badge·checkbox 등을 함께 가져온다).
  npx -y shadcn@latest add dashboard-01 radio-group textarea progress alert switch collapsible dialog alert-dialog popover card input label field -y </dev/null >/dev/null
}
has_tokens() { local t; for t in --background --foreground --primary --border --ring; do grep -q -- "$t:" src/index.css || { echo "  index.css 에 $t 없음"; return 1; }; done; }
step "shadcn init (preset nova, 비대화형) + dashboard-01 + 입력·확인·피드백 부품"
install_ui
if ! has_tokens; then step "색 토큰이 없음 — shadcn init 을 한 번 다시 합니다"; install_ui --force; fi
# 그래도 없으면 키트에 동봉한 index.css(같은 레시피가 성공했을 때 만든 것 — 라이트·Pretendard 처리까지 된 본)로 갈아 끼운다. 부품 파일은 있어야 한다.
if ! has_tokens; then
  [ -f src/lib/utils.ts ] && [ -f src/components/ui/sidebar.tsx ] || { echo "shadcn init/add 가 부품을 만들지 못했습니다(네트워크). 다시 실행하세요."; exit 1; }
  step "색 토큰을 키트 동봉본(index.base.css)으로 채웁니다"; cp "$HERE/index.base.css" src/index.css; has_tokens || exit 1
fi
step "우리 소스(overlay) 덮어쓰기"; cp -R "$HERE/overlay/." .
# 도메인 설정·샘플 데이터·공통 계산 = starter/domains. 생성기는 앱에 필요 없다. 어느 도메인을 띄울지는 VITE_DOMAIN 또는 src/domain/active.json.
mkdir -p src/domain; cp -R "$HERE/../domains/." src/domain/; rm -f src/domain/gen-sample.mjs src/domain/csv-to-sample.mjs src/domain/*.test.mjs src/domain/*/gen.mjs
rm -rf src/domain/*/import-samples   # CSV 올리기 시험용 파일(domains/alarm/import-samples)은 앱에 싣지 않는다
# Select 는 트리거 아래로 열려야 한다(원본 기본 item-aligned 는 트리거를 덮는다) — 기본 위치만 popper 로, 나머지 모양은 원본 그대로
sed -i.bak 's/position = "item-aligned"/position = "popper"/' src/components/ui/select.tsx && rm -f src/components/ui/select.tsx.bak
grep -q 'position = "popper"' src/components/ui/select.tsx || { echo "select.tsx 의 기본 위치를 popper 로 바꾸지 못했습니다"; exit 1; }
# 폰트 = Pretendard 고정(키트 동봉 woff2, 외부 CDN 없음). vendor/fonts 는 키트 원본에선 harness 위, 미러(공개 레포)에선 레포 루트 — 위로 올라가며 찾는다.
FONT=""; d="$HERE"
while [ "$d" != "/" ] && [ "$d" != "." ]; do [ -f "$d/vendor/fonts/PretendardVariable.woff2" ] && { FONT="$d/vendor/fonts/PretendardVariable.woff2"; break; }; d="$(dirname "$d")"; done
[ -n "$FONT" ] || { echo "vendor/fonts/PretendardVariable.woff2 를 찾지 못했습니다"; exit 1; }
mkdir -p src/assets; cp "$FONT" src/assets/PretendardVariable.woff2
# 공통 사이드바 공식 로고 — 외부 요청 없이 사용하는 정적 자산.
BRAND="$(dirname "$(dirname "$FONT")")/skhynix/assets"
if [ -d "$BRAND" ]; then mkdir -p public/brand; cp -R "$BRAND/." public/brand/; fi
# 라이트 모드만 — shadcn init 이 넣은 .dark 블록·dark 변형 선언을 지운다
node - <<'JS'
const fs = require("fs"); let s = fs.readFileSync("src/index.css", "utf8");
s = s.replace(/@custom-variant dark[^\n]*\n/g, "");
// 폰트: shadcn nova 의 Geist(@fontsource) 대신 Pretendard — @theme inline 의 리터럴을 바꿔야 font-sans 유틸리티가 따라온다
s = s.replace(/@import "@fontsource-variable\/geist";\n/, "");
s = s.replace(/--font-sans:\s*'Geist Variable', sans-serif;/, '--font-sans: "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;');
const i = s.search(/\n\.dark\s*\{/);
if (i >= 0) { let k = s.indexOf("{", i), n = 0; for (; k < s.length; k++) { if (s[k] === "{") n++; else if (s[k] === "}") { n--; if (!n) break; } } s = s.slice(0, i) + s.slice(k + 1); }
fs.writeFileSync("src/index.css", s);
JS
cat "$HERE/sk-theme.css" >> src/index.css
step "타입 검사 + 빌드"; npx tsc -b; npx vite build >/dev/null
mkdir -p data/store
step "끝 — cd $DIR && npx vite preview (개발 서버는 Browser 에 노출하지 않는다) · Browser: PORT=3000(환경변수 PORT 로 변경), URL=/ · 기동 확인 GET /api/health"
