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
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from vauto_pdf import extract_thumbs_main

if __name__ == '__main__':
    extract_thumbs_main()
