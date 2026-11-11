#!/usr/bin/env python3
"""덱을 파일 하나로 묶는다 — index.html 이 쓰는 그림·글꼴을 전부 안에 넣어 pitch.html 을 만든다.

쓰는 법 (이 폴더에서):  python3 pack.py [원본=index.html] [결과=pitch.html]
- 결과 파일 하나만 옮기면 어디서든 뜬다(서버·인터넷·옆 폴더 필요 없음). 이름이 영문인 까닭: 주소 칸에 그대로 칠 수 있게.
- 안 채운 ⟨ ⟩ 자리와 빠진 캡처를 알려 준다. 쓰는 파일이 없으면 실패(종료코드 1)로 끝난다.
- 표준 라이브러리만 쓴다. 고칠 때는 index.html 을 고치고 다시 묶는다(결과 파일은 직접 고치지 않는다).
"""
import base64, mimetypes, pathlib, re, sys

here = pathlib.Path(__file__).resolve().parent
src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / "index.html"
out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src.parent / "pitch.html"
MIME = {".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
OPTIONAL = {"assets/capture.png"}  # 없으면 빈 틀로 남는다
html = src.read_text(encoding="utf-8")
missing, skipped, n = [], [], 0


def data_uri(rel):
    global n
    f = src.parent / rel
    if not f.is_file():
        (skipped if rel in OPTIONAL else missing).append(rel)
        return None
    mime = MIME.get(f.suffix.lower()) or mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    n += 1
    return f"data:{mime};base64,{base64.b64encode(f.read_bytes()).decode()}"


def sub(m):
    rel = m.group(2)
    if re.match(r"(?:[a-z]+:|//|#)", rel):
        return m.group(0)
    uri = data_uri(rel)
    return m.group(0) if uri is None else m.group(1) + uri + m.group(3)


html = re.sub(r"""(url\(\s*["']?)([^"')]+)(["']?\s*\))""", sub, html)
html = re.sub(r"""(<img\b[^>]*?\bsrc=["'])([^"']+)(["'])""", sub, html)
if missing:
    sys.exit("빠진 파일: " + ", ".join(sorted(set(missing))))
out.write_text(html, encoding="utf-8")
body = re.sub(r"<!--.*?-->", "", html[html.find("<body"):], flags=re.S)
body = re.sub(r"<script.*?</script>", "", body, flags=re.S)
left = re.findall(r"⟨[^⟩]*⟩", body)
print(f"{out.name}: {out.stat().st_size / 1e6:.1f}MB · 넣은 파일 {n}개")
if skipped:
    print("캡처 없음(3장이 빈 틀로 나온다): " + ", ".join(skipped))
if left:
    print(f"안 채운 자리 {len(left)}곳: " + " ".join(left[:8]) + (" …" if len(left) > 8 else ""))
