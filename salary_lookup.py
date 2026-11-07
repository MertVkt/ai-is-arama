#!/usr/bin/env python3
"""
Salary Benchmark Lookup Tool

Looks up company salary data from a user-provided dataset.
Supports any salary data source: salary surveys you have access to,
figures copied by hand from salary pages, offers you have received,
your own notes, etc.

This tool requires a data file (salary_data.json) that you create
from your own salary data. See tools/README_SALARY_TOOL.md for
instructions on the expected format and how to convert from Excel.

Company names are matched with Turkish-aware rules: correct Turkish
casing (I/ı, İ/i), an anglicized pass (ş->s, ğ->g, ç->c, ö->o, ü->u, ı->i)
and removal of Turkish legal suffixes such as "A.Ş." or "Ltd. Şti.".

Usage:
    python salary_lookup.py "Şirket Adı"
    python salary_lookup.py "Şirket Adı" --city "İstanbul"
    python salary_lookup.py "Şirket Adı" --json
    python salary_lookup.py --list-all
"""

import json
import sys
import re
import argparse
import unicodedata
from pathlib import Path

DATA_FILE = Path(__file__).parent / "salary_data.json"

# Turkish -> ASCII transliteration for the anglicized matching pass, so that
# "Is Bankasi" typed on an English keyboard still finds "İş Bankası".
TRANSLITERATION = str.maketrans({
    "ı": "i", "İ": "I",
    "ş": "s", "Ş": "S",
    "ğ": "g", "Ğ": "G",
    "ç": "c", "Ç": "C",
    "ö": "o", "Ö": "O",
    "ü": "u", "Ü": "U",
    "â": "a", "Â": "A",
    "î": "i", "Î": "I",
    "û": "u", "Û": "U",
})

# Letters kept by the matching key (after fold_case). Dotless ı and the
# circumflex vowels are already folded away at that point.
WORD_CHARS = "a-z0-9çğöşü"

# Legal forms and noise words stripped when matching company names. They are
# applied to fold_case() output, so they are written in lowercase with plain
# "i". Longer phrases come first so "ltd. şti." is removed before "şti.".
_NOISE = [
    r"anonim şirketi", r"limited şirketi", r"türkiye şubesi",
    r"sanayi ve ticaret", r"san\.?\s*ve\s*tic\.?",
    r"ltd\.?\s*şti\.?", r"a\.\s*ş\.?", r"a\.\s*s\.", r"aş",
    r"ltd\.?", r"şti\.?", r"tic\.?",
    r"holding", r"grup", r"group",
    r"türkiye", r"turkiye", r"turkey",
]
STRIP_PATTERNS = (
    [r"\(.*?\)"]  # parentheticals, e.g. "(İstanbul)"
    + [rf"(?<!\w){p}(?!\w)" for p in _NOISE]
    + [r",\s*.*$"]  # everything after a comma (sub-entities)
)


def load_data():
    if not DATA_FILE.exists():
        print("Error: salary_data.json not found.", file=sys.stderr)
        print("", file=sys.stderr)
        print("This tool requires a salary data file.", file=sys.stderr)
        print("See tools/README_SALARY_TOOL.md for setup instructions.", file=sys.stderr)
        print("", file=sys.stderr)
        print("If you don't have salary data, the salary lookup", file=sys.stderr)
        print("step will be skipped during /apply.", file=sys.stderr)
        sys.exit(1)
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def turkish_lower(s):
    """Lowercase with Turkish rules: "İ" -> "i" and "I" -> "ı".

    Python's str.lower() turns "İ" into "i" plus a combining dot (U+0307),
    which breaks comparisons, so the two dotted/dotless capitals are mapped
    explicitly before lowering.
    """
    s = unicodedata.normalize("NFC", s)
    s = s.replace("İ", "i").replace("I", "ı")
    return s.lower().replace("\u0307", "")


