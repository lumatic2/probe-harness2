"""알람을 사건(episode)으로 묶기 — 떨림 묶음·시간창 묶음·홍수 구간·묶기 전후 건수.  실행: python code/alarm_episodes.py
입력 alarm : ts_on, eqp_id, source_id            (필수)
             ts_off, chamber, priority, owner_id   (선택. owner_id 가 없으면 eqp_id 를 담당 단위로 쓴다)
규칙(원천 = 알람 관리 챕터의 KPI 정의, 값은 모두 바꿀 수 있는 인자):
  떨림(chattering): 같은 (장비·챔버·소스)가 60초 안에 3번 이상 켜짐
  홍수(flood)     : 담당자 1인당 10분 버킷의 신규 알람이 10건 초과면 시작, 5건 미만인 버킷이 나오면 끝
  오래 켜짐(stale): ts_off − ts_on 이 24시간 초과
사건 묶기(시간창·장비 단위는 원천에 규칙이 없다 — 이 코드의 정의는 모두 추론):
  chain : 같은 키(기본 eqp_id)에서 직전 알람과의 간격이 gap_s 이하면 같은 사건(간격이 정확히 gap_s 면 같은 사건)
  fixed : 사건 첫 알람에서 gap_s 이내에 들어오는 알람까지만 같은 사건(첫 알람 기준 고정 창)
"""
import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

KEY_DEFAULT = ("eqp_id",)


# ---------------------------------------------------------------- 계산 본체
def chatter_flags(a, window_s=60, min_n=3, by=("eqp_id", "chamber", "source_id")):
    """떨림 판정.  반환: (flag Series, group Series) — flag 는 떨림에 속한 알람, group 은 떨림 묶음 번호(없으면 −1).
    윈도: 정렬된 ts_on 에서 j 번째부터 min_n 개의 시간 폭이 window_s 이하면 그 min_n 개가 모두 떨림.  떨림 묶음은 이웃 간격이 window_s 이하로 이어진 떨림 알람들."""
    by = [c for c in by if c in a.columns]
    flag = pd.Series(False, index=a.index)
    grp = pd.Series(-1, index=a.index)
    w = np.timedelta64(int(window_s * 1e9), "ns")
    gid = 0
    for _, g in a.sort_values("ts_on", kind="mergesort").groupby(by, sort=False):
        t = g["ts_on"].to_numpy()
        n = len(t)
        if n < min_n:
            continue
        mark = np.zeros(n, bool)
        for j in np.flatnonzero((t[min_n - 1:] - t[: n - min_n + 1]) <= w):
            mark[j:j + min_n] = True
        if not mark.any():
            continue
        idx = np.flatnonzero(mark)
        cur = -1
        prev = None
        for i in idx:
            if prev is None or i != prev + 1 or (t[i] - t[prev]) > w:
                gid += 1
                cur = gid
            grp.loc[g.index[i]] = cur
            flag.loc[g.index[i]] = True
            prev = i
    return flag, grp


def collapse_chatter(a, flag, grp):
    """떨림 묶음마다 첫 알람 1건만 남기고 나머지를 버린다(떨림이 아닌 알람은 전부 유지)."""
    keep = ~flag | ~grp.duplicated(keep="first")
    return a[keep]


def episodes(a, gap_s=300, by=KEY_DEFAULT, mode="chain"):
    """알람을 사건으로 묶는다.  반환: (알람마다 episode_id 가 붙은 표, 사건 표).
    사건 표: episode_id, 키 열들, t_start, t_end(마지막 ts_on), n_alarms, n_sources, first_source(추론: 첫 알람이 원인이라는 보장은 없다), owner_id(첫 알람의 담당)."""
    by = list(by)
    gap = pd.Timedelta(seconds=gap_s)
    s = a.sort_values(by + ["ts_on"], kind="mergesort")
    key = s.groupby(by, sort=False).ngroup()
    if mode == "chain":
        new = (key != key.shift()) | (s["ts_on"].diff() > gap)
    elif mode == "fixed":
        flags, start, k_prev = [], None, None
        for k, t in zip(key, s["ts_on"]):
            if k != k_prev or t - start > gap:
                flags.append(True)
                start, k_prev = t, k
            else:
                flags.append(False)
        new = pd.Series(flags, index=s.index)
    else:
        raise ValueError(mode)
    out = s.assign(episode_id=new.cumsum().to_numpy() - 1)
    g = out.groupby("episode_id")
    ep = g.agg(t_start=("ts_on", "min"), t_end=("ts_on", "max"), n_alarms=("ts_on", "size"), n_sources=("source_id", "nunique"),
               first_source=("source_id", "first"))
    for c in by:
        ep[c] = g[c].first()
    if "owner_id" in out.columns:
        ep["owner_id"] = g["owner_id"].first()
    return out, ep


