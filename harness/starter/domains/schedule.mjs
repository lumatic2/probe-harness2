// schedule.mjs — 일정 격자(#/schedule)의 계산: 자원 행 · 시간 슬롯 열 · 충돌 규칙 · 편집 반영. 순수 함수 (DOM 없음, Node·브라우저 공용).
// 설정(domain.json 의 schedule):
//   resource  행이 되는 열(장비·사람·팀)       label  막대 글자 틀 "{열}"       start / end  시작·종료 열
//   slot      {unit:'day'|'hour', from:'YYYY-MM-DD'(시간 단위면 'YYYY-MM-DDTHH:MM'), count:열 수} — 충돌 계산·주 보기 범위
//   scale     처음 보기: 'hour'(하루를 1시간 칸) | 'day'(범위 전체를 일 칸) | 'auto'(기본: 일정이 하루 안에 몰리면 hour, 여러 날이면 day). 화면에서 「일 / 주」로 바꾼다
//   where     격자에 올릴 건의 조건(core.matchWhere 와 같은 모양)            snapMinutes  끌어 옮길 때 맞추는 분 단위(기본 60)
//   rules     [{by:열, max:동시 허용 건수(기본 1), label}]  같은 by 값을 가진 건이 max 를 넘어 동시에 걸리면 충돌
//             · 같은 자원 시간 겹침 = by 가 자원 열, max 1 · 같은 그룹 동시 = by 가 그룹 열 · 자원 용량 초과 = by 가 팀 열, max 팀 용량
// 시각은 'YYYY-MM-DDTHH:MM:SS' 글자(시간대 없음)로 두고, 비교는 같은 방식으로 ms 로 바꿔서 한다. 종료가 시작과 같거나 앞서면 MIN_MINUTES 길이로 본다.
import { tpl, matchWhere, idOf, mmdd } from './core.mjs';

export const MIN_MINUTES = 30;
export const toMs = (s) => Date.parse(String(s).length === 10 ? `${s}T00:00:00Z` : `${String(s).slice(0, 19)}Z`);
export const toTs = (ms) => new Date(ms).toISOString().slice(0, 19);
const WD = ['일', '월', '화', '수', '목', '금', '토'];

export function slotInfo(cfg) {
  const unit = cfg.slot?.unit === 'hour' ? 'hour' : 'day';
  const slotMs = unit === 'hour' ? 3600000 : 86400000;
  const count = cfg.slot?.count ?? (unit === 'hour' ? 24 : 7);
  const t0 = toMs(cfg.slot?.from);
  const slots = Array.from({ length: count }, (_, i) => {
    const ms = t0 + i * slotMs;
    const iso = toTs(ms);
    return unit === 'hour' ? { ms, label: iso.slice(11, 13), sub: iso.slice(5, 10) } : { ms, label: mmdd(iso), sub: WD[new Date(ms).getUTCDay()] };
  });
  return { unit, slotMs, count, t0, t1: t0 + count * slotMs, slots };
}

const effEnd = (s, e) => Math.max(e, s + MIN_MINUTES * 60000);

