"""표준 경로 이탈 찾기 — 경로 변형 집계와 적합도(표준 라우트 대조).  실행: python code/route_conformance.py
입력 lot_hist : lot_id, step, track_in  (+ product 또는 별도 lot_product 표)   한 행 = 한 번의 공정 처리, track_in 으로 순서를 만든다
입력 std      : {product: [표준 라우트 step 목록(재진입이면 같은 이름이 여러 번)]}
입력 outcome  : lot_id, product, yield_pct, ct_h    (이탈 로트의 결과 비교용)
적합도(단순 정의, 추론): LCS 기반.  dist = len(실제)+len(표준)−2·LCS,  fitness = 1 − dist/(len(실제)+len(표준)).
   pm4py 정렬 기반 적합도·토큰 재생 적합도와 같은 값이 아니다 — 수치를 서로 바꿔 인용하지 않는다.
"""
from collections import Counter
from functools import lru_cache

import numpy as np
import pandas as pd

STD = {
    "A": ["PHOTO", "ETCH", "CLEAN", "DEP", "CMP", "PHOTO", "ETCH", "CLEAN", "DEP", "CMP", "INSP"],   # 2층 재진입
    "B": ["PHOTO", "ETCH", "CLEAN", "DEP", "CMP", "INSP"],
}


# ---------------------------------------------------------------- 계산 본체
def lot_variants(h):
    """로트별 실제 step 순서(튜플).  track_in 오름차순, 같은 시각이면 입력 순서 유지(mergesort)."""
    s = h.sort_values(["lot_id", "track_in"], kind="mergesort")
    return s.groupby("lot_id")["step"].agg(tuple)


def variant_table(var, product, std):
    """제품별 경로 변형 빈도.  share = 제품 안 비중, cum_share = 많은 순 누적 비중, is_std = 표준과 정확히 같은가."""
    d = pd.DataFrame({"product": product.reindex(var.index), "variant": var})
    t = d.groupby(["product", "variant"]).size().rename("n_lots").reset_index()
    t["share"] = t["n_lots"] / t.groupby("product")["n_lots"].transform("sum")
    t = t.sort_values(["product", "n_lots"], ascending=[True, False], kind="mergesort").reset_index(drop=True)
    t["cum_share"] = t.groupby("product")["share"].cumsum()
    t["is_std"] = [v == tuple(std[p]) for p, v in zip(t["product"], t["variant"])]
    t["len"] = t["variant"].map(len)
    return t


def lcs_len(a, b):
    """최장 공통 부분수열 길이 (표준 DP)."""
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b, 1):
            cur.append(prev[j - 1] + 1 if x == y else max(prev[j], cur[j - 1]))
        prev = cur
    return prev[-1]


def fitness(actual, std):
    n = len(actual) + len(std)
    return 1.0 - (n - 2 * lcs_len(actual, std)) / n


def classify(actual, std):
    """이탈 유형(규칙 기반, 추론): 생략 = 표준에 있는데 실제에 없는 step 만 있음 · 재방문 = 표준 step 이 더 많이 나옴 ·
    미등록 step = 표준에 없는 이름이 있음 · 순서 바뀜 = 개수는 같고 순서만 다름 · 복합 = 위가 섞임 · 적합 = 완전 일치."""
    if tuple(actual) == tuple(std):
        return "적합", {}, {}
    ca, cs = Counter(actual), Counter(std)
    miss, extra = cs - ca, ca - cs
    unknown = {k: v for k, v in extra.items() if k not in cs}
    revisit = {k: v for k, v in extra.items() if k in cs}
    kinds = [bool(miss), bool(unknown), bool(revisit)]
    if not any(kinds):
        return "순서 바뀜", {}, {}
    if sum(kinds) > 1:
        return "복합", dict(miss), dict(extra)
    return ("생략" if miss else "미등록 step" if unknown else "재방문"), dict(miss), dict(extra)


