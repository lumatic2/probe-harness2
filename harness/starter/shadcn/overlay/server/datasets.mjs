// datasets.mjs — 「준비된 데이터셋을 화면에서 선택·검증·적용」의 서버 쪽. 파일 업로드가 아니라 data/datasets/<이름>/ 폴더(CSV 묶음)를 고른다.
// GET  /api/datasets           → { current:{name,at}|null, items:[{name, files:[{file, rows, bytes}]}] }
// POST /api/datasets-validate  {name} → { ok, errors:[{file,line,column,value,reason}], summary:[{file,rows}] }
// POST /api/datasets-apply     {name} → 검증을 다시 돌려 통과하면 data/store/dataset-current.json 에 {name, at, files} 를 쓰고 200. 실패면 409 + errors (기존 적용은 그대로).
// 검증 규칙 = data/datasets/schema.json (없으면 「CSV 가 읽히고 머리글이 있다」만 본다):
//   { "files": { "employees.csv": { "required": ["emp_id","name"], "key": "emp_id", "types": {"lat":"number","date":"date"}, "refs": {"stop_id": "stops.csv:stop_id"} }, ... }, "optionalFiles": ["holidays.csv"] }
//   required = 필수 열 · key = 고유해야 하는 열 · types = number|date(YYYY-MM-DD)|time(HH:MM)|enum:a|b · refs = 다른 파일의 열에 있어야 하는 ID. schema.files 에 적힌 파일은 optionalFiles 가 아니면 모두 있어야 한다. 견본: data/datasets/schema.example.json.
// CSV 인코딩은 UTF-8(BOM 포함)·CP949 자동(엑셀 한글 CSV). 파일 하나 상한 MAX_FILE_BYTES(50MB) — 넘으면 오류 한 줄. schema.json 이 JSON 이 아니면 throw → /api 가 500 과 파일 이름을 돌려준다.
// 엔진은 currentDataset() 로 지금 적용된 폴더 경로를 받아 읽는다. 적용 뒤 재계산 전까지 run-result 는 이전 데이터셋 이름을 달고 있다 — 화면이 「재생성 필요」를 띄운다.
import fs from 'node:fs';
import path from 'node:path';

export const CURRENT_FILE = 'dataset-current.json';
export const MAX_ERRORS = 200;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

// CSV 바이트 → 글자: BOM 있으면 UTF-8, 아니면 UTF-8 로 엄격히 읽어 보고 실패하면 CP949(엑셀 한글 CSV). domains/import.mjs decodeBytes 와 같은 규칙(서버는 그 모듈 경로를 모르니 여기 둔다).
export function decodeCsv(buf) {
  const u = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) return new TextDecoder('utf-8').decode(u.subarray(3));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch { return new TextDecoder('euc-kr').decode(u); }
}
const NAME_RE = /^[A-Za-z0-9가-힣_-]{1,64}$/;

// 작은 CSV 파서 — 따옴표·줄바꿈 처리, BOM 제거. 셀은 전부 글자.
export function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((x) => x === '')) rows.pop();
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows };
}

const isNum = (v) => v.trim() !== '' && Number.isFinite(Number(v));
const isDate = (v) => /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(v.trim()) && !Number.isNaN(Date.parse(v.trim().replace(' ', 'T')));
const isTime = (v) => /^\d{1,2}:\d{2}$/.test(v.trim());

