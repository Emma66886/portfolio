"""Builds Emmanuel's frontend CV as a text-based (ATS readable) PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, KeepTogether,
)

ACCENT = colors.HexColor("#A32639")
INK = colors.HexColor("#1A1A1A")
MUTED = colors.HexColor("#555555")

name = ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=20, leading=23,
                      textColor=INK, spaceAfter=2)
role = ParagraphStyle("role", fontName="Helvetica", fontSize=11.5, leading=14,
                      textColor=ACCENT, spaceAfter=4)
contact = ParagraphStyle("contact", fontName="Helvetica", fontSize=8.8, leading=12,
                         textColor=MUTED, spaceAfter=2)
section = ParagraphStyle("section", fontName="Helvetica-Bold", fontSize=9.6, leading=12,
                         textColor=ACCENT, spaceBefore=9, spaceAfter=3,
                         tracking=1)
body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.3, leading=12.8,
                      textColor=INK, spaceAfter=3)
jobline = ParagraphStyle("jobline", fontName="Helvetica-Bold", fontSize=9.8, leading=12.5,
                         textColor=INK, spaceBefore=5, spaceAfter=0)
meta = ParagraphStyle("meta", fontName="Helvetica-Oblique", fontSize=8.6, leading=11,
                      textColor=MUTED, spaceAfter=2.5)
bullet = ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.2, leading=12.4,
                        textColor=INK, leftIndent=9, bulletIndent=1, spaceAfter=1.4)

story = []


def rule():
    story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#D8D2CE"),
                            spaceBefore=1, spaceAfter=4))


def heading(text):
    story.append(Paragraph(text.upper(), section))
    rule()


def job(title, org, dates, bullets):
    points = [Paragraph(b, bullet, bulletText="•") for b in bullets]
    # Keep the heading with its first bullet, but let the remaining bullets flow
    # onto the next page rather than pushing the whole block down and leaving a
    # gap at the bottom.
    story.append(KeepTogether(
        [Paragraph(f"{title}, {org}", jobline), Paragraph(dates, meta), points[0]]))
    story.extend(points[1:])


# ---- Header ----
story.append(Paragraph("Emmanuel Akinroye", name))
story.append(Paragraph("Senior Frontend Engineer", role))
story.append(Paragraph(
    "kinemcodes@gmail.com &nbsp;|&nbsp; +234 810 474 2511 &nbsp;|&nbsp; "
    "github.com/emma66886 &nbsp;|&nbsp; linkedin.com/in/emmanuelakinroye &nbsp;|&nbsp; "
    "Remote, based in Nigeria", contact))
story.append(Spacer(1, 3))

# ---- Summary ----
heading("Summary")
story.append(Paragraph(
    "Senior frontend engineer with 7+ years of React and TypeScript in production. I build the "
    "parts of a product people sit in front of all day: real-time collaborative screens, "
    "scheduling and capacity views, payment flows and data-heavy dashboards. I know the backend "
    "well enough to design against it instead of around it, which is usually why teams bring me "
    "in. I test what matters with Jest. I work directly with founders on live codebases, fully "
    "remote across UK, EU and US time zones.", body))

# ---- Skills ----
heading("Skills")
for label, items in [
    ("Frontend", "React, Next.js, TypeScript, JavaScript, Redux, Context API, Tailwind CSS, "
                 "responsive and cross browser UI, reusable component libraries"),
    ("Real-time UI", "WebSockets, multiplayer state sync, live dashboards, messaging and "
                     "notifications, sub-50ms latency under sustained load"),
    ("APIs and data", "REST, GraphQL, OpenAPI and Swagger, webhooks, Stripe, Paystack, "
                      "KYC and AML flows"),
    ("Testing and quality", "Jest, unit and integration tests, strict TypeScript, code review "
                            "and release standards, GitHub Actions CI/CD, PostHog analytics"),
    ("Backend when it helps", "Node.js, NestJS, Express, PostgreSQL including row level security, "
                              "Supabase, MongoDB, Redis, Docker, AWS (EC2, S3, RDS, Lambda)"),
    ("Other languages", "Python, Java, C#, Rust, SQL, Solidity"),
]:
    story.append(Paragraph(f"<b>{label}:</b> {items}", body))

# ---- Experience ----
heading("Experience")

job("Chief Technology Officer and Engineer", "Usefleet", "Mar 2026 to Present, Remote", [
    "Own technical direction and lead engineering delivery, with the product surface and how it "
    "is built as my first concern.",
    "Set the frontend conventions the team works to: component boundaries, typing rules, Jest "
    "coverage and what has to pass before a release ships.",
    "Build and direct a small engineering team while staying hands-on in the day to day work.",
])

job("Principal Engineer", "Kinem Labs (BuildArena)", "Jun 2025 to Jun 2026, Remote", [
    "Built real-time multiplayer collaboration over WebSockets, keeping editor, canvas and output "
    "state in sync across people working in the same workspace.",
    "Delivered a live visualisation layer that redraws program structure and state relationships "
    "as users type.",
    "Owned the client architecture: workspace state, authenticated data fetching and the "
    "component patterns the rest of the app is built from.",
    "Kept the front end fast under constant updates, and shipped it through self hosted Docker "
    "infrastructure, GitHub Actions CI/CD and PostHog analytics.",
])

job("Senior Frontend Engineer", "Ridgeway, Texas, United States",
    "Jan 2026 to Jun 2026, Contract, Remote", [
        "Built the interface for an AI natural language to action system, turning what users typed "
        "into operations they could watch run.",
        "Built the payment screens, handling sensitive transaction flows carefully on the client "
        "and keeping confidential data out of places it should not be.",
        "Work shipped on this product processed over $300,000 in transaction volume.",
        "Covered the critical flows with Jest so payment paths could not regress quietly, and "
        "shipped through GitHub Actions CI/CD on AWS.",
    ])

job("Senior Frontend Engineer", "Timglobal, UK (Healthcare SaaS)",
    "Jul 2025 to Dec 2025, Contract, Remote", [
        "Shipped features across a live multi-tenant healthcare platform used by care "
        "coordinators, field staff and providers.",
        "Built staff scheduling screens covering shift allocation, availability and capacity, "
        "giving operational leads a clear view of workload.",
        "Built real-time messaging and notification delivery that stayed responsive under "
        "sustained concurrent load.",
        "Implemented workflow steps for care task assignment, handover and approval, replacing "
        "manual coordination between provider teams.",
        "Built permission aware screens where what each role can see and do follows the access "
        "rules, over sensitive personal data under UK care sector requirements.",
    ])

job("Senior Frontend Engineer and Tech Lead", "Cryptrapay",
    "Jul 2024 to Dec 2024, Contract, Remote", [
        "Founding engineer on a payments and settlement platform built from nothing, owning the "
        "interface end to end.",
        "Built React and TypeScript screens for multi-currency wallets, merchant onboarding and "
        "live transaction state.",
        "Reconciliation work kept ledger state consistent across systems and cut payment failures "
        "by 35%.",
    ])

job("Senior Frontend Engineer", "Allark", "Mar 2023 to Jun 2024, Contract, Remote", [
    "Built a type safe React and TypeScript frontend for complex real-time workflows, cutting "
    "runtime errors by 70%.",
    "Built the WebSocket layer behind it, carrying 1,000+ concurrent sessions at sub-50ms latency "
    "in production.",
    "Sole engineer on the platform, from the first screen through to production.",
    "Held 99.9% availability with fault tolerance across every external integration the UI "
    "depended on.",
])

job("Senior Frontend Engineer", "Neatio", "Jul 2022 to Jan 2023, Contract, Remote", [
    "Delivered developer documentation and integration work that cut third party integration "
    "time by 60%.",
    "Built the services and integrations behind it with retry and recovery logic, so the client "
    "stayed reliable when upstream systems did not.",
])

job("Senior Frontend Engineer and Tech Lead", "Blockride", "Sep 2021 to Aug 2022", [
    "Led delivery of a marketplace platform in a startup team, owning the frontend architecture.",
    "Built the React and Next.js frontend for high volume marketplace transactions.",
    "Cut fraudulent transactions by 90% with multi-step verification workflows and atomic "
    "transaction logic.",
])

# ---- Earlier ----
heading("Earlier Experience")
story.append(Paragraph(
    "<b>Frontend Engineer, Bole</b> (Apr 2020 to Feb 2021, Remote). React application with "
    "ethers.js integration for token swaps and liquidity management.", body))
story.append(Paragraph(
    "<b>Frontend Developer, Remax Real Estate (MaltaHomeSearch), Malta</b> (Jun 2019 to Mar "
    "2020, Remote). React and Next.js property platform serving 1,000+ monthly active users "
    "against 15+ REST endpoints.", body))

# ---- Selected work ----
heading("Selected Work")
for title, url, desc in [
    ("BuildArena", "buildarena.dev",
     "Collaborative build platform. Editor, canvas and output stay in sync across everyone in a "
     "workspace, with a visualisation layer that redraws program structure as you type."),
    ("Cryptrapay", "cryptrapay.com",
     "Payments and settlement platform built from zero, with multi-currency wallet screens, "
     "merchant onboarding and live transaction state."),
    ("Hookroast", "hookroast.com",
     "Pre-send deliverability platform for cold email: spam scoring on drafts, recipient "
     "verification, domain reputation and SPF, DKIM and DMARC checks."),
]:
    story.append(Paragraph(f"<b>{title}</b> ({url}). {desc}", body))

# ---- Education ----
heading("Education")
story.append(Paragraph(
    "<b>CS50x: Introduction to Computer Science</b>, Harvard University (edX)", body))
story.append(Paragraph(
    "<b>Doctor of Veterinary Medicine (DVM)</b>, University of Ibadan, Nigeria, 2017 to 2024",
    body))

doc = SimpleDocTemplate(
    "/home/coder/portfolio_website/public/Emmanuel-Akinroye-CV.pdf",
    pagesize=A4,
    leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=13 * mm,
    title="Emmanuel Akinroye, Senior Frontend Engineer, CV",
    author="Emmanuel Akinroye",
    subject="Curriculum Vitae",
)
doc.build(story)
print("built")
