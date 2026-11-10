"""몬테카를로 몬테카를로: (1) 작업망 일정 지연 분포 (2) 연 절감액 분포 -> p10/p50/p90.
입력(DataFrame) tasks: task, pred(선행 작업을 ';' 로 구분, 없으면 ''), opt, mode, pess(일, 삼각분포), p_fail(고장 확률), mttr(평균 수리 일)
       savings dict: viol_per_year(연 Q-Time 위험 LOT 수 평균), reduction(낙관·최빈·비관 비율), cost_per_lot(억원 하·최빈·상)
실행: python monte_carlo.py
"""
import random
from functools import lru_cache

import numpy as np
import pandas as pd
from scipy import stats


def make_data():
    """합성 데이터(전부 가정). 설비 이설·검증 작업망: A -> (B, C 병행) -> D -> E."""
    tasks = pd.DataFrame([("A_반입", "", 3, 5, 9, 0.05, 2), ("B_설치", "A_반입", 6, 8, 14, 0.15, 3),
                          ("C_배관·유틸", "A_반입", 5, 9, 15, 0.10, 2), ("D_시운전", "B_설치;C_배관·유틸", 3, 4, 8, 0.20, 3),
                          ("E_양산 승인", "D_시운전", 2, 3, 5, 0.05, 1)],
                         columns=["task", "pred", "opt", "mode", "pess", "p_fail", "mttr"])
    # 절감액 가정: 재무 문서 §2-5 의 LOT 1건 손실 1.45(원가 기준)~8.6(기회비용 기준)억원, 연 위반 수·감소율은 임의 가정
    savings = dict(viol_per_year=6.0, reduction=(0.4, 0.65, 0.9), cost_per_lot=(1.45, 4.0, 8.6))
    return tasks, savings


def simulate_schedule(tasks, n=20000, seed=11, fail=True):
    """작업별 소요일을 n 번 뽑아 선행 관계를 따라 최종 완료일을 계산한다. 반환 (완료일 배열, 계획일=최빈값 임계경로)."""
    rng = np.random.default_rng(seed)
    t = tasks.set_index("task")
    dur = {k: rng.triangular(r.opt, r["mode"], r.pess, n) + (rng.random(n) < r.p_fail) * rng.exponential(r.mttr, n) * fail
           for k, r in t.iterrows()}
    preds = {k: [p for p in r.pred.split(";") if p] for k, r in t.iterrows()}
    done, left = {}, list(t.index)
    while left:  # 위상 정렬: 선행이 모두 끝난 작업부터
        for k in [k for k in left if all(p in done for p in preds[k])]:
            start = np.maximum.reduce([done[p] for p in preds[k]]) if preds[k] else np.zeros(n)
            done[k] = start + dur[k]; left.remove(k)
    plan = critical_path(tasks, "mode")
    return np.maximum.reduce(list(done.values())), plan


def critical_path(tasks, col):
    """재귀 + 메모이제이션으로 계산하는 확정적 임계경로(시뮬레이터와 다른 코드 경로, 하드체크 겸용)."""
    t = tasks.set_index("task")
    @lru_cache(None)
    def f(k):
        ps = [p for p in t.loc[k, "pred"].split(";") if p]
        return t.loc[k, col] + max([f(p) for p in ps], default=0)
    return max(f(k) for k in t.index)


def simulate_savings(s, n=20000, seed=12):
    """연 절감액(억원) = 회피 LOT 수 x LOT 당 손실. 회피 LOT ~ 포아송(연 위반 수) 을 감소율로 솎음(thinning), LOT 당 손실은 해마다 한 번 삼각분포로 뽑음."""
    rng = np.random.default_rng(seed)
    r, c = rng.triangular(*s["reduction"], n), rng.triangular(*s["cost_per_lot"], n)
    return rng.poisson(s["viol_per_year"] * r) * c


