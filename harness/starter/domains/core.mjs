// core.mjs — 도메인 설정(domain.json)과 데이터(sample.json)를 읽어 화면이 쓰는 값을 만드는 순수 함수 모음 (DOM 없음, Node·브라우저 공용).
// shadcn 앱(starter/shadcn)이 쓰는 공통 계산. 화면 코드는 알람·교육·점검 같은 말을 모르고 여기서 나온 값만 그린다.
// 사용: const ctx = makeCtx(domain, sample);  buildInputs(ctx, state) → 위젯 입력 W1~W13
// 과제 데이터로 바꿀 때는 이 파일이 아니라 domains/<이름>/domain.json 만 고친다 (starter/DOMAIN.md).
import { binCounts, controlLimits, makeBins, percentile } from './stats.mjs';
export { niceTicks } from './stats.mjs';

// ---------- 기본 도구 ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n, d = 0) => (typeof n !== 'number' || !Number.isFinite(n) ? '–' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const sign = (n, d = 0) => (Number.isFinite(n) ? `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), d)}` : '–');

export const PERIODS = [
  { v: '3d', label: '최근 3일', n: 3 },
  { v: '7d', label: '최근 7일', n: 7 },
  { v: '14d', label: '최근 14일', n: 14 },
];
export const ALL = '전체';
export const DEFAULT_STATE = { period: '7d', group: ALL };
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
export const SLOTS = ['00–04', '04–08', '08–12', '12–16', '16–20', '20–24'];
export const DOMAIN_NAME_RE = /^[a-z0-9-]+$/;

