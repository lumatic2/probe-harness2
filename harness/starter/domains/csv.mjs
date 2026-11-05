// csv.mjs — 의존성 0 CSV 파서 (브라우저·Node 공용).
// 처리: 따옴표 필드 · 필드 안 콤마/줄바꿈 · "" 이스케이프 · CRLF · BOM · 빈 줄 건너뛰기
// 한계: 구분자는 인자로 정한다(기본 콤마). 구분자 자동 판별은 import.mjs 의 readTable.

// 줄 단위로 읽는다: [{ cells: string[], line }] — line = 그 행이 시작한 파일 줄 번호(1부터, 따옴표 안 줄바꿈 포함해 센다)
export function scanCsv(text, delim = ',') {
  const src = text.replace(/^﻿/, ''); // BOM 제거 (엑셀 저장 CSV 대응)
  const out = [];
  let row = [], cur = '', q = false, line = 1, start = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else { if (ch === '\n') line++; cur += ch; }
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.length > 1 || row[0] !== '') out.push({ cells: row, line: start }); // 빈 줄 스킵
      row = [];
      line++; start = line;
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push({ cells: row, line: start }); }
  return out;
}

export function parseCsv(text, delim = ',') {
  const rows = scanCsv(text, delim).map((r) => r.cells);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) =>
    Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]))
  );
}
