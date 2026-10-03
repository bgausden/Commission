"""Convert Mindbody HTML-masquerading-as-.xls payroll export to .xlsx.

Faithfully mimics how Excel imports the Mindbody report HTML so the
commission parser (exact-string dependent) sees the same rows/cells as a
manually resaved workbook:
  - one spreadsheet row per <tr>, cells placed left-to-right honoring colspan
  - div.reportHeader / div.staffHeader / div.payscaleHeader become single-cell rows
  - top-level <br> becomes a blank row (leading blanks stripped)
  - [\r\n\t] runs become one space; runs of plain spaces collapsed to one
  - numeric-looking cells ("1,200.00", "142.00", "0") become numbers

Usage: python3 convert_mindbody.py <input.xls> <output.xlsx>
"""
import re
import sys
import html as htmlmod
from html.parser import HTMLParser


def clean_text(raw: str) -> str:
    t = htmlmod.unescape(raw)
    t = t.replace("\xa0", " ").replace("\r", " ").replace("\n", " ").replace("\t", " ")
    t = re.sub(r" {2,}", " ", t)
    return t.lstrip()


def to_number(text: str):
    t = text.strip().replace(",", "").replace(" ", "")
    if re.fullmatch(r"-?\d+(\.\d+)?", t):
        f = float(t)
        return int(f) if f.is_integer() else f
    return None


class Converter(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.rows: list[list] = []
        self._cur_row: list | None = None
        self._cur_cell: list[str] | None = None
        self._colspan = 1
        self._col = 0
        self._div_kind: str | None = None
        self._div_text: list[str] = []
        self._div_depth = 0
        self._table_depth = 0

    # -- helpers ---------------------------------------------------------
    def _emit_cell(self):
        text = clean_text("".join(self._cur_cell or []))
        if text == "":
            val = None
        else:
            num = to_number(text)
            # rstrip: Mindbody pretty-prints header cells with trailing
            # newlines; the parser matches 'Rev. per Session', 'Tips:' etc.
            # exactly, so trailing whitespace must go.
            val = num if num is not None else text.rstrip()
        while len(self._cur_row) <= self._col:
            self._cur_row.append(None)
        self._cur_row[self._col] = val
        self._col += self._colspan

    # -- HTMLParser ------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            self._table_depth += 1
        elif tag == "tr" and self._table_depth == 1:
            self._cur_row = []
            self._col = 0
        elif tag in ("td", "th") and self._cur_row is not None:
            self._cur_cell = []
            try:
                self._colspan = max(1, int(a.get("colspan", "1")))
            except ValueError:
                self._colspan = 1
        elif tag == "div" and self._table_depth == 0:
            cls = a.get("class", "")
            if cls in ("reportHeader", "staffHeader", "payscaleHeader"):
                self._div_kind = cls
                self._div_text = []
                self._div_depth = 1
            elif self._div_kind:
                self._div_depth += 1
        elif tag == "br" and self._table_depth == 0 and not self._div_kind:
            self.rows.append([])
        elif tag == "br" and self._cur_cell is not None:
            self._cur_cell.append(" ")

    def handle_endtag(self, tag):
        if tag == "table":
            self._table_depth = max(0, self._table_depth - 1)
        elif tag == "tr" and self._cur_row is not None and self._table_depth == 1:
            self.rows.append(self._cur_row)
            self._cur_row = None
        elif tag in ("td", "th") and self._cur_cell is not None:
            self._emit_cell()
            self._cur_cell = None
        elif tag == "div" and self._div_kind:
            self._div_depth -= 1
            if self._div_depth == 0:
                text = clean_text("".join(self._div_text))
                self.rows.append([text if text != "" else None])
                self._div_kind = None

    def handle_data(self, data):
        if self._cur_cell is not None:
            self._cur_cell.append(data)
        elif self._div_kind:
            self._div_text.append(data)

    def handle_entityref(self, name):
        self.handle_data(f"&{name};")

    def handle_charref(self, name):
        self.handle_data(f"&#{name};")


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8", errors="replace") as f:
        doc = f.read()
    # Drop script blocks (page furniture, not report content)
    doc = re.sub(r"<script.*?</script>", "", doc, flags=re.S | re.I)
    c = Converter()
    c.feed(doc)
    rows = c.rows
    while rows and (not rows[0] or all(v is None for v in rows[0])):
        rows.pop(0)
    width = max((len(r) for r in rows), default=0)
    for r in rows:
        while len(r) < width:
            r.append(None)

    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    base = re.sub(r"\.xls$", "", dst.split("/")[-1], flags=re.I)
    ws.title = base[:31]
    for r in rows:
        ws.append(r)
    wb.save(dst)
    print(f"rows={len(rows)} width={width} sheet={ws.title!r} -> {dst}")


main()