def conformance_table(var, product, std):
    rows = []
    for lot, v in var.items():
        s = std[product[lot]]
        kind, miss, extra = classify(v, s)
        rows.append((lot, product[lot], len(v), len(s), fitness(v, s), kind, miss, extra))
    return pd.DataFrame(rows, columns=["lot_id", "product", "n_steps", "n_std", "fitness", "dev_type", "missing", "extra"]).set_index("lot_id")


def transition_table(var, product, std):
    """제품별 '다음 step' 전이(직접 뒤따름) 빈도.  allowed = 그 제품 표준 라우트에 있는 인접 쌍인가.
    표준에 없는 전이를 가진 로트 = 전이 기반 이탈 후보.  한계: 통째 생략처럼 인접 쌍이 모두 합법이면 못 잡는다."""
    allowed = {p: set(zip(r, r[1:])) for p, r in std.items()}
    cnt = Counter()
    bad_lots = set()
    for lot, v in var.items():
        p = product[lot]
        for e in zip(v, v[1:]):
            cnt[(p, e[0], e[1])] += 1
            if e not in allowed[p]:
                bad_lots.add(lot)
    t = pd.DataFrame([(p, a, b, n, (a, b) in allowed[p]) for (p, a, b), n in cnt.items()],
                     columns=["product", "from_step", "to_step", "n", "allowed"])
    return t.sort_values(["allowed", "n"], ascending=[True, False]).reset_index(drop=True), bad_lots


def outcome_compare(conf, outcome, col="yield_pct", n_boot=4000, seed=5):
    """이탈 vs 적합 로트의 결과 비교 — 단순 차이(raw)와 제품으로 층화한 차이(strat).
    strat = 제품별 (이탈 평균 − 적합 평균) 을 그 제품의 이탈 로트 수로 가중평균.  둘 다 '상관'이다. 원인 판정이 아니다."""
    d = conf[["product", "dev_type"]].join(outcome.set_index("lot_id")[col])
    d["dev"] = d["dev_type"] != "적합"
    raw = d.loc[d.dev, col].mean() - d.loc[~d.dev, col].mean()
    num = den = 0.0
    var_sum = 0.0
    for p, g in d.groupby("product"):
        a, b = g.loc[g.dev, col], g.loc[~g.dev, col]
        if len(a) and len(b):
            num += len(a) * (a.mean() - b.mean())
            den += len(a)
            var_sum += len(a) ** 2 * (a.var(ddof=1) / len(a) + b.var(ddof=1) / len(b)) if len(a) > 1 else 0.0
    strat = num / den
    se = np.sqrt(var_sum) / den
    rng = np.random.default_rng(seed)
    x, y = d.loc[d.dev, col].to_numpy(), d.loc[~d.dev, col].to_numpy()
    bs = [rng.choice(x, len(x)).mean() - rng.choice(y, len(y)).mean() for _ in range(n_boot)]
    return {"raw": raw, "raw_ci": tuple(np.percentile(bs, [2.5, 97.5])), "strat": strat, "strat_se": se,
            "n_dev": int(d.dev.sum()), "n_ok": int((~d.dev).sum())}


