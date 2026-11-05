// store.ts — /api/<이름> 에 JSON 한 덩어리를 읽고 쓰는 훅 (일정 확정·문서 검토 기록처럼 도메인마다 따로 쌓이는 저장물).
// GET 이 404(아직 저장한 적 없음)이면 empty 로 시작한다. 저장은 전체를 POST — 서버가 data/store/<이름>.json 에 쓴다.
import { useCallback, useEffect, useRef, useState } from 'react'

export function useStore<T>(name: string, empty: T) {
  const base = useRef(empty)
  const [data, setData] = useState<T>(empty)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let live = true
    fetch(`/api/${name}`).then((r) => (r.ok ? r.json() : base.current)).then((d: T) => { if (live) { setData(d); setLoaded(true) } }).catch(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [name])
  const save = useCallback(async (next: T) => {
    const res = await fetch(`/api/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
    if (!res.ok) throw new Error(String(res.status))
    setData(next)
  }, [name])
  return { data, loaded, save }
}
