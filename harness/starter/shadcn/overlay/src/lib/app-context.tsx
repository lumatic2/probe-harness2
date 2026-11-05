// app-context.tsx — 해시 라우터(라이브러리 없이) + 저장된 입력 이력(/api/decisions-<도메인>) + 목록에서 고른 건 보관.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { API_NAME, buildHash, DEFAULT_STATE, linkTo, parseHash, type Decision, type Route } from '@/lib/derive'

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  window.addEventListener('sk-nav', cb)
  return () => { window.removeEventListener('hashchange', cb); window.removeEventListener('sk-nav', cb) }
}

export function navigate(hash: string, replace = false) {
  if (location.hash === hash) return
  if (replace) { history.replaceState(null, '', hash); window.dispatchEvent(new Event('sk-nav')) } else location.hash = hash
}

type Ctx = {
  route: Route
  setQuery: (q: Record<string, string>, replace?: boolean) => void
  link: (page: string, extra?: Record<string, string>, id?: string) => string
  decisions: Decision[]
  decisionsError: string
  saveDecision: (d: Decision) => Promise<void>
  selected: Set<string>
  toggleSelected: (ids: string[], on: boolean) => void
}
const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('AppProvider 밖에서 useApp 호출')
  return c
}

export function AppProvider({ children }: { children: ReactNode }) {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  const route = useMemo(() => parseHash(hash), [hash])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [decisionsError, setDecisionsError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(`/api/${API_NAME}`).then((r) => (r.ok ? r.json() : [])).then(setDecisions).catch((e: Error) => setDecisionsError(e.message))
  }, [])

  const setQuery = useCallback((q: Record<string, string>, replace = false) => {
    const cur = parseHash(location.hash)
    const next: Record<string, string | undefined> = { ...cur, ...q }
    if (next.group === '전체') delete next.group
    if (next.period === DEFAULT_STATE.period) delete next.period // 화면 설정(prefs)이 기본 기간을 바꾸면 그 값이 기본 — '7d' 고정이면 기본을 14일로 둔 뒤 7일을 못 고른다
    navigate(buildHash(cur.page, next, cur.id), replace)
  }, [])
  const link = useCallback((page: string, extra: Record<string, string> = {}, id?: string) => linkTo(page, route, extra, id), [route])

  const saveDecision = useCallback(async (d: Decision) => {
    const next = [...decisions, d]
    const res = await fetch(`/api/${API_NAME}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
    if (!res.ok) throw new Error(String(res.status))
    setDecisions(next)
  }, [decisions])

  const toggleSelected = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => { const n = new Set(prev); for (const id of ids) { if (on) n.add(id); else n.delete(id) } return n })
  }, [])

  return <AppCtx.Provider value={{ route, setQuery, link, decisions, decisionsError, saveDecision, selected, toggleSelected }}>{children}</AppCtx.Provider>
}
