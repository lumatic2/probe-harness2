"""시차 도입 이중차분(DID) + 집단별 효과.  실행: python code/did_staggered.py  (methods 폴더에서)
입력 DataFrame 컬럼: unit_id(라인/조), week(정수 주), metric(결과 지표), adopt_week(켠 주, 안 켠 곳은 NaN), [grade(집단)].
추정: 그룹(도입 주)·시점별 2x2 DID  ATT(g,t) = (처리 그룹의 t 와 g-1 의 평균 차) - (비교군의 같은 두 시점 평균 차)  → 모아서 이벤트 스터디·전체 효과.
비교: 단순 전후 비교, 이원 고정효과 회귀(TWFE).  신뢰구간은 단위(라인) 단위 부트스트랩.  합성 데이터는 방법 시연이지 효과 근거가 아니다.
"""
import sys
import numpy as np
import pandas as pd
from scipy import stats

GRADES = ["신입", "중간", "숙련"]
EVENT_E = list(range(-6, 9))  # 이벤트 시간 e = 주 - 도입 주


# ---------------------------------------------------------------- 합성 패널
def make_panel(seed=3, tau_scale=1.0, trend=0.2, T=26):
    """60개 단위(라인·조): 12+12+12 개가 10·14·18 주에 도입, 24개는 끝까지 안 켬.  평행 추세가 성립하는 합성 패널.
    참 효과 = 도입군 크기 x 숙련 배율 x 점증(4주에 걸쳐 완성).  true_effect 컬럼은 하드체크용(현장 로그에는 없다)."""
    rng = np.random.default_rng(seed)
    adopt = np.array([10] * 12 + [14] * 12 + [18] * 12 + [np.nan] * 24, dtype=float)
    N = len(adopt)
    pos = np.concatenate([np.arange(12)] * 3 + [np.arange(24)])
    grade = np.array(GRADES)[pos % 3]
    base_g = {10: 3.0, 14: 2.0, 18: 1.0}
    mult = {"신입": 1.5, "중간": 1.0, "숙련": 0.3}
    unit_fe = rng.normal(50, 4, N)
    week_fe = trend * np.arange(T) + rng.normal(0, 0.5, T)
    rows = []
    for i in range(N):
        for t in range(T):
            tau = 0.0
            if not np.isnan(adopt[i]) and t >= adopt[i]:
                e = t - adopt[i]
                tau = tau_scale * base_g[int(adopt[i])] * mult[grade[i]] * min(1.0, (e + 1) / 4)
            y = unit_fe[i] + week_fe[t] + tau + rng.normal(0, 1.0)
            rows.append((f"U{i:02d}", t, y, adopt[i], grade[i], tau))
    return pd.DataFrame(rows, columns=["unit_id", "week", "metric", "adopt_week", "grade", "true_effect"])


# ---------------------------------------------------------------- 패널 → 배열
def to_arrays(df, unit_col="unit_id", time_col="week", y_col="metric", adopt_col="adopt_week", group_col=None):
    """균형 패널(모든 단위가 모든 주를 가짐)을 Y(단위 x 시점) 와 cohort(도입 시점 위치, 안 켠 곳 inf)로 바꾼다."""
    wide = df.pivot(index=unit_col, columns=time_col, values=y_col)
    if wide.isna().any().any():
        raise ValueError("불균형 패널: 빠진 (단위, 주) 칸이 있다 — 먼저 채우거나 해당 단위를 뺀다")
    times = list(wide.columns)
    meta = df.drop_duplicates(unit_col).set_index(unit_col).loc[wide.index]
    cohort = np.full(len(wide), np.inf)
    for k, a in enumerate(meta[adopt_col].to_numpy(float)):
        if np.isnan(a) or a > times[-1]:
            continue  # 안 켠 단위(관측 기간 안에 도입 없음)
        if a <= times[0]:
            raise ValueError("관측 첫 주 이전에 이미 켠 단위가 있다 — 도입 전 기간이 없으면 쓸 수 없다")
        cohort[k] = times.index(a)
    grp = meta[group_col].to_numpy() if group_col else np.array(["전체"] * len(wide))
    return wide.to_numpy(float), cohort, grp, list(wide.index), times


