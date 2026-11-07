"""Tests for salary_lookup.py: format_entry, normalization, match_score and search_company."""

import unittest

from salary_lookup import (
    format_entry,
    turkish_lower,
    fold_case,
    normalize,
    anglicize,
    extract_core_words,
    match_score,
    search_company,
)


# ---------------------------------------------------------------------------
# format_entry
# ---------------------------------------------------------------------------

class FormatEntryTests(unittest.TestCase):
    def test_zero_count_is_displayed_as_zero(self):
        entry = {
            "company": "Örnek Teknoloji A.Ş.",
            "city": "",
            "categories": {"public_data": {"count": 0, "index": 100.0}},
        }

        rendered = format_entry(entry, {"index_baseline": 100, "index_label": "Index"})

        self.assertRegex(rendered, r"Public Data\s+0\s+100\.0")

    def test_text_index_does_not_crash(self):
        entry = {
            "company": "Örnek Teknoloji A.Ş.",
            "city": "",
            "categories": {"sample": {"count": 3, "index": "gizli"}},
        }

        rendered = format_entry(entry, {"index_baseline": 100, "index_label": "Index"})

        self.assertIn("gizli", rendered)

    def test_turkish_company_and_city_are_rendered_unchanged(self):
        entry = {
            "company": "Türkiye İş Bankası A.Ş.",
            "city": "İstanbul",
            "categories": {"yazilim": {"count": 2, "index": 110.0}},
        }

        rendered = format_entry(entry, {"index_baseline": 100, "index_label": "Endeks"})

        self.assertIn("Türkiye İş Bankası A.Ş.", rendered)
        self.assertIn("Location: İstanbul", rendered)
        self.assertIn("+10.0%", rendered)

    def test_format_entry_with_zero_baseline(self):
        entry = {
            "company": "Örnek Teknoloji A.Ş.",
            "city": "",
            "categories": {"it": {"count": None, "index": 85000.0}},
        }
        rendered = format_entry(entry, {"index_baseline": 0, "index_label": "Aylık brüt (TL)"})
        self.assertIn("85000.0", rendered)
        self.assertNotIn("%", rendered)

    def test_format_entry_with_custom_tl_baseline(self):
        entry = {
            "company": "Örnek Teknoloji A.Ş.",
            "city": "",
            "categories": {"it": {"count": None, "index": 90000.0}},
        }
        rendered = format_entry(entry, {"index_baseline": 80000, "index_label": "Aylık brüt (TL)"})
        self.assertIn("90000.0", rendered)
        self.assertIn("+12.5%", rendered)

    def test_format_entry_below_custom_baseline_is_negative(self):
        entry = {
            "company": "Örnek Teknoloji A.Ş.",
            "city": "",
            "categories": {"it": {"count": 1, "index": 60000.0}},
        }
        rendered = format_entry(entry, {"index_baseline": 80000, "index_label": "TL"})
        self.assertIn("-25.0%", rendered)

    def test_missing_index_is_shown_as_na(self):
        entry = {
            "company": "Örnek Teknoloji A.Ş.",
            "city": "",
            "categories": {"it": {"count": 2, "index": None}},
        }
        rendered = format_entry(entry, {"index_baseline": 100})
        self.assertIn("N/A*", rendered)


# ---------------------------------------------------------------------------
# Turkish casing and transliteration
# ---------------------------------------------------------------------------

