// prefs.ts — 화면 설정(글자 크기 · 표 밀도 · 기본 기간 · 시작 화면). 브라우저(localStorage)에만 저장되고 업무 데이터와 무관하다. 사이드바 「설정」 시트가 쓴다.
// 적용 방법: <html data-font data-density> 속성(sk-theme.css 가 읽는다) + 기본 기간은 라우터의 DEFAULT_STATE 를 앱 시작 때 바꾼다 + 시작 화면은 해시 없이 열었을 때 한 번.
import { DEFAULT_STATE } from '@/domain/core.mjs'

export type Prefs = { font: 'small' | 'normal' | 'large'; density: 'normal' | 'compact'; period: string; home: string }
export const DEFAULT_PREFS: Prefs = { font: 'normal', density: 'normal', period: '7d', home: 'dashboard' }
const KEY = 'sk-prefs'

export function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Prefs>) } } catch { return { ...DEFAULT_PREFS } }
}
export function savePrefs(p: Prefs) {
  localStorage.setItem(KEY, JSON.stringify(p))
  applyPrefs(p)
}
// 시작 때 한 번(App 모듈 로드) + 저장 때마다. 기본 기간은 다음 페이지 이동부터 적용된다.
export function applyPrefs(p: Prefs = loadPrefs()) {
  const el = document.documentElement
  el.dataset.font = p.font
  el.dataset.density = p.density
  ;(DEFAULT_STATE as { period: string }).period = p.period
  return p
}
// 해시 없이 열었을 때의 첫 화면(역할별 첫 화면 HOME_BY_ROLE 은 로그인 때 따로 적용된다)
export function applyHome(p: Prefs = loadPrefs()) {
  if (!location.hash && p.home && p.home !== 'dashboard') location.replace(`#/${p.home}`)
}
