# Builds docs/navod/Bobo-navod.pdf: link, install guide and notification guide for Bobo.
# Run (reportlab 4.2.x, Python 3.9+):  python make-pdf.py
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle,
                                KeepTogether, Image, Flowable)
from reportlab.graphics.shapes import Drawing, Rect, Circle, String, Line, Polygon, Ellipse, Path
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics import renderPDF

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(HERE, '..', '..', 'frontend', 'public')
OUT = os.path.join(HERE, 'Bobo-navod.pdf')
URL = 'https://bobo.bobo-worker.workers.dev'

FD = '/System/Library/Fonts/Supplemental/'
pdfmetrics.registerFont(TTFont('Arial', FD + 'Arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', FD + 'Arial Bold.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Italic', FD + 'Arial Italic.ttf'))
pdfmetrics.registerFontFamily('Arial', normal='Arial', bold='Arial-Bold', italic='Arial-Italic', boldItalic='Arial-Bold')

INK = colors.HexColor('#2b1f3f')
PURPLE = colors.HexColor('#6b3fd4')
SOFT = colors.HexColor('#ece4fb')
CREAM = colors.HexColor('#fff7e8')
YELLOW = colors.HexColor('#ffd84f')
YELLOW_SOFT = colors.HexColor('#fff1b8')
GREEN = colors.HexColor('#3ccb9c')
GREEN_SOFT = colors.HexColor('#d9f7ec')
CORAL = colors.HexColor('#ff7d66')
CORAL_SOFT = colors.HexColor('#ffe3dd')
GREY = colors.HexColor('#5d5073')
LINE = colors.HexColor('#e6d3a3')
WHITE = colors.white

PW, PH = A4
M = 46
CW = PW - 2 * M  # content width

# ---------- text styles (large on purpose) ----------
body = ParagraphStyle('body', fontName='Arial', fontSize=13, leading=18, textColor=INK, spaceAfter=6)
small = ParagraphStyle('small', parent=body, fontSize=12, leading=17, textColor=GREY)
h1 = ParagraphStyle('h1', fontName='Arial-Bold', fontSize=32, leading=38, textColor=INK, spaceAfter=6)
h2 = ParagraphStyle('h2', fontName='Arial-Bold', fontSize=18, leading=22, textColor=PURPLE, spaceBefore=8, spaceAfter=5)
h3 = ParagraphStyle('h3', fontName='Arial-Bold', fontSize=16, leading=21, textColor=INK, spaceBefore=8, spaceAfter=4)
kicker = ParagraphStyle('kicker', fontName='Arial-Bold', fontSize=13, leading=16, textColor=PURPLE)
step_title = ParagraphStyle('step_title', fontName='Arial-Bold', fontSize=14.5, leading=19, textColor=INK)
step_text = ParagraphStyle('step_text', fontName='Arial', fontSize=12.6, leading=17, textColor=INK, spaceBefore=2)
center = ParagraphStyle('center', parent=body, alignment=TA_CENTER)
biglink = ParagraphStyle('biglink', fontName='Arial-Bold', fontSize=21, leading=27, textColor=PURPLE, alignment=TA_CENTER)
toc = ParagraphStyle('toc', parent=body, fontSize=15.5, leading=26)


def P(text, style=body):
    return Paragraph(text, style)


def link(url=URL, text=None):
    return f'<a href="{url}" color="#6b3fd4"><u>{text or url}</u></a>'


# ---------- building blocks ----------
class Badge(Flowable):
    """Numbered purple circle used in front of every step."""

    def __init__(self, n, size=34):
        super().__init__()
        self.n, self.size = n, size
        self.width = self.height = size

    def draw(self):
        c = self.canv
        r = self.size / 2
        c.setFillColor(PURPLE)
        c.setStrokeColor(INK)
        c.setLineWidth(2.2)
        c.circle(r, r, r - 1.5, fill=1, stroke=1)
        c.setFillColor(WHITE)
        c.setFont('Arial-Bold', 19)
        c.drawCentredString(r, r - 6.6, str(self.n))


def step(n, title, text=None, extra=None):
    inner = [P(title, step_title)]
    if text:
        inner.append(P(text, step_text))
    if extra:
        inner += extra
    t = Table([[Badge(n), inner]], colWidths=[46, CW - 46])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                           ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)]))
    return KeepTogether([t])


def box(kind, title, text):
    bg, bd, tc = {'tip': (YELLOW_SOFT, colors.HexColor('#d9b200'), INK), 'warn': (CORAL_SOFT, CORAL, INK),
                  'info': (SOFT, PURPLE, INK), 'ok': (GREEN_SOFT, GREEN, INK)}[kind]
    inner = [P(f'<b>{title}</b>', ParagraphStyle('bt', parent=body, fontSize=13.5, leading=17, spaceAfter=2, textColor=tc)),
             P(text, ParagraphStyle('bb', parent=body, fontSize=12.3, leading=16.5, spaceAfter=0, textColor=tc))]
    t = Table([[inner]], colWidths=[CW])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('BOX', (0, 0), (-1, -1), 2, bd), ('ROUNDEDCORNERS', [12, 12, 12, 12]),
                           ('LEFTPADDING', (0, 0), (-1, -1), 14), ('RIGHTPADDING', (0, 0), (-1, -1), 14), ('TOPPADDING', (0, 0), (-1, -1), 8),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
    return KeepTogether([t, Spacer(1, 7)])


def section_title(kick, title):
    t = Table([[[P(kick.upper(), kicker), P(title, ParagraphStyle('st', parent=h1, fontSize=28, leading=33, spaceAfter=0))]]], colWidths=[CW])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), YELLOW), ('BOX', (0, 0), (-1, -1), 2.5, INK), ('ROUNDEDCORNERS', [16, 16, 16, 16]),
                           ('LEFTPADDING', (0, 0), (-1, -1), 18), ('RIGHTPADDING', (0, 0), (-1, -1), 18), ('TOPPADDING', (0, 0), (-1, -1), 12),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 14)]))
    return [t, Spacer(1, 10)]


