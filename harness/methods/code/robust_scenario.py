"""강건·시나리오 계획 강건·시나리오 계획 — 평균 최적 vs 최악 경우 최적 vs 후회 최소 배정의 p90 지연 비교.

실행: python robust_scenario.py   (numpy, pandas, ortools 만 필요)
입력 DataFrame `jobs`: job(LOT 이름) · minutes(공칭 처리시간, 분) · due(납기, 교대 시작 후 분)
시나리오: P[s,j] = 시나리오 s 에서 job j 의 처리시간(분), D[s,m] = 장비 m 의 시작 지연(다운, 분).
결정(1단계) = LOT 의 장비 배정. 장비 안 순서는 납기순(EDD)으로 고정하고, 실제 완료시각은 시나리오가 정한다.
KPI = 시나리오별 총 지연(분) = sum_j max(0, 완료 - 납기).
"""
import itertools
import numpy as np
import pandas as pd
from ortools.sat.python import cp_model

N_MACH = 3
N_PLAN = 40  # 계획에 쓰는 시나리오 수 (너무 적으면 꼬리를 못 봐서 평균 최적이 과적합된다)


def make_jobs(n=9, seed=15):
    rng = np.random.default_rng(seed)
    jobs = pd.DataFrame({"job": [f"LOT-{i}" for i in range(n)], "minutes": rng.integers(90, 301, n),
                         "due": rng.integers(250, 551, n)})
    return jobs.sort_values("due", kind="stable", ignore_index=True)  # EDD 순


def make_scenarios(jobs, n, seed):
    rng = np.random.default_rng(seed)
    P = np.rint(jobs.minutes.to_numpy() * rng.lognormal(0, 0.25, (n, len(jobs)))).astype(int)
    down = rng.random((n, N_MACH)) < 0.20  # 장비가 20% 확률로 고장
    D = np.where(down, rng.integers(120, 361, (n, N_MACH)), 0)
    return P, D


def evaluate(assign, jobs, P, D):
    """독립 평가기: 장비별로 EDD 순서로 실제 시뮬레이션 -> 시나리오별 총 지연."""
    due = jobs.due.to_numpy()
    t, out = D.astype(float).copy(), np.zeros(len(P))  # t[s,m] = 장비 m 의 현재 시각
    for j in range(len(jobs)):  # jobs 는 납기순 정렬 상태 = 장비 안 처리 순서
        t[:, assign[j]] += P[:, j]
        out += np.maximum(0, t[:, assign[j]] - due[j])
    return out


def solve(jobs, P, D, mode, ref=None):
    """mode: 'mean'(시나리오 평균 최소) · 'worst'(최악 최소) · 'regret'(최대 후회 최소, ref=시나리오별 최적값)."""
    n, S = len(jobs), len(P)
    m = cp_model.CpModel()
    x = [[m.NewBoolVar("") for _ in range(N_MACH)] for _ in range(n)]
    for j in range(n):
        m.AddExactlyOne(x[j])
    y = {}
    for i, j in itertools.combinations(range(n), 2):  # i 가 j 보다 납기가 빠름
        y[i, j] = m.NewBoolVar("")  # 같은 장비면 1 (아래 하한만 있어도 최소화에서 정확)
        for k in range(N_MACH):
            m.Add(y[i, j] >= x[i][k] + x[j][k] - 1)
    tot = []
    for s in range(S):
        t_s = []
        for j in range(n):
            comp = int(P[s, j]) + sum(int(P[s, i]) * y[i, j] for i in range(j)) \
                + sum(int(D[s, k]) * x[j][k] for k in range(N_MACH))
            tard = m.NewIntVar(0, 10_000, "")
            m.Add(tard >= comp - int(jobs.due[j]))
            t_s.append(tard)
        tot.append(sum(t_s))
    if mode == "mean":
        m.Minimize(sum(tot))
    else:
        w = m.NewIntVar(0, 10**6, "")
        for s in range(S):
            m.Add(w >= tot[s] - (int(ref[s]) if mode == "regret" else 0))
        m.Minimize(100_000 * w + sum(tot))  # 동률은 평균이 작은 쪽
    sol = cp_model.CpSolver(); sol.parameters.num_workers = 1; sol.parameters.random_seed = 15
    sol.parameters.max_time_in_seconds = 60
    st = sol.Solve(m)
    assert st == cp_model.OPTIMAL, (mode, sol.StatusName(st))
    return [max(range(N_MACH), key=lambda k: sol.Value(x[j][k])) for j in range(n)]