class TurkishCasingTests(unittest.TestCase):
    def test_dotted_capital_i_lowers_without_combining_dot(self):
        # Plain str.lower() gives "i" + U+0307 here.
        self.assertEqual(turkish_lower("İSTANBUL"), "istanbul")
        self.assertNotIn("̇", turkish_lower("İzmir"))

    def test_dotless_capital_i_lowers_to_dotless(self):
        self.assertEqual(turkish_lower("IŞIK"), "ışık")
        self.assertEqual(turkish_lower("BANKASI"), "bankası")

    def test_fold_case_treats_dotted_and_dotless_i_alike(self):
        self.assertEqual(fold_case("BANKASI"), fold_case("Bankası"))
        self.assertEqual(fold_case("INSIDER"), fold_case("Insider"))
        self.assertEqual(fold_case("İnsider"), fold_case("Insider"))

    def test_decomposed_input_is_normalized(self):
        decomposed = "İş"  # "İş" written with combining marks
        self.assertEqual(fold_case(decomposed), "iş")

    def test_anglicize_transliterates_turkish_letters(self):
        self.assertEqual(anglicize("ışık"), "isik")
        self.assertEqual(anglicize("şğçöü"), "sgcou")
        self.assertEqual(anglicize("İŞ ĞÇÖÜ"), "is gcou")
        self.assertEqual(anglicize("arçelik"), "arcelik")


# ---------------------------------------------------------------------------
# Normalization and suffix stripping
# ---------------------------------------------------------------------------

class NormalizeTests(unittest.TestCase):
    def test_turkish_legal_suffixes_are_stripped(self):
        cases = {
            "Arçelik A.Ş.": "arçelik",
            "Arçelik AŞ": "arçelik",
            "Arcelik A.S.": "arcelik",
            "Arçelik Anonim Şirketi": "arçelik",
            "Örnek Yazılım Ltd. Şti.": "örnekyazilim",
            "Örnek Yazılım Ltd.Şti.": "örnekyazilim",
            "Örnek Yazılım Limited Şirketi": "örnekyazilim",
            "Örnek Yazılım Şti.": "örnekyazilim",
            "Örnek Gıda San. ve Tic. Ltd. Şti.": "örnekgida",
            "Örnek Gıda Sanayi ve Ticaret A.Ş.": "örnekgida",
            "Örnek Tic. A.Ş.": "örnek",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize(raw), expected)

    def test_noise_words_are_stripped(self):
        self.assertEqual(normalize("Koç Holding A.Ş."), "koç")
        self.assertEqual(normalize("Doğuş Grup"), "doğuş")
        self.assertEqual(normalize("Sabancı Group"), "sabanci")
        self.assertEqual(normalize("Türkiye İş Bankası A.Ş."), "işbankasi")
        self.assertEqual(normalize("Microsoft Turkey"), "microsoft")
        self.assertEqual(normalize("Siemens Türkiye Şubesi"), "siemens")

    def test_parentheticals_and_text_after_comma_are_stripped(self):
        self.assertEqual(normalize("Peak Games (İstanbul)"), "peakgames")
        self.assertEqual(normalize("Trendyol, Ankara Ofisi"), "trendyol")

    def test_suffix_letters_inside_words_are_kept(self):
        # "aş" only goes when it stands alone, not inside "Taşkent" or "Aşçı".
        self.assertEqual(normalize("Taşkent Gıda"), "taşkentgida")
        self.assertEqual(normalize("Aşçı Mutfak"), "aşçimutfak")
        self.assertEqual(normalize("Grupama Sigorta"), "grupamasigorta")

    def test_english_names_are_unaffected(self):
        self.assertEqual(normalize("Trendyol"), "trendyol")
        self.assertEqual(normalize("Getir"), "getir")
        self.assertEqual(normalize("INSIDER"), "insider")
        self.assertEqual(normalize("Peak Games"), "peakgames")

    def test_extract_core_words(self):
        self.assertEqual(extract_core_words("Türkiye İş Bankası A.Ş."), ["iş", "bankasi"])
        self.assertEqual(extract_core_words("A.Ş."), [])
        self.assertEqual(extract_core_words("Ltd. Şti."), [])
        self.assertEqual(extract_core_words("Test Şirket (Alt Birim)"), ["test", "şirket"])


# ---------------------------------------------------------------------------
# match_score
# ---------------------------------------------------------------------------

class TestMatchScoreExactMatch(unittest.TestCase):
    def test_exact_match_returns_100(self):
        self.assertEqual(match_score("Trendyol", "Trendyol"), 100)

    def test_exact_match_case_insensitive(self):
        self.assertEqual(match_score("PEAK GAMES", "Peak Games"), 100)

    def test_exact_match_after_suffix_stripping(self):
        self.assertEqual(match_score("Arçelik", "Arçelik A.Ş."), 100)
        self.assertEqual(match_score("Arçelik", "Arçelik Anonim Şirketi"), 100)


