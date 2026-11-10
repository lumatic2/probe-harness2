// parts-gallery.tsx — #/widgets 의 「기본 부품 U1~U19」「결정 부품 D1~D5」「보기 부품 V1~V7」「검토 부품 R1~R8」 카탈로그. 개발용 견본이며 업무 기록을 바꾸지 않는다.
// 실전에서는 이 파일이 아니라 widgets/parts.tsx · widgets/decision.tsx · components/ui/* 에서 가져다 쓴다. 여기의 견본 데이터는 과제 데이터가 아니다.
import { useState, type ReactNode } from 'react'
import { BellIcon, DatabaseIcon, FileTextIcon, MonitorIcon, ServerIcon, SlidersHorizontalIcon } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartOrTable, ExpandButton, MetricTrend, RefreshBar, TabbedCard, ThresholdStat, type TrendMetric } from '@/widgets/insight'
import { AuditLog, BeforeAfter, DecisionBar, EvidenceFigure, TraceSteps, type AuditEntry, type Decision, type VerdictOption } from '@/widgets/decision'
import { impactOf, NodeGraph, type GraphData } from '@/widgets/node-graph'
import { WidgetCard } from '@/widgets/panel'
import { CompareMatrix, DefTerm, ExcludedNote, LearningPath, Quiz, ResultCompare, SourceBoard, WorstCases, type Source } from '@/widgets/review'
import { Banner, CardGrid, ChoiceCards, DateRangePicker, Dropzone, FacetFilter, FilterBuilder, LoadingRows, matchRow, RepeatRows, SectionNav, SettingRow, StatusPage, Stepper, TagsInput, TreeView, type DateRange, type FilterState } from '@/widgets/parts'

type Entry = { no: string; name: string; when: string; wide?: boolean; render: () => ReactNode }
const Grid = ({ entries }: { entries: Entry[] }) => (
  <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @3xl/main:grid-cols-2">
    {entries.map((e) => (
      <div key={e.no} className={e.wide ? '@3xl/main:col-span-2' : ''}>
        <WidgetCard no={e.no} showNo title={e.name} sub={`언제 쓰나: ${e.when}`}>{e.render()}</WidgetCard>
      </div>
    ))}
  </div>
)
const Heading = ({ children, sub }: { children: ReactNode; sub: string }) => (
  <div className="px-4 lg:px-6"><h2 className="text-base font-semibold">{children}</h2><p className="text-sm text-muted-foreground">{sub}</p></div>
)

// ---- 견본 데이터(과제 데이터 아님)
const TREE = [
  { id: 'line-a', label: 'A 라인', meta: '설비 3', children: [
    { id: 'eq-101', label: 'ETCH-101', meta: '가동', children: [{ id: 'ch-1', label: '챔버 1' }, { id: 'ch-2', label: '챔버 2' }] },
    { id: 'eq-102', label: 'ETCH-102', meta: '점검' },
    { id: 'eq-103', label: 'CVD-103', meta: '가동' },
  ] },
  { id: 'line-b', label: 'B 라인', meta: '설비 1', children: [{ id: 'eq-201', label: 'CMP-201', meta: '가동' }] },
]
const ROWS = [
  { id: 'L-1041', equipment: 'ETCH-101', defects: 12 },
  { id: 'L-1042', equipment: 'ETCH-102', defects: 3 },
  { id: 'L-1043', equipment: 'CVD-103', defects: 27 },
  { id: 'L-1044', equipment: 'CMP-201', defects: 0 },
]
const AUDIT_SEED: AuditEntry[] = [
  { id: 'a1', at: '11-11 10:42', by: '운영자', target: 'L-1043', verdict: 'approve', proposal: 'CVD-103 정비를 2시간 앞당김' },
  { id: 'a2', at: '11-11 10:51', by: '운영자', target: 'L-1041', verdict: 'reject', reason: '같은 시간대에 납기 우선 로트가 있음', proposal: 'ETCH-101 을 다음 교대까지 정지' },
]

function StepperDemo() {
  const steps = [{ label: '데이터 고르기' }, { label: '조건 넣기' }, { label: '결과 확인' }, { label: '결정' }]
  const [cur, setCur] = useState(1)
  return (
    <div className="flex flex-col gap-4">
      <Stepper steps={steps} current={cur} onStep={setCur} />
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={cur === 0} onClick={() => setCur(cur - 1)}>이전</Button><Button size="sm" disabled={cur === steps.length - 1} onClick={() => setCur(cur + 1)}>다음</Button></div>
    </div>
  )
}
function TreeDemo() {
  const [sel, setSel] = useState('eq-101')
  return <div className="max-w-sm"><TreeView nodes={TREE} selected={sel} onSelect={setSel} defaultOpen={['line-a', 'eq-101']} /><p className="mt-2 text-xs text-muted-foreground">고른 것: {sel}</p></div>
}
function DateDemo() {
  const [range, setRange] = useState<DateRange>({})
  return <div className="flex flex-col gap-2"><DateRangePicker value={range} onChange={setRange} /><p className="text-xs text-muted-foreground">값: {range.from ?? '없음'} ~ {range.to ?? '없음'}</p></div>
}
function DropDemo() {
  const [names, setNames] = useState<string[]>([])
  return <div className="flex flex-col gap-2"><Dropzone accept=".csv,.xlsx" multiple onFiles={(f) => setNames(f.map((x) => `${x.name} (${(x.size / 1024).toFixed(1)}KB)`))} /><p className="text-xs text-muted-foreground">{names.length ? `받은 파일: ${names.join(', ')}, 이 견본은 전송하지 않습니다` : '아직 받은 파일이 없습니다'}</p></div>
}
function TagsDemo() {
  const [tags, setTags] = useState(['ETCH-101', 'CVD-103'])
  return <TagsInput label="설비 ID" value={tags} onChange={setTags} placeholder="설비 ID 입력 후 Enter" />
}
function FilterDemo() {
  const [state, setState] = useState<FilterState>({ join: 'and', rules: [{ id: 'r0', field: 'defects', op: 'gte', value: '10' }] })
  const hit = ROWS.filter((r) => matchRow(r, state))
  return (
    <div className="flex flex-col gap-3">
      <FilterBuilder fields={[{ key: 'equipment', label: '설비', type: 'text' }, { key: 'defects', label: '불량 수', type: 'number' }, { key: 'id', label: '로트', type: 'text' }]} value={state} onChange={setState} />
      <p className="text-sm tabular-nums">{ROWS.length}건 중 {hit.length}건: <span className="text-muted-foreground">{hit.map((r) => r.id).join(', ') || '없음'}</span></p>
    </div>
  )
}

