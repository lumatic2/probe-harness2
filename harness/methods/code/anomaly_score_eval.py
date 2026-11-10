"""라벨이 없을 때 — 이상 점수(Isolation Forest · 마할라노비스 · 최대 z)와 그 평가.   실행: python code/anomaly_score_eval.py
입력: sensor_summary(entity_id, t, 특징…) 의 숫자 행렬, 정상 기간(학습·보정용), 선택으로 소수 라벨. 출력: 점수·순위·경보 여부 + 평가표.
평가 세 가지(라벨 수에 따라): ① 소수 라벨 있음 → PR-AUC · 정밀도@k  ② 라벨 없음 → 합성 이상을 심어 몇 위에 올리는지  ③ 정상 기간에서 하루 경보 수.
합성 데이터는 스스로 만든다. 결과는 방법 시연이며, 어느 탐지기가 현장에서 낫다는 근거가 아니다. 필요: numpy · pandas · scipy · scikit-learn.
"""
import sys
import warnings
import numpy as np
import pandas as pd
from scipy.spatial.distance import mahalanobis
from scipy.stats import spearmanr
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score

warnings.filterwarnings("ignore")
P = 15


def make_normal(rng, n, L):
    return rng.normal(size=(n, P)) @ L.T


def make_world(seed=0):
    """상관 있는 15 차원 정상 분포 + 정상 학습 3000 / 경보율 보정 2000 / 시험 6000(60 일 x 100 행).
    시험 구간에 합성 이상 3 구간을 심는다: 특징 2·5·9 를 각 열 표준편차의 +4 배만큼 평균 이동(90 행). 이상과 무관한 '불량' 라벨 3% 도 따로 둔다."""
    rng = np.random.default_rng(seed)
    A = rng.normal(size=(P, P)); L = np.linalg.cholesky(A @ A.T / P + np.eye(P))
    train, calib = make_normal(rng, 3000, L), make_normal(rng, 2000, L)
    test = make_normal(rng, 6000, L)
    sd = train.std(axis=0)
    injected = np.zeros(6000, bool)
    for a in (900, 2700, 4800):
        rows = np.arange(a, a + 30)
        test[np.ix_(rows, [2, 5, 9])] += 4.0 * sd[[2, 5, 9]]
        injected[rows] = True
    unrelated_fail = rng.random(6000) < 0.03                      # 이상과 무관하게 일어나는 불량(이상 ≠ 불량 시연)
    day = np.repeat(np.arange(60), 100)
    return train, calib, test, injected, unrelated_fail, day


class Detector:
    def __init__(self, kind, seed=0):
        self.kind, self.seed = kind, seed

    def fit(self, X):
        self.mu, self.sd = X.mean(0), X.std(0)
        if self.kind == "iforest":
            self.m = IsolationForest(n_estimators=300, random_state=self.seed).fit(X)
        elif self.kind == "mahalanobis":
            self.prec = np.linalg.inv(np.cov(X, rowvar=False))
        return self

    def score(self, X):
        """클수록 이상."""
        if self.kind == "iforest":
            return -self.m.score_samples(X)
        if self.kind == "mahalanobis":
            d = X - self.mu
            return np.sqrt(np.einsum("ij,jk,ik->i", d, self.prec, d))
        return np.abs((X - self.mu) / self.sd).max(1)             # 'maxz': 단순 기준선


def top_k_precision(score, truth, k):
    idx = np.argsort(-score, kind="stable")[:k]
    return float(truth[idx].mean())


def evaluate(score, injected, fail, day, thr):
    flag = score >= thr
    return {
        "inject_P@90": top_k_precision(score, injected, int(injected.sum())),                    # 심은 90 행이 상위 90 에 들어온 비율
        "inject_AP": float(average_precision_score(injected, score)),
        "fail_AP": float(average_precision_score(fail, score)), "fail_prev": float(fail.mean()),  # 불량 라벨로 재면?
        "flag_rate": float(flag.mean()),
    }


