"""관측 데이터 회귀 대 무작위 실험 — 숨은 변수(챔버 노후도)가 인자와 반응을 함께 움직일 때 무슨 일이 생기나.  실행: python observational_vs_experiment.py
입력: 합성 생성기 하나에서 (a) 엔지니어가 노후 챔버에 파워를 올려 온 "관측 로그" (b) 같은 파워 범위를 무작위로 배정한 "실험"을 뽑는다.
출력: 관측 회귀 기울기 대 실험 기울기, 인자-대리변수 VIF, 대리변수를 넣었을 때의 부분 보정, 부트스트랩 부호 안정성, 검출 가능한 최소 차이와 필요 웨이퍼 수.
합성 데이터는 "방법 시연" 이다. 계수는 가정이며 실제 공정의 효과 근거가 아니다.
"""
import numpy as np
from scipy import stats

# 가정값 (합성): 파워 p 의 참 효과 BETA 는 +, 숨은 노후도 h 의 효과 GAMMA 는 −. 엔지니어는 노후 챔버(h 큼)에 파워를 올린다(A_TUNE).
BETA, GAMMA, A_TUNE = 0.5, 1.2, 0.8
SD_P_NOISE, SD_Y, SD_PROXY = 0.6, 1.0, 0.5   # 파워의 레시피 잡음 / 수율 잡음 / 대리변수(PM 누적 횟수) 측정 잡음


def gen_observational(n, rng):
    """관측 로그: p = A_TUNE·h + 잡음 (노후 챔버에 파워를 올림). z = h + 잡음 은 기록돼 있는 대리변수."""
    h = rng.normal(0, 1, n)
    p = A_TUNE * h + rng.normal(0, SD_P_NOISE, n)
    z = h + rng.normal(0, SD_PROXY, n)
    y = BETA * p - GAMMA * h + rng.normal(0, SD_Y, n)
    return {"p": p, "z": z, "h": h, "y": y}


def gen_randomized(n, rng):
    """무작위 배정 실험: 파워 범위(분산)는 관측과 같게 하되 h 와 독립으로 배정한다. 같은 생성식을 쓴다."""
    h = rng.normal(0, 1, n)
    p = rng.normal(0, np.sqrt(A_TUNE ** 2 + SD_P_NOISE ** 2), n)
    z = h + rng.normal(0, SD_PROXY, n)
    y = BETA * p - GAMMA * h + rng.normal(0, SD_Y, n)
    return {"p": p, "z": z, "h": h, "y": y}


def ols(cols, y):
    """절편 포함 최소제곱. 반환: 계수(절편 제외), 표준오차(절편 제외)."""
    X = np.column_stack([np.ones(len(y))] + list(cols))
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    r = y - X @ beta
    s2 = float(r @ r) / (len(y) - X.shape[1])
    se = np.sqrt(s2 * np.diag(np.linalg.inv(X.T @ X)))
    return beta[1:], se[1:]


def vif(cols):
    """분산팽창계수: 각 열을 나머지 열에 회귀한 R² 로 1/(1−R²). 열이 1개면 1."""
    A = np.column_stack(cols)
    out = []
    for j in range(A.shape[1]):
        others = [A[:, i] for i in range(A.shape[1]) if i != j]
        if not others:
            out.append(1.0)
            continue
        X = np.column_stack([np.ones(len(A))] + others)
        b, *_ = np.linalg.lstsq(X, A[:, j], rcond=None)
        r = A[:, j] - X @ b
        r2 = 1 - float(r @ r) / float(((A[:, j] - A[:, j].mean()) ** 2).sum())
        out.append(1.0 / (1.0 - r2))
    return np.array(out)


def stratified_slope(p, y, strata, n_strata=4):
    """대리변수 분위로 층을 나눠 층 안에서 구한 파워 기울기의 가중 평균 (층 안 비교)."""
    edges = np.quantile(strata, np.linspace(0, 1, n_strata + 1))
    idx = np.clip(np.searchsorted(edges, strata, side="right") - 1, 0, n_strata - 1)
    num = den = 0.0
    for g in range(n_strata):
        m = idx == g
        pc = p[m] - p[m].mean()
        num += float(pc @ (y[m] - y[m].mean()))
        den += float(pc @ pc)
    return num / den


def bootstrap_sign(p, y, n_boot=2000, seed=0):
    """같은 비교를 다시 하면 기울기 부호가 몇 % 뒤집히나: 점추정 부호와 반대인 부트스트랩 표본 비율."""
    rng = np.random.default_rng(seed)
    n = len(y)
    point = np.sign(ols([p], y)[0][0])
    flips = 0
    for _ in range(n_boot):
        i = rng.integers(0, n, n)
        flips += np.sign(ols([p[i]], y[i])[0][0]) != point
    return flips / n_boot


