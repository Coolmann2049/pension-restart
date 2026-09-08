from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "pension-restart-architecture.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = landscape(A4)
MARGIN = 15 * mm

INK = colors.HexColor("#17342D")
MUTED = colors.HexColor("#66756F")
GREEN = colors.HexColor("#1E775D")
GREEN_DARK = colors.HexColor("#145744")
MINT = colors.HexColor("#E7F4EE")
CREAM = colors.HexColor("#FAF6EE")
PEACH = colors.HexColor("#F6E8D9")
BLUE = colors.HexColor("#E8F0F5")
WHITE = colors.white
LINE = colors.HexColor("#C9D6D1")
RED = colors.HexColor("#A64032")

REGULAR_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
pdfmetrics.registerFont(TTFont("PRRegular", REGULAR_FONT))
pdfmetrics.registerFont(TTFont("PRBold", BOLD_FONT))


def paragraph(canvas, text, x, y_top, width, height, *, size=9, leading=None,
              color=INK, font="PRRegular", align=TA_LEFT):
    style = ParagraphStyle(
        "inline",
        fontName=font,
        fontSize=size,
        leading=leading or size * 1.35,
        textColor=color,
        alignment=align,
        spaceAfter=0,
        spaceBefore=0,
    )
    item = Paragraph(text, style)
    _, used = item.wrap(width, height)
    item.drawOn(canvas, x, y_top - used)
    return used


def rounded_box(canvas, x, y, w, h, *, fill=WHITE, stroke=LINE, radius=4 * mm, line_width=0.8):
    canvas.setFillColor(fill)
    canvas.setStrokeColor(stroke)
    canvas.setLineWidth(line_width)
    canvas.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def pill(canvas, text, x, y, w, *, fill=MINT, color=GREEN_DARK):
    canvas.setFillColor(fill)
    canvas.roundRect(x, y, w, 7 * mm, 3.5 * mm, fill=1, stroke=0)
    canvas.setFillColor(color)
    canvas.setFont("PRBold", 7.2)
    canvas.drawCentredString(x + w / 2, y + 2.2 * mm, text)


def arrow(canvas, x1, y1, x2, y2, color=GREEN):
    canvas.setStrokeColor(color)
    canvas.setFillColor(color)
    canvas.setLineWidth(1.4)
    canvas.line(x1, y1, x2, y2)
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    length = 3.3 * mm
    spread = 0.48
    points = [
        (x2, y2),
        (x2 - length * math.cos(angle - spread), y2 - length * math.sin(angle - spread)),
        (x2 - length * math.cos(angle + spread), y2 - length * math.sin(angle + spread)),
    ]
    path = canvas.beginPath()
    path.moveTo(*points[0])
    path.lineTo(*points[1])
    path.lineTo(*points[2])
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)


def header(canvas, page_title, kicker, page_number):
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(GREEN)
    canvas.roundRect(MARGIN, PAGE_H - 14 * mm, 8 * mm, 8 * mm, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("PRBold", 7.3)
    canvas.drawCentredString(MARGIN + 4 * mm, PAGE_H - 11.3 * mm, "PR")
    canvas.setFillColor(GREEN)
    canvas.setFont("PRBold", 7.6)
    canvas.drawString(MARGIN + 11 * mm, PAGE_H - 11.2 * mm, kicker.upper())
    canvas.setFillColor(INK)
    canvas.setFont("PRBold", 21)
    canvas.drawString(MARGIN, PAGE_H - 27 * mm, page_title)
    canvas.setFillColor(MUTED)
    canvas.setFont("PRRegular", 7)
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 11.2 * mm, f"PENSION RESTART  /  {page_number} OF 3")


def footer(canvas):
    y = 8 * mm
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, y + 4 * mm, PAGE_W - MARGIN, y + 4 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("PRRegular", 6.6)
    canvas.drawString(MARGIN, y, "Independent pension guidance project - not a government service")
    canvas.drawRightString(PAGE_W - MARGIN, y, "pension-restart.yashdeep-jha.site")


