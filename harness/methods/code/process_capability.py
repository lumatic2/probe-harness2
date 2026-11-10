"""공정능력 공정능력 Cp·Cpk — 「관리 상태(안정)」와 「규격 만족(능력)」을 분리 판정.  실행: python process_capability.py
입력 DataFrame 컬럼: group(장비/챔버/레시피 등 묶음), time(순서), value(측정값).  규격: specs = {group: (LSL, USL)}.
"""
import numpy as np
import pandas as pd
from scipy.stats import norm

TARGET = 1.33  # 판정 기준 Cpk (현업 기준으로 바꿔 끼운다)


def sigma_within(x):
    """군내 산포 추정(개별값): 이동범위 평균 / 1.128."""
    return np.abs(np.diff(x)).mean() / 1.128


def is_stable(x, max_ratio=1.2, max_run=12, max_out=3):
    """관리 상태 판정(간이, 개별값).  단발 신호 1건은 거짓경보일 수 있어(ARL≈371/92) 임계를 느슨하게 둔다.
    불안정 = ① σ_전체/σ_군내 > max_ratio(드리프트·이동) ② 중심선 한쪽 연속 ≥ max_run ③ 3σ 밖 점 ≥ max_out.
    중심·σ 는 앞 절반(기준선)에서 잡는다."""
    base = x[: max(20, len(x) // 2)]
    z = (x - base.mean()) / sigma_within(base)
    run, mx, prev = 0, 0, 0
    for s in np.sign(z):
        run = run + 1 if (s == prev and s != 0) else 1
        prev = s
        mx = max(mx, run)
    ratio, nout = x.std(ddof=1) / sigma_within(x), int((np.abs(z) > 3).sum())
    return bool(ratio <= max_ratio and mx < max_run and nout < max_out), {"σ비": round(ratio, 2), "3σ밖": nout, "최대연속": mx}


def ppm_from_cpk(cpu, cpl):
    """정규 가정 규격 밖 비율(ppm) = P(X>USL)+P(X<LSL)."""
    return (norm.sf(3 * cpu) + norm.sf(3 * cpl)) * 1e6


def capability(x, lsl, usl):
    x = np.asarray(x, float)
    mu, sw, so = x.mean(), sigma_within(x), x.std(ddof=1)
    cpu, cpl = (usl - mu) / (3 * sw), (mu - lsl) / (3 * sw)
    cp, cpk = (usl - lsl) / (6 * sw), min(cpu, cpl)
    ppk = min((usl - mu) / (3 * so), (mu - lsl) / (3 * so))
    n = len(x)
    se = np.sqrt(1 / (9 * n) + cpk**2 / (2 * (n - 1)))  # Bissell 근사
    return {"n": n, "mean": mu, "sigma_w": sw, "sigma_o": so, "Cp": cp, "Cpk": cpk, "Pp": (usl - lsl) / (6 * so),
            "Ppk": ppk, "Cpk_lo": cpk - 1.96 * se, "Cpk_hi": cpk + 1.96 * se, "ppm": ppm_from_cpk(cpu, cpl), "se": se}


def verdict(stable, c):
    if stable:
        if c["Cpk"] >= TARGET: return "관리 상태 + 능력 충분 → 출하 근거 OK"
        if c["Cp"] >= TARGET: return "관리 상태이나 중심이 치우침 → 센터링 조정(산포는 충분)"
        return "관리 상태이나 능력 부족 → 산포 축소(장비·레시피 개선)"
    if c["Ppk"] >= TARGET: return "규격은 만족하나 불안정(드리프트/이동) → 원인 조사, 능력지수 신뢰 불가"
    return "불안정 + 규격 위험 → 즉시 조치"


def evaluate(df, specs):
    rows = []
    for g, d in df.sort_values("time").groupby("group"):
        x = d["value"].to_numpy(float)
        st, info = is_stable(x)
        c = capability(x, *specs[g])
        rows.append({"group": g, "stable": st, **info, **{k: round(c[k], 3) for k in ("Cp", "Cpk", "Pp", "Ppk")},
                     "ppm": round(c["ppm"], 1), "판정": verdict(st, c)})
    return pd.DataFrame(rows)


def make_demo(seed=5, n=250):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    a = rng.normal(100, 1, n)                              # 중심·산포 양호
    b = rng.normal(102.5, 1, n)                            # 산포는 좋은데 치우침
    c = rng.normal(100, 1, n) + np.linspace(-1.5, 1.5, n)  # 규격 안이지만 드리프트
    df = pd.concat([pd.DataFrame({"group": g, "time": t, "value": v}) for g, v in zip("ABC", (a, b, c))])
    return df, {g: (94.0, 106.0) for g in "ABC"}


if __name__ == "__main__":
    df, specs = make_demo()
    res = evaluate(df, specs)
    pd.set_option("display.width", 200, "display.max_colwidth", 60)
    print(res.to_string(index=False))

    # ---- 독립 하드체크 ----
    # (1) Cpk → ppm 변환: 교과서 값. 중심 Cp=1 → 2699.8ppm, 중심 Cpk=1.33 → 약 66ppm, 한쪽 Cpk=1 → 1350ppm
    assert abs(ppm_from_cpk(1, 1) - 2699.8) < 0.1 and abs(ppm_from_cpk(1.33, 1.33) - 66.0) < 1.0
    assert abs(ppm_from_cpk(1, 99) - 1349.9) < 0.1
    # (2) 같은 모수에서 큰 표본을 뽑아 실제 규격 밖 비율을 세어 본다(공식과 다른 경로)
    rng = np.random.default_rng(99)
    for g, d in df.groupby("group"):
        x = d["value"].to_numpy(float)
        c = capability(x, *specs[g])
        if g == "C":
            continue  # 드리프트 군은 정규 단일분포 가정이 깨진다 — (4)에서 따로
        sim = rng.normal(c["mean"], c["sigma_w"], 4_000_000)
        out = ((sim < specs[g][0]) | (sim > specs[g][1])).mean() * 1e6
        assert abs(out - c["ppm"]) <= max(0.15 * c["ppm"], 3), (g, out, c["ppm"])
        # (3) 항등식 Cpk = Cp·(1−k), k = |μ−중심| / (반폭)
        k = abs(c["mean"] - sum(specs[g]) / 2) / ((specs[g][1] - specs[g][0]) / 2)
        assert abs(c["Cpk"] - c["Cp"] * (1 - k)) < 1e-9
    # (4) 분리 판정: B 는 Cp 충분·Cpk 부족, C 는 규격 안이지만 불안정, A 만 출하 OK
    r = res.set_index("group")
    assert r.loc["A", "stable"] and r.loc["A", "Cpk"] >= TARGET
    assert r.loc["B", "stable"] and r.loc["B", "Cp"] >= TARGET > r.loc["B", "Cpk"]
    assert (not r.loc["C", "stable"]) and r.loc["C", "Ppk"] >= TARGET and r.loc["C", "Cpk"] > r.loc["C", "Ppk"]
    # (5) 참값이 신뢰구간 안: A 의 참 Cpk = (106−100)/(3·1) = 2.0
    ca = capability(df[df.group == "A"]["value"], 94, 106)
    assert ca["Cpk_lo"] < 2.0 < ca["Cpk_hi"], ca
    print("하드체크 통과")
