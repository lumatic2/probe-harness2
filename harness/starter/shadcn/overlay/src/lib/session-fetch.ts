// session-fetch.ts — 세션 토큰을 /api 요청에 Authorization: Bearer 로 같이 보낸다. main.tsx 가 맨 먼저 불러온다(다른 모듈의 첫 요청보다 앞서야 한다).
// 왜: 응시 환경의 Browser 는 앱을 다른 사이트의 틀(iframe) 안에 띄운다. 그 구조에서는 SameSite=Lax 세션 쿠키가 요청에 실리지 않아 「로그인 직후 다시 미로그인」이 된다. 쿠키가 되는 환경에서는 쿠키와 토큰이 같은 세션이라 차이가 없다.
// 보관: sessionStorage(탭을 닫으면 사라진다) + window.name(저장소 접근이 막힌 틀에서도 새로고침을 넘긴다). 토큰은 화면·로그에 찍지 않는다.
const KEY = 'sk-session'
const NAME_PREFIX = 'sk-session:'

function read(): string {
  try { const v = sessionStorage.getItem(KEY); if (v) return v } catch { /* 저장소 접근이 막힌 틀 */ }
  return window.name.startsWith(NAME_PREFIX) ? window.name.slice(NAME_PREFIX.length) : ''
}
export function setSessionToken(token: string | null | undefined) {
  try { if (token) sessionStorage.setItem(KEY, token); else sessionStorage.removeItem(KEY) } catch { /* 위와 같음 */ }
  if (token) window.name = NAME_PREFIX + token
  else if (window.name.startsWith(NAME_PREFIX)) window.name = ''
}

const isApi = (input: RequestInfo | URL) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try { const u = new URL(raw, location.href); return u.origin === location.origin && u.pathname.startsWith('/api/') } catch { return false }
}

const original = window.fetch.bind(window)
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const token = read()
  if (!token || !isApi(input)) return original(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  return original(input, { ...init, headers })
}