def flood_flags(counts, hi=10, lo=5):
    """버킷별 신규 알람 수 → 홍수 여부.  count > hi 에서 시작, count < lo 인 버킷에서 끝(그 버킷은 홍수 아님)."""
    on, flags = False, []
    for c in counts:
        if not on and c > hi:
            on = True
        elif on and c < lo:
            on = False
        flags.append(on)
    return np.array(flags)


def bucket_counts(a, owner_col="owner_id", freq="10min", t0=None, t1=None):
    """담당(owner) × 10분 버킷의 신규 알람 수 — 빈 버킷도 0 으로 채운다.  행 = 버킷, 열 = 담당."""
    col = owner_col if owner_col in a.columns else "eqp_id"
    t0 = (a["ts_on"].min() if t0 is None else t0).floor(freq)
    t1 = (a["ts_on"].max() if t1 is None else t1).floor(freq)
    b = a["ts_on"].dt.floor(freq)
    c = a.groupby([b, a[col]]).size().unstack(fill_value=0)
    return c.reindex(pd.date_range(t0, t1, freq=freq), fill_value=0)


def kpis(a, freq="10min", hi=10, lo=5, t0=None, t1=None):
    """알람 건강 KPI: 총 건수 · 담당 1인당 10분당 신규 알람(평균·p95) · 홍수 버킷 비율 · 상위 10 소스 비중 · 떨림 알람 수 · 24h 초과 알람 수."""
    bc = bucket_counts(a, freq=freq, t0=t0, t1=t1)
    fl = np.column_stack([flood_flags(bc[c].to_numpy(), hi, lo) for c in bc.columns])
    cnt = bc.to_numpy().ravel()
    src = a.groupby(["eqp_id", "source_id"]).size().sort_values(ascending=False)
    k = {"n_alarms": len(a), "per10_mean": cnt.mean(), "per10_p95": float(np.percentile(cnt, 95)),
         "flood_ratio": fl.mean(), "flood_buckets": int(fl.sum()), "top10_share": src.head(10).sum() / len(a)}
    if "ts_off" in a.columns:
        k["stale_24h"] = int(((a["ts_off"] - a["ts_on"]) > pd.Timedelta(hours=24)).sum())
    return k, bc, fl


def before_after(a, gap_s=300, **kw):
    """묶기 전후 건수와 KPI: 원본 → 떨림 묶음 후 → 사건(chain).  '신규 알람'은 사건이면 사건의 첫 알람 시각으로 센다."""
    flag, grp = chatter_flags(a)
    a1 = collapse_chatter(a, flag, grp)
    _, ep = episodes(a1, gap_s)
    a2 = ep.rename(columns={"t_start": "ts_on", "first_source": "source_id"})
    rows = {}
    for name, tab in (("원본 알람", a), ("떨림 묶음 후", a1), ("사건 묶음 후", a2)):
        k, _, _ = kpis(tab, t0=a["ts_on"].min(), t1=a["ts_on"].max())
        rows[name] = k
    return pd.DataFrame(rows).T[["n_alarms", "per10_mean", "per10_p95", "flood_buckets", "flood_ratio"]]


def episodes_components(a, gap_s=300, by=KEY_DEFAULT):
    """하드체크용: chain 묶기와 다른 경로 — 키별로 |Δt| ≤ gap 인 모든 쌍을 이어 연결요소를 구한다(scipy)."""
    labels = pd.Series(-1, index=a.index)
    off = 0
    for _, g in a.groupby(list(by), sort=False):
        t = g["ts_on"].astype("int64").to_numpy() / 1e9
        i, j = np.nonzero(np.abs(t[:, None] - t[None, :]) <= gap_s)
        m = coo_matrix((np.ones(len(i)), (i, j)), shape=(len(t), len(t)))
        _, lab = connected_components(m, directed=False)
        labels.loc[g.index] = lab + off
        off += lab.max() + 1
    return labels


