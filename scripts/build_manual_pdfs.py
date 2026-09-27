"""Gera os manuais PDF distribuídos com o aplicativo a partir dos Markdown."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
FONT_DIR = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("ArialManual", str(FONT_DIR / "arial.ttf")))
pdfmetrics.registerFont(TTFont("ArialManualBold", str(FONT_DIR / "arialbd.ttf")))
pdfmetrics.registerFontFamily("ArialManual", normal="ArialManual", bold="ArialManualBold")

NAVY = colors.HexColor("#172832")
GREEN = colors.HexColor("#16624b")
MUTED = colors.HexColor("#52646c")
LINE = colors.HexColor("#d8e2e2")

STYLES = {
    "title": ParagraphStyle("title", fontName="ArialManualBold", fontSize=21, leading=26, textColor=NAVY, spaceAfter=11),
    "h2": ParagraphStyle("h2", fontName="ArialManualBold", fontSize=13.5, leading=18, textColor=GREEN, spaceBefore=18, spaceAfter=7, keepWithNext=True),
    "h3": ParagraphStyle("h3", fontName="ArialManualBold", fontSize=10.5, leading=15, textColor=NAVY, spaceBefore=12, spaceAfter=5, keepWithNext=True),
    "body": ParagraphStyle("body", fontName="ArialManual", fontSize=9.3, leading=14.4, textColor=NAVY, spaceAfter=8),
    "small": ParagraphStyle("small", fontName="ArialManual", fontSize=8, leading=11.7, textColor=NAVY, spaceAfter=4),
    "list": ParagraphStyle("list", fontName="ArialManual", fontSize=9.2, leading=14.2, textColor=NAVY, leftIndent=16, firstLineIndent=-12, spaceAfter=5),
}


def inline(text: str) -> str:
    """Converte apenas os elementos inline usados nos manuais."""
    token = re.compile(r"\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|`([^`]+)`")
    pieces = []
    last = 0
    for match in token.finditer(text):
        pieces.append(html.escape(text[last:match.start()]))
        label, url, bold, code = match.groups()
        if url and url.startswith(("https://", "http://")):
            pieces.append(f'<link href="{html.escape(url, quote=True)}" color="#16624b">{html.escape(label)}</link>')
        elif url:
            pieces.append(f"<b>{html.escape(label)}</b>")
        elif bold:
            pieces.append(f"<b>{html.escape(bold)}</b>")
        else:
            pieces.append(f'<font color="#174f72">{html.escape(code)}</font>')
        last = match.end()
    pieces.append(html.escape(text[last:]))
    return "".join(pieces)


def table_block(lines: list[str], width: float) -> Table:
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", cell) for cell in cells):
            continue
        style = STYLES["small"]
        rows.append([Paragraph(inline(cell), style) for cell in cells])
    columns = max(len(row) for row in rows)
    for row in rows:
        row.extend([Paragraph("", STYLES["small"])] * (columns - len(row)))
    table = Table(rows, colWidths=[width / columns] * columns, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8f2ed")),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def blocks(markdown: str, width: float) -> list:
    lines = markdown.splitlines()
    story = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("|"):
            group = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                group.append(lines[i]); i += 1
            story.extend([table_block(group, width), Spacer(1, 8)])
            continue
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            style = "title" if level == 1 else "h2" if level == 2 else "h3"
            story.append(Paragraph(inline(line[level:].strip()), STYLES[style]))
            if level == 1:
                story.append(HRFlowable(width=width, thickness=1, color=LINE, spaceAfter=10))
            i += 1
            continue
        if re.match(r"^(?:\d+\.|-)\s", line):
            marker, content = line.split(" ", 1)
            label = "&#8226;" if marker == "-" else html.escape(marker)
            story.append(Paragraph(f"{label}  {inline(content)}", STYLES["list"]))
            i += 1
            continue
        paragraph = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(?:#|\||\d+\.\s|-\s)", lines[i].strip()):
            paragraph.append(lines[i].strip()); i += 1
        story.append(Paragraph(inline(" ".join(paragraph)), STYLES["body"]))
    return story


def page_frame(canvas, doc, language: str):
    canvas.saveState()
    w, h = A4
    canvas.setStrokeColor(LINE)
    canvas.line(42, h - 41, w - 42, h - 41)
    canvas.setFont("ArialManualBold", 8)
    canvas.setFillColor(GREEN)
    canvas.drawString(42, h - 34, "LLAMA DESKTOP LAUNCHER")
    canvas.setFont("ArialManual", 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(w - 42, h - 34, "Manual de uso" if language == "pt-BR" else "User manual")
    canvas.line(42, 39, w - 42, 39)
    canvas.drawString(42, 27, "Português (Brasil)" if language == "pt-BR" else "English")
    canvas.drawRightString(w - 42, 27, str(doc.page))
    canvas.restoreState()


def build(language: str):
    source = DOCS / f"MANUAL-{language}.md"
    target = DOCS / f"MANUAL-{language}.pdf"
    width = A4[0] - 84
    doc = SimpleDocTemplate(str(target), pagesize=A4, rightMargin=42, leftMargin=42, topMargin=60, bottomMargin=54,
                            title=f"Llama Desktop Launcher - {language}", author="Llama Desktop Launcher")
    markdown = source.read_text(encoding="utf-8").replace("—", "-").replace("–", "-").replace("‑", "-")
    doc.build(blocks(markdown, width),
              onFirstPage=lambda canvas, document: page_frame(canvas, document, language),
              onLaterPages=lambda canvas, document: page_frame(canvas, document, language))
    print(target)


if __name__ == "__main__":
    for locale in ("pt-BR", "en"):
        build(locale)
