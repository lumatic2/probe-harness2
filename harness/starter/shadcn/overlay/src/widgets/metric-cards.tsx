// W1 지표 카드 — dashboard-01 SectionCards 결: 라벨 · 큰 숫자 · 증감 배지(▲▼+개선/악화) · 굵은 해석 한 줄 · 회색 보조 한 줄
import { MinusIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { fmt } from '@/lib/derive'

type MetricItem = { label: string; value: number | null; unit: string; decimals?: number; delta: number | null; better: 'up' | 'down' | null; read: string; sub: string }
import { Empty } from './panel'

function DeltaBadge({ it }: { it: MetricItem }) {
  const dec = it.decimals ?? 0
  if (it.delta === null || !Number.isFinite(it.delta)) return <Badge variant="outline" className="text-muted-foreground">비교 없음</Badge>
  if (Math.abs(it.delta) < 0.5 * 10 ** -dec) return <Badge variant="outline" className="text-muted-foreground"><MinusIcon />변동 없음</Badge>
  const up = it.delta > 0
  // 방향이 없는 양 지표(건수 등)는 증감만 보여 준다 — 개선/악화로 읽히지 않게
  if (!it.better) return <Badge variant="outline" className="text-muted-foreground">{up ? '▲' : '▼'} {fmt(Math.abs(it.delta), dec)}{it.unit === '%' ? '%p' : it.unit}</Badge>
  const good = it.better === 'down' ? !up : up
  return (
    <Badge variant="outline">
      {up ? '▲' : '▼'} {fmt(Math.abs(it.delta), dec)}{it.unit === '%' ? '%p' : it.unit} {good ? '개선' : '악화'}
    </Badge>
  )
}

export function MetricCards({ items, cols = 4 }: { items: MetricItem[]; cols?: 4 | 5 }) {
  if (!items.length) return <Empty />
  return (
    <div>
      <div className={`grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 ${cols === 5 ? '@5xl/main:grid-cols-5' : '@5xl/main:grid-cols-4'}`}>
        {items.map((it) => (
          <Card key={it.label} className="@container/card">
            <CardHeader>
              <CardDescription>{it.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {fmt(it.value, it.decimals ?? 0)}<span className="ml-0.5 text-base font-medium text-muted-foreground">{it.unit}</span>
              </CardTitle>
              <CardAction><DeltaBadge it={it} /></CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="line-clamp-1 font-medium">{it.read || '–'}</div>
              <div className="min-h-5 text-muted-foreground">{it.sub}</div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
