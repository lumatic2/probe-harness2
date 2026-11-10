"""불균형일 때 맞았는지 재기 + 임계값을 비용으로 정하기 — PR-AUC · 정밀도@k · 재현율@k · Brier · 비용 기준 임계값 · 두 기본 정책 비교.
실행: python code/imbalanced_eval.py   (numpy · pandas · scikit-learn, 약 10초)
입력: scores(sample_id, date, score 또는 prob, label), 인자 k_per_day, c_fp, c_fn.  출력: 지표 표, 비용 표, 채택/미채택 판정.
임계값은 scikit-learn 의 TunedThresholdClassifierCV(1.5 이상)에 기대지 않고 직접 계산한다(버전 미확인 환경에서도 돈다).
비용 규칙: 맞은 판정의 비용은 0, 오경보 1건 c_fp, 놓침 1건 c_fn. 경보 규칙은 prob >= 임계값.
합성 데이터의 결과는 방법 시연이다. 현장 성능이 아니다.
"""
import sys
import warnings
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

warnings.filterwarnings("ignore")


# ------------------------------------------------------------------ 지표
def pr_auc(y, s):
    """평균 정밀도(AP) = Σ (R_n - R_{n-1}) P_n, 서로 다른 점수값마다 한 점(동점은 한 덩어리). 점수가 전부 같으면 양성 비율."""
    y, s = np.asarray(y, int), np.asarray(s, float)
    order = np.argsort(-s, kind="stable")
    y, s = y[order], s[order]
    last = np.r_[np.where(np.diff(s) != 0)[0], len(s) - 1]       # 각 점수 덩어리의 마지막 위치
    tp = np.cumsum(y)[last]; n_pred = last + 1
    prec, rec = tp / n_pred, tp / y.sum()
    return float(np.sum(np.diff(np.r_[0.0, rec]) * prec))


def precision_recall_at_k(df, k, score="score", label="label", day="date"):
    """날짜별로 점수 상위 k 건(동점은 입력 순서)을 본다. 정밀도@k = 상위 k 중 사건 수 / k(그날 표본이 k 보다 적으면 그 수),
    재현율@k = 상위 k 중 사건 수 / 그날 전체 사건 수(사건이 없는 날은 평균에서 뺀다). 날짜별 평균."""
    ps, rs = [], []
    for _, g in df.groupby(day, sort=True):
        top = g.sort_values(score, ascending=False, kind="stable").head(k)
        hits, total = top[label].sum(), g[label].sum()
        ps.append(hits / len(top))
        if total > 0:
            rs.append(hits / total)
    return float(np.mean(ps)), float(np.mean(rs)) if rs else float("nan")


def brier(y, p):
    return float(np.mean((np.asarray(p, float) - np.asarray(y, float)) ** 2))


def brier_prior(y):
    """사전확률 상수 예측(양성 비율)의 Brier — 모델이 이겨야 하는 기준."""
    y = np.asarray(y, float)
    return brier(y, np.full(len(y), y.mean()))


def bootstrap_ci(y, s, fn, n_boot=500, seed=0):
    rng = np.random.default_rng(seed)
    y, s = np.asarray(y), np.asarray(s)
    vals = []
    for _ in range(n_boot):
        i = rng.integers(0, len(y), len(y))
        if y[i].min() == y[i].max():
            continue
        vals.append(fn(y[i], s[i]))
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def calibration_table(y, p, bins=5):
    """예측 확률 구간(분위수)별 평균 예측 vs 실제 양성 비율."""
    d = pd.DataFrame({"y": y, "p": p})
    d["bin"] = pd.qcut(d["p"].rank(method="first"), bins, labels=False)
    return d.groupby("bin").agg(n=("y", "size"), mean_pred=("p", "mean"), observed=("y", "mean"))


# ------------------------------------------------------------------ 비용
def cost_at(y, prob, thr, c_fp, c_fn):
    y, prob = np.asarray(y, int), np.asarray(prob, float)
    alarm = prob >= thr
    return float(c_fp * np.sum(alarm & (y == 0)) + c_fn * np.sum(~alarm & (y == 1)))


