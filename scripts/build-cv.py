"""Builds Emmanuel's frontend CV as a text-based (ATS readable) PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, KeepTogether, Table, TableStyle,
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
cert = ParagraphStyle("cert", fontName="Helvetica", fontSize=9.1, leading=12.2,
                      textColor=INK, spaceAfter=1.5)
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
story.append(Paragraph("Senior Full-Stack Engineer", role))
# Clickable in the PDF: a reader on screen should be one click from the work.
story.append(Paragraph(
    "kinemcodes@gmail.com &nbsp;|&nbsp; +234 810 474 2511 &nbsp;|&nbsp; "
    '<a href="https://kinemcodes.com" color="#A32639"><b>kinemcodes.com</b></a> &nbsp;|&nbsp; '
    '<a href="https://github.com/emma66886">github.com/emma66886</a> &nbsp;|&nbsp; '
    '<a href="https://www.linkedin.com/in/emmanuelakinroye/">linkedin.com/in/emmanuelakinroye</a>',
    contact))
story.append(Spacer(1, 3))

# ---- Summary ----
heading("Summary")
story.append(Paragraph(
    "Senior full-stack engineer with 7+ years shipping production SaaS in TypeScript, React and "
    "Node.js. Recent work spans a UK healthcare platform covering scheduling, multi-tenant access "
    "control and audit logging over sensitive personal data, a payments and settlement platform "
    "built from nothing, and real-time collaboration infrastructure. I own architecture end to "
    "end and stay hands-on from schema design through to CI/CD and production monitoring. I work "
    "directly with founders on live codebases, fully remote across UK, EU and US time zones.", body))

# ---- Skills ----
heading("Skills")
for label, items in [
    ("Languages", "TypeScript, JavaScript, Python, Node.js, Java, C#, Rust, SQL, Solidity"),
    ("Frontend", "React, Next.js, Redux, Context API, Tailwind CSS, responsive and cross browser "
                 "UI, real-time and collaborative interfaces"),
    ("Backend and serverless", "Node.js, NestJS, Express, ASP.NET Core, REST and GraphQL APIs, "
                               "serverless functions, event-driven architecture, background jobs, "
                               "microservices"),
    ("Databases and modelling", "PostgreSQL (advanced queries, indexing, partitioning, row level "
                                "security), Supabase, MongoDB, Redis, SQL Server, multi-tenant "
                                "schema design"),
    ("Platform and SaaS", "Multi-tenant architecture, RBAC and permission systems, workflow and "
                          "approval engines, scheduling and capacity allocation, audit logging"),
    ("APIs and integrations", "OpenAPI and Swagger, webhooks, Stripe, Paystack, KYC and AML "
                              "flows, merchant settlement and reconciliation"),
    ("Testing and delivery", "Jest, unit and integration tests, strict TypeScript, code review "
                             "and release standards, GitHub Actions CI/CD, PostHog analytics"),
    ("Cloud and DevOps", "AWS (EC2, S3, RDS, Lambda), Docker, Docker Compose, DigitalOcean, "
                         "monitoring and structured logging"),
]:
    story.append(Paragraph(f"<b>{label}:</b> {items}", body))

# ---- Experience ----
heading("Experience")

job("Chief Technology Officer and Full-Stack Engineer", "Usefleet", "Mar 2026 to Present, Remote", [
    "Own technical direction and lead engineering delivery, with the product surface and how it "
    "is built as my first concern.",
    "Define system architecture, module boundaries and the delivery roadmap, and set the code "
    "review, Jest coverage and release standards the team works to.",
    "Build and direct a small engineering team while staying hands-on in the day to day work.",
])

job("Principal Engineer", "Kinem Labs (BuildArena)", "Jun 2025 to Jun 2026, Remote", [
    "Built real-time multiplayer collaboration over WebSockets, keeping editor, canvas and output "
    "state in sync across people working in the same workspace.",
    "Delivered a live visualisation layer that redraws program structure and state relationships "
    "as users type.",
    "Architected the full platform: project and workspace state, build orchestration and "
    "authenticated API surfaces.",
    "Ran the whole lifecycle: self hosted Docker infrastructure (Dokploy, Traefik), GitHub "
    "Actions CI/CD and PostHog analytics.",
])

job("Senior Full-Stack Engineer", "Ridgeway, Texas, United States",
    "Jan 2026 to Jun 2026, Contract, Remote", [
        "Architected and built an AI natural language to action system, translating user input "
        "into operations executed across the stack.",
        "Implemented a secure payment system with confidentiality guarantees, handling sensitive "
        "transaction flows safely across backend and frontend.",
        "Work shipped on this product processed over $300,000 in transaction volume.",
        "Covered the critical flows with Jest so payment paths could not regress quietly, and "
        "shipped through GitHub Actions CI/CD on AWS.",
    ])

job("Senior Full-Stack Engineer", "Timglobal, UK (Healthcare SaaS)",
    "Jul 2025 to Dec 2025, Contract, Remote", [
        "Shipped features across a live multi-tenant healthcare platform used by care "
        "coordinators, field staff and providers.",
        "Built staff scheduling screens covering shift allocation, availability and capacity, "
        "giving operational leads a clear view of workload.",
        "Built real-time messaging and notification delivery that stayed responsive under "
        "sustained concurrent load.",
        "Implemented workflow steps for care task assignment, handover and approval, replacing "
        "manual coordination between provider teams.",
        "Modelled multi-tenant data isolation and role based access control in PostgreSQL, with "
        "audit logging and compliance reporting meeting UK care sector requirements.",
    ])

job("Senior Full-Stack Engineer and Tech Lead", "Cryptrapay",
    "Jul 2024 to Dec 2024, Contract, Remote", [
        "Founding engineer on a payments and settlement platform built from nothing, owning "
        "backend, frontend and infrastructure.",
        "Built a Node.js and NestJS backend for multi-currency wallet management, merchant "
        "onboarding and real-time reconciliation, with React and TypeScript screens on top.",
        "Reconciliation work kept ledger state consistent across systems and cut payment failures "
        "by 35%.",
    ])

job("Senior Backend Engineer", "Allark", "Mar 2023 to Jun 2024, Contract, Remote", [
    "Built a type safe React and TypeScript frontend for complex real-time workflows, cutting "
    "runtime errors by 70%.",
    "Engineered the WebSocket layer carrying 1,000+ concurrent sessions at sub-50ms latency in "
    "production.",
    "Sole engineer on the platform, responsible for architecture and end to end delivery from "
    "zero to production.",
    "Held 99.9% availability through circuit breaker patterns and fault tolerance across every "
    "external integration.",
])

job("Full-Stack Engineer", "Neatio", "Jul 2022 to Jan 2023, Contract, Remote", [
    "Delivered scalable API infrastructure and developer documentation that cut third party "
    "integration time by 60%.",
    "Built backend services and integrations with retry and recovery logic, ensuring reliable "
    "processing across systems.",
])

job("Full-Stack Engineer and Tech Lead", "Blockride", "Sep 2021 to Aug 2022", [
    "Led full-stack delivery of a marketplace platform, owning frontend and backend architecture "
    "in a startup team.",
    "Built a React and Next.js frontend on a Node.js backend supporting high volume marketplace "
    "transactions.",
    "Cut fraudulent transactions by 90% with multi-step verification workflows and atomic "
    "transaction logic.",
])

# ---- Earlier ----
heading("Earlier Experience")
story.append(Paragraph(
    "<b>Full-Stack Engineer, Bole</b> (Apr 2020 to Feb 2021, Remote). React and Node.js "
    "application with ethers.js integration for token swaps and liquidity management.", body))
story.append(Paragraph(
    "<b>Full-Stack Developer, Remax Real Estate (MaltaHomeSearch), Malta</b> (Jun 2019 to Mar "
    "2020, Remote). React, Next.js and Node.js property platform serving 1,000+ monthly active "
    "users across 15+ REST endpoints on PostgreSQL.", body))

# ---- Selected Projects ----
heading("Selected Projects")
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

# ---- Certifications ----
_cert_heading = [
    Paragraph("CERTIFICATIONS", section),
    HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#D8D2CE"),
               spaceBefore=1, spaceAfter=4),
]
CERTIFICATIONS = [
    ("React: The Complete Guide (incl. Next.js, Redux)", "Udemy", "Oct 2026"),
    ("Python", "SoloLearn", "Oct 2026"),
    ("JavaScript", "freeCodeCamp", "Aug 2026"),
    ("Certified Full-Stack Developer Curriculum", "freeCodeCamp", "2026"),
    ("Backend Development and APIs", "freeCodeCamp", "2026"),
    ("Relational Databases", "freeCodeCamp", "2026"),
    ("Frontend Development Libraries", "freeCodeCamp", "2026"),
    ("Responsive Web Design", "freeCodeCamp", "2026"),
    ("Python Certification", "freeCodeCamp", "2026"),
    ("Rust", "Udemy", "Oct 2025"),
    ("JavaScript", "SoloLearn", "Feb 2021"),
    ("CSS", "SoloLearn", "Aug 2020"),
    ("HTML", "SoloLearn", "Jul 2020"),
]

# Two columns: thirteen of these down a single column pushes the CV onto a
# third page for no good reason.
_cells = [Paragraph(f"<b>{t}</b><br/>{i} · {d}", cert) for t, i, d in CERTIFICATIONS]
_half = (len(_cells) + 1) // 2
_rows = []
for left, right in zip(_cells[:_half], _cells[_half:] + [Paragraph("", cert)]):
    _rows.append([left, right])
_table = Table(_rows, colWidths=[88 * mm, 88 * mm], hAlign="LEFT")
_table.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 1),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
# Kept whole: splitting a two column list across a page break reads badly.
story.append(KeepTogether(_cert_heading + [_table]))

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
