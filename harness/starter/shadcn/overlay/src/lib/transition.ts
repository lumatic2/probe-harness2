// transition.ts — 로그인·로그아웃 전환 화면. 로그인·로그아웃은 데이터를 세션에 맞게 다시 받으려고 페이지를 새로 읽는다 — 그 사이에 화면이 깜박이지 않게, 누른 순간부터 최소 1초 동안 같은 전환 화면을 덮어 둔다.
// 흐름: auth.tsx 가 beginTransition(kind) → 새로고침 → main.tsx 가 맨 처음 resumeTransition() 으로 같은 화면을 다시 덮음 → App 이 그릴 준비가 되면 endTransition() → 누른 지 1초가 지났을 때 걷는다.
// React 밖의 DOM 한 장이다(새로고침 앞뒤와 App 이 뜨기 전에도 보여야 해서). 저장소가 막힌 틀에서는 표식을 못 남기므로 새로고침 뒤에는 이어지지 않고 그냥 넘어간다.
const KEY = 'sk-transition'
const MIN_MS = 1000
const ID = 'sk-transition'
type Kind = 'login' | 'logout'
const TEXT: Record<Kind, { title: string; sub: string }> = {
  login: { title: '로그인하는 중입니다', sub: '계정에 맞는 화면을 준비하고 있습니다.' },
  logout: { title: '로그아웃하는 중입니다', sub: '세션을 끝내고 로그인 화면으로 돌아갑니다.' },
}

function mount(kind: Kind, startedAt: number) {
  if (document.getElementById(ID)) return
  const el = document.createElement('div')
  el.id = ID
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.dataset.kind = kind
  el.dataset.startedAt = String(startedAt)
  el.className = 'sk-transition'
  const left = Math.max(0, MIN_MS - (Date.now() - startedAt))
  el.innerHTML = `<div class="sk-transition-box"><p class="sk-transition-title"></p><p class="sk-transition-sub"></p><div class="sk-transition-bar"><span style="animation-duration:${MIN_MS}ms;animation-delay:-${MIN_MS - left}ms"></span></div></div>`
  el.querySelector('.sk-transition-title')!.textContent = TEXT[kind].title
  el.querySelector('.sk-transition-sub')!.textContent = TEXT[kind].sub
  document.body.appendChild(el)
}

// 로그인·로그아웃 버튼을 누른 순간 — 전환 화면을 덮고, 새로고침 뒤에 이어 가도록 표식을 남긴다.
export function beginTransition(kind: Kind) {
  const at = Date.now()
  try { sessionStorage.setItem(KEY, JSON.stringify({ kind, at })) } catch { /* 저장소가 막힌 틀 */ }
  mount(kind, at)
}

// 페이지가 새로 뜬 직후(main.tsx 첫 줄) — 표식이 있으면 같은 전환 화면을 바로 다시 덮는다.
export function resumeTransition() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return
    const { kind, at } = JSON.parse(raw) as { kind: Kind; at: number }
    if ((kind === 'login' || kind === 'logout') && Date.now() - at < 10_000) mount(kind, at)
    else sessionStorage.removeItem(KEY)
  } catch { /* 표식을 못 읽으면 전환 화면 없이 간다 */ }
}

// App 이 그릴 준비가 됐을 때 — 누른 지 1초가 되는 시점에 걷는다(이미 지났으면 바로).
export function endTransition() {
  const el = document.getElementById(ID)
  try { sessionStorage.removeItem(KEY) } catch { /* 위와 같음 */ }
  if (!el) return
  const left = Math.max(0, MIN_MS - (Date.now() - Number(el.dataset.startedAt ?? 0)))
  setTimeout(() => { el.dataset.leaving = 'true'; setTimeout(() => el.remove(), 160) }, left)
}
