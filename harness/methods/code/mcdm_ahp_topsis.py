"""다기준 의사결정 다기준 의사결정 — AHP 가중치(일관성 비율) + TOPSIS 순위 + 가중치 민감도 (numpy 직접 구현).
실행: python mcdm_ahp_topsis.py
입력: 대안×기준 DataFrame (행=대안 ID, 열=기준, 값=숫자), benefit={기준: True(클수록 좋음)/False(작을수록 좋음)},
      기준 쌍대비교 행렬 A (Saaty 1~9, A[i][j]=i 가 j 보다 몇 배 중요한가).
"""
import numpy as np
import pandas as pd

RI = {1: 0, 2: 0, 3: 0.58, 4: 0.90, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}


def ahp(A):
    """주고유벡터 가중치, λmax, 일관성지수 CI=(λmax−n)/(n−1), 일관성비율 CR=CI/RI (0.1 이하면 수용)."""
    A = np.asarray(A, float)
    n = len(A)
    vals, vecs = np.linalg.eig(A)
    k = int(np.argmax(vals.real))
    w = np.abs(vecs[:, k].real)
    w /= w.sum()
    ci = (vals[k].real - n) / (n - 1)
    return w, vals[k].real, ci, (ci / RI[n] if RI[n] else 0.0)


def topsis(M, w, benefit):
    """벡터 정규화 → 가중 → 이상해/반이상해 거리 → 근접도 C∈[0,1] (클수록 좋음)."""
    X = M.to_numpy(float)
    V = X / np.sqrt((X**2).sum(axis=0)) * np.asarray(w, float)
    ben = np.array([benefit[c] for c in M.columns])
    best, worst = np.where(ben, V.max(0), V.min(0)), np.where(ben, V.min(0), V.max(0))
    dp, dm = np.sqrt(((V - best) ** 2).sum(1)), np.sqrt(((V - worst) ** 2).sum(1))
    return pd.Series(dm / (dp + dm), index=M.index, name="C")


def sweep_weight(M, w, benefit, j, steps=1001):
    """기준 j 의 가중치를 0→1 로 움직이고 나머지는 비례 축소 — 1위가 바뀌는 지점 [(가중치, 새 1위)]."""
    w, flips, prev = np.asarray(w, float), [], None
    for t in np.linspace(0, 1, steps):
        ww = w * (1 - t) / (1 - w[j]); ww[j] = t
        top = topsis(M, ww, benefit).idxmax()
        if prev is not None and top != prev: flips.append((round(float(t), 3), top))
        prev = top
    return flips


def mc_top1(M, w, benefit, n=5000, conc=30, seed=1):
    """가중치를 Dirichlet(conc·w) 로 흔들어 대안별 1위 비율."""
    rng = np.random.default_rng(seed)
    tops = [topsis(M, rng.dirichlet(conc * np.asarray(w)), benefit).idxmax() for _ in range(n)]
    return pd.Series(tops).value_counts(normalize=True)


def make_demo():
    crit = ["공정위험", "영향LOT수", "조치비용", "Q-Time여유(분)"]
    M = pd.DataFrame([[8, 12, 3.0, 40], [6, 30, 1.5, 90], [9, 5, 6.0, 25], [4, 18, 0.8, 200], [7, 20, 2.8, 60], [5, 8, 1.0, 120]],
                     index=[f"ALM-{i}" for i in range(1, 7)], columns=crit)
    benefit = {"공정위험": True, "영향LOT수": True, "조치비용": False, "Q-Time여유(분)": False}  # 여유 적을수록 급함
    A = [[1, 3, 5, 2], [1 / 3, 1, 3, 1 / 2], [1 / 5, 1 / 3, 1, 1 / 3], [1 / 2, 2, 3, 1]]
    return M, benefit, A