# ---------------------------------------------------------------- ATT(g,t)
def att_gt(Y, cohort, control="never"):
    """그룹(도입 시점 g)·시점 t 별 2x2 DID.  기준 시점은 g-1(도입 직전).  control: 'never'(끝까지 안 켠 단위) 또는
    'notyet'(t 와 g-1 모두에서 아직 안 켠 단위).  반환 {g: (ATT 배열[t], 처리 단위 수)}."""
    N, T = Y.shape
    out = {}
    for g in sorted(set(cohort[np.isfinite(cohort)])):
        g = int(g)
        tr = cohort == g
        base = g - 1
        att = np.full(T, np.nan)
        d_tr = Y[tr].mean(0) - Y[tr, base].mean()
        if control == "never":
            ctrl = np.isinf(cohort)
            if ctrl.any():
                d_c = Y[ctrl].mean(0) - Y[ctrl, base].mean()
                att = d_tr - d_c
        else:
            for t in range(T):
                ctrl = cohort > max(t, base)
                if ctrl.any():
                    att[t] = d_tr[t] - (Y[ctrl, t].mean() - Y[ctrl, base].mean())
        att[base] = 0.0
        out[g] = (att, int(tr.sum()))
    return out


def overall_att(res):
    """도입 이후 (t>=g) 의 모든 (그룹, 시점) 을 처리 단위 수로 가중 평균 — 처리 단위·도입 후 주 하나씩을 똑같이 센다."""
    num = den = 0.0
    for g, (att, n) in res.items():
        a = att[g:]
        ok = ~np.isnan(a)
        num += n * a[ok].sum()
        den += n * ok.sum()
    return num / den


def event_att(res, e_list=EVENT_E):
    """이벤트 시간 e = t-g 별 평균 ATT (그 e 를 관측한 그룹만, 처리 단위 수 가중)."""
    out = []
    for e in e_list:
        num = den = 0.0
        for g, (att, n) in res.items():
            if 0 <= g + e < len(att) and not np.isnan(att[g + e]):
                num += n * att[g + e]
                den += n
        out.append(num / den if den else np.nan)
    return np.array(out)


def estimate(Y, cohort, grp, control="never", grades=None):
    """전체 효과 + 이벤트 스터디 + (grp 가 여러 값이면) 집단별 전체 효과.  집단별은 해당 집단 처리 단위 + 모든 비교 단위."""
    res = att_gt(Y, cohort, control)
    out = {"overall": overall_att(res), "event": event_att(res)}
    if grades is not None:
        gv = []
        for v in grades:
            keep = (grp == v) | np.isinf(cohort)
            gv.append(overall_att(att_gt(Y[keep], cohort[keep], control)))
        out["group"] = np.array(gv)
    return out


def naive_prepost(Y, cohort):
    """단순 전후 비교: 처리 단위마다 (도입 후 평균 - 도입 전 평균) 을 단위 평균."""
    d = [Y[i, int(cohort[i]):].mean() - Y[i, :int(cohort[i])].mean() for i in range(len(Y)) if np.isfinite(cohort[i])]
    return float(np.mean(d))


def twfe(Y, cohort):
    """이원 고정효과 회귀의 처리 계수: y = 단위 효과 + 주 효과 + β·D.  균형 패널이라 이중 평균 제거로 정확히 같다."""
    N, T = Y.shape
    D = (np.arange(T)[None, :] >= cohort[:, None]).astype(float)
    Dt = D - D.mean(1, keepdims=True) - D.mean(0, keepdims=True) + D.mean()
    return float((Dt * Y).sum() / (Dt * Dt).sum())


def bootstrap(Y, cohort, grp, control="never", grades=None, B=300, seed=11):
    """단위(라인) 단위 부트스트랩: (도입 시점, 집단) 층 안에서 단위를 복원추출. 반환 (B x 통계 수) 배열과 키 목록."""
    rng = np.random.default_rng(seed)
    strata = {}
    for i, (c, g) in enumerate(zip(cohort, grp)):
        strata.setdefault((c, g), []).append(i)
    strata = [np.array(v) for v in strata.values()]
    draws = []
    for _ in range(B):
        idx = np.concatenate([rng.choice(s, len(s), replace=True) for s in strata])
        est = estimate(Y[idx], cohort[idx], grp[idx], control, grades)
        draws.append(np.concatenate([[est["overall"]], est["event"], est.get("group", [])]))
    return np.array(draws)


def ci(draws, level=0.95):
    a = (1 - level) / 2
    return np.nanpercentile(draws, [100 * a, 100 * (1 - a)], axis=0)


def holm(p):
    """Holm 보정 p 값(가족 오류율 통제)."""
    p = np.asarray(p, float)
    order = np.argsort(p)
    adj = np.empty_like(p)
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, (len(p) - rank) * p[i])
        adj[i] = min(1.0, run)
    return adj