class TestIsBankasiVariants(unittest.TestCase):
    """All common spellings of the same bank should find the dataset entry."""

    ENTRY = "Türkiye İş Bankası A.Ş."

    def test_turkish_spellings_are_exact_matches(self):
        for query in ("İŞ BANKASI", "iş bankası", "İş Bankası", "Türkiye İş Bankası A.Ş.",
                      "İş Bankası AŞ"):
            with self.subTest(query=query):
                self.assertEqual(match_score(query, self.ENTRY), 100)

    def test_ascii_spellings_match_through_transliteration(self):
        for query in ("Is Bankasi", "IS BANKASI", "is bankasi"):
            with self.subTest(query=query):
                self.assertEqual(match_score(query, self.ENTRY), 85)

    def test_search_returns_entry_for_every_variant(self):
        data = _make_data(_entry(self.ENTRY, "İstanbul"), _entry("Garanti BBVA", "İstanbul"))
        for query in ("İŞ BANKASI", "Is Bankasi", "iş bankası", "Türkiye İş Bankası A.Ş."):
            with self.subTest(query=query):
                results = search_company(data, query)
                self.assertEqual([r["company"] for r in results], [self.ENTRY])


class TestMatchScoreSubstring(unittest.TestCase):
    def test_query_contained_in_entry_gives_high_score(self):
        score = match_score("Getir", "Getir Perakende Lojistik A.Ş.")
        self.assertGreaterEqual(score, 80)

    def test_entry_contained_in_query_gives_high_score(self):
        score = match_score("Getir Perakende", "Getir")
        self.assertGreaterEqual(score, 80)


class TestMatchScoreShortQuery(unittest.TestCase):
    def test_short_query_no_word_overlap_returns_zero(self):
        self.assertEqual(match_score("ab", "Something Unrelated Company"), 0)

    def test_short_query_with_word_overlap_scores(self):
        self.assertGreater(match_score("THY", "THY Teknik A.Ş."), 0)


class TestMatchScoreTransliteration(unittest.TestCase):
    def test_ascii_query_matches_turkish_entry(self):
        self.assertEqual(match_score("Arcelik", "Arçelik A.Ş."), 85)
        self.assertEqual(match_score("Turk Telekom", "Türk Telekom"), 85)

    def test_turkish_query_matches_ascii_entry(self):
        self.assertEqual(match_score("Türk Telekom", "Turk Telekom A.S."), 85)

    def test_partial_ascii_query_matches(self):
        self.assertEqual(match_score("Sisecam", "Şişecam Topluluğu"), 75)


class TestMatchScoreNoOverlap(unittest.TestCase):
    def test_completely_unrelated_names_return_zero(self):
        self.assertEqual(match_score("Getir", "Aselsan Elektronik"), 0)

    def test_empty_query_returns_zero(self):
        self.assertEqual(match_score("", "Trendyol"), 0)

    def test_empty_entry_returns_zero(self):
        self.assertEqual(match_score("Trendyol", ""), 0)

    def test_suffix_only_query_returns_zero(self):
        self.assertEqual(match_score("A.Ş.", "Arçelik A.Ş."), 0)


class MatchScoreTests(unittest.TestCase):
    def test_partial_match_score(self):
        self.assertGreater(match_score("Peak", "Peak Games A.Ş."), 80)
        self.assertEqual(match_score("Peak Games", "Peak"), 75)

    def test_overlap_match_score(self):
        self.assertGreater(match_score("Koç Sistem", "Koç Bilgi Sistem A.Ş."), 30)

    def test_no_match_score(self):
        self.assertEqual(match_score("Google", "Microsoft"), 0)


# ---------------------------------------------------------------------------
# search_company
# ---------------------------------------------------------------------------

def _make_data(*entries):
    return {"companies": list(entries)}


def _entry(company, city=""):
    return {"company": company, "city": city}