function SectionDemo() {
  const [tab, setTab] = useState('alarm')
  const [on, setOn] = useState({ urgent: true, daily: false })
  const [view, setView] = useState('table')
  const [rows, setRows] = useState(['a-team@fab-ops.example'])
  const bars = (n: number) => <div className="flex h-10 items-end gap-1">{Array.from({ length: n }, (_, i) => <span key={i} className="w-2 rounded-sm bg-muted-foreground/40" style={{ height: `${30 + ((i * 37) % 60)}%` }} />)}</div>
  const lines = <div className="flex h-10 flex-col justify-center gap-1.5">{[80, 60, 70].map((w) => <span key={w} className="h-1.5 rounded bg-muted-foreground/40" style={{ width: `${w}%` }} />)}</div>
  return (
    <SectionNav label="설정 묶음" value={tab} onChange={setTab} sections={[
      { key: 'alarm', label: '알림', icon: <BellIcon className="size-4" />, content: (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">U14 설정 행: 바꾸면 바로 적용되는 항목</p>
          <SettingRow title="긴급 알람 즉시 알림" description="심각도가 긴급인 알람이 생기면 화면 위에 띄웁니다." checked={on.urgent} onChange={(v) => setOn({ ...on, urgent: v })} />
          <SettingRow title="하루 요약" description="매일 08:00 에 전날 알람을 한 번에 보여 줍니다." checked={on.daily} onChange={(v) => setOn({ ...on, daily: v })} />
        </div>
      ) },
      { key: 'view', label: '보기 방식', icon: <MonitorIcon className="size-4" />, content: (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">U15 선택 카드: 글자만으로는 차이가 안 보이는 선택지</p>
          <ChoiceCards label="목록 보기 방식" value={view} onChange={setView} options={[
            { value: 'table', label: '표', description: '한 줄에 한 건, 열로 비교', preview: lines },
            { value: 'board', label: '보드', description: '상태별 열에 카드로', preview: bars(9) },
            { value: 'chart', label: '차트', description: '추세를 먼저', preview: bars(14) },
          ]} />
        </div>
      ) },
      { key: 'contact', label: '담당자', icon: <SlidersHorizontalIcon className="size-4" />, content: (
        <div className="flex max-w-md flex-col gap-3">
          <p className="text-xs text-muted-foreground">U16 반복 입력 줄: 같은 모양의 값을 더하고 빼기</p>
          <RepeatRows label="알림 받을 주소" value={rows} onChange={setRows} placeholder="name@example.com" addLabel="주소 추가" max={4} />
        </div>
      ) },
    ]} />
  )
}
function FacetDemo() {
  const [status, setStatus] = useState<string[]>(['미조치'])
  const [sev, setSev] = useState<string[]>([])
  const data = [
    { id: 'ALM-0360', status: '조치중', sev: '긴급' }, { id: 'ALM-0312', status: '미조치', sev: '긴급' }, { id: 'ALM-0266', status: '조치중', sev: '긴급' },
    { id: 'ALM-0398', status: '미조치', sev: '주의' }, { id: 'ALM-0392', status: '조치 완료', sev: '주의' }, { id: 'ALM-0380', status: '조치 완료', sev: '주의' },
  ]
  const count = (k: 'status' | 'sev', v: string) => data.filter((d) => d[k] === v).length
  const shown = data.filter((d) => (!status.length || status.includes(d.status)) && (!sev.length || sev.includes(d.sev)))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <FacetFilter title="상태" value={status} onChange={setStatus} options={['미조치', '조치중', '조치 완료'].map((v) => ({ value: v, label: v, count: count('status', v) }))} />
        <FacetFilter title="심각도" value={sev} onChange={setSev} options={['긴급', '주의'].map((v) => ({ value: v, label: v, count: count('sev', v) }))} />
      </div>
      <p className="text-sm tabular-nums">{data.length}건 중 {shown.length}건: <span className="text-muted-foreground">{shown.map((d) => d.id).join(', ') || '없음'}</span></p>
    </div>
  )
}
function CardGridDemo() {
  const [linked, setLinked] = useState<string[]>(['mes'])
  const toggle = (id: string) => setLinked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const src = [
    { id: 'mes', title: '생산 실적', description: '로트별 공정 진행과 완료 시각. 읽기 전용 사본.', icon: <ServerIcon className="size-4" /> },
    { id: 'fdc', title: '설비 센서', description: '설비별 센서 요약값. 10분 단위.', icon: <DatabaseIcon className="size-4" /> },
    { id: 'doc', title: '점검 기록', description: '정비 일지와 조치 메모.', icon: <FileTextIcon className="size-4" /> },
  ]
  return <CardGrid items={src.map((s) => ({ ...s, done: linked.includes(s.id), status: linked.includes(s.id) ? '사용 중' : undefined, actionLabel: linked.includes(s.id) ? '해제' : '사용', onAction: () => toggle(s.id) }))} />
}
function StatusDemo() {
  const kinds = ['not-found', 'forbidden', 'error', 'maintenance', 'empty'] as const
  const names = { 'not-found': '없는 주소', forbidden: '권한 없음', error: '오류', maintenance: '점검 중', empty: '내용 없음' }
  const [kind, setKind] = useState<(typeof kinds)[number]>('not-found')
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">{kinds.map((k) => <Button key={k} size="sm" variant={k === kind ? 'default' : 'outline'} onClick={() => setKind(k)}>{names[k]}</Button>)}</div>
      <div className="rounded-lg border"><StatusPage kind={kind} detail={kind === 'error' ? 'GET /api/lots → 500' : undefined} actions={<><Button variant="outline" size="sm">뒤로</Button><Button size="sm">{kind === 'error' ? '다시 시도' : '대시보드로'}</Button></>} /></div>
    </div>
  )
}