# ---------- drawings ----------
def rr(d, x, y, w, h, r=8, fill=WHITE, stroke=INK, sw=1.5):
    d.add(Rect(x, y, w, h, rx=r, ry=r, fillColor=fill, strokeColor=stroke, strokeWidth=sw))


def text(d, x, y, s, size=9, bold=False, fill=INK, anchor='start'):
    d.add(String(x, y, s, fontName='Arial-Bold' if bold else 'Arial', fontSize=size, fillColor=fill, textAnchor=anchor))


def num(d, x, y, n, r=11):
    d.add(Circle(x, y, r, fillColor=PURPLE, strokeColor=INK, strokeWidth=1.8))
    text(d, x, y - 4.6, str(n), 13, True, WHITE, 'middle')


def ring(d, x, y, w, h, r=10):
    d.add(Rect(x, y, w, h, rx=r, ry=r, fillColor=None, strokeColor=PURPLE, strokeWidth=2.6, strokeDashArray=[6, 4]))


def phone(d, x, y, w, h, screen=CREAM):
    rr(d, x, y, w, h, 20, INK, INK, 1)
    rr(d, x + 5, y + 5, w - 10, h - 10, 16, screen, screen, 0)
    rr(d, x + w / 2 - 17, y + h - 13, 34, 5, 2.5, INK, INK, 0)  # notch


def mini_hero(d, x, y, w):
    """A tiny version of the yellow 'Dnes se vaří' card."""
    rr(d, x, y, w, 62, 10, YELLOW, INK, 1.6)
    text(d, x + 8, y + 40, 'Dnes se vaří', 11, True)
    text(d, x + 8, y + 24, 'úterý 4. 11.', 8, False, GREY)
    d.add(Ellipse(x + w - 24, y + 22, 13, 9, fillColor=colors.HexColor('#ff7d66'), strokeColor=INK, strokeWidth=1.2))
    d.add(Circle(x + w - 24, y + 36, 9, fillColor=colors.HexColor('#e9c9a6'), strokeColor=INK, strokeWidth=1.2))


def icon_share(d, cx, cy, s=7, color=INK):
    d.add(Line(cx, cy - s * 0.2, cx, cy + s * 1.1, strokeColor=color, strokeWidth=1.6))
    d.add(Polygon([cx - s * 0.5, cy + s * 0.65, cx, cy + s * 1.25, cx + s * 0.5, cy + s * 0.65], fillColor=None, strokeColor=color, strokeWidth=1.6))
    d.add(Rect(cx - s * 0.75, cy - s * 0.9, s * 1.5, s * 1.2, rx=2, ry=2, fillColor=None, strokeColor=color, strokeWidth=1.6))


def caption_row(d, items, w, y=8):
    for cx, n, label in items:
        num(d, cx - 52, y + 14, n, 9)
        text(d, cx - 38, y + 10.5, label, 9.5, True)


def iphone_diagram():
    W, H = CW, 330
    d = Drawing(W, H)
    pw, ph, gap = 140, 275, (CW - 3 * 140) / 2
    xs = [i * (pw + gap) for i in range(3)]
    ty = 44
    # 1: Safari with the app and the Share button
    x = xs[0]
    phone(d, x, ty, pw, ph)
    text(d, x + 70, ty + ph - 24, 'bobo', 13, True, INK, 'middle')
    mini_hero(d, x + 14, ty + ph - 108, pw - 28)
    rr(d, x + 12, ty + 12, pw - 24, 46, 14, WHITE, LINE, 1.2)
    for i, lab in enumerate(['<', '>', None, 'o', '2']):
        cx = x + 28 + i * 21
        if lab is None:
            icon_share(d, cx, ty + 30, 6.5)
        else:
            text(d, cx, ty + 26, lab if lab not in 'o2' else {'o': 'II', '2': '[]'}[lab], 10, True, GREY, 'middle')
    ring(d, x + 28 + 2 * 21 - 14, ty + 14, 28, 34, 9)
    num(d, x + 28 + 2 * 21, ty + 68, 1)
    # 2: share sheet with 'Přidat na plochu'
    x = xs[1]
    phone(d, x, ty, pw, ph)
    rr(d, x + 10, ty + 10, pw - 20, 170, 14, WHITE, LINE, 1.2)
    text(d, x + 20, ty + 160, 'Bobo', 11, True)
    text(d, x + 20, ty + 147, 'bobo-worker.workers.dev', 6.8, False, GREY)
    rows = ['Kopírovat', 'Přidat do záložek', 'Přidat na plochu', 'Tisk']
    for i, r in enumerate(rows):
        yy = ty + 118 - i * 26
        hot = r == 'Přidat na plochu'
        rr(d, x + 16, yy - 6, pw - 32, 22, 6, SOFT if hot else CREAM, PURPLE if hot else LINE, 1.6 if hot else 0.8)
        text(d, x + 24, yy, r, 9.5, hot)
    ring(d, x + 12, ty + 118 - 2 * 26 - 9, pw - 24, 28, 8)
    num(d, x + pw - 14, ty + 118 - 2 * 26 + 5, 2, 9)
    # 3: home screen
    x = xs[2]
    phone(d, x, ty, pw, ph)
    for r in range(4):
        for c in range(3):
            if (r, c) == (0, 1):
                continue
            rr(d, x + 18 + c * 40, ty + ph - 52 - r * 52, 32, 32, 8, colors.HexColor('#dcd6e8'), colors.HexColor('#dcd6e8'), 0)
    ix, iy = x + 18 + 40, ty + ph - 52
    rr(d, ix, iy, 32, 32, 8, YELLOW, INK, 1.6)
    d.add(Circle(ix + 16, iy + 20, 7, fillColor=colors.HexColor('#fff4dc'), strokeColor=INK, strokeWidth=1))
    d.add(Rect(ix + 5, iy + 6, 22, 9, rx=4, ry=4, fillColor=CORAL, strokeColor=INK, strokeWidth=1))
    text(d, ix + 16, iy - 11, 'Bobo', 8.5, True, INK, 'middle')
    ring(d, ix - 5, iy - 18, 42, 56, 10)
    num(d, ix + 16, iy + 52, 3, 9)
    caption_row(d, [(xs[0] + pw / 2 + 36, 1, 'Sdílet'), (xs[1] + pw / 2 + 38, 2, 'Přidat na plochu'), (xs[2] + pw / 2 + 38, 3, 'Otevři z plochy')], W, 12)
    return d


