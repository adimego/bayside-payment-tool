#!/usr/bin/env python3
"""Unit tests for the vAuto AI Inventory Feed PDF parser and import safety checks."""
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from email.message import EmailMessage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts', 'lib'))
from vauto_pdf import (  # noqa: E402
    COLOR_FINISH_RE,
    is_vauto_inventory_pdf,
    parse_body_lines,
    parse_vehicle_lines,
    parse_vauto_pdf,
    extract_thumbs,
    remove_orphan_thumbs,
    write_csv,
)

EMAIL_PATH = os.path.join(ROOT, 'scripts', 'import-vauto-email.py')
spec = importlib.util.spec_from_file_location('import_vauto_email', EMAIL_PATH)
email_import = importlib.util.module_from_spec(spec)
spec.loader.exec_module(email_import)


class BodyAndNameParse(unittest.TestCase):
    def test_standard_clearcoat(self):
        r = parse_body_lines(['4D Crew Cab', 'Ceramic Gray', 'Clearcoat', 'Black'])
        self.assertEqual(r, {'body': '4D Crew Cab', 'color': 'Ceramic Gray Clearcoat', 'interior': 'Black'})

    def test_pearlcoat_disc(self):
        r = parse_body_lines(['4D Sport Utility', 'Velvet Red', 'Pearlcoat (DISC)', 'Black'])
        self.assertEqual(r['color'], 'Velvet Red Pearlcoat (DISC)')
        self.assertEqual(r['interior'], 'Black')

    def test_clearcoat_disc_on_own_line(self):
        r = parse_body_lines(['4D Sport Utility', 'Earl Clearcoat', '(DISC)', 'Black'])
        self.assertEqual(r['color'], 'Earl Clearcoat (DISC)')
        self.assertEqual(r['interior'], 'Black')

    def test_pearl_coat_two_words(self):
        r = parse_body_lines(['4D Sport Utility', 'Hydro Blue Pearl', 'Coat', 'Black'])
        self.assertEqual(r['color'], 'Hydro Blue Pearl Coat')
        self.assertEqual(r['interior'], 'Black')

    def test_color_without_finish_three_lines(self):
        r = parse_body_lines(['4D Sport Utility', 'Aurora', 'Blue/Super Black', 'Gray'])
        self.assertEqual(r['color'], 'Aurora Blue/Super Black')
        self.assertEqual(r['interior'], 'Gray')

    def test_wrapped_interior(self):
        r = parse_body_lines(['4D Sport Utility', 'Bright White', 'Clearcoat', 'Wicker', 'Beige/Black'])
        self.assertEqual(r['color'], 'Bright White Clearcoat')
        self.assertEqual(r['interior'], 'Wicker Beige/Black')

    def test_passenger_van_wraps(self):
        r = parse_body_lines(['4D Passenger', 'Van', 'Hydro Blue', 'Pearlcoat', 'Black'])
        self.assertEqual(r['body'], '4D Passenger Van')
        self.assertEqual(r['color'], 'Hydro Blue Pearlcoat')
        self.assertEqual(r['interior'], 'Black')

    def test_color_only_no_interior(self):
        r = parse_body_lines(['4D Sport Utility', 'Green'])
        self.assertEqual(r, {'body': '4D Sport Utility', 'color': 'Green', 'interior': None})

    def test_medium_light_stone_interior(self):
        r = parse_body_lines(['4D Hatchback', 'Oxford White', 'Medium Light', 'Stone'])
        self.assertEqual(r['color'], 'Oxford White')
        self.assertEqual(r['interior'], 'Medium Light Stone')

    def test_medium_dark_slate_interior(self):
        r = parse_body_lines(['4D Crew Cab', 'Race Red', 'Medium Dark', 'Slate'])
        self.assertEqual(r['color'], 'Race Red')
        self.assertEqual(r['interior'], 'Medium Dark Slate')

    def test_metallic_clearcoat(self):
        r = parse_body_lines(['4D Crew Cab', 'Billet Silver', 'Metallic Clearcoat', 'Black'])
        self.assertEqual(r['color'], 'Billet Silver Metallic Clearcoat')

    def test_name_vin_odometer(self):
        r = parse_vehicle_lines([
            '2023 Jeep Grand Cherokee', 'Laredo', 'VIN:', '1C4RJHAG2PC548900',
            'New/Used: U', 'Odometer: 21,653',
        ])
        self.assertEqual(r['name'], '2023 Jeep Grand Cherokee Laredo')
        self.assertEqual(r['vin'], '1C4RJHAG2PC548900')
        self.assertEqual(r['new_used'], 'U')
        self.assertEqual(r['odometer'], '21653')
        self.assertFalse(r['certified'])

    def test_certified_yes_is_not_part_of_the_name(self):
        r = parse_vehicle_lines([
            '2020 Jeep Compass Latitude', 'Certified:', 'Yes', 'VIN:',
            '3C4NJDBB9LT216588', 'New/Used: U', 'Odometer: 22,584',
        ])
        self.assertEqual(r['name'], '2020 Jeep Compass Latitude')
        self.assertTrue(r['certified'])
        self.assertEqual(r['vin'], '3C4NJDBB9LT216588')

    def test_vin_before_label_still_parses(self):
        r = parse_vehicle_lines(['2027 Ram 1500 TRX SRT', '1C6SRFU94VN587735', 'VIN:', 'New/Used: N', 'Odometer: 36'])
        self.assertEqual(r['name'], '2027 Ram 1500 TRX SRT')
        self.assertEqual(r['vin'], '1C6SRFU94VN587735')
        self.assertEqual(r['new_used'], 'N')

    def test_finish_regex_does_not_split_pearlcoat_on_pearl(self):
        m = COLOR_FINISH_RE.match('Patriot Blue Pearlcoat Black')
        self.assertEqual(m.group('color'), 'Patriot Blue Pearlcoat')
        self.assertEqual(m.group('interior'), 'Black')