export const PARTS: Entry[] = [
  { no: 'U1', name: '아코디언', when: '서로 독립인 묶음 여러 개(판정 근거·규칙 설명·자주 묻는 것)를 제목만 보이고 하나씩 펴 보게 할 때. 한 덩어리만 접을 거면 Collapsible', render: () => (
    <Accordion type="single" collapsible defaultValue="a">
      <AccordionItem value="a"><AccordionTrigger>판정 기준</AccordionTrigger><AccordionContent>불량 수가 기준값을 넘으면 「확인 필요」로 올립니다. 기준값은 설정 화면에서 바꿉니다.</AccordionContent></AccordionItem>
      <AccordionItem value="b"><AccordionTrigger>제외한 데이터</AccordionTrigger><AccordionContent>측정 시각이 없는 14건은 계산에서 뺐습니다.</AccordionContent></AccordionItem>
      <AccordionItem value="c"><AccordionTrigger>알려진 한계</AccordionTrigger><AccordionContent>설비 간 이동 시간은 고정값으로 두었습니다.</AccordionContent></AccordionItem>
    </Accordion>
  ) },
  { no: 'U2', name: '탭', when: '같은 대상을 보는 관점이 2~5개(요약·이력·근거)이고 한 번에 하나만 보면 될 때. 순서가 있는 절차면 U3', render: () => (
    <Tabs defaultValue="summary">
      <TabsList><TabsTrigger value="summary">요약</TabsTrigger><TabsTrigger value="history">이력</TabsTrigger><TabsTrigger value="basis">근거</TabsTrigger></TabsList>
      <TabsContent value="summary" className="pt-3 text-sm">ETCH-101 · 오늘 불량 12건 · 확인 필요</TabsContent>
      <TabsContent value="history" className="pt-3 text-sm">최근 7일 동안 기준 초과 2회</TabsContent>
      <TabsContent value="basis" className="pt-3 text-sm">기준값 10건(설정 화면) · 측정 시각 11-11 09:00</TabsContent>
    </Tabs>
  ) },
  { no: 'U3', name: '단계 표시', wide: true, when: '순서가 정해진 절차(고르기 → 조건 → 확인 → 결정)에서 지금 어디인지와 남은 단계를 보여 줄 때. 지난 단계는 눌러 돌아간다', render: () => <StepperDemo /> },
  { no: 'U4', name: '트리', when: '라인 > 설비 > 챔버처럼 계층이 있는 대상을 접고 펴며 하나 고를 때', render: () => <TreeDemo /> },
  { no: 'U5', name: '기간 고르기', when: '시작일~종료일을 달력에서 직접 고르게 할 때(오늘·7일·30일 같은 정해진 구간이면 기간 토글)', render: () => <DateDemo /> },
  { no: 'U6', name: '파일 끌어다 놓기', when: '사용자가 가진 파일(CSV·엑셀)을 화면에 넣게 할 때. 형식·크기를 받는 자리에서 바로 거른다', render: () => <DropDemo /> },
  { no: 'U7', name: '태그 입력', when: '정해진 목록 없이 값 여러 개(설비 ID·키워드)를 받는 입력. 목록에서 고르는 거면 Select·Checkbox', render: () => <TagsDemo /> },
  { no: 'U8', name: '조건 필터', wide: true, when: '「열 · 비교 · 값」 조건을 여러 개 쌓아 목록을 좁힐 때(조건이 한두 개로 고정이면 목록의 공통 필터)', render: () => <FilterDemo /> },
  { no: 'U9', name: '알림 띠', wide: true, when: '화면 전체에 걸리는 상태(데이터 기준 시각·재생성 필요·한도 임박)를 맨 위 한 줄로 알릴 때. 한 건에 대한 알림은 토스트·배지', render: () => (
    <div className="flex flex-col gap-2">
      <Banner title="데이터 기준 시각 11-11 09:00">그 뒤에 들어온 측정값은 아직 반영되지 않았습니다.</Banner>
      <Banner tone="warn" title="데이터셋이 바뀌었습니다" action={<Button size="sm" variant="outline">다시 계산</Button>}>지금 보이는 결과는 이전 데이터셋으로 만든 것입니다.</Banner>
    </div>
  ) },
  { no: 'U10', name: '로딩 뼈대', when: '1초 넘게 걸리는 요청(계산 실행·AI 응답·큰 조회)을 기다릴 때만. 바로 뜨는 데이터에는 쓰지 않는다', render: () => <LoadingRows rows={3} /> },
  { no: 'U11', name: '경로 표시', when: '목록 > 한 건 > 하위 화면처럼 두 단계 넘게 들어갔을 때 돌아갈 길을 보여 줄 때', render: () => (
    <Breadcrumb><BreadcrumbList>
      <BreadcrumbItem><BreadcrumbLink href="#/list">목록</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbLink href="#/list">A 라인</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator />
      <BreadcrumbItem><BreadcrumbPage>ETCH-101</BreadcrumbPage></BreadcrumbItem>
    </BreadcrumbList></Breadcrumb>
  ) },
  { no: 'U12', name: '분할 패널', wide: true, when: '목록과 상세를 나란히 두고 사용자가 폭을 조절하며 비교할 때(한 건만 잠깐 볼 거면 상세 드로어)', render: () => (
    <ResizablePanelGroup orientation="horizontal" className="min-h-40 rounded-lg border">
      <ResizablePanel defaultSize="35%" minSize="20%"><ul className="p-3 text-sm">{ROWS.map((r) => <li key={r.id} className="py-1 tabular-nums">{r.id} · {r.equipment}</li>)}</ul></ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="65%" minSize="30%"><div className="p-3 text-sm"><div className="font-medium">L-1043 · CVD-103</div><p className="mt-1 text-muted-foreground">불량 27건 · 기준 10건 초과 · 가운데 손잡이를 끌어 폭을 바꿉니다.</p></div></ResizablePanel>
    </ResizablePanelGroup>
  ) },
  { no: 'U13·U14·U15·U16', name: '세로 탭 레이아웃 + 설정 행 · 선택 카드 · 반복 입력 줄', wide: true, when: '설정처럼 묶음이 4개 넘는 화면은 왼쪽에 묶음 이름을 세로로 둔다(U13). 켜고 끄는 항목은 이름+설명+스위치 한 줄(U14), 글자로는 차이가 안 보이는 선택지는 미리보기 카드(U15), 같은 모양의 값을 더하고 빼는 입력은 반복 줄(U16)', render: () => <SectionDemo /> },
  { no: 'U17', name: '다중 선택 필터', when: '상태·심각도처럼 값이 몇 개로 정해진 열에서 여러 개를 골라 목록을 좁힐 때. 값마다 건수를 보여 준다(값이 자유 입력이면 U8)', render: () => <FacetDemo /> },
  { no: 'U18', name: '카드 격자', when: '항목마다 설명이 필요해 표로 만들기 어려운 목록(데이터 원천·연결할 시스템·보고서 종류)을 고르거나 켜고 끌 때', render: () => <CardGridDemo /> },
  { no: 'U19', name: '상태 화면', wide: true, when: '페이지 전체가 내용을 못 보여 줄 때. 없는 주소 · 권한 없음 · 서버 오류 · 점검 중 · 아직 내용 없음. 무슨 일인지 한 줄과 할 수 있는 일 한두 개를 준다', render: () => <StatusDemo /> },
]

