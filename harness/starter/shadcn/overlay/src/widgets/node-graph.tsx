// W19 노드 그래프 — 지도 없이 「위치가 있는 대상(지점·설비·공정·창고)」을 노드로, 「이동·흐름·순서」를 선으로 보여 준다. React Flow(@xyflow/react) 위에 shadcn 결의 노드.
// 입력은 좌표 그대로(위경도든 m 든) — 캔버스에 맞춰 늘리고(flipY 면 위도처럼 위가 큼), 좌표가 가까워 포개지는 노드는 서로 밀어내 읽히게 한다(layout — 데이터는 안 바뀌고 그림만 벌어진다).
// 모양 규칙: 허브(kind:'hub' — 거점·공장·창고)는 채운 검정, 지점은 카드. 그룹(경로·라인) 색은 --graph-1~6(sk-theme.css, 서로 구별되는 6색) 순환, 범례 칩을 누르면 그 그룹만 진하게.
// 휠 = 확대·축소, 빈 곳 끌기 = 이동, 노드 끌기 = 그 노드만 옮기기(「원래 자리로」로 복귀), 노드 클릭 = onSelect(id). 오른쪽 아래 버튼으로 맞춤 보기.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Badge } from '@/components/ui/badge'
import { Empty } from '@/widgets/panel'

export type GraphNode = { id: string; label: string; sub?: string; x: number; y: number; kind?: 'hub' | 'stop'; group?: string; seq?: number; tone?: 'warn' | 'urgent' }
export type GraphEdge = { id?: string; from: string; to: string; label?: string; group?: string }
export type GraphGroup = { key: string; label: string; color?: string }
export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[]; groups?: GraphGroup[]; flipY?: boolean }

const PALETTE = ['var(--graph-1)', 'var(--graph-2)', 'var(--graph-3)', 'var(--graph-4)', 'var(--graph-5)', 'var(--graph-6)']
const NEUTRAL = 'var(--muted-foreground)'
const PAD = 40
const NODE_H = 30 // 노드 상자 높이(px, 글자 12px 한 줄) — 겹침 계산용
const GAP = 8

type NodeData = GraphNode & { color?: string; dim?: boolean; active?: boolean }
type GNode = Node<NodeData, 'g'>

// 라벨 길이로 노드 폭을 어림한다(한글 1자 ≈ 12px, 영문·숫자 ≈ 7px, 여백·순서 배지 포함)
export function boxWidth(n: GraphNode) {
  const text = `${n.label}${n.sub ? ' ' + n.sub : ''}`
  let w = 0
  for (const ch of text) w += /[가-힣]/.test(ch) ? 12 : 7
  return w + 24 + (n.seq !== undefined ? 20 : 0)
}

// 좌표 → 캔버스 px(가로세로 비율 유지) → 포개진 상자를 서로 밀어낸다(최대 60회). 허브는 기준점이라 움직이지 않는다.
export function layout(nodes: GraphNode[], w: number, h: number, flipY = false) {
  const out = new Map<string, { x: number; y: number }>()
  if (!nodes.length) return out
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const s = Math.min((w - PAD * 2) / Math.max(maxX - minX, 1e-9), (h - PAD * 2) / Math.max(maxY - minY, 1e-9))
  const ox = (w - (maxX - minX) * s) / 2, oy = (h - (maxY - minY) * s) / 2
  const pos = nodes.map((n) => ({ id: n.id, x: ox + (n.x - minX) * s, y: flipY ? h - (oy + (n.y - minY) * s) : oy + (n.y - minY) * s, hw: boxWidth(n) / 2 + GAP / 2, hh: NODE_H / 2 + GAP / 2, fixed: n.kind === 'hub' }))
  for (let it = 0; it < 60; it++) {
    let moved = false
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j]
      if (a.fixed && b.fixed) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const overX = a.hw + b.hw - Math.abs(dx), overY = a.hh + b.hh - Math.abs(dy)
      if (overX <= 0 || overY <= 0) continue
      moved = true
      // 덜 겹친 축으로 비킨다 — 상자가 가로로 길어 보통 세로로 비키는 편이 좌표 왜곡이 작다
      const vertical = overY / (a.hh + b.hh) < overX / (a.hw + b.hw)
      const px = vertical ? 0 : (dx >= 0 ? 1 : -1) * (overX / 2 + 0.5)
      const py = vertical ? (dy >= 0 ? 1 : -1) * (overY / 2 + 0.5) : 0
      if (a.fixed) { b.x += px * 2; b.y += py * 2 } else if (b.fixed) { a.x -= px * 2; a.y -= py * 2 } else { a.x -= px; a.y -= py; b.x += px; b.y += py }
    }
    if (!moved) break
  }
  for (const p of pos) out.set(p.id, { x: p.x, y: p.y })
  return out
}

