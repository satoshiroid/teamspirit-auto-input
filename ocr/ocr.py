#!/usr/bin/env python3
# 別勤怠システムのスクショから 日(day)・出勤・退勤 を抽出して JSON 出力。
# 高精度: EasyOCR（bbox の y 座標で行をまとめる）。無ければ pytesseract にフォールバック。
import sys, json, re

def prog(m):
    print("PROGRESS:" + m, file=sys.stderr, flush=True)

TIME_RE = re.compile(r'([0-2]?\d)[:：.](\d{2})')
WEEKDAY_DAY_RE = re.compile(r'([0-3]?\d)\s*[（(]?\s*[月火水木金土日]')

def norm_time(h, m):
    return f"{int(h):02d}:{m}"

def detect_day(txt):
    m = WEEKDAY_DAY_RE.search(txt)
    if m:
        d = int(m.group(1))
        if 1 <= d <= 31:
            return d
    cleaned = TIME_RE.sub(' ', txt)
    m = re.search(r'(?<!\d)([0-3]?\d)(?!\d)', cleaned)
    if m:
        d = int(m.group(1))
        if 1 <= d <= 31:
            return d
    return None

def extract_from_rows(rows):
    # データ行（時刻が2つ以上）を y とともに収集
    data = []
    for row in rows:
        row.sort(key=lambda i: i['x'])
        y = sum(i['y'] for i in row) / len(row)
        txt = ' '.join(i['text'] for i in row)
        times = [norm_time(h, m) for (h, m) in TIME_RE.findall(txt)]
        if len(times) >= 2:
            data.append({'y': y, 'ocrDay': detect_day(txt), 'start': times[0], 'end': times[1]})
    if not data:
        return []
    data.sort(key=lambda d: d['y'])
    # 行間隔(rowH)を最小の正の隙間から推定（隣接日が必ず存在する前提）
    ys = [d['y'] for d in data]
    diffs = sorted(b - a for a, b in zip(ys, ys[1:]) if b - a > 5)
    rowH = diffs[0] if diffs else 1.0
    # アンカー: 1桁(1-9)の確実な OCR 日付を優先、無ければ先頭行
    anchor = next((d for d in data if d['ocrDay'] and 1 <= d['ocrDay'] <= 9), data[0])
    a_day = anchor['ocrDay'] or 1
    a_y = anchor['y']
    out, seen = [], set()
    for d in data:
        day = a_day + round((d['y'] - a_y) / rowH)
        if not (1 <= day <= 31):
            day = d['ocrDay'] or day
        if day in seen or not (1 <= day <= 31):
            continue
        seen.add(day)
        out.append({'day': int(day), 'start': d['start'], 'end': d['end']})
    return out

def group_rows(items, tol):
    items.sort(key=lambda i: (i['y'], i['x']))
    rows, cur, lastY = [], [], None
    for it in items:
        if lastY is None or abs(it['y'] - lastY) <= tol:
            cur.append(it)
        else:
            rows.append(cur); cur = [it]
        lastY = it['y']
    if cur:
        rows.append(cur)
    return rows

def load_upscaled(path, scale=2):
    from PIL import Image
    img = Image.open(path).convert('RGB')
    w, h = img.size
    if max(w, h) < 2200:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img

def run_easyocr(path):
    import numpy as np
    import easyocr
    prog("画像を準備中…")
    img = load_upscaled(path)
    prog("OCRエンジンを初期化中…（初回はモデル読込で時間がかかります）")
    reader = easyocr.Reader(['ja', 'en'], gpu=False, verbose=False)
    prog("画像を解析中…（数十秒かかることがあります）")
    res = reader.readtext(np.array(img))
    prog("結果を整形中…")
    items = []
    for bbox, text, conf in res:
        xs = [p[0] for p in bbox]; ys = [p[1] for p in bbox]
        items.append({'x': sum(xs) / 4.0, 'y': sum(ys) / 4.0, 'text': text})
    return extract_from_rows(group_rows(items, 18))

def run_tesseract(path):
    import pytesseract
    img = load_upscaled(path)
    data = pytesseract.image_to_data(img, lang='jpn+eng', output_type=pytesseract.Output.DICT)
    items = []
    for i, t in enumerate(data['text']):
        if t and t.strip():
            items.append({'x': data['left'][i], 'y': data['top'][i], 'text': t.strip()})
    return extract_from_rows(group_rows(items, 16))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'days': [], 'error': 'no image path'})); return
    path = sys.argv[1]
    prog("OCRを開始します…")
    days, engine, err = [], None, None
    for name, fn in (('easyocr', run_easyocr), ('tesseract', run_tesseract)):
        try:
            days = fn(path)
            engine = name
            if days:
                break
        except Exception as e:
            err = f'{name}: {e}'
    print(json.dumps({'days': days, 'engine': engine, 'error': None if days else (err or 'no rows matched')}, ensure_ascii=False))

if __name__ == '__main__':
    main()
