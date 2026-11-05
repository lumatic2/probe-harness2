// ① 대시보드 — 지표 카드 4 → 추세(기간은 위 필터 줄 하나) → 범주 막대 + 지금 문제 → 히트맵 + 퍼널 → 표(DataTable, 오늘의 큐) → 배치도 → 최근 활동
// 제목·열·지표는 전부 도메인 설정(src/domain/<이름>/domain.json)에서 온다.
import { DataTable } from '@/components/data-table'
import { Grid, LimitNote, Section } from '@/components/page-parts'
import { useApp } from '@/lib/app-context'
import { buildInputs, ctx, filterRows, periodLabel, whereToFilters } from '@/lib/derive'
import { ActivityFeed, AlertList, Funnel, Heatmap, FloorMap } from '@/widgets/blocks'
import { BarList, TrendChart } from '@/widgets/charts'
import { MetricCards } from '@/widgets/metric-cards'
import { WidgetCard } from '@/widgets/panel'

export default function Dashboard() {
  const { route, link, setQuery } = useApp()
  const i = buildInputs(ctx, route)
  const rows = filterRows(ctx, route)
  const sortProp = { key: route.sort || 'queue', dir: (route.dir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc', onSort: (k: string) => setQuery({ sort: k, dir: route.sort === k && route.dir !== 'desc' ? 'desc' : 'asc' }) }
  const total = i.w3.rows.reduce((t: number, r: { value: number }) => t + r.value, 0)
  const unit = ctx.d.entity.unit
  const alertLink = link('list', whereToFilters(ctx.d.alerts.where))
  return (
    <>
      <Section><MetricCards items={i.w1.items.slice(0, 4)} /></Section>
      <Section>
        <WidgetCard no="W2" title={i.w2.title} sub={`${periodLabel(route.period)}${i.w2.target ? ' · ' + i.w2.target.label : ''}`} href={link('list')} linkLabel="목록">
          <TrendChart w={i.w2} />
        </WidgetCard>
      </Section>
      <Grid>
        <WidgetCard no="W3" title={i.w3.title} sub={`${periodLabel(route.period)} · ${ctx.d.entity.plural} ${total}${unit}`} href={link('list')} linkLabel="목록"><BarList w={i.w3} /></WidgetCard>
        <WidgetCard no="W9" title={i.w9.title} href={alertLink} linkLabel="전체"><AlertList items={i.w9.items} /></WidgetCard>
        <WidgetCard no="W5" title={i.w5.title} href={link('list')} linkLabel="목록"><Heatmap w={i.w5} /></WidgetCard>
        <WidgetCard no="W7" title={i.w7.title} href={link('list')} linkLabel="목록"><Funnel w={i.w7} /></WidgetCard>
      </Grid>
      <DataTable rows={rows} sort={sortProp} />
      <Section>
        <WidgetCard no="W13" title={i.w13.title}><FloorMap w={i.w13} /></WidgetCard>
      </Section>
      <Section>
        <WidgetCard no="W12" title={i.w12.title}><ActivityFeed items={i.w12.items.slice(0, 5)} /></WidgetCard>
      </Section>
      <LimitNote />
    </>
  )
}