const CENTER = '!left-1/2 !top-1/2 !size-0 !min-h-0 !min-w-0 !-translate-x-1/2 !-translate-y-1/2 !border-0 !opacity-0'
function GraphNodeView({ data, selected }: NodeProps<GNode>) {
  const hub = data.kind === 'hub'
  const tone = data.tone === 'urgent' ? 'border-destructive ring-destructive/25' : data.tone === 'warn' ? 'border-amber-500 ring-amber-500/25' : ''
  return (
    <div
      className={`relative flex cursor-grab items-center gap-1.5 rounded-md border px-2 py-1 text-xs shadow-xs transition-opacity active:cursor-grabbing ${hub ? 'border-foreground bg-foreground font-semibold text-background' : `bg-card text-card-foreground ${tone}`} ${selected || data.active ? 'ring-2 ring-ring/60' : ''} ${data.dim ? 'opacity-30' : ''}`}
      style={{ height: NODE_H }}
      data-node={data.id}
      data-kind={data.kind ?? 'stop'}
    >
      {data.seq !== undefined ? <span className="inline-flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-white tabular-nums" style={{ background: data.color ?? NEUTRAL }}>{data.seq}</span> : null}
      <span className="whitespace-nowrap">{data.label}</span>
      {data.sub ? <span className={`whitespace-nowrap ${hub ? 'text-background/70' : 'text-muted-foreground'}`}>{data.sub}</span> : null}
      <Handle type="target" position={Position.Top} className={CENTER} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className={CENTER} isConnectable={false} />
    </div>
  )
}
const NODE_TYPES = { g: GraphNodeView }

// 한 노드가 막혔을 때 영향이 번지는 범위 — 선의 방향(from → to)을 따라 닿는 모든 노드. 막힌 노드 자신은 들어가지 않는다.
export function impactOf(data: GraphData, blockedId: string): string[] {
  const out = new Set<string>(), queue = [blockedId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of data.edges) if (e.from === cur && e.to !== blockedId && !out.has(e.to)) { out.add(e.to); queue.push(e.to) }
  }
  return [...out]
}

