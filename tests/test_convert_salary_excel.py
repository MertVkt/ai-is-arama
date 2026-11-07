import unittest
from types import SimpleNamespace

from tools.convert_salary_excel import (
    CITY_PATTERNS,
    COMPANY_PATTERNS,
    COMPANY_PHRASES,
    INDEX_PATTERNS,
    detect_column_type,
    fold_header,
    header_matches,
    is_label,
    parse_number,
    parse_sheet,
)


class FakeWorksheet:
    title = "Sayfa1"

    def __init__(self, rows):
        self.rows = rows

    def iter_rows(self, min_row=1, max_row=None, values_only=False):
        rows = self.rows[min_row - 1:max_row]
        for row in rows:
            if values_only:
                yield row
            else:
                yield [SimpleNamespace(value=value) for value in row]

    def __getitem__(self, row_number):
        return [SimpleNamespace(value=value) for value in self.rows[row_number - 1]]


class FoldHeaderTests(unittest.TestCase):
    def test_turkish_uppercase_folds_cleanly(self):
        self.assertEqual(fold_header("ŞİRKET"), "şirket")
        self.assertNotIn("̇", fold_header("İŞVEREN"))
        self.assertEqual(fold_header("SAYISI"), fold_header("Sayısı"))


class LabelDetectionTests(unittest.TestCase):
    def test_company_labels_in_turkish_and_english(self):
        for header in ("Firma", "ŞİRKET", "Şirket Adı", "ŞİRKET ADI", "İşveren",
                       "Company", "Employer", "Company Name"):
            with self.subTest(header=header):
                self.assertTrue(is_label(header, COMPANY_PATTERNS, COMPANY_PHRASES))

    def test_city_labels_in_turkish_and_english(self):
        for header in ("Şehir", "İL", "İlçe", "Konum", "City", "Location"):
            with self.subTest(header=header):
                self.assertTrue(is_label(header, CITY_PATTERNS))

    def test_data_columns_are_not_labels(self):
        self.assertFalse(is_label("Şirket Puanı", COMPANY_PATTERNS, COMPANY_PHRASES))
        self.assertFalse(is_label("Maaş", CITY_PATTERNS))
        self.assertFalse(is_label("", COMPANY_PATTERNS))


class DetectColumnTypeTests(unittest.TestCase):
    def test_turkish_salary_headers_are_index(self):
        for header in ("Maaş", "Maaş (Brüt)", "MAAŞ (NET)", "Ortalama Brüt Maaş (TL)",
                       "Net Ücret", "Medyan", "Medyanı", "Maaş Endeksi", "Endeks",
                       "Kişi Başı Maaş"):
            with self.subTest(header=header):
                self.assertEqual(detect_column_type(header), "index")

    def test_english_index_headers_are_not_misclassified_as_count(self):
        for header in ("Index", "Salary Index", "Engineering Index", "Median salary"):
            with self.subTest(header=header):
                self.assertEqual(detect_column_type(header), "index")

    def test_turkish_count_headers(self):
        for header in ("Adet", "Sayı", "Çalışan Sayısı", "ÇALIŞAN SAYISI", "Kişi",
                       "Mühendis Sayısı", "Kişi Sayısı"):
            with self.subTest(header=header):
                self.assertEqual(detect_column_type(header), "count")

    def test_english_count_headers(self):
        for header in ("Count", "Engineering Count", "Employee n"):
            with self.subTest(header=header):
                self.assertEqual(detect_column_type(header), "count")

    def test_single_letter_n_only_matches_as_a_token(self):
        self.assertEqual(detect_column_type("Engineering"), None)

    def test_count_inside_word_does_not_make_count_header(self):
        self.assertIsNone(detect_column_type("Accounting Total"))
        self.assertEqual(detect_column_type("Accounting Index"), "index")

    def test_compound_patterns_match_suffixed_turkish_stems_only(self):
        # A compound stem ("maaş", "endeks") matches with a Turkish suffix.
        self.assertTrue(header_matches("Yazılımcı Maaşı", INDEX_PATTERNS))
        self.assertTrue(header_matches("endeksi", INDEX_PATTERNS))
        # A non-compound pattern ("salary") only matches as a whole token.
        self.assertFalse(header_matches("salaryindex", INDEX_PATTERNS))
        self.assertTrue(header_matches("salary index", INDEX_PATTERNS))


