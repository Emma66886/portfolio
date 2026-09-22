export const profile = {
  name: "Emmanuel Akinroye",
  firstName: "Emmanuel",
  lastName: "Akinroye",
  role: "Senior Full-Stack Engineer",
  email: "kinemcodes@gmail.com",
  phone: "+234 810 474 2511",
  phoneHref: "+2348104742511",
  github: "https://github.com/emma66886",
  linkedin: "https://www.linkedin.com/in/emmanuelakinroye/",
  cv: "/Emmanuel-Akinroye-CV.pdf",
  photo: "/emmanuel.jpg",
  location: "Remote, based in Nigeria, working worldwide",
  current: "CTO & Full-Stack Engineer, Usefleet",
  education: "CS50x, Harvard (edX) · DVM, University of Ibadan",
  tagline:
    "I design and ship complex production SaaS: multi-tenant platforms, real-time systems and payments infrastructure, built with TypeScript, React, Node.js and PostgreSQL. Fully remote, working with teams in any time zone.",
} as const;

export const heroStats = [
  { value: "7+", label: "Years shipping" },
  { value: "$300k+", label: "Payments processed" },
  { value: "99.9%", label: "Uptime delivered" },
];

export const coreStack = [
  "TypeScript", "React", "Next.js", "Node.js",
  "NestJS", "PostgreSQL", "AWS", "Docker",
];

export const highlights = [
  "7+ years full-stack engineering",
  "Multi-tenant SaaS architecture",
  "Founding & principal engineer roles",
  "Fully remote, clients worldwide",
];

export type ServiceIcon = "code" | "layers" | "bolt" | "card";

export const services: { icon: ServiceIcon; title: string; body: string }[] = [
  {
    icon: "code",
    title: "Full-Stack Product Engineering",
    body: "End-to-end delivery from schema to UI: React and Next.js frontends on Node.js, NestJS and PostgreSQL backends, shipped to production.",
  },
  {
    icon: "layers",
    title: "Multi-Tenant SaaS Architecture",
    body: "Tenant isolation, RBAC and permission systems, row-level security, workflow engines and audit logging over sensitive data.",
  },
  {
    icon: "bolt",
    title: "Real-Time Systems",
    body: "WebSocket infrastructure for collaborative editors, live dashboards and messaging, running 1,000+ concurrent sessions at sub-50ms latency.",
  },
  {
    icon: "card",
    title: "Payments & Integrations",
    body: "Stripe and Paystack flows, multi-currency wallets, settlement reconciliation, KYC/AML and reliable third-party API integration.",
  },
];

export const skillGroups = [
  {
    title: "Languages",
    items: ["TypeScript", "JavaScript", "Python", "Java", "C#", "Rust", "SQL", "Solidity"],
  },
  {
    title: "Frontend",
    items: ["React", "Next.js", "Redux", "Tailwind CSS", "WebSockets", "Responsive UI"],
  },
  {
    title: "Backend & Serverless",
    items: ["Node.js", "NestJS", "Express", "ASP.NET Core", "GraphQL", "Microservices", "Event-driven"],
  },
  {
    title: "Data",
    items: ["PostgreSQL", "Supabase", "MongoDB", "Redis", "SQL Server", "Partitioning & RLS"],
  },
  {
    title: "Security & Auth",
    items: ["RBAC", "Row-level security", "Audit logging", "Compliance", "Sensitive data"],
  },
  {
    title: "Cloud & DevOps",
    items: ["AWS (EC2, S3, RDS, Lambda)", "Docker", "GitHub Actions", "DigitalOcean", "Monitoring"],
  },
];

