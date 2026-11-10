"""제약 프로그래밍 일정 CP-SAT 유연 잡숍 + Q-Time 하드 제약 + 독립 제약 위반 검사기.
입력: ops(lot,step,machine,dur) · qtime(lot,step,max_wait) · down{machine:[(시작,끝)]}  (시간 단위 = 분)
실행: python cpsat_jobshop.py
"""
import collections
import random

import pandas as pd
from ortools.sat.python import cp_model

RANGE = [(10, 18), (30, 45), (15, 25), (10, 18)]  # 공정별 기본 공정시간(분): 식각이 병목
ROUTE = [("PHOTO", ["P1", "P2"]), ("ETCH", ["E1", "E2", "E3"]), ("CMP", ["C1", "C2"]), ("PHOTO", ["P1", "P2"])]


def make_data(seed=7, n_lots=10):
    """합성 데이터: LOT x 4공정(포토→식각→CMP→포토 재진입), 장비별 공정시간이 조금씩 다르다."""
    rng = random.Random(seed)
    rows = []
    for lot in range(n_lots):
        for step, (_grp, machines) in enumerate(ROUTE):
            base = rng.randint(*RANGE[step])
            for mc in machines:
                rows.append(dict(lot=f"L{lot}", step=step, machine=mc, dur=base + rng.randint(-4, 4)))
    ops = pd.DataFrame(rows)
    qtime = pd.DataFrame([dict(lot=f"L{lot}", step=0, max_wait=5) for lot in range(n_lots)])  # 포토 종료→식각 시작 <= 5분
    return ops, qtime


def solve(ops, qtime, down=None, horizon=2000, time_limit=20.0):
    """CP-SAT 로 유연 잡숍을 푼다. 반환 (일정 DataFrame[lot,step,machine,start,end], 상태, makespan)."""
    down = down or {}
    m = cp_model.CpModel()
    S, E, alts, on_machine = {}, {}, {}, collections.defaultdict(list)
    for (lot, step), g in ops.groupby(["lot", "step"]):
        S[lot, step], E[lot, step] = m.NewIntVar(0, horizon, ""), m.NewIntVar(0, horizon, "")
        alts[lot, step] = []
        for r in g.itertuples():
            b = m.NewBoolVar("")
            on_machine[r.machine].append(m.NewOptionalIntervalVar(S[lot, step], int(r.dur), E[lot, step], b, ""))
            alts[lot, step].append((b, r.machine))
        m.AddExactlyOne(b for b, _ in alts[lot, step])
    for mc, windows in down.items():  # 계획 정지(PM)·고장 창 = 고정 구간
        for a, b in windows:
            on_machine[mc].append(m.NewFixedSizeIntervalVar(a, b - a, ""))
    for ivs in on_machine.values():
        m.AddNoOverlap(ivs)
    qmax = {(r.lot, r.step): r.max_wait for r in qtime.itertuples()}
    for (lot, step) in S:
        if (lot, step + 1) in S:
            m.Add(S[lot, step + 1] >= E[lot, step])  # 선후
            if (lot, step) in qmax:
                m.Add(S[lot, step + 1] - E[lot, step] <= int(qmax[lot, step]))  # Q-Time 하드 제약
    last = {lot: max(s for l, s in S if l == lot) for lot in {l for l, _ in S}}
    mk = m.NewIntVar(0, horizon, "mk")
    m.AddMaxEquality(mk, [E[lot, st] for lot, st in last.items()])
    m.Minimize(1000 * mk + sum(E[lot, st] for lot, st in last.items()))  # 1순위 makespan, 2순위 총 완료시각
    sv = cp_model.CpSolver()
    sv.parameters.max_time_in_seconds, sv.parameters.num_workers, sv.parameters.random_seed = time_limit, 8, 1
    status = sv.Solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return pd.DataFrame(), sv.StatusName(status), None
    rows = [dict(lot=l, step=s, machine=mc, start=sv.Value(S[l, s]), end=sv.Value(E[l, s]))
            for (l, s), al in alts.items() for b, mc in al if sv.Value(b)]
    return pd.DataFrame(rows).sort_values(["start", "lot"]).reset_index(drop=True), sv.StatusName(status), sv.Value(mk)