def android_diagram():
    W, H = CW, 330
    d = Drawing(W, H)
    pw, ph, gap = 140, 275, (CW - 3 * 140) / 2
    xs = [i * (pw + gap) for i in range(3)]
    ty = 44
    x = xs[0]  # Chrome with the three-dots menu
    phone(d, x, ty, pw, ph)
    rr(d, x + 10, ty + ph - 36, pw - 20, 24, 12, WHITE, LINE, 1.2)
    text(d, x + 18, ty + ph - 28, 'bobo-worker.workers.dev', 7, False, GREY)
    for k in range(3):
        d.add(Circle(x + pw - 18, ty + ph - 18 + (k - 1) * 4.2 + 0, 1.5, fillColor=INK, strokeColor=INK, strokeWidth=0))
    ring(d, x + pw - 30, ty + ph - 40, 22, 32, 8)
    num(d, x + pw - 19, ty + ph - 58, 1, 9)
    mini_hero(d, x + 14, ty + ph - 124, pw - 28)
    x = xs[1]  # menu
    phone(d, x, ty, pw, ph)
    rr(d, x + 12, ty + 96, pw - 24, 150, 10, WHITE, LINE, 1.2)
    items = ['Nová karta', 'Historie', 'Instalovat aplikaci', 'Sdílet…', 'Nastavení']
    for i, it in enumerate(items):
        yy = ty + 224 - i * 27
        hot = it == 'Instalovat aplikaci'
        rr(d, x + 17, yy - 7, pw - 34, 22, 6, SOFT if hot else WHITE, PURPLE if hot else WHITE, 1.6 if hot else 0)
        text(d, x + 24, yy, it, 9, hot)
    ring(d, x + 14, ty + 224 - 2 * 27 - 10, pw - 28, 28, 8)
    num(d, x + pw - 14, ty + 224 - 2 * 27 + 4, 2, 9)
    x = xs[2]  # dialog
    phone(d, x, ty, pw, ph)
    rr(d, x + 12, ty + 100, pw - 24, 110, 12, WHITE, INK, 1.6)
    text(d, x + 22, ty + 190, 'Nainstalovat aplikaci?', 9.5, True)
    rr(d, x + 22, ty + 160, 22, 22, 6, YELLOW, INK, 1.2)
    text(d, x + 50, ty + 168, 'Bobo', 10, True)
    text(d, x + 22, ty + 128, 'Zrušit', 9, False, GREY)
    rr(d, x + pw - 76, ty + 118, 56, 24, 12, PURPLE, INK, 1.5)
    text(d, x + pw - 48, ty + 126, 'Instalovat', 8.5, True, WHITE, 'middle')
    ring(d, x + pw - 82, ty + 112, 68, 36, 12)
    num(d, x + pw - 48, ty + 160 - 8, 3, 9)
    caption_row(d, [(xs[0] + pw / 2 + 30, 1, 'Menu'), (xs[1] + pw / 2 + 36, 2, 'Instalovat aplikaci'), (xs[2] + pw / 2 + 28, 3, 'Instalovat')], W, 12)
    return d


def desktop_diagram():
    W, H = CW, 190
    d = Drawing(W, H)
    rr(d, 0, 10, W, 170, 14, WHITE, INK, 2)
    rr(d, 0, 142, W, 38, 14, colors.HexColor('#ece8f5'), INK, 2)
    d.add(Rect(2, 142, W - 4, 14, fillColor=colors.HexColor('#ece8f5'), strokeColor=colors.HexColor('#ece8f5'), strokeWidth=0))
    for i, c in enumerate([CORAL, YELLOW, GREEN]):
        d.add(Circle(18 + i * 16, 162, 5, fillColor=c, strokeColor=INK, strokeWidth=1))
    rr(d, 80, 150, W - 190, 24, 12, WHITE, LINE, 1.2)
    text(d, 94, 158, 'bobo-worker.workers.dev', 10.5, False, GREY)
    # install icon (monitor with arrow) at the right end of the address bar
    ix = W - 128
    rr(d, ix, 152, 20, 20, 5, SOFT, PURPLE, 1.6)
    d.add(Rect(ix + 4, ix * 0 + 157, 12, 8, fillColor=None, strokeColor=INK, strokeWidth=1.3))
    ring(d, ix - 6, 148, 32, 28, 9)
    num(d, ix + 10, 126, 1, 10)
    # popup
    rr(d, W - 250, 36, 240, 86, 12, WHITE, INK, 1.8)
    text(d, W - 238, 100, 'Nainstalovat aplikaci?', 11.5, True)
    rr(d, W - 238, 70, 22, 22, 6, YELLOW, INK, 1.2)
    text(d, W - 208, 78, 'Bobo', 11, True)
    text(d, W - 238, 46, 'Zrušit', 10, False, GREY)
    rr(d, W - 112, 44, 92, 24, 12, PURPLE, INK, 1.6)
    text(d, W - 66, 52, 'Nainstalovat', 10, True, WHITE, 'middle')
    ring(d, W - 118, 40, 104, 32, 12)
    num(d, W - 66, 26, 2, 10)
    return d


