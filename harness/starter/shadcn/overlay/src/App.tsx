import { useEffect, useState } from 'react'
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
import { ChatDock, useChatOpen } from '@/widgets/chat'
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
const CHAT_GAP = 'lg:pr-[24.25rem]' // 열린 AI 패널(폭 23rem, 오른쪽 여백 1.25rem)이 차지하는 자리
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
  const chatOpen = useChatOpen() // 훅은 아래의 이른 return 보다 위에 둔다
  const ready = useSettingsReady()
  const Page = isEnabled(route.page) ? PAGES[route.page] : undefined
  // 탭 제목 = 「화면 이름 · 앱 이름」 — 탭을 여러 개 열어도 어느 화면인지 보인다
  useEffect(() => { const name = Page ? PAGE_META[route.page]?.name : '없는 화면'; document.title = name ? `${name} · ${ctx.d.app.title}` : ctx.d.app.title }, [route.page, Page])
  useEffect(() => {
    let flag: string | null = null
    try { flag = sessionStorage.getItem('sk-auth-toast'); if (flag?.startsWith('login:')) sessionStorage.removeItem('sk-auth-toast') } catch { /* 저장소가 막힌 틀 */ }
    if (flag?.startsWith('login:')) { toast.success(`${flag.slice(6)} 님, 로그인했습니다`, { position: 'top-center' }) } // 첫 화면 훑는 자리. 나머지 앱 toast 는 오른쪽 아래
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [route.page, route.id])
  useEffect(() => { if (ready && !auth.loading) endTransition() }, [ready, auth.loading]) // 그릴 준비가 됐다 — 로그인·로그아웃 전환 화면을 걷는다
  if (!ready || auth.loading) return <main className="px-4 py-16"><DataState kind="loading" /></main>
  if (auth.enabled && !auth.user) return <Login />
  // 데이터셋 → 실행 → 그래프는 순서 있는 한 절차다 — 켜진 것이 둘 이상이면 세 화면 위에 같은 단계 표시를 둔다
  const flow = FLOW.filter((k) => isEnabled(k))
  const flowAt = flow.indexOf(route.page)
  const showFilter = !!Page && !['item', 'form', 'schedule', 'review', 'assist', 'import', 'settings', 'datasets', 'run', 'graph', 'me'].includes(route.page)
  return (
    <SidebarProvider style={{ '--sidebar-width': '16rem', '--header-height': '3.25rem' } as React.CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        {/* AI 패널이 열리면 본문만 그 폭(패널 23rem + 사이 여백)만큼 좁아진다. 머리줄은 그대로 화면 폭 전체다. */}
        <div className={`@container/main flex min-w-0 flex-1 flex-col gap-4 py-4 transition-[padding] duration-150 ease-out md:gap-6 md:py-6 ${chatOpen ? CHAT_GAP : ''}`} data-page={route.page} data-title={PAGE_META[route.page]?.name}>
          {showFilter ? <FilterBar /> : null}
          {ctx.d.dataSource ? <div className="flex items-center gap-3 px-4 text-sm text-muted-foreground lg:px-6"><span>{ctx.d.dataSource.label || '연결 데이터'} · {ctx.rows.length}건</span><button className="underline" onClick={() => location.reload()}>새로고침</button></div> : null}
          {!Page ? <StatusPage kind="not-found" detail={`주소: #/${route.page}`} actions={<><Button variant="outline" size="sm" onClick={() => history.back()}>뒤로</Button><Button size="sm" onClick={() => navigate('#/dashboard')}>대시보드로</Button></>} /> : !ctx.rows.length && ['dashboard', 'list', 'report'].includes(route.page) ? <div className="px-4 lg:px-6"><DataState kind="empty" retry={() => location.reload()} /></div> : <RequireRole roles={PAGE_ROLES[route.page]}>{flow.length > 1 && flowAt >= 0 ? <div className="px-4 lg:px-6" data-flow><Stepper steps={flow.map((k) => ({ label: PAGE_META[k].name }))} current={flowAt} onStep={(i) => navigate(`#/${flow[i]}`)} /></div> : null}<Page /></RequireRole>}
        </div>
      </SidebarInset>
      <ChatDock />{/* 화면 오른쪽에 고정된 별도 영역 — 본문이 스크롤돼도 움직이지 않는다 */}
      <Tour steps={TOUR} seenKey={`sk-tour-seen:${domainName}`} />
      <Toaster position="bottom-right" />
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
