"""합성통제: 시범 장비·라인 1개의 효과.  실행: python code/synthetic_control.py  (methods 폴더에서)
입력 DataFrame 컬럼: unit_id(장비), week(정수 주), metric(지표).  인자: treated_unit(시범 장비 id), adopt_week(켠 주).
절차: 도입 전 기간의 지표 궤적을 가장 잘 맞추는 비음수·합 1 가중치로 안 켠 장비(기증 풀)를 합성 → 도입 후 (실제 - 합성) = 효과.
위약 검정: 안 켠 장비를 하나씩 '가짜 시범' 으로 놓고 같은 절차를 돌려, 시범 장비의 도입 후/전 오차 비가 그 분포에서 얼마나 극단인지 본다.
합성 데이터는 방법 시연이지 효과 근거가 아니다.
"""
import sys
import numpy as np
import pandas as pd
from scipy.optimize import minimize, nnls

T0, T1, J = 20, 10, 24  # 도입 전 20주 · 후 10주 · 안 켠 장비 24대


# ---------------------------------------------------------------- 합성 패널
def make_panel(seed=21, tau=2.0, noise=0.3, outside_hull=1.0, n_donors=J):
    """요인 모형: 지표 = 장비 적재 · (상수, 추세, 계절, 랜덤워크) + 잡음.  시범 장비의 적재는 기증 장비 3대의 가중합(참 가중치 .5/.3/.2)
    x outside_hull (1.0 이면 기증 풀의 볼록 껍질 안, 1 보다 크면 밖).  도입 후에만 참 효과 tau 를 더한다."""
    rng = np.random.default_rng(seed)
    T = T0 + T1
    t = np.arange(T)
    F = np.column_stack([np.ones(T), 0.25 * t, 1.5 * np.sin(2 * np.pi * t / 8), np.cumsum(rng.normal(0, 0.4, T))])
    load = np.column_stack([rng.normal(50, 5, n_donors), rng.normal(1, 0.5, n_donors), rng.normal(0, 1, n_donors), rng.normal(0.5, 0.5, n_donors)])
    w_true = np.zeros(n_donors)
    w_true[[2, 5, 9]] = [0.5, 0.3, 0.2]
    m = load @ F.T                                   # 기증 장비의 체계적 부분 (J x T)
    m1 = outside_hull * (w_true @ m)                 # 시범 장비
    rows = []
    for j in range(n_donors):
        y = m[j] + rng.normal(0, noise, T)
        rows += [(f"EQ{j + 1:02d}", int(k), y[k]) for k in range(T)]
    y1 = m1 + rng.normal(0, noise, T)
    y1[T0:] += tau
    rows += [("PILOT", int(k), y1[k]) for k in range(T)]
    return pd.DataFrame(rows, columns=["unit_id", "week", "metric"]), w_true


# ---------------------------------------------------------------- 가중치 찾기
def fit_weights(y_pre, X_pre):
    """min ||y_pre - X_pre w||^2  s.t.  w >= 0, sum(w) = 1  (SLSQP, 해석적 기울기)."""
    n = X_pre.shape[1]
    A, b = X_pre, y_pre
    res = minimize(lambda w: float(np.sum((b - A @ w) ** 2)), np.full(n, 1 / n),
                   jac=lambda w: -2 * A.T @ (b - A @ w), method="SLSQP", bounds=[(0, 1)] * n,
                   constraints=[{"type": "eq", "fun": lambda w: w.sum() - 1, "jac": lambda w: np.ones(n)}],
                   options={"maxiter": 500, "ftol": 1e-12})
    w = np.clip(res.x, 0, None)
    return w / w.sum()


def synth(Y_donor, y1, t0):
    """Y_donor: (기간 x 기증 장비), y1: 시범 장비 (기간).  반환 가중치·합성 궤적·격차(실제-합성)·사전/사후 RMSPE."""
    w = fit_weights(y1[:t0], Y_donor[:t0])
    syn = Y_donor @ w
    gap = y1 - syn
    pre = float(np.sqrt(np.mean(gap[:t0] ** 2)))
    post = float(np.sqrt(np.mean(gap[t0:] ** 2)))
    return {"w": w, "synthetic": syn, "gap": gap, "pre_rmspe": pre, "post_rmspe": post, "effect": float(gap[t0:].mean())}


