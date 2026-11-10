"""누수 없이 나누기 — 분할 전 특징 선택 대 파이프라인 안 선택, 무작위 분할 대 시간·그룹 분할, 순열 라벨 잡음대.
실행: python code/leakage_split_check.py   (numpy · pandas · scipy · scikit-learn, 약 30초)
입력: 표본표(t0, group_id, label, 특징들) — 여기서는 합성. 출력: 분할 방식별 ROC-AUC · PR-AUC 표, 잡음대, 경고 문구.
scikit-learn 1.5 이상의 신기능(TunedThresholdClassifierCV 등)에 기대지 않는다 — 시간 분할은 시각 기준으로 직접 자른다.
합성 데이터의 점수는 방법 시연이다. 현장 성능이 아니다.
"""
import sys
import warnings
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.feature_selection import SelectKBest, f_classif
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupKFold, StratifiedKFold, TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")


def lr_pipe(k=None, C=0.05):
    steps = [StandardScaler()]
    if k:
        steps.append(SelectKBest(f_classif, k=k))
    steps.append(LogisticRegression(C=C, max_iter=500))
    return make_pipeline(*steps)


# ------------------------------------------------------------------ 분할기 (모두 (train_idx, test_idx) 쌍을 낸다)
def random_splits(y, n_splits=5, seed=0):
    return list(StratifiedKFold(n_splits, shuffle=True, random_state=seed).split(np.zeros(len(y)), y))


def group_splits(groups, n_splits=5):
    return list(GroupKFold(n_splits).split(np.zeros(len(groups)), groups=groups))


def time_splits(t, n_splits=5, gap=0.0):
    """시각 기준 확장 창: 시험 블록 k 의 시작 시각 이전 gap 시간은 학습에서 뺀다(관측 창+예측 구간 겹침 방지).
    표본이 불규칙한 시각에 있어도 동작한다. 시험 블록 = 시간순 표본 수 기준 (n_splits+1) 등분 중 뒤쪽 n_splits 개."""
    t = np.asarray(t, float)
    order = np.argsort(t, kind="stable")
    n = len(t)
    size = n // (n_splits + 1)
    out = []
    for k in range(n_splits):
        a = n - (n_splits - k) * size
        b = n - (n_splits - k - 1) * size if k < n_splits - 1 else n
        cut = t[order[a]]
        test = order[a:b]
        train = order[t[order] < cut - gap]
        out.append((train, test))
    return out


def score_splits(model, X, y, splits):
    """접힘별로 학습→시험 점수를 내고 접힘 평균. 시험 접힘에 양성이 없으면 건너뛴다."""
    aucs, aps = [], []
    for tr, te in splits:
        if len(set(y[tr])) < 2 or len(set(y[te])) < 2:
            continue
        m = clone(model).fit(X[tr], y[tr])
        p = m.predict_proba(X[te])[:, 1]
        aucs.append(roc_auc_score(y[te], p)); aps.append(average_precision_score(y[te], p))
    return float(np.mean(aucs)), float(np.mean(aps)), len(aucs)


# ------------------------------------------------------------------ 합성 데이터
def make_drift_data(seed=1, n=1500, p=60, n_groups=60, blocks=6):
    """시간 구조가 있는 표: ① 기간마다 양성 비율이 다르고(0.02~0.20) ② 느리게 흐르는 특징(드리프트)이 기간 평균을 따라가며
    ③ 같은 그룹(로트)의 표본은 공통 성향과 고유 지문을 공유한다. 진짜 신호는 특징 0 한 개(약함)뿐."""
    rng = np.random.default_rng(seed)
    t = np.sort(rng.uniform(0, 600, n))
    blk = np.minimum((t / 600 * blocks).astype(int), blocks - 1)
    base = np.array([0.02, 0.18, 0.04, 0.20, 0.03, 0.12])[:blocks]
    g = np.minimum((t / 600 * n_groups).astype(int) + rng.integers(0, 2, n), n_groups - 1)  # 이웃한 시각 = 같은 그룹
    gprop = rng.normal(0, 1.5, n_groups)
    logit = np.log(base[blk] / (1 - base[blk])) + gprop[g]
    y = (rng.random(n) < 1 / (1 + np.exp(-logit))).astype(int)
    X = rng.normal(size=(n, p))
    X[:, 0] += 0.6 * y                                   # 진짜(약한) 신호
    level = (base[blk] - base.mean()) / base.std()       # 기간 수준
    for j in range(1, 11):                               # 10 개는 기간 수준을 따라 흘러가는 특징 — 시간 지름길
        X[:, j] += 1.2 * level * rng.choice([-1, 1]) + rng.normal(0, 0.3, n).cumsum() * 0.0
    fp = rng.normal(0, 1.5, (n_groups, 40))              # 40 개는 그룹 지문(라벨과 무관한 그룹별 고정 값) — 같은 그룹이 학습에 있으면
    X[:, 11:51] += fp[g]                                 # 지문으로 그룹 성향을 외울 수 있고, 처음 보는 그룹에는 통하지 않는다
    return t, g, y, X


