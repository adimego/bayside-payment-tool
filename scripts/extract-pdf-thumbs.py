#!/usr/bin/env python3
"""Pull vehicle photo thumbnails out of a vAuto "AI Inventory Feed" PDF.

    pip install pymupdf pillow
    python3 scripts/extract-pdf-thumbs.py report.pdf [--out assets/thumbs] [--inventory data/inventory.json]

Each photo is matched to its row by page position: the image whose vertical
centre falls inside a row's band (from that row's Stock # line down to the next
row's) belongs to that stock number. The VIN printed in the row is used as a
cross-check against data/inventory.json. vAuto draws a small grey "no photo"
PNG for vehicles without pictures; any image used more than once in the file,
or smaller than 100 px wide, is treated as that placeholder and skipped.

With --inventory, sets "photo": "assets/thumbs/<STOCK>.jpg" on matching
vehicles (and removes it from vehicles whose file no longer exists).
Dev tool only; not part of the Node tests or the deployed site.
"""
import argparse, io, json, os, re, sys
from collections import Counter

import pymupdf
from PIL import Image

STOCK_RE = re.compile(r'^[A-Z0-9]{5,10}$')
VIN_RE = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')


def rows_on_page(page):
    words = page.get_text('words')
    header = [w for w in words if w[4] == 'Stock']
    stock_x1 = 100 if not header else header[0][2] + 20
    head_y = header[0][3] if header else 0
    stocks = sorted((w for w in words if w[0] < stock_x1 and w[1] > head_y and STOCK_RE.match(w[4])
                     and any(c.isdigit() for c in w[4])), key=lambda w: w[1])
    rows = []
    for i, w in enumerate(stocks):
        top = w[1] - 4
        bottom = stocks[i + 1][1] - 4 if i + 1 < len(stocks) else page.rect.height
        vin = next((x[4] for x in words if top <= x[1] < bottom and VIN_RE.match(x[4])), None)
        price = next((x[4] for x in words if top <= x[1] < bottom and x[4].startswith('$')), None)
        rows.append({'stock': w[4], 'top': top, 'bottom': bottom, 'vin': vin, 'price': price})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--out', default='assets/thumbs')
    ap.add_argument('--inventory', default=None)
    ap.add_argument('--width', type=int, default=480, help='max output width (px)')
    ap.add_argument('--report', default=None, help='write row/price details as JSON')
    a = ap.parse_args()

    doc = pymupdf.open(a.pdf)
    use = Counter(x[0] for p in doc for x in p.get_images(full=True))
    os.makedirs(a.out, exist_ok=True)
    all_rows, saved, placeholders, unmatched = [], {}, 0, []
    for pno, page in enumerate(doc, 1):
        rows = rows_on_page(page)
        all_rows += rows
        for info in page.get_image_info(xrefs=True):
            x0, y0, x1, y1 = info['bbox']
            if x1 - x0 < 10:
                continue
            cy = (y0 + y1) / 2
            row = next((r for r in rows if r['top'] <= cy < r['bottom']), None)
            xref = info['xref']
            if use[xref] > 1 or info['width'] < 100:
                placeholders += 1
                if row: row['photo'] = None
                continue
            if not row:
                unmatched.append((pno, xref, round(y0)))
                continue
            img = Image.open(io.BytesIO(doc.extract_image(xref)['image'])).convert('RGB')
            if img.width > a.width:
                img = img.resize((a.width, round(img.height * a.width / img.width)), Image.LANCZOS)
            path = os.path.join(a.out, f"{row['stock']}.jpg")
            img.save(path, 'JPEG', quality=80, optimize=True, progressive=True)
            row['photo'] = path
            saved[row['stock']] = path

    print(f"rows: {len(all_rows)}  real photos: {len(saved)}  placeholders: {placeholders}  "
          f"unmatched images: {len(unmatched)}  rows with no image: "
          f"{sum(1 for r in all_rows if 'photo' not in r)}")
    for u in unmatched:
        print('  unmatched image page %d xref %d y=%d' % u, file=sys.stderr)

    if a.report:
        json.dump(all_rows, open(a.report, 'w'), indent=1)

    if a.inventory:
        inv = json.load(open(a.inventory))
        by_stock = {v['stock']: v for v in inv['vehicles']}
        for r in all_rows:
            v = by_stock.get(r['stock'])
            if v is None:
                print(f"  {r['stock']}: in PDF but not in inventory", file=sys.stderr)
            elif r['vin'] and v.get('vin') and r['vin'] != v['vin']:
                print(f"  {r['stock']}: VIN mismatch PDF {r['vin']} vs inventory {v['vin']}", file=sys.stderr)
        n = 0
        for v in inv['vehicles']:
            rel = f"{a.out.rstrip('/')}/{v['stock']}.jpg"
            if os.path.exists(rel):
                v['photo'] = rel; n += 1
            else:
                v.pop('photo', None)
        json.dump(inv, open(a.inventory, 'w'), indent=2)
        open(a.inventory, 'a').write('\n')
        print(f"inventory: photo set on {n} of {len(inv['vehicles'])} vehicles")


if __name__ == '__main__':
    main()
