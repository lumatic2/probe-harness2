"""병목 분석 TOC·병목 분석 — 장비군 가동률, 병목 찾기, 처리량 회계(T = 매출 - 완전변동비) 연결.

실행: python toc_bottleneck.py   (numpy, scipy, pandas 만 필요)
입력 DataFrame 3개 (합성값 — 현업 값으로 교체하는 칸):
  stations: group(장비군) · tools(대수) · availability(가용률 0~1)
  routes  : product · group · hours_per_wafer(웨이퍼 1장이 그 장비군을 쓰는 총 시간, 레이어 반복 포함)
  products: product · price(만원/장) · var_cost(만원/장, 완전변동비) · max_demand(장/주)
"""
import numpy as np
import pandas as pd
from scipy.optimize import linprog

HOURS_PER_WEEK = 168


def make_data():
    stations = pd.DataFrame({"group": ["Litho", "Etch", "CVD", "CMP", "Implant"],
                             "tools": [4, 6, 5, 3, 3],
                             "availability": [0.85, 0.90, 0.90, 0.92, 0.90]})
    hrs = {"A": [0.35, 0.40, 0.30, 0.12, 0.10], "B": [0.50, 0.35, 0.35, 0.15, 0.05],
           "C": [0.25, 0.50, 0.45, 0.20, 0.10]}
    routes = pd.DataFrame([(p, g, h) for p, hs in hrs.items() for g, h in zip(stations.group, hs)],
                          columns=["product", "group", "hours_per_wafer"])
    price = {"A": 3450, "B": 3000, "C": 2200}  # A 는 재무 문서 §2-1 추정 웨이퍼당 매출, B·C 는 합성
    products = pd.DataFrame({"product": list(price), "price": list(price.values()),
                             "var_cost": [p * 0.063 for p in price.values()],  # 완전변동비율 6.3% (재무 §3-5)
                             "max_demand": [1000, 700, 900]})
    return stations, routes, products


def matrices(stations, routes, products):
    cap = (stations.tools * stations.availability * HOURS_PER_WEEK).to_numpy()
    H = routes.pivot(index="group", columns="product", values="hours_per_wafer")
    H = H.loc[stations.group, products["product"]].to_numpy()  # (장비군, 제품)
    T = (products.price - products.var_cost).to_numpy()  # 처리량 T / 장
    return cap, H, T, products.max_demand.to_numpy(float)


def solve_mix(cap, H, T, dmax):
    """처리량 T 최대화 LP. 반환: 투입량 x, 총 T, 제약별 그림자가격(만원/장비시간)."""
    r = linprog(-T, A_ub=np.vstack([H, np.eye(len(T))]), b_ub=np.r_[cap, dmax], method="highs")
    assert r.status == 0
    return r.x, -r.fun, -r.ineqlin.marginals[:len(cap)]


def proportional_plan(cap, H, dmax):
    """기준선: 수요 비율대로 투입하되 가장 빡빡한 장비군에서 멈춤(병목을 모르는 계획)."""
    return dmax * min(1.0, (cap / (H @ dmax)).min())


def utilization(x, cap, H):
    return (H @ x) / cap


def hard_check(cap, H, T, dmax, x, t_opt, shadow, groups):
    assert (H @ x <= cap + 1e-6).all() and (x <= dmax + 1e-6).all() and (x >= -1e-9).all()  # 가능해 재계산
    step = 20.0  # 격자 전수 탐색(LP 와 다른 경로): 격자 최적 <= LP 최적, 차이는 반올림 한계 이내
    g = [np.arange(0, d + step, step) for d in dmax]
    X = np.stack(np.meshgrid(*g, indexing="ij"), -1).reshape(-1, len(dmax))
    ok = ((X @ H.T) <= cap).all(1) & (X <= dmax).all(1)
    best = (X[ok] @ T).max()
    assert best <= t_opt + 1e-6 and t_opt - best <= step * T.sum(), (best, t_opt)
    for i, name in enumerate(groups):  # 그림자가격 = 용량 +1시간을 넣고 다시 풀었을 때의 T 증가
        c2 = cap.copy(); c2[i] += 1.0
        gain = solve_mix(c2, H, T, dmax)[1] - t_opt
        assert abs(gain - shadow[i]) < 1e-6 * max(1, t_opt), (name, gain, shadow[i])
        if H[i] @ x < cap[i] - 1e-6:  # 비병목: 시간을 더 줘도 처리량 0
            assert abs(gain) < 1e-6, name
    return best


if __name__ == "__main__":
    stations, routes, products = make_data()
    cap, H, T, dmax = matrices(stations, routes, products)
    groups = list(stations.group)
    x_base = proportional_plan(cap, H, dmax)
    x_opt, t_opt, shadow = solve_mix(cap, H, T, dmax)
    rep = pd.DataFrame({"group": groups, "cap_h_wk": cap.round(1),
                        "util_base": utilization(x_base, cap, H).round(3),
                        "util_opt": utilization(x_opt, cap, H).round(3),
                        "shadow_man_per_h": shadow.round(1)})
    rep["bottleneck"] = np.where(rep.util_opt >= 0.999, "<-- 병목", "")
    print(rep.to_string(index=False))
    t_base = T @ x_base
    print("\n투입(장/주) 기준선", {k: round(float(v)) for k, v in zip(products["product"], x_base)},
          "\n투입(장/주) 최적  ", {k: round(float(v)) for k, v in zip(products["product"], x_opt)})
    print(f"처리량 T: 기준선 {t_base:,.0f} -> 최적 {t_opt:,.0f} 만원/주 "
          f"(+{(t_opt - t_base) * 52 / 1e4:,.1f}억원/년, 합성 가정값)")
    top = rep.loc[rep.shadow_man_per_h.idxmax()]
    print(f"병목 {top.group} 용량 1시간 = 공장 처리량 {top.shadow_man_per_h:,.0f} 만원/주")
    best = hard_check(cap, H, T, dmax, x_opt, t_opt, shadow, groups)
    print(f"HARD CHECK OK: 용량·수요 가능성 재계산 · 격자 전수 {best:,.0f} <= LP {t_opt:,.0f} · "
          f"그림자가격 = 용량+1h 재풀이 ({len(groups)}개 장비군)")