class SafetyChecks(unittest.TestCase):
    def test_empty_aborts(self):
        self.assertEqual(email_import.safety_abort(144, 0), 'abort: parsed inventory is empty')
        self.assertEqual(email_import.safety_abort(0, 0), 'abort: parsed inventory is empty')

    def test_drop_more_than_half_aborts(self):
        msg = email_import.safety_abort(144, 71)
        self.assertIn('dropped from 144 to 71', msg)

    def test_exactly_half_is_allowed(self):
        self.assertIsNone(email_import.safety_abort(100, 50))

    def test_small_drop_is_allowed(self):
        self.assertIsNone(email_import.safety_abort(144, 141))

    def test_fingerprint_ignores_generated_at_and_key_order(self):
        a = {'generatedAt': '2026-01-01T00:00:00Z', 'vehicles': [{'stock': 'A', 'price': 1, 'name': 'X'}]}
        b = {'generatedAt': '2026-11-23T00:00:00Z', 'vehicles': [{'name': 'X', 'price': 1, 'stock': 'A'}]}
        self.assertEqual(email_import.vehicles_fingerprint(a), email_import.vehicles_fingerprint(b))
        b['vehicles'][0]['price'] = 2
        self.assertNotEqual(email_import.vehicles_fingerprint(a), email_import.vehicles_fingerprint(b))


def _tiny_jpeg_bytes(w=160, h=100, color=(200, 30, 30)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (w, h), color).save(buf, format='JPEG')
    return buf.getvalue()


def _build_sample_pdf(path):
    """A one-page landscape feed with two vehicles, one photo, one missing price."""
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page(width=1191.12, height=841.92)
    # Title + header (same x positions as the real feed).
    page.insert_text((190, 50), 'AI Inventory Feed', fontsize=16)
    page.insert_text((190, 70), 'Monday, November 23, 2026 10:24 AM', fontsize=11)
    page.insert_text((57, 108), 'Stock #', fontsize=8)
    page.insert_text((172, 108), 'Vehicle', fontsize=8)
    page.insert_text((299, 108), 'Body', fontsize=8)
    page.insert_text((380, 108), 'Price', fontsize=8)
    page.insert_text((440, 108), 'Photo Thumbnail', fontsize=8)

    def col(y, stock, name_lines, veh_meta, body_lines, price, img=None, img_y=None):
        page.insert_text((44, y), stock, fontsize=8)
        vy = y
        for line in name_lines:
            page.insert_text((107, vy), line, fontsize=9)
            vy += 12
        for line in veh_meta:
            page.insert_text((107, vy), line, fontsize=8)
            vy += 10
        by = y
        for line in body_lines:
            page.insert_text((273, by), line, fontsize=8)
            by += 10
        if price:
            page.insert_text((352, y), price, fontsize=10)
        if img is not None:
            rect = pymupdf.Rect(434, img_y, 504, img_y + 45)
            page.insert_image(rect, stream=img)

    col(128, 'VN587735',
        ['2027 Ram 1500 TRX SRT'],
        ['VIN: 1C6SRFU94VN587735', 'New/Used: N', 'Odometer: 36'],
        ['4D Crew Cab', 'Bright White', 'Clearcoat', 'Black'],
        None,
        img=_tiny_jpeg_bytes(160, 100, (180, 20, 20)),
        img_y=118)
    col(180, 'LT216588',
        ['2020 Jeep Compass Latitude'],
        ['Certified: Yes', 'VIN: 3C4NJDBB9LT216588', 'New/Used: U', 'Odometer: 22,584'],
        ['4D Sport Utility', 'Diamond Black', 'Crystal Pearlcoat', 'Black'],
        '$18,245',
        img=_tiny_jpeg_bytes(160, 100, (20, 20, 180)),
        img_y=170)
    page.insert_text((1100, 835), 'Page 1 of 1', fontsize=8)
    page.insert_text((464, 835), '©2026 vAuto, Inc.        https://www.vauto.com', fontsize=8)
    doc.save(path)
    doc.close()


