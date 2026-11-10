"""선형·정수계획 선형·정수계획: 장비군 용량 아래 제품 믹스 최대화 + 쌍대가격(그림자 가격). 솔버 = highspy.
입력(DataFrame):
  products: product, margin(만원/웨이퍼), demand_max(웨이퍼/주)
  usage:    product, group, hours(시간/웨이퍼)
  capacity: group, hours(시간/주)
실행: python lp_mip.py
"""
import highspy
import numpy as np
import pandas as pd
from scipy.optimize import linprog


def make_data():
    """합성 데이터(수치는 전부 가정): 4제품 x 4장비군. margin 은 재무 문서 §3-1 의 '매출-변동비' 꼴을 흉내 낸 값."""
    products = pd.DataFrame({"product": ["DRAM-A", "DRAM-B", "HBM-D", "NAND-A"],
                             "margin": [3230, 2600, 5200, 1500], "demand_max": [900, 700, 300, 800]})
    g = ["PHOTO", "ETCH", "CVD", "CMP"]
    h = {"DRAM-A": [0.50, 0.30, 0.25, 0.15], "DRAM-B": [0.40, 0.35, 0.30, 0.20],
         "HBM-D": [0.90, 0.50, 0.60, 0.40], "NAND-A": [0.30, 0.25, 0.20, 0.10]}
    usage = pd.DataFrame([dict(product=p, group=gg, hours=v) for p, vs in h.items() for gg, v in zip(g, vs)])
    capacity = pd.DataFrame({"group": g, "hours": [760.0, 700.0, 600.0, 400.0]})
    return products, usage, capacity


def build(products, usage, capacity):
    """행렬 꼴 max c.x  s.t. A x <= b, x >= 0. 행 = 장비군 용량 + 제품 수요상한. 반환 (c, A, b, 행이름)."""
    P, G = list(products["product"]), list(capacity["group"])
    u = usage.pivot(index="group", columns="product", values="hours").loc[G, P].to_numpy()
    A = np.vstack([u, np.eye(len(P))])
    b = np.concatenate([capacity["hours"].to_numpy(), products["demand_max"].to_numpy(float)])
    return products["margin"].to_numpy(float), A, b, [f"cap:{g}" for g in G] + [f"dem:{p}" for p in P]


def solve(c, A, b, integer=False, step=1.0):
    """highspy 로 푼다. integer=True 면 변수를 step(웨이퍼) 단위의 정수 개수(예: 25장 LOT)로 본다. 반환 (x, obj, 행 쌍대가격)."""
    h = highspy.Highs()
    h.setOptionValue("output_flag", False)
    n = len(c)
    for j in range(n):
        h.addVar(0.0, highspy.kHighsInf)
        h.changeColCost(j, float(c[j]) * step)
        if integer:
            h.changeColIntegrality(j, highspy.HighsVarType.kInteger)
    for i in range(len(b)):
        h.addRow(-highspy.kHighsInf, float(b[i]), n, np.arange(n, dtype=np.int32), (A[i] * step).astype(float))
    h.changeObjectiveSense(highspy.ObjSense.kMaximize)
    h.run()
    assert h.getModelStatus() == highspy.HighsModelStatus.kOptimal
    sol = h.getSolution()
    x = np.array(sol.col_value) * step
    dual = np.array(sol.row_dual) if not integer else np.full(len(b), np.nan)  # MIP 는 쌍대가격이 정의되지 않는다
    return x, float(h.getInfo().objective_function_value), dual


def report(products, c, A, b, names, x, obj, dual):
    plan = pd.DataFrame({"product": products["product"], "wafers": x.round(1), "margin_total": (c * x).round(0)})
    slack = b - A @ x
    shadow = pd.DataFrame({"row": names, "rhs": b, "slack": slack.round(3), "shadow_price": dual.round(2)})
    shadow["binding"] = shadow.slack.abs() < 1e-6
    return plan, shadow


if __name__ == "__main__":
    products, usage, capacity = make_data()
    c, A, b, names = build(products, usage, capacity)
    x, obj, dual = solve(c, A, b)
    plan, shadow = report(products, c, A, b, names, x, obj, dual)
    print(f"[LP] 주간 총마진 = {obj:,.0f} 만원"); print(plan.to_string(index=False))
    print("[쌍대가격] 용량 1시간(수요상한 1장) 늘릴 때 늘어나는 마진, 만원"); print(shadow.to_string(index=False))
    xi, obji, _ = solve(c, A, b, integer=True, step=25.0)  # LOT(25장) 단위 정수
    print(f"[MIP 25장 LOT 단위] 총마진 = {obji:,.0f} 만원 (LP 대비 -{obj - obji:,.0f}), LOT 수 = {(xi / 25).round().astype(int).tolist()}")
    # ---- 독립 하드체크: 다른 솔버 경로(scipy linprog)와 수학적 조건으로 재검사 ----
    assert (x >= -1e-7).all() and (A @ x <= b + 1e-6).all(), "1차 가능성 위반"
    ref = linprog(-c, A_ub=A, b_ub=b, bounds=(0, None), method="highs")
    assert abs(-ref.fun - obj) < 1e-4 * max(1, obj), "linprog 목적값 불일치"
    assert (dual >= -1e-7).all() and (A.T @ dual >= c - 1e-6).all(), "쌍대 가능성 위반"
    assert abs(b @ dual - obj) < 1e-4 * max(1, obj), "강쌍대성(b.y = 목적값) 불일치"
    assert np.allclose(dual, -ref.ineqlin.marginals, atol=1e-6), "linprog 쌍대가격 불일치"
    for i in range(len(names)):  # 유한 차분: 우변을 실제로 1 늘려 다시 풀면 목적값이 쌍대가격만큼 오르는가
        b2 = b.copy(); b2[i] += 1.0
        gain = solve(c, A, b2)[1] - obj
        assert abs(gain - dual[i]) < 1e-3 + 0.02 * abs(dual[i]) or dual[i] < 1e-9 and gain < 1e-6, (names[i], gain, dual[i])
    assert (np.abs(xi / 25 - np.round(xi / 25)) < 1e-6).all() and (A @ xi <= b + 1e-6).all() and obji <= obj + 1e-6
    assert (dual[(b - A @ x) > 1e-6] < 1e-9).all(), "여유 있는 제약의 쌍대가격은 0 이어야 한다(상보 슬랙)"
    print("HARD CHECK OK: 1차·쌍대 가능성 · 강쌍대성 · linprog 일치 · 유한차분 · MIP 정수·가능성 · 상보 슬랙")