# ---------------------------------------------------------------- 합성 데이터
def hand_case():
    """손계산 소형 사례(초 단위).  기준 시각 + 초.  chamber 열 포함.
    E1: A@0 A@20 A@40 B@100 (챔버 C1) · C@350 (C2) · A@1000 (C1)     E2: D@10 E@10 D@700 (C1)     E3: F@0 F@300 F@601 (C1)
    손계산: 원본 12 · 떨림은 A@0,20,40 세 건(묶음 1) → 묶음 후 10.
            chain(300초, 장비 키): E1 {0,20,40,100,350},{1000} · E2 {10,10},{700} · E3 {0,300},{601} → 6
            fixed(300초): E1 {0,20,40,100},{350},{1000} · E2 2 · E3 {0,300},{601} 2 → 7
            chain(장비+챔버 키): E1 C1 {0,20,40,100},{1000}, C2 {350} → 3 · E2 2 · E3 2 → 7"""
    z = pd.Timestamp("2026-01-01 08:00:00")
    raw = [("E1", "C1", "A", 0), ("E1", "C1", "A", 20), ("E1", "C1", "A", 40), ("E1", "C1", "B", 100), ("E1", "C2", "C", 350),
           ("E1", "C1", "A", 1000), ("E2", "C1", "D", 10), ("E2", "C1", "E", 10), ("E2", "C1", "D", 700),
           ("E3", "C1", "F", 0), ("E3", "C1", "F", 300), ("E3", "C1", "F", 601)]
    return pd.DataFrame([(z + pd.Timedelta(seconds=s), e, c, src) for e, c, src, s in raw], columns=["ts_on", "eqp_id", "chamber", "source_id"])


def make_demo(seed=20261114, n_eqp=40, days=7):
    """합성 알람 로그(담당자 10명 × 장비 4대).  장비마다 서로 700초 넘게 떨어진 '사건'을 시간순으로 심는다:
       단일 알람 60% · 연쇄(소스 6개가 2분 안에 5~8건) 30% · 떨림(한 소스가 5~9번, 10~25초 간격) 10%.
    정답표 events: (장비, 종류, 알람 id 목록).  홍수: 담당 O03 의 장비 4대가 3개 버킷(10분 단위)에 연쇄 8~12건씩 → 버킷당 32건 이상.
    오래 켜진 알람 5건(30~60시간)은 단일 알람 5건의 ts_off 만 늘려 만든다."""
    rng = np.random.default_rng(seed)
    t0 = pd.Timestamp("2026-10-05 00:00:00")
    horizon = days * 86400.0
    flood_start = 3 * 86400.0 + 10 * 3600.0          # 3일차 10:00, 버킷 경계
    flood_owner = "O03"
    rows, events = [], []

    def add(eqp, owner, kind, items):
        ids = []
        for s_, src, dur in items:
            ids.append(len(rows))
            rows.append((t0 + pd.Timedelta(seconds=float(s_)), t0 + pd.Timedelta(seconds=float(s_ + dur)), eqp, "C1" if int(src[-1]) % 2 == 0 else "C2", src,
                         int(rng.choice([1, 2, 3], p=[0.05, 0.15, 0.8])), owner))
        events.append((eqp, kind, ids))

    def cascade(t, n, eqp):
        srcs = [f"{eqp}-S{k}" for k in range(6)]
        pool = srcs * 2
        rng.shuffle(pool)
        times = t + np.cumsum(rng.uniform(5, 20, n)) - 5
        return [(times[i], pool[i], min(float(rng.exponential(300)), 7200.0)) for i in range(n)]

    for k in range(n_eqp):
        eqp, owner = f"EQ{k + 1:02d}", f"O{k // 4:02d}"
        blocked = (flood_start - 900, flood_start + 3 * 600 + 900) if owner == flood_owner else None
        t = float(rng.uniform(0, 3600))
        while True:
            kind = str(rng.choice(["single", "cascade", "chatter"], p=[0.6, 0.3, 0.1]))
            if kind == "single":
                items, span = [(t, f"{eqp}-S{int(rng.integers(0, 6))}", min(float(rng.exponential(300)), 7200.0))], 0.0
            elif kind == "cascade":
                items = cascade(t, int(rng.integers(5, 9)), eqp)
                span = items[-1][0] - t
            else:
                src = f"{eqp}-S{int(rng.integers(0, 6))}"
                tt = t + np.concatenate([[0.0], np.cumsum(rng.uniform(10, 25, int(rng.integers(5, 10)) - 1))])
                items, span = [(x, src, 5.0) for x in tt], tt[-1] - t
            end = t + span
            ok = not (blocked and t < blocked[1] and end > blocked[0])
            if end >= horizon:
                break
            if ok:
                add(eqp, owner, kind, items)
            t = end + 700 + float(rng.exponential(4 * 3600))
    # 홍수: O03 장비 4대(EQ13~EQ16) × 3 버킷, 버킷 시작 후 0~60초에 연쇄 8~12건
    for k in range(12, 16):
        eqp = f"EQ{k + 1:02d}"
        for b in range(3):
            add(eqp, flood_owner, "flood_cascade", cascade(flood_start + 600 * b + float(rng.uniform(0, 60)), int(rng.integers(8, 13)), eqp))
    a = pd.DataFrame(rows, columns=["ts_on", "ts_off", "eqp_id", "chamber", "source_id", "priority", "owner_id"])
    singles = [e for e in events if e[1] == "single"]
    stale = [singles[i][2][0] for i in rng.choice(len(singles), 5, replace=False)]
    a.loc[stale, "ts_off"] = a.loc[stale, "ts_on"] + pd.to_timedelta(rng.uniform(30, 60, 5), unit="h")
    return a, events, {"flood_owner": flood_owner, "flood_buckets": [t0 + pd.Timedelta(seconds=flood_start + 600 * b) for b in range(3)],
                       "stale_ids": set(stale)}


