// pages.ts — 페이지 메타(메뉴 이름·상단 주 행동 버튼)와 사이드바 그룹. 새 페이지는 여기에 한 줄 + pages/ 에 파일. 라벨은 도메인 설정에서 온다.
import { CalendarRangeIcon, ClipboardCheckIcon, DatabaseIcon, FileChartColumnIcon, FileSearchIcon, LayoutDashboardIcon, LayoutGridIcon, ListIcon, MessagesSquareIcon, PlayIcon, SlidersHorizontalIcon, UploadIcon, WaypointsIcon, type LucideIcon } from 'lucide-react'
import { ctx, linkTo, whereToFilters, type Route } from '@/lib/derive'

export type PageMeta = { name: string; action: { label: string; href: (r: Route) => string } }
export const PAGE_META: Record<string, PageMeta> = {
  dashboard: { name: '대시보드', action: { label: ctx.d.alerts.actionLabel, href: (r) => linkTo('list', r, whereToFilters(ctx.d.alerts.where)) } },
  list: { name: '목록', action: { label: ctx.d.form.action, href: (r) => linkTo('form', r) } },
  item: { name: '상세', action: { label: `이 건 ${ctx.d.form.action}`, href: (r) => linkTo('form', r, {}, r.id) } },
  form: { name: '입력·판정', action: { label: '목록으로', href: (r) => linkTo('list', r) } },
  report: { name: '리포트', action: { label: '목록에서 건 고르기', href: (r) => linkTo('list', r) } },
  widgets: { name: '위젯 모음', action: { label: '대시보드로', href: () => '#/dashboard' } },
  schedule: { name: ctx.d.schedule?.title ?? '일정 격자', action: { label: '목록으로', href: (r) => linkTo('list', r) } },
  review: { name: ctx.d.review?.title ?? '문서 검토', action: { label: '목록으로', href: (r) => linkTo('list', r) } },
  assist: { name: ctx.d.assist?.title ?? 'AI 연습', action: { label: '목록으로', href: (r) => linkTo('list', r) } },
  import: { name: ctx.d.import?.title ?? 'CSV 올리기', action: { label: '목록으로', href: (r) => linkTo('list', r) } },
  settings: { name: '기준값 설정', action: { label: '대시보드로', href: () => '#/dashboard' } },
  datasets: { name: ctx.d.datasets?.title ?? '데이터셋', action: { label: '실행으로', href: () => '#/run' } },
  run: { name: ctx.d.run?.title ?? '실행', action: { label: ctx.d.graph ? '그래프로' : '대시보드로', href: () => (ctx.d.graph ? '#/graph' : '#/dashboard') } },
  graph: { name: ctx.d.graph?.title ?? '노드 그래프', action: { label: '실행으로', href: () => '#/run' } },
  me: { name: '내 정보', action: { label: '대시보드로', href: () => '#/dashboard' } },
}

// 도움말·검색이 쓰는 한 줄 설명(페이지마다). 도메인 설정 help.steps 가 있으면 도움말은 그것을 우선한다.
export const HELP: Record<string, string> = {
  dashboard: '핵심 지표와 지금 문제가 되는 건을 한눈에', list: '대상을 찾고 정렬해 상세로', item: '한 건의 근거와 이력', form: '입력하고 판정·저장', report: '기간·조건 비교와 내보내기(CSV·엑셀·JSON)',
  widgets: '쓸 수 있는 위젯 카탈로그', schedule: '자원×시간 격자에서 일정 확정', review: '문서 분류와 불확실 큐', assist: 'AI 에게 묻고 고정 라벨로 판정', import: 'CSV 파일을 올려 검증·반영',
  settings: '규칙 기준값을 바꾸고 결과 비교', datasets: '준비된 데이터셋 선택 → 검증 → 적용', run: '조건을 넣고 실행 → 진행 → 결과·JSON 내보내기', graph: '경로·흐름을 노드와 선으로', me: '내 계정과 내 항목',
}

// 도메인 설정에 해당 키가 있을 때만 켜지는 페이지 (schedule · review · assist · import · settings=params · datasets · run · graph). me(내 정보)는 메뉴엔 없고 사용자 메뉴·역할 첫 화면에서만 간다.
const OPTIONAL: Record<string, boolean> = { schedule: !!ctx.d.schedule, review: !!ctx.d.review, assist: !!ctx.d.assist, import: !!ctx.d.import && !ctx.d.dataSource, settings: (ctx.d.params?.length ?? 0) > 0, datasets: !!ctx.d.datasets, run: !!ctx.d.run, graph: !!ctx.d.graph }
export const isEnabled = (key: string) => !(key in OPTIONAL) || OPTIONAL[key]

export const NAV: { title: string; pages: { key: string; icon: LucideIcon }[] }[] = [
  { title: '현황', pages: [{ key: 'dashboard', icon: LayoutDashboardIcon }, { key: 'list', icon: ListIcon }] },
  { title: '작업', pages: [{ key: 'form', icon: ClipboardCheckIcon }, { key: 'report', icon: FileChartColumnIcon }, { key: 'schedule', icon: CalendarRangeIcon }, { key: 'review', icon: FileSearchIcon }, { key: 'assist', icon: MessagesSquareIcon }, { key: 'import', icon: UploadIcon }, { key: 'datasets', icon: DatabaseIcon }, { key: 'run', icon: PlayIcon }, { key: 'graph', icon: WaypointsIcon }, { key: 'settings', icon: SlidersHorizontalIcon }].filter((p) => isEnabled(p.key)) },
  { title: '참고', pages: [{ key: 'widgets', icon: LayoutGridIcon }] },
]
