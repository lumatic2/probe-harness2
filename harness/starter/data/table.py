"""table.py — 의존성 0 표 처리 골격 (Python 표준 라이브러리만).

원칙: 개수·합계·판정은 여기 같은 고정 코드로 한다. 모든 행은 원본 위치(_file, _row)를 달고 다녀서
결론마다 근거 행을 인용할 수 있다. pandas 가 있으면 써도 되지만, 그때도 근거 행 열을 유지한다.

_row 는 엑셀에서 보이는 행 번호다(헤더 = 1행, 첫 데이터 = 2행). 셀 안 줄바꿈이 있으면 레코드 순번이라 물리 줄과 어긋날 수 있다.
"""
import csv
import io
import json
from collections import defaultdict
from pathlib import Path


def load_csv(path, encoding=None):
    """CSV → dict 목록. BOM·cp949(엑셀 한글 저장) 자동 대응. 셀 앞뒤 공백 제거."""
    path = Path(path)
    raw = path.read_bytes()
    for enc in ([encoding] if encoding else ["utf-8-sig", "cp949"]):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"인코딩 판별 실패: {path}")
    rows = []
    for i, r in enumerate(csv.DictReader(io.StringIO(text, newline="")), start=2):
        row = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
        row["_file"], row["_row"] = path.name, i
        rows.append(row)
    return rows


def load_json(path):
    """JSON 배열 → dict 목록 (_row = 배열 인덱스 0부터)."""
    path = Path(path)
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    return [dict(d, _file=path.name, _row=i) for i, d in enumerate(data)]


def num(value):
    """'1,234' · '12.5%' · '' → float 또는 None. 단위가 섞이면 None 을 돌려 조용히 틀리지 않게 한다."""
    s = str(value).replace(",", "").strip()
    if s.endswith("%"):
        s = s[:-1]
    try:
        return float(s)
    except ValueError:
        return None


def profile(rows):
    """데이터 점검: 열별 빈 칸 수·고유값 수·숫자 변환 실패 수. 처음 30분 안에 한 번 돌린다."""
    cols = [c for c in (rows[0] if rows else {}) if not c.startswith("_")]
    out = {}
    for c in cols:
        vals = [r.get(c, "") for r in rows]
        filled = [v for v in vals if v != ""]
        out[c] = {
            "blank": len(vals) - len(filled),
            "unique": len(set(filled)),
            "non_numeric": sum(1 for v in filled if num(v) is None),
        }
    return out


def duplicates(rows, key):
    """key 열 값이 겹치는 행들 → {값: [근거 행]}."""
    seen = defaultdict(list)
    for r in rows:
        seen[r.get(key, "")].append(cite(r))
    return {k: v for k, v in seen.items() if len(v) > 1}


def group(rows, key, value=None):
    """key 별 개수(value 없음) 또는 합계. 숫자로 못 바꾼 값은 skipped 에 근거 행과 함께 남긴다."""
    out = defaultdict(lambda: {"count": 0, "sum": 0.0, "rows": [], "skipped": []})
    for r in rows:
        g = out[r.get(key, "")]
        g["count"] += 1
        g["rows"].append(cite(r))
        if value is not None:
            n = num(r.get(value, ""))
            if n is None:
                g["skipped"].append(cite(r))
            else:
                g["sum"] += n
    return dict(out)


def cite(row):
    """근거 표기 — 'sales.csv:12'."""
    return f"{row.get('_file', '?')}:{row.get('_row', '?')}"


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("사용: python3 table.py <파일.csv> [중복 검사할 열]")
        raise SystemExit(2)
    rows = load_csv(sys.argv[1])
    print(f"{len(rows)}행")
    for col, p in profile(rows).items():
        print(f"  {col}: 빈칸 {p['blank']} · 고유 {p['unique']} · 숫자아님 {p['non_numeric']}")
    if len(sys.argv) > 2:
        print("중복:", duplicates(rows, sys.argv[2]) or "없음")
