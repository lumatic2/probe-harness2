// tour.tsx — 화면 안내(온보딩). 처음 들어온 사람에게 「어디가 무엇을 하는 곳인지」를 순서대로 짚어 준다: 나머지는 어둡게, 짚는 곳만 밝게, 옆에 설명 카드.
// 단계는 src/lib/tour-steps.ts 의 TOUR(또는 domain.json 의 tour) — 과제에 맞게 그 목록만 바꾼다. 짚을 곳은 CSS 선택자로 가리킨다(권장: 요소에 data-tour="이름" 을 붙이고 '[data-tour="이름"]').
// 처음 한 번 자동으로 시작하고(브라우저에 「봤음」을 남긴다), 도움말의 「화면 안내 다시 보기」나 startTour() 로 다시 연다. Esc = 건너뛰기, ← → = 이전·다음.
// 짚을 곳이 화면에 없으면(꺼진 메뉴·접힌 사이드바) 그 단계는 건너뛴다. step.page 를 주면 그 화면으로 옮긴 뒤 짚는다.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { navigate } from '@/lib/app-context'

export type TourStep = { target: string; title: string; text: string; page?: string }
type Box = { x: number; y: number; w: number; h: number }

const START = 'sk-tour-start'
export const startTour = () => window.dispatchEvent(new Event(START))
const PAD = 6, CARD_W = 360, GAP = 12

const visibleBox = (selector: string): Box | null => {
  let el: Element | null = null
  try { el = document.querySelector(selector) } catch { return null }
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 4 && r.height > 4 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
}
const currentPage = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'dashboard'