function DecisionDemo() {
  const [log, setLog] = useState<AuditEntry[]>(AUDIT_SEED)
  const [done, setDone] = useState<{ verdict: Decision['verdict']; by: string; at: string; reason?: string } | null>(null)
  const decide = async (d: Decision) => {
    await new Promise((r) => setTimeout(r, 400)) // 견본: 실전에서는 saveDecision 의 서버 응답을 기다린다
    const n = new Date(), p2 = (v: number) => String(v).padStart(2, '0')
    const at = `${p2(n.getMonth() + 1)}-${p2(n.getDate())} ${p2(n.getHours())}:${p2(n.getMinutes())}`
    setDone({ verdict: d.verdict, by: '견본 사용자', at, reason: d.reason || undefined })
    setLog((prev) => [{ id: `a${prev.length + 1}`, at, by: '견본 사용자', target: 'L-1042', verdict: d.verdict, reason: d.reason || undefined, proposal: 'ETCH-102 점검을 오늘 14시로 당김' }, ...prev])
  }
  return (
    <div className="flex flex-col gap-4">
      <DecisionBar
        proposal="ETCH-102 점검을 오늘 14시로 당기면 대기 로트 3건이 납기 안에 들어옵니다."
        confidence="보통 · 가정 1개 포함"
        decided={done}
        onDecide={decide}
        basis={<BeforeAfter rows={[
          { label: '납기 초과 로트', before: '3건', after: '0건', delta: '-3건', better: true, kind: 'predicted' },
          { label: '설비 정지 시간', before: '2.0시간', after: '2.5시간', delta: '+0.5시간', better: false, kind: 'assumed' },
        ]} />}
      />
      {done ? <Button variant="outline" size="sm" className="self-start" onClick={() => setDone(null)}>견본 초기화</Button> : null}
      <AuditLog entries={log} />
    </div>
  )
}