class SamplePdfParse(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pdf = os.path.join(self.tmp.name, 'feed.pdf')
        _build_sample_pdf(self.pdf)

    def tearDown(self):
        self.tmp.cleanup()

    def test_is_recognized_as_vauto_feed(self):
        self.assertTrue(is_vauto_inventory_pdf(self.pdf))

    def test_parses_both_vehicles_and_fields(self):
        result = parse_vauto_pdf(self.pdf)
        self.assertEqual(len(result['vehicles']), 2)
        self.assertEqual(result['title_date'], 'Monday, November 23, 2026')
        by = {v['stock']: v for v in result['vehicles']}
        trx = by['VN587735']
        self.assertEqual(trx['name'], '2027 Ram 1500 TRX SRT')
        self.assertEqual(trx['vin'], '1C6SRFU94VN587735')
        self.assertEqual(trx['new_used'], 'N')
        self.assertEqual(trx['odometer'], '36')
        self.assertEqual(trx['body'], '4D Crew Cab')
        self.assertEqual(trx['color'], 'Bright White Clearcoat')
        self.assertEqual(trx['interior'], 'Black')
        self.assertIsNone(trx['price'])
        self.assertFalse(trx['certified'])
        jeep = by['LT216588']
        self.assertEqual(jeep['name'], '2020 Jeep Compass Latitude')
        self.assertTrue(jeep['certified'])
        self.assertEqual(jeep['price'], '$18,245')
        self.assertEqual(jeep['new_used'], 'U')
        self.assertEqual(jeep['odometer'], '22584')
        self.assertEqual(jeep['color'], 'Diamond Black Crystal Pearlcoat')

    def test_csv_round_trip_through_node_importer(self):
        import subprocess
        result = parse_vauto_pdf(self.pdf)
        csv_path = os.path.join(self.tmp.name, 'report.csv')
        out_json = os.path.join(self.tmp.name, 'inventory.json')
        thumbs = os.path.join(self.tmp.name, 'thumbs')
        os.makedirs(thumbs, exist_ok=True)
        write_csv(result['rows'], csv_path)
        r = subprocess.run(
            ['node', os.path.join(ROOT, 'scripts/import-vauto.mjs'), csv_path, out_json,
             '--thumbs-dir', thumbs, '--skip-thumbs-extract'],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        inv = json.load(open(out_json))
        self.assertEqual(inv['count'], 2)
        by = {v['stock']: v for v in inv['vehicles']}
        self.assertIsNone(by['VN587735']['price'])
        self.assertEqual(by['LT216588']['price'], 18245)
        self.assertTrue(by['LT216588']['certified'])
        self.assertEqual(by['LT216588']['condition'], 'Used')
        self.assertEqual(by['VN587735']['condition'], 'New')
        self.assertEqual(by['VN587735']['type'], 'Truck')
        self.assertEqual(by['LT216588']['type'], 'SUV')

    def test_extract_thumbs_and_orphan_cleanup(self):
        thumbs = os.path.join(self.tmp.name, 'thumbs')
        leftover = os.path.join(thumbs, 'GONE123.jpg')
        os.makedirs(thumbs, exist_ok=True)
        open(leftover, 'wb').write(_tiny_jpeg_bytes())
        saved = extract_thumbs(self.pdf, thumbs)
        self.assertIn('VN587735', saved)
        self.assertIn('LT216588', saved)
        self.assertTrue(os.path.exists(os.path.join(thumbs, 'VN587735.jpg')))
        removed = remove_orphan_thumbs(thumbs, saved.keys())
        self.assertTrue(any(p.endswith('GONE123.jpg') for p in removed))
        self.assertFalse(os.path.exists(leftover))


class AttachmentWalk(unittest.TestCase):
    def test_prefers_pdf_attachments(self):
        msg = EmailMessage()
        msg['Subject'] = 'AI Inventory Feed'
        msg['From'] = 'reports@vauto.com'
        msg['Date'] = 'Mon, 23 Nov 2026 08:30:00 -0500'
        msg['Message-ID'] = '<feed@vauto.test>'
        msg.set_content('See attached')
        msg.add_attachment(b'not-a-real-xlsx', maintype='application',
                           subtype='vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                           filename='report.xlsx')
        msg.add_attachment(b'%PDF-fake', maintype='application', subtype='pdf',
                           filename='AI Inventory Feed.pdf')
        atts = list(email_import.iter_attachments(msg))
        atts.sort(key=email_import.attachment_rank)
        self.assertEqual(atts[0]['ext'], '.pdf')
        self.assertEqual(atts[0]['filename'], 'AI Inventory Feed.pdf')
        self.assertEqual(atts[1]['ext'], '.xlsx')


if __name__ == '__main__':
    unittest.main()