export const addDays = (d, n) => new Date(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / 86400000);
export const weekdayIndex = (d) => (new Date(`${String(d).slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7; // 월=0
export const mmdd = (d) => String(d).slice(5, 10);
export const shortTs = (ts) => String(ts ?? '').replace('T', ' ').slice(5, 16);
export const periodLabel = (v) => (PERIODS.find((p) => p.v === v) || PERIODS[1]).label;

// ---------- 해시 라우팅: #/dashboard?period=7d&group=식각 · #/item/ALM-0001 · 목록 필터는 f_<열>=값 ----------
export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, qs = ''] = raw.split('?');
  const [page = 'dashboard', id] = pathPart.split('/');
  const state = { ...DEFAULT_STATE, page: page || 'dashboard' };
  if (id) state.id = decodeURIComponent(id);
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    state[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return state;
}
const OWN_KEYS = new Set(['page', 'id']);
export function buildHash(page, query = {}, id) {
  const qs = Object.entries(query)
    .filter(([k, v]) => !OWN_KEYS.has(k) && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `#/${page}${id ? '/' + encodeURIComponent(id) : ''}${qs ? '?' + qs : ''}`;
}
// 현재 기간·그룹 필터를 유지한 채 다른 페이지로 가는 링크
export function linkTo(page, state, extra = {}, id) {
  const q = { period: state.period, group: state.group, ...extra };
  if (q.group === ALL) delete q.group;
  if (q.period === DEFAULT_STATE.period) delete q.period;
  return buildHash(page, q, id);
}
export const activeFilters = (state) => Object.entries(state).filter(([k, v]) => k.startsWith('f_') && v !== '' && v !== undefined).map(([k, v]) => [k.slice(2), v]);

// ---------- 도메인 맥락 ----------
export function makeCtx(domain, sample, saved) {
  // 기준값: params 선언이 있으면 저장값(없으면 기본값)으로 "$param:키"·{param:키} 참조를 채운 설정을 쓴다. 원본(raw)은 whatIf 가 다시 채울 때 쓴다.
  const raw = domain;
  const settings = paramValues(domain, saved);
  if (paramDefs(domain).length) { const { params, ...rest } = domain; domain = { ...resolveParams(rest, settings), params }; }
  const byKey = {};
  for (const c of domain.cols) byKey[c.key] = c;
  const ctx = { d: domain, raw, settings, s: sample, rows: [], byKey, R: domain.roles || {}, today: domain.app.today };
  // virtual 열 = 다른 열 값에서 정해지는 열(예: 심각도별 목표 시간). 원 데이터 행에는 넣지 않는다.
  ctx.rows = (sample.rows || []).map((r) => {
    const o = { ...r };
    for (const c of domain.cols) if (c.virtual) o[c.key] = c.virtual.map[r[c.virtual.by]] ?? 0;
    return o;
  });
  // 판정(judge): 규칙으로 행마다 라벨을 정해 _judge 에 둔다. col 이 있고 기준값이 기본값에서 바뀌었으면 그 열(상태 열)도 새 판정으로 덮는다
  // (기본값이면 데이터의 원래 상태 열을 그대로 쓴다 — 기본 규칙은 그 열을 재현하도록 쓴다).
  const j = domain.judge;
  if (j) {
    const custom = diffParams(raw, paramValues(raw, {}), settings).length > 0;
    for (const o of ctx.rows) {
      const label = judgeLabel(ctx, o);
      if (label === null || label === undefined) continue;
      o._judge = label;
      if (j.col && custom) o[j.col] = label;
    }
  }
  return ctx;
}

const enumVals = (ctx, key) => (key && ctx.byKey[key]?.values) || [];
export const tone = (ctx, key, v) => enumVals(ctx, key).find((x) => x.v === v)?.tone || 'plain';
export const rankOf = (ctx, key, v) => { const i = enumVals(ctx, key).findIndex((x) => x.v === v); return i < 0 ? 99 : i; };
export const nameOf = (ctx, key, v) => ctx.byKey[key]?.names?.[v] ?? v;

// 셀에 보이는 글자
export function display(ctx, key, v) {
  if (v === undefined || v === null || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  const c = ctx.byKey[key];
  if (c?.names?.[v]) return `${v} ${c.names[v]}`;
  if (c?.type === 'date' && String(v).includes('T')) return shortTs(v);
  return String(v);
}

export const dateOf = (ctx, row) => String(row[ctx.R.date] ?? '').slice(0, 10);
export const idOf = (ctx, row) => row[ctx.R.id];

// 템플릿 {열} · {열:name}(이름표) · {열:short}(날짜 줄임) · {_id} {_title} {_date} {_dday} {_related} {_today} {_app}
export function tpl(ctx, str, row = {}, extra = {}) {
  return String(str ?? '').replace(/\{([A-Za-z0-9_]+)(?::(name|short))?\}/g, (m, k, mod) => {
    if (k in extra) return String(extra[k]);
    if (k === '_id') return String(idOf(ctx, row) ?? '');
    if (k === '_title') return titleOf(ctx, row);
    if (k === '_date') return shortTs(row[ctx.R.date]);
    if (k === '_dday') return ddayText(ctx, row);
    if (k === '_today') return ctx.today;
    if (k === '_app') return ctx.d.app.title;
    if (!(k in row)) return m;
    if (mod === 'name') return String(nameOf(ctx, k, row[k]) ?? '');
    if (mod === 'short') return display(ctx, k, row[k]);
    return Array.isArray(row[k]) ? row[k].join(', ') : String(row[k] ?? '');
  });
}
export const titleOf = (ctx, row) => tpl(ctx, ctx.R.title || `{${ctx.R.id}}`, row);

// ---------- 상태·기한 ----------
export function isDone(ctx, row) {
  const sk = ctx.R.status;
  return !!sk && !!enumVals(ctx, sk).find((x) => x.v === row[sk])?.done;
}
export function dday(ctx, row) {
  const k = ctx.R.deadline;
  if (!k || !row[k]) return null;
  return daysBetween(ctx.today, row[k]);
}
export const ddayLabel = (n) => (n === null || n === undefined ? '' : n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`);
export const isOverdue = (ctx, row) => { const n = dday(ctx, row); return n !== null && n < 0 && !isDone(ctx, row); };
// D-day 칸에 쓰는 글자: 끝난 건은 비우고, 기한이 지난 건은 「기한 초과 D+2」
export function ddayText(ctx, row) {
  const n = dday(ctx, row);
  if (n === null || isDone(ctx, row)) return '';
  return n < 0 ? `기한 초과 ${ddayLabel(n)}` : ddayLabel(n);
}
export function isUrgent(ctx, row) {
  return tone(ctx, ctx.R.priority, row[ctx.R.priority]) === 'urgent' || tone(ctx, ctx.R.status, row[ctx.R.status]) === 'urgent' || isOverdue(ctx, row);
}

// where: {열: [값…], "!열": [제외할 값…], "$overdue": true, "<열": 숫자, ">열": 숫자}
export function matchWhere(ctx, row, where) {
  if (!where) return true;
  for (const [k, val] of Object.entries(where)) {
    if (k === '$overdue') { if (isOverdue(ctx, row) !== !!val) return false; continue; }
    if (k[0] === '<' || k[0] === '>') { // "<열": 숫자 — 그 값보다 작은 건 · ">=열"·"<=열" 은 같은 값 포함
      const eq = k[1] === '=', n = Number(row[k.slice(eq ? 2 : 1)]);
      if (!Number.isFinite(n) || (k[0] === '<' ? !(eq ? n <= val : n < val) : !(eq ? n >= val : n > val))) return false;
      continue;
    }
    const neg = k.startsWith('!');
    const hit = val.map(String).includes(String(row[neg ? k.slice(1) : k]));
    if (neg ? hit : !hit) return false;
  }
  return true;
}
// where 의 양(+) 조건만 목록 링크의 f_ 필터로 바꾼다 (「긴급 미조치 건 보기」 같은 바로가기용)
export const whereToFilters = (where) => Object.fromEntries(Object.entries(where || {}).filter(([k, v]) => !'!$<>'.includes(k[0]) && v.length === 1).map(([k, v]) => [`f_${k}`, v[0]]));

// ---------- 표 열 ----------
// 화면에 나오는 열: 데이터 열(+ 기한 열 뒤에 D-day 열). only 가 있으면 그 화면에서만.
export function tableCols(ctx, app = 'shadcn') {
  const out = [];
  for (const c of ctx.d.cols) {
    if ((c.only && c.only !== app) || c.hide) continue; // hide = 본문이 긴 열처럼 표·CSV 에 안 싣는 열
    out.push(c);
    if (c.key === ctx.R.deadline) out.push({ key: '_dday', label: 'D-day', type: 'dday', badge: true, sort: true, width: 120 });
  }
  return out;
}
export const colLabel = (ctx, key) => (key === '_dday' ? 'D-day' : ctx.byKey[key]?.label ?? key);
// 셀 값 → {text, tone}
export function cell(ctx, row, key) {
  if (key === '_dday') { const t = ddayText(ctx, row); return { text: t, tone: isOverdue(ctx, row) ? 'urgent' : 'plain' }; }
  const v = row[key];
  return { text: display(ctx, key, v), tone: ctx.byKey[key]?.type === 'enum' ? tone(ctx, key, v) : 'plain' };
}
// 정렬·필터에 쓰는 값 목록(드롭다운)
export function distinct(ctx, key) {
  const c = ctx.byKey[key];
  if (c?.values) return c.values.map((x) => x.v);
  if (ctx.R.group === key && ctx.d.group?.values) return ctx.d.group.values;
  const seen = new Set(ctx.rows.map((r) => r[key]).filter((v) => v !== undefined && v !== null && v !== ''));
  return [...seen].map(String).sort();
}

// ---------- 기간·그룹 ----------
export function windowDates(ctx, state, back = 0) {
  const n = (PERIODS.find((p) => p.v === state.period) || PERIODS[1]).n;
  const end = addDays(ctx.today, -n * back);
  return Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i)));
}
const allGroup = (g) => !g || g === ALL;
export function rowsIn(ctx, dates, group) {
  const set = new Set(dates);
  const gk = ctx.R.group;
  return ctx.rows.filter((r) => set.has(dateOf(ctx, r)) && (allGroup(group) || !gk || r[gk] === group));
}
export function seriesIn(ctx, dates, group) {
  const set = new Set(dates);
  return (ctx.s.series || []).filter((r) => set.has(r.date) && (allGroup(group) || r.group === group));
}
export function firstDate(ctx) {
  let m = '9999-99-99';
  for (const r of ctx.rows) { const d = dateOf(ctx, r); if (d && d < m) m = d; }
  for (const r of ctx.s.series || []) if (r.date < m) m = r.date;
  return m;
}
export const hasPrev = (ctx, state) => windowDates(ctx, state, 1)[0] >= firstDate(ctx);
export const groupLabel = (ctx) => ctx.d.group?.label || '';
export const groupAll = (ctx) => `전체 ${groupLabel(ctx)}`;
export const groupName = (ctx, g) => (allGroup(g) ? groupAll(ctx) : `${g}${ctx.d.group?.suffix ? ' ' + ctx.d.group.suffix : ''}`);

// ---------- 집계 ----------
const avg = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);
export const metricDef = (ctx, key) => ctx.d.metrics.find((m) => m.key === key);
export function metricValue(ctx, m, rows, dates, group) {
  switch (m.agg) {
    case 'count': return rows.filter((r) => matchWhere(ctx, r, m.where)).length;
    case 'rate': return rows.length ? (rows.filter((r) => matchWhere(ctx, r, m.where)).length / rows.length) * 100 : null;
    case 'perDay': return rows.length ? rows.length / dates.length : null;
    case 'avg': return avg(rows.map((r) => Number(r[m.col])).filter(Number.isFinite));
    case 'sum': return rows.reduce((t, r) => t + (Number(r[m.col]) || 0), 0);
    case 'series': return avg(seriesIn(ctx, dates, group).map((r) => r.value));
    default: return null;
  }
}
export function metricsFor(ctx, dates, group) {
  const rows = rowsIn(ctx, dates, group);
  const out = { _n: rows.length };
  for (const m of ctx.d.metrics) out[m.key] = metricValue(ctx, m, rows, dates, group);
  return out;
}

// ---------- 정렬·필터 ----------
export function sortRows(ctx, rows, key = 'queue', dir = 'asc') {
  const sg = dir === 'desc' ? -1 : 1;
  const dk = ctx.R.date, pk = ctx.R.priority;
  const byDate = (a, b) => (a[dk] < b[dk] ? 1 : a[dk] > b[dk] ? -1 : 0); // 최근 먼저
  const ddNum = (r) => { const n = dday(ctx, r); return n === null || isDone(ctx, r) ? 1e9 : n; };
  const str = (a, b) => (String(a ?? '') < String(b ?? '') ? -1 : String(a ?? '') > String(b ?? '') ? 1 : 0);
  const c = ctx.byKey[key];
  let cmp;
  if (key === 'queue') {
    cmp = (a, b) => (isDone(ctx, a) ? 1 : 0) - (isDone(ctx, b) ? 1 : 0) || (isUrgent(ctx, b) ? 1 : 0) - (isUrgent(ctx, a) ? 1 : 0) || (pk ? rankOf(ctx, pk, a[pk]) - rankOf(ctx, pk, b[pk]) : 0) || ddNum(a) - ddNum(b) || byDate(a, b);
  } else if (key === '_dday') cmp = (a, b) => ddNum(a) - ddNum(b);
  else if (c?.type === 'enum') cmp = (a, b) => rankOf(ctx, key, a[key]) - rankOf(ctx, key, b[key]) || byDate(a, b);
  else if (c?.type === 'number') cmp = (a, b) => (Number(a[key]) || 0) - (Number(b[key]) || 0);
  else cmp = (a, b) => str(a[key], b[key]);
  return [...rows].sort((a, b) => sg * cmp(a, b));
}
function searchText(ctx, row) {
  return ctx.d.cols.filter((c) => !c.virtual && ['text', 'enum', 'person'].includes(c.type)).map((c) => `${row[c.key] ?? ''} ${c.names?.[row[c.key]] ?? ''}`).join(' ').toLowerCase();
}
// 목록 필터: 기간·그룹 + 검색어 q + f_<열>=값 + day=YYYY-MM-DD(관리도 한계 밖 점에서 온 하루)
export function filterRows(ctx, state) {
  const q = (state.q || '').trim().toLowerCase();
  const fs = activeFilters(state);
  const rows = rowsIn(ctx, windowDates(ctx, state), state.group).filter((r) => fs.every(([k, v]) => String(r[k]) === v) && (!state.day || dateOf(ctx, r) === state.day) && (!q || searchText(ctx, r).includes(q)));
  return sortRows(ctx, rows, state.sort || 'queue', state.dir === 'desc' ? 'desc' : 'asc');
}

// ---------- 상세·근거 ----------
export const findRow = (ctx, id) => ctx.rows.find((r) => String(idOf(ctx, r)) === String(id));
export function relatedRows(ctx, row) {
  const rel = ctx.d.related;
  if (!rel) return [];
  const since = addDays(ctx.today, -((rel.days ?? 7) - 1));
  return ctx.rows.filter((x) => x[rel.col] === row[rel.col] && idOf(ctx, x) !== idOf(ctx, row) && dateOf(ctx, x) >= since).sort((a, b) => (a[ctx.R.date] < b[ctx.R.date] ? 1 : -1));
}
export function evidenceLines(ctx, row) {
  const rel = ctx.d.related;
  const since = rel ? addDays(ctx.today, -((rel.days ?? 7) - 1)) : '';
  const n = rel ? ctx.rows.filter((x) => x[rel.col] === row[rel.col] && dateOf(ctx, x) >= since).length : 0; // 이 건 자신을 포함한 같은 대상 건수
  return (ctx.d.evidence || []).map((t) => tpl(ctx, t, row, { _related: n }));
}
// 규칙 문구: 이 건에 해당하는 것(applied)과 나머지(others)
export function rulesFor(ctx, row) {
  const rules = ctx.d.rules || [];
  const hit = (r) => r.col && (Array.isArray(r.value) ? r.value : [r.value]).includes(row[r.col]);
  return { applied: rules.filter(hit), others: rules.filter((r) => !hit(r)) };
}
export const rawLines = (ctx, row) => ctx.d.cols.filter((c) => !c.virtual).map((c) => [c.key, row[c.key] === undefined ? '' : String(row[c.key])]);

// ---------- 표 공통 기능: CSV 내보내기 · 안내문 일괄 생성 ----------
const csvCell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
// keys 순서대로 표시 글자가 아니라 원래 값으로 쓴다(D-day 열만 글자). UTF-8 BOM 으로 시작해 엑셀에서 한글이 깨지지 않는다.
export function toCsv(ctx, rows, keys) {
  const ks = keys && keys.length ? keys : tableCols(ctx, 'shadcn').map((c) => c.key);
  const head = ks.map((k) => csvCell(colLabel(ctx, k))).join(',');
  const body = rows.map((r) => ks.map((k) => csvCell(k === '_dday' ? ddayText(ctx, r) : r[k])).join(','));
  return `﻿${[head, ...body].join('\r\n')}\r\n`;
}
export const csvFileName = (ctx) => `${ctx.d.name}-${ctx.today}.csv`;
export const NOTICE_SEPARATOR = '\n\n----------------------------------------\n\n';
export function makeNotices(ctx, rows) {
  const t = ctx.d.notice?.template || '';
  return rows.map((r) => tpl(ctx, t, r)).join(NOTICE_SEPARATOR);
}
export const noticeFileName = (ctx) => `${ctx.d.notice?.file || 'notice'}-${ctx.today}.txt`;

// ---------- 수치 값 뽑기 (분포 W15 용) ----------
const toMs = (v) => Date.parse(String(v).length === 10 ? `${v}T00:00:00Z` : `${String(v).slice(0, 19)}Z`);
const PER = { m: 60000, h: 3600000, d: 86400000 };
// spec: {col} 숫자 열 · {diff:[시작열,끝열], per:'h'|'d'|'m'} 두 시각의 차 · {hour:열} 시각의 시(0~23) · {age:열, per} 기준 시각(app.asOf)부터 지난 시간
export function valueOf(ctx, row, spec) {
  if (!spec) return NaN;
  if (spec.col) { const v = row[spec.col]; return v === '' || v === null || v === undefined ? NaN : Number(v); }
  if (spec.diff) {
    const [a, b] = spec.diff;
    if (!row[a] || !row[b]) return NaN;
    return (toMs(row[b]) - toMs(row[a])) / PER[spec.per || 'h'];
  }
  if (spec.hour) return row[spec.hour] ? Number(String(row[spec.hour]).slice(11, 13)) : NaN;
  if (spec.age) return row[spec.age] ? (toMs(String(ctx.d.app.asOf).replace(' ', 'T') + ':00') - toMs(row[spec.age])) / PER[spec.per || 'h'] : NaN; // 데이터 기준 시각(app.asOf)부터 그 열 시각까지 지난 시간
  return NaN;
}
const labelsOf = (ctx, key) => (key === ctx.d.group?.col && ctx.d.group.values ? ctx.d.group.values : distinct(ctx, key));

// ---------- 위젯 입력 만들기 ----------
export function buildInputs(ctx, state) {
  const d = ctx.d, R = ctx.R;
  const group = state.group || ALL;
  const dates = windowDates(ctx, state);
  const prevOk = hasPrev(ctx, state);
  const al = rowsIn(ctx, dates, group);
  const cur = metricsFor(ctx, dates, group);
  const prev = prevOk ? metricsFor(ctx, windowDates(ctx, state, 1), group) : null;
  const unitName = d.entity.unit;
  const href = (page, extra) => linkTo(page, state, extra);
  const itemHref = (row) => `#/item/${encodeURIComponent(idOf(ctx, row))}`;
  const badgeOf = (key, row) => ({ text: row[key], tone: tone(ctx, key, row[key]) });

  // W1 지표 카드
  const du = (u) => (u === '%' ? '%p' : u);
  const w1items = (d.cards || []).map((key) => {
    const m = metricDef(ctx, key);
    const v = cur[key];
    const delta = prev && v !== null && prev[key] !== null ? v - prev[key] : null;
    const dec = m.decimals ?? 0;
    let read;
    if (m.agg === 'count' && v === 0) read = `${m.label} 없음`;
    else if (m.target != null && v !== null) {
      const ok = m.better === 'down' ? v <= m.target : v >= m.target;
      read = ok ? `목표 ${m.target}${m.unit} ${m.better === 'down' ? '이하 유지' : '이상 달성'}` : `목표 ${m.target}${m.unit} ${m.better === 'down' ? '초과' : '아래'}`;
    } else if (delta === null) read = '비교할 이전 기간 없음';
    else if (Math.abs(delta) < 1e-9) read = '직전 기간과 같음';
    else read = delta > 0 ? '직전 기간보다 늘어남' : '직전 기간보다 줄어듦';
    let sub = '';
    if (m.target != null && v !== null) {
      const gap = Math.abs(v - m.target);
      sub = m.better === 'down' ? (v <= m.target ? `목표보다 낮음 ${fmt(gap, 1)}${du(m.unit)}` : `목표보다 높음 ${fmt(gap, 1)}${du(m.unit)}`) : (v >= m.target ? `목표보다 높음 ${fmt(gap, 1)}${du(m.unit)}` : `목표까지 부족 ${fmt(gap, 1)}${du(m.unit)}`);
    } else if (m.agg === 'count' && m.where && cur._n) sub = `전체 ${d.entity.plural}의 ${fmt((v / cur._n) * 100, 1)}%`;
    else if (m.agg === 'count' && cur._n) sub = `하루 평균 ${fmt(cur._n / dates.length, 1)}${unitName}`;
    const spark = dates.map((dt) => { const r1 = rowsIn(ctx, [dt], group); return metricValue(ctx, m, r1, [dt], group); });
    return { label: m.label, value: v, unit: m.unit, decimals: m.decimals, delta, better: m.better, read, sub, spark };
  });
  const w1 = { title: '핵심 지표', items: w1items, prevLabel: prevOk ? '직전 같은 길이 기간 대비' : '비교할 이전 기간 데이터 없음' };

  // W2 추세
  const tr = d.trend;
  const tm = metricDef(ctx, tr.metric);
  const series = dates.map((dt) => ({ x: mmdd(dt), date: dt, y: metricValue(ctx, tm, rowsIn(ctx, [dt], group), [dt], group) }));
  const anomalies = [];
  if (tm.target != null && tr.anomaly != null) {
    series.forEach((p, i) => {
      const bad = p.y !== null && (tm.better === 'down' ? p.y > tm.target + tr.anomaly : p.y < tm.target - tr.anomaly);
      if (!bad) return;
      const last = anomalies[anomalies.length - 1];
      if (last && last.to === i - 1) last.to = i; else anomalies.push({ from: i, to: i, label: '이상 구간' });
    });
  }
  const trName = allGroup(group) ? tr.allName || tm.label : group;
  const points = series.map((p) => ({ x: p.x, y: p.y === null ? null : Math.round(p.y * 10) / 10 }));
  const w2 = { title: tr.title || `${tm.label} 추세`, unit: tm.unit, name: trName, points, series: [{ name: trName, points }], target: tm.target != null ? { value: tm.target, label: `목표 ${tm.target}${tm.unit}` } : null, anomalies, area: true };

  // W3 범주 막대
  const rk = d.rank;
  const rkRows = al.filter((r) => matchWhere(ctx, r, rk.where));
  const cnt = {};
  for (const r of rkRows) cnt[r[rk.col]] = (cnt[r[rk.col]] || 0) + 1;
  const w3 = { title: rk.title, unit: unitName, topN: rk.topN ?? 5, rows: Object.entries(cnt).map(([v, n]) => ({ code: v, label: display(ctx, rk.col, v), value: n, href: href('list', { [`f_${rk.col}`]: v }) })) };

  // W4 100% 누적 막대
  const st = d.stack;
  const stackKeys = st.by === d.group?.col ? (allGroup(group) ? d.group.values || distinct(ctx, st.by) : [group]) : distinct(ctx, st.by);
  const partNames = enumVals(ctx, st.parts).map((x) => x.v);
  const w4 = {
    title: st.title, unit: unitName, names: partNames, highlight: enumVals(ctx, st.parts).find((x) => x.tone === 'urgent')?.v,
    rows: stackKeys.map((k) => { const x = al.filter((r) => r[st.by] === k); return { label: k, parts: partNames.map((p) => ({ name: p, value: x.filter((r) => r[st.parts] === p).length })) }; }),
  };

  // W5 히트맵 (행 = 요일, 열 = 시간대 또는 열 값)
  const hm = d.heat;
  let colLabels = SLOTS;
  if (hm.cols !== 'slot') colLabels = (hm.cols === d.group?.col && d.group.values ? d.group.values : distinct(ctx, hm.cols)).slice(0, 8);
  const heat = WEEKDAYS.map(() => colLabels.map(() => 0));
  for (const r of al.filter((x) => matchWhere(ctx, x, hm.where))) {
    const wd = weekdayIndex(dateOf(ctx, r));
    const j = hm.cols === 'slot' ? Math.floor(Number(String(r[R.date]).slice(11, 13)) / 4) : colLabels.indexOf(r[hm.cols]);
    if (j >= 0 && heat[wd]) heat[wd][j]++;
  }
  const w5 = { title: hm.title, unit: unitName, rowLabels: WEEKDAYS, colLabels, values: heat };

  // W6 목표 대비 진척
  const w6 = {
    title: '목표 대비 진척', due: d.due ? `기한 ${mmdd(d.due)}` : '',
    rows: (d.progress || []).map((key) => { const m = metricDef(ctx, key); return { label: m.label, value: cur[key], target: m.target, unit: m.unit, decimals: m.decimals, lowerIsBetter: m.better === 'down' }; }),
  };

  // W7 퍼널
  const fn = d.funnel;
  const w7 = { title: fn.title, unit: unitName, steps: fn.steps.map((s) => ({ label: s.label, value: al.filter((r) => matchWhere(ctx, r, s.where)).length })) };

  // W8 순위·판단 큐
  const qc = d.queue;
  const queue = sortRows(ctx, al.filter((r) => matchWhere(ctx, r, qc.where)), 'queue');
  const qcols = qc.columns.map((k, i) => ({ key: k, label: colLabel(ctx, k), badge: ctx.byKey[k]?.badge || k === '_dday', primary: i === 0 }));
  const w8 = {
    title: qc.title, id: 'queue', topN: qc.topN ?? 5, sortKey: 'queue', sortDir: 'asc', columns: qcols,
    rows: queue.slice(0, qc.limit ?? 15).map((r) => {
      const o = { id: idOf(ctx, r), href: itemHref(r), evidence: evidenceLines(ctx, r), raw: r, tones: {} };
      for (const k of qc.columns) { const c = cell(ctx, r, k); o[k] = c.text; o.tones[k] = c.tone; }
      return o;
    }),
  };

  // W9 이상치·알림
  const ac = d.alerts;
  const w9 = {
    title: ac.title,
    items: sortRows(ctx, al.filter((r) => matchWhere(ctx, r, ac.where)), 'queue').slice(0, ac.limit ?? 5).map((r) => {
      const b = badgeOf(ac.badge, r);
      return { badge: b.text, tone: b.tone, title: titleOf(ctx, r), ts: shortTs(r[R.date]), href: itemHref(r), note: tpl(ctx, ac.note || '{' + R.status + '}', r) };
    }),
  };

  // W10 상태 보드
  const bd = d.board;
  const w10 = {
    title: bd.title, shownMax: 6,
    columns: enumVals(ctx, R.status).map((s) => {
      const x = sortRows(ctx, al.filter((r) => r[R.status] === s.v), 'queue');
      return { name: s.v, total: x.length, items: x.slice(0, 6).map((r) => ({ id: idOf(ctx, r), title: titleOf(ctx, r), meta: tpl(ctx, bd.meta, r), href: itemHref(r) })) };
    }),
  };

  // W11 일정 타임라인 (sample.schedule 이 있으면 그것, 없으면 행의 시작·종료 열)
  const tl = d.timeline;
  let tItems = [];
  if (ctx.s.schedule) tItems = ctx.s.schedule.map((x) => ({ label: x.label, start: x.start, end: x.end, owner: x.owner }));
  else if (tl) {
    tItems = ctx.rows.filter((r) => matchWhere(ctx, r, tl.where) && r[tl.start] && r[tl.end]).map((r) => ({ label: tpl(ctx, tl.label, r), start: String(r[tl.start]).slice(0, 10), end: String(r[tl.end]).slice(0, 10), owner: tl.owner ? r[tl.owner] : '' }));
    tItems = tItems.filter((x) => x.end >= addDays(ctx.today, -2) && x.start <= addDays(ctx.today, 11)).sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 12);
  }
  const w11 = { title: tl?.title || '일정', days: Array.from({ length: 14 }, (_, i) => addDays(ctx.today, -2 + i)), today: ctx.today, items: tItems };

  // W12 최근 활동
  const act = d.activity;
  let actItems;
  if (ctx.s.activity) actItems = ctx.s.activity.slice(0, 8).map((a) => ({ ts: shortTs(a.ts), who: a.who, what: a.what, href: a.href }));
  else {
    const recent = [...ctx.rows].filter((r) => matchWhere(ctx, r, act.where)).sort((a, b) => (a[R.date] < b[R.date] ? 1 : -1)).slice(0, 8);
    actItems = recent.map((r) => ({ ts: shortTs(r[R.date]), who: act.who ? r[act.who] : '', what: tpl(ctx, act.what, r), href: itemHref(r) }));
  }
  const w12 = { title: act.title, items: actItems };

  // W13 배치도 (sample.units 가 있으면 그것, 없으면 열 값으로 격자를 만든다)
  const lo = d.layout;
  const perUnit = {};
  for (const r of al) if (matchWhere(ctx, r, lo.countWhere)) perUnit[r[lo.unitCol]] = (perUnit[r[lo.unitCol]] || 0) + 1;
  let units = ctx.s.units;
  if (!units) {
    const seen = new Map();
    for (const r of ctx.rows) if (!seen.has(r[lo.unitCol])) seen.set(r[lo.unitCol], r[R.group]);
    const ids = [...seen.keys()].sort();
    units = ids.map((id, i) => ({ id, group: seen.get(id), row: Math.floor(i / (lo.cols || 6)) + 1, col: (i % (lo.cols || 6)) + 1 }));
  }
  const w13 = {
    title: lo.title, cols: lo.cols || 6, states: lo.states,
    cells: units.map((u) => {
      const n = perUnit[u.id] || 0;
      const state13 = u.state || (n >= (lo.badAt ?? 3) ? lo.states[2] : n >= 1 ? lo.states[1] : lo.states[0]);
      return { id: u.id, label: u.id, row: u.row, col: u.col, state: state13, group: u.group, note: `${u.group && u.group !== u.id ? u.group + ' · ' : ''}${lo.countLabel} ${n}${unitName}`, dim: !allGroup(group) && u.group !== group, href: href('list', { [`f_${lo.unitCol}`]: u.id }) };
    }),
  };

  // W14 관리도 — 하루(또는 bucket:"hour" 면 한 시간) 단위 점 + 기준선 + 상·하한 띠. 한계 밖 점은 out=true 이고 href 는 그날 목록
  const ct = d.control;
  let w14 = null;
  if (ct) {
    const cm = metricDef(ctx, ct.metric);
    const nDays = ct.days ?? 14;
    const endDay = addDays(ctx.today, ct.endOffset ?? 0);
    const days = Array.from({ length: nDays }, (_, i) => addDays(endDay, -(nDays - 1 - i)));
    // bucket: day(기본) | hour — hour 는 날짜×시(0~23) 칸마다 한 점. 시각은 날짜 열의 11~13 번째 글자
    const hourly = ct.bucket === 'hour';
    const cells = hourly ? days.flatMap((dt) => Array.from({ length: 24 }, (_, h) => ({ dt, h }))) : days.map((dt) => ({ dt, h: null }));
    const dayRows = new Map(days.map((dt) => [dt, rowsIn(ctx, [dt], group)]));
    const ys = cells.map(({ dt, h }) => {
      let rs = dayRows.get(dt);
      if (hourly) { rs = rs.filter((r) => Number(String(r[R.date]).slice(11, 13)) === h); if (!rs.length) return null; }
      const y = metricValue(ctx, cm, rs, [dt], group);
      return y === null ? null : Math.round(y * 10) / 10;
    });
    const lim = controlLimits(ys, ct.k ?? 2, ct.fixed, ['count', 'sum', 'perDay', 'rate'].includes(cm.agg));
    const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
    const pts = cells.map(({ dt, h }, i) => {
      const y = ys[i];
      const out = y !== null && lim.ucl !== null && (y > lim.ucl || y < lim.lcl);
      return { date: dt, x: hourly ? `${mmdd(dt)} ${String(h).padStart(2, '0')}시` : mmdd(dt), y, out, side: out ? (y > lim.ucl ? 'high' : 'low') : '', href: out ? linkTo('list', state, { day: dt, period: '14d', ...whereToFilters(cm.where) }) : undefined };
    });
    w14 = { title: ct.title || `${cm.label} 관리도`, unit: cm.unit, name: cm.label, points: pts, center: r1(lim.center), ucl: r1(lim.ucl), lcl: r1(lim.lcl), k: ct.k ?? 2, mode: lim.mode, outCount: pts.filter((p) => p.out).length,
      basis: lim.mode === 'fixed' ? '고정 기준값' : `${mmdd(days[0])}~${mmdd(days[days.length - 1])} 평균 ± ${ct.k ?? 2}σ` };
  }

  // W15 분포 — 수치 열 히스토그램 + 중앙값·p90, groupBy 가 있으면 그룹별로 같은 구간에 나눠 비교
  const ds = d.dist;
  let w15 = null;
  if (ds) {
    const items = al.filter((r) => matchWhere(ctx, r, ds.where)).map((r) => ({ v: valueOf(ctx, r, ds.value), g: ds.groupBy ? r[ds.groupBy] : null })).filter((x) => Number.isFinite(x.v));
    const all = items.map((x) => x.v);
    const bins = makeBins(all, ds.bins);
    const dec = bins.step >= 1 ? 0 : bins.step >= 0.1 ? 1 : 2;
    const groups = ds.groupBy ? labelsOf(ctx, ds.groupBy).map((g) => {
      const v = items.filter((x) => x.g === g).map((x) => x.v);
      return { name: g, n: v.length, counts: bins.edges.length ? binCounts(v, bins.edges) : [], median: percentile(v, 0.5) };
    }) : [];
    w15 = { title: ds.title, unit: ds.unit || '', label: ds.label || '값', n: all.length, edges: bins.edges, counts: bins.counts, decimals: dec, median: percentile(all, 0.5), p90: percentile(all, 0.9), groups, groupLabel: ds.groupBy ? colLabel(ctx, ds.groupBy) : '', countUnit: unitName };
  }

  // W16 행렬 히트맵 — 두 범주 열 × 집계(count·avg·sum). 칸을 누르면 그 두 값으로 거른 목록
  const mx = d.matrix;
  let w16 = null;
  if (mx) {
    const rl = labelsOf(ctx, mx.rows).slice(0, mx.maxRows ?? 12), cl = labelsOf(ctx, mx.cols).slice(0, mx.maxCols ?? 8);
    const base = al.filter((r) => matchWhere(ctx, r, mx.where));
    const agg = mx.agg || 'count';
    const values = rl.map((rv) => cl.map((cv) => {
      const xs = base.filter((r) => r[mx.rows] === rv && r[mx.cols] === cv);
      if (agg === 'count') return xs.length;
      const nums = xs.map((r) => Number(r[mx.col])).filter(Number.isFinite);
      if (!nums.length) return null;
      const sum = nums.reduce((t, x) => t + x, 0);
      return agg === 'sum' ? sum : sum / nums.length;
    }));
    w16 = { title: mx.title, unit: agg === 'count' ? unitName : mx.unit || '', decimals: mx.decimals ?? 0, rowLabels: rl, colLabels: cl, values, rowName: colLabel(ctx, mx.rows), colName: colLabel(ctx, mx.cols),
      hrefs: rl.map((rv) => cl.map((cv) => href('list', { [`f_${mx.rows}`]: rv, [`f_${mx.cols}`]: cv }))) };
  }

  return { w1, w2, w3, w4, w5, w6, w7, w8, w9, w10, w11, w12, w13, w14, w15, w16 };
}

// ---------- 리포트 요약·메모 ----------
export function buildSummary(ctx, state) {
  const d = ctx.d;
  const dates = windowDates(ctx, state);
  const m = metricsFor(ctx, dates, state.group);
  const prev = hasPrev(ctx, state) ? metricsFor(ctx, windowDates(ctx, state, 1), state.group) : null;
  const dN = prev ? `(직전 기간 대비 ${sign(m._n - prev._n)}${d.entity.unit})` : '(비교할 이전 기간 데이터 없음)';
  const parts = (d.summary || []).map((key) => {
    const mm_ = metricDef(ctx, key);
    return `${mm_.label} ${fmt(m[key], mm_.decimals ?? 0)}${mm_.unit}`;
  });
  const goals = (d.summaryTargets || []).map((key) => {
    const mm_ = metricDef(ctx, key);
    const v = m[key];
    return `${mm_.label} ${fmt(v, mm_.decimals ?? 0)}${mm_.unit}, 목표 ${mm_.target}${mm_.unit} 대비 ${sign(v === null ? NaN : v - mm_.target, 1)}${du2(mm_.unit)}.`;
  });
  return `${periodLabel(state.period)} ${groupName(ctx, state.group)} 기준 ${d.entity.plural} 건수는 ${fmt(m._n)}${d.entity.unit}${dN}이고, ${parts.join(' · ')}입니다. ${goals.join(' ')}`.trim();
}
const du2 = (u) => (u === '%' ? '%p' : u);
export function memoLine(ctx, row) {
  const R = ctx.R;
  const bits = [R.priority && row[R.priority], R.status && row[R.status], R.owner && row[R.owner], ddayText(ctx, row)].filter(Boolean);
  return `- ${idOf(ctx, row)} ${titleOf(ctx, row)} (${bits.join(', ')})`;
}
export function buildMemo(ctx, state) {
  const d = ctx.d;
  const al = rowsIn(ctx, windowDates(ctx, state), state.group);
  const top = sortRows(ctx, al.filter((r) => matchWhere(ctx, r, d.queue.where)), 'queue').slice(0, 3);
  const chosen = (state.ids || '').split(',').filter(Boolean).map((id) => findRow(ctx, id)).filter(Boolean);
  return [
    `[${d.app.title}] ${d.report?.memoTitle || '인수인계 메모'}`,
    `기준: ${d.app.asOf} · ${periodLabel(state.period)} · ${groupName(ctx, state.group)}`,
    '',
    '1. 요약', buildSummary(ctx, state),
    '',
    `2. 먼저 볼 ${d.entity.singular} (상위 3${d.entity.unit})`, ...(top.length ? top.map((r) => memoLine(ctx, r)) : ['- 해당 없음']),
    ...(chosen.length ? ['', '3. 선택한 건', ...chosen.map((r) => memoLine(ctx, r))] : []),
    '',
    `${chosen.length ? '4' : '3'}. 한계`, d.app.limit,
  ].join('\n');
}
// 조건 A/B 비교 표: [라벨, 값, 소수자리]
export function compareRows(ctx, m) {
  // 조건 없는 건수 지표가 이미 있으면 전체 건수 행을 또 넣지 않는다
  const hasTotal = ctx.d.metrics.some((x) => x.agg === 'count' && !x.where);
  const out = hasTotal ? [] : [[`${ctx.d.entity.plural} 건수(${ctx.d.entity.unit})`, m._n, 0]];
  for (const x of ctx.d.metrics) out.push([`${x.label}(${x.unit})`, m[x.key], x.decimals ?? 0]);
  return out;
}

// 차이 = 조건 A − 조건 B (둘 중 하나라도 값이 없으면 null)
export const compareDiff = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : a - b);

