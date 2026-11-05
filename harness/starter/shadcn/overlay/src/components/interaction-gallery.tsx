// Development catalog only (#/widgets). These examples do not change business records.
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmAction, DetailSheet } from '@/components/action-shells'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { API_NAME } from '@/lib/derive'
import { WidgetCard } from '@/widgets/panel'

const KEY = 'interaction-gallery-note'
export function InteractionGallery() {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(() => { try { return sessionStorage.getItem(KEY) ?? '' } catch { return '' } })
  const [draft, setDraft] = useState(note)
  const [error, setError] = useState('')
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) { setError('메모를 입력하세요.'); return }
    try {
      sessionStorage.setItem(KEY, draft.trim())
      setNote(draft.trim()); setOpen(false)
      toast.success('이 탭에 견본 메모를 보관했습니다')
    } catch { setError('이 브라우저에서 메모를 보관할 수 없습니다. 입력은 유지됩니다.') }
  }
  const checkConnection = async () => {
    const response = await fetch(`/api/${API_NAME}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`연결 확인 실패 (HTTP ${response.status}). 서버를 확인하고 다시 시도하세요.`)
    const value: unknown = await response.json()
    if (!Array.isArray(value)) throw new Error('목록 응답 형식이 아닙니다. API 계약을 확인하세요.')
  }
  return <div className="px-4 lg:px-6" data-interaction-gallery>
    <WidgetCard title="입력·확인·피드백 부품" sub="개발용 견본 · 업무 기록을 변경하지 않습니다. 실전에는 필요한 부품만 가져갑니다.">
      <div className="flex flex-wrap gap-2">
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) { setDraft(note); setError('') } }}>
          <DialogTrigger asChild><Button variant="outline">메모 모달</Button></DialogTrigger>
          <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <DialogHeader><DialogTitle>견본 메모</DialogTitle><DialogDescription>이 브라우저 탭에만 보관됩니다. 업무 서버에 저장되지 않습니다.</DialogDescription></DialogHeader>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="space-y-2"><Label htmlFor="gallery-note">메모</Label><Textarea id="gallery-note" value={draft} onChange={(e) => setDraft(e.target.value)} aria-invalid={!!error} aria-describedby={error ? 'gallery-note-error' : undefined} maxLength={2000} />{error ? <p id="gallery-note-error" role="alert" className="text-sm text-destructive">{error}</p> : null}</div>
              <DialogFooter><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit">이 탭에 보관</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <ConfirmAction trigger={<Button variant="outline">확인창·비동기</Button>} title="데이터 연결을 확인할까요?" description="현재 도메인의 기록 목록을 읽습니다. 업무 데이터를 변경하지 않습니다." confirmLabel="연결 확인" pendingLabel="확인 중…" successMessage="데이터 연결을 확인했습니다" onConfirm={checkConnection} />
        <DetailSheet trigger={<Button variant="outline">상세 드로어</Button>} title="견본 메모 상세" description="목록을 떠나지 않고 한 건의 내용과 근거를 확인하는 패널입니다.">
          <p className="whitespace-pre-wrap text-sm">{note || '아직 보관한 견본 메모가 없습니다.'}</p>
        </DetailSheet>
        <Popover><PopoverTrigger asChild><Button variant="outline">도움말 팝오버</Button></PopoverTrigger><PopoverContent className="max-w-[calc(100vw-2rem)]"><h3 className="mb-2 font-medium">입력 범위</h3><p className="text-sm text-muted-foreground">짧은 설명은 팝오버, 긴 내용은 상세 패널에서 확인합니다.</p></PopoverContent></Popover>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">토스트 견본</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => toast.info('안내 메시지 견본')}>안내</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.success('성공 메시지 견본', { description: '업무 저장 결과가 아닌 표현 예시입니다.' })}>성공</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.error('오류 메시지 견본', { description: '실제 오류는 입력을 유지하고 재시도 경로를 제공합니다.' })}>오류</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost">도움말 툴팁</Button></TooltipTrigger><TooltipContent>키보드 포커스로도 표시됩니다.</TooltipContent></Tooltip>
      </div>
    </WidgetCard>
  </div>
}