def make_stationary_data(seed=2, n=1500, p=40, n_groups=60):
    """대조군: 시간 구조·그룹 구조 없는 표. 진짜 신호(특징 0~2)는 같은 강도로 있다."""
    rng = np.random.default_rng(seed)
    t = np.sort(rng.uniform(0, 600, n))
    g = rng.integers(0, n_groups, n)
    y = (rng.random(n) < 0.08).astype(int)
    X = rng.normal(size=(n, p))
    X[:, :3] += 0.7 * y[:, None]
    return t, g, y, X


# ------------------------------------------------------------------ (A) 특징 선택 누수
def selection_leak_experiment(n_perm=20, n=300, p=500, k=20, seed=11):
    """순수 잡음 특징·순열(무작위) 라벨. 분할 전에 SelectKBest 를 걸면(누수) 점수가 오르고, 파이프라인 안에서 걸면 0.5 근처."""
    rng = np.random.default_rng(seed)
    X = rng.normal(size=(n, p))
    leak, clean = [], []
    for _ in range(n_perm):
        y = (rng.random(n) < 0.2).astype(int)
        Xl = SelectKBest(f_classif, k=k).fit_transform(X, y)              # 전체 데이터(시험 접힘 포함)로 선택 → 누수
        sp = random_splits(y, 5, seed=0)
        leak.append(score_splits(lr_pipe(None, C=0.1), Xl, y, sp)[0])
        clean.append(score_splits(lr_pipe(k, C=0.1), X, y, sp)[0])
    return np.array(leak), np.array(clean)


# ------------------------------------------------------------------ (B) 순열 라벨 잡음대
def permutation_band(model, X, y, splits_fn, n_perm=20, seed=5):
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n_perm):
        yp = rng.permutation(y)
        vals.append(score_splits(model, X, yp, splits_fn(yp))[0])
    return np.array(vals)


def split_warning(auc_random, auc_time, margin=0.05):
    if auc_random - auc_time > margin:
        return f"경고: 무작위 분할 {auc_random:.2f} 이 시간 분할 {auc_time:.2f} 보다 {auc_random - auc_time:.2f} 높다 — 시간 구조가 있다. 시간 분할 점수를 보고한다."
    return "시간 분할과 무작위 분할 점수 차가 작다."