// ---------- 입력·판정 폼 ----------
export function formOpenRows(ctx, route) {
  const f = ctx.d.form;
  const open = ctx.rows.filter((r) => matchWhere(ctx, r, f.openWhere)).slice(-40);
  const cur = route?.id && findRow(ctx, route.id);
  if (cur && !open.includes(cur)) open.push(cur);
  return open;
}
export function validate(ctx, v) {
  const f = ctx.d.form, e = {};
  if (!findRow(ctx, String(v.ref || '').trim())) e.ref = f.refMsg || `존재하는 ${ctx.d.entity.singular} ID 를 고르세요.`;
  for (const fld of f.fields) {
    const raw = v[fld.key];
    const empty = raw === undefined || raw === null || String(raw).trim() === '';
    let bad = false;
    if (fld.required && empty) bad = true;
    else if (!empty && fld.type === 'number') { const n = Number(raw); bad = !Number.isFinite(n) || (fld.min !== undefined && n < fld.min); }
    else if (!empty && fld.type === 'radio') bad = !fld.options.includes(String(raw));
    if (bad) e[fld.key] = fld.msg || `${fld.label.replace(/\s*\(.*\)$/, '')}을(를) 확인하세요.`;
  }
  return e;
}
export function makeDecision(ctx, existing, v, ts, who) {
  const rec = { id: `D-${String(existing.length + 1).padStart(4, '0')}`, ref: String(v.ref).trim() };
  for (const fld of ctx.d.form.fields) rec[fld.key] = fld.type === 'number' ? Number(v[fld.key]) : String(v[fld.key] ?? '').trim();
  rec.who = who || ctx.d.form.who || ''; rec.ts = ts;
  return rec;
}

