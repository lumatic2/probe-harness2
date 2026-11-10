"""최소 변경 재스케줄 최소 변경 재스케줄: 장비 다운 뒤 '기존 일정과 달라진 LOT 수' 벌점 + makespan 을 함께 최소화하는 CP-SAT.
입력 DataFrame ops(LOT×공정×장비 후보 1행): lot · step · machine · dur(분).  down = {장비: (시작, 길이)}, t_now = 현재 시각(분)
t_now 이전에 시작한 공정은 동결(이미 진행 중). 변경 = 장비가 바뀌었거나 시작이 tol 분 넘게 움직인 공정이 하나라도 있는 LOT.
실행: python minimal_change_reschedule.py   (합성 데이터)
"""
import random

import pandas as pd
from ortools.sat.python import cp_model

ROUTE = [["E1", "E2", "E3"], ["C1", "C2"]]  # 공정 0 = 식각 3대, 공정 1 = CMP 2대
TOL = 10  # 이 분 이하의 시작 이동은 '변경 아님'


def make_data(seed=3, n_lots=24):
    rng, rows = random.Random(seed), []
    for i in range(n_lots):
        for st, machines in enumerate(ROUTE):
            base = rng.randint(20, 40) if st == 0 else rng.randint(12, 25)
            rows += [dict(lot=f"L{i:02d}", step=st, machine=mc, dur=base + rng.randint(-3, 3)) for mc in machines]
    return pd.DataFrame(rows)


def solve(ops, down=None, frozen=None, base=None, lam=0, limit=20.0):
    """목적 = makespan + lam × (변경 LOT 수). base(이전 일정)가 없으면 lam 은 의미 없다 = 처음부터 다시 푼 해.
    frozen: DataFrame[lot,step,machine,start] 고정 공정. 반환 (일정 DataFrame[lot,step,machine,start,end], 상태, makespan)."""
    down, m, S, B, iv = down or {}, cp_model.CpModel(), {}, {}, {}
    fz = {(r.lot, r.step): r for r in (frozen if frozen is not None else pd.DataFrame(columns=["lot", "step", "machine", "start"])).itertuples()}
    hmax = int(ops.dur.sum())
    dur = ops.set_index(["lot", "step", "machine"]).dur
    for (lot, st), g in ops.groupby(["lot", "step"]):
        S[lot, st] = m.NewIntVar(0, hmax, "")
        B[lot, st] = {r.machine: m.NewBoolVar("") for r in g.itertuples()}
        m.AddExactlyOne(B[lot, st].values())
        for r in g.itertuples():
            iv.setdefault(r.machine, []).append(m.NewOptionalFixedSizeIntervalVar(S[lot, st], int(r.dur), B[lot, st][r.machine], ""))
        if (lot, st) in fz:
            f = fz[lot, st]
            m.Add(S[lot, st] == int(f.start)); m.Add(B[lot, st][f.machine] == 1)
        if (lot, st - 1) in S:
            m.Add(S[lot, st] >= S[lot, st - 1] + sum(int(r.dur) * B[lot, st - 1][r.machine] for r in ops[(ops.lot == lot) & (ops.step == st - 1)].itertuples()))
    for mc, (a, ln) in down.items():
        iv.setdefault(mc, []).append(m.NewFixedSizeIntervalVar(a, ln, ""))
    for ivs in iv.values():
        m.AddNoOverlap(ivs)
    last = ops.step.max()
    mk = m.NewIntVar(0, hmax, "mk")
    for lot in ops.lot.unique():
        m.Add(mk >= S[lot, last] + sum(int(r.dur) * B[lot, last][r.machine] for r in ops[(ops.lot == lot) & (ops.step == last)].itertuples()))
    changed = {}
    if base is not None:
        old = {(r.lot, r.step): r for r in base.itertuples()}
        for lot in ops.lot.unique():
            changed[lot] = m.NewBoolVar("")
            for st in range(last + 1):
                same = m.NewBoolVar("")  # same ⇒ 같은 장비 · 시작 이동 ≤ TOL
                o = old[lot, st]
                m.Add(B[lot, st][o.machine] == 1).OnlyEnforceIf(same)
                m.Add(S[lot, st] - int(o.start) <= TOL).OnlyEnforceIf(same)
                m.Add(int(o.start) - S[lot, st] <= TOL).OnlyEnforceIf(same)
                m.AddImplication(same.Not(), changed[lot])
    m.Minimize(mk + lam * sum(changed.values()))
    if base is not None:
        for r in base.itertuples():
            m.AddHint(S[r.lot, r.step], int(r.start))
    sv = cp_model.CpSolver()
    sv.parameters.max_time_in_seconds, sv.parameters.num_workers, sv.parameters.random_seed = limit, 8, 1
    status = sv.Solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return pd.DataFrame(), sv.StatusName(status), None
    rows = [dict(lot=l, step=s, machine=mc, start=sv.Value(S[l, s]), end=sv.Value(S[l, s]) + int(dur[l, s, mc]))
            for (l, s), al in B.items() for mc, b in al.items() if sv.Value(b)]
    return pd.DataFrame(rows).sort_values(["start", "lot"]).reset_index(drop=True), sv.StatusName(status), sv.Value(mk)