def notification_cards():
    W, H = CW, 150
    d = Drawing(W, H)
    # lunch reminder
    rr(d, 0, 10, W / 2 - 8, 128, 16, WHITE, INK, 2)
    rr(d, 12, 104, 26, 26, 7, YELLOW, INK, 1.4)
    text(d, 48, 118, 'BOBO · 15:00', 8.5, True, GREY)
    text(d, 12, 90, 'Oběd v úterý 4. 11.?', 12.5, True)
    text(d, 12, 74, 'Zítra se vaří – budeš obědvat?', 9.5)
    text(d, 12, 61, 'Odpověz do 16:00.', 9.5)
    rr(d, 12, 20, 76, 26, 13, GREEN_SOFT, GREEN, 1.6)
    text(d, 50, 28, 'Ano', 11, True, INK, 'middle')
    rr(d, 96, 20, 76, 26, 13, CORAL_SOFT, CORAL, 1.6)
    text(d, 134, 28, 'Ne', 11, True, INK, 'middle')
    # voting reminder
    x0 = W / 2 + 8
    rr(d, x0, 10, W / 2 - 8, 128, 16, WHITE, INK, 2)
    rr(d, x0 + 12, 104, 26, 26, 7, YELLOW, INK, 1.4)
    text(d, x0 + 48, 118, 'BOBO · pondělí', 8.5, True, GREY)
    text(d, x0 + 12, 90, 'Hlasuj!', 12.5, True)
    text(d, x0 + 12, 74, 'Vyber, co budeme jíst týden od', 9.5)
    text(d, x0 + 12, 61, '9. 11. Máš 4 hlasy.', 9.5)
    text(d, x0 + 12, 30, 'Klepnutím se otevře Hlasuj!', 9, False, PURPLE)
    return d


def switch_diagram():
    W, H = CW, 120
    d = Drawing(W, H)
    for i, (label, pos, fill) in enumerate([('Ano', 0, GREEN_SOFT), ('Ne', 1, CORAL_SOFT), ('Zatím nevybráno', 0.5, YELLOW_SOFT)]):
        x = 6 + i * (CW / 3)
        rr(d, x, 40, 140, 38, 19, fill, INK, 2)
        cx = x + 28 + pos * (140 - 56)
        d.add(Ellipse(cx, 62, 22, 14, fillColor=colors.HexColor('#e8913a'), strokeColor=INK, strokeWidth=1.8))
        d.add(Line(cx + 12, 70, cx + 24, 82, strokeColor=INK, strokeWidth=3))
        d.add(Circle(cx + 26, 84, 3.5, fillColor=colors.HexColor('#fff4dc'), strokeColor=INK, strokeWidth=1.2))
        text(d, x + 70, 18, label, 13, True, INK, 'middle')
        text(d, x + 70, 3, 'kuře ' + ('vlevo' if pos == 0 else 'vpravo' if pos == 1 else 'uprostřed'), 9.5, False, GREY, 'middle')
    return d


def qr(size=170):
    w = QrCodeWidget(URL)
    b = w.getBounds()
    bw, bh = b[2] - b[0], b[3] - b[1]
    d = Drawing(size, size, transform=[size / bw, 0, 0, size / bh, 0, 0])
    d.add(w)
    return d


# ---------- page decoration ----------
def decorate(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PW, PH, fill=1, stroke=0)
    canvas.setFillColor(colors.Color(0.42, 0.25, 0.83, 0.09))
    for yy in range(14, int(PH), 26):
        for xx in range(14, int(PW), 26):
            canvas.circle(xx, yy, 1.4, fill=1, stroke=0)
    if doc.page > 1:
        canvas.setFillColor(GREY)
        canvas.setFont('Arial-Bold', 10.5)
        canvas.drawString(M, PH - 28, 'Bobo – návod krok za krokem')
        canvas.drawRightString(PW - M, 24, f'strana {doc.page}')
        canvas.setFont('Arial', 10)
        canvas.drawString(M, 24, URL)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(1.5)
        canvas.line(M, PH - 36, PW - M, PH - 36)
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=52, bottomMargin=44,
                      title='Bobo – návod: odkaz, instalace a notifikace', author='Bobo', subject='Návod k aplikaci Bobo (obědy)')
doc.addPageTemplates([PageTemplate(id='all', frames=[Frame(M, 44, CW, PH - 52 - 44, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=decorate)])

S = []

# ===== 1: cover =====
logo = Image(os.path.join(PUBLIC, 'icon-192.png'), 96, 96)
S += [Spacer(1, 26), logo, Spacer(1, 14),
      P('Bobo', ParagraphStyle('cov', fontName='Arial-Bold', fontSize=64, leading=70, textColor=INK)),
      P('Přihlašování na obědy a hlasování o jídlech', ParagraphStyle('cov2', fontName='Arial-Bold', fontSize=22, leading=28, textColor=PURPLE, spaceAfter=18)),
      P('Návod krok za krokem', ParagraphStyle('cov3', fontName='Arial', fontSize=20, leading=26, textColor=INK, spaceAfter=22))]
cover_items = Table([[P('<b>1</b>', center), P('<b>Odkaz na web Bobo</b> a přihlášení', body)],
                     [P('<b>2</b>', center), P('<b>Jak si Bobo stáhnout do telefonu</b> (iPhone, Android, počítač)', body)],
                     [P('<b>3</b>', center), P('<b>Jak zapnout notifikace</b> a kde se nastavují', body)],
                     [P('<b>4</b>', center), P('<b>Když něco nefunguje</b>, odpovědi na časté otázky', body)]], colWidths=[34, CW - 34])
cover_items.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('BACKGROUND', (0, 0), (0, -1), YELLOW), ('BOX', (0, 0), (0, -1), 2, INK),
                                 ('INNERGRID', (0, 0), (0, -1), 2, INK), ('BOTTOMPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 8)]))
S += [cover_items, Spacer(1, 30)]
link_box = Table([[qr(150), [P('Odkaz na Bobo', ParagraphStyle('lb', fontName='Arial-Bold', fontSize=16, leading=21, textColor=GREY)),
                             P(link(), ParagraphStyle('lb2', fontName='Arial-Bold', fontSize=17, leading=24, textColor=PURPLE)),
                             Spacer(1, 6), P('V počítači klepni na odkaz. V telefonu namiř foťák na QR kód, otevře se stejná stránka.', ParagraphStyle('lb3', parent=body, fontSize=13.5, leading=19))]]],
                 colWidths=[170, CW - 170])
link_box.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('BACKGROUND', (0, 0), (-1, -1), WHITE), ('BOX', (0, 0), (-1, -1), 3, INK), ('ROUNDEDCORNERS', [18, 18, 18, 18]),
                              ('LEFTPADDING', (0, 0), (-1, -1), 14), ('TOPPADDING', (0, 0), (-1, -1), 14), ('BOTTOMPADDING', (0, 0), (-1, -1), 14)]))
