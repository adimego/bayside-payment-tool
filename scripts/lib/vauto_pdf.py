"""Parse a vAuto "AI Inventory Feed" PDF into tabular rows and thumbnails.

Used by scripts/parse-vauto-pdf.py, scripts/extract-pdf-thumbs.py, and the
daily email import. Column layout is landscape A3: Stock #, Vehicle (name,
VIN, New/Used, Odometer, Certified), Body (body + exterior + interior color),
Price, Photo Thumbnail.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
from collections import Counter

import pymupdf
from PIL import Image

STOCK_RE = re.compile(r'^[A-Z0-9]{5,10}$')
VIN_RE = re.compile(r'^[A-HJ-NPR-Z0-9]{17}$')
BODY_CONT_RE = re.compile(
    r'^(van|minivan|crew|cab|utility|sedan|coupe|hatchback|convertible|'
    r'wagon|pickup|supercrew|supercab)$',
    re.I,
)
# Longer finish names first. "(DISC)" is a vAuto discontinued-color marker
# that belongs on the exterior color, not the interior.
COLOR_FINISH_RE = re.compile(
    r'^(?P<color>.+?\b(?:Metallic Clearcoat|Crystal Pearlcoat|Pearl Coat|'
    r'Clearcoat|Pearlcoat|Pearl|Metallic)(?:\s*\(DISC\))?)'
    r'(?:\s+(?P<interior>.*))?$',
    re.I,
)
# Ford-style interiors wrap as "Medium Light" / "Stone" (no paint finish on the exterior).
INTERIOR_LEAD_RE = re.compile(r'^(Medium Light|Medium Dark)$', re.I)
FOOTER_RE = re.compile(
    r'^(AI Inventory Feed|Page\s+\d+\s+of\s+\d+|©|https?://|vAuto,?(?:\s+Inc\.?)?|'
    r'\(\d{3}\)\s*\d{3}[-.]?\d{4}|'
    r'(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),)',
    re.I,
)
# Column centres in the official feed (points).
X_STOCK_END = 100
X_VEHICLE_END = 270
X_BODY_END = 345
X_PRICE_END = 425


def rows_on_page(page):
    """Stock-number row bands on one page, same rule as the original thumb extractor."""
    words = page.get_text('words')
    header = [w for w in words if w[4] == 'Stock']
    stock_x1 = 100 if not header else header[0][2] + 20
    head_y = header[0][3] if header else 0
    stocks = sorted(
        (w for w in words
         if w[0] < stock_x1 and w[1] > head_y and STOCK_RE.match(w[4])
         and any(c.isdigit() for c in w[4])),
        key=lambda w: w[1],
    )
    rows = []
    for i, w in enumerate(stocks):
        top = w[1] - 4
        bottom = stocks[i + 1][1] - 4 if i + 1 < len(stocks) else page.rect.height
        vin = next((x[4] for x in words if top <= x[1] < bottom and VIN_RE.match(x[4])), None)
        rows.append({'stock': w[4], 'top': top, 'bottom': bottom, 'page': page.number + 1, 'vin': vin})
    return rows


def _lines_in_column(page, row, x0, x1):
    """Text lines in a row band and x range, top to bottom, skipping the page footer."""
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for line in b['lines']:
            bx0, by0, bx1, by1 = line['bbox']
            cy = (by0 + by1) / 2
            cx = (bx0 + bx1) / 2
            if not (row['top'] <= cy < row['bottom'] and x0 <= cx < x1):
                continue
            # Footer lives on the last ~20 pts of the page (copyright, page n).
            if by0 >= page.rect.height - 25:
                continue
            text = ''.join(s['text'] for s in line['spans']).strip()
            if not text or FOOTER_RE.match(text):
                continue
            out.append((by0, text))
    out.sort()
    return [t for _, t in out]


def parse_vehicle_lines(lines):
    """Vehicle-column lines -> name, vin, new/used, odometer, certified."""
    blob = '\n'.join(lines)
    vin = None
    m = re.search(r'\b([A-HJ-NPR-Z0-9]{17})\b', blob)
    if m:
        vin = m.group(1)
    new_used = None
    m = re.search(r'New/Used:\s*([NU])\b', blob, re.I)
    if m:
        new_used = m.group(1).upper()
    odometer = None
    m = re.search(r'Odometer:\s*([0-9,]+)', blob, re.I)
    if m:
        odometer = m.group(1).replace(',', '')
    certified = bool(re.search(r'Certified:\s*Yes', blob, re.I))

    name_parts = []
    for t in lines:
        low = t.lower().strip()
        if low in ('vin:', 'certified:') or VIN_RE.match(t):
            break
        if low.startswith('vin:') or low.startswith('certified:') or low.startswith('new/used') or low.startswith('odometer'):
            before = re.split(r'\b(?:VIN|Certified|New/Used|Odometer)\s*:', t, maxsplit=1, flags=re.I)[0].strip()
            if before:
                name_parts.append(before)
            break
        name_parts.append(t)
    return {
        'name': ' '.join(name_parts).strip(),
        'vin': vin,
        'new_used': new_used,
        'odometer': odometer,
        'certified': certified,
    }


def parse_body_lines(lines):
    """Body-column lines -> body style, exterior color, interior color."""
    if not lines:
        return {'body': None, 'color': None, 'interior': None}
    body_parts = [lines[0]]
    i = 1
    while i < len(lines) and BODY_CONT_RE.match(lines[i]):
        body_parts.append(lines[i])
        i += 1
    rest = lines[i:]
    color = interior = None
    if rest:
        joined = ' '.join(rest)
        m = COLOR_FINISH_RE.match(joined)
        if m:
            color = m.group('color').strip()
            interior = (m.group('interior') or '').strip() or None
        elif len(rest) == 1:
            color = rest[0]
        elif len(rest) >= 3 and INTERIOR_LEAD_RE.match(rest[-2]):
            # "Oxford White" / "Medium Light" / "Stone"
            color = ' '.join(rest[:-2])
            interior = ' '.join(rest[-2:])
        else:
            # No finish token: last line is interior, everything before is color
            # (covers "Aurora Blue/Super Black" / "Gray").
            color = ' '.join(rest[:-1])
            interior = rest[-1]
    return {'body': ' '.join(body_parts), 'color': color, 'interior': interior}


def parse_price_lines(lines):
    if not lines:
        return None
    m = re.search(r'\$?[0-9][0-9,]*', lines[0])
    return m.group(0) if m else None


def is_vauto_inventory_pdf(path):
    """True if the PDF looks like the vAuto AI Inventory Feed (not a random PDF)."""
    try:
        doc = pymupdf.open(path)
    except Exception:
        return False
    try:
        if doc.page_count < 1:
            return False
        text = doc[0].get_text() + '\n' + doc[-1].get_text()
        if re.search(r'AI Inventory Feed', text, re.I) or re.search(r'vAuto', text, re.I):
            return True
        return bool(re.search(r'Stock\s*#', text, re.I) and re.search(r'\bVehicle\b', text) and re.search(r'\bPrice\b', text))
    finally:
        doc.close()


def parse_vauto_pdf(path):
    """Return {rows, vehicles, warnings, title_date} from an AI Inventory Feed PDF.

    `rows` is a header + data table matching the xlsx/csv layout so
    normalizeVautoRows in src/vauto-parse.js can run unchanged.
    Each item in `vehicles` also has page/top/bottom for photo matching.
    """
    doc = pymupdf.open(path)
    warnings = []
    vehicles = []
    title_date = None
    try:
        head = doc[0].get_text() if doc.page_count else ''
        m = re.search(
            r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+'
            r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+'
            r'\d{1,2},\s+\d{4}',
            head,
        )
        if m:
            title_date = m.group(0)
        for page in doc:
            for band in rows_on_page(page):
                veh_lines = _lines_in_column(page, band, X_STOCK_END, X_VEHICLE_END)
                body_lines = _lines_in_column(page, band, X_VEHICLE_END, X_BODY_END)
                price_lines = _lines_in_column(page, band, X_BODY_END, X_PRICE_END)
                parsed = parse_vehicle_lines(veh_lines)
                body = parse_body_lines(body_lines)
                price = parse_price_lines(price_lines)
                if not parsed['name']:
                    warnings.append(f"{band['stock']}: missing vehicle name")
                vehicles.append({
                    'stock': band['stock'],
                    'vin': parsed['vin'],
                    'name': parsed['name'],
                    'certified': parsed['certified'],
                    'new_used': parsed['new_used'],
                    'odometer': parsed['odometer'],
                    'body': body['body'],
                    'color': body['color'],
                    'interior': body['interior'],
                    'price': price,
                    'page': band['page'],
                    'top': band['top'],
                    'bottom': band['bottom'],
                })
    finally:
        doc.close()
    header = ['Stock #', 'Vehicle', 'Certified', 'VIN', 'New/Used', 'Odometer',
              'Body', 'Color', 'Interior Color', 'Price']
    rows = [header]
    for v in vehicles:
        rows.append([
            v['stock'],
            v['name'],
            'Yes' if v['certified'] else '',
            v['vin'] or '',
            v['new_used'] or '',
            v['odometer'] or '',
            v['body'] or '',
            v['color'] or '',
            v['interior'] or '',
            v['price'] or '',
        ])
    if not vehicles:
        warnings.append('Report has no data rows')
    return {'rows': rows, 'vehicles': vehicles, 'warnings': warnings, 'title_date': title_date}


def write_csv(rows, path, *, newline='\n'):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or '.', exist_ok=True)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        csv.writer(f).writerows(rows)


def extract_thumbs(pdf_path, out_dir, *, width=480, inventory=None, report=None):
    """Write JPEG thumbnails from the PDF; optionally stamp inventory.json photo paths.

    Returns a dict of stock -> relative path for real (non-placeholder) photos.
    """
    doc = pymupdf.open(pdf_path)
    use = Counter(x[0] for p in doc for x in p.get_images(full=True))
    os.makedirs(out_dir, exist_ok=True)
    all_rows, saved, placeholders, unmatched = [], {}, 0, []
    try:
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
                    if row:
                        row['photo'] = None
                    continue
                if not row:
                    unmatched.append((pno, xref, round(y0)))
                    continue
                img = Image.open(io.BytesIO(doc.extract_image(xref)['image'])).convert('RGB')
                if img.width > width:
                    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
                filename = f"{row['stock']}.jpg"
                path = os.path.join(out_dir, filename)
                img.save(path, 'JPEG', quality=80, optimize=True, progressive=True)
                rel = path.replace('\\', '/')
                row['photo'] = rel
                saved[row['stock']] = rel
    finally:
        doc.close()

    print(f"rows: {len(all_rows)}  real photos: {len(saved)}  placeholders: {placeholders}  "
          f"unmatched images: {len(unmatched)}  rows with no image: "
          f"{sum(1 for r in all_rows if 'photo' not in r)}")
    for u in unmatched:
        print('  unmatched image page %d xref %d y=%d' % u, file=sys.stderr)

    if report:
        json.dump(all_rows, open(report, 'w'), indent=1)

    if inventory:
        inv = json.load(open(inventory))
        by_stock = {v['stock']: v for v in inv['vehicles']}
        for r in all_rows:
            v = by_stock.get(r['stock'])
            if v is None:
                print(f"  {r['stock']}: in PDF but not in inventory", file=sys.stderr)
            elif r.get('vin') and v.get('vin') and r['vin'] != v['vin']:
                print(f"  {r['stock']}: VIN mismatch PDF {r['vin']} vs inventory {v['vin']}", file=sys.stderr)
        n = 0
        for v in inv['vehicles']:
            rel = f"{out_dir.rstrip('/')}/{v['stock']}.jpg"
            if os.path.exists(rel):
                v['photo'] = rel.replace('\\', '/')
                n += 1
            else:
                v.pop('photo', None)
        json.dump(inv, open(inventory, 'w'), indent=2)
        open(inventory, 'a').write('\n')
        print(f"inventory: photo set on {n} of {len(inv['vehicles'])} vehicles")

    return saved


def remove_orphan_thumbs(thumbs_dir, stocks, *, also_unused=True):
    """Delete thumbnail files that are not for a current stock number.

    Returns the list of removed file paths.
    """
    if not os.path.isdir(thumbs_dir):
        return []
    keep = set(stocks)
    removed = []
    for name in os.listdir(thumbs_dir):
        if not re.match(r'^[A-Za-z0-9_-]+\.(jpe?g|png|webp)$', name, re.I):
            continue
        stock = name.rsplit('.', 1)[0]
        if stock not in keep:
            path = os.path.join(thumbs_dir, name)
            os.remove(path)
            removed.append(path)
    return removed


def extract_thumbs_main(argv=None):
    ap = argparse.ArgumentParser(
        description='Pull vehicle photo thumbnails out of a vAuto "AI Inventory Feed" PDF.')
    ap.add_argument('pdf')
    ap.add_argument('--out', default='assets/thumbs')
    ap.add_argument('--inventory', default=None)
    ap.add_argument('--width', type=int, default=480, help='max output width (px)')
    ap.add_argument('--report', default=None, help='write row/price details as JSON')
    a = ap.parse_args(argv)
    extract_thumbs(a.pdf, a.out, width=a.width, inventory=a.inventory, report=a.report)
