"""관리도와 오경보 주기 SPC 관리도 + WECO 규칙 + ARL.  실행: python spc_weco_arl.py
입력 DataFrame 컬럼: time(측정 순서/시각), value(측정값).  기준선(Phase I)은 앞 baseline_n 점.
"""
import numpy as np
import pandas as pd
from scipy.stats import norm

RULES = {"R1": "3σ 밖 1점", "R2": "2σ 밖 2/3점(같은 쪽)", "R3": "1σ 밖 4/5점(같은 쪽)", "R4": "중심선 한쪽 연속 8점"}


def _wcount(b, w):
    """마지막 축(시간)으로 길이 w 창 안의 True 개수. 앞쪽 w-1 점은 가용 개수만큼."""
    c = np.cumsum(b, axis=-1, dtype=int)
    out = c.copy()
    out[..., w:] = c[..., w:] - c[..., :-w]
    return out


def rule_signals(z, rules=("R1", "R2", "R3", "R4")):
    """z = (값-중심)/σ.  1차원 또는 (반복, 시간) 2차원.  규칙별 불리언 배열 dict 를 돌려준다."""
    z = np.asarray(z, dtype=float)
    f = {
        "R1": np.abs(z) > 3,
        "R2": (_wcount(z > 2, 3) >= 2) | (_wcount(z < -2, 3) >= 2),
        "R3": (_wcount(z > 1, 5) >= 4) | (_wcount(z < -1, 5) >= 4),
        "R4": (_wcount(z > 0, 8) == 8) | (_wcount(z < 0, 8) == 8),
    }
    return {k: f[k] for k in rules}


def spc_chart(df, baseline_n=60, value_col="value", time_col="time"):
    """개별값 관리도.  σ = 이동범위 평균/1.128 (기준선 구간).  규칙 플래그와 알람 표시를 붙여 돌려준다."""
    x = df[value_col].to_numpy(float)
    base = x[:baseline_n]
    mu, sigma = base.mean(), np.abs(np.diff(base)).mean() / 1.128
    out = df[[time_col, value_col]].copy()
    out["z"] = (x - mu) / sigma
    for k, v in rule_signals(out["z"].to_numpy()).items():
        out[k] = v
    out["alarm"] = out[list(RULES)].any(axis=1)
    return out, {"mu": mu, "sigma": sigma, "UCL": mu + 3 * sigma, "LCL": mu - 3 * sigma}


def simulate_arl(rules, n_runs=20000, max_len=1500, seed=7):
    """관리 상태(N(0,1)) 에서 새로 시작해 첫 신호까지 점 수의 평균 = 시뮬레이션 ARL0."""
    rng = np.random.default_rng(seed)
    lens = []
    for _ in range(n_runs // 2000):
        sig = np.any(list(rule_signals(rng.standard_normal((2000, max_len)), rules).values()), axis=0)
        assert sig.any(axis=1).all(), "max_len 안에 신호가 없는 반복이 있다(절단)"
        lens.append(sig.argmax(axis=1) + 1)
    lens = np.concatenate(lens)
    return lens.mean(), lens.std(ddof=1) / np.sqrt(len(lens))


def make_demo(seed=11):
    """합성 FDC 센서값: 60점 기준선 + (이동 평균 +1.2σ, 스파이크, 점진 추세)."""
    rng = np.random.default_rng(seed)
    x = rng.normal(100, 2, 240)
    x[100:140] += 2.4          # 평균 이동 +1.2σ
    x[170] += 9.0              # 스파이크
    x[200:240] += np.linspace(0, 6, 40)  # 추세
    return pd.DataFrame({"time": pd.date_range("2026-11-11 09:30", periods=240, freq="min"), "value": x})


def ref_rules_loop(z):
    """하드체크용: 벡터화와 다른 경로(순수 파이썬 루프)로 4규칙을 다시 판정."""
    n, res = len(z), {k: [False] * len(z) for k in RULES}
    for i in range(n):
        res["R1"][i] = abs(z[i]) > 3
        for sgn in (1, -1):
            w3, w5, w8 = z[max(0, i - 2):i + 1], z[max(0, i - 4):i + 1], z[max(0, i - 7):i + 1]
            if sum(sgn * v > 2 for v in w3) >= 2: res["R2"][i] = True
            if sum(sgn * v > 1 for v in w5) >= 4: res["R3"][i] = True
            if len(w8) == 8 and all(sgn * v > 0 for v in w8): res["R4"][i] = True
    return {k: np.array(v) for k, v in res.items()}


if __name__ == "__main__":
    out, lim = spc_chart(make_demo())
    print(f"중심 {lim['mu']:.2f}  σ {lim['sigma']:.2f}  UCL {lim['UCL']:.2f}  LCL {lim['LCL']:.2f}")
    first = {k: (int(out.index[out[k]][0]) if out[k].any() else None) for k in RULES}
    print("규칙별 첫 신호 인덱스:", first, "| 알람 점 수:", int(out["alarm"].sum()), "/ R1 단독:", int(out["R1"].sum()))
    arl_all, se_all = simulate_arl(("R1", "R2", "R3", "R4"))
    arl_1, se_1 = simulate_arl(("R1",), n_runs=4000, max_len=6000)
    p1 = 2 * norm.sf(3)
    print(f"ARL0  R1 단독: 이론 {1 / p1:.1f} / 시뮬 {arl_1:.1f}±{se_1:.1f}  (NIST 371)")
    print(f"ARL0  4규칙 합: 시뮬 {arl_all:.2f}±{se_all:.2f}  (NIST 약 91.75)  → 오경보 주기 {arl_all:.0f}점마다 1번")

    # ---- 독립 하드체크 ----
    z = out["z"].to_numpy()
    ref = ref_rules_loop(z)
    for k in RULES:  # (1) 벡터화 규칙 == 순수 루프 규칙
        assert (out[k].to_numpy() == ref[k]).all(), f"{k} 판정 불일치"
    assert abs(1 / p1 - 370.4) < 0.1                           # (2) 3σ 이론 ARL = 1/0.0027
    assert abs(arl_1 - 370.4) < 4 * se_1 + 1e-9, arl_1         # (3) R1 단독 시뮬 ≈ 이론
    assert abs(arl_all - 91.75) < 4 * se_all + 1.0, arl_all    # (4) NIST 91.75 근사 재현
    assert arl_all < arl_1 / 3                                 # (5) 규칙을 켜면 오경보 주기가 크게 짧아진다
    assert out.loc[100:140, "alarm"].any() and out.loc[170, "R1"]  # (6) 심어 둔 이상(이동·스파이크)을 잡는다
    assert not out.loc[:59, "R1"].any()                        # 기준선 구간에 3σ 초과 없음(합성 seed 고정)
    print("하드체크 통과")
