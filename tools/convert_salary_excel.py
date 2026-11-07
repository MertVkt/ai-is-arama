#!/usr/bin/env python3
"""
Convert salary data from Excel to JSON format.

This script converts an Excel file containing company salary data
into the JSON format expected by salary_lookup.py.

Prerequisites:
    pip install openpyxl

Usage:
    python tools/convert_salary_excel.py <path-to-excel-file>
    python tools/convert_salary_excel.py <path-to-excel-file> --source "Maaş notlarım 2026"
    python tools/convert_salary_excel.py <path-to-excel-file> --baseline 100 --baseline-desc "Endeks 100 = medyan maaş"
    python tools/convert_salary_excel.py <path-to-excel-file> --baseline 0 --label "Aylık brüt (TL)"

The output file (salary_data.json) will be written to the repository root.

Expected Excel format:
    - A header row with column names (Turkish or English)
    - A company column: "Firma", "Şirket", "İşveren", "Company" or "Employer" (required)
    - An optional city column: "Şehir", "İl", "İlçe", "Konum", "City" or "Location"
    - Any number of numeric data columns: either an index (e.g. 100 = median)
      or absolute monthly salaries in Turkish lira, plus optional counts
      ("Adet", "Sayı", "Çalışan Sayısı", "Kişi", "Count")

The script auto-detects the header row and column layout. For Excel files
with paired count/index columns per category, it groups them automatically.
"""

import json
import sys
import argparse
import re
from pathlib import Path

try:
    import openpyxl
except ImportError:
    openpyxl = None


# Column name patterns for auto-detection (Turkish + English). They are
# compared against fold_header() output, so they are written in lowercase
# with plain "i" (e.g. "işveren", "sayi", "ücret").
COMPANY_PATTERNS = {"firma", "şirket", "işveren", "company", "employer"}
CITY_PATTERNS = {"şehir", "il", "ilçe", "konum", "city", "location"}
COUNT_PATTERNS = {
    "adet", "adedi", "sayi", "sayisi", "kişi", "count", "number", "n", "employees",
}
INDEX_PATTERNS = {
    "maaş", "ücret", "brüt", "net", "ortalama", "medyan", "endeks",
    "index", "idx", "salary", "median", "average",
}
# Multi-word header labels matched as a whole phrase (e.g. "Çalışan Sayısı").
COMPANY_PHRASES = {"şirket adi", "firma adi", "company name"}
CITY_PHRASES = set()
COUNT_PHRASES = {"çalişan sayisi", "kişi sayisi"}
# Phrases that mean salary even though they contain a count word.
INDEX_PHRASES = {"kişi başi"}
# "Compound" tokens: pattern words allowed to match as a substring of a larger
# header token, for languages that glue words together. Turkish writes header
# labels as separate words ("Maaş Endeksi", "Çalışan Sayısı"), so the only
# entries here are stems that commonly carry a suffix: "maaşı", "ücreti",
# "endeksi", "medyanı", "ortalaması".
COMPOUND_PATTERNS = {"maaş", "ücret", "endeks", "medyan", "ortalama"}
# Currency words dropped from derived category names ("Maaş (TL)" -> no "tl").
CURRENCY_WORDS = {"tl", "try"}

TOKEN_RE = r"[a-z0-9çğıöşü]+"


def turkish_lower(text):
    """Lowercase with Turkish rules: "İ" -> "i" and "I" -> "ı".

    Python's str.lower() turns "İ" into "i" plus a combining dot (U+0307)
    and "I" into "i" instead of the Turkish "ı".
    """
    t = str(text).strip().replace("İ", "i").replace("I", "ı")
    return t.lower().replace("\u0307", "")


def fold_header(header):
    """Turkish-lowercase a header and fold dotless "ı" into "i".

    Headers mix conventions ("ŞİRKET", "Sayısı", "SAYISI"), so matching
    treats dotted and dotless i as one letter and the patterns are written
    with plain "i".
    """
    return turkish_lower(header).replace("ı", "i")


def _header_key(header):
    """Header reduced to its words, for exact label comparison."""
    return " ".join(re.findall(TOKEN_RE, fold_header(header)))


def is_label(header, patterns, phrases=frozenset()):
    """True when a header is exactly one of the given labels.

    "Şirket", "ŞİRKET", "Şirket Adı" and "Company Name" all count; a data
    column such as "Şirket Puanı" does not.
    """
    key = _header_key(header)
    return bool(key) and (key in patterns or key in phrases)