class ParseNumberTests(unittest.TestCase):
    def test_turkish_formatted_text(self):
        self.assertEqual(parse_number("45.000 TL"), 45000.0)
        self.assertEqual(parse_number("₺52.500,50"), 52500.5)
        self.assertEqual(parse_number("1.250.000"), 1250000.0)
        self.assertEqual(parse_number("12,5"), 12.5)

    def test_english_formatted_text_and_numbers(self):
        self.assertEqual(parse_number("105.5"), 105.5)
        self.assertEqual(parse_number("45,000"), 45000.0)
        self.assertEqual(parse_number(72000), 72000.0)

    def test_non_numbers_return_none(self):
        for value in ("gizli", "-", "", True):
            with self.subTest(value=value):
                self.assertIsNone(parse_number(value))


class ParseSheetTests(unittest.TestCase):
    def test_turkish_headers_with_paired_count_and_salary(self):
        ws = FakeWorksheet([
            ("Maaş Tablosu 2026", None, None, None),
            ("ŞİRKET", "Şehir", "Yazılım Çalışan Sayısı", "Yazılım Brüt Maaş (TL)"),
            ("Türkiye İş Bankası A.Ş.", "İstanbul", 3, "85.000"),
            ("Getir", "İstanbul", 2, 90000),
        ])

        companies = parse_sheet(ws)

        self.assertEqual(len(companies), 2)
        self.assertEqual(companies[0]["company"], "Türkiye İş Bankası A.Ş.")
        self.assertEqual(companies[0]["city"], "İstanbul")
        self.assertEqual(companies[0]["categories"]["yazılım"], {"count": 3, "index": 85000.0})
        self.assertEqual(companies[1]["categories"]["yazılım"], {"count": 2, "index": 90000.0})

    def test_salary_before_count_pair(self):
        ws = FakeWorksheet([
            ("Firma", "Veri Maaş Endeksi", "Veri Adet"),
            ("Trendyol", 112.5, 4),
        ])

        companies = parse_sheet(ws)

        self.assertEqual(companies[0]["categories"]["veri"], {"count": 4, "index": 112.5})

    def test_single_salary_column_keeps_turkish_key(self):
        ws = FakeWorksheet([
            ("Şirket Adı", "İl", "Aylık Brüt Maaş (TL)"),
            ("Aselsan", "Ankara", "75.000 TL"),
        ])

        companies = parse_sheet(ws)

        self.assertEqual(companies[0]["city"], "Ankara")
        self.assertEqual(companies[0]["categories"], {"aylık_brüt_maaş_tl": {"index": 75000.0}})

    def test_missing_city_column_and_empty_city_cell(self):
        ws = FakeWorksheet([
            ("İşveren", "Konum", "Maaş"),
            ("Insider", None, 95000),
        ])
        companies = parse_sheet(ws)
        self.assertEqual(companies[0]["city"], "")

        ws = FakeWorksheet([("Company", "Salary"), ("Peak Games", 100000)])
        companies = parse_sheet(ws)
        self.assertEqual(companies[0]["city"], "")
        self.assertEqual(companies[0]["categories"]["salary"], {"index": 100000.0})

    def test_rows_without_company_are_skipped(self):
        ws = FakeWorksheet([
            ("Firma", "Maaş"),
            (None, 50000),
            ("Getir", 60000),
        ])
        self.assertEqual([c["company"] for c in parse_sheet(ws)], ["Getir"])

    def test_sheet_without_company_header_is_skipped(self):
        ws = FakeWorksheet([("Ad", "Maaş"), ("Ali", 50000)])
        self.assertEqual(parse_sheet(ws), [])

    def test_parse_sheet_preserves_category_name_with_letter_n(self):
        ws = FakeWorksheet([
            ("Company", "Engineering Count", "Engineering Index"),
            ("Example Corp", 12, 105.5),
        ])
        companies = parse_sheet(ws)
        self.assertEqual(companies[0]["categories"]["engineering"], {"count": 12, "index": 105.5})

    def test_parse_sheet_groups_accounting_count_index_pair(self):
        ws = FakeWorksheet([
            ("Company", "Accounting Count", "Accounting Index"),
            ("Example Corp", 12, 105.5),
        ])
        companies = parse_sheet(ws)
        self.assertEqual(companies[0]["categories"]["accounting"], {"count": 12, "index": 105.5})

    def test_multi_word_category_name_uses_underscores(self):
        ws = FakeWorksheet([
            ("Şirket", "Kıdemli Yazılım Mühendisi Sayısı", "Kıdemli Yazılım Mühendisi Maaşı"),
            ("Getir", 8, 140000),
        ])
        companies = parse_sheet(ws)
        self.assertEqual(
            companies[0]["categories"]["kıdemli_yazılım_mühendisi"],
            {"count": 8, "index": 140000.0},
        )


if __name__ == "__main__":
    unittest.main()