if __name__ == "__main__":
    # ---- 손계산 소형 사례 ----
    hc = hand_case()
    hflag, hgrp = chatter_flags(hc)
    col = collapse_chatter(hc, hflag, hgrp)
    ch = episodes(hc, 300, ("eqp_id",), "chain")[1]
    fx = episodes(hc, 300, ("eqp_id",), "fixed")[1]
    cc = episodes(hc, 300, ("eqp_id", "chamber"), "chain")[1]
    print(f"[손계산 사례] 원본 {len(hc)} · 떨림 알람 {int(hflag.sum())}건(묶음 {hgrp[hflag].nunique()}) → 묶음 후 {len(col)} · "
          f"chain {len(ch)} · fixed {len(fx)} · chain(장비+챔버) {len(cc)}")

    # ---- 합성 알람 로그 ----
    a, events, truth = make_demo()
    flag, grp = chatter_flags(a)
    a_ep, ep = episodes(a, 300)
    ba = before_after(a)
    kp, bc, fl = kpis(a)
    print(f"\n[합성 로그] 알람 {len(a)}건 · 장비 {a.eqp_id.nunique()}대 · 담당 {a.owner_id.nunique()}명 · 사건(심은 것) {len(events)}개")
    print("\n[묶기 전후]\n" + ba.round(3).to_string())
    print("\n[KPI 원본] " + ", ".join(f"{k}={v:.3f}" if isinstance(v, float) else f"{k}={v}" for k, v in kp.items()))
    kinds = pd.Series([e[1] for e in events]).value_counts()
    print("[심은 사건 종류]", kinds.to_dict())

    # ---- 독립 하드체크 ----
    # (1) 손계산 일치
    assert list(hflag[hflag].index) == [0, 1, 2] and hgrp[hflag].nunique() == 1 and len(col) == 10
    assert (len(ch), len(fx), len(cc)) == (6, 7, 7), (len(ch), len(fx), len(cc))
    e1 = ch[(ch.eqp_id == "E1")].sort_values("t_start")
    assert e1["n_alarms"].tolist() == [5, 1] and e1["n_sources"].tolist() == [3, 1]
    e3 = ch[ch.eqp_id == "E3"].sort_values("t_start")
    assert e3["n_alarms"].tolist() == [2, 1]      # 간격 정확히 300초는 같은 사건, 301초는 새 사건
    # (2) 손계산 홍수: 버킷 수 [3,12,7,4,2,11,9,5,4] → 홍수 = 인덱스 1,2,5,6,7  (10 은 시작 아님, 5 는 끝 아님)
    assert flood_flags([3, 12, 7, 4, 2, 11, 9, 5, 4]).tolist() == [False, True, True, False, False, True, True, True, False]
    assert not flood_flags([10, 10, 10]).any() and flood_flags([11, 5, 4]).tolist() == [True, True, False]
    z = pd.Timestamp("2026-01-01")
    cnts = [3, 12, 7, 4, 2, 11, 9, 5, 4]
    hf = pd.DataFrame([(z + pd.Timedelta(minutes=10 * i, seconds=s), "E", "S", "O1") for i, c in enumerate(cnts) for s in range(c)],
                      columns=["ts_on", "eqp_id", "source_id", "owner_id"])
    khf, _, flf = kpis(hf)
    assert khf["flood_buckets"] == 5 and abs(khf["flood_ratio"] - 5 / 9) < 1e-12 and abs(khf["per10_mean"] - 57 / 9) < 1e-12
    # (3) 합성: 사건 묶음이 심어 둔 사건과 알람 집합까지 정확히 같다
    got = {frozenset(g.index) for _, g in a_ep.groupby("episode_id")}
    want = {frozenset(e[2]) for e in events}
    assert got == want, (len(got), len(want))
    # (4) 묶기 경로가 다른 연결요소 계산과 같은 분할
    comp = episodes_components(a, 300)
    assert {frozenset(g.index) for _, g in comp.groupby(comp)} == got
    # (5) 떨림: 심어 둔 떨림 사건의 알람이 전부, 그리고 그것만 떨림이며 묶음 수 = 떨림 사건 수
    chat_ids = {i for e in events if e[1] == "chatter" for i in e[2]}
    assert set(flag[flag].index) == chat_ids and grp[flag].nunique() == sum(e[1] == "chatter" for e in events)
    # (6) 홍수: 담당 O03 에 심어 둔 3개 버킷이 정확히 하나의 홍수 구간이고, 모든 담당의 홍수 판정이 다른 구현(히스토그램+구간 탐색)과 같다
    fl_df = pd.DataFrame(fl, index=bc.index, columns=bc.columns)
    runs = (lambda x: [(i, j) for i, j in zip(np.flatnonzero(np.diff(np.r_[0, x.astype(int)]) == 1), np.flatnonzero(np.diff(np.r_[x.astype(int), 0]) == -1) + 1)])(fl_df[truth["flood_owner"]].to_numpy())
    pos = {t: i for i, t in enumerate(bc.index)}
    i0 = pos[truth["flood_buckets"][0]]
    assert (i0, i0 + 3) in runs, runs
    edges = (bc.index.min() + pd.timedelta_range(0, periods=len(bc) + 1, freq="10min")).to_numpy()
    for o, g in a.groupby("owner_id"):
        h_, _ = np.histogram(g["ts_on"].to_numpy(), bins=edges)
        i, ref = 0, np.zeros(len(h_), bool)
        while i < len(h_):                      # 시작 → 처음 만나는 <5 버킷 직전까지
            if h_[i] > 10:
                j = i
                while j < len(h_) and h_[j] >= 5:
                    j += 1
                ref[i:j] = True
                i = j
            else:
                i += 1
        assert (ref == fl_df[o].to_numpy()).all(), o
    natural = int(fl_df.drop(columns=truth["flood_owner"]).sum().sum())
    # (7) 오래 켜진 알람 5건, 사건 묶음 후 홍수 버킷은 0, 사건 수 = 심은 사건 수
    assert kp["stale_24h"] == len(truth["stale_ids"]) == 5
    assert int(ba.loc["사건 묶음 후", "n_alarms"]) == len(events) and ba.loc["사건 묶음 후", "flood_buckets"] == 0
    assert ba.loc["원본 알람", "n_alarms"] > ba.loc["떨림 묶음 후", "n_alarms"] > ba.loc["사건 묶음 후", "n_alarms"]
    print(f"\nHARD CHECK OK: 손계산 사례 일치(원본 12→묶음 {len(col)}→사건 chain {len(ch)}/fixed {len(fx)})·사건 {len(events)}개 알람 집합까지 일치(연결요소 대조)·"
          f"떨림 {sum(e[1] == 'chatter' for e in events)}건·심은 홍수 3버킷 검출(자연 발생 {natural}버킷은 구현 대조 일치)·오래 켜짐 5건 · {len(a)}건 → {len(ep)}사건")