// edits: {id: {start?, end?, resource?}} — 화면에서 고친 값. 원 데이터(rows)는 건드리지 않는다.
export function scheduleModel(ctx, edits = {}) {
  const cfg = ctx.d.schedule;
  const info = slotInfo(cfg);
  const rcol = cfg.resource;
  // 자원을 옮기면 그 자원에 딸린 라인·팀 같은 값도 따라간다 — 자원 하나에 값이 하나로 정해지는 열만
  const follow = {};
  for (const rule of cfg.rules || []) {
    if (rule.by === rcol || rule.by in follow) continue;
    const m = {};
    let ok = true;
    for (const r of ctx.rows) {
      if (!r[rcol] || !r[rule.by]) continue;
      if (m[r[rcol]] === undefined) m[r[rcol]] = r[rule.by]; else if (m[r[rcol]] !== r[rule.by]) ok = false;
    }
    follow[rule.by] = ok ? m : null;
  }
  const all = ctx.rows.filter((r) => matchWhere(ctx, r, cfg.where)).map((r) => {
    const id = String(idOf(ctx, r));
    const ed = edits[id] || {};
    return { id, row: r, label: tpl(ctx, cfg.label, r), resource: ed.resource ?? r[rcol] ?? '', start: ed.start ?? r[cfg.start] ?? '', end: ed.end ?? r[cfg.end] ?? '', edited: !!edits[id] };
  });
  const unassigned = all.filter((x) => !x.start || !x.end || !x.resource);
  const sched = all.filter((x) => x.start && x.end && x.resource).map((x) => {
    const s = toMs(x.start);
    return { ...x, s, e: effEnd(s, toMs(x.end)) };
  }).filter((x) => x.s < info.t1 && x.e > info.t0);

  const byOf = (x, by) => {
    if (by === rcol) return x.resource;
    const ed = edits[x.id];
    if (ed?.resource && follow[by]?.[ed.resource]) return follow[by][ed.resource];
    return x.row[by];
  };
  const conflicts = [];
  const flagged = new Map(); // id → 걸린 규칙 번호들
  (cfg.rules || []).forEach((rule, ri) => {
    const max = rule.max ?? 1;
    const groups = new Map();
    for (const x of sched) {
      const k = byOf(x, rule.by);
      if (k === undefined || k === '') continue;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    for (const [key, xs] of groups) {
      const ev = [];
      for (const x of xs) { ev.push({ t: x.s, d: 1, x }); ev.push({ t: x.e, d: -1, x }); }
      ev.sort((a, b) => a.t - b.t || a.d - b.d); // 같은 시각이면 끝(-1)이 먼저 — 끝과 시작이 맞닿는 것은 겹침이 아니다
      const active = new Map();
      let last = null;
      const recs = [];
      for (const v of ev) {
        if (v.d < 0) { active.delete(v.x.id); continue; }
        active.set(v.x.id, v.x);
        if (active.size > max) {
          const ids = [...active.keys()];
          if (last && last.ids.every((i) => active.has(i))) last.ids = ids; // 같은 겹침에 건이 더 걸린 것 — 새로 세지 않는다
          else { last = { ids }; recs.push(last); }
        }
      }
      for (const rc of recs) {
        const items = rc.ids.map((i) => xs.find((x) => x.id === i)).sort((a, b) => a.s - b.s);
        conflicts.push({ rule: ri, label: rule.label, key, ids: items.map((x) => x.id), titles: items.map((x) => `${x.id} ${x.label}`), startMs: items[0].s });
        for (const x of items) {
          if (!flagged.has(x.id)) flagged.set(x.id, []);
          if (!flagged.get(x.id).includes(ri)) flagged.get(x.id).push(ri);
        }
      }
    }
  });
  conflicts.sort((a, b) => a.startMs - b.startMs || a.rule - b.rule);

  const marked = sched.map((x) => ({ ...x, conflict: flagged.has(x.id), rules: flagged.get(x.id) || [] }));
  const rows = layoutRows(marked, info);
  return { cfg, info, rows, sched: marked, conflicts, conflictIds: [...flagged.keys()], unassigned, count: sched.length };
}

// 행 = 자원. 한 행 안에서 시간이 겹치는 막대는 줄(lane)로 쌓는다. view = 그릴 시간 범위(slotInfo / hourInfo 모양).
// minFrac = 막대 최소 너비(범위 대비 비율) — 주(일 단위) 보기에서 몇 시간짜리 막대도 글자가 들어가게 하는 값. 줄 쌓기도 이 너비 기준이다.
export function layoutRows(sched, view, minFrac = 0) {
  const span = view.t1 - view.t0;
  const vis = sched.filter((x) => x.s < view.t1 && x.e > view.t0);
  return [...new Set(vis.map((x) => x.resource))].sort().map((res) => {
    const xs = vis.filter((x) => x.resource === res).sort((a, b) => a.s - b.s || a.e - b.e);
    const laneEnd = [];
    const items = xs.map((x) => {
      const left = (Math.max(x.s, view.t0) - view.t0) / span;
      const width = Math.min(Math.max((Math.min(x.e, view.t1) - Math.max(x.s, view.t0)) / span, minFrac), 1 - left); // 최소 너비로 넓혀도 오른쪽 끝은 넘지 않는다
      const endMs = view.t0 + (left + width) * span;
      let lane = laneEnd.findIndex((t) => t <= Math.max(x.s, view.t0));
      if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); }
      laneEnd[lane] = endMs;
      return { ...x, lane, left, width };
    });
    return { resource: res, lanes: Math.max(1, laneEnd.length), items };
  });
}

