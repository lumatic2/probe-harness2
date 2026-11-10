"""대기행렬과 운영 곡선 대기행렬 · 리틀의 법칙 · 운영 곡선(가동률 vs 사이클타임). Kingman / Allen-Cunneen 근사를 직접 구현.
입력(DataFrame) stations: station(이름), m(병렬 장비 수), te(평균 공정시간, 시간), visits(LOT 1개당 방문 횟수), ca2(도착 변동계수^2), cs2(공정 변동계수^2)
       + 공장 투입률 lam(LOT/시간)
실행: python queueing_operating_curve.py
"""
import math

import numpy as np
import pandas as pd
from scipy.optimize import brentq


def erlang_c(m, a):
    """a = λ/μ (제공 부하). 대기 확률 P(wait) 의 Erlang C 공식."""
    s = sum(a ** k / math.factorial(k) for k in range(m))
    top = a ** m / (math.factorial(m) * (1 - a / m))
    return top / (s + top)


def wq(u, m, te, ca2=1.0, cs2=1.0):
    """평균 대기시간. m=1 이면 Kingman: (ca2+cs2)/2 * u/(1-u) * te. m>1 이면 Allen-Cunneen(Erlang C 에 변동 보정)."""
    if m == 1:
        return (ca2 + cs2) / 2 * u / (1 - u) * te
    return erlang_c(m, u * m) / (m * (1 - u)) * te * (ca2 + cs2) / 2


def curve(te=1.0, m=1, ca2=1.0, cs2=1.0, us=np.arange(0.5, 0.991, 0.01)):
    """운영 곡선 데이터: utilization, cycle_time, x_factor(=사이클타임/순수공정시간). 웹 대시보드가 이 표를 그린다."""
    ct = np.array([wq(u, m, te, ca2, cs2) + te for u in us])
    return pd.DataFrame({"utilization": us.round(2), "cycle_time": ct, "x_factor": ct / te})


def network(stations, lam):
    """직렬 워크센터 + 재진입. 장비군별 가동률·대기·사이클타임과 공장 전체 WIP(리틀)."""
    df = stations.copy()
    df["util"] = lam * df.visits * df.te / df.m
    assert (df.util < 1).all(), f"과부하: {df.loc[df.util >= 1, 'station'].tolist()}"
    df["wq"] = [wq(r.util, r.m, r.te, r.ca2, r.cs2) for r in df.itertuples()]
    df["ct_total"] = df.visits * (df.wq + df.te)
    return df, df.ct_total.sum(), lam * df.ct_total.sum()  # 표, 공장 사이클타임(시간), WIP(LOT) = lam * CT


def simulate_gg1(lam, mu, cs2, n, seed, ca2=1.0):
    """독립 검증용 Lindley 재귀 시뮬레이션(도착·공정 모두 감마, ca2=1 이면 지수). 반환 (도착, 퇴장)."""
    rng = np.random.default_rng(seed)
    a = np.cumsum(rng.gamma(1 / ca2, ca2 / lam, n))
    s = rng.gamma(1 / cs2, cs2 / mu, n)
    d = np.empty(n); prev = 0.0
    for i in range(n):
        prev = max(a[i], prev) + s[i]; d[i] = prev
    return a, d


if __name__ == "__main__":
    st = pd.DataFrame([("PHOTO", 3, 0.20, 2, 1.0, 0.6), ("ETCH", 4, 0.30, 2, 1.0, 0.8), ("CMP", 2, 0.25, 1, 1.0, 0.5)],
                      columns=["station", "m", "te", "visits", "ca2", "cs2"])
    for lam in (4.0, 5.5, 6.3):
        tab, ct, wip = network(st, lam)
        print(f"[투입 {lam}/시간] 공장 CT={ct:.2f}h, WIP={wip:.1f}LOT, 병목 가동률={tab.util.max():.0%}({tab.loc[tab.util.idxmax(), 'station']})")
    print(tab[["station", "util", "wq", "ct_total"]].round(3).to_string(index=False))
    cv = curve()
    for u in (0.80, 0.90, 0.95):
        print(f"[단일 장비 곡선] 가동률 {u:.0%} -> 사이클타임 {cv.set_index('utilization').loc[u, 'cycle_time']:.1f} x 공정시간")
    for x in (2, 3, 5, 10):  # 사이클타임이 공정시간의 x 배가 되는 가동률 (M/M/1 이면 u = 1 - 1/x)
        print(f"  X-factor {x}배 지점 = 가동률 {brentq(lambda u: wq(u, 1, 1.0) + 1 - x, 0.01, 0.999):.1%}")
    cv.to_csv("operating_curve.csv", index=False)
    # ---- 독립 하드체크 ----
    lam, mu = 0.7, 1.0  # 1) M/M/1 폐쇄형 W = 1/(μ-λ)
    assert abs(wq(0.7, 1, 1 / mu) + 1 / mu - 1 / (mu - lam)) < 1e-12
    for m, u in ((3, 0.8), (5, 0.9)):  # 2) Erlang C 를 출생-사망 정상분포 수치합으로 재계산한 값과 일치
        a = u * m; N = 400
        p = np.array([a ** k / math.factorial(k) if k <= m else a ** m / math.factorial(m) * u ** (k - m) for k in range(N)])
        p /= p.sum()
        l_q = sum((k - m) * p[k] for k in range(m, N))  # 대기열 평균 길이 -> Little: Wq = Lq / λ
        assert abs(l_q / (a / 1.0) - wq(u, m, 1.0)) < 1e-6, (m, u)
    for ca2, cs2, tol in ((1.0, 1.0, 0.04), (1.0, 0.25, 0.04), (0.5, 0.5, 0.12)):  # 3) 시뮬레이션과 비교 + 4) 리틀 법칙(사건 스윕으로 따로 계산)
        arr, dep = simulate_gg1(0.8, 1.0, cs2, 300_000, seed=3, ca2=ca2)
        w_sim, w_ap = (dep - arr).mean(), wq(0.8, 1, 1.0, ca2, cs2) + 1
        ev_t = np.concatenate([arr, dep]); ev_d = np.concatenate([np.ones(len(arr)), -np.ones(len(dep))])
        o = np.argsort(ev_t, kind="stable"); t, n = ev_t[o], np.cumsum(ev_d[o])
        l_avg = (n[:-1] * np.diff(t)).sum() / (t[-1] - t[0])
        assert abs(l_avg - (len(arr) / (dep[-1] - arr[0])) * w_sim) < 0.02 * l_avg, "Little 법칙"
        assert abs(w_sim - w_ap) / w_sim < tol, (ca2, cs2, w_sim, w_ap)
        print(f"  [시뮬 vs 근사] ca2={ca2}, cs2={cs2}: W_sim={w_sim:.2f}, W_근사={w_ap:.2f} (오차 {abs(w_sim - w_ap) / w_sim:.1%})")
    d1 = np.diff(cv.cycle_time); assert (d1 > 0).all() and (np.diff(d1) > 0).all(), "곡선은 증가·볼록이어야 한다"
    assert wq(0.95, 1, 1.0) / wq(0.90, 1, 1.0) > 2 - 1e-9, "95% 는 90% 대기의 2배 이상"
    print("HARD CHECK OK: M/M/1 폐쇄형 · Erlang C(출생-사망 수치합) · 시뮬레이션 근사오차 · 리틀 법칙 · 곡선 증가/볼록")
