// quick-add.tsx — 「빠른 등록」 모달. 어느 화면에서든 한 번에 열어 몇 칸만 채우고 등록하는 흐름이 필요한 서비스에서 쓴다(안 쓰면 lib/pages.ts 의 QUICK 을 null 로 둔다).
// 켜는 법: lib/pages.ts `QUICK = { label: '빠른 등록', dialog: true }` + 사이드바가 이 모달을 연다. 칸과 저장은 아래 FIELDS 와 onSubmit 을 과제에 맞게 바꾼다.
// 규칙: 필수 칸은 저장 전에 검사하고, 저장이 끝난 뒤에만 닫고 알린다. 실패하면 창과 입력을 그대로 둔다.
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type QuickField = { key: string; label: string; type?: 'text' | 'number' | 'textarea'; required?: boolean; placeholder?: string }

export function QuickAddDialog({ trigger, title, description, fields, submitLabel = '등록', onSubmit }: {
  trigger: ReactNode
  title: string
  description?: string
  fields: QuickField[]
  submitLabel?: string
  onSubmit: (values: Record<string, string>) => Promise<void> // 실제 저장을 await 하고 실패는 throw
}) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    const errs: Record<string, string> = {}
    for (const f of fields) {
      const v = (values[f.key] ?? '').trim()
      if (f.required && !v) errs[f.key] = `${f.label}을(를) 입력하세요.`
      else if (f.type === 'number' && v && !Number.isFinite(Number(v))) errs[f.key] = `${f.label}은(는) 숫자로 입력하세요.`
    }
    setErrors(errs); setFailure('')
    if (Object.keys(errs).length) return
    setPending(true)
    try {
      await onSubmit(Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? '').trim()])))
      setOpen(false); setValues({})
      toast.success(`${submitLabel} 완료`)
    } catch (err) {
      setFailure(err instanceof Error ? err.message : '저장하지 못했습니다. 입력은 그대로 있습니다.')
    } finally { setPending(false) }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) { setOpen(o); if (o) { setErrors({}); setFailure('') } } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto" data-quick-add>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description ? <DialogDescription>{description}</DialogDescription> : null}</DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {fields.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`qa-${f.key}`}>{f.label}{f.required ? ' (필수)' : ''}</Label>
              {f.type === 'textarea'
                ? <Textarea id={`qa-${f.key}`} rows={3} value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} aria-invalid={!!errors[f.key]} />
                : <Input id={`qa-${f.key}`} inputMode={f.type === 'number' ? 'decimal' : 'text'} value={values[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} aria-invalid={!!errors[f.key]} />}
              {errors[f.key] ? <p role="alert" className="text-xs text-destructive">{errors[f.key]}</p> : null}
            </div>
          ))}
          {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={pending}>취소</Button></DialogClose><Button type="submit" disabled={pending}>{pending ? '저장 중…' : submitLabel}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
