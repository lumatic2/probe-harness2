"""계측 샘플 배분 밴딧 + 경험적 베이즈 계측 샘플 배분: 한정된 계측 슬롯을 어느 장비/챔버 군에 줄지 정한다(Thompson / Bayes-UCB).
입력 DataFrame arms(군당 1행): arm · cap(라운드당 받을 수 있는 최대 슬롯) · n_measured(누적 계측 수) · n_defect(누적 검출 수)
라운드마다 allocate() → 계측 → 결과를 n_measured/n_defect 에 더한다. 시뮬레이션용 true_rate 는 현장에는 없다.
실행: python bandit_sampling.py   (합성 데이터)
"""
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.stats import beta, betabinom


def fit_prior_moments(n, x):
    """경험적 베이즈(모멘트법, 빠름): 군별 불량률의 사전분포 Beta(a,b) 를 군 전체 관측으로 추정한다."""
    n, x = np.asarray(n, float), np.asarray(x, float)
    ok = n > 0
    m = min(max(x[ok].sum() / n[ok].sum(), 1e-3), 0.5)  # 관측이 전부 0 이어도 사전 평균이 0 이 되지 않게
    v = np.sum(n[ok] * ((x[ok] / n[ok] - m) ** 2 - m * (1 - m) / n[ok])) / n[ok].sum()  # 참 분산 = 관측 분산 - 표본 잡음
    v = min(max(v, 1e-5), m * (1 - m) * 0.95)
    k = m * (1 - m) / v - 1
    return m * k, (1 - m) * k


def fit_prior_mle(n, x):
    """경험적 베이즈(주변우도 최대화, 느리지만 정석): 베타-이항 로그우도를 scipy 로 최적화."""
    a0, b0 = fit_prior_moments(n, x)
    f = lambda th: -betabinom.logpmf(np.asarray(x), np.asarray(n), np.exp(th[0]), np.exp(th[1])).sum()
    r = minimize(f, np.log([a0, b0]), method="L-BFGS-B", bounds=[(-3, 7)] * 2)  # 사전 강도 e^7 ≈ 1100 이상은 '군 차이 없음'으로 본다
    return tuple(np.exp(r.x))


def allocate(n, x, budget, cap, rng, policy="thompson", prior=None, t=1):
    """한 라운드의 슬롯 배분. 군별 사후분포 Beta(a+x, b+n-x) 에서 슬롯마다 하나씩 뽑아 cap 안에서 채운다."""
    n, x, cap = np.asarray(n), np.asarray(x), np.asarray(cap)
    a, b = prior if prior else (1.0, 1.0)
    pa, pb = a + x, b + n - x
    take = np.zeros(len(n), int)
    for _ in range(budget):
        if policy == "thompson":
            score = rng.beta(pa, pb)
        elif policy == "ucb":  # Bayes-UCB: 사후분포의 상위 분위수. 이번 라운드에 이미 준 슬롯은 '결함 없음'으로 가정해 쏠림 방지
            score = beta.ppf(min(max(1 - 1 / (t + 1), 0.5), 0.99), pa, pb + take)
        else:  # random
            score = rng.random(len(n))
        score = np.where(take < cap, score, -np.inf)
        take[int(np.argmax(score))] += 1
    return take


def simulate(true_rate, cap, budget, rounds, policy, rng, eb=True):
    """한 번의 시뮬레이션. 반환 (군별 누적 n, x, 라운드 로그 DataFrame)."""
    K = len(true_rate)
    n, x, log = np.zeros(K, int), np.zeros(K, int), []
    for t in range(rounds):
        prior = fit_prior_moments(n, x) if (eb and t > 0 and n.sum() > 0) else None
        take = allocate(n, x, budget, cap, rng, policy if t > 0 else "random", prior, t + 1)  # 첫 라운드는 무작위(탐색)
        hit = rng.binomial(take, true_rate)
        n, x = n + take, x + hit
        log.append(dict(round=t, take=take.copy(), hit=hit.copy()))
    return n, x, log


