// page-parts.tsx — 모든 페이지가 쓰는 조각: 공통 필터 줄 · 「이 화면의 한계」 한 줄 · 페이지 틀
import type { ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useApp } from '@/lib/app-context'
import { ctx, groupAll, groupLabel, PERIODS, rowsIn, settingsNote, windowDates } from '@/lib/derive'

export function FilterBar() {
  const { route, setQuery } = useApp()
  const n = rowsIn(ctx, windowDates(ctx, route), route.group).length
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 lg:px-6" data-filter>
      <ToggleGroup type="single" variant="outline" size="sm" value={route.period} onValueChange={(v) => v && setQuery({ period: v })} aria-label="기간">
        {PERIODS.map((p) => <ToggleGroupItem key={p.v} value={p.v} className="px-3">{p.label}</ToggleGroupItem>)}
      </ToggleGroup>
      <Select value={route.group} onValueChange={(v) => setQuery({ group: v })}>
        <SelectTrigger size="sm" className="w-36" aria-label={groupLabel(ctx)}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="전체">{groupAll(ctx)}</SelectItem>
          {(ctx.d.group.values as string[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-sm text-muted-foreground">기간 내 {ctx.d.entity.plural} {n}{ctx.d.entity.unit}</span>
    </div>
  )
}

export const LimitNote = ({ extra }: { extra?: string }) => (
  <p className="px-4 pb-2 text-xs text-muted-foreground lg:px-6" data-limit>이 화면의 한계: {ctx.d.app.limit}{[extra, settingsNote(ctx)].filter(Boolean).map((t) => ` · ${t}`).join('')}</p>
)

export const Section = ({ children }: { children: ReactNode }) => <div className="px-4 lg:px-6">{children}</div>
export const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @3xl/main:grid-cols-2">{children}</div>