def power_two_arm(delta, sigma, n_arm, alpha=0.05):
    """두 집단(각 n_arm 장) 평균 차 delta 를 양측 t 검정으로 잡을 검정력 (비중심 t 분포, 정확식)."""
    df = 2 * n_arm - 2
    ncp = delta / (sigma * np.sqrt(2.0 / n_arm))
    tc = stats.t.ppf(1 - alpha / 2, df)
    return float(stats.nct.sf(tc, df, ncp) + stats.nct.cdf(-tc, df, ncp))


def n_needed(delta, sigma, power=0.8, alpha=0.05):
    """검정력 power 를 처음 넘는 집단당 웨이퍼 수."""
    n = 2
    while power_two_arm(delta, sigma, n, alpha) < power:
        n += 1
    return n


def min_detectable(sigma, n_arm, power=0.8, alpha=0.05):
    """집단당 n_arm 장일 때 검정력 power 로 잡히는 최소 평균 차 (이분법)."""
    lo, hi = 0.0, 10.0 * sigma
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if power_two_arm(mid, sigma, n_arm, alpha) < power else (lo, mid)
    return hi


def population_coefs():
    """모집단 공분산으로 푼 이론 기울기 (표본 없이 식만으로): y ~ p 단순 회귀, y ~ p + z 두 변수 회귀."""
    var_p = A_TUNE ** 2 + SD_P_NOISE ** 2
    cov_yp = BETA * var_p - GAMMA * A_TUNE
    simple = cov_yp / var_p
    var_z = 1 + SD_PROXY ** 2
    cov_pz = A_TUNE
    cov_yz = BETA * A_TUNE - GAMMA
    both = np.linalg.solve(np.array([[var_p, cov_pz], [cov_pz, var_z]]), np.array([cov_yp, cov_yz]))
    return simple, both