S += [link_box, Spacer(1, 18), P('Stav k listopadu 2026. Dokument je dlouhý schválně: každý krok je vysvětlený zvlášť, takže se v něm snadno neztratíš.', small), PageBreak()]

# ===== 2: what is Bobo =====
S += section_title('Úvod', 'Co je Bobo a co budeš potřebovat')
S += [P('Bobo je jednoduchá aplikace pro firemní obědy. Neinstaluje se z obchodu s aplikacemi, otevře se jako webová stránka a dá se přidat na plochu telefonu, takže vypadá a chová se jako běžná aplikace.'),
      P('Co v ní uděláš:', h3),
      P('•  <b>Přihlásíš se na oběd.</b> Pro každý den, kdy se vaří, řekneš Ano, nebo Ne. Stačí přetáhnout kuře doleva (Ano), nebo doprava (Ne).'),
      P('•  <b>Hlasuješ o jídlech.</b> Každý týden máš 4 hlasy na to, co se bude vařit příští týden. Každý pátek je burrito.'),
      P('•  <b>Dostaneš připomínku.</b> Den před obědem ti přijde notifikace, jestli půjdeš. V pondělí ti přijde připomínka k hlasování.'),
      Spacer(1, 4), P('Co budeš potřebovat:', h3),
      P('•  telefon (iPhone, nebo Android) nebo počítač s internetem,'),
      P('•  firemní účet Microsoft (e-mail <b>@strohmy.cz</b> a heslo, jako když se přihlašuješ do práce),'),
      P('•  asi 5 minut na instalaci a 2 minuty na notifikace.'),
      Spacer(1, 6),
      box('info', 'Důležité na úvod', 'Na <b>iPhonu</b> fungují notifikace <b>jen v aplikaci přidané na plochu</b> a jen na iOS 16.4 nebo novějším. Proto je instalace v tomto návodu před notifikacemi. Na Androidu a v počítači to jde i v prohlížeči.'),
      PageBreak()]

# ===== 3: link and sign-in =====
S += section_title('Krok 1', 'Odkaz na web Bobo a přihlášení')
S += [P('Tohle je adresa aplikace. Klepni na ni, nebo ji opiš do prohlížeče:'), Spacer(1, 4),
      Table([[P(link(), biglink)]], colWidths=[CW], style=TableStyle([('BACKGROUND', (0, 0), (-1, -1), WHITE), ('BOX', (0, 0), (-1, -1), 3, INK), ('ROUNDEDCORNERS', [16, 16, 16, 16]),
                                                                    ('TOPPADDING', (0, 0), (-1, -1), 18), ('BOTTOMPADDING', (0, 0), (-1, -1), 18)])),
      Spacer(1, 14),
      Table([[qr(100), [P('Nebo naskenuj QR kód', h3), P('Namiř foťák telefonu na kód. Na obrazovce se objeví odkaz, klepni na něj.', body)]]], colWidths=[120, CW - 120],
            style=TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 6)])),
      Spacer(1, 10), P('Přihlášení', h2),
      step(1, 'Otevři odkaz', 'Na <b>iPhonu</b> otevři odkaz v <b>Safari</b>, na <b>Androidu</b> v <b>Chromu</b>. V jiném prohlížeči se instalace nemusí nabídnout.'),
      step(2, 'Přihlas se firemním účtem', 'Objeví se stránka Microsoftu „Přihlásit se“. Napiš svůj firemní e-mail (<b>@strohmy.cz</b>), klepni na Další, napiš heslo a potvrď.'),
      step(3, 'Hotovo, uvidíš žlutou kartu', 'Po přihlášení se otevře hlavní stránka. Nahoře je žlutá karta „Dnes se vaří“ nebo „Příště se vaří“ a pod ní seznam dnů.'),
      box('tip', 'Tip', 'Přihlášení si aplikace pamatuje. Po instalaci na plochu se budeš přihlašovat jen výjimečně, třeba po delší době.'),
      box('warn', 'Přihlášení nejde?', 'Zkus aplikaci úplně zavřít a otevřít znovu, nebo odkaz otevřít v anonymním okně. Pokud pořád nejde, napiš správcům (Klára nebo Pavel). Podrobnosti jsou v kroku 4.'),
      PageBreak()]

# ===== 4: iPhone install =====
S += section_title('Krok 2 · iPhone', 'Jak si Bobo stáhnout na iPhone')
S += [P('Na iPhonu se aplikace přidává přes <b>Safari</b>. Je to nejspolehlivější postup. Potřebuješ iOS 16.4 nebo novější, jinak by nefungovaly notifikace.'), Spacer(1, 4), iphone_diagram(), Spacer(1, 8),
      step(1, 'Otevři odkaz v Safari', f'Otevři {link()} v <b>Safari</b> (modrá ikona kompasu) a přihlas se.'),
      step(2, 'Klepni na Sdílet', 'Je to ikona <b>čtverce se šipkou nahoru</b> v dolní liště Safari. V <b>iOS 26</b> ji najdeš pod tlačítkem <b>tří teček</b> vpravo dole.'),
      PageBreak()]
