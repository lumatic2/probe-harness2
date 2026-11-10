"""재고 정책 재고: EOQ · 안전재고 · (s,S) — 서비스수준 vs 재고비용 곡선.

실행: python inventory_eoq.py   (numpy, scipy, pandas 만 필요)
입력 DataFrame `parts` 컬럼:
  part            부품명
  annual_demand   연 수요 (개/년)
  order_cost      1회 발주 고정비 (원/회)
  unit_cost       단가 (원/개)
  hold_rate       연 보관비율 (/년, 단가 대비)
  lead_time_days  리드타임 (일)
  daily_std       일 수요 표준편차 (개/일)
"""
import numpy as np
import pandas as pd
from scipy.stats import norm

SEED = 11
LEVELS = [0.90, 0.95, 0.98, 0.99, 0.995, 0.999]


def make_parts(seed=SEED):
    """합성 예비부품 4종 (가정값 — 현업 값으로 교체하는 칸)."""
    rng = np.random.default_rng(seed)
    n = 4
    mean_d = rng.uniform(2, 6, n)  # 개/일
    return pd.DataFrame({
        "part": [f"PART-{i + 1}" for i in range(n)],
        "annual_demand": np.round(mean_d * 365),
        "order_cost": rng.choice([100_000, 150_000, 200_000], n),
        "unit_cost": rng.choice([800_000, 2_000_000, 5_000_000], n),
        "hold_rate": 0.20,
        "lead_time_days": rng.choice([7, 14, 21], n),
        "daily_std": np.round(mean_d * 0.5, 2),
    })


def eoq(D, K, h):
    """경제적 주문량 Q* = sqrt(2DK/h), h = 단가×보관비율 (원/개/년)."""
    return np.sqrt(2 * D * K / h)


def loss_fn(z):
    """표준정규 손실함수 G(z) = pdf(z) - z(1-cdf(z)) : 리드타임 중 평균 부족량(σ 단위)."""
    return norm.pdf(z) - z * (1 - norm.cdf(z))


def curve(row, levels=LEVELS):
    """서비스수준(주기 서비스수준 α) 별 안전재고·재주문점·연 재고비용·충족률."""
    D, h = row.annual_demand, row.unit_cost * row.hold_rate
    q = eoq(D, row.order_cost, h)
    mu_l = D / 365 * row.lead_time_days
    sig_l = row.daily_std * np.sqrt(row.lead_time_days)
    out = []
    for a in levels:
        z = norm.ppf(a)
        ss = z * sig_l
        out.append(dict(part=row.part, alpha=a, Q=q, safety_stock=ss, s=mu_l + ss,
                        S=mu_l + ss + q,  # (s,S) 에서 S = s + Q
                        annual_cost=h * (q / 2 + ss) + row.order_cost * D / q,
                        fill_rate=1 - sig_l * loss_fn(z) / q))
    return pd.DataFrame(out)


def simulate_sS(row, s, S, days=200_000, seed=SEED):
    """일 단위 (s,S) 재고 시뮬레이션(백오더 허용) → 충족률. 해석식과 다른 코드 경로."""
    rng = np.random.default_rng(seed)
    mu = row.annual_demand / 365
    d = np.maximum(0, np.round(rng.normal(mu, row.daily_std, days)))
    L = int(row.lead_time_days)
    on_hand, pipeline, served = S, {}, 0.0
    for t in range(days):
        on_hand += pipeline.pop(t, 0)
        served += min(d[t], max(on_hand, 0))
        on_hand -= d[t]
        ip = on_hand + sum(pipeline.values())
        if ip <= s:  # 재고위치가 s 이하면 S 까지 발주
            pipeline[t + L] = pipeline.get(t + L, 0) + (S - ip)
    return served / d.sum()


def hard_check(parts, curves):
    for row in parts.itertuples():
        h = row.unit_cost * row.hold_rate
        tc = lambda q: row.order_cost * row.annual_demand / q + h * q / 2
        q_star = eoq(row.annual_demand, row.order_cost, h)
        grid = np.linspace(q_star * 0.3, q_star * 3, 5001)  # 격자 탐색으로 EOQ 재검사
        assert abs(grid[np.argmin([tc(q) for q in grid])] - q_star) / q_star < 0.01, row.part
        # 평평한 바닥: Q 가 20% 틀려도 비용은 ½(1.2+1/1.2)=1.0167 배
        assert abs(tc(1.2 * q_star) / tc(q_star) - 0.5 * (1.2 + 1 / 1.2)) < 1e-9
        c = curves[curves.part == row.part]
        assert c.safety_stock.is_monotonic_increasing and c.annual_cost.is_monotonic_increasing
        assert np.allclose(norm.cdf(c.safety_stock / (row.daily_std * np.sqrt(row.lead_time_days))), c.alpha)
    r = parts.iloc[0]
    c = curves[(curves.part == r.part) & (curves.alpha == 0.99)].iloc[0]
    sim = simulate_sS(r, c.s, c.S)
    assert abs(sim - c.fill_rate) < 0.01, (sim, c.fill_rate)  # 시뮬레이션 vs 해석 충족률
    return sim, c.fill_rate


if __name__ == "__main__":
    parts = make_parts()
    curves = pd.concat([curve(r) for r in parts.itertuples()], ignore_index=True)
    pd.set_option("display.width", 160, "display.float_format", "{:,.2f}".format)
    print("== 부품별 EOQ ==")
    print(curves.groupby("part").first()[["Q"]].join(parts.set_index("part")[["annual_demand", "unit_cost"]]))
    p1 = curves[curves.part == "PART-1"]
    print("\n== PART-1 서비스수준 vs 재고비용 곡선 ==")
    show = p1[["alpha", "safety_stock", "s", "S", "annual_cost", "fill_rate"]].copy()
    show["alpha"], show["fill_rate"] = show.alpha.map("{:.3f}".format), show.fill_rate.map("{:.5f}".format)
    print(show.to_string(index=False))
    lo, hi = p1[p1.alpha == 0.99].iloc[0], p1[p1.alpha == 0.999].iloc[0]
    print(f"\n서비스수준 99% -> 99.9%: 안전재고 +{hi.safety_stock - lo.safety_stock:.1f}개, "
          f"연 비용 +{(hi.annual_cost - lo.annual_cost) / 1e6:,.1f}백만원 (합성 가정값)")
    sim, ana = hard_check(parts, curves)
    print(f"HARD CHECK OK: EOQ 격자탐색 일치 · 곡선 단조 · 충족률 시뮬 {sim:.4f} vs 해석 {ana:.4f}")