class TestSearchCompanyBasicMatch(unittest.TestCase):
    def test_exact_name_returns_match(self):
        data = _make_data(_entry("Insider", "İstanbul"))
        results = search_company(data, "INSIDER")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["company"], "Insider")

    def test_no_match_returns_empty_list(self):
        data = _make_data(_entry("Aselsan", "Ankara"))
        self.assertEqual(search_company(data, "Getir"), [])

    def test_multiple_candidates_all_returned(self):
        data = _make_data(
            _entry("Koç Holding A.Ş.", "İstanbul"),
            _entry("Koç Sistem", "İstanbul"),
            _entry("Aselsan", "Ankara"),
        )
        companies = [r["company"] for r in search_company(data, "Koç")]
        self.assertIn("Koç Holding A.Ş.", companies)
        self.assertIn("Koç Sistem", companies)
        self.assertNotIn("Aselsan", companies)

    def test_low_score_matches_excluded(self):
        data = _make_data(_entry("Trendyol", "İstanbul"))
        self.assertEqual(search_company(data, "xyz"), [])

    def test_results_sorted_by_relevance_descending(self):
        data = _make_data(
            _entry("Peak Games International", "İstanbul"),
            _entry("Peak Games", "İstanbul"),
        )
        results = search_company(data, "Peak Games")
        self.assertEqual(results[0]["company"], "Peak Games")


class TestSearchCompanyCityFilter(unittest.TestCase):
    def test_none_city_in_entry_is_excluded_when_filtering(self):
        data = {"companies": [{"company": "Acme", "city": None}]}
        self.assertEqual(search_company(data, "Acme", city="İzmir"), [])

    def test_missing_city_key_is_excluded_when_filtering(self):
        data = {"companies": [{"company": "Acme"}]}
        self.assertEqual(search_company(data, "Acme", city="İzmir"), [])

    def test_missing_city_is_fine_without_filter(self):
        data = {"companies": [{"company": "Acme", "city": None}, {"company": "Acme Yazılım"}]}
        self.assertEqual(len(search_company(data, "Acme")), 2)

    def test_matching_city_is_included(self):
        data = _make_data(_entry("Trendyol", "İstanbul"), _entry("Trendyol", "Ankara"))
        results = search_company(data, "Trendyol", city="Ankara")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["city"], "Ankara")

    def test_non_matching_city_is_excluded(self):
        data = _make_data(_entry("Trendyol", "İstanbul"))
        self.assertEqual(search_company(data, "Trendyol", city="İzmir"), [])

    def test_no_city_filter_returns_all_cities(self):
        data = _make_data(_entry("Trendyol", "İstanbul"), _entry("Trendyol", "Ankara"))
        self.assertEqual(len(search_company(data, "Trendyol")), 2)

    def test_city_filter_turkish_casing(self):
        data = _make_data(_entry("Trendyol", "İstanbul"))
        for city in ("İSTANBUL", "istanbul", "İstanbul"):
            with self.subTest(city=city):
                self.assertEqual(len(search_company(data, "Trendyol", city=city)), 1)

    def test_ascii_city_matches_turkish_city(self):
        data = _make_data(_entry("Arçelik", "Eskişehir"), _entry("Aselsan", "Gölbaşı"))
        self.assertEqual(len(search_company(data, "Arçelik", city="Eskisehir")), 1)
        self.assertEqual(len(search_company(data, "Aselsan", city="GOLBASI")), 1)

    def test_dotless_i_city_matches(self):
        data = _make_data(_entry("Örnek Gıda", "Iğdır"))
        self.assertEqual(len(search_company(data, "Örnek Gıda", city="IĞDIR")), 1)
        self.assertEqual(len(search_company(data, "Örnek Gıda", city="igdir")), 1)

    def test_district_inside_city_field_matches(self):
        data = _make_data(_entry("Getir", "İstanbul / Beşiktaş"))
        self.assertEqual(len(search_company(data, "Getir", city="Besiktas")), 1)


if __name__ == "__main__":
    unittest.main()
