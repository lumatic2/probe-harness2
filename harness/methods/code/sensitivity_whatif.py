"""민감도 분석 민감도·what-if — OAT 토네이도 데이터, 결론이 뒤집히는 임계(break-even) 가정.

실행: python sensitivity_whatif.py   (numpy, scipy, pandas 만 필요)
입력: `base` dict (가정값 이름 -> 값) + `model(params)->KPI 숫자` 함수.
  이 파일의 예시는 「Q-Time 위반 예측 서비스 도입」 NPV (재무 문서 §3-6 의 가정 그대로, 단위 억원).
  capex 도입비 · opex 연 운영비 · lots 연 회피 랏 수 · lot_value 랏당 손실(억) ·
  recognition 인정률(0~1) · rate 할인율 · years 평가 연수(정수)
현장에서는 model 만 솔버 호출(예: CP-SAT 재실행 -> KPI)로 바꿔 끼우면 된다.
"""
import numpy as np
import pandas as pd
from scipy.optimize import brentq

BASE = dict(capex=10.0, opex=5.0, lots=4.0, lot_value=8.625,  # 25장 x 3,450만원 (재무 §2-5, 추정)
            recognition=30 / 34.5, rate=0.08, years=3)
INTEGER = {"years"}


def npv(p):
    """연도별 현금흐름을 직접 할인해 합산 (닫힌 식과 다른 경로)."""
    cf = p["lots"] * p["lot_value"] * p["recognition"] - p["opex"]
    return -p["capex"] + sum(cf / (1 + p["rate"]) ** t for t in range(1, int(p["years"]) + 1))


def perturb(name, v, pct):
    w = v * (1 + pct)
    return max(1, round(w)) if name in INTEGER else w


def tornado(model, base, pct=0.20):
    """OAT: 가정 하나씩 -pct/+pct 로 흔들어 KPI 범위를 구하고 흔들림 큰 순으로 정렬."""
    rows = []
    for k, v in base.items():
        lo, hi = (model({**base, k: perturb(k, v, s * pct)}) for s in (-1, +1))
        rows.append(dict(assumption=k, base=v, kpi_low=lo, kpi_high=hi, swing=abs(hi - lo)))
    return pd.DataFrame(rows).sort_values("swing", ascending=False, ignore_index=True)


def breakeven(model, base, name, span=(0.01, 10.0)):
    """KPI=0 이 되는 가정값 (결론이 뒤집히는 임계). 범위 안에서 부호가 안 바뀌면 None."""
    f = lambda x: model({**base, name: x})
    a, b = base[name] * span[0], base[name] * span[1]
    return brentq(f, a, b, xtol=1e-12) if f(a) * f(b) < 0 else None


def hard_check(model, base, tor, be):
    ann = lambda r, n: (1 - (1 + r) ** -n) / r  # 연금 닫힌 식
    closed = -base["capex"] + (base["lots"] * base["lot_value"] * base["recognition"] - base["opex"]) \
        * ann(base["rate"], base["years"])
    assert abs(closed - model(base)) < 1e-9
    for name, x in be.items():  # 임계값을 되꽂으면 KPI 가 0, 임계 양쪽에서 부호가 갈린다
        if x is not None:
            assert abs(model({**base, name: x})) < 1e-6, name
            s = [np.sign(model({**base, name: x * (1 + e)})) for e in (-1e-3, 1e-3)]
            assert s[0] != s[1], name
    # 닫힌 식 임계: lot_value* = (capex/ann + opex) / (lots x recognition)
    lv = (base["capex"] / ann(base["rate"], base["years"]) + base["opex"]) / (base["lots"] * base["recognition"])
    assert abs(be["lot_value"] - lv) < 1e-9, (be["lot_value"], lv)
    assert tor.swing.is_monotonic_decreasing and len(tor) == len(base)
    return lv


if __name__ == "__main__":
    pd.set_option("display.width", 140, "display.float_format", "{:,.2f}".format)
    kpi0 = npv(BASE)
    print(f"기준 NPV = {kpi0:,.1f}억원 (결론: {'도입' if kpi0 > 0 else '보류'})\n")
    tor = tornado(npv, BASE)
    print("== 토네이도 (각 가정 +-20%, 정수 변수는 +-20% 반올림) ==")
    print(tor.to_string(index=False))
    be = {k: breakeven(npv, BASE, k) for k in BASE if k not in INTEGER}
    print("\n== 결론이 뒤집히는 임계 (NPV=0) ==")
    for k, x in be.items():
        if x is None:
            print(f"{k:12s} 기준 {BASE[k]:.3f} -> 0.01~10배 범위에서 안 뒤집힘")
        else:
            print(f"{k:12s} 기준 {BASE[k]:.3f} -> 임계 {x:.3f} ({(x / BASE[k] - 1) * 100:+.1f}%)")
    n_be = next((n for n in range(1, 31) if npv({**BASE, "years": n}) > 0), None)
    print(f"years        기준 {BASE['years']} -> 첫 NPV>0 연수 {n_be}")
    print("\n== 2변수 what-if: NPV 부호 (행 lot_value, 열 연 회피 랏 수) ==")
    grid = pd.DataFrame({f"{n}랏": [("+" if npv({**BASE, "lot_value": v, "lots": n}) > 0 else "-") for v in
                                    (1.45, 3.0, 5.0, 8.625)] for n in (1, 2, 4, 6)},
                        index=["1.45(원가)", "3.0", "5.0", "8.625(기회비용)"])
    print(grid.to_string())
    lv = hard_check(npv, BASE, tor, be)
    print(f"HARD CHECK OK: NPV 닫힌 식 일치 · 임계 되꽂기 0 · 임계 양쪽 부호 반전 · lot_value 임계 닫힌 식 {lv:.4f}")
