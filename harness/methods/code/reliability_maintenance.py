"""신뢰성과 보전 주기 신뢰성·보전 정책 — Weibull 적합(우측 중도절단 MLE, scipy) + 연령교체 모형의 보전 주기 U자 곡선.
실행: python reliability_maintenance.py
입력 DataFrame 컬럼: hours(운전시간 h: 고장까지 또는 PM·관측종료로 끊긴 시간), failed(1=고장, 0=중도절단).
비용: cp=계획 PM 1회 손실, cf=돌발 고장 1회 손실 (같은 단위, 예: 억원).
"""
import numpy as np
import pandas as pd
from scipy.optimize import brentq, minimize_scalar
from scipy.special import gamma, gammainc


def fit_weibull(df):
    """Weibull(β 형상, η 척도) 최대우도. 중도절단 포함: 형상 β 의 프로파일 방정식을 brentq 로 푼다."""
    t, f = df["hours"].to_numpy(float), df["failed"].to_numpy(bool)
    r, lt = f.sum(), np.log(t)
    g = lambda b: (t**b * lt).sum() / (t**b).sum() - 1 / b - lt[f].sum() / r
    beta = brentq(g, 0.05, 50)
    return beta, ((t**beta).sum() / r) ** (1 / beta)


def boot_beta_ci(df, n=300, seed=0):
    rng = np.random.default_rng(seed)
    bs = [fit_weibull(df.iloc[rng.integers(0, len(df), len(df))])[0] for _ in range(n)]
    return tuple(np.percentile(bs, [2.5, 97.5]))


def _uptime(T, beta, eta):  # ∫0^T R(t) dt (닫힌 형태)
    return eta / beta * gamma(1 / beta) * gammainc(1 / beta, (T / eta) ** beta)


def cost_rate(T, beta, eta, cp, cf):
    """연령교체: 가동 T 시간에 PM, 그 전에 고장 나면 돌발 수리. 시간당 기대비용 = 한 주기 기대비용 / 한 주기 기대길이."""
    R = np.exp(-((T / eta) ** beta))
    return (cp * R + cf * (1 - R)) / _uptime(T, beta, eta)


def optimal_age(beta, eta, cp, cf):
    """β≤1(고장률 비증가) 또는 cf≤cp 면 PM 이 이득이 없다(고장 나면 고치기)."""
    run_to_fail = cf / (eta * gamma(1 + 1 / beta))
    if beta <= 1 or cf <= cp:
        return None, run_to_fail
    res = minimize_scalar(lambda T: cost_rate(T, beta, eta, cp, cf), bounds=(1e-3 * eta, 10 * eta), method="bounded",
                          options={"xatol": 1e-9 * eta})
    return res.x, run_to_fail


def make_demo(seed=21, n=80, beta=2.5, eta=1000.0, horizon=1400.0):
    """합성 부품 수명: 진짜 Weibull(2.5, 1000h), 관측 종료 1400h + 임의 정지(PM) 일부 → 중도절단."""
    rng = np.random.default_rng(seed)
    life = eta * rng.weibull(beta, n)
    stop = np.where(rng.random(n) < 0.25, rng.uniform(200, horizon, n), horizon)
    return pd.DataFrame({"hours": np.minimum(life, stop), "failed": (life <= stop).astype(int)})


if __name__ == "__main__":
    CP, CF = 17.8, 74.2  # 억원: 계획 PM 2h, 돌발 8h+수리 — 병목 장비 시간당 8.9억(재무문서 §2-3 추정) 가정
    df = make_demo()
    beta, eta = fit_weibull(df)
    lo, hi = boot_beta_ci(df)
    Tstar, rtf = optimal_age(beta, eta, CP, CF)
    cmin = cost_rate(Tstar, beta, eta, CP, CF)
    print(f"표본 {len(df)}개 (고장 {int(df.failed.sum())}, 중도절단 {int((1 - df.failed).sum())})  β={beta:.2f} [{lo:.2f},{hi:.2f}]  η={eta:.0f}h  MTBF={eta * gamma(1 + 1 / beta):.0f}h")
    print("PM 주기(h) → 시간당 기대비용(억원/h)")
    for T in (0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 4.0):
        print(f"  {T * Tstar:7.0f} ({T:>4}×T*) {cost_rate(T * Tstar, beta, eta, CP, CF):.4f}")
    print(f"최적 PM 주기 T*={Tstar:.0f}h  비용률 {cmin:.4f} vs 고장나면수리 {rtf:.4f} → 연 절감 {(rtf - cmin) * 8760:.0f}억원(병목 가정·추정)")

    # ---- 독립 하드체크 ----
    # (1) 적합: 중도절단 없는 사본을 scipy 내장 적합(weibull_min.fit)과 비교 + 진짜 모수 회수
    from scipy.stats import weibull_min
    full = pd.DataFrame({"hours": 1000 * np.random.default_rng(5).weibull(2.5, 400), "failed": 1})
    b1, e1 = fit_weibull(full)
    c, _, s = weibull_min.fit(full["hours"], floc=0)
    assert abs(b1 - c) / c < 1e-3 and abs(e1 - s) / s < 1e-3, (b1, c, e1, s)
    assert lo < 2.5 < hi and abs(eta - 1000) / 1000 < 0.08
    # (2) 수치적분(quad) 으로 가동시간 적분 재계산
    from scipy.integrate import quad
    num = quad(lambda t: np.exp(-((t / eta) ** beta)), 0, Tstar)[0]
    assert abs(num - _uptime(Tstar, beta, eta)) < 1e-8
    # (3) 1계 조건: h(T)·∫R − F(T) = cp/(cf−cp) 가 T* 에서 성립 (비용 최소화 코드와 다른 식)
    F = 1 - np.exp(-((Tstar / eta) ** beta))
    foc = beta / eta * (Tstar / eta) ** (beta - 1) * _uptime(Tstar, beta, eta) - F
    assert abs(foc - CP / (CF - CP)) < 1e-5, foc
    # (4) 몬테카를로 갱신 시뮬레이션: 정책을 직접 굴려 비용률 비교 (U자: 양쪽 모두 T* 보다 나쁨)
    rng = np.random.default_rng(8)
    L = eta * rng.weibull(beta, 1_000_000)
    mc = lambda T: np.where(L < T, CF, CP).sum() / np.minimum(L, T).sum()
    assert abs(mc(Tstar) - cmin) / cmin < 0.02, (mc(Tstar), cmin)
    assert mc(0.5 * Tstar) > mc(Tstar) * 1.05 and mc(2 * Tstar) > mc(Tstar) * 1.05
    # (5) 경계: β≤1 이면 PM 불가(None), T→∞ 극한은 고장나면수리 비용률
    assert optimal_age(0.9, eta, CP, CF)[0] is None
    assert abs(cost_rate(50 * eta, beta, eta, CP, CF) - rtf) / rtf < 1e-6
    print("하드체크 통과")
