#!/usr/bin/env python3
"""Fetch the latest vAuto inventory report from Gmail and update the site data.

    # From a local file (no inbox):
    python3 scripts/import-vauto-email.py --file report.pdf

    # From baysidekg@gmail.com (GMAIL_USER + GMAIL_APP_PASSWORD):
    python3 scripts/import-vauto-email.py

Finds the newest message from the last two days with a vAuto report
attachment (PDF preferred; xlsx/csv as fallback), parses it with the same
rules as scripts/import-vauto.mjs, extracts PDF thumbnails, and writes
data/inventory.json. Aborts with no write if the parse is empty or the
count drops by more than 50%. Skips cleanly when there is no new report
or the inventory would not change.

Processed mail is tagged with the Gmail label "vAuto-imported" and
recorded in data/vauto-import-state.json so a report is never imported twice.
"""
from __future__ import annotations

import argparse
import email
import email.header
import email.utils
import imaplib
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'lib'))
from vauto_pdf import (  # noqa: E402
    extract_thumbs,
    is_vauto_inventory_pdf,
    parse_vauto_pdf,
    remove_orphan_thumbs,
    write_csv,
)

GMAIL_IMAP = 'imap.gmail.com'
GMAIL_PORT = 993
PROCESSED_LABEL = 'vAuto-imported'
STATE_PATH = os.path.join(ROOT, 'data', 'vauto-import-state.json')
INVENTORY_PATH = os.path.join(ROOT, 'data', 'inventory.json')
THUMBS_DIR = os.path.join(ROOT, 'assets', 'thumbs')
LOOKBACK_DAYS = 2


def log(msg):
    print(msg, flush=True)


def set_github_output(key, value):
    path = os.environ.get('GITHUB_OUTPUT')
    if not path:
        return
    with open(path, 'a', encoding='utf-8') as f:
        f.write(f'{key}={value}\n')


def decode_header_value(raw):
    if raw is None:
        return ''
    parts = email.header.decode_header(raw)
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            out.append(text.decode(enc or 'utf-8', errors='replace'))
        else:
            out.append(text)
    return ''.join(out)


def current_inventory_count():
    if not os.path.exists(INVENTORY_PATH):
        return 0
    inv = json.load(open(INVENTORY_PATH))
    return int(inv.get('count') or len(inv.get('vehicles') or []))


def vehicles_fingerprint(inv):
    """Stable comparison that ignores generatedAt."""
    vehicles = []
    for v in inv.get('vehicles') or []:
        vehicles.append({k: v[k] for k in sorted(v)})
    vehicles.sort(key=lambda x: x.get('stock') or '')
    return json.dumps(vehicles, sort_keys=True, separators=(',', ':'))


def safety_abort(old_count, new_count):
    if new_count <= 0:
        return 'abort: parsed inventory is empty'
    if old_count > 0 and new_count < old_count * 0.5:
        return f'abort: inventory dropped from {old_count} to {new_count} (more than 50%)'
    return None


def load_state():
    if not os.path.exists(STATE_PATH):
        return {}
    try:
        return json.load(open(STATE_PATH))
    except json.JSONDecodeError:
        return {}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=2)
        f.write('\n')


def run_node_import(report_path, out_path, thumbs_dir):
    """Run the existing Node importer so CSV/XLSX (and PDF-as-CSV) share one parser."""
    script = os.path.join(ROOT, 'scripts', 'import-vauto.mjs')
    cmd = [
        'node', script, report_path, out_path,
        '--thumbs-dir', thumbs_dir,
        '--skip-thumbs-extract',
    ]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stdout)
        sys.stderr.write(r.stderr)
        raise RuntimeError(f'import-vauto.mjs failed with exit {r.returncode}')
    if r.stdout:
        print(r.stdout, end='' if r.stdout.endswith('\n') else '\n', flush=True)
    if r.stderr:
        print(r.stderr, end='' if r.stderr.endswith('\n') else '\n', flush=True, file=sys.stderr)
    return json.load(open(out_path))