def compare(true_rate, cap, budget, rounds=30, sims=100, seed=0):
    """정책별 평균 기대 검출 수(= Σ 슬롯×참불량률, 잡음 없는 지표)와 실제 검출 수를 반환."""
    out = {}
    for policy in ("random", "thompson", "ucb"):
        rng = np.random.default_rng(seed)
        exp, real = [], []
        for _ in range(sims):
            n, x, _ = simulate(true_rate, cap, budget, rounds, policy, rng, eb=policy != "random")
            exp.append(float((n * true_rate).sum())); real.append(int(x.sum()))
        out[policy] = (np.mean(exp), np.std(exp, ddof=1) / np.sqrt(sims), np.mean(real), np.array(exp))
    return out


if __name__ == "__main__":
    rng = np.random.default_rng(42)
    K = 12
    true_rate = np.sort(rng.beta(0.6, 14, K))[::-1]  # 불량률 평균 약 4%, 소수 군이 훨씬 높다(합성)
    cap = np.full(K, 8)
    print("군별 참불량률(합성):", np.round(true_rate, 3))
    print("슬롯/라운드  random  thompson  ucb  | thompson/random  ucb/random   (기대 검출 수, 100회 평균, 30라운드)")
    res = {}
    for B in (6, 12, 24, 48, 96):
        res[B] = compare(true_rate, cap, B)
        r = res[B]
        print(f"{B:>9}  {r['random'][0]:7.1f} {r['thompson'][0]:9.1f} {r['ucb'][0]:6.1f}  | {r['thompson'][0] / r['random'][0]:10.2f}x {r['ucb'][0] / r['random'][0]:12.2f}x")
    # 경험적 베이즈 수축 효과: 군별 소표본 추정의 오차 비교(독립 시험)
    n_small = rng.integers(3, 12, K)
    mse_raw = mse_eb = 0.0
    for _ in range(300):
        p = rng.beta(0.6, 14, K); xs = rng.binomial(n_small, p)
        a, b = fit_prior_moments(n_small, xs)
        mse_raw += np.mean((xs / n_small - p) ** 2); mse_eb += np.mean(((a + xs) / (a + b + n_small) - p) ** 2)
    print(f"소표본 군 추정 오차(MSE): 원 비율 {mse_raw / 300:.5f} → 경험적 베이즈 {mse_eb / 300:.5f}")
    n, x, log = simulate(true_rate, cap, 12, 30, "thompson", np.random.default_rng(1))
    n_r, x_r, _ = simulate(true_rate, cap, 48, 30, "random", np.random.default_rng(2), eb=False)  # 균등에 가까운 표본(편향 없음)으로 사전분포 추정
    a, b = fit_prior_mle(n_r, x_r)
    print(f"사전분포 추정(MLE) Beta({a:.2f},{b:.2f}) 평균 {a / (a + b):.3f} vs 실제 평균 {true_rate.mean():.3f} | 슬롯 상위3군 비중 {n[:3].sum() / n.sum():.0%}")
    # ---- 독립 하드체크 ----
    for t_ in log:  # (1) 로그 재집계: 라운드마다 슬롯 합 = 예산, cap 준수, 검출 ≤ 슬롯
        assert t_["take"].sum() == 12 and (t_["take"] <= cap).all() and (t_["hit"] <= t_["take"]).all()
    assert (np.sum([t_["take"] for t_ in log], 0) == n).all() and (np.sum([t_["hit"] for t_ in log], 0) == x).all()
    for B in (6, 12, 24):  # (2) 예산이 모자란 구간에서 두 정책 모두 무작위보다 유의하게 낫다(z>3)
        for pol in ("thompson", "ucb"):
            r = res[B]
            z = (r[pol][0] - r["random"][0]) / np.hypot(r[pol][1], r["random"][1])
            assert z > 3, (B, pol, z)
    gain = {B: res[B]["thompson"][0] / res[B]["random"][0] for B in res}
    assert abs(gain[96] - 1) < 1e-9 and abs(res[96]["ucb"][0] / res[96]["random"][0] - 1) < 1e-9, "전수 계측(예산=K×cap)이면 배분 이득은 정확히 0"
    assert mse_eb < mse_raw, "경험적 베이즈가 소표본 추정을 개선해야 한다"
    assert 0.3 < (a / (a + b)) / true_rate.mean() < 3, "MLE 사전 평균이 실제와 너무 다르다"
    print(f"HARD CHECK OK: 로그 재집계(슬롯 합=예산·cap 준수) · 부족 예산에서 두 정책 모두 무작위 대비 z>3 · 전수 계측이면 이득 정확히 0 · EB 수축 MSE 개선")