# ---------------------------------------------------------------- 합성 데이터
def make_demo(seed=20261112, n_lots=600):
    """합성 로트 경로.  제품 A 60%·B 40%.  이탈을 26로트 심는다(정답표 planted):
    A 6(생략·재방문·순서 바뀜·미등록 step 각 1 + 층 통째 생략 2), B 20(네 유형 각 5).
    수율은 제품이 정하고(A 90 · B 80, sd 2) 이탈 자체의 효과는 0 — 이탈이 B 에 몰려 있어 단순 비교만 속는다."""
    rng = np.random.default_rng(seed)
    t0 = pd.Timestamp("2026-09-01")
    prod = np.where(rng.random(n_lots) < 0.6, "A", "B")
    ids = [f"L{i:04d}" for i in range(n_lots)]
    ia = [i for i in range(n_lots) if prod[i] == "A"]
    ib = [i for i in range(n_lots) if prod[i] == "B"]
    types4 = ["생략", "재방문", "순서 바뀜", "미등록 step"]
    planted = {}
    for k, i in enumerate(rng.choice(ia, 6, replace=False)):
        planted[int(i)] = types4[k] if k < 4 else "층 생략"
    for k, i in enumerate(rng.choice(ib, 20, replace=False)):
        planted[int(i)] = types4[k % 4]
    rows, out = [], []
    for i in range(n_lots):
        seq = list(STD[prod[i]])
        kind = planted.get(i)
        if kind == "생략":
            seq.pop(2)                                    # CLEAN 하나 빠짐
        elif kind == "재방문":
            seq.insert(2, "ETCH")                         # ETCH 재작업
        elif kind == "순서 바뀜":
            seq[2], seq[3] = seq[3], seq[2]               # CLEAN ↔ DEP
        elif kind == "미등록 step":
            seq.insert(3, "TEST")
        elif kind == "층 생략":
            seq = seq[:5] + seq[10:]                      # 2층(PHOTO-ETCH-CLEAN-DEP-CMP) 통째 생략 → B 라우트와 같은 모양
        t = t0 + pd.Timedelta(hours=float(rng.uniform(0, 24 * 60)))
        ct = 0.0
        for s in seq:
            rows.append((ids[i], s, t))
            dt = float(rng.exponential(10.0)) + 1.0
            ct += dt
            t += pd.Timedelta(minutes=int(dt * 60))
        out.append((ids[i], prod[i], float(rng.normal(90.0 if prod[i] == "A" else 80.0, 2.0)), ct))
    h = pd.DataFrame(rows, columns=["lot_id", "step", "track_in"]).sample(frac=1.0, random_state=1).reset_index(drop=True)  # 섞어 둔다
    outcome = pd.DataFrame(out, columns=["lot_id", "product", "yield_pct", "ct_h"])
    return h, outcome, {ids[i]: k for i, k in planted.items()}


def edit_dist_indel(a, b):
    """하드체크용: LCS 와 다른 경로 — 삽입·삭제만 허용하는 편집거리를 재귀(메모이제이션)로 직접 계산."""
    @lru_cache(maxsize=None)
    def f(i, j):
        if i == len(a):
            return len(b) - j
        if j == len(b):
            return len(a) - i
        if a[i] == b[j]:
            return f(i + 1, j + 1)
        return 1 + min(f(i + 1, j), f(i, j + 1))
    return f(0, 0)