// 한 데이터셋 폴더를 schema 로 검증한다. 순수 함수 — files = { 'a.csv': 'csv text', ... }
export function validateFiles(files, schema) {
  const errors = []; const summary = [];
  const push = (e) => { if (errors.length < MAX_ERRORS) errors.push(e); };
  const tables = {};
  for (const [file, text] of Object.entries(files)) {
    const t = parseCsv(text);
    tables[file] = t;
    summary.push({ file, rows: t.rows.length });
    if (!t.headers.length || t.headers.every((h) => !h)) push({ file, line: 1, column: '', value: '', reason: '머리글이 없습니다' });
    t.rows.forEach((r, i) => { if (r.length !== t.headers.length) push({ file, line: i + 2, column: '', value: `${r.length}칸`, reason: `열 수가 머리글(${t.headers.length})과 다릅니다` }); });
  }
  const spec = schema?.files ?? {};
  const optional = new Set(schema?.optionalFiles ?? []);
  for (const [file, rule] of Object.entries(spec)) {
    const t = tables[file];
    if (!t) { if (!optional.has(file)) push({ file, line: 0, column: '', value: '', reason: '필수 파일이 없습니다' }); continue; }
    const col = (name) => t.headers.indexOf(name);
    for (const c of rule.required ?? []) if (col(c) < 0) push({ file, line: 1, column: c, value: '', reason: '필수 열이 없습니다' });
    if (rule.key && col(rule.key) >= 0) {
      const seen = new Map(); const k = col(rule.key);
      t.rows.forEach((r, i) => {
        const v = (r[k] ?? '').trim();
        if (!v) push({ file, line: i + 2, column: rule.key, value: '', reason: '키가 비어 있습니다' });
        else if (seen.has(v)) push({ file, line: i + 2, column: rule.key, value: v, reason: `중복 키 (처음 ${seen.get(v)}행)` });
        else seen.set(v, i + 2);
      });
    }
    for (const [c, type] of Object.entries(rule.types ?? {})) {
      const k = col(c); if (k < 0) continue;
      const enums = type.startsWith('enum:') ? new Set(type.slice(5).split('|')) : null;
      t.rows.forEach((r, i) => {
        const v = r[k] ?? '';
        if (v.trim() === '') return;
        const ok = enums ? enums.has(v.trim()) : type === 'number' ? isNum(v) : type === 'date' ? isDate(v) : type === 'time' ? isTime(v) : true;
        if (!ok) push({ file, line: i + 2, column: c, value: v, reason: enums ? `허용 값이 아닙니다 (${[...enums].join('/')})` : `${type === 'number' ? '숫자' : type === 'date' ? '날짜(YYYY-MM-DD)' : '시각(HH:MM)'} 형식이 아닙니다` });
      });
    }
    for (const [c, ref] of Object.entries(rule.refs ?? {})) {
      const k = col(c); if (k < 0) continue;
      const [rf, rc] = ref.split(':');
      const rt = tables[rf]; const rk = rt ? rt.headers.indexOf(rc) : -1;
      if (rk < 0) { push({ file, line: 1, column: c, value: ref, reason: '참조 대상 파일·열이 없습니다' }); continue; }
      const ids = new Set(rt.rows.map((r) => (r[rk] ?? '').trim()));
      t.rows.forEach((r, i) => { const v = (r[k] ?? '').trim(); if (v && !ids.has(v)) push({ file, line: i + 2, column: c, value: v, reason: `${rf} 에 없는 ${rc}` }); });
    }
  }
  return { ok: errors.length === 0, errors, summary };
}

export function createDatasets({ root, now = () => new Date() }) {
  const DIR = path.join(root, 'data', 'datasets');
  const STORE = path.join(root, 'data', 'store');
  const CUR = path.join(STORE, CURRENT_FILE);
  const schema = () => {
    const p = path.join(DIR, 'schema.json');
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { throw new Error(`data/datasets/schema.json 을 읽지 못했습니다: ${e.message}`); }
  };
  const readCsv = (p) => { const st = fs.statSync(p); if (st.size > MAX_FILE_BYTES) throw new Error(`${path.basename(p)} 이(가) ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 를 넘습니다.`); return decodeCsv(fs.readFileSync(p)); };
  const folder = (name) => (NAME_RE.test(name) ? path.join(DIR, name) : null);
  const readFiles = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((f) => /\.csv$/i.test(f)).sort().map((f) => [f, readCsv(path.join(dir, f))]));
  const current = () => (fs.existsSync(CUR) ? JSON.parse(fs.readFileSync(CUR, 'utf8')) : null);
  const stamp = () => { const d = now(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }; // run.mjs 와 같은 형식 — 실행 화면이 두 시각을 문자열로 비교한다(재생성 필요 판정)

  const list = () => {
    if (!fs.existsSync(DIR)) return { status: 200, json: { current: current(), items: [], hasSchema: false } };
    const items = fs.readdirSync(DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().map((name) => {
      const dir = path.join(DIR, name);
      const files = fs.readdirSync(dir).filter((f) => /\.csv$/i.test(f)).sort().map((f) => { const text = readCsv(path.join(dir, f)); return { file: f, rows: parseCsv(text).rows.length, bytes: fs.statSync(path.join(dir, f)).size }; });
      return { name, files };
    });
    return { status: 200, json: { current: current(), items, hasSchema: !!schema() } };
  };
  const validate = (body) => {
    const name = body && typeof body === 'object' ? String(body.name ?? '') : '';
    const dir = folder(name);
    if (!dir || !fs.existsSync(dir)) return { status: 404, json: { error: '그 이름의 데이터셋이 없습니다.' } };
    const files = readFiles(dir);
    if (!Object.keys(files).length) return { status: 400, json: { error: 'CSV 파일이 없는 폴더입니다.' } };
    return { status: 200, json: { name, ...validateFiles(files, schema()) } };
  };
  const apply = (body) => {
    const v = validate(body);
    if (v.status !== 200) return v;
    if (!v.json.ok) return { status: 409, json: { error: '검증에 실패해 적용하지 않았습니다. 기존 데이터를 유지합니다.', ...v.json } };
    const rec = { name: v.json.name, at: stamp(), files: v.json.summary };
    fs.mkdirSync(STORE, { recursive: true });
    const tmp = `${CUR}.tmp`; fs.writeFileSync(tmp, JSON.stringify(rec)); fs.renameSync(tmp, CUR);
    return { status: 200, json: { ok: true, current: rec } };
  };
  // 엔진이 부른다 — 지금 적용된 폴더 경로(없으면 null)
  const currentDir = () => { const c = current(); const d = c ? folder(c.name) : null; return d && fs.existsSync(d) ? d : null; };
  return { list, validate, apply, current, currentDir, readFiles };
}