export const DECISION: Entry[] = [
  { no: 'D1', name: '근거 꼬리표', when: '화면의 숫자가 실제로 잰 값인지, 계산이 낸 예측인지, 사람이 둔 가정인지 구분해 보여 줄 때. 효과·금액 숫자에는 항상 붙인다', render: () => (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <EvidenceFigure label="판정 일치율" value="94.2" unit="%" kind="measured" basis="검증 로트 120건 · 사람 판정과 비교" />
      <EvidenceFigure label="대기 시간 감소" value="18" unit="분/로트" kind="predicted" basis="지난 30일 데이터로 다시 계산" />
      <EvidenceFigure label="로트당 원가" value="1,200" unit="원" kind="assumed" basis="공개 자료 기준, 실제 값으로 교체 필요" />
    </div>
  ) },
  { no: 'D2', name: '현행 → 제안 비교', when: '제안을 적용하면 무엇이 얼마나 바뀌는지 항목별로 보여 줄 때. 나빠지는 항목도 같은 표에 둔다', render: () => (
    <BeforeAfter rows={[
      { label: '평균 대기', before: '52분', after: '34분', delta: '-18분', better: true, kind: 'predicted' },
      { label: '교체 횟수', before: '6회', after: '7회', delta: '+1회', better: false, kind: 'predicted' },
      { label: '검증 건수', before: '—', after: '120건', kind: 'measured' },
    ]} />
  ) },
  { no: 'D3', name: '거친 단계', when: '제안이 나오기까지 무엇을 읽고, 무엇이 계산하고, AI 는 어디에 쓰였는지 순서대로 보여 줄 때', render: () => (
    <TraceSteps steps={[
      { title: '데이터 읽기', who: '데이터', status: 'done', summary: '읽기 전용 사본에서 로트 1,240건 · 측정 시각 없는 14건 제외', detail: '원본에는 쓰지 않습니다. 제외한 14건은 「제외한 데이터」에서 볼 수 있습니다.' },
      { title: '제약 확인', who: '규칙', status: 'done', summary: '설비 용량 · 정비 시간 · 납기 3종' },
      { title: '일정 계산', who: '솔버', status: 'warn', summary: '납기 초과 0건인 해를 찾음 · 이동 시간은 고정값 가정', detail: '이동 시간이 실제와 20% 넘게 다르면 결과가 바뀔 수 있습니다.' },
      { title: '설명 문장', who: 'AI', status: 'done', summary: '계산 결과를 한 문장으로 요약(숫자는 계산값 그대로)' },
    ]} />
  ) },
  { no: 'D4 변형', name: '결정 바: 판정 선택지 바꾸기', when: '과제의 판정 낱말이 승인·수정·반려가 아닐 때(통과·재작업·보류, 승인·조건부 승인·반려, 출하·보류·폐기) options 로 바꾼다. 사유 필수 여부도 선택지마다 정한다', render: () => <OptionsDemo /> },
  { no: 'D4·D5', name: '결정 바 + 결정 기록', wide: true, when: '제안 한 건을 사람이 승인·수정·반려하고(수정·반려는 사유 필수), 그 결정이 누가·언제·왜로 남는 것을 보여 줄 때. 결과를 사람이 확정하는 화면에는 항상 둔다', render: () => <DecisionDemo /> },
]

// ---- 보기 부품 견본 데이터(과제 데이터 아님)
const DAYS = ['10-22', '10-23', '10-24', '10-25', '10-26', '10-27', '10-28']
const series = (ys: number[]) => DAYS.map((x, i) => ({ x, y: ys[i] }))
const TREND: TrendMetric[] = [
  { key: 'uptime', label: '평균 가동률', value: 91.3, unit: '%', decimals: 1, delta: '직전 7일보다 0.7%p 낮음', points: series([90.8, 92.4, 91.6, 91.9, 91.0, 90.6, 91.3]), target: { value: 92, label: '목표 92%' } },
  { key: 'alarms', label: '알람 건수', value: 185, unit: '건', delta: '직전 7일보다 30건 적음', points: series([31, 22, 27, 24, 29, 28, 24]) },
  { key: 'open', label: '미조치', value: 28, unit: '건', delta: '직전 7일보다 12건 많음', points: series([14, 16, 19, 21, 24, 27, 28]) },
]
const BY_EQ = [{ name: 'EQP-112', count: 23, share: 12.4 }, { name: 'EQP-105', count: 18, share: 9.7 }, { name: 'EQP-104', count: 18, share: 9.7 }, { name: 'EQP-116', count: 15, share: 8.1 }]
const BY_CODE = [{ name: 'E-103 가스 유량 편차', count: 23, share: 12.4 }, { name: 'E-102 RF 반사 전력', count: 18, share: 9.7 }, { name: 'P-302 노광 조도 저하', count: 18, share: 9.7 }]
const ShareList = ({ rows }: { rows: { name: string; count: number; share: number }[] }) => (
  <ul className="flex flex-col gap-1.5">
    {rows.map((r) => (
      <li key={r.name} className="relative flex items-center justify-between overflow-hidden rounded-md px-2 py-1.5 text-sm">
        <span className="absolute inset-y-0 left-0 bg-muted" style={{ width: `${Math.min(100, r.share * 6)}%` }} aria-hidden />
        <span className="relative">{r.name}</span><span className="relative tabular-nums text-muted-foreground">{r.count}건 · {r.share}%</span>
      </li>
    ))}
  </ul>
)
function RefreshDemo() {
  const now = () => new Date().toLocaleTimeString('ko-KR', { hour12: false })
  const [at, setAt] = useState(now)
  const [n, setN] = useState(28)
  return (
    <div className="flex flex-col gap-3">
      <RefreshBar updatedAt={at} onRefresh={async () => { await new Promise((r) => setTimeout(r, 500)); setAt(now()); setN((v) => v + 1) }} />
      <p className="text-sm">미조치 <span className="font-semibold tabular-nums">{n}</span>건 <span className="text-muted-foreground">(견본: 누를 때마다 1 늘어납니다)</span></p>
    </div>
  )
}
function ThresholdDemo() {
  const [v, setV] = useState(12)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ThresholdStat label="불량 수" value={v} unit="건" thresholds={{ warn: 10, urgent: 20, direction: 'high' }} note="기준값 설정 화면과 같은 값" />
        <ThresholdStat label="가동률" value={91.3} unit="%" decimals={1} thresholds={{ warn: 92, urgent: 88, direction: 'low' }} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">불량 수 바꿔 보기 <Button size="sm" variant="outline" onClick={() => setV(Math.max(0, v - 5))}>-5</Button><Button size="sm" variant="outline" onClick={() => setV(v + 5)}>+5</Button></div>
    </div>
  )
}