def greedy_fifo(ops, down=None):
    """사람이 짜는 방식의 기준선: 준비된 순서대로 가장 빨리 끝나는 장비에 배정. Q-Time 은 모른다."""
    down, free, ready = down or {}, collections.defaultdict(int), {l: 0 for l in ops.lot.unique()}
    nxt, rows = {l: 0 for l in ready}, []
    nsteps = ops.groupby("lot").step.max().add(1).to_dict()
    while any(nxt[l] < nsteps[l] for l in nxt):
        lot = min((l for l in nxt if nxt[l] < nsteps[l]), key=lambda l: (ready[l], l))
        best = None
        for r in ops[(ops.lot == lot) & (ops.step == nxt[lot])].itertuples():
            t = max(ready[lot], free[r.machine])
            for a, b in sorted(down.get(r.machine, [])):
                if t < b and t + r.dur > a:
                    t = b
            if best is None or t + r.dur < best[0]:
                best = (t + r.dur, r.machine, t)
        end, mc, t = best
        rows.append(dict(lot=lot, step=nxt[lot], machine=mc, start=t, end=end))
        free[mc], ready[lot], nxt[lot] = end, end, nxt[lot] + 1
    return pd.DataFrame(rows)


def check_schedule(sched, ops, qtime, down=None):
    """독립 검사기: 솔버 코드와 무관하게 일정표만 보고 위반 목록을 돌려준다(빈 리스트 = 위반 0건)."""
    down, bad = down or {}, []
    dur = {(r.lot, r.step, r.machine): r.dur for r in ops.itertuples()}
    rec = {(r.lot, r.step): r for r in sched.itertuples()}
    if len(rec) != len(sched) or set(rec) != set(zip(ops.lot, ops.step)):
        bad.append("공정 누락/중복")
    for (lot, step), r in rec.items():
        if dur.get((lot, step, r.machine)) != r.end - r.start:
            bad.append(f"{lot}-{step}: 장비/공정시간 불일치")
        if (lot, step + 1) in rec and rec[lot, step + 1].start < r.end:
            bad.append(f"{lot}-{step}: 선후 위반")
        for a, b in down.get(r.machine, []):
            if r.start < b and a < r.end:
                bad.append(f"{lot}-{step}: {r.machine} 정지창 침범")
    for q in qtime.itertuples():
        if (q.lot, q.step + 1) in rec and rec[q.lot, q.step + 1].start - rec[q.lot, q.step].end > q.max_wait:
            bad.append(f"{q.lot}: Q-Time {q.max_wait}분 초과")
    for mc, g in sched.groupby("machine"):
        g = g.sort_values("start")
        bad += [f"{mc}: 겹침" for x, y in zip(g.end.iloc[:-1], g.start.iloc[1:]) if y < x]
    return bad


if __name__ == "__main__":
    ops, qtime = make_data()
    base = greedy_fifo(ops)
    base_bad = check_schedule(base, ops, qtime)
    print(f"[기준선 FIFO] makespan={base.end.max()} Q-Time 위반={sum('Q-Time' in b for b in base_bad)}건")
    sched, status, mk = solve(ops, qtime)
    print(f"[CP-SAT] 상태={status} makespan={mk}")
    print(sched.head(10).to_string(index=False))
    bad = check_schedule(sched, ops, qtime)
    print(f"[검사기] 위반 {len(bad)}건")
    down = {"E3": [(20, 80)]}  # what-if: 식각 E3 이 20~80분 정지
    sched2, status2, mk2 = solve(ops, qtime, down)
    print(f"[what-if E3 정지] 상태={status2} makespan {mk}->{mk2}, 위반 {len(check_schedule(sched2, ops, qtime, down))}건")
    # ---- 독립 하드체크 ----
    assert status == "OPTIMAL" and status2 == "OPTIMAL", "시간 제한 안에 최적 증명 실패"
    assert bad == [], bad
    assert check_schedule(sched2, ops, qtime, down) == []
    assert mk2 >= mk, "제약을 더하면 최적값이 좋아질 수 없다"
    assert mk == sched.end.max() and len(sched) == len(ops.drop_duplicates(["lot", "step"]))
    tampered = sched.copy()
    tampered.loc[tampered.index[0], "end"] += 5  # 일부러 깨뜨린 일정을 검사기가 잡는지(검사기 자체 시험)
    assert check_schedule(tampered, ops, qtime), "검사기가 변조를 못 잡음"
    print("HARD CHECK OK: 위반 0건 · 정지창 준수 · 변조 탐지 · 제약 추가 시 makespan 비감소")