S += [step(3, 'Najdi „Přidat na plochu“', 'Otevře se nabídka sdílení. <b>Posuň ji prstem nahoru</b>, pokud tam volbu hned nevidíš. Jmenuje se <b>Přidat na plochu</b> (někdy s ikonou čtverce a plusu).'),
      step(4, 'Klepni na Přidat', 'Objeví se název „Bobo“. Klepni vpravo nahoře na <b>Přidat</b>. Ikonka se přidá na plochu mezi ostatní aplikace.'),
      step(5, 'Otevři Bobo z ikonky na ploše', 'Dál používej Bobo <b>vždy z ikonky na ploše</b>, ne ze Safari. Jedině tak ti budou chodit notifikace.'),
      Spacer(1, 6),
      box('warn', 'Nevidíš „Přidat na plochu“?', 'Otevři stránku přímo v <b>Safari</b>, ne v odkazu uvnitř e-mailu nebo Messengeru. Zkus nabídku sdílení posunout dolů a nahoru. V Chromu na iPhonu je Sdílet vpravo v adresním řádku, ale Safari je spolehlivější.'),
      box('info', 'Jak poznám, že se to povedlo?', 'Na ploše je žlutá ikonka s miskou a nápisem Bobo. Po klepnutí se aplikace otevře na celou obrazovku, bez adresního řádku Safari.'),
      box('tip', 'Ikonku chci jinam', 'Podrž ikonku prstem, dokud se neroztřese, a přesuň ji. Smazat ji můžeš stejným podržením a volbou „Odstranit aplikaci“.'),
      PageBreak()]

# ===== 6: Android install =====
S += section_title('Krok 2 · Android', 'Jak si Bobo stáhnout na Android')
S += [P('Na Androidu se Bobo instaluje přes <b>Chrome</b>. Obvykle ti ho prohlížeč nabídne i sám dole na stránce.'), Spacer(1, 4), android_diagram(), Spacer(1, 8),
      step(1, 'Otevři odkaz v Chromu', f'Otevři {link()} v <b>Chromu</b> a přihlas se.'),
      step(2, 'Klepni na menu (tři tečky)', '<b>Tři tečky pod sebou</b> jsou vpravo nahoře, vedle adresního řádku. Zvol <b>Instalovat aplikaci</b>. Na některých telefonech je volba <b>Přidat na plochu</b>, po jejím výběru potvrď <b>Instalovat</b>.'),
      step(3, 'Potvrď Instalovat', 'Zobrazí se okno „Nainstalovat aplikaci?“ s ikonkou Bobo. Klepni na <b>Instalovat</b>.'),
      step(4, 'Otevři Bobo z ikonky', 'Ikonka se objeví mezi aplikacemi a případně i na ploše. Otevírej Bobo z ní.'),
      box('tip', 'Instalaci nabídne i aplikace', 'V horní části hlavní stránky Bobo je lišta „Nainstaluj Bobo“, a v <b>Nastavení</b> je sekce <b>Aplikace</b> s tlačítkem <b>Nainstalovat aplikaci</b>. Stačí klepnout.'),
      box('warn', 'Volbu nevidíš?', 'Otevři stránku v <b>Chromu</b> (ne ve vestavěném prohlížeči jiné aplikace). Pokud i tak chybí, je to výjimečně verzí prohlížeče. Aktualizuj Chrome v obchodě Google Play.'),
      PageBreak()]

# ===== 7: desktop install =====
S += section_title('Krok 2 · Počítač', 'Jak si Bobo přidat v počítači')
S += [P('V počítači není instalace nutná, Bobo funguje i jako záložka. Pokud chceš vlastní okno a ikonku, postupuj podle prohlížeče.'), Spacer(1, 4), desktop_diagram(), Spacer(1, 10),
      P('Chrome a Edge', h2),
      step(1, 'Klepni na ikonku instalace', 'V adresním řádku <b>vpravo</b> je ikonka <b>monitoru se šipkou</b>. Pokud ji nevidíš, otevři menu <b>tří teček</b> a zvol <b>Nainstalovat Bobo</b> (v Edge: Aplikace → Nainstalovat tento web jako aplikaci).'),
      step(2, 'Potvrď Nainstalovat', 'V okně „Nainstalovat aplikaci?“ klepni na <b>Nainstalovat</b>. Bobo se otevře ve vlastním okně a objeví se v nabídce aplikací.'),
      P('Safari (macOS Sonoma a novější)', h2),
      P('V menu nahoře zvol <b>Soubor → Přidat do Docku</b> (nebo tlačítko Sdílet → <b>Přidat do Docku</b>). Starší Safari instalaci aplikací neumí.'),
      P('Firefox', h2),
      P('Firefox v počítači instalaci aplikací nepodporuje. Použij Chrome nebo Edge, nebo nech Bobo otevřené v připnuté záložce. Notifikace v Firefoxu chodí jen dokud Firefox běží.'),
      PageBreak()]

# ===== 8: notifications overview =====
S += section_title('Krok 3', 'Notifikace: co přijde a kdy')
S += [P('Notifikace jsou krátké zprávy, které se objeví na obrazovce telefonu, i když Bobo zrovna nemáš otevřené. Bobo posílá dva druhy a každý si můžeš zapnout, nebo vypnout zvlášť.'), Spacer(1, 4), notification_cards(), Spacer(1, 10)]
table = Table([[P('<b>Druh</b>', body), P('<b>Kdy přijde</b>', body), P('<b>K čemu je</b>', body)],
               [P('<b>Připomínka oběda</b>', body), P('Den před obědem v čase, který si nastavíš (výchozí 15:00), jen když se zítra vaří a ještě jsi neodpověděl(a).', body), P('Řekneš Ano, nebo Ne přímo z notifikace, aplikace se nemusí otevírat.', body)],
               [P('<b>Připomínka hlasování</b>', body), P('Každé pondělí mezi 9:00 a 18:00, jen když jsi ještě v tom týdnu nehlasoval(a).', body), P('Otevře stránku Hlasuj!, kde rozdáš své 4 hlasy.', body)]],
              colWidths=[132, CW * 0.40, CW - 132 - CW * 0.40])
table.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), YELLOW), ('BACKGROUND', (0, 1), (-1, -1), WHITE), ('GRID', (0, 0), (-1, -1), 1.6, INK), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                           ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
S += [table, Spacer(1, 12),
      box('info', 'Čas připomínky oběda musí být před uzávěrkou', 'Přihlašovat se na oběd jde obvykle <b>do 16:00 den předem</b>. Připomínka proto musí přijít dřív, výchozí čas je 15:00. Aplikace ti nedovolí nastavit čas po uzávěrce.'),
      box('tip', 'Notifikace se zapínají zvlášť na každém zařízení', 'Když používáš Bobo v telefonu i v počítači, zapni si notifikace na obou. Každé zařízení si pamatuje své nastavení.'),
      PageBreak()]