def fold_case(s):
    """Build a case-insensitive matching form of a name.

    Uses Turkish lowercasing, then treats dotted and dotless i as the same
    letter: in real data "INSIDER", "Insider" and "İnsider" or "BANKASI" and
    "Bankası" all occur, and the dot is not reliable. Circumflex vowels are
    folded too (â->a, î->i, û->u). Other Turkish letters are kept.
    """
    s = turkish_lower(s)
    return s.replace("ı", "i").replace("â", "a").replace("î", "i").replace("û", "u")


def _strip_noise(s):
    s = fold_case(s).strip()
    for pat in STRIP_PATTERNS:
        s = re.sub(pat, " ", s)
    return s


def normalize(s):
    """Normalize string for robust fuzzy matching."""
    s = _strip_noise(s)
    return re.sub(rf"[^{WORD_CHARS}]", "", s)


def anglicize(s):
    """Transliterate Turkish letters to ASCII and lowercase."""
    return s.translate(TRANSLITERATION).lower()


def extract_core_words(s):
    """Extract meaningful words from a company name, ignoring noise."""
    words = re.findall(rf"[{WORD_CHARS}]+", _strip_noise(s))
    return [w for w in words if len(w) > 1]


def match_score_optimized(q_norm, q_ang, q_words_set, q_words_ang_set, query, entry_name):
    """Compute a match score between 0 and 100 using precalculated query values."""
    n_norm = normalize(entry_name)

    if not q_norm or not n_norm:
        return 0

    if q_norm == n_norm:
        return 100

    if q_norm in n_norm:
        ratio = len(q_norm) / len(n_norm)
        if len(q_norm) <= 4 and ratio < 0.5:
            n_words = set(extract_core_words(entry_name))
            if not q_words_set & n_words:
                pass
            else:
                return 80 + int(ratio * 10)
        else:
            return 80 + int(ratio * 10)
    if n_norm in q_norm:
        ratio = len(n_norm) / len(q_norm)
        if len(n_norm) <= 4 and ratio < 0.5:
            pass
        else:
            return 80 + int(ratio * 10)

    n_ang = anglicize(n_norm)
    if q_ang == n_ang:
        return 85
    if q_ang in n_ang or n_ang in q_ang:
        shorter = min(len(q_ang), len(n_ang))
        longer = max(len(q_ang), len(n_ang))
        if shorter <= 4 and shorter / longer < 0.5:
            n_words_ang = {anglicize(w) for w in extract_core_words(entry_name)}
            if q_words_ang_set & n_words_ang:
                return 75
        else:
            return 75

    n_words = set(extract_core_words(entry_name))
    if not q_words_set or not n_words:
        return 0

    overlap = q_words_set & n_words
    if not overlap:
        n_words_ang = {anglicize(w) for w in n_words}
        overlap = q_words_ang_set & n_words_ang

    if overlap:
        if len(q_words_set) == 1:
            q_word = list(q_words_set)[0]
            if q_word in n_words or anglicize(q_word) in {anglicize(w) for w in n_words}:
                return 70
            else:
                return 0

        coverage = len(overlap) / len(q_words_set)
        return int(30 + coverage * 40)

    return 0


def match_score(query, entry_name):
    """Compute a match score between 0 and 100 for ranking results."""
    q_norm = normalize(query)
    q_ang = anglicize(q_norm)
    q_words = extract_core_words(query)
    q_words_set = set(q_words)
    q_words_ang_set = {anglicize(w) for w in q_words}
    return match_score_optimized(q_norm, q_ang, q_words_set, q_words_ang_set, query, entry_name)


def search_company(data, query, city=None):
    """Search for a company by name. Returns matching entries sorted by relevance."""
    companies = data.get("companies", [])
    scored = []

    # Pre-calculate query representations once to avoid redundant computations inside the loop
    q_norm = normalize(query)
    q_ang = anglicize(q_norm)
    q_words = extract_core_words(query)
    q_words_set = set(q_words)
    q_words_ang_set = {anglicize(w) for w in q_words}

    for entry in companies:
        if city:
            city_key = fold_case(city)
            entry_city = fold_case(entry.get("city") or "")
            if city_key not in entry_city and anglicize(city_key) not in anglicize(entry_city):
                continue

        score = match_score_optimized(q_norm, q_ang, q_words_set, q_words_ang_set, query, entry["company"])
        if score > 0:
            scored.append((score, entry))

    scored.sort(key=lambda x: (-x[0], x[1]["company"]))

    min_score = 30
    return [entry for score, entry in scored if score >= min_score]


