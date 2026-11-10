// pages.ts — 화면 등록부. **새 화면은 SCREENS 에 한 줄 + src/pages/<key>.tsx 파일 하나**면 주소(#/<key>)·탭 제목·왼쪽 메뉴·도움말·검색에 모두 생긴다. 다른 파일은 고치지 않는다.
// 왼쪽 메뉴에 무엇이 어떤 순서로 보일지는 이 목록이 정한다 — 설계 때 정한 「화면 목록」을 그대로 옮긴다. 안 쓰는 화면은 줄을 지우거나 when: false.
// 화면 파일은 `export default function 이름() { … }` 하나면 된다(App.tsx 가 src/pages/*.tsx 를 파일 이름으로 찾는다).
import { CalendarRangeIcon, ClipboardCheckIcon, DatabaseIcon, FileChartColumnIcon, FileSearchIcon, LayoutDashboardIcon, LayoutGridIcon, ListIcon, MessagesSquareIcon, PlayIcon, SlidersHorizontalIcon, UploadIcon, WaypointsIcon, type LucideIcon } from 'lucide-react'
import { ctx } from '@/lib/derive'

export type Screen = {
  key: string          // 주소 #/<key> 이자 src/pages/<key>.tsx 의 파일 이름
  name: string         // 메뉴·머리줄·탭 제목에 보이는 이름
  help: string         // 도움말·검색에 보이는 한 줄(이 화면에서 무엇을 하나)
  group?: '현황' | '작업' | '참고' // 왼쪽 메뉴의 묶음. 없으면 메뉴에 안 보인다(주소로는 열린다 — 상세·내 정보처럼 다른 화면에서 들어가는 화면)
  icon?: LucideIcon    // 메뉴 아이콘(group 이 있으면 필요)
  when?: boolean       // false 면 화면 자체가 꺼진다(주소로도 안 열린다). 도메인 설정에 따라 켜지는 화면에 쓴다
  dev?: boolean        // 개발용 화면 — 메뉴에는 개발 중에만 보인다(주소 #/<key> 로는 언제나 열린다)
}

// 메뉴는 이 순서대로, 묶음별로 보인다.
export const SCREENS: Screen[] = [
  { key: 'dashboard', name: '대시보드', help: '핵심 지표와 지금 문제가 되는 건을 한눈에', group: '현황', icon: LayoutDashboardIcon },
  { key: 'list', name: '목록', help: '대상을 찾고 정렬해 상세로', group: '현황', icon: ListIcon },
  { key: 'item', name: '상세', help: '한 건의 근거와 이력' },
  { key: 'form', name: '입력·판정', help: '입력하고 판정·저장', group: '작업', icon: ClipboardCheckIcon },
  { key: 'report', name: '리포트', help: '기간·조건 비교와 내보내기(CSV·엑셀·JSON)', group: '작업', icon: FileChartColumnIcon },
  { key: 'schedule', name: ctx.d.schedule?.title ?? '일정 격자', help: '자원×시간 격자에서 일정 확정', group: '작업', icon: CalendarRangeIcon, when: !!ctx.d.schedule },
  { key: 'review', name: ctx.d.review?.title ?? '문서 검토', help: '문서 분류와 불확실 큐', group: '작업', icon: FileSearchIcon, when: !!ctx.d.review },
  { key: 'assist', name: ctx.d.assist?.title ?? 'AI 연습', help: 'AI 에게 묻고 고정 라벨로 판정', group: '작업', icon: MessagesSquareIcon, when: !!ctx.d.assist },
  { key: 'import', name: ctx.d.import?.title ?? 'CSV 올리기', help: 'CSV 파일을 올려 검증·반영', group: '작업', icon: UploadIcon, when: !!ctx.d.import && !ctx.d.dataSource },
  { key: 'datasets', name: ctx.d.datasets?.title ?? '데이터셋', help: '준비된 데이터셋 선택 → 검증 → 적용', group: '작업', icon: DatabaseIcon, when: !!ctx.d.datasets },
  { key: 'run', name: ctx.d.run?.title ?? '실행', help: '조건을 넣고 실행 → 진행 → 결과·JSON 내보내기', group: '작업', icon: PlayIcon, when: !!ctx.d.run },
  { key: 'graph', name: ctx.d.graph?.title ?? '노드 그래프', help: '경로·흐름을 노드와 선으로', group: '작업', icon: WaypointsIcon, when: !!ctx.d.graph },
  { key: 'settings', name: '기준값 설정', help: '규칙 기준값을 바꾸고 결과 비교', group: '작업', icon: SlidersHorizontalIcon, when: (ctx.d.params?.length ?? 0) > 0 },
  { key: 'me', name: '내 정보', help: '내 계정과 내 항목' },
  { key: 'widgets', name: '위젯 모음', help: '쓸 수 있는 부품 카탈로그(개발용)', group: '참고', icon: LayoutGridIcon, dev: true },
]

// 개발용 화면을 메뉴에 보일지 — 개발 서버(npx vite)이거나, 빌드할 때 VITE_DEV_MENU=1 을 준 경우. 제출용 빌드에는 주지 않는다.
export const SHOW_DEV = import.meta.env.DEV || import.meta.env.VITE_DEV_MENU === '1'

// 사이드바의 「빠른 등록」 버튼 — 어느 화면에서든 한 번에 등록 화면을 여는 버튼이 필요한 서비스에서만 켠다. null 이면 버튼이 없다.
// 화면으로 보내려면 { label, href }, 모달로 받으려면 components/quick-add.tsx 의 <QuickAddDialog> 를 쓰고 { label, dialog: true }.
export const QUICK: { label: string; href?: string; dialog?: boolean } | null = null

// ── 아래는 SCREENS 에서 만들어지는 것(직접 고치지 않는다)
const byKey = new Map(SCREENS.map((s) => [s.key, s]))
export type PageMeta = { name: string }
export const PAGE_META: Record<string, PageMeta> = Object.fromEntries(SCREENS.map((s) => [s.key, { name: s.name }]))
export const HELP: Record<string, string> = Object.fromEntries(SCREENS.map((s) => [s.key, s.help]))
// 화면이 켜져 있나(주소로 열 수 있나)
export const isEnabled = (key: string) => { const s = byKey.get(key); return !!s && s.when !== false }
// 왼쪽 메뉴 — 묶음 순서는 처음 나온 순서, 묶음 안은 SCREENS 순서
export const NAV: { title: string; pages: { key: string; icon: LucideIcon }[] }[] = (() => {
  const groups: { title: string; pages: { key: string; icon: LucideIcon }[] }[] = []
  for (const s of SCREENS) {
    if (!s.group || s.when === false || (s.dev && !SHOW_DEV)) continue
    let g = groups.find((x) => x.title === s.group)
    if (!g) { g = { title: s.group, pages: [] }; groups.push(g) }
    g.pages.push({ key: s.key, icon: s.icon ?? LayoutGridIcon })
  }
  return groups
})()
