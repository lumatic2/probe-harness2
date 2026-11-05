// panel.tsx — 위젯을 카드에 끼우는 껍데기 + 톤 배지 + 기간 토글(공통 필터와 같은 상태).
import type { ReactNode } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useApp } from '@/lib/app-context'
import { PERIODS } from '@/lib/derive'

// no = 위젯 번호(data-widget 속성으로만 남김, showNo 일 때만 제목 앞에 보임 — 위젯 모음 카탈로그용) · sub = 데이터를 말하는 짧은 보조 줄
export function WidgetCard({ no, showNo, title, sub, href, linkLabel = '자세히', seg, children, className }: {
  no?: string; showNo?: boolean; title: string; sub?: string; href?: string; linkLabel?: string; seg?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <Card className={`@container/card shadow-xs ${className ?? ''}`} data-widget={no}>
      <CardHeader>
        <CardTitle>{no && showNo ? <span className="mr-2 text-xs font-normal text-muted-foreground">{no}</span> : null}{title}</CardTitle>
        {sub ? <CardDescription>{sub}</CardDescription> : null}
        {seg || href ? (
          <CardAction className="flex items-center gap-2">
            {seg}
            {href ? <a className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground" href={href}>{linkLabel}<ChevronRightIcon className="size-3.5" /></a> : null}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// 차트 기간 — dashboard-01 과 같이 넓으면 ToggleGroup, 좁으면 Select (카드 폭 767px 기준)
export function PeriodToggle() {
  const { route, setQuery } = useApp()
  return (
    <>
      <ToggleGroup type="single" variant="outline" value={route.period} onValueChange={(v) => v && setQuery({ period: v })} aria-label="기간" className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex">
        {PERIODS.map((p) => <ToggleGroupItem key={p.v} value={p.v}>{p.label}</ToggleGroupItem>)}
      </ToggleGroup>
      <Select value={route.period} onValueChange={(v) => setQuery({ period: v })}>
        <SelectTrigger className="flex w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden" size="sm" aria-label="기간 선택">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          {PERIODS.map((p) => <SelectItem key={p.v} value={p.v} className="rounded-lg">{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  )
}

// 색만으로 구분하지 않는다 — 글자가 항상 같이 나온다. tone: urgent = 옅은 주황 배지 · warn = 회색 바탕 · plain = 테두리 · muted = 회색 글자 · strong = 테두리 + 굵은 글자(한 행에서 주황은 상태 열 하나뿐일 때 다른 강조 값)
export function ToneBadge({ text, tone }: { text: string; tone?: string }) {
  if (!text) return null
  return <Badge variant={tone === 'warn' ? 'secondary' : 'outline'} className={tone === 'urgent' ? 'sk-urgent' : tone === 'muted' ? 'text-muted-foreground' : tone === 'strong' ? 'font-semibold' : ''}>{text}</Badge>
}

export const Empty = ({ children = '표시할 데이터가 없습니다.' }: { children?: ReactNode }) => (
  <div className="py-8 text-center text-sm text-muted-foreground">{children}</div>
)