def to_matrix(df, treated_unit, unit_col="unit_id", time_col="week", y_col="metric"):
    wide = df.pivot(index=time_col, columns=unit_col, values=y_col)
    if wide.isna().any().any():
        raise ValueError("빠진 (장비, 주) 칸이 있다 — 채우거나 해당 장비를 뺀다")
    donors = [c for c in wide.columns if c != treated_unit]
    return wide[donors].to_numpy(float), wide[treated_unit].to_numpy(float), donors, list(wide.index)


def placebo_test(Y_donor, y1, t0, max_pre_ratio=None):
    """공간 위약: 기증 장비 각각을 가짜 시범으로 (나머지 기증 장비로 합성). 사후/사전 RMSPE 비로 순위.
    max_pre_ratio 를 주면 사전 적합이 시범 장비의 그 배수보다 나쁜 위약 단위는 분포에서 뺀다(초기 적합 불량 단위 제외)."""
    real = synth(Y_donor, y1, t0)
    ratio_real = real["post_rmspe"] / real["pre_rmspe"]
    ratios, gaps = [], []
    for j in range(Y_donor.shape[1]):
        others = np.delete(Y_donor, j, axis=1)
        r = synth(others, Y_donor[:, j], t0)
        if max_pre_ratio is not None and r["pre_rmspe"] > max_pre_ratio * real["pre_rmspe"]:
            continue
        ratios.append(r["post_rmspe"] / r["pre_rmspe"])
        gaps.append(r["gap"])
    ratios = np.array(ratios)
    p = (np.sum(ratios >= ratio_real) + 1) / (len(ratios) + 1)  # 시범 장비 자신을 분포에 포함
    return real, ratio_real, ratios, p, np.array(gaps)


