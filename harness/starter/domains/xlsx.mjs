// xlsx.mjs — 의존성 0 엑셀(.xlsx) 만들기 (브라우저·Node 공용)
// .xlsx = zip 안의 XML. 압축 없는 zip(저장 방식)을 직접 쓰므로 라이브러리가 필요 없다. 글자 칸은 inlineStr(공유 문자열 표 없음).
// 구성: zipStore(파일들) → buildXlsx(시트들) → buildReportWorkbook(ctx, state, …)(요약 시트 + 데이터 시트) → downloadXlsx(이름, 바이트)
// 칸 모양: null | 글자 | 숫자 | { v, kind?: 'num'|'date'|'datetime', dec?, bold?, title? }.  date·datetime 의 v 는 엑셀 일련번호(excelSerial).
// 한계: 수식·병합·그림·여러 글꼴 없음. 표 서식은 머리글 굵게+회색 바탕, 열 너비, 날짜·천 단위 구분 숫자 서식, 머리글 줄 고정, 자동 필터.
import { activeFilters, buildSummary, colLabel, compareDiff, compareRows, ddayText, groupName, metricsFor, periodLabel, tableCols, windowDates } from './core.mjs';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---------- zip (저장 방식) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const enc = new TextEncoder();
// files: [{ name, data: Uint8Array }] → zip 바이트. 파일 이름은 UTF-8 표시(0x0800), 시각은 1980-01-01 고정(같은 입력 → 같은 파일).
export function zipStore(files) {
  const parts = []; const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 33, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 33, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((t, p) => t + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((t, p) => t + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// ---------- 값 변환 ----------
// 'YYYY-MM-DD[ T]HH:MM[:SS]' → 엑셀 일련번호(1899-12-30 이 0일). 읽을 수 없으면 null.
export function excelSerial(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s ?? '').trim());
  if (!m) return null;
  const days = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569;
  if (!Number.isFinite(days)) return null;
  const frac = ((+(m[4] || 0)) * 3600 + (+(m[5] || 0)) * 60 + (+(m[6] || 0))) / 86400;
  return days + frac;
}
export const sheetName = (s) => String(s ?? '').replace(/[\[\]:*?/\\]/g, '').slice(0, 31) || '시트';
const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const xmlText = (s) => String(s ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- 스타일 (cellXfs 순서가 곧 s= 값) ----------
// 0 기본 · 1 머리글(굵게+회색 바탕+아래 선) · 2 날짜 · 3 날짜+시각 · 4~7 숫자 소수 0~3자리 · 8 제목(굵게 14pt)
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/><numFmt numFmtId="166" formatCode="#,##0.0"/><numFmt numFmtId="167" formatCode="#,##0.000"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="14"/><name val="맑은 고딕"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F1F1"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function styleOf(c) {
  if (c.title) return 8;
  if (c.bold) return 1;
  if (c.kind === 'date') return 2;
  if (c.kind === 'datetime') return 3;
  if (c.kind === 'num') return 4 + Math.min(3, Math.max(0, c.dec ?? 0));
  return 0;
}

function sheetXml(sh) {
  const rows = sh.rows || [];
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const cols = (sh.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const body = rows.map((r, ri) => {
    const cells = r.map((raw, ci) => {
      if (raw === null || raw === undefined || raw === '') return '';
      const c = typeof raw === 'object' ? raw : { v: raw };
      const ref = `${colName(ci)}${ri + 1}`, s = styleOf(c);
      if (c.v === null || c.v === undefined || c.v === '') return '';
      if (typeof c.v === 'number') return Number.isFinite(c.v) ? `<c r="${ref}" s="${s}"><v>${c.v}</v></c>` : '';
      const t = String(c.v);
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t${/^\s|\s$/.test(t) ? ' xml:space="preserve"' : ''}>${xmlText(t)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  const pane = sh.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData>${sh.filter && width && rows.length ? `<autoFilter ref="A1:${colName(width - 1)}${rows.length}"/>` : ''}</worksheet>`;
}

// sheets: [{ name, widths?, rows, freeze?, filter? }] → .xlsx 바이트
export function buildXlsx(sheets) {
  const NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS}"><sheets>${sheets.map((s, i) => `<sheet name="${xmlText(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${NS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zipStore(files.map(([name, text]) => ({ name, data: enc.encode(text) })));
}

// ---------- 도메인 설정 → 통합 문서 ----------
// 적용 필터 조각: 기간 · 그룹 · 검색어 · 열 필터 · 덧붙임(예 탭 이름). 화면의 「적용 필터」 글자와 파일 이름이 같이 쓴다.
export function filterParts(ctx, state, extra = []) {
  const q = String(state.q || '').trim();
  return [periodLabel(state.period), groupName(ctx, state.group), ...(q ? [`검색 ${q}`] : []), ...activeFilters(state).map(([k, v]) => `${colLabel(ctx, k)} ${v}`), ...extra.filter(Boolean)];
}
// <도메인 제목>-<기준일>-<필터>.xlsx  (파일 이름에 못 쓰는 글자는 뺀다)
export function xlsxFileName(ctx, parts = []) {
  const clean = (s) => String(s ?? '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
  const filter = parts.map(clean).filter(Boolean).join('_').slice(0, 60);
  return `${[clean(ctx.d.app.title), ctx.today, filter].filter(Boolean).join('-')}.xlsx`;
}

const textWidth = (s) => [...String(s ?? '')].reduce((t, ch) => t + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0);

function dataSheet(ctx, rows, keys) {
  const ks = keys && keys.length ? keys : tableCols(ctx, 'shadcn').map((c) => c.key);
  const head = ks.map((k) => ({ v: colLabel(ctx, k), bold: true }));
  const widths = ks.map((k) => textWidth(colLabel(ctx, k)) + 4);
  const body = rows.map((r) => ks.map((k, i) => {
    const type = ctx.byKey[k]?.type;
    let cell;
    if (k === '_dday') cell = ddayText(ctx, r) || null;
    else if (type === 'number') cell = r[k] === '' || r[k] === undefined || r[k] === null || !Number.isFinite(Number(r[k])) ? null : { v: Number(r[k]), kind: 'num', dec: String(r[k]).includes('.') ? Math.min(3, String(r[k]).split('.')[1].length) : 0 };
    else if (type === 'date' && excelSerial(r[k]) !== null) cell = { v: excelSerial(r[k]), kind: String(r[k]).trim().length > 10 ? 'datetime' : 'date' };
    else cell = r[k] === undefined || r[k] === null || r[k] === '' ? null : String(r[k]);
    const w = cell && typeof cell === 'object' ? (cell.kind === 'datetime' ? 18 : cell.kind === 'date' ? 12 : String(cell.v).length + 2) : textWidth(cell) + 2;
    if (w > widths[i]) widths[i] = w;
    return cell;
  }));
  return { name: '데이터', widths: widths.map((w) => Math.min(40, Math.max(8, Math.ceil(w)))), rows: [head, ...body], freeze: true, filter: true };
}

// opts: { rows(내보낼 행), keys(내보낼 열, 없으면 표의 모든 열), cmp: [조건 A 지표, 조건 B 지표](있으면 요약 표가 A/B 비교), extra(적용 필터 덧붙임) }
export function buildReportWorkbook(ctx, state, { rows, keys, cmp, extra = [] }) {
  const d = ctx.d;
  const decCell = (v, dec) => (typeof v === 'number' && Number.isFinite(v) ? { v, kind: 'num', dec } : null);
  let table;
  if (cmp) {
    const ra = compareRows(ctx, cmp[0]), rb = compareRows(ctx, cmp[1]);
    table = [[{ v: '지표', bold: true }, { v: '조건 A', bold: true }, { v: '조건 B', bold: true }, { v: '차이', bold: true }],
      ...ra.map(([label, va, dec], k) => { const diff = compareDiff(va, rb[k][1]); return [label, decCell(va, dec), decCell(rb[k][1], dec), decCell(diff, dec)]; })];
  } else {
    const m = metricsFor(ctx, windowDates(ctx, state), state.group);
    table = [[{ v: '지표', bold: true }, { v: '값', bold: true }], ...compareRows(ctx, m).map(([label, v, dec]) => [label, decCell(v, dec)])];
  }
  const summary = {
    name: '요약',
    widths: [34, 22, 16, 16],
    rows: [
      [{ v: d.app.title, title: true }],
      ['데이터 기준', d.app.asOf],
      ['적용 필터', filterParts(ctx, state, extra).join(' · ')],
      [`내보낸 ${d.entity.plural}(${d.entity.unit})`, rows.length],
      ['요약', buildSummary(ctx, state)],
      [],
      ...table,
    ],
  };
  return [summary, dataSheet(ctx, rows, keys)];
}

// ---------- 브라우저 내려받기 (화면 코드에서만 부른다) ----------
export function downloadXlsx(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