def brute_force(jobs, P, D, ref):
    """3^9 배정 전수 탐색(솔버와 다른 경로): 평균·최악·최대후회 각각의 진짜 최소값."""
    best = dict(mean=1e18, worst=1e18, regret=1e18)
    for a in itertools.product(range(N_MACH), repeat=len(jobs)):
        v = evaluate(a, jobs, P, D)
        best["mean"], best["worst"] = min(best["mean"], v.sum()), min(best["worst"], v.max())
        best["regret"] = min(best["regret"], (v - ref).max())
    return best


if __name__ == "__main__":
    jobs = make_jobs()
    P, D = make_scenarios(jobs, N_PLAN, seed=1)  # 계획용 시나리오
    ref = np.array([evaluate_best for evaluate_best in (  # 시나리오별 단독 최적(후회의 기준)
        evaluate(solve(jobs, P[[s]], D[[s]], "mean"), jobs, P[[s]], D[[s]])[0] for s in range(len(P)))])
    plans = {"평균 최적": solve(jobs, P, D, "mean"), "최악 최적": solve(jobs, P, D, "worst"),
             "후회 최소": solve(jobs, P, D, "regret", ref)}
    P0 = jobs.minutes.to_numpy()[None, :]  # 현행: 공칭값 1개 시나리오로만 계획
    plans = {"공칭 계획(현행)": solve(jobs, P0, np.zeros((1, N_MACH), int), "mean"), **plans}
    Pt, Dt = make_scenarios(jobs, 2000, seed=999)  # 계획에 안 쓴 새 시나리오 2000개로 평가
    rows = []
    for name, a in plans.items():
        v = evaluate(a, jobs, Pt, Dt)
        rows.append(dict(plan=name, mean=v.mean(), p90=np.percentile(v, 90), worst=v.max(),
                         assign="".join(map(str, a))))
    res = pd.DataFrame(rows).set_index("plan")
    pd.set_option("display.width", 140, "display.float_format", "{:,.1f}".format)
    print("== 새 시나리오 2000개에서 총 지연(분) ==")
    print(res)
    base = res.loc["평균 최적", "p90"]
    print(f"\np90 지연: 평균 최적 {base:.0f}분 -> 최악 최적 {res.loc['최악 최적', 'p90']:.0f}분, "
          f"후회 최소 {res.loc['후회 최소', 'p90']:.0f}분 (합성 시나리오)")
    ins = {k: evaluate(a, jobs, P, D) for k, a in plans.items()}  # 계획 시나리오 안에서 재평가
    bf = brute_force(jobs, P, D, ref)
    assert ins["평균 최적"].sum() == bf["mean"], (ins["평균 최적"].sum(), bf["mean"])
    assert ins["최악 최적"].max() == bf["worst"]
    assert (ins["후회 최소"] - ref).max() == bf["regret"]
    assert (ins["평균 최적"] - ref).min() >= 0 and (ins["최악 최적"] - ref).min() >= 0  # 후회는 음수 불가
    assert ins["최악 최적"].max() <= ins["평균 최적"].max() and ins["평균 최적"].sum() <= ins["최악 최적"].sum()
    print(f"HARD CHECK OK: 3^{len(jobs)} 전수 탐색과 평균 {bf['mean']:.0f} · 최악 {bf['worst']:.0f} · "
          f"최대후회 {bf['regret']:.0f} 일치 · 후회>=0 · 순서 부등식")