def header_matches(header, patterns):
    """Return True when a header contains a meaningful pattern match.

    Patterns match whole tokens; any pattern also listed in
    ``COMPOUND_PATTERNS`` may additionally match as a substring, to handle
    suffixed forms such as "maaşı" or "endeksi".
    """
    h = fold_header(header)
    tokens = set(re.findall(TOKEN_RE, h))

    for p in patterns:
        if p in tokens:
            return True
        if p in COMPOUND_PATTERNS and p in h:
            return True
    return False


def _is_type_word(folded, patterns):
    if folded in patterns:
        return True
    return any(c in folded for c in COMPOUND_PATTERNS & set(patterns))


def strip_type_patterns(header, patterns, phrases=frozenset()):
    """Remove count/index words from a header to derive a category name.

    The result keeps Turkish spelling ("Aylık Maaş Endeksi" -> "aylık").
    """
    words = re.findall(TOKEN_RE, turkish_lower(header))
    folded = [w.replace("ı", "i") for w in words]
    drop = set()
    for phrase in phrases:
        parts = phrase.split()
        for i in range(len(folded) - len(parts) + 1):
            if folded[i:i + len(parts)] == parts:
                drop.update(range(i, i + len(parts)))
    kept = [
        w for i, (w, f) in enumerate(zip(words, folded))
        if i not in drop and f not in CURRENCY_WORDS and not _is_type_word(f, patterns)
    ]
    return "_".join(kept)


def category_key(header):
    """Turn a header into a JSON key: Turkish-lowercased words joined by underscores."""
    return "_".join(re.findall(TOKEN_RE, turkish_lower(header)))


def _has_phrase(header, phrases):
    key = _header_key(header)
    return any(re.search(rf"(?<!\S){re.escape(p)}(?!\S)", key) for p in phrases)


def detect_column_type(header):
    """Detect whether a column header refers to count or index data."""
    if _has_phrase(header, INDEX_PHRASES):
        return "index"
    if _has_phrase(header, COUNT_PHRASES) or header_matches(header, COUNT_PATTERNS):
        return "count"
    if header_matches(header, INDEX_PATTERNS):
        return "index"
    return None