export function Tour({ steps, seenKey, auto = true }: { steps: TourStep[]; seenKey: string; auto?: boolean }) {
  const [index, setIndex] = useState<number | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const next = useRef<HTMLButtonElement>(null)
  const dir = useRef(1)

  const finish = useCallback(() => {
    setIndex(null); setBox(null)
    try { localStorage.setItem(seenKey, '1') } catch { /* 저장소가 막힌 틀 — 다음에 또 보일 뿐이다 */ }
  }, [seenKey])
  // 단계를 옮길 때 밝은 칸은 지우지 않는다. 다음 자리를 찾으면 거기로 옮겨 간다(지우면 화면 전체가 한 번 번쩍인다)
  const go = useCallback((to: number) => { if (to < 0) return; if (to >= steps.length) { finish(); return } dir.current = to >= (index ?? 0) ? 1 : -1; setIndex(to) }, [steps.length, index, finish])

  // 시작: 처음 한 번 자동 + startTour()
  useEffect(() => {
    const open = () => { if (steps.length) { dir.current = 1; setBox(null); setIndex(0) } }
    window.addEventListener(START, open)
    let t: ReturnType<typeof setTimeout> | undefined
    let seen = false
    try { seen = localStorage.getItem(seenKey) === '1' } catch { /* 위와 같음 */ }
    if (auto && !seen) t = setTimeout(open, 1300) // 로그인 전환 화면(1초)이 걷힌 뒤
    return () => { window.removeEventListener(START, open); if (t) clearTimeout(t) }
  }, [steps.length, seenKey, auto])

  // 단계가 바뀌면: 필요한 화면으로 옮기고, 짚을 곳을 찾아(잠깐 기다리며) 화면 안으로 들인다. 끝내 없으면 다음 단계로.
  useEffect(() => {
    if (index === null) return
    const step = steps[index]
    if (step.page && currentPage() !== step.page) navigate(`#/${step.page}`)
    let tries = 0, stop = false
    const find = () => {
      if (stop) return
      const el = (() => { try { return document.querySelector(step.target) } catch { return null } })()
      const b = visibleBox(step.target)
      if (el && b) { el.scrollIntoView({ block: b.h > window.innerHeight * 0.55 ? 'start' : 'center', inline: 'nearest' }); if (b.h > window.innerHeight * 0.55) window.scrollBy(0, -72); requestAnimationFrame(() => { if (!stop) setBox(visibleBox(step.target)) }); return }
      if (++tries > 12) { const to = index + dir.current; if (to < 0 || to >= steps.length) finish(); else setIndex(to); return }
      setTimeout(find, 120)
    }
    find()
    return () => { stop = true }
  }, [index, steps, finish])

  // 스크롤·창 크기 변화에 밝은 칸이 따라간다
  useEffect(() => {
    if (index === null) return
    const sel = steps[index].target
    let raf = 0
    const sync = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setBox((prev) => visibleBox(sel) ?? prev)) }
    window.addEventListener('scroll', sync, true); window.addEventListener('resize', sync)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', sync, true); window.removeEventListener('resize', sync) }
  }, [index, steps])

  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish() }
      else if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, go, finish])
  useLayoutEffect(() => { if (index !== null && box) next.current?.focus({ preventScroll: true }) }, [index, box])

  if (index === null) return null
  const step = steps[index]
  const vw = window.innerWidth, vh = window.innerHeight
  // 카드 자리: 아래 → 위 → 오른쪽 → 왼쪽 순으로 들어갈 곳. 어디에도 안 들어가면 화면 가운데 아래.
  const CARD_H = 210
  // 밝은 칸: 대상보다 6px 넓게. 대상이 화면보다 크면(긴 표) 카드가 들어갈 자리를 남기고 윗부분만 밝힌다.
  const hole = (() => {
    if (!box) return null
    const x = Math.max(4, box.x - PAD), y = Math.max(4, box.y - PAD)
    const w = Math.min(vw - 8 - x + 4, box.w + PAD * 2)
    const room = vh - CARD_H - GAP * 2 - y
    const h = box.h + PAD * 2 > vh * 0.6 ? Math.max(120, Math.min(box.h + PAD * 2, room)) : Math.min(vh - 8, box.h + PAD * 2)
    return { x, y, w, h }
  })()
  let left = (vw - CARD_W) / 2, top = vh - CARD_H - 24
  if (hole) {
    const cx = Math.min(Math.max(12, hole.x + hole.w / 2 - CARD_W / 2), vw - CARD_W - 12)
    if (hole.y + hole.h + GAP + CARD_H < vh) { left = cx; top = hole.y + hole.h + GAP }
    else if (hole.y - GAP - CARD_H > 0) { left = cx; top = hole.y - GAP - CARD_H }
    else if (hole.x + hole.w + GAP + CARD_W < vw) { left = hole.x + hole.w + GAP; top = Math.min(Math.max(12, hole.y), vh - CARD_H - 12) }
    else if (hole.x - GAP - CARD_W > 0) { left = hole.x - GAP - CARD_W; top = Math.min(Math.max(12, hole.y), vh - CARD_H - 12) }
  }
  return createPortal(
    <div data-tour-root data-step={index} className="fixed inset-0" style={{ zIndex: 2147483000 }}>
      {/* 가림막: 클릭을 막는다. 밝은 칸은 큰 그림자로 주변을 어둡게 만든다(그림자가 곧 어두운 부분). */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {/* 밝은 칸은 언제나 이 한 요소다(없다가 생기지 않는다). 자리를 아직 못 찾았으면 화면 가운데의 크기 0 인 점이라 그림자가 화면 전체를 고르게 덮는다. */}
      <div aria-hidden className="pointer-events-none absolute rounded-lg transition-all duration-200 ease-out" style={hole ? { left: hole.x, top: hole.y, width: hole.w, height: hole.h, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' } : { left: vw / 2, top: vh / 2, width: 0, height: 0, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' }} data-tour-hole />
      <div role="dialog" aria-modal="true" aria-labelledby="sk-tour-title" aria-describedby="sk-tour-text" className="absolute flex flex-col gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg transition-[left,top] duration-150 ease-out" style={{ left, top, width: CARD_W }} data-tour-card>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">{index + 1} / {steps.length}</span>
          <button type="button" className="rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" onClick={finish} data-tour-skip>건너뛰기</button>
        </div>
        <div>
          <h2 id="sk-tour-title" className="text-base font-semibold">{step.title}</h2>
          <p id="sk-tour-text" className="mt-1 text-sm text-muted-foreground">{step.text}</p>
        </div>
        <div className="flex justify-end gap-2">
          {index > 0 ? <Button variant="outline" className="h-10 min-w-20 px-5 text-sm" onClick={() => go(index - 1)} data-tour-prev>이전</Button> : null}
          <Button ref={next} className="h-10 min-w-20 px-5 text-sm" onClick={() => go(index + 1)} data-tour-next>{index === steps.length - 1 ? '마침' : '다음'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
