import { resumeTransition } from '@/lib/transition'
resumeTransition() // 로그인·로그아웃 뒤 새로고침이면 전환 화면을 바로 다시 덮는다(깜박임 방지)
import '@/lib/session-fetch' // 맨 먼저 — /api 요청에 세션 토큰을 싣는다(쿠키가 막힌 틀 대비)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { DataState } from '@/components/data-state'

// Render before App's top-level data requests, so slow/failed connections never leave a blank page.
const root = createRoot(document.getElementById('root')!)
// 불러오는 중 화면은 0.3초 넘게 걸릴 때만 보인다 — 빨리 뜨는 경우(로그인 직후 새로고침)에 한 번 깜박이지 않게.
const slow = setTimeout(() => root.render(<main className="min-h-screen bg-background px-4 py-16"><DataState kind="loading" /></main>), 300)
import('./App').then(({ default: App }) => { clearTimeout(slow); root.render(<StrictMode><App /></StrictMode>) }).catch((error: Error) => {
  clearTimeout(slow)
  root.render(<main className="min-h-screen bg-background px-4 py-16"><DataState kind="error" detail={error.message} retry={() => location.reload()} /></main>)
})
