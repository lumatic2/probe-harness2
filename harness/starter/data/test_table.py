# 실행: python3 -m unittest discover -s starter/data -v
# 이 파일 자체가 테스트 골격 예시다 — 과제의 집계·판정 테스트도 이 형태로 추가한다.
# 테스트 하나 = 완료 조건 하나. 기대값은 손으로 센 작은 표본으로 고정한다.
import tempfile
import unittest
from pathlib import Path

BOM = chr(0xFEFF)  # 엑셀 UTF-8 저장 CSV 앞머리

from table import cite, duplicates, group, load_csv, num, profile


def write(text, encoding="utf-8"):
    f = Path(tempfile.mkdtemp()) / "t.csv"
    f.write_bytes(text.encode(encoding))
    return f


class TableTest(unittest.TestCase):
    def test_load_cites_excel_row(self):
        rows = load_csv(write("id,qty\nA,1\nB,2\n"))
        self.assertEqual([r["id"] for r in rows], ["A", "B"])
        self.assertEqual(cite(rows[1]), "t.csv:3")

    def test_bom_and_cp949(self):
        self.assertEqual(load_csv(write(BOM + "라인,수량\n1,2\n"))[0]["라인"], "1")
        self.assertEqual(load_csv(write("라인,수량\n1,2\n", "cp949"))[0]["수량"], "2")

    def test_quoted_newline_cell(self):
        rows = load_csv(write('id,memo\nA,"줄1\n줄2, 콤마"\nB,x\n'))
        self.assertEqual(rows[0]["memo"], "줄1\n줄2, 콤마")
        self.assertEqual(len(rows), 2)

    def test_num(self):
        self.assertEqual(num("1,234"), 1234.0)
        self.assertEqual(num("12.5%"), 12.5)
        self.assertIsNone(num(""))
        self.assertIsNone(num("3 EA"))

    def test_group_sum_keeps_skipped_rows(self):
        rows = load_csv(write("line,qty\nL1,10\nL1,x\nL2,5\n"))
        g = group(rows, "line", "qty")
        self.assertEqual((g["L1"]["count"], g["L1"]["sum"]), (2, 10.0))
        self.assertEqual(g["L1"]["skipped"], ["t.csv:3"])

    def test_profile_and_duplicates(self):
        rows = load_csv(write("id,v\nA,1\nA,\nB,z\n"))
        p = profile(rows)["v"]
        self.assertEqual((p["blank"], p["non_numeric"]), (1, 1))
        self.assertEqual(duplicates(rows, "id"), {"A": ["t.csv:2", "t.csv:3"]})


if __name__ == "__main__":
    unittest.main()