def parse_number(value):
    """Convert a cell value to float, accepting Turkish-formatted text.

    Numeric cells pass through. Text such as "45.000 TL", "₺52.500,50" or
    "1.250.000" is read with Turkish separators (dot for thousands, comma
    for decimals); "105.5" and "45,000" in English style also work.
    Returns None when the value is not a number.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = re.sub(r"(?i)\b(tl|try)\b|₺|\s", "", str(value))
    if not re.fullmatch(r"-?[\d.,]+", text) or not re.search(r"\d", text):
        return None
    if "." in text and "," in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        if re.fullmatch(r"-?\d{1,3}(,\d{3})+", text):
            text = text.replace(",", "")
        else:
            text = text.replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", text):
        text = text.replace(".", "")
    try:
        return float(text)
    except ValueError:
        return None


def parse_sheet(ws, sheet_label=None):
    """Parse a single worksheet into a list of company entries and detected categories."""
    # Find header row
    header_row = None
    for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=False), start=1):
        for cell in row:
            if cell.value and is_label(cell.value, COMPANY_PATTERNS, COMPANY_PHRASES):
                header_row = row_idx
                break
        if header_row:
            break

    if header_row is None:
        print(f"Warning: Could not find header row in sheet '{ws.title}'. Skipping.", file=sys.stderr)
        return []

    # Read headers
    headers = []
    for cell in ws[header_row]:
        headers.append(str(cell.value).strip() if cell.value else "")

    # Find company and city columns
    company_col = None
    city_col = None
    for i, h in enumerate(headers):
        if company_col is None and is_label(h, COMPANY_PATTERNS, COMPANY_PHRASES):
            company_col = i
        elif city_col is None and is_label(h, CITY_PATTERNS, CITY_PHRASES):
            city_col = i

    if company_col is None:
        print(f"Warning: Could not find company column in sheet '{ws.title}'.", file=sys.stderr)
        return []

    # Identify data columns (everything that's not company/city)
    data_cols = []
    for i, h in enumerate(headers):
        if i == company_col or i == city_col or not h:
            continue
        data_cols.append((i, h))

    # Try to detect paired count/index columns per category
    # Heuristic: if columns come in pairs and alternate count/index, group them
    categories = []
    i = 0
    while i < len(data_cols):
        col_idx, col_header = data_cols[i]
        col_type = detect_column_type(col_header)

        if i + 1 < len(data_cols):
            next_col_idx, next_col_header = data_cols[i + 1]
            next_col_type = detect_column_type(next_col_header)

            # If we have a count/index pair, group them
            if col_type == "count" and next_col_type == "index":
                # Use the header minus the count/index suffix as category name
                cat_name = strip_type_patterns(col_header, COUNT_PATTERNS, COUNT_PHRASES)
                if not cat_name:
                    cat_name = f"category_{len(categories)+1}"
                categories.append({
                    "name": cat_name,
                    "count_col": col_idx,
                    "index_col": next_col_idx,
                })
                i += 2
                continue
            elif col_type == "index" and next_col_type == "count":
                cat_name = strip_type_patterns(col_header, INDEX_PATTERNS)
                if not cat_name:
                    cat_name = f"category_{len(categories)+1}"
                categories.append({
                    "name": cat_name,
                    "index_col": col_idx,
                    "count_col": next_col_idx,
                })
                i += 2
                continue

        # Single column - treat as a standalone value
        categories.append({
            "name": category_key(col_header) or f"category_{len(categories)+1}",
            "value_col": col_idx,
        })
        i += 1

    # Parse data rows
    companies = []
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        if not row[company_col]:
            continue

        company_name = str(row[company_col]).strip()
        city_name = str(row[city_col]).strip() if city_col is not None and row[city_col] else ""

        entry = {
            "company": company_name,
            "city": city_name,
            "categories": {},
        }

        for cat in categories:
            cat_name = cat["name"]
            if "count_col" in cat and "index_col" in cat:
                count_val = None
                index_val = None
                if cat["count_col"] < len(row) and row[cat["count_col"]] is not None:
                    number = parse_number(row[cat["count_col"]])
                    if number is not None:
                        count_val = int(number)
                if cat["index_col"] < len(row) and row[cat["index_col"]] is not None:
                    index_val = parse_number(row[cat["index_col"]])
                entry["categories"][cat_name] = {"count": count_val, "index": index_val}
            elif "value_col" in cat:
                if cat["value_col"] < len(row) and row[cat["value_col"]] is not None:
                    val = row[cat["value_col"]]
                    number = parse_number(val)
                    val = number if number is not None else str(val)
                    entry["categories"][cat_name] = {"index": val}

        companies.append(entry)

    return companies


def main():
    parser = argparse.ArgumentParser(
        description="Convert salary Excel data to JSON"
    )
    parser.add_argument("excel_file", help="Path to the Excel file with salary data")
    parser.add_argument(
        "--output", default=None,
        help="Output JSON file path (default: salary_data.json in repo root)",
    )
    parser.add_argument(
        "--source", default=None,
        help="Name of the data source (e.g., 'Maaş anketi 2026')",
    )
    parser.add_argument(
        "--baseline", type=float, default=100,
        help="Baseline value for comparison (default: 100). For absolute TL "
             "salaries use a reference salary, or 0 to show values without a %% comparison",
    )
    parser.add_argument(
        "--baseline-desc", default=None,
        help="Description of what the baseline means (e.g., 'Endeks 100 = medyan maaş')",
    )
    parser.add_argument(
        "--label", default="Index",
        help="Column label shown in lookup output (e.g., 'Aylık brüt (TL)'; default: Index)",
    )
    args = parser.parse_args()

    excel_path = Path(args.excel_file)
    if not excel_path.exists():
        print(f"Error: File not found: {excel_path}", file=sys.stderr)
        sys.exit(1)

    if openpyxl is None:
        print("Error: openpyxl is required. Install it with: pip install openpyxl", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output) if args.output else Path(__file__).parent.parent / "salary_data.json"

    print(f"Reading: {excel_path}")
    wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)

    all_companies = []
    for sheet_name in wb.sheetnames:
        print(f"  Parsing sheet: {sheet_name}")
        ws = wb[sheet_name]
        companies = parse_sheet(ws, sheet_label=sheet_name)
        all_companies.extend(companies)

    wb.close()

    if not all_companies:
        print("Error: No data could be parsed from the Excel file.", file=sys.stderr)
        print("Make sure the Excel file has a header row with a 'Firma'/'Şirket'/'Company' column.", file=sys.stderr)
        sys.exit(1)

    # Build output
    output = {
        "metadata": {
            "source": args.source or excel_path.stem,
            "index_baseline": args.baseline,
            "index_label": args.label,
            "baseline_description": args.baseline_desc or f"Index {args.baseline} = baseline",
        },
        "companies": all_companies,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nDone! Wrote {len(all_companies)} company entries to {output_path}")


if __name__ == "__main__":
    main()