# ===== 9: image page with the settings schematic =====
S += section_title('Krok 3', 'Kde se notifikace nastavují')
img_h = 640
S += [Image(os.path.join(HERE, 'navod-notifikace.png'), img_h * 1080 / 1640, img_h, hAlign='CENTER'), PageBreak()]

# ===== 10: iPhone notifications =====
S += section_title('Krok 3 · iPhone', 'Zapnutí notifikací na iPhonu')
S += [P('Na iPhonu je potřeba, aby Bobo <b>už bylo přidané na ploše</b> (krok 2) a abys ho otevřela z ikonky. Jinak telefon notifikace nepovolí.'), Spacer(1, 6),
      step(1, 'Otevři Bobo z ikonky na ploše', 'Ne ze Safari. Aplikace se otevře na celou obrazovku.'),
      step(2, 'Klepni na ikonku Nastavení', 'Najdeš ji <b>vpravo nahoře</b> v horní liště, má podobu <b>tří posuvníků</b> (vedle kolečka s tvými iniciály).'),
      step(3, 'Zapni „Připomínat oběd“', 'V sekci <b>Denní připomínka</b> přepni <b>Připomínat oběd</b>. Pod ním můžeš nastavit <b>Čas připomínky</b> (musí být před uzávěrkou, výchozí je 15:00).'),
      step(4, 'Nech zapnuté „Připomínat hlasování“', 'V sekci <b>Připomínka hlasování</b> je přepínač <b>Připomínat hlasování</b>. Je zapnutý od začátku. Chceš-li pondělní připomínku vypnout, přepni ho.'),
      step(5, 'Klepni na „Povolit notifikace“', 'V sekci <b>Notifikace na tomto zařízení</b> klepni na fialové tlačítko <b>Povolit notifikace</b>. iPhone se zeptá, jestli aplikaci Bobo povolit oznámení, klepni na <b>Povolit</b>.'),
      step(6, 'Ověř, že to funguje', 'Stav v sekci se změní na „Notifikace jsou zapnuté“. Tlačítkem pro test můžeš notifikaci poslat hned (je-li zobrazené).'),
      box('warn', 'Omylem jsi klepla na „Nepovolit“?', 'Otevři na iPhonu <b>Nastavení → Oznámení → Bobo</b> a zapni <b>Povolit oznámení</b>. Pak se v aplikaci vrať do sekce Notifikace na tomto zařízení.'),
      box('tip', 'Soustředění a „Nerušit“', 'Když máš zapnutý režim Nerušit nebo Soustředění, notifikace se v tu dobu nezobrazí. Zkontroluj v Nastavení iPhonu, jestli Bobo nemá výjimku.'),
      PageBreak()]

# ===== 11: Android + desktop notifications =====
S += section_title('Krok 3 · Android a počítač', 'Zapnutí notifikací na Androidu a v počítači')
S += [P('Android', h2),
      step(1, 'Otevři Bobo a klepni na Nastavení', 'Ikonka se třemi posuvníky je vpravo nahoře.'),
      step(2, 'Zapni „Připomínat oběd“ a nastav čas', 'V sekci <b>Denní připomínka</b>. Čas musí být před uzávěrkou (výchozí 15:00).'),
      step(3, 'Zkontroluj „Připomínat hlasování“', 'V sekci <b>Připomínka hlasování</b> je přepínač zapnutý od začátku.'),
      step(4, 'Klepni na „Povolit notifikace“', 'V sekci <b>Notifikace na tomto zařízení</b>. Telefon se zeptá, klepni na <b>Povolit</b>.'),
      box('warn', 'Notifikace jsi zamítla?', 'Podrž ikonku Bobo → <b>Informace o aplikaci</b> → <b>Oznámení</b> a zapni je. V Chromu to jde přes menu tří teček → Nastavení → Nastavení webu → Oznámení.'),
      box('tip', 'Šetření baterie', 'Některé telefony notifikace „uspávají“. V Nastavení telefonu u aplikace Bobo nastav baterii na „Bez omezení“, pokud ti připomínky nechodí včas.'),
      P('Počítač', h2),
      step(1, 'Otevři Nastavení v Bobo', 'Ikonka se třemi posuvníky je vpravo nahoře.'),
      step(2, 'Zapni připomínky a klepni na Povolit notifikace', 'Prohlížeč se zeptá. Klepni na <b>Povolit</b>.'),
      box('info', 'V počítači musí běžet prohlížeč', 'Stačí, aby byl prohlížeč spuštěný na pozadí. Když ho úplně zavřeš, notifikace nepřijde. Pokud jsi zamítla povolení, klepni na ikonku zámku vlevo od adresy → <b>Oznámení</b> → <b>Povolit</b>.'),
      PageBreak()]

# ===== 12: using Bobo =====
S += section_title('Jak se Bobo používá', 'Oběd, hlasování a pár drobností')
S += [P('Přihlášení na oběd', h2), P('Každý den, kdy se vaří, má řádek s <b>kuřetem na dráze</b>. Kuře přetáhni prstem, nebo klepni na stranu dráhy:'), switch_diagram(), Spacer(1, 4),
      P('•  <b>doleva</b> = Ano, jdeš na oběd,'), P('•  <b>doprava</b> = Ne, nejdeš,'), P('•  <b>doprostřed</b> = zatím jsi neodpověděl(a). Odpověď jde změnit do uzávěrky, obvykle do 16:00 den předem.'),
      P('Hlasování o jídlech', h2),
      P('Klepni na velké fialové tlačítko <b>Hlasuj!</b> s miskou ramenu (pod řádkem „Rychle vyplnit“). Otevře se seznam jídel.'),
      P('•  Máš <b>4 hlasy</b> na týden. Hlas dáš tak, že <b>přetáhneš hlavu pejska doprava</b>. Zpět doleva ho vezmeš zpátky.'),
      P('•  U jídla vidíš <b>bílkoviny (B), tuky (T) a sacharidy (S)</b> v gramech na porci. Hodnota s vlnovkou (~) je odhad.'),
      P('•  Štítek <b>laktóza</b> značí jídlo s laktózou. Všechna jídla jsou bez lepku a sóji.'),
      P('•  Klepnutím na název jídla se rozbalí <b>seznam přísad</b> nebo otevře odkaz na recept.'),
      P('•  Počty hlasů uvidíš až poté, co sama hlasuješ. Co se nakonec uvaří, rozhodují správci.'),
      P('Pátek je burrito', h2), P('Každý pátek se vaří burrito. O pátku se nehlasuje, jen se na něj přihlásíš jako na jiný oběd.'),
      P('Přehled (jen pro správce)', h2), P('Správci mají navíc stránku <b>Přehled</b> s tím, kdo jde na oběd, a vybírají, co se v který den vaří.'), PageBreak()]