def topsis_loop(M, w, benefit):
    """하드체크용: 행렬 연산 없이 순수 파이썬 이중 루프로 TOPSIS."""
    rows, cols = list(M.index), list(M.columns)
    norm = {c: sum(M.loc[r, c] ** 2 for r in rows) ** 0.5 for c in cols}
    V = {r: [M.loc[r, c] / norm[c] * w[k] for k, c in enumerate(cols)] for r in rows}
    best = [(max if benefit[c] else min)(V[r][k] for r in rows) for k, c in enumerate(cols)]
    worst = [(min if benefit[c] else max)(V[r][k] for r in rows) for k, c in enumerate(cols)]
    out = {}
    for r in rows:
        dp = sum((V[r][k] - best[k]) ** 2 for k in range(len(cols))) ** 0.5
        dm = sum((V[r][k] - worst[k]) ** 2 for k in range(len(cols))) ** 0.5
        out[r] = dm / (dp + dm)
    return pd.Series(out)


if __name__ == "__main__":
    M, benefit, A = make_demo()
    w, lam, ci, cr = ahp(A)
    print("AHP 가중치:", {c: round(float(x), 3) for c, x in zip(M.columns, w)}, f"λmax={lam:.3f} CI={ci:.3f} CR={cr:.3f}", "(수용)" if cr <= 0.1 else "(재입력!)")
    C = topsis(M, w, benefit)
    print("TOPSIS 근접도 순위:\n", C.sort_values(ascending=False).round(3).to_string())
    flips = {c: sweep_weight(M, w, benefit, j) for j, c in enumerate(M.columns)}
    print("1위가 바뀌는 가중치 지점:", {c: f for c, f in flips.items()})
    freq = mc_top1(M, w, benefit)
    print("가중치 ±흔들기 1위 비율:", freq.round(3).to_dict())

    # ---- 독립 하드체크 ----
    # (1) 고유벡터: 거듭제곱법(다른 경로) 가중치 == np.linalg.eig 가중치
    v = np.ones(len(A)) / len(A)
    for _ in range(500): v = np.asarray(A) @ v; v /= v.sum()
    assert np.allclose(v, w, atol=1e-9)
    # (2) 교과서 3×3 예: λmax=3.0385, CR≈0.033. 완전 일관 행렬 CR=0, 순환 모순 행렬 CR>0.1
    _, l3, _, cr3 = ahp([[1, 3, 5], [1 / 3, 1, 3], [1 / 5, 1 / 3, 1]])
    assert abs(l3 - 3.0385) < 1e-3 and abs(cr3 - 0.0332) < 1e-3
    g = np.array([4.0, 2.0, 1.0])
    wc, _, _, crc = ahp(np.outer(g, 1 / g))
    assert abs(crc) < 1e-9 and np.allclose(wc, g / g.sum())
    assert ahp([[1, 9, 1 / 9], [1 / 9, 1, 9], [9, 1 / 9, 1]])[3] > 0.1
    assert cr <= 0.1
    # (3) TOPSIS: 순수 루프 구현과 일치
    assert np.allclose(C.to_numpy(), topsis_loop(M, w, benefit).to_numpy(), atol=1e-12)
    # (4) 성질: 열 단위 변환(×1000) 불변, 전 기준 최고 대안 C=1, 전 기준 최악 대안 C=0
    M2 = M.copy(); M2["조치비용"] *= 1000
    assert np.allclose(topsis(M2, w, benefit).to_numpy(), C.to_numpy(), atol=1e-12)
    M3 = M.copy(); M3.loc["BEST"] = [M[c].max() if benefit[c] else M[c].min() for c in M.columns]
    M3.loc["WORST"] = [M[c].min() if benefit[c] else M[c].max() for c in M.columns]
    C3 = topsis(M3, w, benefit)
    assert abs(C3["BEST"] - 1) < 1e-12 and abs(C3["WORST"]) < 1e-12
    # (5) 민감도: 원 가중치 지점에서 sweep 1위 == 기본 1위, 보고된 지점 직전·직후 1위가 실제로 다르다
    for j, c in enumerate(M.columns):
        ww = lambda t: np.where(np.arange(len(w)) == j, t, w * (1 - t) / (1 - w[j]))
        assert topsis(M, ww(w[j]), benefit).idxmax() == C.idxmax()
        for t, new in flips[c]:
            assert topsis(M, ww(t), benefit).idxmax() == new and topsis(M, ww(t - 0.002), benefit).idxmax() != new
    assert freq.idxmax() == C.idxmax() and abs(freq.sum() - 1) < 1e-9
    print("하드체크 통과")
