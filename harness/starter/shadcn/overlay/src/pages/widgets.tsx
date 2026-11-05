// 위젯 모음 #/widgets — W1~W19 를 번호·이름·「언제 쓰나」와 함께 카드로 나열. 당일 어떤 위젯을 쓸지 고르는 카탈로그.
import type { ReactNode } from 'react'
import { InteractionGallery } from '@/components/interaction-gallery'
import { LimitNote } from '@/components/page-parts'
import { useApp } from '@/lib/app-context'
import { chatConfig, chatContext } from '@/domain/chat.mjs'
import { buildInputs, ctx, type Route } from '@/lib/derive'
import { ActivityFeed, AlertList, Distribution, FloorMap, Funnel, Heatmap, ProgressList, StatusBoard, Timeline } from '@/widgets/blocks'
import { ChatPanel } from '@/widgets/chat'
import { BarList, ControlChart, StackedBar, TrendChart } from '@/widgets/charts'
import { MetricCards } from '@/widgets/metric-cards'
import { NodeGraph, SAMPLE_GRAPH } from '@/widgets/node-graph'
import { Empty, WidgetCard } from '@/widgets/panel'
import { RankTable } from '@/widgets/rank-table'
import { Recorder } from '@/widgets/recorder'

type Inputs = ReturnType<typeof buildInputs>
type Entry = { no: string; name: string; when: string; wide?: boolean; render: (i: Inputs, route: Route) => ReactNode }
export const WIDGETS: Entry[] = [
  { no: 'W1', name: '지표 카드', wide: true, when: '맨 위에서 핵심 숫자 3~5개와 전 기간 대비 개선/악화를 한 줄로 보여 줄 때', render: (i) => <MetricCards items={i.w1.items} cols={5} /> },
  { no: 'W2', name: '추세 선·면', when: '시간에 따른 변화, 기준·목표선과 이상 구간을 보여 줄 때', render: (i) => <TrendChart w={i.w2} height={240} /> },
  { no: 'W3', name: '범주 가로 막대', when: '어느 범주가 가장 큰지 순위로 보여 줄 때(상위 N + 나머지)', render: (i) => <BarList w={i.w3} /> },
  { no: 'W4', name: '100% 누적 막대', when: '전체가 무엇으로 이루어졌는지 구성비를 보여 줄 때(도넛 대신)', render: (i) => <StackedBar w={i.w4} /> },
  { no: 'W5', name: '히트맵', when: '요일×시간처럼 두 기준으로 몰리는 곳을 보여 줄 때', render: (i) => <Heatmap w={i.w5} /> },
  { no: 'W6', name: '목표 대비 진척', when: '목표까지 남은 양과 기한을 보여 줄 때', render: (i) => <ProgressList w={i.w6} /> },
  { no: 'W7', name: '퍼널', when: '단계별 건수와 단계 사이 전환·이탈을 보여 줄 때', render: (i) => <Funnel w={i.w7} /> },
  { no: 'W8', name: '순위·판단 큐 표', wide: true, when: '먼저 볼 건을 정렬하고, 행을 펼쳐 근거를 확인하게 할 때', render: (i) => <RankTable w={i.w8} /> },
  { no: 'W9', name: '이상치·알림 목록', when: '지금 문제가 되는 건을 배지·시각과 함께 바로가기로 줄 때', render: (i) => <AlertList items={i.w9.items} /> },
  { no: 'W10', name: '상태 보드', wide: true, when: '일이 대기·진행·완료 어디에 몇 건 있는지 열로 보여 줄 때', render: (i) => <StatusBoard columns={i.w10.columns} /> },
  { no: 'W11', name: '일정 타임라인', wide: true, when: '언제 무엇이 겹치는지, 오늘 기준 진행 중인 일을 보여 줄 때', render: (i) => <Timeline w={i.w11} /> },
  { no: 'W12', name: '최근 활동', when: '누가 언제 무엇을 바꿨는지 줄 목록으로 보여 줄 때', render: (i) => <ActivityFeed items={i.w12.items} /> },
  { no: 'W13', name: '배치도', wide: true, when: '대상·구역을 격자에 놓고 상태를 색과 글자로 보여 줄 때', render: (i) => <FloorMap w={i.w13} /> },
  { no: 'W14', name: '관리도', when: '기준선과 상·하한 띠로 어느 날이 평소 범위를 벗어났는지 보여 줄 때(한계 밖 점을 누르면 그날 목록)', render: (i) => <ControlChart w={i.w14} height={240} /> },
  { no: 'W15', name: '분포', wide: true, when: '수치 열이 어디에 몰리는지, 중앙값과 p90 은 어디인지, 그룹마다 어떻게 다른지 보여 줄 때', render: (i) => <Distribution w={i.w15} /> },
  { no: 'W16', name: '행렬 히트맵', when: '두 범주(출발×도착, 라인×팀)의 조합마다 건수·평균이 얼마인지 보여 줄 때(칸을 누르면 그 조합의 목록)', render: (i) => (i.w16 ? <Heatmap w={i.w16} /> : <Empty>이 도메인 설정에 행렬이 없습니다.</Empty>) },
  { no: 'W17', name: 'AI 대화창', wide: true, when: '지금 보는 화면의 데이터를 AI 에게 묻고 답을 받을 때(대화는 페이지를 옮겨도 남고, 서버에 키가 없으면 모의 응답)', render: (_i, route) => <ChatPanel context={chatContext(ctx, route)} suggestions={chatConfig(ctx.d)?.suggestions} title="AI 대화창" /> },
  { no: 'W18', name: '녹음·전사', when: '사용자가 말로 입력해야 할 때(인터뷰 답변, 점검 메모를 말로) — 녹음 또는 오디오 파일을 글로 바꿔 입력란에 넣는다', render: () => <Recorder /> },
  { no: 'W19', name: '노드 그래프', wide: true, when: '지도 없이 지점·설비·창고처럼 위치가 있는 대상을 노드로, 경로·이동·흐름을 선으로 보여 줄 때(범례 칩으로 한 그룹만 보기, 노드 누르면 상세) — 화면은 #/graph', render: () => <NodeGraph data={SAMPLE_GRAPH} height={360} /> },
]

export default function Widgets() {
  const { route } = useApp()
  const i = buildInputs(ctx, route)
  return (
    <>
      <InteractionGallery />
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @3xl/main:grid-cols-2">
        {WIDGETS.map((w) => (
          <div key={w.no} className={w.wide ? '@3xl/main:col-span-2' : ''}>
            <WidgetCard no={w.no} showNo title={w.name} sub={`언제 쓰나: ${w.when}`}>{w.render(i, route)}</WidgetCard>
          </div>
        ))}
      </div>
      <LimitNote extra="견본 화면이며 실제 과제 데이터가 아님" />
    </>
  )
}
