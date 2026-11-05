// Business handlers are supplied by the caller; no simulated save or automatic retry.
import { useId, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export function ConfirmAction({ trigger, title, description, confirmLabel = '확인', pendingLabel = '처리 중…', successMessage, destructive = false, onConfirm }: {
  trigger: ReactNode; title: string; description: string; confirmLabel?: string; pendingLabel?: string
  successMessage?: string; destructive?: boolean; onConfirm: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const errorId = useId()
  const confirm = async () => {
    if (running.current) return
    running.current = true; setPending(true); setError('')
    try {
      await onConfirm()
      setOpen(false)
      if (successMessage) toast.success(successMessage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '처리하지 못했습니다. 상태를 확인한 뒤 다시 시도하세요.')
    } finally { running.current = false; setPending(false) }
  }
  return <AlertDialog open={open} onOpenChange={(next) => { if (!running.current) { setOpen(next); if (next) setError('') } }}>
    <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
    <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" aria-busy={pending} onEscapeKeyDown={(e) => { if (pending) e.preventDefault() }}>
      <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
      {error ? <p id={errorId} role="alert" className="text-sm break-words text-destructive">{error}</p> : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
        <Button variant={destructive ? 'destructive' : 'default'} disabled={pending} aria-describedby={error ? errorId : undefined} onClick={confirm}>{pending ? pendingLabel : confirmLabel}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}

export function DetailSheet({ trigger, title, description, children, footer }: {
  trigger: ReactNode; title: string; description: string; children: ReactNode; footer?: ReactNode
}) {
  return <Sheet>
    <SheetTrigger asChild>{trigger}</SheetTrigger>
    <SheetContent className="w-full sm:max-w-lg">
      <SheetHeader className="pr-12"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 break-words">{children}</div>
      <SheetFooter>{footer}<SheetClose asChild><Button variant="outline">닫기</Button></SheetClose></SheetFooter>
    </SheetContent>
  </Sheet>
}