export const INSIGHT: Entry[] = [
  { no: 'V1·V5', name: '지표 전환 추세 + 사건 표시', wide: true, when: '지표 여러 개의 추세를 차트 하나로 볼 때. 지표를 누르면 차트가 그 지표로 바뀐다(V1). 정비·설정 변경·데이터 교체처럼 「이 변화가 왜 생겼나」를 설명하는 사건은 차트 위 세로 점선으로 찍는다(V5)', render: () => <MetricTrend metrics={TREND} events={[{ x: '10-23', label: '정비' }, { x: '10-26', label: '기준값 변경' }]} /> },
  { no: 'V2·V3', name: '카드 안 탭 + 크게 보기', when: '같은 대상을 다른 기준으로 나눈 목록(설비별·코드별)을 카드 하나에 둘 때(V2). 카드에 다 못 담은 행은 크게 보기로 펼친다(V3)', render: () => (
    <TabbedCard title="알람이 몰리는 곳" sub="최근 7일 · 185건" action={<ExpandButton title="알람이 몰리는 곳 · 설비별 전체"><ShareList rows={[...BY_EQ, { name: 'EQP-114', count: 14, share: 7.6 }, { name: 'EQP-115', count: 12, share: 6.5 }]} /></ExpandButton>} tabs={[
      { key: 'eq', label: '설비별', content: <ShareList rows={BY_EQ} /> },
      { key: 'code', label: '코드별', content: <ShareList rows={BY_CODE} /> },
    ]} />
  ) },
  { no: 'V4', name: '차트 ↔ 표 전환', when: '차트가 그린 숫자를 그 자리에서 표로 확인하게 할 때. 「이 숫자 어디서 나왔나」에 화면이 바로 답한다', render: () => (
    <ChartOrTable caption="차트와 같은 데이터 · 견본" columns={[{ key: 'x', label: '날짜' }, { key: 'y', label: '알람', numeric: true, unit: '건' }]} rows={TREND[1].points} chart={<MetricTrend metrics={[TREND[1]]} height={180} />} />
  ) },
  { no: 'V6', name: '갱신 시각 + 새로고침', when: '데이터가 계속 들어오는 화면에서 지금 보는 것이 언제 것인지 보이고 다시 받게 할 때. 실패하면 이전 데이터를 그대로 두고 알린다', render: () => <RefreshDemo /> },
  { no: 'W19 변형', name: '노드 그래프: 막히면 번지는 범위', wide: true, when: '공급망·공정 흐름처럼 앞뒤가 이어진 관계에서 한 곳이 막혔을 때 어디까지 영향이 가는지 보여 줄 때. 노드를 누르면 그 노드를 막은 것으로 본다(blocked · impactOf)', render: () => <ImpactDemo /> },
  { no: 'V7', name: '임계값 지표', when: '값이 기준을 넘으면 정상·주의·긴급으로 상태가 바뀌는 지표. 기준은 설정 화면의 기준값과 같은 숫자를 쓴다', render: () => <ThresholdDemo /> },
]