# ---------------------------------------------------------------- 진실(합성 전용)
def truth(df, mask=None):
    """DGP 의 참 효과: 도입 후 단위·주의 평균(true_effect).  추정기와 다른 경로(DGP 행렬 직접 평균)."""
    treated_post = df[(df["week"] >= df["adopt_week"]) & (mask if mask is not None else True)]
    return float(treated_post["true_effect"].mean())


def truth_event(df, e_list=EVENT_E):
    out = []
    for e in e_list:
        s = df[(df["week"] - df["adopt_week"]) == e]
        out.append(float(s["true_effect"].mean()) if len(s) else np.nan)
    return np.array(out)


def run_estimates(df, control="never"):
    Y, coh, grp, units, times = to_arrays(df, group_col="grade")
    return Y, coh, grp, estimate(Y, coh, grp, control, GRADES)


# ---------------------------------------------------------------- 다중 비교 시뮬레이션
def fwer_sim(k=10, n=8, reps=400, seed=5):
    """효과가 전혀 없는 데이터를 k 개 집단으로 쪼개 각각 검정할 때, 하나라도 '유의' 가 나오는 비율(Welch t, 단위별 변화량 비교)."""
    rng = np.random.default_rng(seed)
    raw = bonf = 0
    for _ in range(reps):
        p = np.array([stats.ttest_ind(rng.normal(0, 1, n), rng.normal(0, 1, n), equal_var=False).pvalue for _ in range(k)])
        raw += (p < 0.05).any()
        bonf += (p < 0.05 / k).any()
    return raw / reps, bonf / reps


# ---------------------------------------------------------------- 실행
def bar(v, scale=0.5, width=24):
    n = int(round(abs(v) / scale))
    return ("+" if v >= 0 else "-") * min(n, width)