// ---------- 기준값(params) · 판정(judge) · 가정 바꿔 보기(whatIf) ----------
// domain.json: "params": [{key, label, unit, type:'number'|'enum'|'bool', default, min, max, step, options, affects}]
//   설정 어디서든 값 자리에 "$param:키" (통째 참조 → 숫자·불리언 그대로) 또는 글 속 {param:키} 를 쓰면 makeCtx 가 현재 기준값으로 채운다.
//   "judge": {col?, where?, skip?, value, rules:[{label, where?, value?, op?, at?, on?}], else?} — 행마다 첫 번째로 맞는 규칙의 라벨(_judge). col 이 있고 기준값이 기본값과 다르면 그 열도 덮는다.
export const PARAM_REF = '$param:';
export const paramDefs = (domain) => (Array.isArray(domain?.params) ? domain.params : []);
export const optionValue = (o) => (o !== null && typeof o === 'object' ? o.v : o);
const optionLabel = (o) => (o !== null && typeof o === 'object' ? o.label ?? o.v : o);

export function paramError(def, v) {
  if (def.type === 'bool') return typeof v === 'boolean' ? '' : '켬 또는 끔 중에서 고르세요.';
  if (def.type === 'enum') return (def.options || []).map(optionValue).includes(v) ? '' : '목록에 있는 값을 고르세요.';
  if (typeof v !== 'number' || !Number.isFinite(v)) return '숫자를 입력하세요.';
  if ((def.min != null && v < def.min) || (def.max != null && v > def.max)) return `${def.min ?? ''}~${def.max ?? ''}${def.unit || ''} 사이로 입력하세요.`;
  return '';
}
// 기본값 위에 저장값을 덮는다. 틀린 저장값은 기본값으로.
export function paramValues(domain, saved) {
  const out = {};
  for (const def of paramDefs(domain)) { const v = saved ? saved[def.key] : undefined; out[def.key] = v !== undefined && !paramError(def, v) ? v : def.default; }
  return out;
}
export function validateParams(domain, values) {
  const e = {};
  for (const def of paramDefs(domain)) { if (!(def.key in (values || {}))) continue; const m = paramError(def, values[def.key]); if (m) e[def.key] = m; }
  return e;
}
export function resolveParams(node, values) {
  if (typeof node === 'string') {
    if (node.startsWith(PARAM_REF)) { const k = node.slice(PARAM_REF.length); return k in values ? values[k] : node; }
    return node.includes('{param:') ? node.replace(/\{param:([A-Za-z0-9_]+)\}/g, (m, k) => (k in values ? String(values[k]) : m)) : node;
  }
  if (Array.isArray(node)) return node.map((x) => resolveParams(x, values));
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolveParams(v, values)]));
  return node;
}
// 화면에 쓰는 값 글자: 숫자 = 값+단위, 목록 = 라벨, 켬/끔
export function paramText(def, v) {
  if (def.type === 'bool') return v ? '켬' : '끔';
  if (def.type === 'enum') return String((def.options || []).map((o) => [optionValue(o), optionLabel(o)]).find(([x]) => x === v)?.[1] ?? v);
  return `${v}${def.unit || ''}`;
}
export function diffParams(domain, before, after) {
  return paramDefs(domain).filter((d) => before[d.key] !== after[d.key]).map((d) => ({ key: d.key, label: d.label, unit: d.unit || '', from: paramText(d, before[d.key]), to: paramText(d, after[d.key]) }));
}
// 기본값과 다른 저장값
export const customParams = (ctx) => diffParams(ctx.raw, paramValues(ctx.raw, {}), ctx.settings || {});
// 하단 「이 화면의 한계」 줄에 붙이는 사실 한 줄 (기본값이면 빈 글자)
export function settingsNote(ctx) {
  const c = customParams(ctx);
  if (!c.length) return '';
  return `기준값 사용자 설정 적용(${c[0].label} ${c[0].to}${c.length > 1 ? ` 외 ${c.length - 1}개` : ''})`;
}

