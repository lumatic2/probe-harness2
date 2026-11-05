// recorder.tsx — W18 녹음·전사: 녹음(MediaRecorder) 또는 오디오 파일 올리기 → 「텍스트로 바꾸기」 버튼 → /api/transcribe → 글.
// text(기본 true)면 전사 결과를 담는 고칠 수 있는 입력란을 함께 그린다. false 면 입력란은 쓰는 쪽(폼의 답변 칸 등)에 있고 onText 로 받는다.
// 키가 없거나 호출이 실패하면 서버가 모의 전사를 돌려주고 「모의 전사」 배지가 붙는다. 마이크가 없거나 막혀도(웹 IDE 미리보기 등) 오디오 파일 올리기로 같은 엔드포인트를 쓴다.
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export const MAX_SEC = 120
const MAX_BYTES = 8 * 1024 * 1024
const EXT_MIME: Record<string, string> = { webm: 'audio/webm', ogg: 'audio/ogg', mp4: 'audio/mp4', m4a: 'audio/x-m4a', mp3: 'audio/mpeg', wav: 'audio/wav' }
const REASON: Record<string, string> = { timeout: '시간 초과', network: '연결 실패', empty: '빈 응답' }
const reasonText = (r?: string) => (!r || r === 'no-key' ? '' : r.startsWith('http-') ? `응답 오류 ${r.slice(5)}` : REASON[r] ?? r)
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const canRecord = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
const toBase64 = (blob: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).split(',')[1] ?? '')
  r.onerror = () => fail(r.error)
  r.readAsDataURL(blob)
})

export function Recorder({ text = true, maxSec = MAX_SEC, onText }: { text?: boolean; maxSec?: number; onText?: (text: string, meta: { mock: boolean; reason?: string }) => void }) {
  const [supported] = useState(canRecord)
  const [on, setOn] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [mock, setMock] = useState(false)
  const [value, setValue] = useState('')
  const blob = useRef<{ data: Blob; mime: string } | null>(null)
  const mr = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<number | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  const release = () => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }
  useEffect(() => () => { release() }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const take = (data: Blob, mime: string, name: string) => {
    blob.current = { data, mime }
    setUrl(URL.createObjectURL(data))
    setLabel(name)
    setMock(false)
  }

  const start = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setNote('마이크 권한이 없거나 장치가 없어 녹음하지 못했습니다.')
      return
    }
    const chunks: Blob[] = []
    const rec = new MediaRecorder(stream.current)
    const t0 = Date.now()
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => {
      const secs = Math.min(maxSec, Math.round((Date.now() - t0) / 1000))
      release()
      setOn(false)
      setElapsed(secs)
      setLabel('')
      if (chunks.length) take(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), rec.mimeType || 'audio/webm', '')
    }
    mr.current = rec
    rec.start()
    setOn(true)
    setNote('녹음 중')
    setElapsed(0)
    timer.current = window.setInterval(() => {
      const s = (Date.now() - t0) / 1000
      setElapsed(Math.min(s, maxSec))
      if (s >= maxSec) { setNote(`최대 ${fmtClock(maxSec)} 까지만 녹음됩니다.`); rec.stop() }
    }, 250)
  }
  const stop = () => { if (mr.current?.state === 'recording') mr.current.stop() }

  const pickFile = (f?: File) => {
    if (!f) return
    const type = f.type.startsWith('audio/') ? f.type : EXT_MIME[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
    if (!type) { setNote('오디오 파일(webm · ogg · mp4 · mp3 · wav · m4a)만 올릴 수 있습니다.'); return }
    if (f.size > MAX_BYTES) { setNote(`파일이 ${MAX_BYTES / 1024 / 1024}MB 를 넘어 올릴 수 없습니다.`); return }
    take(f, type, f.name)
    setNote('')
  }

  const transcribe = async () => {
    if (!blob.current) return
    const my = ++seq.current
    setBusy(true)
    setNote('텍스트로 바꾸는 중…')
    try {
      const res = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: await toBase64(blob.current.data), mime: blob.current.mime }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || String(res.status))
      if (my !== seq.current) return
      setValue(j.text)
      setMock(!!j.mock)
      setNote(j.mock && reasonText(j.reason) ? `OpenAI 호출 실패(${reasonText(j.reason)}) — 모의 전사로 대신함` : '')
      onText?.(j.text, { mock: !!j.mock, reason: j.reason })
    } catch (e) {
      if (my === seq.current) setNote(`변환하지 못했습니다(${(e as Error).message}).`)
    } finally {
      if (my === seq.current) setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-recorder>
      <div className="flex flex-wrap items-center gap-2">
        {on ? <Button variant="outline" onClick={stop} data-rec-start>녹음 중지</Button> : <Button variant="outline" onClick={start} disabled={!supported} data-rec-start>녹음 시작</Button>}
        <Button variant="outline" onClick={() => file.current?.click()} disabled={on} data-rec-pick>오디오 파일 올리기</Button>
        <input ref={file} type="file" accept="audio/*" hidden data-rec-file onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
        <span className="text-sm tabular-nums text-muted-foreground" data-rec-time>{label || `${fmtClock(elapsed)} / ${fmtClock(maxSec)}`}</span>
      </div>
      {url ? <audio controls src={url} className="h-8 w-full" data-rec-audio /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={transcribe} disabled={!url || busy || on} data-rec-transcribe>텍스트로 바꾸기</Button>
        {mock ? <Badge variant="secondary" data-rec-mock>모의 전사</Badge> : null}
      </div>
      {text ? <Textarea aria-label="전사 결과" rows={4} value={value} onChange={(e) => setValue(e.target.value)} data-rec-text /> : null}
      <p className="min-h-4 text-xs text-muted-foreground" data-rec-note>{!supported && !note ? '이 브라우저에서는 녹음을 쓸 수 없습니다. 오디오 파일을 올려 전사할 수 있습니다.' : note}</p>
    </div>
  )
}