if __name__ == "__main__":
    n = 400
    obs = gen_observational(n, np.random.default_rng(20261110))
    exp = gen_randomized(n, np.random.default_rng(20261111))
    b_o, se_o = ols([obs["p"]], obs["y"])
    b_e, se_e = ols([exp["p"]], exp["y"])
    b_oz, se_oz = ols([obs["p"], obs["z"]], obs["y"])
    b_or, _ = ols([obs["p"], obs["h"]], obs["y"])       # 숨은 변수를 실제로 알고 있다면 (현실에선 모름: 비교용)
    b_s = stratified_slope(obs["p"], obs["y"], obs["z"])
    print(f"참 파워 효과 +{BETA} (파워 1 단위당 수율). n={n}장")
    print(f"관측 회귀      기울기 {b_o[0]:+.3f} (SE {se_o[0]:.3f}, 95% 구간 {b_o[0] - 1.96 * se_o[0]:+.2f}~{b_o[0] + 1.96 * se_o[0]:+.2f}) ← 부호가 반대")
    print(f"무작위 실험    기울기 {b_e[0]:+.3f} (SE {se_e[0]:.3f}, 95% 구간 {b_e[0] - 1.96 * se_e[0]:+.2f}~{b_e[0] + 1.96 * se_e[0]:+.2f})")
    print(f"관측 + 대리변수(PM) 기울기 {b_oz[0]:+.3f} (부분 보정) | 대리변수 분위 층 안 비교 {b_s:+.3f} | (참고) 숨은 변수를 직접 알면 {b_or[0]:+.3f}")
    v = vif([obs["p"], obs["z"]])
    print(f"VIF(파워, 대리변수) = {np.round(v, 2).tolist()} (파워와 PM 이 같이 움직인다 — 둘의 몫을 가르기 어렵다)")
    print(f"부트스트랩 부호 뒤집힘 — 관측(n=400): {bootstrap_sign(obs['p'], obs['y']):.3f} (안정적으로 틀린다) | 무작위 실험 n=16: "
          f"{bootstrap_sign(gen_randomized(16, np.random.default_rng(5))['p'], gen_randomized(16, np.random.default_rng(5))['y']):.3f}")
    sig_exp = float(np.sqrt(GAMMA ** 2 + SD_Y ** 2))     # 숨은 변수 몫이 잡음으로 들어간 실험 잔차 표준편차
    print(f"[확인 실험 비용] 두 파워 수준을 비교하는 실험에서 잔차 σ≈{sig_exp:.2f}: 두 파워 수준(1 단위 차) 사이 수율 차 {BETA} 를 80% 검정력으로 잡으려면 집단당 "
          f"{n_needed(BETA, sig_exp)}장, 집단당 8장이면 최소 검출 차이 {min_detectable(sig_exp, 8):.2f}")

    # ================= 독립 하드체크 =================
    # (1) 이론 기울기(모집단 공분산 식) == 대표본 OLS. y~p 단순 = β − γ·cov(p,h)/var(p), 두 변수 회귀는 연립방정식 해
    simple, both = population_coefs()
    assert abs(simple - (BETA - GAMMA * A_TUNE / (A_TUNE ** 2 + SD_P_NOISE ** 2))) < 1e-12 and simple < 0
    big = gen_observational(2_000_000, np.random.default_rng(1))
    bb, _ = ols([big["p"]], big["y"])
    bb2, _ = ols([big["p"], big["z"]], big["y"])
    assert abs(bb[0] - simple) < 0.01, (bb, simple)
    assert np.allclose(bb2, both, atol=0.01), (bb2, both)
    # (2) 손계산 리터럴: 0.5 − 1.2·0.8/(0.64+0.36) = −0.46
    assert abs(simple - (-0.46)) < 1e-12
    # (3) 관측 표본의 부호가 실제로 반대이고, 95% 구간이 참값 +0.5 를 포함하지 않는다. 실험은 포함한다
    assert b_o[0] < 0 and b_o[0] + 1.96 * se_o[0] < 0
    assert abs(b_e[0] - BETA) < 3 * se_e[0] and b_e[0] > 0
    # (4) 반복해도 같다: 300회 반복 평균. 관측은 이론 −0.46 쪽, 실험은 참값 +0.5 쪽
    rr = np.random.default_rng(9)
    ro = np.array([ols([d["p"]], d["y"])[0][0] for d in (gen_observational(400, rr) for _ in range(300))])
    re = np.array([ols([d["p"]], d["y"])[0][0] for d in (gen_randomized(400, rr) for _ in range(300))])
    assert abs(ro.mean() - simple) < 4 * ro.std() / np.sqrt(300) + 1e-9 and (ro < 0).all()
    assert abs(re.mean() - BETA) < 4 * re.std() / np.sqrt(300) + 1e-9 and (re > 0).mean() > 0.99
    # (5) 대리변수는 부분 보정일 뿐: 기울기가 simple 보다 참값에 가까우나 참값은 아니다. 숨은 변수를 알면 참값 복원
    assert abs(both[0] - BETA) < abs(simple - BETA) and abs(both[0] - BETA) > 0.05
    assert abs(b_or[0] - BETA) < 3 * ols([obs["p"], obs["h"]], obs["y"])[1][0]
    # (6) VIF 를 다른 방법으로: 상관행렬 역행렬의 대각 == 회귀 R² 로 구한 값. 2변수면 1/(1−r²)
    R = np.corrcoef(np.column_stack([obs["p"], obs["z"]]).T)
    assert np.allclose(np.diag(np.linalg.inv(R)), v, atol=1e-9)
    assert abs(v[0] - 1 / (1 - R[0, 1] ** 2)) < 1e-9 and v[0] > 1.3
    assert np.allclose(vif([np.arange(5.0) ** 2 + np.array([0, 1, 0, 1, 0])]), [1.0])
    # (7) 최소 검출 차이·필요 장수: 비중심 t 정확식을 시뮬레이션 t 검정으로 대조 (검정력 0.8 ±0.03)
    na = n_needed(BETA, sig_exp)
    assert power_two_arm(BETA, sig_exp, na) >= 0.8 > power_two_arm(BETA, sig_exp, na - 1)
    sim = np.random.default_rng(13)
    reps = 6000
    A = sim.normal(0, sig_exp, (reps, na))
    B = sim.normal(BETA, sig_exp, (reps, na))
    pv = stats.ttest_ind(B, A, axis=1).pvalue
    assert abs((pv < 0.05).mean() - power_two_arm(BETA, sig_exp, na)) < 0.03, (pv < 0.05).mean()
    assert abs(power_two_arm(0.0, sig_exp, 20) - 0.05) < 1e-9                  # 차이 0 이면 검정력 = 유의수준
    d8 = min_detectable(sig_exp, 8)
    assert abs(power_two_arm(d8, sig_exp, 8) - 0.8) < 1e-6 and d8 > min_detectable(sig_exp, 32)
    # (8) 부트스트랩: 안정성 != 타당성 — 관측은 거의 항상 같은 (틀린) 부호, 표본 16 실험은 부호가 흔들린다
    flip_obs = bootstrap_sign(obs["p"], obs["y"])
    small = gen_randomized(16, np.random.default_rng(5))
    flip_small = bootstrap_sign(small["p"], small["y"])
    assert flip_obs < 0.001 and flip_small > flip_obs
    # (9) 층 안 비교는 관측 단순 회귀보다 참값에 가깝다 (대리변수가 완전하진 않으므로 완전 복원은 아님)
    assert abs(b_s - BETA) < abs(b_o[0] - BETA)

    print(f"HARD CHECK OK: 이론 기울기 {simple:+.2f}=대표본 OLS(200만), 관측 구간이 참 +{BETA} 를 못 포함·실험은 포함, 300회 반복 평균, "
          f"VIF 두 방법 일치, 검정력 정확식=시뮬레이션, 부트스트랩 뒤집힘 관측 {flip_obs:.3f} 대 n=16 실험 {flip_small:.3f}")