if __name__ == "__main__":
    h, outcome, planted = make_demo()
    prod = outcome.set_index("lot_id")["product"]
    var = lot_variants(h)
    vt = variant_table(var, prod, STD)
    conf = conformance_table(var, prod, STD)
    tt, bad_edge = transition_table(var, prod, STD)
    dev = conf[conf.dev_type != "적합"]
    print(f"로트 {len(var)}개 · 경로 변형 {len(vt)}종 · 적합 {int((conf.dev_type == '적합').sum())} · 이탈 {len(dev)}")
    print("\n[경로 변형 빈도 — 제품별 상위]")
    print(vt.groupby("product").head(6)[["product", "n_lots", "share", "cum_share", "is_std", "len"]].round(3).to_string(index=False))
    print("\n[이탈 유형별 로트 수 · 평균 적합도]")
    print(dev.groupby("dev_type")["fitness"].agg(["size", "mean"]).round(4).to_string())
    print("\n[표준에 없는 전이 — 상위]")
    print(tt[~tt.allowed].head(8).to_string(index=False))
    oc_y = outcome_compare(conf, outcome, "yield_pct")
    oc_c = outcome_compare(conf, outcome, "ct_h")
    print(f"\n[이탈 로트 vs 적합 로트: 수율] 단순 차이 {oc_y['raw']:+.2f}%p (95% 부트스트랩 {oc_y['raw_ci'][0]:+.2f}~{oc_y['raw_ci'][1]:+.2f}) "
          f"/ 제품 층화 차이 {oc_y['strat']:+.2f}%p (SE {oc_y['strat_se']:.2f})   ← 이탈 효과 0 으로 심은 합성")
    print(f"[사이클타임] 단순 {oc_c['raw']:+.1f}h / 층화 {oc_c['strat']:+.1f}h  (제품마다 표준 step 수가 달라 단순 차이는 제품 구성이 지배한다)")

    # ---- 독립 하드체크 ----
    # (1) 심어 둔 이탈 26로트를 전부, 과검출 없이 찾고 유형도 맞다
    assert set(dev.index) == set(planted), (sorted(set(dev.index) ^ set(planted)))
    for lot, kind in planted.items():
        want = "생략" if kind == "층 생략" else kind
        assert conf.loc[lot, "dev_type"] == want, (lot, kind, conf.loc[lot, "dev_type"])
    # (2) 손계산 적합도: A(표준 11) 생략 20/21 · 재방문 22/23 · 순서 바뀜 1-2/22=10/11 · 미등록 22/23 · 층 생략 12/17
    #                   B(표준 6)  생략 10/11 · 재방문 12/13 · 순서 바뀜 1-2/12=5/6 · 미등록 12/13
    lit = {("A", "생략"): 20 / 21, ("A", "재방문"): 22 / 23, ("A", "순서 바뀜"): 10 / 11, ("A", "미등록 step"): 22 / 23, ("A", "층 생략"): 12 / 17,
           ("B", "생략"): 10 / 11, ("B", "재방문"): 12 / 13, ("B", "순서 바뀜"): 5 / 6, ("B", "미등록 step"): 12 / 13}
    for lot, kind in planted.items():
        assert abs(conf.loc[lot, "fitness"] - lit[(conf.loc[lot, "product"], kind)]) < 1e-12, (lot, kind)
    assert (conf.loc[conf.dev_type == "적합", "fitness"] == 1.0).all()
    # (3) LCS 적합도 == 삽입·삭제 편집거리(다른 알고리즘)로 다시 계산한 적합도 (전 로트)
    for lot, v in var.items():
        s = STD[prod[lot]]
        assert abs(conf.loc[lot, "fitness"] - (1 - edit_dist_indel(tuple(v), tuple(s)) / (len(v) + len(s)))) < 1e-12
    # (4) 전이 기반 판정은 인접 쌍이 합법인 '층 통째 생략' 2로트를 못 본다(알려진 한계) — 나머지 24로트는 모두 잡는다
    layer = {l for l, k in planted.items() if k == "층 생략"}
    assert len(layer) == 2 and bad_edge == set(planted) - layer
    # (5) 변형 집계: 로트 수 합 = 전체, 제품별 1위 변형 = 표준
    assert vt["n_lots"].sum() == len(var)
    for p, g in vt.groupby("product"):
        assert g.iloc[0]["is_std"] and abs(g["share"].sum() - 1.0) < 1e-12
    # (6) 상관 ≠ 원인: 이탈 효과 0 으로 심었는데 단순 비교는 수율이 낮아 보이고, 제품 층화는 0 근처로 돌아온다
    assert oc_y["raw"] < -3.0 and oc_y["raw_ci"][1] < 0.0, oc_y
    assert abs(oc_y["strat"]) < 3 * oc_y["strat_se"], oc_y
    print(f"\nHARD CHECK OK: 이탈 {len(planted)}로트 전부 검출·유형 일치·손계산 적합도 일치·전이 기반은 층 생략 {len(layer)}건 놓침(한계)·"
          f"단순 수율차 {oc_y['raw']:+.1f}%p → 층화 {oc_y['strat']:+.2f}%p(이탈 효과 0 으로 심음)")