# ---------------------------------------------------------------- 실행
if __name__ == "__main__":
    df, w_true = make_panel()
    Yd, y1, donors, weeks = to_matrix(df, "PILOT")
    real, ratio, ratios, p, pgaps = placebo_test(Yd, y1, T0)
    tau = 2.0
    naive = y1[T0:].mean() - y1[:T0].mean()
    did_eq = (y1[T0:].mean() - y1[:T0].mean()) - (Yd[T0:].mean() - Yd[:T0].mean())  # 기증 장비 단순 평균을 비교군으로
    top = np.argsort(-real["w"])[:5]
    print(f"패널: 기증 장비 {Yd.shape[1]}대 · 도입 전 {T0}주 · 후 {T1}주 | 참 효과 {tau} (합성)")
    print("가중치 상위 5:", ", ".join(f"{donors[i]} {real['w'][i]:.2f}" for i in top), "| 참 가중치는 EQ03 .5 · EQ06 .3 · EQ10 .2 (풀이 겹쳐 가중치가 유일하지 않을 수 있음)")
    print(f"사전 적합 RMSPE {real['pre_rmspe']:.3f} (잡음 0.3 수준이면 정상) · 사후 RMSPE {real['post_rmspe']:.3f} · 비 {ratio:.1f}")
    print(f"효과 추정(도입 후 평균 격차): 합성통제 {real['effect']:.3f} | 기증 평균과 DID {did_eq:.3f} | 단순 전후 {naive:.3f}  (참 {tau})")
    print(f"위약 검정: 가짜 시범 {len(ratios)}개의 비 중 최대 {ratios.max():.1f}, 시범 장비 {ratio:.1f} → 순위 p = {p:.3f} (최소 가능 {1 / (len(ratios) + 1):.3f})")
    print("주별 격차(실제-합성):", " ".join(f"{g:+.1f}" for g in real["gap"][T0 - 3:]), "(앞 3개는 도입 전)")

    # ---- 위약 데이터(참 효과 0): 반복 20회 → 순위 p<0.05 비율(거짓 양성)
    fp = []
    effs0 = []
    for s in range(200, 220):
        d0, _ = make_panel(seed=s, tau=0.0)
        Yd0, y0, _, _ = to_matrix(d0, "PILOT")
        r0, _, _, p0, _ = placebo_test(Yd0, y0, T0)
        fp.append(p0 < 0.05)
        effs0.append(r0["effect"])
    # ---- 효과 있는 데이터 반복 10회: 추정 오차, 검출
    errs, det = [], []
    for s in range(300, 310):
        d1, _ = make_panel(seed=s)
        Yd1, y11, _, _ = to_matrix(d1, "PILOT")
        r1, _, _, p1, _ = placebo_test(Yd1, y11, T0)
        errs.append(r1["effect"] - tau)
        det.append(p1 < 0.05)
    print(f"참 효과 0 위약 20회: 효과 추정 평균 {np.mean(effs0):+.3f} (표준편차 {np.std(effs0, ddof=1):.3f}) · p<0.05 비율 {np.mean(fp):.2f} (기대 ≤0.05)")
    print(f"참 효과 {tau} 10회: 추정 오차 평균 {np.mean(errs):+.3f} · 최대 |오차| {np.max(np.abs(errs)):.3f} · p<0.05 로 검출 {int(np.sum(det))}/10")

    # ---- 실패 시연: 시범 장비가 기증 풀의 볼록 껍질 밖(적재 x1.6)
    dh, _ = make_panel(seed=21, outside_hull=1.6)
    Yh, yh, _, _ = to_matrix(dh, "PILOT")
    rh = synth(Yh, yh, T0)
    print(f"껍질 밖 시범 장비(방법의 한계 시연): 사전 RMSPE {rh['pre_rmspe']:.2f} (정상 {real['pre_rmspe']:.2f}의 {rh['pre_rmspe'] / real['pre_rmspe']:.0f}배) → 효과 추정 {rh['effect']:.2f} 는 믿지 않는다")

    # ================= 독립 하드체크 =================
    # (1) 제약: 합 1, 비음수
    assert abs(real["w"].sum() - 1) < 1e-9 and real["w"].min() >= 0
    # (2) 최적성 - 다른 방법 A: 합 1 을 큰 벌점 행으로 넣은 비음수 최소제곱(nnls) 해를 정규화해 목적값을 비교
    A, b = Yd[:T0], y1[:T0]
    lam = 1e4
    w_n, _ = nnls(np.vstack([A, lam * np.ones((1, A.shape[1]))]), np.concatenate([b, [lam]]))
    w_n = w_n / w_n.sum()
    obj = lambda w: float(np.sum((b - A @ w) ** 2))
    assert obj(real["w"]) <= obj(w_n) + 1e-6, (obj(real["w"]), obj(w_n))
    # (3) 최적성 - 다른 방법 B: 가중치 단체(simplex) 위 무작위 20000점 중 SLSQP 해보다 나은 점이 없음
    rng = np.random.default_rng(0)
    W = rng.dirichlet(np.full(A.shape[1], 0.3), size=20000)
    assert (((b[None, :] - W @ A.T) ** 2).sum(1)).min() >= obj(real["w"]) - 1e-9
    # (4) 참 효과 복원: 추정 오차 허용 안, 사전 적합이 잡음 수준
    sd0 = np.std(effs0, ddof=1)  # 참 효과 0 데이터에서 본 추정의 흩어짐
    assert abs(real["effect"] - tau) < 2 * sd0, (real["effect"], sd0)
    assert real["pre_rmspe"] < 0.5
    assert np.max(np.abs(errs)) < 3 * sd0 and abs(np.mean(errs)) < 2.5 * sd0 / np.sqrt(len(errs)) + 0.1, (errs, sd0)
    # (5) 위약 검정: 효과 있으면 최저 p, 효과 0 이면 거짓 양성이 드물고 추정 평균 0 근처
    assert p <= 1 / (len(ratios) + 1) + 1e-12 and np.sum(det) >= 9
    assert np.mean(fp) <= 0.15 and abs(np.mean(effs0)) < 2.5 * sd0 / np.sqrt(len(effs0)), (np.mean(fp), np.mean(effs0))
    # (6) 단순 전후·기증 평균 DID 는 요인 추세 때문에 크게 치우침 — 합성통제가 더 정확
    assert abs(naive - tau) > 1.5 and abs(real["effect"] - tau) < abs(naive - tau) / 4
    assert abs(did_eq - tau) > abs(real["effect"] - tau)
    # (7) 껍질 밖이면 사전 적합이 눈에 띄게 나빠져 진단에 걸림
    assert rh["pre_rmspe"] > 5 * real["pre_rmspe"]
    print(f"\nHARD CHECK OK: 합성통제 효과 {real['effect']:.2f} (참 {tau}) · 단순 전후 {naive:.2f} · 위약 순위 p {p:.3f} · 참 0 위약 거짓 양성 {np.mean(fp):.2f} · 껍질 밖은 사전 RMSPE {rh['pre_rmspe']:.1f} 로 진단")
    sys.exit(0)
