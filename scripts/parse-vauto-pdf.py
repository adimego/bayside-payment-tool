#!/usr/bin/env python3
"""Convert a vAuto AI Inventory Feed PDF to CSV (same columns as the xlsx report).

    python3 scripts/parse-vauto-pdf.py report.pdf [--csv out.csv] [--json out.json]
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'lib'))
from vauto_pdf import parse_vauto_pdf, write_csv, is_vauto_inventory_pdf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('--csv', default=None, help='write tabular rows as CSV')
    ap.add_argument('--json', default=None, help='write parsed vehicle dicts as JSON')
    a = ap.parse_args()
    if not is_vauto_inventory_pdf(a.pdf):
        print('error: file does not look like a vAuto AI Inventory Feed PDF', file=sys.stderr)
        sys.exit(2)
    result = parse_vauto_pdf(a.pdf)
    if a.csv:
        write_csv(result['rows'], a.csv)
    if a.json:
        os.makedirs(os.path.dirname(os.path.abspath(a.json)) or '.', exist_ok=True)
        with open(a.json, 'w', encoding='utf-8') as f:
            json.dump({k: result[k] for k in ('vehicles', 'warnings', 'title_date')}, f, indent=2)
            f.write('\n')
    print(f"Parsed {len(result['vehicles'])} vehicles"
          + (f" ({result['title_date']})" if result['title_date'] else '')
          + (f" -> {a.csv}" if a.csv else ''))
    for w in result['warnings']:
        print('warning:', w, file=sys.stderr)
    if not result['vehicles']:
        sys.exit(1)


if __name__ == '__main__':
    main()
