// ⑫ 노드 그래프 #/graph — 지도 없이 경로·흐름을 노드와 선으로 본다(W19). 데이터는 실행 결과 result.graph(/api/run-status) 가 있으면 그것, 없으면 /api/graph(data/graph.json 또는 data/store/graph.json).
// 오른쪽은 고른 노드의 상세(그룹·이어진 선). #/graph?node=<id> 로 들어오면 그 노드를 먼저 고른다(「내 정보」가 내 지점으로 보낼 때). 도메인 설정에 graph 키가 있을 때만 켜진다.
import { useEffect, useMemo, useState } from 'react'
import { LimitNote } from '@/components/page-parts'
import { Badge } from '@/components/ui/badge'
import { useApp } from '@/lib/app-context'
import { ctx } from '@/lib/derive'
import { NodeGraph, type GraphData } from '@/widgets/node-graph'
import { Empty, WidgetCard } from '@/widgets/panel'

export default function Graph() {
  const { route, setQuery } = useApp()
  const [data, setData] = useState<GraphData | null>(null)
  const [src, setSrc] = useState<'run' | 'file' | 'none'>('none')
  useEffect(() => {
    (async () => {
      const s = await fetch('/api/run-status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (s?.result?.graph?.nodes?.length) { setData(s.result.graph as GraphData); setSrc('run'); return }
      const g = await fetch('/api/graph', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (g?.nodes?.length) { setData(g as GraphData); setSrc('file') } else { setData({ nodes: [], edges: [] }); setSrc('none') }
    })()
  }, [])
  const sel = route.node
  const node = useMemo(() => data?.nodes.find((n) => n.id === sel), [data, sel])
  const links = useMemo(() => (data && sel ? data.edges.filter((e) => e.from === sel || e.to === sel) : []), [data, sel])
  const label = (id: string) => data?.nodes.find((n) => n.id === id)?.label ?? id
  const groupLabel = (k?: string) => data?.groups?.find((g) => g.key === k)?.label ?? k ?? '–'
  const cfg = ctx.d.graph ?? {}
  return (
    <>
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-12">
        <WidgetCard no="W19" title={cfg.title ?? '노드 그래프'} sub={src === 'run' ? '실행 결과' : src === 'file' ? 'data/graph.json' : '데이터 없음'} className="@4xl/main:col-span-8">
          {data ? <NodeGraph data={data} height={cfg.height ?? 520} selectedId={sel} onSelect={(id) => setQuery({ node: id }, true)} /> : <Empty>불러오는 중…</Empty>}
        </WidgetCard>
        <WidgetCard title={node ? node.label : '노드 상세'} sub={node ? `${node.kind === 'hub' ? (cfg.hubLabel ?? '거점') : (cfg.nodeLabel ?? '지점')} · ${groupLabel(node.group)}` : '그래프에서 노드를 누르세요'} className="@4xl/main:col-span-4">
          {!node ? <Empty>고른 노드가 없습니다.</Empty> : (
            <dl className="flex flex-col gap-3 text-sm" data-node-detail>
              {node.sub ? <div><dt className="text-xs text-muted-foreground">정보</dt><dd>{node.sub}</dd></div> : null}
              {node.seq !== undefined ? <div><dt className="text-xs text-muted-foreground">순서</dt><dd className="tabular-nums">{node.seq}</dd></div> : null}
              <div><dt className="text-xs text-muted-foreground">좌표</dt><dd className="tabular-nums">{node.x}, {node.y}</dd></div>
              <div>
                <dt className="mb-1 text-xs text-muted-foreground">이어진 선 {links.length}</dt>
                <dd className="flex flex-col gap-1">{links.map((e, i) => <span key={i} className="flex items-center gap-2"><Badge variant="outline" className="font-normal">{groupLabel(e.group)}</Badge><span>{label(e.from)} → {label(e.to)}</span>{e.label ? <span className="text-muted-foreground">{e.label}</span> : null}</span>)}</dd>
              </div>
            </dl>
          )}
        </WidgetCard>
      </div>
      <LimitNote extra="좌표는 제공 데이터 그대로(지도 아님) · 선 라벨은 소요시간 등 데이터 값" />
    </>
  )
}