def main():
    train, calib, test, injected, fail, day = make_world(0)
    contamination = 0.01                                           # 우리가 정한 경보 비율(추정된 불량률이 아니다)
    res, det, thr = {}, {}, {}
    for kind in ("iforest", "mahalanobis", "maxz"):
        det[kind] = Detector(kind, seed=0).fit(train)
        thr[kind] = float(np.quantile(det[kind].score(calib), 1 - contamination))   # 정상 보정 구간의 상위 1% 점수
        res[kind] = evaluate(det[kind].score(test), injected, fail, day, thr[kind])
    print(f"정상 학습 {len(train)}행, 보정 {len(calib)}행, 시험 {len(test)}행(합성 이상 {int(injected.sum())}행 = +4σ 이동 3 구간), 경보 비율을 {contamination:.0%} 로 정함\n")
    print("탐지기        심은 이상 P@90  심은 이상 AP  경보율(시험 전체)  | 이상과 무관한 불량 라벨 AP (기준선=불량 비율)")
    for kind, r in res.items():
        print(f"{kind:<12s}  {r['inject_P@90']:12.3f}  {r['inject_AP']:11.3f}  {r['flag_rate']:15.4f}    | {r['fail_AP']:.3f} ({r['fail_prev']:.3f})")

    # 정상 기간 하루 경보 수 (시험의 정상 행만, 하루 100 행)
    normal_days = day[~injected]
    perday = pd.Series(det["iforest"].score(test)[~injected] >= thr["iforest"]).groupby(normal_days).sum()
    print(f"\n정상 행만 본 하루(100 행) 경보 수: 평균 {perday.mean():.2f}, 최대 {perday.max()}  (경보 비율 {contamination:.0%} → 기대 {100 * contamination:.1f})")

    # 소수 라벨: 엔지니어가 검토해 확인한 진짜 이상이 12 건뿐일 때도 PR-AUC 로 잴 수 있다
    rng = np.random.default_rng(3)
    labeled_pos = rng.choice(np.where(injected)[0], 12, replace=False)
    y_sparse = np.zeros(len(test), int); y_sparse[labeled_pos] = 1
    unreviewed = injected & (y_sparse == 0)                        # 이상인데 아직 확인 안 된 행: 정답표에서는 음성으로 취급된다
    ap_sparse = average_precision_score(y_sparse, det["iforest"].score(test))
    print(f"소수 라벨 12 건만 확인된 경우 Isolation Forest AP {ap_sparse:.3f} (확인 안 된 진짜 이상 {int(unreviewed.sum())}행이 음성으로 세어진다 → 라벨이 덜 찼을 때 AP 는 하한이다. 라벨을 다 아는 심은 이상 AP {res['iforest']['inject_AP']:.3f})")

    # 안정성: 씨앗 3개, 열 순서 섞기
    sc = [Detector("iforest", s).fit(train).score(test) for s in (0, 1, 2)]
    rho_seed = min(spearmanr(sc[0], sc[1])[0], spearmanr(sc[0], sc[2])[0], spearmanr(sc[1], sc[2])[0])
    perm = np.random.default_rng(5).permutation(P)
    sc_perm = Detector("iforest", 0).fit(train[:, perm]).score(test[:, perm])
    rho_perm = spearmanr(sc[0], sc_perm)[0]
    print(f"안정성: 씨앗 3개 점수 순위상관 최소 {rho_seed:.3f} / 열 순서 섞기 순위상관 {rho_perm:.3f}")

    # ===================== 독립 하드체크 =====================
    # 1) 마할라노비스: 코드의 einsum 구현 == scipy.spatial.distance.mahalanobis (다른 구현) 5행 대조
    VI = np.linalg.inv(np.cov(train, rowvar=False))
    ms = det["mahalanobis"].score(test)
    for i in (0, 900, 1500, 2710, 5999):
        assert abs(ms[i] - mahalanobis(test[i], train.mean(0), VI)) < 1e-9
    # 2) 심은 +4σ 이동은 상위 k 에 들어온다 (정상 90 행 vs 이상 90 행 순위가 거의 분리)
    assert res["mahalanobis"]["inject_P@90"] > 0.8 and res["iforest"]["inject_P@90"] > 0.5 and res["maxz"]["inject_P@90"] > 0.5, res
    # 3) 무작위 점수는 기준선 수준: 심은 이상 AP ≈ 심은 비율(1.5%), 이상과 무관한 불량 라벨 AP ≈ 불량 비율 (이상 점수가 불량을 맞히지 못함)
    rs = np.random.default_rng(1).random(len(test))
    assert abs(average_precision_score(injected, rs) - injected.mean()) < 0.02
    for kind in res:
        assert res[kind]["fail_AP"] < res[kind]["fail_prev"] * 2.0, (kind, res[kind])
    # 4) 정상 기간 경보율 ≈ 정한 비율 (정상 시험 행에서 0.5%~2% 사이), 정상 날의 하루 경보 수 평균 ≈ 100 x 비율
    for kind in res:
        rate = float((det[kind].score(test)[~injected] >= thr[kind]).mean())
        assert 0.004 < rate < 0.02, (kind, rate)
    assert 0.5 < perday.mean() < 2.0
    # 5) 점수 안정성: 씨앗 3 개 순위상관, 열 순서를 섞어도 순위상관이 높다
    assert rho_seed > 0.9 and rho_perm > 0.9, (rho_seed, rho_perm)
    # 6) 소수 라벨 평가는 확인 안 된 진짜 이상을 음성으로 세어 AP 를 낮춘다(과소평가 방향)
    assert ap_sparse < res["iforest"]["inject_AP"]
    print(f"HARD CHECK OK: 마할라노비스 scipy 대조 · 심은 +4σ 이상 P@90 (IF {res['iforest']['inject_P@90']:.2f}, 마할라노비스 {res['mahalanobis']['inject_P@90']:.2f}, 최대 z {res['maxz']['inject_P@90']:.2f}) · "
          f"무작위·불량 라벨 AP 는 기준선 수준 · 정상 경보율 ≈ {contamination:.0%} · 씨앗/열 순서 순위상관 {min(rho_seed, rho_perm):.2f}+")


if __name__ == "__main__":
    sys.exit(main())