if __name__ == "__main__":
    df = make_panel()
    Y, coh, grp, est = run_estimates(df)
    t_all = truth(df)
    t_ev = truth_event(df)
    t_grade = np.array([truth(df, df["grade"] == v) for v in GRADES])
    print(f"패널: 단위 {len(Y)} x 주 {Y.shape[1]} | 도입 주 {sorted(int(x) for x in set(coh[np.isfinite(coh)]))} (각 12개) + 안 켠 {int(np.isinf(coh).sum())}개")

    boot = bootstrap(Y, coh, grp, grades=GRADES)
    lo, hi = ci(boot)
    nE = len(EVENT_E)
    naive, tw = naive_prepost(Y, coh), twfe(Y, coh)
    print(f"\n[전체 효과]  참 {t_all:.3f}")
    print(f"  그룹·시점별 DID (비교군=안 켠 곳): {est['overall']:.3f}  95% 구간 [{lo[0]:.3f}, {hi[0]:.3f}]")
    est_ny = estimate(Y, coh, grp, "notyet")
    print(f"  그룹·시점별 DID (비교군=아직 안 켠 곳): {est_ny['overall']:.3f}")
    print(f"  이원 고정효과 회귀(TWFE): {tw:.3f}   (치우침 {tw - t_all:+.3f})")
    print(f"  단순 전후 비교: {naive:.3f}   (치우침 {naive - t_all:+.3f})")

    print("\n[이벤트 스터디]  e = 도입 후 주(0 = 켠 주).  e<-1 은 평행 추세 점검: 0 근처여야 한다")
    print("   e |   참    추정   95% 구간")
    for k, e in enumerate(EVENT_E):
        a, b = lo[1 + k], hi[1 + k]
        mark = "" if e == -1 else ("  <- 구간이 0 을 벗어남" if e < 0 and (a > 0 or b < 0) else "")
        print(f" {e:3d} | {t_ev[k] if not np.isnan(t_ev[k]) else 0:5.2f} {est['event'][k]:6.2f}  [{a:5.2f},{b:5.2f}] {bar(est['event'][k])}{mark}")

    print("\n[집단별 효과: 숙련 등급]  (3개 집단 = 비교 3번 → Holm 보정)")
    g_est = est["group"]
    g_boot = boot[:, 1 + nE:]
    g_lo, g_hi = ci(g_boot)
    se = g_boot.std(axis=0, ddof=1)
    pv = 2 * stats.norm.sf(np.abs(g_est / se))
    padj = holm(pv)
    for j, v in enumerate(GRADES):
        print(f"  {v}: 참 {t_grade[j]:.2f}  추정 {g_est[j]:.2f}  [{g_lo[j]:.2f},{g_hi[j]:.2f}]  p {pv[j]:.4f}  Holm p {padj[j]:.4f}")
    d_draw = g_boot[:, 0] - g_boot[:, 2]
    d_lo, d_hi = ci(d_draw[:, None])
    print(f"  신입-숙련 차이: 참 {t_grade[0] - t_grade[2]:.2f}  추정 {g_est[0] - g_est[2]:.2f}  [{d_lo[0]:.2f},{d_hi[0]:.2f}] (같은 부트스트랩 표본으로 계산)")
    raw_f, bon_f = fwer_sim()
    print(f"  효과 없는 데이터를 10집단으로 쪼개 검정: 하나라도 유의 비율 보정 없음 {raw_f:.2f} / Bonferroni {bon_f:.2f}  (이론 {1 - 0.95**10:.2f} / 0.05)")

    # ---- 위약: 효과 0 인 같은 패널
    dfp = make_panel(tau_scale=0.0)
    Yp, cp, gp, estp = run_estimates(dfp)
    bp = bootstrap(Yp, cp, gp, grades=GRADES, B=200, seed=2)
    plo, phi = ci(bp)
    naive_p = naive_prepost(Yp, cp)
    print(f"\n[위약: 참 효과 0]  DID {estp['overall']:.3f} [{plo[0]:.3f},{phi[0]:.3f}] | 단순 전후 {naive_p:.3f} | TWFE {twfe(Yp, cp):.3f}")

    # ---- 반복 시뮬레이션: 치우침 (부트스트랩 없이 점추정만)
    R = 150
    r_cs, r_nv, r_tw, r_tr, r_p, r_g = [], [], [], [], [], []
    for s in range(100, 100 + R):
        d = make_panel(seed=s)
        Ys, cs, gs_, _, _ = to_arrays(d, group_col="grade")
        r_g.append(estimate(Ys, cs, gs_, "never", GRADES)["group"] - np.array([truth(d, d["grade"] == v) for v in GRADES]))
        r_cs.append(overall_att(att_gt(Ys, cs)))
        r_nv.append(naive_prepost(Ys, cs))
        r_tw.append(twfe(Ys, cs))
        r_tr.append(truth(d))
        dp = make_panel(seed=s, tau_scale=0.0)
        Yq, cq, _, _, _ = to_arrays(dp, group_col="grade")
        r_p.append(overall_att(att_gt(Yq, cq)))
    r_cs, r_nv, r_tw, r_tr, r_p, r_g = map(np.array, (r_cs, r_nv, r_tw, r_tr, r_p, r_g))
    cover = []
    for s in range(300, 340):  # 부트스트랩 95% 구간이 참을 덮는 비율 (40회, 표본이 작아 다소 낮게 나올 수 있다)
        d = make_panel(seed=s)
        Ys, cs, gs_, _, _ = to_arrays(d, group_col="grade")
        a, b = ci(bootstrap(Ys, cs, gs_, B=100, seed=s))
        cover.append(a[0] <= truth(d) <= b[0])
    cover = float(np.mean(cover))
    print(f"\n[{R}회 반복] 평균 치우침(추정-참): DID {np.mean(r_cs - r_tr):+.3f} | TWFE {np.mean(r_tw - r_tr):+.3f} | 단순 전후 {np.mean(r_nv - r_tr):+.3f} | 위약 DID 평균 {r_p.mean():+.3f}")
    print(f"           집단별 평균 치우침(신입·중간·숙련): {np.round(r_g.mean(0), 3)} | 전체 효과 구간이 참을 덮은 비율(40회, 목표 0.95): {cover:.2f}")

    # ================= 독립 하드체크 =================
    # (1) 손계산 소형 사례: 처리 10->15, 비교 8->10  =>  DID = 5 - 2 = 3
    tiny = np.array([[9.0, 14.0], [11.0, 16.0], [7.0, 9.0], [9.0, 11.0]])
    assert abs(att_gt(tiny, np.array([1, 1, np.inf, np.inf]))[1][0][1] - 3.0) < 1e-12
    # (2) 2x2 DID == 상호작용 회귀 계수 (다른 경로: 최소제곱)
    g, t = 10, 12
    sel = (coh == g) | np.isinf(coh)
    yy, dd, pp = [], [], []
    for i in np.where(sel)[0]:
        for tt in (g - 1, t):
            yy.append(Y[i, tt]); dd.append(float(coh[i] == g)); pp.append(float(tt == t))
    yy, dd, pp = map(np.array, (yy, dd, pp))
    X = np.column_stack([np.ones_like(yy), dd, pp, dd * pp])
    beta = np.linalg.lstsq(X, yy, rcond=None)[0]
    assert abs(beta[3] - att_gt(Y, coh)[g][0][t]) < 1e-9, (beta[3], att_gt(Y, coh)[g][0][t])
    # (3) TWFE 이중 평균 제거 == 더미 변수 최소제곱
    N, T = Y.shape
    Dm = (np.arange(T)[None, :] >= coh[:, None]).astype(float)
    cols = [Dm.ravel()]
    cols += [(np.arange(N)[:, None] == k).repeat(T, 1).ravel().astype(float) for k in range(N)]
    cols += [(np.arange(T)[None, :] == k).repeat(N, 0).ravel().astype(float) for k in range(1, T)]
    beta2 = np.linalg.lstsq(np.column_stack(cols), Y.ravel(), rcond=None)[0][0]
    assert abs(beta2 - tw) < 1e-8, (beta2, tw)
    # (4) 참 효과 복원: 점추정 오차, 구간이 참을 덮음
    se_all = boot[:, 0].std(ddof=1)
    assert abs(est["overall"] - t_all) < 3 * se_all, (est["overall"], t_all, se_all)  # 3 표준오차(부트스트랩) 안
    assert lo[0] <= t_all <= hi[0], (lo[0], t_all, hi[0])
    assert abs(est_ny["overall"] - t_all) < 3 * se_all, est_ny["overall"]
    k_post = [k for k, e in enumerate(EVENT_E) if e >= 0 and not np.isnan(t_ev[k])]
    assert np.mean(np.abs(est["event"][k_post] - t_ev[k_post])) < 0.6, est["event"][k_post]  # 도입 후 주별 효과 평균 절대오차
    assert est["event"][EVENT_E.index(0)] < est["event"][EVENT_E.index(5)]  # 점증(램프업) 모양을 복원
    pre = [abs(est["event"][k]) for k, e in enumerate(EVENT_E) if e < -1]
    assert max(pre) < 0.9, pre  # 평행 추세: 도입 전 계수는 0 근처
    # (5) 단순 전후 비교는 추세 때문에 크게 치우침 (수치로)
    assert naive - t_all > 1.0, (naive, t_all)
    assert np.mean(r_nv - r_tr) > 1.0
    # (6) 반복에서 DID 는 불편, 위약은 0 근처, TWFE 는 동적 효과 때문에 DID 보다 더 치우침
    assert abs(np.mean(r_cs - r_tr)) < 0.06, np.mean(r_cs - r_tr)
    assert abs(r_p.mean()) < 0.06, r_p.mean()
    assert abs(np.mean(r_tw - r_tr)) > 3 * abs(np.mean(r_cs - r_tr)) and abs(np.mean(r_tw - r_tr)) > 0.15
    # (7) 위약 패널: 구간이 0 을 덮고, 단순 전후는 가짜 효과를 만든다
    assert plo[0] <= 0 <= phi[0] and abs(estp["overall"]) < 3 * bp[:, 0].std(ddof=1)
    assert naive_p > 1.0
    # (8) 집단별 효과: 구간이 참을 덮고, 순서(신입>중간>숙련)가 맞음; 다중 비교 보정이 효과
    for j in range(3):
        assert abs(g_est[j] - t_grade[j]) < 3 * se[j], (GRADES[j], g_est[j], t_grade[j], se[j])
    assert np.abs(r_g.mean(0)).max() < 0.12, r_g.mean(0)  # 반복 평균에서 집단별 추정도 불편
    assert cover >= 0.80, cover
    assert g_est[0] > g_est[1] > g_est[2]
    assert d_lo[0] > 0  # 신입-숙련 차이는 0 을 벗어남
    assert raw_f > 0.30 and bon_f < 0.09, (raw_f, bon_f)
    print(f"\nHARD CHECK OK: 전체 효과 추정 {est['overall']:.2f} (참 {t_all:.2f}, 구간 [{lo[0]:.2f},{hi[0]:.2f}]) · 단순 전후 {naive:.2f} 는 {naive - t_all:+.2f} 치우침 · "
          f"TWFE 평균 치우침 {np.mean(r_tw - r_tr):+.2f} vs DID {np.mean(r_cs - r_tr):+.2f} · 위약 {estp['overall']:+.2f}")
    sys.exit(0)