// 설정 저장 기록. saved = {values, history}. 사유(한 줄) 필수, 바뀐 항목마다 이력 한 줄.
export function makeSettingsRecord(domain, saved, values, reason, ts) {
  const before = paramValues(domain, saved?.values);
  const merged = { ...before, ...values };
  const errors = validateParams(domain, merged);
  if (Object.keys(errors).length) return { errors };
  const changes = diffParams(domain, before, merged);
  if (!changes.length) return { errors: { _: '바꾼 값이 없습니다.' } };
  const why = String(reason ?? '').trim();
  if (!why) return { errors: { _reason: '사유를 한 줄 적으세요.' } };
  const entries = changes.map((c) => ({ ts, key: c.key, label: c.label, unit: c.unit, from: c.from, to: c.to, reason: why }));
  return { saved: { values: merged, history: [...(saved?.history || []), ...entries] }, entries };
}

// 판정
const CMP = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };
export function judgeLabel(ctx, row) {
  const j = ctx.d.judge;
  if (!j) return null;
  if (!matchWhere(ctx, row, j.where)) return j.skip ?? null;
  let unknown = false; // 값이 비어 비교하지 못한 규칙이 있으면 else 로 단정하지 않고 판정하지 않는다(행의 원래 값을 그대로 둠)
  for (const rule of j.rules || []) {
    if (rule.on === false || !matchWhere(ctx, row, rule.where)) continue;
    if (!rule.op) return rule.label;
    const v = valueOf(ctx, row, rule.value || j.value);
    if (!Number.isFinite(v)) { unknown = true; continue; }
    if (CMP[rule.op]?.(v, Number(rule.at))) return rule.label;
  }
  return unknown ? null : j.else ?? null;
}
const judgeOf = (ctx, row) => (ctx.d.judge ? row._judge ?? null : null);