def count_changes(base, new):
    """독립 변경 집계: 두 일정표를 병합해 pandas 로만 센다(솔버 변수와 무관)."""
    j = base.merge(new, on=["lot", "step"], suffixes=("_o", "_n"))
    moved = (j.machine_o != j.machine_n) | ((j.start_o - j.start_n).abs() > TOL)
    return int(j[moved].lot.nunique())


def check(sched, ops, down=None, frozen=None):
    """독립 검사기: 겹침·정지창 침범·선후·동결 공정 변경 위반 목록."""
    down, bad, dur = down or {}, [], ops.set_index(["lot", "step", "machine"]).dur
    rec = {(r.lot, r.step): r for r in sched.itertuples()}
    if set(rec) != set(zip(ops.lot, ops.step)) or len(rec) != len(sched):
        bad.append("공정 누락/중복")
    for (lot, st), r in rec.items():
        if dur.get((lot, st, r.machine)) != r.end - r.start:
            bad.append(f"{lot}-{st}: 공정시간")
        if (lot, st + 1) in rec and rec[lot, st + 1].start < r.end:
            bad.append(f"{lot}-{st}: 선후")
        a, ln = down.get(r.machine, (0, 0))
        if ln and r.start < a + ln and a < r.end:
            bad.append(f"{lot}-{st}: 정지창 침범")
    for f in (frozen.itertuples() if frozen is not None else []):
        r = rec[f.lot, f.step]
        if (r.machine, r.start) != (f.machine, f.start):
            bad.append(f"{f.lot}-{f.step}: 동결 공정이 바뀜")
    for mc, g in sched.sort_values("start").groupby("machine"):
        bad += [f"{mc}: 겹침" for e, s in zip(g.end.iloc[:-1], g.start.iloc[1:]) if s < e]
    return bad


def disturb(base, mc, t_now, length):
    """E 장비가 t_now 에 length 분 정지: 진행 중 공정(start<t_now)은 동결, 정지는 그 장비의 진행 중 공정이 끝난 뒤부터."""
    frozen = base[base.start < t_now][["lot", "step", "machine", "start"]]
    run_end = base[(base.start < t_now) & (base.machine == mc)].end.max()
    start = max(t_now, 0 if pd.isna(run_end) else int(run_end))
    return frozen, {mc: (start, length)}


if __name__ == "__main__":
    ops = make_data()
    base, st0, mk0 = solve(ops, limit=8.0)  # 기존 일정: 최적 증명이 안 돼도 '현행 일정'으로 쓴다
    print(f"[기존 일정] 상태={st0} makespan={mk0} LOT {ops.lot.nunique()}개")
    frozen, down = disturb(base, "E2", t_now=100, length=120)
    print(f"[교란] E2 가 {down['E2'][0]}분부터 120분 정지 · 동결 공정 {len(frozen)}개")
    rows, res = [], {}
    for lam in (0, 5, 15, 40, 1000):
        s, st, mk = solve(ops, down, frozen, base, lam)
        res[lam] = (s, st, mk, count_changes(base, s))
        rows.append(dict(lam=lam, 상태=st, makespan=mk, 변경LOT=res[lam][3], 위반=len(check(s, ops, down, frozen))))
    print("lam = 변경 LOT 1개의 벌점(분). lam=0 이 '처음부터 다시 푼' 해\n" + pd.DataFrame(rows).to_string(index=False))
    # ---- 독립 하드체크 ----
    assert all(r["위반"] == 0 and r["상태"] == "OPTIMAL" for r in rows), rows
    ch = [res[l][3] for l in (0, 5, 15, 40, 1000)]
    mks = [res[l][2] for l in (0, 5, 15, 40, 1000)]
    assert ch == sorted(ch, reverse=True) and mks == sorted(mks), "lam 이 커질수록 변경↓ makespan↑ 이어야 한다"
    assert ch[-1] < ch[0], "최소 변경 해가 처음부터 푼 해보다 변경이 적어야 한다"
    s_none, st_n, mk_n = solve(ops, {}, base[base.start < 100][["lot", "step", "machine", "start"]], base, lam=1000)
    assert st_n == "OPTIMAL" and count_changes(base, s_none) == 0 and mk_n == mk0, "교란이 없으면 변경 0 이어야 한다"
    tampered = res[1000][0].copy()
    tampered.loc[tampered.index[0], "start"] += 1000  # 일부러 깨뜨린 일정(동결·선후·공정시간 위반이 걸려야 함)
    assert check(tampered, ops, down, frozen), "검사기가 변조를 못 잡음"
    print("HARD CHECK OK: 모든 해 위반 0건(겹침·정지창·선후·동결) · 변경 수 pandas 재집계 · lam↑ 변경↓ makespan↑ · 교란 없으면 변경 0 · 변조 탐지")
