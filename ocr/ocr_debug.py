import sys, easyocr, numpy as np
from PIL import Image
img = Image.open(sys.argv[1]).convert('RGB')
w, h = img.size
if max(w, h) < 2200:
    img = img.resize((int(w*2), int(h*2)), Image.LANCZOS)
print("IMG_SIZE", img.size, file=sys.stderr)
r = easyocr.Reader(['ja', 'en'], gpu=False, verbose=False)
res = r.readtext(np.array(img))
print("N_DETECTIONS", len(res), file=sys.stderr)
rows = []
for bbox, text, conf in res:
    ys = [p[1] for p in bbox]; xs = [p[0] for p in bbox]
    rows.append((int(sum(ys)/4), int(sum(xs)/4), text))
rows.sort()
for y, x, t in rows:
    print(f"{y}\t{x}\t{t}")
