// import.mjs — CSV 올리기(#/import)의 공용 순수 함수 (DOM 없음, Node·브라우저 공용). 화면과 명령줄 변환기(csv-to-sample.mjs)가 같은 규칙을 쓴다.
// 흐름: decodeBytes(인코딩) → readTable(표) → autoMap(열 맞추기) → validateRows(검증·형 변환) → mergeRows(바꾸기/덧붙이기) → makeRecord(저장 꼴)
// 설정: domain.json 의 import = { maxKB(파일 크기 상한, 기본 500), required(필수 열 key 목록, 기본 = roles.id + roles.date) }. 키가 있을 때만 화면이 열린다.
// 저장: /api/import-<도메인> = { rows, meta } (비면 {}), 직전 한 벌은 /api/import-prev-<도메인>. 반영된 rows 가 샘플의 rows 를 대신한다(applyImported).
import { scanCsv } from './csv.mjs';

export const IMPORT_DEFAULT_KB = 500;
export const PREVIEW_ROWS = 20;
export const STORE_LIMIT = 1024 * 1024 - 4096; // 서버 본문 상한(1MB)에서 여유를 뺀 값

export const importOn = (d) => !!d.import;
export const maxBytes = (d) => (d.import?.maxKB ?? IMPORT_DEFAULT_KB) * 1024;
export const importCols = (d) => d.cols.filter((c) => !c.virtual);
export function requiredKeys(d) {
  const have = new Set(importCols(d).map((c) => c.key));
  const want = d.import?.required ?? [d.roles?.id, d.roles?.date];
  return want.filter((k, i) => k && have.has(k) && want.indexOf(k) === i);
}

// ---------- 1. 인코딩 ----------
export function decodeBytes(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(u.subarray(3)), encoding: 'UTF-8 (BOM)' };
  if (u[0] === 0xff && u[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(u.subarray(2)), encoding: 'UTF-16' };
  if (u[0] === 0xfe && u[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(u.subarray(2)), encoding: 'UTF-16' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u), encoding: 'UTF-8' }; } catch { /* UTF-8 이 아님 → 엑셀 한글 CSV 의 CP949 */ }
  return { text: new TextDecoder('euc-kr').decode(u), encoding: 'CP949' };
}

// ---------- 2. 표 ----------
export function sniffDelim(text) {
  const first = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  let best = ',', n = 0;
  for (const c of [',', '\t', ';']) { const k = first.split(c).length - 1; if (k > n) { best = c; n = k; } }
  return best;
}
// → { headers: string[], rows: { cells: string[], line: number }[], delim, headerLine }
export function readTable(text) {
  const delim = sniffDelim(text);
  const recs = scanCsv(text, delim);
  if (!recs.length) return { headers: [], rows: [], delim, headerLine: 1 };
  return { headers: recs[0].cells.map((h) => h.trim()), rows: recs.slice(1), delim, headerLine: recs[0].line };
}

// ---------- 3. 열 맞추기 ----------
const norm = (s) => String(s).replace(/[\s_\-]/g, '').toLowerCase();
// → { [열 key]: 머리글 번호 | -1 }  1단계 = key·label 이 글자 그대로 같음, 2단계 = 띄어쓰기·밑줄·대소문자를 무시하고 같음. 한 머리글은 한 열에만.
export function autoMap(d, headers) {
  const cols = importCols(d), map = {}, used = new Set();
  for (const c of cols) map[c.key] = -1;
  for (const same of [(h, c) => h === c.key || h === c.label, (h, c) => norm(h) === norm(c.key) || norm(h) === norm(c.label)]) {
    for (const c of cols) {
      if (map[c.key] >= 0) continue;
      const i = headers.findIndex((h, k) => !used.has(k) && h !== '' && same(h, c));
      if (i >= 0) { map[c.key] = i; used.add(i); }
    }
  }
  return map;
}

// ---------- 4. 검증·형 변환 ----------
const DATE_HINT = '날짜 형식이 아님 (예: 2026-10-28 또는 2026-10-28 09:00)';
const DATE_RE = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const p2 = (n) => String(n).padStart(2, '0');
function normDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) return { error: DATE_HINT };
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, da));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== da) return { error: '없는 날짜' };
  const day = `${m[1]}-${p2(mo)}-${p2(da)}`;
  if (m[4] === undefined) return { value: day };
  const [h, mi, se] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  if (h > 23 || mi > 59 || se > 59) return { error: '없는 시각' };
  return { value: `${day}T${p2(h)}:${p2(mi)}:${p2(se)}` };
}