// 가정 바꿔 보기 — 지금 기준(ctx.settings)과 바꾼 기준(overrides 를 덮은 것)의 결과를 같은 기간·그룹으로 나란히 계산한다. 저장은 하지 않는다.
export const WHATIF_STATE = { period: '14d', group: ALL };
export function whatIf(ctx, overrides = {}, state = WHATIF_STATE) {
  const domain = ctx.raw;
  const before = ctx.settings || {};
  const after = { ...before };
  for (const def of paramDefs(domain)) if (def.key in (overrides || {}) && !paramError(def, overrides[def.key])) after[def.key] = overrides[def.key];
  const alt = makeCtx(domain, ctx.s, after);
  const changed = diffParams(domain, before, after);
  const dates = windowDates(ctx, state);
  const a = metricsFor(ctx, dates, state.group), b = metricsFor(alt, dates, state.group);
  const met = (m, v) => (m.target == null || v === null || v === undefined ? null : m.better === 'down' ? v <= m.target : v >= m.target);
  const keys = ctx.d.whatIf?.metrics || (ctx.d.cards || []).slice(0, 4);
  const metrics = keys.filter((k) => metricDef(ctx, k)).map((key) => {
    const m = metricDef(ctx, key), m2 = metricDef(alt, key);
    return { key, label: m.label, unit: m.unit, decimals: m.decimals ?? 0, before: a[key], after: b[key], diff: compareDiff(b[key], a[key]), targetBefore: m.target ?? null, targetAfter: m2.target ?? null, metBefore: met(m, a[key]), metAfter: met(m2, b[key]) };
  });
  if (ctx.d.control) {
    const c1 = buildInputs(ctx, state).w14, c2 = changed.length ? buildInputs(alt, state).w14 : c1;
    metrics.push({ key: '_control', label: `${ctx.d.control.title} 한계 밖 점`, unit: '개', decimals: 0, before: c1.outCount, after: c2.outCount, diff: c2.outCount - c1.outCount, targetBefore: null, targetAfter: null, metBefore: null, metAfter: null });
  }
  const has = !!ctx.d.judge;
  let flips = { has, count: 0, rows: [], moves: [] };
  if (has && changed.length) {
    const alts = new Map(alt.rows.map((r) => [String(idOf(alt, r)), r]));
    const list = [];
    for (const r of rowsIn(ctx, dates, state.group)) {
      const x = alts.get(String(idOf(ctx, r)));
      const l1 = judgeOf(ctx, r), l2 = x ? judgeOf(alt, x) : l1;
      if (l1 !== l2) list.push({ id: idOf(ctx, r), title: titleOf(ctx, r), before: l1 ?? '–', after: l2 ?? '–', _d: r[ctx.R.date] });
    }
    list.sort((p, q) => (p._d < q._d ? 1 : p._d > q._d ? -1 : 0));
    const mv = new Map();
    for (const f of list) { const k = `${f.before}\u0000${f.after}`; mv.set(k, (mv.get(k) || 0) + 1); }
    flips = { has, count: list.length, rows: list.slice(0, 10).map(({ _d, ...f }) => f), moves: [...mv].map(([k, n]) => { const [from, to] = k.split('\u0000'); return { from, to, n }; }).sort((p, q) => q.n - p.n) };
  }
  return { changed, metrics, flips, basis: `${periodLabel(state.period)} · ${groupName(ctx, state.group)}`, after };
}
