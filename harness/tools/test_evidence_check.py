# 실행: python3 -m unittest discover -s tools -v
import tempfile
import unittest
from pathlib import Path

from evidence_check import check

README_OK = """# 도구
## 된다 (각 행 = 증거 있음)
| 기능 | 증거 |
|---|---|
| 집계 | `tests/test_a.py::test_sum` · `src/a.py:1-2` |
## 안 된다
| 기능 | 이유 |
|---|---|
| 실시간 | 범위 밖 |
## AI 활용 기록
- 탭 수: 3
"""


def repo(readme, files):
    d = Path(tempfile.mkdtemp())
    (d / "README.md").write_text(readme, encoding="utf-8")
    for rel, body in files.items():
        (d / rel).parent.mkdir(parents=True, exist_ok=True)
        (d / rel).write_text(body, encoding="utf-8")
    return d / "README.md"


FILES = {"tests/test_a.py": "def test_sum():\n    pass\n", "src/a.py": "x = 1\ny = 2\n"}


class EvidenceCheckTest(unittest.TestCase):
    def test_pass(self):
        self.assertEqual(check(repo(README_OK, FILES))[0], 0)

    def test_missing_ai_usage_section(self):
        rc, msgs = check(repo(README_OK.replace("## AI 활용 기록\n- 탭 수: 3\n", ""), FILES))
        self.assertEqual(rc, 1)
        self.assertIn("AI 활용 기록", msgs[0])

    def test_missing_evidence_cell(self):
        rc, msgs = check(repo(README_OK.replace("`tests/test_a.py::test_sum` · `src/a.py:1-2`", "테스트 있음"), FILES))
        self.assertEqual(rc, 1)
        self.assertIn("백틱 토큰 없음", msgs[0])

    def test_missing_file_test_and_line(self):
        rc, msgs = check(repo(README_OK.replace("src/a.py:1-2", "src/a.py:1-9").replace("test_sum`", "test_nope`"), FILES))
        self.assertEqual(rc, 1)
        joined = "\n".join(msgs)
        self.assertIn("2줄인데 9줄", joined)
        self.assertIn("test_nope 없음", joined)

    def test_no_table_is_noverify(self):
        self.assertEqual(check(repo("# 도구\n설명만 있음\n", {}))[0], 2)


if __name__ == "__main__":
    unittest.main()
