// download.ts — 브라우저에서 파일로 내려받기. JSON 은 과제가 준 출력 계약(EXPORT_SCHEMA 류) 모양 그대로 obj 를 만들어 넘긴다 — 여기서는 모양을 바꾸지 않는다.
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}
export const downloadJson = (name: string, obj: unknown) => downloadBlob(name, new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' }))
export const downloadText = (name: string, text: string, type = 'text/plain;charset=utf-8') => downloadBlob(name, new Blob([text], { type }))