def format_entry(entry, metadata):
    """Format a single company entry for display."""
    lines = []
    lines.append(f"\n{'='*60}")
    lines.append(f"  {entry['company']}")
    if entry.get("city"):
        lines.append(f"  Location: {entry['city']}")
    lines.append(f"{'='*60}")

    # Get category data (everything except company/city fields)
    categories = entry.get("categories", {})
    if not categories:
        # Fallback: treat any numeric fields as categories
        skip_keys = {"company", "city", "categories"}
        for key, value in entry.items():
            if key not in skip_keys and isinstance(value, dict):
                categories[key] = value

    if categories:
        index_label = metadata.get("index_label", "Index")
        baseline = metadata.get("index_baseline", 100)

        lines.append(f"  {'Category':<22} {'Count':>6} {index_label:>8}  {'vs Baseline':>10}")
        lines.append(f"  {'-'*50}")

        for label, data in categories.items():
            display_label = label.replace("_", " ").title()
            count = data.get("count")
            index = data.get("index")
            if count is not None or index is not None:
                count_str = str(count) if count is not None else "-"
                if isinstance(index, (int, float)):
                    index_str = f"{index:.1f}"
                    if baseline == 0:
                        diff_str = ""
                    else:
                        diff_pct = ((index - baseline) / baseline) * 100
                        sign = "+" if diff_pct >= 0 else ""
                        diff_str = f"{sign}{diff_pct:.1f}%"
                elif index is not None:
                    index_str = str(index)
                    diff_str = ""
                else:
                    index_str = "N/A*"
                    diff_str = ""
                lines.append(f"  {display_label:<22} {count_str:>6} {index_str:>8}  {diff_str:>10}")

        lines.append(f"\n  * N/A = No value in the data (e.g. too few people to report)")
        if metadata.get("baseline_description"):
            lines.append(f"  {metadata['baseline_description']}")
        else:
            lines.append(f"  {index_label} {baseline} = baseline")
    else:
        # Simple format: just show all non-standard fields
        skip_keys = {"company", "city", "categories"}
        for key, value in entry.items():
            if key not in skip_keys:
                display_key = key.replace("_", " ").title()
                lines.append(f"  {display_key}: {value}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Salary Benchmark Lookup")
    parser.add_argument("company", nargs="?", help='Company name to search for (e.g. "İş Bankası")')
    parser.add_argument("--city", help='Filter by city name (e.g. "İstanbul"; "Istanbul" also works)')
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--list-all", action="store_true", help="List all companies")
    args = parser.parse_args()

    data = load_data()
    metadata = data.get("metadata", {})
    companies = data.get("companies", [])

    if args.list_all:
        for entry in companies:
            city = entry.get("city", "")
            city_str = f" ({city})" if city else ""
            print(f"{entry['company']}{city_str}")
        return

    if not args.company:
        parser.print_help()
        sys.exit(1)

    results = search_company(data, args.company, args.city)

    if not results:
        print(f"No results found for '{args.company}'")
        if args.city:
            print(f"  (filtered by city: {args.city})")
        print("\nTry a shorter or different name. Company names in the dataset")
        print("may include legal suffixes like 'A.Ş.' or 'Ltd. Şti.'; these are")
        print("ignored, so search with the core name (e.g. 'İş Bankası').")
        sys.exit(1)

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print(f"\nFound {len(results)} match(es) for '{args.company}':")
        for entry in results:
            print(format_entry(entry, metadata))
        print()


if __name__ == "__main__":
    main()
