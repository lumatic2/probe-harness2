// item-decision.tsx — 한 건에 대한 결정 상자. 「제안을 보고 → 사람이 판정을 고르고 → 사유를 적어 → 저장」을 한 자리에서 한다.
// 두 곳에서 같이 쓴다: 목록의 요약 창(한 번 눌러 바로 결정)과 상세 화면(#/item/<ID>). 결정이 필요한 화면을 더 만들면 <ItemDecision id=… /> 한 줄로 붙인다.
// 저장 경로는 입력·판정 화면과 같다: validate → makeDecision → saveDecision(/api/decisions-<도메인>). 그래서 어디서 결정해도 같은 기록에 쌓인다.
// 선택지·칸은 도메인 설정 form.fields 에서 온다: radio 칸의 선택지 = 판정 선택지, textarea 칸 = 사유, 그 밖의 칸(숫자·날짜 등) = 결정과 같이 받는 추가 입력.
// 제안 문장은 지금 「적용 규칙」(rulesFor)이라 배지가 「규칙 제안」이다. AI·솔버가 낸 제안으로 바꾸면 proposal·sourceLabel·confidence·basis 를 그것으로 채운다.
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/lib/app-context'
import { useAuth } from '@/lib/auth'
import { ctx, findRow, idOf, makeDecision, rulesFor, shortTs, validate } from '@/lib/derive'
import { DecisionBar, type Decision, type VerdictOption } from '@/widgets/decision'

type Field = { key: string; label: string; type: string; options?: string[]; required?: boolean }
const pad = (n: number) => String(n).padStart(2, '0')
const nowTs = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}` }

export function ItemDecision({ id }: { id: string }) {
  const { decisions, saveDecision } = useApp()
  const auth = useAuth()
  const [extras, setExtras] = useState<Record<string, string>>({})
  const [redo, setRedo] = useState(false)
  const row = findRow(ctx, id)
  if (!row) return null
  const fields = ctx.d.form.fields as Field[]
  const verdictField = fields.find((f) => f.type === 'radio')
  const reasonField = fields.find((f) => f.type === 'textarea')
  const extraFields = fields.filter((f) => f !== verdictField && f !== reasonField)
  const options: VerdictOption[] | undefined = verdictField?.options?.map((o, i, all) => ({ value: o, label: o, needReason: !!reasonField?.required || i > 0, tone: i === 0 ? 'ok' : i === all.length - 1 ? 'urgent' : undefined }))
  const hist = decisions.filter((x) => String(x.ref) === String(id))
  const last = hist.length ? hist[hist.length - 1] : null
  const decided = last && !redo ? { verdict: String(last[verdictField?.key ?? 'decision'] ?? ''), by: String(last.who), at: shortTs(String(last.ts)), reason: reasonField ? String(last[reasonField.key] ?? '') || undefined : undefined } : null
  const { applied } = rulesFor(ctx, row)
  const proposal = applied.length ? applied.map((r: { text: string }) => r.text).join(' · ') : `${ctx.d.entity.singular} ${idOf(ctx, row)} 에 적용된 규칙이 없습니다. 근거를 보고 판정을 남겨 주세요.`
  const decide = async (v: Decision) => {
    const input: Record<string, string> = { ref: String(id), ...extras, [verdictField?.key ?? 'decision']: v.verdict, ...(reasonField ? { [reasonField.key]: v.reason } : {}) }
    const errors = validate(ctx, input)
    if (Object.keys(errors).length) throw new Error(String(Object.values(errors)[0]))
    try { await saveDecision(makeDecision(ctx, decisions, input, nowTs(), auth.enabled && auth.user ? auth.user.name : undefined) as never) }
    catch (e) { throw new Error((e as Error).message === '403' ? '쓰기 권한이 있는 계정만 결정을 저장할 수 있습니다.' : `저장하지 못했습니다(${(e as Error).message}). 입력은 그대로 있습니다.`) }
    setExtras({}); setRedo(false)
  }
  return (
    <div data-tour="decision" data-item-decision={id}>
      <DecisionBar
        sourceLabel="규칙 제안"
        proposal={proposal}
        options={options}
        decided={decided}
        canDecide={auth.canWrite}
        onReopen={() => setRedo(true)}
        onDecide={decide}
        extra={extraFields.length ? (
          <div className="flex flex-wrap gap-3">
            {extraFields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`dx-${id}-${f.key}`}>{f.label}</Label>
                <Input id={`dx-${id}-${f.key}`} className="w-40 tabular-nums" inputMode={f.type === 'number' ? 'decimal' : 'text'} type={f.type === 'date' ? 'date' : 'text'} value={extras[f.key] ?? ''} onChange={(e) => setExtras({ ...extras, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
        ) : undefined}
      />
    </div>
  )
}
