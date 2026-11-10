"""파레토 프런티어 파레토 프런티어 — CP-SAT ε-제약 반복으로 두 KPI(처리량 vs Q-Time 위험) 프런티어를 만들고
현행(FIFO) 점이 프런티어 안쪽인지 판정한다.

실행: python pareto_frontier.py   (numpy, pandas, ortools 만 필요)
입력 DataFrame `lots` (이번 교대에 병목 장비에 올릴 후보 LOT, 합성값):
  lot         LOT 이름 (행 순서 = 도착 순서 = FIFO 순서)
  slots       장비 점유 시간 (30분 단위 정수)
  throughput  이 LOT 을 돌리면 얻는 처리량 점수 (정수, 예: 웨이퍼 수 x 가중)
  qtime_risk  이 LOT 을 이번 교대에 못 돌리고 대기시켰을 때의 Q-Time 위반 위험 점수 (정수 1~20)
CAP_SLOTS : 이번 교대 장비 가용 슬롯. 목표1 = 처리량 최대화, 목표2 = 대기 LOT 위험 합 최소화.
"""
import numpy as np
import pandas as pd
from ortools.sat.python import cp_model

CAP_SLOTS = 48  # 24시간


def make_lots(n=24, seed=14):
    rng = np.random.default_rng(seed)
    slots = rng.integers(2, 9, n)
    return pd.DataFrame({"lot": [f"LOT-{i:02d}" for i in range(n)], "slots": slots,
                         "throughput": (slots * rng.integers(8, 16, n)).astype(int),
                         "qtime_risk": rng.integers(1, 21, n)})


def _solve(lots, cap, max_left=None, min_value=None):
    """한 번의 CP-SAT. max_left 가 있으면 [처리량 최대], min_value 가 있으면 [잔여위험 최소]."""
    m = cp_model.CpModel()
    x = [m.NewBoolVar(f"x{i}") for i in range(len(lots))]
    m.Add(sum(int(w) * v for w, v in zip(lots.slots, x)) <= cap)
    value = sum(int(t) * v for t, v in zip(lots.throughput, x))
    left = int(lots.qtime_risk.sum()) - sum(int(r) * v for r, v in zip(lots.qtime_risk, x))
    if max_left is not None:
        m.Add(left <= max_left)
        m.Maximize(value)
    else:
        m.Add(value >= min_value)
        m.Minimize(left)
    s = cp_model.CpSolver(); s.parameters.num_workers = 1; s.parameters.random_seed = 14
    st = s.Solve(m)
    if st not in (cp_model.OPTIMAL,):
        return None
    sel = [int(s.Value(v)) for v in x]
    return int(lots.throughput @ np.array(sel)), int(lots.qtime_risk.sum() - lots.qtime_risk @ np.array(sel)), sel


def frontier(lots, cap=CAP_SLOTS):
    """ε-제약 반복: 잔여위험 <= ε 에서 처리량 최대 -> 같은 처리량에서 위험 최소 -> ε = 위험 - 1 로 조인다."""
    eps, pts = int(lots.qtime_risk.sum()), []
    while eps >= 0:
        a = _solve(lots, cap, max_left=eps)
        if a is None:
            break
        v, left, sel = _solve(lots, cap, min_value=a[0])
        pts.append(dict(throughput=v, residual_risk=left, selected=sel))
        eps = left - 1
    return pd.DataFrame(pts)


def fifo_point(lots, cap=CAP_SLOTS):
    used, sel = 0, []
    for w in lots.slots:  # 도착 순서대로 들어가는 것만 올린다
        take = used + w <= cap
        sel.append(int(take)); used += w * take
    sel = np.array(sel)
    return int(lots.throughput @ sel), int(lots.qtime_risk.sum() - lots.qtime_risk @ sel)


def dominated_by(frontier_df, v, left):
    """현행 점 (v, left) 을 지배하는(처리량 >=, 위험 <=, 하나는 엄격) 프런티어 점들."""
    f = frontier_df
    return f[(f.throughput >= v) & (f.residual_risk <= left) & ((f.throughput > v) | (f.residual_risk < left))]


def hard_check(lots, fr, cap=CAP_SLOTS):
    """2차원 배낭 DP(CP-SAT 와 다른 경로)로 프런티어를 전수 재계산해 집합이 같은지 본다."""
    R = int(lots.qtime_risk.sum())
    dp = np.full((cap + 1, R + 1), -1, dtype=np.int64); dp[0, 0] = 0
    for w, t, r in zip(lots.slots, lots.throughput, lots.qtime_risk):
        new = dp.copy()
        new[w:, r:] = np.maximum(new[w:, r:], np.where(dp[:cap + 1 - w, :R + 1 - r] >= 0,
                                                       dp[:cap + 1 - w, :R + 1 - r] + t, -1))
        dp = new
    best = dp.max(0)  # 커버한 위험 cov 별 최대 처리량
    cand = [(int(best[c]), R - c) for c in range(R + 1) if best[c] >= 0]
    pareto = {p for p in cand if not any(q != p and q[0] >= p[0] and q[1] <= p[1] for q in cand)}
    got = set(zip(fr.throughput, fr.residual_risk))
    assert got == pareto, (sorted(got - pareto), sorted(pareto - got))
    for sel, v, r in zip(fr.selected, fr.throughput, fr.residual_risk):  # 해 재계산: 용량·값
        s = np.array(sel)
        assert lots.slots @ s <= cap and lots.throughput @ s == v and R - lots.qtime_risk @ s == r
    assert fr.throughput.is_monotonic_decreasing and fr.residual_risk.is_monotonic_decreasing  # 한쪽이 좋아지면 다른 쪽이 나빠진다
    return len(pareto)


if __name__ == "__main__":
    lots = make_lots()
    fr = frontier(lots)
    print(f"후보 LOT {len(lots)}개, 용량 {CAP_SLOTS}슬롯. 프런티어 {len(fr)}점 (처리량 , 대기 LOT 잔여위험):")
    print(fr[["throughput", "residual_risk"]].to_string(index=False))
    v, left = fifo_point(lots)
    dom = dominated_by(fr, v, left)
    print(f"\n현행(FIFO) 점: 처리량 {v}, 잔여위험 {left} -> 프런티어 {'안쪽(지배됨)' if len(dom) else '위'}")
    if len(dom):
        same_left = fr[fr.residual_risk <= left].throughput.max()
        same_v = fr[fr.throughput >= v].residual_risk.min()
        print(f"  같은 위험에서 처리량 {v} -> {same_left} (+{(same_left / v - 1) * 100:.1f}%), "
              f"같은 처리량에서 위험 {left} -> {same_v} ({(same_v / left - 1) * 100:+.1f}%), 지배하는 점 {len(dom)}개")
    n = hard_check(lots, fr)
    print(f"HARD CHECK OK: 2D 배낭 DP 전수 프런티어 {n}점 = CP-SAT ε-제약 {len(fr)}점 · 각 해 용량/값 재계산")
