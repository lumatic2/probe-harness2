// auth.tsx — 로그인·역할 껍데기(화면 쪽). 서버 스위치 하나(.env AUTH_ON=1)로 켜진다 — 꺼져 있으면 /api/auth-me 가 기본 계정을 돌려주고 화면은 로그인을 묻지 않는다.
// 연결할 때 바꾸는 곳: PAGE_ROLES(페이지별 허용 역할) · HOME_BY_ROLE(역할별 첫 화면) · 서버 계정(.env AUTH_USERS) · 쓰기 허용 역할(.env AUTH_WRITE_ROLES). 세션 영속·SSO 는 server/auth.mjs 를 교체한다.
// 쓰기 가능 여부(canWrite)는 서버 auth-me 가 준다 — 화면은 역할 이름을 비교하지 않는다(실행·적용 버튼이 이 값만 본다). hasRole 은 PAGE_ROLES 같은 페이지 접근용.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { setSessionToken } from '@/lib/session-fetch'
import { beginTransition } from '@/lib/transition'

export type AuthUser = { id: string; name: string; role: string }
// 페이지별 허용 역할 — 없는 페이지는 누구나. 예: { settings: ['operator'], form: ['operator'] }
export const PAGE_ROLES: Record<string, string[]> = {}
// 역할별 첫 화면 — 로그인 직후 갈 페이지. 예: { user: 'me' } (구성원은 「내 정보」부터). 없는 역할은 지금 해시 그대로(처음이면 대시보드).
export const HOME_BY_ROLE: Record<string, string> = {}
// 역할 표시 이름(배지·권한 없음 안내에 쓴다)
export const ROLE_LABEL: Record<string, string> = { operator: '운영자', user: '사용자' }
export const roleLabel = (role: string) => ROLE_LABEL[role] ?? role

type Ctx = {
  enabled: boolean
  loading: boolean
  user: AuthUser | null
  login: (id: string, password: string) => Promise<string | null> // 성공 null, 실패 오류 문구
  quick: AuthUser[] // 빠른 로그인 계정(서버 AUTH_QUICK=1 일 때만 채워진다 — 비밀번호는 오지 않는다)
  quickLogin: (id: string) => Promise<string | null>
  logout: () => Promise<void>
  hasRole: (roles?: string[]) => boolean
  canWrite: boolean // 서버 AUTH_WRITE_ROLES 판정 — 실행·적용·저장 버튼은 이것을 본다
}
const AuthCtx = createContext<Ctx | null>(null)
export const useAuth = () => {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('AuthProvider 밖에서 useAuth 호출')
  return c
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [canWrite, setCanWrite] = useState(true)
  const [quick, setQuick] = useState<AuthUser[]>([])

  useEffect(() => {
    fetch('/api/auth-me', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        setEnabled(j.enabled !== false)
        setUser(r.ok ? (j.user as AuthUser) : null)
        setCanWrite(r.ok ? j.canWrite !== false : false)
        setQuick(Array.isArray(j.quick) ? (j.quick as AuthUser[]) : [])
      })
      .catch(() => { setEnabled(false); setUser({ id: 'guest', name: '기본 계정', role: 'operator' }); setCanWrite(true) }) // API 가 없는 정적 서빙 — 로그인 없이 진행
      .finally(() => setLoading(false))
  }, [])

  // 비밀번호 로그인과 빠른 로그인이 같은 길을 탄다 — 서버에 보내는 본문만 다르다({id,password} 또는 {quick:id}).
  const signIn = useCallback(async (body: Record<string, string>) => {
    const r = await fetch('/api/auth-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return (j.error as string) || `로그인하지 못했습니다 (${r.status})`
    beginTransition('login') // 전환 화면을 덮은 채 새로 읽는다(최소 1초) — App 이 준비되면 걷힌다
    setSessionToken(j.token as string | undefined) // 쿠키가 안 돌아오는 환경에서도 새로고침 뒤 세션이 이어진다
    setUser(j.user as AuthUser)
    try { sessionStorage.setItem('sk-auth-toast', `login:${(j.user as AuthUser).name}`) } catch { /* 저장소가 막힌 틀 — 알림만 생략 */ }
    const home = HOME_BY_ROLE[(j.user as AuthUser).role]
    if (home) location.replace(`#/${home}`) // 역할별 첫 화면 — 새로고침 전에 해시만 바꾼다
    location.reload() // 로그인 전에 401 로 끝난 데이터 요청(decisions·settings)을 세션으로 다시 받는다 — 성공 toast 는 새로고침 뒤 App 이 띄운다
    return null
  }, [])
  const login = useCallback((id: string, password: string) => signIn({ id, password }), [signIn])
  const quickLogin = useCallback((id: string) => signIn({ quick: id }), [signIn])

  const logout = useCallback(async () => {
    beginTransition('logout')
    await fetch('/api/auth-logout', { method: 'POST' }).catch(() => {})
    setSessionToken(null)
    setUser(null)
    try { sessionStorage.setItem('sk-auth-toast', 'logout') } catch { /* 위와 같음 */ }
    location.replace('#/dashboard'); location.reload()
  }, [])

  const hasRole = useCallback((roles?: string[]) => !enabled || !roles?.length || (!!user && roles.includes(user.role)), [enabled, user])

  return <AuthCtx.Provider value={{ enabled, loading, user, login, quick, quickLogin, logout, hasRole, canWrite }}>{children}</AuthCtx.Provider>
}
