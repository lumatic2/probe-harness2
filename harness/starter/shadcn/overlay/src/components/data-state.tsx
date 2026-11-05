import { Button } from '@/components/ui/button'

export function DataState({ kind, detail, retry }: { kind: 'loading' | 'error' | 'empty'; detail?: string; retry?: () => void }) {
  const title = { loading: '데이터를 불러오고 있습니다', error: '데이터를 불러오지 못했습니다', empty: '아직 표시할 데이터가 없습니다' }[kind]
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-3 border bg-card p-6" role={kind === 'error' ? 'alert' : 'status'} aria-busy={kind === 'loading'} data-state={kind}>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{detail || (kind === 'empty' ? '자료가 준비되면 다시 불러오세요. 데이터가 없는 상태는 정상·이상 판정이 아닙니다.' : '잠시만 기다려 주세요.')}</p>
      {retry ? <Button variant="outline" className="self-start" onClick={retry}>다시 불러오기</Button> : null}
    </section>
  )
}