// ---- 검토 부품 견본 데이터(과제 데이터 아님 — 회사 이름·숫자 모두 지어낸 것)
const LOT_VERDICTS: VerdictOption[] = [{ value: 'pass', label: '통과', tone: 'ok' }, { value: 'rework', label: '재작업', needReason: true }, { value: 'hold', label: '보류', needReason: true, tone: 'urgent' }]
function OptionsDemo() {
  const [done, setDone] = useState<{ verdict: string; by: string; at: string; reason?: string } | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <DecisionBar options={LOT_VERDICTS} proposal="LOT L-2207 은 정렬 오차가 한도의 82% 입니다. 통과를 제안합니다." confidence="보통 · 계측 표본 5점" decided={done}
        onDecide={async (d) => { await new Promise((r) => setTimeout(r, 300)); setDone({ verdict: d.verdict, by: '견본 사용자', at: '11-11 10:20', reason: d.reason || undefined }) }} />
      {done ? <Button variant="outline" size="sm" className="self-start" onClick={() => setDone(null)}>견본 초기화</Button> : null}
    </div>
  )
}
const SRC = (name: string, status: Source['status'], basis: string): Source => ({ name, period: '2026년 3분기', basis, status })
const CHAIN: GraphData = {
  groups: [{ key: 'mat', label: '소재' }, { key: 'eq', label: '장비' }, { key: 'fab', label: '제조' }, { key: 'cust', label: '고객' }],
  nodes: [
    { id: 'gas', label: '특수 가스', group: 'mat', x: 8, y: 20 }, { id: 'wafer', label: '웨이퍼', group: 'mat', x: 8, y: 55 }, { id: 'resist', label: '감광액', group: 'mat', x: 8, y: 88 },
    { id: 'litho', label: '노광 장비', group: 'eq', x: 35, y: 75 }, { id: 'etch', label: '식각 장비', group: 'eq', x: 35, y: 25 },
    { id: 'front', label: '전공정', group: 'fab', x: 60, y: 50, kind: 'hub' }, { id: 'pkg', label: '패키징', group: 'fab', x: 78, y: 30 }, { id: 'test', label: '테스트', group: 'fab', x: 78, y: 72 },
    { id: 'server', label: '서버 고객', group: 'cust', x: 95, y: 30 }, { id: 'mobile', label: '모바일 고객', group: 'cust', x: 95, y: 72 },
  ],
  edges: [
    { from: 'gas', to: 'etch', group: 'mat' }, { from: 'wafer', to: 'front', group: 'mat' }, { from: 'resist', to: 'litho', group: 'mat' },
    { from: 'litho', to: 'front', group: 'eq' }, { from: 'etch', to: 'front', group: 'eq' },
    { from: 'front', to: 'pkg', group: 'fab' }, { from: 'front', to: 'test', group: 'fab' }, { from: 'pkg', to: 'server', group: 'cust' }, { from: 'test', to: 'mobile', group: 'cust' },
  ],
}
function ImpactDemo() {
  const [blocked, setBlocked] = useState<string | null>('resist')
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">막힌 곳 고르기:
        {['resist', 'gas', 'pkg'].map((id) => <Button key={id} size="sm" variant={blocked === id ? 'default' : 'outline'} onClick={() => setBlocked(id)}>{CHAIN.nodes.find((n) => n.id === id)!.label}</Button>)}
        <Button size="sm" variant="ghost" onClick={() => setBlocked(null)}>해제</Button>
        {blocked ? <span className="text-xs text-muted-foreground">impactOf → {impactOf(CHAIN, blocked).length}곳</span> : null}
      </div>
      <NodeGraph data={CHAIN} height={320} blocked={blocked} selectedId={blocked ?? undefined} onSelect={setBlocked} />
    </div>
  )
}
function LearnDemo() {
  const [done, setDone] = useState<string[]>(['intro'])
  const [last, setLast] = useState('')
  return (
    <div className="grid grid-cols-1 gap-6 @3xl/main:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">학습 경로: 앞 단계를 마치면 다음이 열린다</p>
        <LearningPath doneKeys={done} onOpen={(k) => setDone((d) => (d.includes(k) ? d : [...d, k]))} steps={[
          { key: 'intro', title: '밸류체인 한 장', summary: '소재 · 장비 · 제조 · 고객이 어떻게 이어지는가', minutes: 5, score: '3/3' },
          { key: 'front', title: '전공정', summary: '웨이퍼 위에 회로를 만드는 단계들', minutes: 10, reason: '후공정은 전공정이 만든 웨이퍼에서 시작하므로 먼저 봅니다.' },
          { key: 'back', title: '후공정', summary: '패키징과 테스트', minutes: 8 },
        ]} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">퀴즈: 채점 뒤 정답과 해설{last ? ` · 마지막 결과 ${last}` : ''}</p>
        <Quiz onDone={(r) => setLast(`${r.score}/${r.total}`)} questions={[
          { id: 'q1', topic: '전공정', text: '웨이퍼 위에 회로 무늬를 옮기는 공정은?', choices: ['노광', '패키징', '테스트'], answer: 0, explain: '노광은 빛으로 회로 무늬를 감광액에 옮기는 전공정 단계입니다.' },
          { id: 'q2', topic: '후공정', text: '칩을 잘라 보호하고 외부와 연결하는 단계는?', choices: ['식각', '패키징', '증착'], answer: 1, explain: '패키징은 후공정으로, 칩을 보호하고 기판과 전기적으로 잇습니다.' },
        ]} />
      </div>
    </div>
  )
}