// blocked = 막힌 노드 id. 주면 그 노드는 긴급, 번지는 노드는 주의로 칠하고 나머지는 흐리게 — 그래프 위에 「막힌 곳 → 영향 N곳」 한 줄이 붙는다.
export function NodeGraph({ data, height = 420, selectedId, onSelect, className, blocked }: { data: GraphData; height?: number; selectedId?: string; onSelect?: (id: string) => void; className?: string; blocked?: string | null }) {
  const hit = useMemo(() => (blocked && data.nodes.some((n) => n.id === blocked) ? new Set(impactOf(data, blocked)) : null), [data, blocked])
  const groups = useMemo(() => (data.groups ?? []).map((g, i) => ({ ...g, color: g.color ?? PALETTE[i % PALETTE.length] })), [data.groups])
  const colorOf = useCallback((key?: string) => groups.find((g) => g.key === key)?.color ?? NEUTRAL, [groups])
  const [only, setOnly] = useState<string | null>(null)
  useEffect(() => { setOnly(null) }, [data])

  // 레이아웃 기준은 고정(1000×height) — fitView 가 화면에 맞춘다. 끌어 옮긴 노드 위치는 기억한다(새 데이터가 오면 초기화).
  const base = useMemo(() => layout(data.nodes, 1000, height, data.flipY), [data.nodes, data.flipY, height])
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({})
  useEffect(() => { setMoved({}) }, [base])
  const nodes = useMemo<GNode[]>(() => data.nodes.map((n) => ({
    id: n.id, type: 'g', position: moved[n.id] ?? base.get(n.id) ?? { x: 0, y: 0 }, selected: n.id === selectedId, zIndex: n.kind === 'hub' ? 10 : 1,
    data: { ...n, tone: hit ? (n.id === blocked ? 'urgent' : hit.has(n.id) ? 'warn' : undefined) : n.tone, color: colorOf(n.group), dim: hit ? n.id !== blocked && !hit.has(n.id) : !!only && n.kind !== 'hub' && n.group !== only, active: n.id === selectedId },
  })), [data.nodes, base, moved, colorOf, only, selectedId, hit, blocked])
  const edges = useMemo<Edge[]>(() => data.edges.map((e, i) => {
    const onPath = !!hit && (e.from === blocked || hit.has(e.from)) && hit.has(e.to)
    const dim = hit ? !onPath : !!only && e.group !== only
    const color = onPath ? 'var(--sk-orange)' : colorOf(e.group)
    return {
      id: e.id ?? `${e.from}→${e.to}#${i}`, source: e.from, target: e.to, type: 'straight', label: e.label, focusable: false,
      style: { stroke: color, strokeWidth: dim ? 1 : 2, opacity: dim ? 0.15 : 0.9 },
      labelStyle: { fill: 'var(--muted-foreground)', fontSize: 10, opacity: dim ? 0 : 1 }, labelBgStyle: { fill: 'var(--background)', opacity: dim ? 0 : 0.9 }, labelBgPadding: [3, 1] as [number, number],
    }
  }), [data.edges, colorOf, only, hit, blocked])

  if (!data.nodes.length) return <Empty>표시할 노드가 없습니다.</Empty>
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`} data-node-graph>
      {hit ? <p className="text-sm" data-impact={hit.size}><span className="font-semibold">막힌 곳: {data.nodes.find((n) => n.id === blocked)?.label}</span> → 영향이 번지는 곳 <span className="font-semibold tabular-nums">{hit.size}곳</span>{hit.size ? <span className="text-muted-foreground">: {data.nodes.filter((n) => hit.has(n.id)).map((n) => n.label).join(', ')}</span> : <span className="text-muted-foreground"> (뒤로 이어지는 곳이 없습니다)</span>}</p> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.length ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="그룹 범례">
            {groups.map((g) => (
              <button key={g.key} type="button" onClick={() => setOnly((o) => (o === g.key ? null : g.key))} aria-pressed={only === g.key} data-group={g.key} className="focus-visible:outline-none">
                <Badge variant={only === g.key ? 'default' : 'outline'} className="gap-1.5 font-normal"><span className="size-2 rounded-full" style={{ background: g.color }} />{g.label}</Badge>
              </button>
            ))}
            {only ? <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setOnly(null)}>전체 보기</button> : null}
          </div>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">휠 확대·축소 · 빈 곳 끌기 이동 · 노드 끌기 옮기기{Object.keys(moved).length ? <> · <button type="button" className="underline-offset-4 hover:underline" onClick={() => setMoved({})}>원래 자리로</button></> : null}</span>
      </div>
      <div className="overflow-hidden rounded-lg border bg-muted/30" style={{ height }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} nodeOrigin={[0.5, 0.5]} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2} maxZoom={4}
          nodesConnectable={false} nodesDraggable elementsSelectable={!!onSelect} zoomOnScroll panOnDrag zoomOnDoubleClick={false} preventScrolling
          onNodeClick={(_, n) => onSelect?.(n.id)}
          onNodeDragStop={(_, n) => setMoved((m) => ({ ...m, [n.id]: n.position }))}
        >
          <Background gap={24} size={1} color="var(--border)" />
          <Controls showInteractive={false} position="bottom-right" />
          {data.nodes.length > 40 ? <MiniMap pannable zoomable nodeColor={(n) => ((n.data as NodeData).kind === 'hub' ? 'var(--foreground)' : (n.data as NodeData).color ?? NEUTRAL)} maskColor="color-mix(in oklch, var(--muted) 70%, transparent)" style={{ background: 'var(--card)' }} /> : null}
        </ReactFlow>
      </div>
    </div>
  )
}

// 위젯 모음 견본 — 허브 하나에 두 경로. 도메인과 무관한 모양만 보인다.
export const SAMPLE_GRAPH: GraphData = {
  groups: [{ key: 'a', label: '경로 A' }, { key: 'b', label: '경로 B' }],
  nodes: [
    { id: 'hub', label: '거점', sub: '도착 08:30', kind: 'hub', x: 50, y: 50 },
    { id: 'a1', label: '지점 1', sub: '12명', group: 'a', seq: 1, x: 10, y: 20 }, { id: 'a2', label: '지점 2', sub: '9명', group: 'a', seq: 2, x: 25, y: 35 }, { id: 'a3', label: '지점 3', sub: '15명', group: 'a', seq: 3, x: 38, y: 30 },
    { id: 'b1', label: '지점 4', sub: '7명', group: 'b', seq: 1, x: 90, y: 85 }, { id: 'b2', label: '지점 5', sub: '20명', group: 'b', seq: 2, tone: 'warn', x: 72, y: 70 },
  ],
  edges: [
    { from: 'a1', to: 'a2', label: '7분', group: 'a' }, { from: 'a2', to: 'a3', label: '5분', group: 'a' }, { from: 'a3', to: 'hub', label: '11분', group: 'a' },
    { from: 'b1', to: 'b2', label: '9분', group: 'b' }, { from: 'b2', to: 'hub', label: '14분', group: 'b' },
  ],
}
