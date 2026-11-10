import { useEffect, useRef, useState } from 'react'
import './print.css'
import { AppSidebar } from '@/components/app-sidebar'
import { FilterBar } from '@/components/page-parts'
import { SiteHeader } from '@/components/site-header'
import { DataState } from '@/components/data-state'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppProvider, navigate, useApp } from '@/lib/app-context'
import { TOUR } from '@/lib/tour-steps'
import { ChatDock } from '@/widgets/chat'
import { Tour } from '@/widgets/tour'
import { StatusPage, Stepper } from '@/widgets/parts'
import { AuthProvider, PAGE_ROLES, useAuth } from '@/lib/auth'
import { RequireRole } from '@/components/require-role'
import Login from '@/pages/login'
import { isEnabled, PAGE_META } from '@/lib/pages'
import { applySettings, ctx, domainName, SETTINGS_API } from '@/lib/derive'
import { applyHome, applyPrefs } from '@/lib/prefs'
import { endTransition } from '@/lib/transition'
applyPrefs(); applyHome() // 화면 설정(글자 크기·표 밀도·기본 기간)과 시작 화면 — 라우터가 첫 해시를 읽기 전에

const FLOW = ['datasets', 'run', 'graph']
// 화면 = src/pages/<key>.tsx 의 default export. 파일 이름이 곧 주소(#/<key>) — 등록은 lib/pages.ts 의 SCREENS 한 줄(메뉴·이름). login 은 화면 틀 밖에서 따로 그린다.
const PAGE_FILES = import.meta.glob('./pages/*.tsx', { eager: true, import: 'default' }) as Record<string, () => React.ReactElement>
const PAGES: Record<string, () => React.ReactElement> = Object.fromEntries(Object.entries(PAGE_FILES).map(([file, C]) => [file.replace(/^.*\/([^/]+)\.tsx$/, '$1'), C]).filter(([key]) => key !== 'login'))

// 저장된 기준값(domain.json 에 params 가 있을 때만)을 불러와 ctx 에 적용한 뒤에야 화면을 그린다 — 저장한 값이 모든 화면 계산에 들어가게
function useSettingsReady() {
  const on = (ctx.d.params?.length ?? 0) > 0
  const [ready, setReady] = useState(!on)
  useEffect(() => {
    if (!on) return
    fetch(`/api/${SETTINGS_API}`).then((r) => (r.ok ? r.json() : null)).then((s) => { if (s?.values) applySettings(s.values) }).catch(() => {}).finally(() => setReady(true))
  }, [on])
  return ready
}

function Shell() {
  const { route } = useApp()
  const auth = useAuth()
  const ready = useSettingsReady()
  const Page = isEnabled(route.page) ? PAGES[route.page] : undefined
  // 탭 제목 = 「화면 이름 · 앱 이름」 — 탭을 여러 개 열어도 어느 화면인지 보인다
  useEffect(() => { const name = Page ? PAGE_META[route.page]?.name : '없는 화면'; document.title = name ? `${name} · ${ctx.d.app.title}` : ctx.d.app.title }, [route.page, Page])
  useEffect(() => {
    let flag: string | null = null
    try { flag = sessionStorage.getItem('sk-auth-toast'); if (flag?.startsWith('login:')) sessionStorage.removeItem('sk-auth-toast') } catch { /* 저장소가 막힌 틀 */ }
    if (flag?.startsWith('login:')) { toast.success(`${flag.slice(6)} 님, 로그인했습니다`) } // 첫 화면 훑는 자리. 나머지 앱 toast 는 오른쪽 아래
  }, [])
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { scroller.current?.scrollTo(0, 0) }, [route.page, route.id]) // 화면을 옮기면 본문을 맨 위로(창이 아니라 본문 칸이 스크롤된다)
  useEffect(() => { if (ready && !auth.loading) endTransition() }, [ready, auth.loading]) // 그릴 준비가 됐다 — 로그인·로그아웃 전환 화면을 걷는다
  if (!ready || auth.loading) return <main className="px-4 py-16"><DataState kind="loading" /></main>
  if (auth.enabled && !auth.user) return <Login />
  // 데이터셋 → 실행 → 그래프는 순서 있는 한 절차다 — 켜진 것이 둘 이상이면 세 화면 위에 같은 단계 표시를 둔다
  const flow = FLOW.filter((k) => isEnabled(k))
  const flowAt = flow.indexOf(route.page)
  const showFilter = !!Page && !['item', 'form', 'schedule', 'review', 'assist', 'import', 'settings', 'datasets', 'run', 'graph', 'me'].includes(route.page)
  return (
    // 화면 틀: 창 전체는 스크롤되지 않는다. 「왼쪽 메뉴 | 머리줄 + (본문 | AI 패널)」로 높이를 화면에 맞추고, 본문 칸만 스크롤한다 → 머리줄·메뉴·AI 패널은 늘 제자리.
    <SidebarProvider className="h-svh overflow-hidden" style={{ '--sidebar-width': '16rem', '--header-height': '3.25rem' } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset className="min-h-0 overflow-hidden">
        <SiteHeader />
        <div className="flex min-h-0 flex-1">{/* 머리줄 아래: 본문(스크롤) | AI 패널 */}
        <div ref={scroller} data-scroll className="sk-scroll min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="@container/main flex min-w-0 flex-col gap-4 py-4 md:gap-6 md:py-6" data-page={route.page} data-title={PAGE_META[route.page]?.name}>
          {showFilter ? <FilterBar /> : null}
          {ctx.d.dataSource ? <div className="flex items-center gap-3 px-4 text-sm text-muted-foreground lg:px-6"><span>{ctx.d.dataSource.label || '연결 데이터'} · {ctx.rows.length}건</span><button className="underline" onClick={() => location.reload()}>새로고침</button></div> : null}
          {!Page ? <StatusPage kind="not-found" detail={`주소: #/${route.page}`} actions={<><Button variant="outline" size="sm" onClick={() => history.back()}>뒤로</Button><Button size="sm" onClick={() => navigate('#/dashboard')}>대시보드로</Button></>} /> : !ctx.rows.length && ['dashboard', 'list', 'report'].includes(route.page) ? <div className="px-4 lg:px-6"><DataState kind="empty" retry={() => location.reload()} /></div> : <RequireRole roles={PAGE_ROLES[route.page]}>{flow.length > 1 && flowAt >= 0 ? <div className="px-4 lg:px-6" data-flow><Stepper steps={flow.map((k) => ({ label: PAGE_META[k].name }))} current={flowAt} onStep={(i) => navigate(`#/${flow[i]}`)} /></div> : null}<Page /></RequireRole>}
        </div>
        </div>
        <ChatDock />{/* 본문 옆 칸. 본문이 스크롤돼도 움직이지 않는다 */}
        </div>
      </SidebarInset>
      <Tour steps={TOUR} seenKey={`sk-tour-seen:${domainName}`} />
      <Toaster position="top-center" offset={{ top: 68 }} />{/* 머리줄 바로 아래 가운데 — 오른쪽 아래는 AI 패널의 입력창과 표의 쪽 넘김을 가린다 */}
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <TooltipProvider>
      <AuthProvider><AppProvider><Shell /></AppProvider></AuthProvider>
    </TooltipProvider>
  )
}
