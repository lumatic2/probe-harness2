// table-widths.ts — 표의 열 폭을 「데이터 전체」로 한 번 정해 고정한다. 쪽을 넘기거나 탭·정렬·검색으로 보이는 행이 바뀌어도 열이 움직이지 않게.
// 왜: 표를 브라우저에 맡기면(자동 배치) 지금 보이는 행의 글자 길이에 맞춰 열 폭을 매번 다시 잡는다 → 쪽을 넘길 때마다 열이 1~30px 씩 흔들린다.
// 쓰는 법: const w = columnWidths(cols, allRows)  →  <Table className="table-fixed" style={{ minWidth: w.minWidth }}> + <TableHead style={{ width: w.percent[key] }}>.
//   allRows 는 「지금 보이는 행」이 아니라 그 표에 나올 수 있는 전체 행이다(쪽·탭으로 걸러지기 전).
// 글자 폭은 재지 않고 어림한다(한글·한자 = 글자 크기, 숫자·영문 대문자 ≈ 0.6배, 그 밖 ≈ 0.55배). 어림이라 여유(pad)를 넉넉히 둔다. 넘치는 칸은 줄이 바뀐다.
export type WidthCol = {
  key: string
  label: string              // 머리칸 글자
  text: (row: Record<string, unknown>) => string // 그 칸에 보이는 글자(꼬리표·보조 글자까지 이어 붙인 것)
  extra?: number             // 글자 말고 차지하는 폭(px): 배지 여백·아이콘·선택 상자 등
  min?: number               // 최소 폭(px): 입력 칸·선택 상자처럼 내용과 무관하게 필요한 폭
  sortable?: boolean         // 머리칸에 정렬 아이콘이 붙는가
}

// 글자 한 줄의 어림 폭(px). fontPx = 그 칸의 글자 크기(표 본문 기본 14).
export function textPx(s: string, fontPx = 14): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    w += c > 0x2e7f ? 1 : (c >= 48 && c <= 57) || (c >= 65 && c <= 90) ? 0.62 : c === 32 ? 0.3 : 0.56
  }
  return Math.ceil(w * fontPx)
}

export function columnWidths(cols: WidthCol[], rows: Record<string, unknown>[], opts: { fontPx?: number; pad?: number; fixed?: Record<string, number> } = {}) {
  const fontPx = opts.fontPx ?? 14, pad = opts.pad ?? 20
  const byKey: Record<string, number> = { ...(opts.fixed ?? {}) }
  for (const c of cols) {
    let w = textPx(c.label, fontPx) + (c.sortable ? 20 : 0)
    for (const r of rows) { const t = textPx(c.text(r), fontPx) + (c.extra ?? 0); if (t > w) w = t }
    byKey[c.key] = Math.max(c.min ?? 0, w) + pad
  }
  const total = Object.values(byKey).reduce((a, b) => a + b, 0)
  // percent = 표 폭에 대한 비율. 표를 width:100% + table-fixed 로 두고 열에 이 비율을 주면, 표는 늘 칸에 꼭 맞고(가로 스크롤이 생기지 않는다) 열의 비율은 보이는 행과 무관하게 같다.
  // minWidth = 이보다 좁아지면 글자가 겹치기 시작하는 폭. 좁은 화면에서는 이 폭을 지키고 표 상자 안에서 가로로 민다.
  const percent: Record<string, string> = Object.fromEntries(Object.entries(byKey).map(([k, w]) => [k, `${((w / total) * 100).toFixed(3)}%`]))
  return { byKey, percent, total, minWidth: Math.round(total * 0.8) }
}