// 하루 보기: 그날 from~to 시(0~24)를 한 시간 칸으로
export function hourInfo(day, from, to) {
  const t0 = toMs(day) + from * 3600000;
  const count = Math.max(1, to - from);
  const slots = Array.from({ length: count }, (_, i) => ({ ms: t0 + i * 3600000, label: String(from + i).padStart(2, '0'), sub: '' }));
  return { unit: 'hour', slotMs: 3600000, count, t0, t1: t0 + count * 3600000, slots };
}

// 하루 고르기 목록: 격자 범위의 날짜들 [{day:'YYYY-MM-DD', label:'MM-DD 요일'}]
export function dayList(info) {
  const out = [];
  for (let t = Math.floor(info.t0 / 86400000) * 86400000; t < info.t1; t += 86400000) { const iso = toTs(t); out.push({ day: iso.slice(0, 10), label: `${mmdd(iso)} ${WD[new Date(t).getUTCDay()]}` }); }
  return out;
}

// 일정이 걸린 날(격자 범위 안)과 보기 단위 — scale: 'hour'(하루 보기) | 'day'(주 보기) | 'auto'(일정이 하루 안이면 hour, 아니면 day)
export function daysWithItems(sched, info) {
  return [...new Set(sched.flatMap((x) => {
    const out = [];
    for (let t = Math.max(Math.floor(x.s / 86400000) * 86400000, info.t0); t < Math.min(x.e, info.t1); t += 86400000) out.push(toTs(t).slice(0, 10));
    return out;
  }))].sort();
}
export function pickScale(scale, sched, info) {
  if (scale === 'hour' || scale === 'day') return scale;
  return daysWithItems(sched, info).length <= 1 ? 'hour' : 'day';
}
// 그날 일정이 모두 들어가는 시 범위. 기본 6~22시, 넘치면 넓힌다.
export function hourRange(sched, day) {
  const d0 = toMs(day);
  let from = 6, to = 22;
  for (const x of sched) {
    if (x.s >= d0 + 86400000 || x.e <= d0) continue;
    from = Math.min(from, Math.floor((Math.max(x.s, d0) - d0) / 3600000));
    to = Math.max(to, Math.ceil((Math.min(x.e, d0 + 86400000) - d0) / 3600000));
  }
  return [from, Math.min(24, to)];
}

// 막대를 minutes 만큼 옮긴 새 시각 (길이 유지). snap 분 단위로 맞춘다.
export function shifted(item, minutes, snap = 60) {
  const m = Math.round(minutes / snap) * snap;
  return { start: toTs(toMs(item.start) + m * 60000), end: toTs(toMs(item.end) + m * 60000) };
}

// 확정 저장 본문 — 충돌이 남아 있으면 저장하지 않는다(null)
export function confirmPayload(model, edits, ts) {
  if (model.conflicts.length) return null;
  return { ts, count: model.count, edits };
}

// datetime-local 입력('YYYY-MM-DDTHH:MM') ↔ 저장 글자('…:SS')
export const toInput = (ts) => String(ts || '').slice(0, 16);
export const fromInput = (v) => (v ? `${String(v).slice(0, 16)}:00` : '');
export const validRange = (start, end) => !!start && !!end && toMs(end) > toMs(start);