# ------------------------------------------------------------------ (C) 설명: 순열 중요도는 연관
def importance_pair_demo(seed=3, n=2000):
    """홀드아웃 순열 중요도. 같은 특징을 복제해 넣으면 두 사본 각각의 중요도가 낮아진다(상관 특징 문제)."""
    rng = np.random.default_rng(seed)
    x = rng.normal(size=n); noise = rng.normal(size=(n, 3))
    y = (x + rng.normal(0, 1.0, n) > 0).astype(int)
    out = {}
    for name, X in (("단독", np.c_[x, noise]), ("복제 포함", np.c_[x, x + rng.normal(0, 0.05, n), noise])):
        tr, te = slice(0, n // 2), slice(n // 2, n)
        m = LogisticRegression(max_iter=500).fit(X[tr], y[tr])
        r = permutation_importance(m, X[te], y[te], scoring="roc_auc", n_repeats=30, random_state=0)
        out[name] = r.importances_mean
    return out


def main():
    # ---------- (A) 분할 전 선택 대 파이프라인 안 선택 ----------
    leak, clean = selection_leak_experiment()
    print(f"[A] 무작위 라벨 20회, 잡음 특징 500개, 상위 20개 선택 → ROC-AUC 평균  분할 전 선택(누수) {leak.mean():.3f} (최대 {leak.max():.3f}) / 파이프라인 안 {clean.mean():.3f} (최대 {clean.max():.3f})")

    # ---------- (B) 무작위 대 시간 대 그룹 (시간 구조 표) ----------
    t, g, y, X = make_drift_data()
    print(f"[B] 시간 구조 합성표: n={len(y)}, 양성 비율 {y.mean():.3f}, 그룹 {len(set(g))}개")
    model = lr_pipe(None, C=0.05)
    gap = 10.0  # 시각 단위(시간): 관측 창 + 예측 구간 만큼
    rows = {}
    for name, sp in (("무작위 5겹", random_splits(y)), ("그룹 5겹", group_splits(g)), (f"시간 확장 창(gap={gap:g})", time_splits(t, 5, gap))):
        auc, ap, nf = score_splits(model, X, y, sp)
        rows[name] = (auc, ap, nf)
        print(f"    {name:<22s} ROC-AUC {auc:.3f}  PR-AUC {ap:.3f}  (유효 접힘 {nf})  양성 비율 기준선 {y.mean():.3f}")
    band = permutation_band(model, X, y, lambda yp: random_splits(yp), n_perm=20)
    print(f"    순열 라벨 잡음대(무작위 5겹, 20회): 평균 {band.mean():.3f}, 범위 {band.min():.3f}~{band.max():.3f}")
    a_rand, a_grp, a_time = (rows[k][0] for k in rows)
    print("    " + split_warning(a_rand, a_time))

    # ---------- (C) 대조군: 시간·그룹 구조 없는 표 ----------
    t2, g2, y2, X2 = make_stationary_data()
    r2 = {n: score_splits(model, X2, y2, sp)[0] for n, sp in (("무작위", random_splits(y2)), ("그룹", group_splits(g2)), ("시간", time_splits(t2, 5, gap)))}
    print(f"[C] 대조군(구조 없음) ROC-AUC  무작위 {r2['무작위']:.3f} / 그룹 {r2['그룹']:.3f} / 시간 {r2['시간']:.3f}")
    print("    " + split_warning(r2["무작위"], r2["시간"]))

    # ---------- (D) 설명은 연관 ----------
    imp = importance_pair_demo()
    print(f"[D] 홀드아웃 순열 중요도(ROC-AUC 감소): 단독 특징 {imp['단독'][0]:.3f} / 복제 포함 시 사본 {imp['복제 포함'][0]:.3f}, {imp['복제 포함'][1]:.3f} (복제하면 각각 낮아진다)")

    # ================= 독립 하드체크 =================
    # 1) 누수를 심으면 점수가 오른다 / 파이프라인 안 선택은 순열 잡음대 안
    assert leak.mean() > clean.mean() + 0.08, (leak.mean(), clean.mean())
    assert abs(clean.mean() - 0.5) < 0.04 and clean.max() < leak.mean(), (clean.mean(), clean.max())
    # 2) 분할 구조 검사: 그룹 교집합 0, 시간 분할은 학습 최대 시각 + gap < 시험 최소 시각, 시험 접힘끼리 겹치지 않음
    for tr, te in group_splits(g):
        assert not (set(g[tr]) & set(g[te]))
    seen = set()
    for tr, te in time_splits(t, 5, gap):
        assert t[tr].max() + gap <= t[te].min() + 1e-9 and not (set(tr) & set(te))
        assert not (seen & set(te)); seen |= set(te)
    for tr, te in random_splits(y):
        assert not (set(tr) & set(te)) and len(tr) + len(te) == len(y)
    # 3) 시각 기준 시간 분할이 scikit-learn TimeSeriesSplit(gap) 과 규칙적 시각에서 같은 학습·시험 집합을 낸다(독립 구현 대조)
    tt = np.arange(600, dtype=float)
    mine = time_splits(tt, 5, gap=7)
    ref = list(TimeSeriesSplit(n_splits=5, gap=7).split(tt))
    for (a, b), (c, d) in zip(mine, ref):
        assert sorted(a) == sorted(c) and sorted(b) == sorted(d)
    # 4) 순열 잡음대: 진짜 신호가 있는 대조군의 점수는 잡음대 밖, 무작위 라벨 점수는 잡음대 안
    band2 = permutation_band(model, X2, y2, lambda yp: random_splits(yp), n_perm=20)
    assert r2["무작위"] > band2.max(), (r2["무작위"], band2.max())
    y_noise = np.random.default_rng(99).permutation(y2)
    s_noise = score_splits(model, X2, y_noise, random_splits(y_noise))[0]
    assert band2.min() - 0.05 <= s_noise <= band2.max() + 0.05
    # 5) 시간 구조가 있는 표에서는 무작위 > 시간 이고 경고가 켜진다. 대조군에서는 경고가 꺼진다
    assert a_rand - a_time > 0.05 and split_warning(a_rand, a_time).startswith("경고")
    assert not split_warning(r2["무작위"], r2["시간"]).startswith("경고")
    # 6) 그룹 구조가 있는 표에서는 무작위 > 그룹. 구조 없는 표에서는 차가 작다
    assert a_rand - a_grp > 0.03, (a_rand, a_grp)
    assert abs(r2["무작위"] - r2["그룹"]) < 0.04
    # 7) 설명 칸: 복제 특징을 넣으면 각 사본 중요도가 단독 때보다 낮다
    assert max(imp["복제 포함"][0], imp["복제 포함"][1]) < 0.8 * imp["단독"][0], imp
    print(f"HARD CHECK OK: 누수 {leak.mean():.2f} > 파이프라인 안 {clean.mean():.2f} · 분할 구조 검사(그룹 교집합 0, gap) · TimeSeriesSplit 대조 일치 · "
          f"잡음대 상단 {band2.max():.2f} < 신호 {r2['무작위']:.2f} · 무작위 {a_rand:.2f} > 시간 {a_time:.2f} 경고")


if __name__ == "__main__":
    sys.exit(main())