# ===== 13: troubleshooting =====
S += section_title('Krok 4', 'Když něco nefunguje')
faq = [
    ('Nevidím „Přidat na plochu“ (iPhone), nebo „Instalovat aplikaci“ (Android)',
     'Otevři Bobo přímo v <b>Safari</b> (iPhone), nebo v <b>Chromu</b> (Android), ne uvnitř jiné aplikace. Na iPhonu nabídku sdílení posuň nahoru. Na Androidu zkus aktualizovat Chrome.'),
    ('Přihlášení neprojde, nebo se objeví hláška „Přihlášení selhalo“',
     'Zavři aplikaci úplně a otevři ji znovu. Zkus odkaz v anonymním okně. Přihlašuj se firemním účtem @strohmy.cz. Pokud se stále nepřihlásíš, napiš správcům, může jít o nastavení přístupu.'),
    ('Notifikace mi nechodí',
     '1) V Bobo → Nastavení klepni na <b>Povolit notifikace</b>. 2) V Nastavení telefonu povol oznámení pro Bobo. 3) <b>iPhone:</b> otevírej Bobo z ikonky na ploše a měj iOS 16.4+. 4) Zkontroluj režim Nerušit. 5) Pamatuj, že připomínka oběda přijde jen když se zítra vaří a ještě jsi neodpověděla, a hlasovací jen v pondělí a jen když jsi nehlasovala.'),
    ('Vidím starou verzi, chybí mi novinky',
     'Aplikaci úplně zavři (přejetím v seznamu aplikací) a otevři znovu. Pomůže i vypnout a zapnout internet. Nová verze se načte při dalším otevření.'),
    ('Nemůžu se přihlásit na oběd, kuře se vrací zpátky',
     'Nejspíš už uplynula uzávěrka (obvykle 16:00 den před obědem). Zeptej se správců, zda může změnit odpověď za tebe.'),
    ('Pejsek při hlasování nezaštěká',
     'Zvuk se přehraje až po klepnutí a potřebuje zapnutou hlasitost. Pes štěká po druhém hlasu a také když ho na chvíli podržíš prstem.'),
    ('Jak aplikaci odstraním?',
     'Podrž ikonku Bobo na ploše, potom zvol <b>Odstranit aplikaci</b> (iPhone), nebo <b>Odinstalovat</b> (Android).'),
]
for q, a in faq:
    t = Table([[[P(f'<b>{q}</b>', ParagraphStyle('q', parent=body, fontSize=13, leading=17, spaceAfter=2, textColor=PURPLE)), P(a, ParagraphStyle('a', parent=body, fontSize=12.3, leading=16.5, spaceAfter=0))]]], colWidths=[CW])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), WHITE), ('BOX', (0, 0), (-1, -1), 1.8, INK), ('ROUNDEDCORNERS', [12, 12, 12, 12]),
                           ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12), ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 10)]))
    S += [KeepTogether([t, Spacer(1, 8)])]
S += [PageBreak()]

# ===== 14: cheat sheet =====
S += section_title('Tahák', 'Všechno na jedné stránce')
cs = [[P('<b>Odkaz</b>', body), P(link(), ParagraphStyle('cl', parent=body, fontName='Arial-Bold', fontSize=15.5))],
      [P('<b>iPhone</b><br/>instalace', body), P('Safari → Sdílet (čtverec se šipkou, v iOS 26 pod třemi tečkami) → <b>Přidat na plochu</b> → Přidat. Otevírej z ikonky na ploše.', body)],
      [P('<b>Android</b><br/>instalace', body), P('Chrome → menu tří teček → <b>Instalovat aplikaci</b> → Instalovat.', body)],
      [P('<b>Počítač</b><br/>instalace', body), P('Chrome / Edge: ikonka instalace v adresním řádku vpravo → Nainstalovat. Safari: Soubor → Přidat do Docku.', body)],
      [P('<b>Notifikace</b>', body), P('Bobo → ikonka <b>Nastavení</b> (3 posuvníky vpravo nahoře) → <b>Připomínat oběd</b> → <b>Čas připomínky</b> → <b>Připomínat hlasování</b> → <b>Povolit notifikace</b> → Povolit.', body)],
      [P('<b>Oběd</b>', body), P('Kuře doleva = <b>Ano</b>, doprava = <b>Ne</b>. Odpovídá se obvykle do 16:00 den předem.', body)],
      [P('<b>Hlasování</b>', body), P('Tlačítko <b>Hlasuj!</b> → přetáhni pejska doprava (4 hlasy za týden). Každý pátek je burrito.', body)]]
ct = Table(cs, colWidths=[110, CW - 110])
ct.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, -1), YELLOW), ('BACKGROUND', (1, 0), (1, -1), WHITE), ('GRID', (0, 0), (-1, -1), 1.8, INK), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10), ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
S += [ct, Spacer(1, 16), box('ok', 'Něco pořád nejde?', 'Zeptej se správců aplikace, Kláry nebo Pavla. Napiš jim, jaký máš telefon (iPhone, nebo Android) a co přesně se děje, ideálně se snímkem obrazovky.')]

doc.build(S)
print('ok', OUT, os.path.getsize(OUT) // 1024, 'kB')