// 한 칸 변환 → { value } 또는 { error }. 빈 칸은 필수면 오류, 아니면 값 없음({}).
export function convertCell(col, raw, required = false) {
  const s = String(raw ?? '').trim();
  if (s === '') return required ? { error: '필수 칸이 비어 있음' } : {};
  switch (col.type) {
    case 'number': {
      const n = Number(s.replace(/[,\s]/g, ''));
      return s.replace(/[,\s]/g, '') !== '' && Number.isFinite(n) ? { value: n } : { error: '숫자가 아님' };
    }
    case 'date': return normDate(s);
    case 'enum': {
      const vals = (col.values || []).map((x) => x.v);
      if (!vals.length || vals.includes(s)) return { value: s };
      const hit = vals.find((v) => v.toLowerCase() === s.toLowerCase());
      return hit ? { value: hit } : { error: `허용 값이 아님 (${vals.join(' · ')})` };
    }
    case 'tags': return { value: s.split(/\s*[;|,]\s*/).filter(Boolean) };
    default: return { value: s };
  }
}

// → { total, okCount, errorRowCount, errors:[{line,key,label,value,reason}], records:[{line,rec,errors}], okRows, missingRequired, blocked }
// opts.existingIds = 덧붙이기일 때 기존 데이터의 ID 집합(겹치면 오류)
export function validateRows(d, table, map, opts = {}) {
  const cols = importCols(d), req = requiredKeys(d), idKey = d.roles?.id;
  const idLabel = cols.find((c) => c.key === idKey)?.label ?? idKey;
  const out = { total: table.rows.length, okCount: 0, errorRowCount: 0, errors: [], records: [], okRows: [], missingRequired: req.filter((k) => !(map[k] >= 0)), blocked: false };
  if (out.missingRequired.length) { out.blocked = true; return out; }
  const seen = new Map(); // 정상 행의 ID → 줄 번호
  for (const r of table.rows) {
    const rec = {}, errs = [];
    for (const c of cols) {
      const i = map[c.key];
      if (!(i >= 0)) continue;
      const raw = (r.cells[i] ?? '').trim();
      const res = convertCell(c, raw, req.includes(c.key));
      if (res.error) errs.push({ line: r.line, key: c.key, label: c.label, value: raw, reason: res.error });
      else if (res.value !== undefined) rec[c.key] = res.value;
    }
    if (!errs.length && idKey && rec[idKey] !== undefined) {
      const id = String(rec[idKey]);
      if (seen.has(id)) errs.push({ line: r.line, key: idKey, label: idLabel, value: id, reason: `같은 ID 가 ${seen.get(id)}행에 이미 있음` });
      else if (opts.existingIds?.has(id)) errs.push({ line: r.line, key: idKey, label: idLabel, value: id, reason: '기존 데이터에 같은 ID 가 있음' });
      else seen.set(id, r.line);
    }
    out.records.push({ line: r.line, rec, errors: errs });
    if (errs.length) { out.errorRowCount++; out.errors.push(...errs); } else { out.okCount++; out.okRows.push(rec); }
  }
  return out;
}

// ---------- 5. 반영 ----------
export const mergeRows = (base, add, mode) => (mode === 'append' ? [...base, ...add] : [...add]);
export const makeRecord = ({ rows, source, encoding, mode, at, added, skipped }) => ({ rows, meta: { source, encoding, mode, at, added, skipped, total: rows.length } });
export const fitsStore = (rec) => new TextEncoder().encode(JSON.stringify(rec)).length <= STORE_LIMIT;
export const hasImported = (rec) => Array.isArray(rec?.rows);
// 되돌리기: 직전 한 벌(prev) — { original: true } = 반영 전엔 샘플이었음, { rows } = 이전 반영본, {} = 되돌릴 것 없음
export const canRevert = (prev) => !!(prev && (prev.original || Array.isArray(prev.rows)));
export const revertRecord = (prev) => (prev?.original ? {} : prev);
export const prevFor = (current) => (hasImported(current) ? current : { original: true });
// 반영된 rows 가 샘플의 rows 를 대신한다 — 나머지 샘플 칸(추세·배치 등)은 그대로
export const applyImported = (sample, rec) => (hasImported(rec) ? { ...sample, rows: rec.rows } : sample);
export const importApi = (name) => `import-${name}`;
export const importPrevApi = (name) => `import-prev-${name}`;