def component_box(canvas, x, y, w, h, title, subtitle, *, fill=WHITE, accent=GREEN):
    rounded_box(canvas, x, y, w, h, fill=fill)
    canvas.setFillColor(accent)
    canvas.roundRect(x + 4 * mm, y + h - 11 * mm, 7 * mm, 7 * mm, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("PRBold", 7)
    canvas.drawCentredString(x + 7.5 * mm, y + h - 8.5 * mm, title[:1])
    paragraph(canvas, f"<b>{title}</b>", x + 14 * mm, y + h - 4.5 * mm, w - 18 * mm, 10 * mm, size=9.2, font="PRRegular")
    paragraph(canvas, subtitle, x + 4 * mm, y + h - 15 * mm, w - 8 * mm, h - 18 * mm, size=7.2, leading=9.5, color=MUTED)


def draw_page_one(canvas):
    header(canvas, "A safer path from one conversation to one case", "Technical architecture", 1)
    paragraph(
        canvas,
        "Pension Restart preserves a pensioner's confirmed story across voice, web and WhatsApp, while keeping language-model interpretation separate from deterministic guidance.",
        MARGIN, PAGE_H - 32 * mm, 215 * mm, 16 * mm, size=9.2, leading=12.5, color=MUTED,
    )

    base_y = 57 * mm
    box_h = 34 * mm
    channel_x = MARGIN
    channel_w = 49 * mm
    service_x = 85 * mm
    service_w = 62 * mm
    store_x = 170 * mm
    store_w = 50 * mm
    output_x = 243 * mm
    output_w = 39 * mm

    component_box(canvas, channel_x, base_y + 70 * mm, channel_w, box_h, "Voice", "Vapi telephone and browser calls. Hindi, English and Hinglish input.", fill=BLUE)
    component_box(canvas, channel_x, base_y + 31 * mm, channel_w, box_h, "Website", "Accessible guided intake, case resume and family support views.", fill=WHITE)
    component_box(canvas, channel_x, base_y - 8 * mm, channel_w, box_h, "WhatsApp", "Consent-gated follow-up, case code delivery and continued conversation.", fill=MINT)

    rounded_box(canvas, service_x, base_y + 29 * mm, service_w, 76 * mm, fill=WHITE, stroke=GREEN)
    pill(canvas, "TRUST BOUNDARY", service_x + 5 * mm, base_y + 91 * mm, 32 * mm)
    paragraph(canvas, "<b>Express case service</b>", service_x + 5 * mm, base_y + 87 * mm, service_w - 10 * mm, 10 * mm, size=12)
    for idx, item in enumerate([
        "Identity and consent checks",
        "One-question state machine",
        "Fact validation and corrections",
        "Case-code access controls",
        "Provider webhook verification",
    ]):
        cy = base_y + 72 * mm - idx * 10.5 * mm
        canvas.setFillColor(GREEN)
        canvas.circle(service_x + 7 * mm, cy + 1.2 * mm, 1.2 * mm, fill=1, stroke=0)
        paragraph(canvas, item, service_x + 11 * mm, cy + 4 * mm, service_w - 16 * mm, 7 * mm, size=7.5, color=INK)

    component_box(canvas, store_x, base_y + 70 * mm, store_w, box_h, "SQLite", "Cases, channel identities, messages, facts, audit events and notifications.", fill=PEACH, accent=GREEN_DARK)
    component_box(canvas, store_x, base_y + 31 * mm, store_w, box_h, "Fact history", "Append-only events. Corrections supersede prior facts instead of erasing them.", fill=WHITE, accent=GREEN_DARK)
    component_box(canvas, store_x, base_y - 8 * mm, store_w, box_h, "Guidance", "Deterministic rules select authority, documents and next steps after readback.", fill=MINT, accent=GREEN_DARK)

    component_box(canvas, output_x, base_y + 70 * mm, output_w, box_h, "Case", "Six-digit reference reconnects the same case.", fill=WHITE)
    component_box(canvas, output_x, base_y + 31 * mm, output_w, box_h, "Family", "Consent-bound helper continuity.", fill=WHITE)
    component_box(canvas, output_x, base_y - 8 * mm, output_w, box_h, "Ops", "Live transcripts and events over SSE.", fill=WHITE)

    for cy in [base_y + 87 * mm, base_y + 48 * mm, base_y + 9 * mm]:
        arrow(canvas, channel_x + channel_w + 3 * mm, cy, service_x - 3 * mm, base_y + 67 * mm)
    arrow(canvas, service_x + service_w + 3 * mm, base_y + 67 * mm, store_x - 3 * mm, base_y + 87 * mm)
    arrow(canvas, store_x + store_w + 3 * mm, base_y + 87 * mm, output_x - 3 * mm, base_y + 87 * mm)
    arrow(canvas, store_x + store_w + 3 * mm, base_y + 48 * mm, output_x - 3 * mm, base_y + 48 * mm)
    arrow(canvas, store_x + store_w + 3 * mm, base_y + 9 * mm, output_x - 3 * mm, base_y + 9 * mm)

    ai_y = 24 * mm
    rounded_box(canvas, 85 * mm, ai_y, 135 * mm, 24 * mm, fill=INK, stroke=INK)
    paragraph(canvas, "<font color='#83D4B8'><b>Bounded AI interpretation</b></font><br/><font color='#FFFFFF'>The model proposes structured facts. Server validation accepts, rejects or asks for clarification. It cannot directly mutate a case or choose the final pension route.</font>", 91 * mm, ai_y + 19 * mm, 123 * mm, 18 * mm, size=7.5, leading=10)
    arrow(canvas, 147 * mm, ai_y + 25 * mm, 123 * mm, base_y + 27 * mm, color=GREEN_DARK)
    footer(canvas)
    canvas.showPage()


def step_card(canvas, x, y, number, title, text, fill=WHITE):
    rounded_box(canvas, x, y, 82 * mm, 27 * mm, fill=fill)
    canvas.setFillColor(GREEN)
    canvas.circle(x + 8 * mm, y + 18 * mm, 4.2 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("PRBold", 7)
    canvas.drawCentredString(x + 8 * mm, y + 15.7 * mm, str(number))
    paragraph(canvas, f"<b>{title}</b>", x + 15 * mm, y + 23 * mm, 62 * mm, 7 * mm, size=8.4)
    paragraph(canvas, text, x + 15 * mm, y + 14 * mm, 62 * mm, 11 * mm, size=6.8, leading=8.6, color=MUTED)


def draw_page_two(canvas):
    header(canvas, "How one case survives every handoff", "Case lifecycle", 2)
    paragraph(canvas, "Every channel contributes to one canonical case. The caller remains in control through consent, readback and explicit correction.", MARGIN, PAGE_H - 32 * mm, 220 * mm, 14 * mm, size=9, color=MUTED)

    xs = [MARGIN, 105 * mm, 195 * mm]
    ys = [PAGE_H - 73 * mm, PAGE_H - 105 * mm]
    steps = [
        (1, "Start or resume", "A browser cookie, caller number or WhatsApp identity finds the correct case without exposing it publicly."),
        (2, "Ask one thing", "The state machine asks one plain-language question and preserves the raw answer with its source."),
        (3, "Interpret safely", "AI proposes constrained facts; deterministic validators reject ambiguity or request clarification."),
        (4, "Commit history", "Confirmed facts become immutable events. A correction creates a new event that supersedes the old one."),
        (5, "Read back", "Before guidance, the system reads the captured case back and accepts a specific correction."),
        (6, "Continue anywhere", "After consent, a six-digit reference reconnects voice, web, WhatsApp or a trusted family helper."),
    ]
    for index, (number, title, text) in enumerate(steps):
        row = index // 3
        col = index % 3
        step_card(canvas, xs[col], ys[row], number, title, text, fill=MINT if index in (3, 5) else WHITE)

    section_y = 39 * mm
    rounded_box(canvas, MARGIN, section_y, 165 * mm, 49 * mm, fill=WHITE)
    paragraph(canvas, "<b>Canonical data model</b>", MARGIN + 5 * mm, section_y + 43 * mm, 75 * mm, 8 * mm, size=10)
    paragraph(canvas, "One record of truth, with enough provenance to explain how it changed.", MARGIN + 5 * mm, section_y + 34 * mm, 145 * mm, 8 * mm, size=7.2, color=MUTED)
    labels = ["cases", "channel identities", "conversations", "messages", "fact events", "case facts", "audit events", "notifications"]
    px = MARGIN + 5 * mm
    py = section_y + 19 * mm
    for label in labels:
        width = (len(label) * 2.1 + 10) * mm
        if px + width > MARGIN + 158 * mm:
            px = MARGIN + 5 * mm
            py -= 10 * mm
        pill(canvas, label.upper(), px, py, width, fill=PEACH if "fact" in label else MINT)
        px += width + 3 * mm

    privacy_x = 187 * mm
    rounded_box(canvas, privacy_x, section_y, 95 * mm, 49 * mm, fill=INK, stroke=INK)
    paragraph(canvas, "<font color='#83D4B8'><b>Privacy boundary</b></font>", privacy_x + 5 * mm, section_y + 43 * mm, 80 * mm, 8 * mm, size=10)
    privacy = [
        "No Aadhaar, PAN or complete bank details",
        "No government or bank OTP collection",
        "Consent required before WhatsApp follow-up",
        "Family access is case-code and browser bound",
    ]
    for idx, item in enumerate(privacy):
        cy = section_y + 29 * mm - idx * 8 * mm
        canvas.setFillColor(colors.HexColor("#83D4B8"))
        canvas.circle(privacy_x + 7 * mm, cy + 1.1 * mm, 1.1 * mm, fill=1, stroke=0)
        paragraph(canvas, item, privacy_x + 11 * mm, cy + 4 * mm, 78 * mm, 7 * mm, size=6.8, color=WHITE)

    footer(canvas)
    canvas.showPage()


def lane(canvas, y, title, owner, details, *, fill=WHITE, accent=GREEN):
    rounded_box(canvas, MARGIN, y, PAGE_W - 2 * MARGIN, 23 * mm, fill=fill)
    canvas.setFillColor(accent)
    canvas.rect(MARGIN, y + 4 * mm, 2 * mm, 15 * mm, fill=1, stroke=0)
    paragraph(canvas, f"<b>{title}</b>", MARGIN + 6 * mm, y + 18 * mm, 53 * mm, 8 * mm, size=8.7)
    pill(canvas, owner.upper(), MARGIN + 62 * mm, y + 8 * mm, 35 * mm, fill=MINT if fill == WHITE else WHITE)
    paragraph(canvas, details, MARGIN + 104 * mm, y + 17 * mm, PAGE_W - 2 * MARGIN - 109 * mm, 13 * mm, size=7.2, leading=9.5, color=MUTED)


def draw_page_three(canvas):
    header(canvas, "Separation of responsibilities", "Trust and operations", 3)
    paragraph(canvas, "The system remains useful when a provider is slow or unavailable because the case record and guidance rules stay inside the application boundary.", MARGIN, PAGE_H - 32 * mm, 225 * mm, 14 * mm, size=9, color=MUTED)

    top = PAGE_H - 66 * mm
    lane(canvas, top, "Conversation", "Vapi / Meta", "Transport speech and messages, identify the channel participant, and deliver provider events. They do not decide pension guidance.", fill=BLUE)
    lane(canvas, top - 27 * mm, "Interpretation", "Codex / OpenAI", "Turn free-form language into a constrained proposal containing field, value, confidence and evidence. Failure falls back conservatively.", fill=WHITE)
    lane(canvas, top - 54 * mm, "Case truth", "Express + SQLite", "Validate allowed fields, enforce versions and consent, store append-only events, protect case access and preserve corrections.", fill=PEACH)
    lane(canvas, top - 81 * mm, "Guidance", "Rule engine", "Choose likely cause, authority, documents and next steps only after final readback. Always label the result as guidance, not a decision.", fill=MINT)

    lower_y = 24 * mm
    card_w = 84 * mm
    for idx, (title, text, fill) in enumerate([
        ("Graceful failure", "Voice, web and case storage remain separate from WhatsApp activation. A provider outage does not erase the case.", WHITE),
        ("Operational visibility", "Signed webhooks, deduplication, notification status and live SSE events make failures observable instead of silent.", WHITE),
        ("Evidence", "Live site, 2-minute submission video, source tests and this architecture document provide independently reviewable surfaces.", WHITE),
    ]):
        x = MARGIN + idx * 90 * mm
        rounded_box(canvas, x, lower_y, card_w, 33 * mm, fill=fill)
        paragraph(canvas, f"<b>{title}</b>", x + 5 * mm, lower_y + 27 * mm, card_w - 10 * mm, 8 * mm, size=9)
        paragraph(canvas, text, x + 5 * mm, lower_y + 17 * mm, card_w - 10 * mm, 15 * mm, size=6.8, leading=8.8, color=MUTED)

    paragraph(canvas, "<b>Review links</b>", MARGIN, 20 * mm, 35 * mm, 7 * mm, size=7.2)
    paragraph(canvas, "<link href='https://pension-restart.yashdeep-jha.site/' color='#1E775D'>Live project</link>  |  <link href='https://www.youtube.com/watch?v=E_OwXTp5Bas' color='#1E775D'>2-minute video</link>  |  <link href='https://pension-restart.yashdeep-jha.site/llms.txt' color='#1E775D'>Machine-readable summary</link>", MARGIN + 31 * mm, 20 * mm, 175 * mm, 7 * mm, size=7)
    footer(canvas)
    canvas.showPage()


def build():
    canvas = Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
    canvas.setTitle("Pension Restart - Technical Architecture")
    canvas.setAuthor("Yashdeep Jha")
    canvas.setSubject("Build What Moves India Round 2 architecture and safety boundaries")
    draw_page_one(canvas)
    draw_page_two(canvas)
    draw_page_three(canvas)
    canvas.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