def derived_threshold(c_fp, c_fn):
    """보정된 확률일 때 기대비용 최소 임계값: 경보 (1-p)c_fp < 통과 p c_fn  ⇔  p > c_fp/(c_fp+c_fn). 맞은 판정 비용 0 가정."""
    return c_fp / (c_fp + c_fn)


def tune_threshold(y_val, prob_val, c_fp, c_fn):
    """검증 구간에서 비용이 최소인 임계값(보정 안 된 점수용). 후보 = 검증 점수값들 + 양끝. 동률이면 큰 임계값(경보 적은 쪽)."""
    cands = np.unique(np.r_[0.0, np.asarray(prob_val, float), 1.0 + 1e-12])
    costs = np.array([cost_at(y_val, prob_val, c, c_fp, c_fn) for c in cands])
    return float(cands[np.where(costs == costs.min())[0][-1]]), float(costs.min())


def policy_compare(y, prob, thr, c_fp, c_fn):
    y = np.asarray(y, int)
    model = cost_at(y, prob, thr, c_fp, c_fn)
    all_pass = float(c_fn * y.sum())                    # 아무것도 경보 안 함: 사건을 전부 놓침
    all_alarm = float(c_fp * (len(y) - y.sum()))        # 전부 경보: 정상 표본이 전부 오경보
    best_plain = min(all_pass, all_alarm)
    return {"model": model, "all_pass": all_pass, "all_alarm": all_alarm,
            "verdict": "채택" if model < best_plain else "미채택 — 모델이 단순 정책을 못 이긴다"}


# ------------------------------------------------------------------ 합성 데이터
def make_days(seed=4, days=120, per_day=40, prevalence=0.05, signal=1.5, p=12):
    """날짜 × 하루 per_day 건. 특징 p 개 중 앞 3개가 신호. 시간 순서대로 반환."""
    rng = np.random.default_rng(seed)
    n = days * per_day
    day = np.repeat(np.arange(days), per_day)
    y = (rng.random(n) < prevalence).astype(int)
    X = rng.normal(size=(n, p))
    X[:, :3] += signal * y[:, None] * np.array([1.0, 0.7, 0.5])
    return pd.DataFrame(X, columns=[f"f{i}" for i in range(p)]).assign(date=day, label=y)


def fit_predict(train, test, balanced=False):
    cols = [c for c in train.columns if c.startswith("f")]
    m = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=500, class_weight="balanced" if balanced else None))
    m.fit(train[cols], train["label"])
    return m.predict_proba(test[cols])[:, 1]


def report(name, df, prob, k, c_fp, c_fn, thr):
    d = df.assign(score=prob)
    ap = pr_auc(d["label"], prob); lo, hi = bootstrap_ci(d["label"], prob, pr_auc, 300)
    pk, rk = precision_recall_at_k(d, k)
    pc = policy_compare(d["label"], prob, thr, c_fp, c_fn)
    print(f"  [{name}] 양성 비율 {d['label'].mean():.3f} | PR-AUC {ap:.3f} (95% {lo:.3f}~{hi:.3f}) ROC-AUC {roc_auc_score(d['label'], prob):.3f} | "
          f"정밀도@{k} {pk:.3f} 재현율@{k} {rk:.3f} | Brier {brier(d['label'], prob):.4f} (상수 예측 {brier_prior(d['label']):.4f})")
    print(f"      비용(c_fp={c_fp:g}, c_fn={c_fn:g}, 임계 {thr:.3f}): 모델 {pc['model']:.0f} / 전부 통과 {pc['all_pass']:.0f} / 전부 경보 {pc['all_alarm']:.0f} → {pc['verdict']}")
    return pc