export const REVIEW: Entry[] = [
  { no: 'R1', name: '결과 비교', when: '새로 계산한 결과를 지금 운영 중인 것과 나란히 보여 줄 때. 승인하는 사람은 「지금보다 무엇이 얼마나 달라지나」로 본다. 나빠지는 항목도 같은 표에', render: () => (
    <ResultCompare note="견본" rows={[
      { label: '평균 이동 시간', before: '47분', after: '39분', delta: '-8분', better: true, kind: 'predicted' },
      { label: '운행 대수', before: '14대', after: '15대', delta: '+1대', better: false, kind: 'predicted' },
      { label: '정원 초과 노선', before: '2개', after: '0개', delta: '-2개', better: true, kind: 'predicted' },
    ]} />
  ) },
  { no: 'R2·R3', name: '가장 나빠지는 건 + 계산에서 뺀 기록', when: '평균은 좋아져도 누군가는 나빠진다. 가장 나쁜 건을 평균과 같이 보인다(R2). 누락·이상 입력으로 계산에 넣지 않은 기록은 건수와 이유로 보인다(R3). 0건이어도 「뺀 기록 없음」을 적는다', render: () => (
    <div className="flex flex-col gap-5">
      <ExcludedNote total={1240} groups={[{ reason: '거주지 좌표 없음', count: 9, examples: ['M-0412', 'M-0733'] }, { reason: '근무 일정 형식 오류', count: 5, examples: ['M-1001'] }]} />
      <ExcludedNote label="기한을 못 맞추는 건" totalLabel="요청" total={32} noneText="모든 요청이 기한 안에 들어옵니다." groups={[{ reason: '평가 설비가 그 주에 꽉 참', count: 2, examples: ['CR-018', 'CR-023'] }, { reason: '선행 시험이 끝나지 않음', count: 1, examples: ['CR-031'] }]} />
      <WorstCases metric="이동 시간" unit="분" average={39} items={[
        { id: 'a', label: '구성원 M-0288', value: 118, before: 96, note: '평균의 3배' }, { id: 'b', label: '구성원 M-0631', value: 97, before: 101 }, { id: 'c', label: '구성원 M-0115', value: 88, before: 60, note: '이전보다 28분 늘어남' },
      ]} />
    </div>
  ) },
  { no: 'R4', name: '용어 정의', when: '부서마다 뜻이 다른 낱말(가동률·대기 시간·불량)이나 계산식이 있는 지표 옆에서 뜻·단위·산식을 바로 보게 할 때', render: () => (
    <p className="text-sm leading-7">이번 주 <DefTerm def={{ definition: '설비가 계획된 시간 중 실제로 생산에 쓰인 비율입니다. 정기 정비 시간은 계획 시간에서 뺍니다.', unit: '%', formula: '가동 시간 ÷ (달력 시간 − 정기 정비 시간)', source: '설비팀 정의(생산팀은 정비 시간을 빼지 않음)' }}>가동률</DefTerm>은 91.3% 이고, <DefTerm def={{ definition: '요청이 접수된 때부터 작업이 시작될 때까지 걸린 시간입니다.', unit: '분', formula: '시작 시각 − 요청 시각' }}>대기 시간</DefTerm>의 중앙값은 34분입니다. 밑줄 친 낱말을 누르면 정의가 열립니다.</p>
  ) },
  { no: 'R5·R6', name: '출처·기준 꼬리표 + 비교표', wide: true, when: '여러 대상(회사·설비·공급사)을 여러 기간·조건으로 비교할 때. 칸마다 출처와 상태(확정·잠정·환산)를 붙이고, 표 위에 무엇을 맞췄는지(통화·기간·정의) 적는다', render: () => (
    <CompareMatrix unit="조 원" decimals={1} highlight="max" aligned="원화 환산(분기 평균 환율) · 달력 분기 · 매출 기준"
      columns={[{ key: 'q1', label: '1분기' }, { key: 'q2', label: '2분기' }, { key: 'q3', label: '3분기' }]}
      rows={[
        { key: 'a', label: '가 회사', cells: { q1: { value: 12.4, source: SRC('실적 발표', '확정', '연결 매출') }, q2: { value: 14.1, source: SRC('실적 발표', '확정', '연결 매출') }, q3: { value: 15.0, source: SRC('잠정 실적', '잠정', '연결 매출 · 속보') } } },
        { key: 'b', label: '나 회사', cells: { q1: { value: 9.8, source: { ...SRC('분기 보고서', '환산', '달러 → 원, 회계 분기를 달력 분기로'), original: '72.1억 달러(회계 2분기)', steps: ['회계 2분기(12~2월)를 달력 1분기로 맞춤', '분기 평균 환율 1,360원 적용 → 9.8조 원'], quote: '2분기 매출은 72.1억 달러로 전 분기보다 늘었다.', where: '3쪽 요약' } }, q2: { value: 11.2, source: SRC('분기 보고서', '환산', '달러 → 원') }, q3: { value: null, note: '발표 전' } } },
      ]} />
  ) },
  { no: 'R7', name: '출처별 숫자 나란히', when: '같은 지표를 자료마다 다르게 말할 때 하나로 뭉개지 않고 나란히 둔다. 범위와 벌어진 정도를 같이 보인다', render: () => (
    <SourceBoard metric="내년 시장 규모 전망" unit="조 원" values={[
      { value: 210, source: { name: '조사기관 가', period: '2026-10 발표', basis: '달러 기준을 원화로 환산', status: '환산' } },
      { value: 187, source: { name: '조사기관 나', period: '2026-09 발표', basis: '출하량 × 평균 단가', status: '잠정' }, note: '보수적 가정' },
      { value: 232, source: { name: '증권사 보고서', period: '2026-11', basis: '상위 3사 합산', status: '잠정' } },
    ]} />
  ) },
  { no: 'R8', name: '퀴즈 + 학습 경로', wide: true, when: '이해도를 확인하거나 순서 있는 학습을 안내할 때. 채점 뒤에 정답과 해설을 보이고, 틀린 주제를 「다시 볼 것」으로 돌려준다', render: () => <LearnDemo /> },
]

export function PartsGallery() {
  return (
    <>
      <Heading sub="도메인 설정을 읽지 않는 일반 부품. 가져오는 곳: @/widgets/parts · @/components/ui/*">기본 부품 U1~U19</Heading>
      <Grid entries={PARTS} />
      <Heading sub="AI 가 제안하고 사람이 최종 판단하는 자리를 화면에 보이게 하는 묶음. 가져오는 곳: @/widgets/decision">결정 부품 D1~D5</Heading>
      <Grid entries={DECISION} />
      <Heading sub="숫자를 보고 그 자리에서 근거를 확인하게 하는 묶음. 가져오는 곳: @/widgets/insight">보기 부품 V1~V7</Heading>
      <Grid entries={INSIGHT} />
      <Heading sub="계산 결과를 사람이 믿고 승인할 수 있게 하는 묶음. 가져오는 곳: @/widgets/review">검토 부품 R1~R8</Heading>
      <Grid entries={REVIEW} />
    </>
  )
}