def import_report_file(path, *, work_dir, apply):
    """Parse a report into a new inventory + thumbs in work_dir.

    If apply is True, copy the result onto data/inventory.json and assets/thumbs.
    Returns (inventory, source_label).
    """
    ext = os.path.splitext(path)[1].lower()
    tmp_inv = os.path.join(work_dir, 'inventory.json')
    tmp_thumbs = os.path.join(work_dir, 'thumbs')
    os.makedirs(tmp_thumbs, exist_ok=True)
    source = 'vAuto report'

    if ext == '.pdf':
        if not is_vauto_inventory_pdf(path):
            raise RuntimeError('PDF is not a vAuto AI Inventory Feed')
        parsed = parse_vauto_pdf(path)
        csv_path = os.path.join(work_dir, 'report.csv')
        write_csv(parsed['rows'], csv_path)
        for w in parsed['warnings']:
            print('warning:', w, file=sys.stderr)
        # Seed temp thumbs with current files so a failed extract still keeps
        # photos for stocks the new report also has; extract overwrites matches.
        if os.path.isdir(THUMBS_DIR):
            for name in os.listdir(THUMBS_DIR):
                if re.match(r'^[A-Za-z0-9_-]+\.(jpe?g|png|webp)$', name, re.I):
                    shutil.copy2(os.path.join(THUMBS_DIR, name), os.path.join(tmp_thumbs, name))
        inv = run_node_import(csv_path, tmp_inv, tmp_thumbs)
        extract_thumbs(path, tmp_thumbs, inventory=tmp_inv)
        inv = json.load(open(tmp_inv))
        stocks = {v['stock'] for v in inv['vehicles']}
        remove_orphan_thumbs(tmp_thumbs, stocks)
        # After extract, drop leftover pre-seeded thumbs for stocks with no photo.
        for v in inv['vehicles']:
            rel = f"{tmp_thumbs}/{v['stock']}.jpg"
            if not os.path.exists(rel):
                v.pop('photo', None)
            else:
                # Point at the live path, not the work dir.
                v['photo'] = f"assets/thumbs/{v['stock']}.jpg"
        if parsed.get('title_date'):
            source = f"vAuto AI Inventory Feed ({parsed['title_date']})"
        else:
            source = 'vAuto AI Inventory Feed'
        inv['source'] = source
        inv['count'] = len(inv['vehicles'])
        with open(tmp_inv, 'w', encoding='utf-8') as f:
            json.dump(inv, f, indent=2)
            f.write('\n')
    elif ext in ('.xlsx', '.xls', '.csv'):
        if os.path.isdir(THUMBS_DIR):
            for name in os.listdir(THUMBS_DIR):
                if re.match(r'^[A-Za-z0-9_-]+\.(jpe?g|png|webp)$', name, re.I):
                    shutil.copy2(os.path.join(THUMBS_DIR, name), os.path.join(tmp_thumbs, name))
        inv = run_node_import(path, tmp_inv, tmp_thumbs)
        stocks = {v['stock'] for v in inv['vehicles']}
        # Keep existing photos for remaining stocks; only drop those that left.
        remove_orphan_thumbs(tmp_thumbs, stocks)
        for v in inv['vehicles']:
            rel = f"assets/thumbs/{v['stock']}.jpg"
            if os.path.exists(os.path.join(tmp_thumbs, f"{v['stock']}.jpg")):
                if not v.get('photo'):
                    v['photo'] = rel
            else:
                v.pop('photo', None)
        inv['count'] = len(inv['vehicles'])
        with open(tmp_inv, 'w', encoding='utf-8') as f:
            json.dump(inv, f, indent=2)
            f.write('\n')
        source = inv.get('source') or 'vAuto report'
    else:
        raise RuntimeError(f'Unsupported report type: {ext}')

    old = json.load(open(INVENTORY_PATH)) if os.path.exists(INVENTORY_PATH) else {'vehicles': []}
    abort = safety_abort(len(old.get('vehicles') or []), len(inv['vehicles']))
    if abort:
        raise SystemExit(abort)

    unchanged = vehicles_fingerprint(old) == vehicles_fingerprint(inv)
    if unchanged:
        return inv, source, 'no change'

    if apply:
        os.makedirs(os.path.dirname(INVENTORY_PATH), exist_ok=True)
        shutil.copy2(tmp_inv, INVENTORY_PATH)
        os.makedirs(THUMBS_DIR, exist_ok=True)
        # Replace the thumbs dir contents with the work dir (includes deletes).
        live_names = set()
        for name in os.listdir(tmp_thumbs):
            if re.match(r'^[A-Za-z0-9_-]+\.(jpe?g|png|webp)$', name, re.I):
                shutil.copy2(os.path.join(tmp_thumbs, name), os.path.join(THUMBS_DIR, name))
                live_names.add(name.rsplit('.', 1)[0])
        remove_orphan_thumbs(THUMBS_DIR, live_names)
        # Re-write inventory with live photo paths (already set) and current timestamp.
        inv['generatedAt'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
        inv['source'] = source
        inv['count'] = len(inv['vehicles'])
        with open(INVENTORY_PATH, 'w', encoding='utf-8') as f:
            json.dump(inv, f, indent=2)
            f.write('\n')

    return inv, source, 'imported'


# --- IMAP -----------------------------------------------------------------

def _app_password(raw):
    return re.sub(r'\s+', '', raw or '')


def connect_imap(user, password):
    ctx = ssl.create_default_context()
    client = imaplib.IMAP4_SSL(GMAIL_IMAP, GMAIL_PORT, ssl_context=ctx)
    client.login(user, password)
    return client


def ensure_label(client, label):
    typ, _ = client.create(f'"{label}"')
    # Gmail returns NO if the label already exists; that is fine.
    return typ


def list_recent_uids(client, since_days):
    typ, _ = client.select('INBOX', readonly=True)
    if typ != 'OK':
        raise RuntimeError('Could not open INBOX')
    since = (datetime.now(timezone.utc) - timedelta(days=since_days)).strftime('%d-%b-%Y')
    typ, data = client.uid('search', None, f'(SINCE {since})')
    if typ != 'OK':
        return []
    return [u.decode() if isinstance(u, bytes) else u for u in (data[0] or b'').split()]


def fetch_message(client, uid):
    typ, data = client.uid('fetch', uid, '(BODY.PEEK[] X-GM-LABELS FLAGS)')
    if typ != 'OK' or not data or data[0] is None:
        return None, [], []
    labels, flags = [], []
    raw = None
    for item in data:
        if isinstance(item, tuple):
            meta = item[0].decode(errors='replace') if isinstance(item[0], bytes) else str(item[0])
            raw = item[1]
            m = re.search(r'X-GM-LABELS \((.*?)\)', meta)
            if m:
                labels = re.findall(r'"([^"]+)"|(\S+)', m.group(1))
                labels = [a or b for a, b in labels]
            m = re.search(r'FLAGS \((.*?)\)', meta)
            if m:
                flags = m.group(1).split()
        elif isinstance(item, bytes) and raw is None:
            raw = item
    msg = email.message_from_bytes(raw or b'')
    return msg, labels, flags


def iter_attachments(msg):
    for part in msg.walk():
        disp = (part.get('Content-Disposition') or '')
        name = part.get_filename()
        if name:
            name = decode_header_value(name)
        ctype = part.get_content_type()
        if not name and ctype not in (
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv',
        ):
            continue
        if not name:
            if ctype == 'application/pdf':
                name = 'report.pdf'
            elif 'spreadsheet' in ctype or ctype == 'application/vnd.ms-excel':
                name = 'report.xlsx'
            elif 'csv' in ctype:
                name = 'report.csv'
            else:
                continue
        ext = os.path.splitext(name)[1].lower()
        if ext not in ('.pdf', '.xlsx', '.xls', '.csv'):
            # Some mailers use .PDF or a name without a useful type.
            if ctype == 'application/pdf':
                name += '.pdf' if not name.lower().endswith('.pdf') else ''
                ext = '.pdf'
            else:
                continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        yield {'filename': name, 'ext': ext, 'data': payload}


def attachment_rank(att):
    # Prefer the official PDF feed, then Excel, then CSV.
    return {'.pdf': 0, '.xlsx': 1, '.xls': 2, '.csv': 3}.get(att['ext'], 9)


def valid_report_attachment(att, work_dir):
    path = os.path.join(work_dir, 'check-' + re.sub(r'[^A-Za-z0-9._-]+', '_', att['filename']))
    with open(path, 'wb') as f:
        f.write(att['data'])
    if att['ext'] == '.pdf':
        ok = is_vauto_inventory_pdf(path)
        if ok:
            parsed = parse_vauto_pdf(path)
            ok = len(parsed['vehicles']) > 0
        return ok, path
    # xlsx/csv: let the Node parser decide (must have vehicles).
    try:
        tmp_inv = os.path.join(work_dir, 'check-inventory.json')
        # Don't copy all thumbs just to validate; use an empty thumbs dir.
        empty = os.path.join(work_dir, 'check-thumbs')
        os.makedirs(empty, exist_ok=True)
        # Temporarily point keep-photo lookup at the empty dir only.
        inv = run_node_import(path, tmp_inv, empty)
        return len(inv.get('vehicles') or []) > 0, path
    except Exception as e:
        log(f"  skipping {att['filename']}: {e}")
        return False, path


def message_sort_key(msg, uid):
    raw = msg.get('Date')
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        dt = datetime(1970, 1, 1, tzinfo=timezone.utc)
    try:
        uid_n = int(uid)
    except ValueError:
        uid_n = 0
    return (dt, uid_n)


def mark_processed(user, password, uid):
    client = connect_imap(user, password)
    try:
        client.select('INBOX')
        ensure_label(client, PROCESSED_LABEL)
        # Gmail label, then Seen. Either is enough to avoid a double import
        # when combined with the state file; doing both is more visible in the inbox.
        client.uid('store', uid, '+X-GM-LABELS', f'({PROCESSED_LABEL})')
        client.uid('store', uid, '+FLAGS', r'(\Seen)')
    finally:
        try:
            client.logout()
        except Exception:
            pass


def find_latest_report(user, password, since_days, work_dir, processed_id=None):
    client = connect_imap(user, password)
    try:
        typ, dat = client.select('INBOX', readonly=True)
        if typ != 'OK':
            raise RuntimeError('Could not open INBOX')
        log('IMAP login OK')
        uids = list_recent_uids(client, since_days)
        log(f'Found {len(uids)} message(s) from the last {since_days} days')
        candidates = []
        for uid in uids:
            msg, labels, flags = fetch_message(client, uid)
            if msg is None:
                continue
            mid = (msg.get('Message-ID') or '').strip()
            already = PROCESSED_LABEL in labels or (processed_id and mid and mid == processed_id)
            atts = list(iter_attachments(msg))
            if not atts:
                continue
            atts.sort(key=attachment_rank)
            candidates.append({
                'uid': uid,
                'msg': msg,
                'labels': labels,
                'already': already,
                'atts': atts,
                'subject': decode_header_value(msg.get('Subject')),
                'date': msg.get('Date') or '',
                'message_id': mid,
                'sort': message_sort_key(msg, uid),
            })
        candidates.sort(key=lambda c: c['sort'], reverse=True)
        for c in candidates:
            # Try attachments in preference order until one is a real report.
            for att in c['atts']:
                ok, path = valid_report_attachment(att, work_dir)
                if ok:
                    c['report_path'] = path
                    c['filename'] = att['filename']
                    return c
        return None
    finally:
        try:
            client.logout()
        except Exception:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--file', default=None, help='import this report instead of checking Gmail')
    ap.add_argument('--since-days', type=int, default=LOOKBACK_DAYS)
    ap.add_argument('--dry-run', action='store_true', help='parse and safety-check, but do not write')
    args = ap.parse_args()

    os.chdir(ROOT)
    apply = not args.dry_run
    work_dir = tempfile.mkdtemp(prefix='vauto-import-')
    try:
        if args.file:
            log(f'Importing from file {args.file}')
            inv, source, status = import_report_file(os.path.abspath(args.file), work_dir=work_dir, apply=apply)
            if status == 'no change':
                log('no change')
                set_github_output('imported', 'no')
                return 0
            log(f"imported {inv['count']} vehicles from {source}")
            set_github_output('imported', 'yes' if apply else 'no')
            return 0

        user = os.environ.get('GMAIL_USER') or ''
        password = _app_password(os.environ.get('GMAIL_APP_PASSWORD') or '')
        if not user or not password:
            log('error: GMAIL_USER and GMAIL_APP_PASSWORD are required unless --file is set')
            return 1

        state = load_state()
        try:
            report = find_latest_report(
                user, password, args.since_days, work_dir,
                processed_id=state.get('messageId'),
            )
        except imaplib.IMAP4.error as e:
            log(f'IMAP error: {e}')
            return 1

        if report is None:
            log('no report')
            set_github_output('imported', 'no')
            return 0
        if report['already']:
            log('no report')
            set_github_output('imported', 'no')
            return 0

        log(f"Using {report['filename']} from \"{report['subject']}\" ({report['date']})")
        inv, source, status = import_report_file(report['report_path'], work_dir=work_dir, apply=apply)
        if status == 'no change':
            log('no change')
            if apply:
                save_state({
                    'messageId': report['message_id'],
                    'importedAt': datetime.now(timezone.utc).isoformat(),
                    'subject': report['subject'],
                    'sentAt': report['date'],
                    'filename': report['filename'],
                    'count': inv['count'],
                    'status': 'no change',
                })
                try:
                    mark_processed(user, password, report['uid'])
                except Exception as e:
                    log(f'warning: could not label processed message: {e}')
            set_github_output('imported', 'no')
            return 0

        log(f"imported {inv['count']} vehicles from {source}")
        if apply:
            save_state({
                'messageId': report['message_id'],
                'importedAt': datetime.now(timezone.utc).isoformat(),
                'subject': report['subject'],
                'sentAt': report['date'],
                'filename': report['filename'],
                'count': inv['count'],
                'status': 'imported',
            })
            try:
                mark_processed(user, password, report['uid'])
            except Exception as e:
                log(f'warning: could not label processed message: {e}')
        set_github_output('imported', 'yes' if apply else 'no')
        return 0
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except SystemExit as e:
        # safety abort message
        if e.code and not isinstance(e.code, int):
            log(str(e.code))
            set_github_output('imported', 'no')
            sys.exit(1)
        raise