export const experience = [
  {
    date: "Mar 2026 - Present · Remote",
    title: "Chief Technology Officer & Full-Stack Engineer",
    org: "Usefleet",
    url: "https://www.usefleet.xyz/",
    points: [
      "Own technical direction and architecture, leading engineering delivery end to end across backend, product and integration surfaces.",
      "Define system architecture, module boundaries and delivery roadmap; set code review, release and testing standards.",
      "Build and direct a small engineering team while staying hands-on in day-to-day delivery.",
    ],
  },
  {
    date: "Jun 2025 - Jun 2026 · Remote",
    title: "Principal Engineer",
    org: "Kinem Labs (BuildArena)",
    url: "https://kinemlabs.com",
    points: [
      "Architected a full production platform covering project and workspace state, build orchestration and authenticated API surfaces.",
      "Built real-time multiplayer collaboration over WebSockets, synchronising editor, canvas and output state across concurrent users.",
      "Delivered a live visualisation layer rendering program structure and state relationships in real time as users type.",
      "Ran the full lifecycle: self-hosted Docker infrastructure (Dokploy, Traefik), GitHub Actions CI/CD and PostHog analytics.",
    ],
  },
  {
    date: "Jan 2026 - Jun 2026 · Contract, Remote",
    title: "Senior Full-Stack Engineer",
    org: "Ridgeway, Texas, United States",
    points: [
      "Built an AI-powered natural-language-to-action system translating user input into executed operations across the stack.",
      "Implemented a secure payment system with confidentiality guarantees across backend and frontend.",
      "Provisioned AWS EC2 infrastructure with end-to-end GitHub Actions CI/CD.",
      "Delivered a solution that processed over $300,000 in production transaction volume.",
    ],
  },
  {
    date: "Jul 2025 - Dec 2025 · Contract, Remote",
    title: "Senior Full-Stack Engineer",
    org: "Timglobal, UK (Healthcare SaaS)",
    url: "https://timglobal.uk",
    points: [
      "Delivered features across a live multi-tenant healthcare platform serving care coordinators, field staff and providers.",
      "Designed staff management and scheduling covering shift allocation, availability and capacity across teams and roles.",
      "Modelled multi-tenant data isolation and RBAC in PostgreSQL over sensitive operational data.",
      "Built audit logging and compliance reporting meeting UK care-sector data-handling requirements.",
    ],
  },
  {
    date: "Jul 2024 - Dec 2024 · Contract, Remote",
    title: "Senior Full-Stack Engineer & Tech Lead",
    org: "Cryptrapay",
    points: [
      "Led architecture and delivery of a production payments and settlement platform from zero as founding engineer.",
      "Built a Node.js and NestJS backend for multi-currency wallets, merchant onboarding and real-time reconciliation.",
      "Settlement reconciliation kept ledger state consistent across systems, reducing payment failures by 35%.",
    ],
  },
  {
    date: "Mar 2023 - Jun 2024 · Contract, Remote",
    title: "Senior Backend Engineer",
    org: "Allark",
    points: [
      "Sole engineer responsible for architecture and end-to-end delivery, shipping from zero to production.",
      "Engineered a WebSocket layer supporting 1,000+ concurrent sessions at sub-50ms latency.",
      "Achieved 99.9% availability through circuit breakers and fault tolerance across external integrations.",
      "Built a type-safe React frontend for complex real-time workflows, reducing runtime errors by 70%.",
    ],
  },
  {
    date: "2019 - 2023 · Remote",
    title: "Earlier Engineering Roles",
    org: "Neatio · Blockride · Bole · Remax Real Estate (Malta)",
    points: [
      "Led full-stack delivery of a marketplace platform, cutting fraudulent transactions by 90% with multi-step verification and atomic transaction logic.",
      "Delivered API infrastructure and documentation that reduced third-party integration time by 60%.",
      "Built a React, Next.js and Node.js property platform serving 1,000+ monthly active users on PostgreSQL.",
    ],
  },
];

export const projects = [
  {
    variant: "pv-1" as const,
    title: "BuildArena",
    url: "https://buildarena.dev",
    body: "Collaborative build platform with WebSocket state sync across concurrent users and a live visualisation layer rendering program structure as you type.",
    tech: "TypeScript / WebSockets / Docker / PostgreSQL",
    caption: "Real-time multiplayer workspace",
  },
  {
    variant: "pv-2" as const,
    title: "Healthcare SaaS Platform",
    url: "https://timglobal.uk",
    body: "Multi-tenant care platform with scheduling, RBAC, real-time messaging and compliance-facing audit logging over sensitive personal data.",
    tech: "Next.js / NestJS / PostgreSQL RLS / Redis",
    caption: "Shift allocation & capacity",
  },
  {
    variant: "pv-4" as const,
    title: "Hookroast",
    url: "https://hookroast.com",
    body:
      "Pre-send deliverability platform for cold email: spam scoring on draft content, recipient verification, domain reputation and blocklist monitoring, and SPF, DKIM and DMARC record checks.",
    tech: "Email infrastructure / DNS / SMTP / Webhooks",
    caption: "Authentication and reputation checks",
  },
  {
    variant: "pv-3" as const,
    title: "Cryptrapay",
    url:"https://cryptrapay.com",
    body: "Payments and settlement platform built from zero, with multi-currency wallets, merchant onboarding and reconciliation that cut payment failures by 35%.",
    tech: "Node.js / NestJS / React / Stripe & Paystack",
    caption: "Ledger consistency across systems",
  },
];

export const navLinks = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#services", label: "Services" },
  { href: "#experience", label: "Experience" },
  { href: "#projects", label: "Projects" },
  { href: "#contact", label: "Contact" },
];