def summarize(x, higher_is_better=False):
    """p50/p90 를 말할 때 방향을 맞춘다: 지연은 p90 이 '나쁜 쪽', 절감액은 p10 이 '나쁜 쪽'(=90% 확률로 이 이상)."""
    q = np.percentile(x, [10, 50, 90])
    return dict(p10=q[0], p50=q[1], p90=q[2], mean=x.mean(), safe=q[0] if higher_is_better else q[2])


if __name__ == "__main__":
    tasks, sv = make_data()
    done, plan = simulate_schedule(tasks)
    delay = done - plan
    d = summarize(delay)
    print(f"[일정] 계획(최빈 임계경로)={plan:.0f}일 | 지연 p50={d['p50']:.1f}일, p90={d['p90']:.1f}일, 평균={d['mean']:.1f}일, 지연 확률={np.mean(delay > 0):.0%}")
    print(f"       '열 번 중 아홉 번은 {plan + d['p90']:.0f}일 안에 끝난다' (계획 {plan:.0f}일 대비 +{d['p90']:.1f}일)")
    sav = simulate_savings(sv)
    s = summarize(sav, higher_is_better=True)
    print(f"[절감액 억원/년] p10={s['p10']:.1f} (90% 확률로 이 이상) · p50={s['p50']:.1f} · p90={s['p90']:.1f} · 평균={s['mean']:.1f} · 0 일 확률={np.mean(sav == 0):.1%}")
    # ---- 독립 하드체크 ----
    lo, hi = critical_path(tasks, "opt"), critical_path(tasks, "pess")
    nofail, _ = simulate_schedule(tasks, fail=False)
    assert nofail.min() >= lo - 1e-9 and nofail.max() <= hi + 1e-9, "경계(낙관·비관 임계경로) 위반"
    assert np.array_equal(simulate_schedule(tasks, 500, 5)[0], simulate_schedule(tasks, 500, 5)[0]), "시드 재현 실패"
    one = tasks.iloc[[0]].assign(p_fail=0.0)  # 단일 작업이면 해석적 삼각분포 분위수와 같아야 한다
    x = simulate_schedule(one, 200000)[0]
    r = one.iloc[0]
    for q in (0.5, 0.9):
        ex = stats.triang.ppf(q, (r["mode"] - r.opt) / (r.pess - r.opt), loc=r.opt, scale=r.pess - r.opt)
        assert abs(np.quantile(x, q) - ex) / ex < 0.01, (q, ex)
    rnd = random.Random(1)  # 순수 파이썬 반복문으로 한 건씩 돌린 평균과 벡터 시뮬레이션 평균 비교
    t = tasks.set_index("task")
    def one_run():
        fin = {}
        for k, rw in t.iterrows():
            ps = [p for p in rw.pred.split(";") if p]
            fin[k] = max([fin[p] for p in ps], default=0) + rnd.triangular(rw.opt, rw.pess, rw["mode"]) + (rnd.random() < rw.p_fail) * rnd.expovariate(1 / rw.mttr)
        return fin["E_양산 승인"]
    loop = np.array([one_run() for _ in range(6000)])
    se = np.sqrt(loop.var() / len(loop) + done.var() / len(done))
    assert abs(loop.mean() - done.mean()) < 4 * se, (loop.mean(), done.mean())
    mean_exact = sv["viol_per_year"] * np.mean(sv["reduction"]) * np.mean(sv["cost_per_lot"])  # 독립성 -> E[곱] = 곱의 E
    assert abs(sav.mean() - mean_exact) < 4 * sav.std() / np.sqrt(len(sav)), (sav.mean(), mean_exact)
    big = np.percentile(simulate_savings(sv, 400000, seed=99), 10)
    assert abs(big - s["p10"]) / big < 0.08, "N=2만과 N=40만의 p10 이 크게 다름(표본 부족)"
    print(f"HARD CHECK OK: 경계 [{lo:.0f},{hi:.0f}]일 · 시드 재현 · 삼각분포 분위수 · 반복문 교차검증 · 절감액 평균(해석값 {mean_exact:.1f}) · 수렴")