def main():
    c_fp, c_fn, k = 1.0, 10.0, 5
    df = make_days()
    n = len(df)
    train, val, test = df.iloc[: n // 2], df.iloc[n // 2: 3 * n // 4], df.iloc[3 * n // 4:]
    print(f"합성 {n}건, 학습/검증/시험 = 시간순 50/25/25%.  하루 {k} 건을 본다고 가정.")
    for tag, bal in (("일반 로지스틱", False), ("균형 가중 로지스틱(확률이 부풀려짐)", True)):
        pv, pt = fit_predict(train, val, bal), fit_predict(train, test, bal)
        thr_tuned, _ = tune_threshold(val["label"], pv, c_fp, c_fn)
        print(f"- {tag}: 유도 임계 p*={derived_threshold(c_fp, c_fn):.3f} / 검증에서 고른 임계 {thr_tuned:.3f}")
        report("시험 · p* 적용", test, pt, k, c_fp, c_fn, derived_threshold(c_fp, c_fn))
        report("시험 · 검증 임계 적용", test, pt, k, c_fp, c_fn, thr_tuned)
    weak = make_days(seed=8, signal=0.15)
    tr, va, te = weak.iloc[: n // 2], weak.iloc[n // 2: 3 * n // 4], weak.iloc[3 * n // 4:]
    pv, pt = fit_predict(tr, va), fit_predict(tr, te)
    thr_w, _ = tune_threshold(va["label"], pv, c_fp, c_fn)
    print("- 신호가 거의 없는 데이터(약한 모델):")
    pc_weak = report("시험 · 검증 임계 적용", te, pt, k, c_fp, c_fn, thr_w)

    # ===================== 독립 하드체크 =====================
    # 1) 손계산 소형 사례 — y=[1,0,1,0,0,0], 점수 0.9..0.4
    y = np.array([1, 0, 1, 0, 0, 0]); sc = np.array([0.9, 0.8, 0.7, 0.6, 0.5, 0.4])
    assert abs(pr_auc(y, sc) - (1 + 2 / 3) / 2) < 1e-12                       # 양성이 1위·3위 → (1/1 + 2/3)/2
    assert abs(pr_auc(y, sc) - average_precision_score(y, sc)) < 1e-12        # scikit-learn 과도 일치
    tiny = pd.DataFrame({"date": [0] * 6, "score": sc, "label": y})
    assert precision_recall_at_k(tiny, 2) == (0.5, 0.5)                       # 상위 2 중 1건 / 사건 2건 중 1건
    assert precision_recall_at_k(tiny, 3) == (2 / 3, 1.0)
    two = pd.DataFrame({"date": [0, 0, 0, 1, 1, 1], "score": [3, 2, 1, 3, 2, 1], "label": [1, 0, 0, 0, 0, 0]})
    assert precision_recall_at_k(two, 1) == (0.5, 1.0)                        # 1일차 1/1, 2일차 0/1 → 정밀도 0.5 / 재현율은 사건 있는 날만 → 1.0
    assert abs(brier(y, sc) - 1.51 / 6) < 1e-12 and abs(brier_prior(y) - 12 / 9 / 6) < 1e-12
    assert cost_at(y, sc, 0.65, 1, 10) == 1.0                                 # 0.9,0.8,0.7 경보 → 오경보 1(0.8), 놓침 0
    pc = policy_compare(y, sc, 0.65, 1, 10)
    assert (pc["model"], pc["all_pass"], pc["all_alarm"]) == (1.0, 20.0, 4.0) and pc["verdict"] == "채택"
    assert tune_threshold(y, sc, 1, 10) == (0.7, 1.0)                         # 임계 0.7 이상(0.9,0.8,0.7)이 비용 1 로 최소, 0.9 는 놓침 1건 = 10
    # 2) 불변·기준선 성질
    rng = np.random.default_rng(0)
    yy = (rng.random(20000) < 0.05).astype(int); ss = rng.random(20000)
    assert abs(pr_auc(yy, np.zeros(20000)) - yy.mean()) < 1e-12               # 점수가 전부 같으면 AP = 양성 비율
    assert abs(pr_auc(yy, ss) - yy.mean()) < 0.015                            # 무작위 점수도 양성 비율 근처
    assert pr_auc(yy, yy.astype(float)) == 1.0                                # 정답 점수
    assert abs(pr_auc(yy, np.log(ss + 1e-9)) - pr_auc(yy, ss)) < 1e-12        # 단조 변환 불변
    dd = pd.DataFrame({"date": np.repeat(np.arange(200), 100), "label": yy, "score": ss})
    p1, _ = precision_recall_at_k(dd, 10); p2, _ = precision_recall_at_k(dd.assign(score=np.sqrt(ss)), 10)
    assert p1 == p2 and abs(p1 - yy.mean()) < 0.02                            # 단조 변환에 정밀도@k 불변, 무작위면 양성 비율 근처
    assert abs(brier(yy, np.sqrt(ss)) - brier(yy, ss)) > 1e-3                 # Brier 는 변한다
    # 3) 유도한 임계값 == 격자 탐색 최소 비용 (기대비용을 참 확률로 정확히 계산 — 표본 잡음 없음)
    pop = np.random.default_rng(1).beta(0.6, 6, 50000)                         # 참 확률 모집단
    grid = np.linspace(0, 1, 2001)
    for cf, cn in ((1, 1), (1, 10), (5, 1), (1, 100), (3, 7)):
        exp_cost = lambda t: float(np.sum(np.where(pop >= t, (1 - pop) * cf, pop * cn)))
        costs = np.array([exp_cost(t) for t in grid])
        ps = derived_threshold(cf, cn)
        assert exp_cost(ps) <= costs.min() + 1e-6 * costs.min(), (cf, cn, exp_cost(ps), costs.min())   # 유도 임계 비용 = 격자 최소
    # 표본 라벨(Bernoulli)로 센 실제 비용에서도 p* 가 격자 최소의 1% 이내
    yb = (np.random.default_rng(2).random(pop.size) < pop).astype(int)
    for cf, cn in ((1, 10), (5, 1)):
        costs = np.array([cost_at(yb, pop, t, cf, cn) for t in grid])
        assert cost_at(yb, pop, derived_threshold(cf, cn), cf, cn) <= costs.min() * 1.01
    # 4) 극단: c_fn → ∞ 이면 임계 → 0(전부 경보), c_fp → ∞ 이면 임계 → 1(전부 통과)
    assert derived_threshold(1, 1e9) < 1e-8 and derived_threshold(1e9, 1) > 1 - 1e-8
    # 5) 약한 모델은 단순 정책을 못 이기면 미채택, 강한 모델은 채택
    assert pc_weak["verdict"].startswith("미채택"), pc_weak
    pt_s = fit_predict(train, test); pv_s = fit_predict(train, val)
    assert policy_compare(test["label"], pt_s, tune_threshold(val["label"], pv_s, c_fp, c_fn)[0], c_fp, c_fn)["verdict"] == "채택"
    # 6) 균형 가중으로 학습한 확률은 부풀려져 Brier 가 상수 예측보다 나쁘고, 일반 로지스틱은 상수 예측보다 좋다
    pt_b = fit_predict(train, test, True)
    assert brier(test["label"], pt_b) > brier_prior(test["label"]) > brier(test["label"], pt_s)
    # 7) 임계값은 검증에서 고르고 시험에서 보고: 시험 점수로 직접 고른 임계의 비용은 항상 검증 임계 비용 이하(낙관 편향이 있다는 증거)
    _, best_on_test = tune_threshold(test["label"], pt_s, c_fp, c_fn)
    thr_v = tune_threshold(val["label"], pv_s, c_fp, c_fn)[0]
    assert best_on_test <= cost_at(test["label"], pt_s, thr_v, c_fp, c_fn)
    print(f"HARD CHECK OK: 손계산 AP {(1 + 2 / 3) / 2:.4f}·P@2 0.5·Brier {1.51 / 6:.4f}·비용 1/20/4 일치 · 유도 임계 = 격자 최소 비용(5개 비용비) · 약한 모델 미채택 · 균형 가중 Brier > 상수 예측")


if __name__ == "__main__":
    sys.exit(main())
