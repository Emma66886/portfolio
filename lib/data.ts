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
  location: "Remote, working worldwide",
  current: "CTO & Full-Stack Engineer, Usefleet",
  education: "CS50x, Harvard (edX) · DVM, University of Ibadan",
  tagline:
    "I build production SaaS end to end: React and Next.js interfaces on Node.js, NestJS and PostgreSQL, covering multi-tenant platforms, real-time systems and payments. Fully remote, working with teams in any time zone.",
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
  "Principal and founding engineer roles",
  "Fully remote across UK, EU and US hours",
];

export type Capability = { title: string; body: string };

/**
 * What Emmanuel can do, pinned around the globe in the Services section. Each
 * one is drawn from the stack and the work in `experience` below; keep them
 * that way rather than adding aspirations.
 */
export const capabilities: Capability[] = [
  { title: "React architecture", body: "Component boundaries, data flow and state that still make sense once the product has grown." },
  { title: "Next.js App Router", body: "Routing, rendering and deploys, with server and client components split where it helps." },
  { title: "TypeScript end to end", body: "One set of types across the client, the API and the database layer." },
  { title: "Component libraries", body: "Typed building blocks the rest of the team can pick up without asking how they work." },
  { title: "State management", body: "Redux where it earns its place, Context and local state where it does not." },
  { title: "Responsive layouts", body: "One build that holds up from a phone to an ultrawide monitor." },
  { title: "Data-heavy screens", body: "Tables, filters and dashboards over large sets, without the page stuttering." },
  { title: "Forms and validation", body: "Long forms where server errors land back on the field that caused them." },
  { title: "API design", body: "REST and GraphQL surfaces shaped around what the product actually does." },
  { title: "Node.js services", body: "Express and NestJS services carrying real traffic, not prototypes." },
  { title: "Real-time systems", body: "WebSocket infrastructure holding 1,000+ concurrent sessions at sub-50ms latency." },
  { title: "Multiplayer collaboration", body: "Editor, canvas and output state shared across everyone in the same workspace." },
  { title: "Live dashboards", body: "Numbers, charts and status that keep updating under sustained load." },
  { title: "Messaging and notifications", body: "Delivery between users that stays responsive with many people connected." },
  { title: "Multi-tenant architecture", body: "One platform serving many customers, with their data properly isolated." },
  { title: "Authentication and RBAC", body: "Roles and permissions enforced on the server, reflected honestly in the UI." },
  { title: "Row-level security", body: "PostgreSQL policies so the database refuses what the application forgets." },
  { title: "Audit logging", body: "A defensible record over sensitive data, built for the people who have to report on it." },
  { title: "Database modelling", body: "Schemas, indexing and partitioning that stay quick as the rows pile up." },
  { title: "Caching with Redis", body: "Hot paths kept fast, and invalidated when the data behind them changes." },
  { title: "Background jobs", body: "Queued and scheduled work with retries, so slow tasks stay off the request path." },
  { title: "Payments integration", body: "Stripe and Paystack flows, from checkout through to settlement." },
  { title: "Multi-currency wallets", body: "Balances, conversions and live transaction state that agree with the ledger." },
  { title: "Reconciliation", body: "Settlement that keeps ledger state consistent across systems, cutting failures." },
  { title: "KYC and AML flows", body: "Verification steps and the states a user can actually recover from." },
  { title: "Third-party integration", body: "Webhooks and external APIs with retry and recovery when they misbehave." },
  { title: "Scheduling and capacity", body: "Shift allocation, availability and workload for the people who run operations." },
  { title: "Workflow automation", body: "Assignment, handover and approval steps replacing manual coordination." },
  { title: "Jest test suites", body: "Unit and integration cover over the paths that cost money when they break." },
  { title: "Code review standards", body: "What gets reviewed, what blocks a release, and why the team agreed to it." },
  { title: "CI/CD pipelines", body: "GitHub Actions running the checks and the deploys from the first commit." },
  { title: "Docker and self-hosting", body: "Containers, reverse proxies and infrastructure that stays up." },
  { title: "AWS infrastructure", body: "EC2, S3, RDS and Lambda, provisioned and deployed to from CI." },
  { title: "Monitoring and logging", body: "Structured logs, product analytics and enough signal to debug production." },
];

export const skillGroups = [
  {
    title: "Languages",
    items: ["TypeScript", "JavaScript", "Python", "Java", "C#", "Rust", "SQL", "Solidity"],
  },
  {
    title: "Frontend",
    items: ["React", "Next.js", "Redux", "Context API", "Tailwind CSS", "Responsive UI"],
  },
  {
    title: "Backend & Serverless",
    items: ["Node.js", "NestJS", "Express", "ASP.NET Core", "REST", "GraphQL", "Event-driven"],
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
    title: "Testing & Delivery",
    items: ["Jest", "Code review standards", "GitHub Actions CI/CD", "PostHog analytics"],
  },
  {
    title: "Cloud & DevOps",
    items: ["AWS (EC2, S3, RDS, Lambda)", "Docker", "DigitalOcean", "Monitoring"],
  },
];

export type Certification = { title: string; issuer: string; date: string };

/**
 * Newest first. Where only a year was supplied, only a year is shown rather
 * than inventing a month.
 */
export const certifications: Certification[] = [
  { title: "React: The Complete Guide (incl. Next.js, Redux)", issuer: "Udemy", date: "Oct 2026" },
  { title: "Python", issuer: "SoloLearn", date: "Oct 2026" },
  { title: "JavaScript", issuer: "freeCodeCamp", date: "Aug 2026" },
  { title: "Certified Full-Stack Developer Curriculum", issuer: "freeCodeCamp", date: "2026" },
  { title: "Backend Development and APIs", issuer: "freeCodeCamp", date: "2026" },
  { title: "Relational Databases", issuer: "freeCodeCamp", date: "2026" },
  { title: "Frontend Development Libraries", issuer: "freeCodeCamp", date: "2026" },
  { title: "Responsive Web Design", issuer: "freeCodeCamp", date: "2026" },
  { title: "Python Certification", issuer: "freeCodeCamp", date: "2026" },
  { title: "Rust", issuer: "Udemy", date: "Oct 2025" },
  { title: "JavaScript", issuer: "SoloLearn", date: "Feb 2021" },
  { title: "CSS", issuer: "SoloLearn", date: "Aug 2020" },
  { title: "HTML", issuer: "SoloLearn", date: "Jul 2020" },
];

export const experience = [
  {
    date: "Mar 2026 - Present · Remote",
    title: "Chief Technology Officer & Full-Stack Engineer",
    org: "Usefleet",
    url: "https://www.usefleet.xyz/",
    points: [
      "Own technical direction and architecture, leading engineering delivery end to end across backend, product and integration surfaces.",
      "Define system architecture, module boundaries and the delivery roadmap, and set the code review, Jest coverage and release standards the team works to.",
      "Build and direct a small engineering team while staying hands-on in the day-to-day work.",
    ],
  },
  {
    date: "Jun 2025 - Jun 2026 · Remote",
    title: "Principal Engineer",
    org: "Kinem Labs (BuildArena)",
    url: "https://kinemlabs.com",
    points: [
      "Built real-time multiplayer collaboration over WebSockets, keeping editor, canvas and output state in sync across people working in the same workspace.",
      "Delivered a live visualisation layer that redraws program structure and state relationships as users type.",
      "Architected the full platform: project and workspace state, build orchestration and authenticated API surfaces.",
      "Ran the whole lifecycle: self-hosted Docker infrastructure (Dokploy, Traefik), GitHub Actions CI/CD and PostHog analytics.",
    ],
  },
  {
    date: "Jan 2026 - Jun 2026 · Contract, Remote",
    title: "Senior Full-Stack Engineer",
    org: "Ridgeway, Texas, United States",
    points: [
      "Built an AI natural-language-to-action system, translating what users typed into operations executed across the stack.",
      "Implemented a secure payment system with confidentiality guarantees across backend and frontend.",
      "Work shipped on this product processed over $300,000 in transaction volume.",
      "Covered the critical flows with Jest, and provisioned AWS EC2 infrastructure with end-to-end GitHub Actions CI/CD.",
    ],
  },
  {
    date: "Jul 2025 - Dec 2025 · Contract, Remote",
    title: "Senior Full-Stack Engineer",
    org: "Timglobal, UK (Healthcare SaaS)",
    url: "https://timglobal.uk",
    points: [
      "Shipped features across a live multi-tenant healthcare platform used by care coordinators, field staff and providers.",
      "Built staff scheduling screens covering shift allocation, availability and capacity, giving operational leads a clear view of workload.",
      "Built real-time messaging and notifications that stayed responsive under sustained concurrent load.",
      "Modelled multi-tenant data isolation and role-based access control in PostgreSQL, with audit logging and compliance reporting meeting UK care-sector requirements.",
    ],
  },
  {
    date: "Jul 2024 - Dec 2024 · Contract, Remote",
    title: "Senior Full-Stack Engineer & Tech Lead",
    org: "Cryptrapay",
    points: [
      "Founding engineer on a payments and settlement platform built from nothing, owning backend, frontend and infrastructure.",
      "Built a Node.js and NestJS backend for multi-currency wallets, merchant onboarding and real-time reconciliation, with React and TypeScript screens on top.",
      "Reconciliation work kept ledger state consistent across systems and cut payment failures by 35%.",
    ],
  },
  {
    date: "Mar 2023 - Jun 2024 · Contract, Remote",
    title: "Senior Backend Engineer",
    org: "Allark",
    points: [
      "Built a type-safe React and TypeScript frontend for complex real-time workflows, cutting runtime errors by 70%.",
      "Engineered the WebSocket layer carrying 1,000+ concurrent sessions at sub-50ms latency.",
      "Sole engineer on the platform, responsible for architecture and end-to-end delivery from zero to production.",
      "Held 99.9% availability through circuit breakers and fault tolerance across every external integration.",
    ],
  },
  {
    date: "2019 - 2023 · Remote",
    title: "Earlier Engineering Roles",
    org: "Neatio · Blockride · Bole · Remax Real Estate (Malta)",
    points: [
      "Led full-stack delivery of a marketplace platform in a startup team, cutting fraudulent transactions by 90% with multi-step verification and atomic transaction logic.",
      "Built a React, Next.js and Node.js property platform serving 1,000+ monthly active users on PostgreSQL.",
      "Delivered API infrastructure and documentation that cut third-party integration time by 60%.",
    ],
  },
];

export type Project = {
  variant: "pv-1" | "pv-2" | "pv-3" | "pv-4";
  title: string;
  url?: string;
  body: string;
  tech: string;
  caption: string;
  /** Screenshot of the live site. Omitted where there is no live site to show. */
  image?: string;
};

export const projects: Project[] = [
  {
    variant: "pv-1",
    title: "BuildArena",
    url: "https://buildarena.dev",
    body: "Collaborative build platform. Editor, canvas and output stay in sync across everyone in a workspace, with a visualisation layer that redraws program structure as you type.",
    tech: "TypeScript / React / WebSockets / Docker",
    caption: "Real-time multiplayer workspace",
    image: "/projects/buildarena.webp",
  },
  {
    variant: "pv-2",
    title: "Healthcare SaaS Platform",
    url: "https://timglobal.uk",
    body: "Multi-tenant care platform. Scheduling and capacity screens for coordinators and field staff, real-time messaging, and reporting over sensitive personal data.",
    tech: "Next.js / TypeScript / NestJS / PostgreSQL",
    caption: "Shift allocation & capacity",
    image: "/projects/timglobal.webp",
  },
  {
    variant: "pv-4",
    title: "Hookroast",
    url: "https://hookroast.com",
    body:
      "Pre-send deliverability platform for cold email: spam scoring on draft content, recipient verification, domain reputation and blocklist monitoring, and SPF, DKIM and DMARC record checks.",
    tech: "Next.js / TypeScript / DNS & SMTP / Webhooks",
    caption: "Authentication and reputation checks",
    image: "/projects/hookroast.webp",
  },
  {
    variant: "pv-3",
    title: "MyBizRunner",
    // No `url` yet: mybizrunner.com currently serves a domain parking page.
    body: "Customer conversations from WhatsApp, Telegram, Instagram and email pulled into one inbox, with automations that reply, qualify leads and follow up on their own. Threads stay per channel, with search across the lot and a record of every automated reply.",
    tech: "WhatsApp / Telegram / Instagram / Email integrations",
    caption: "One inbox across every channel",
    image: "/projects/mybizrunner.webp",
  },
  {
    variant: "pv-3",
    title: "Cryptrapay",
    url: "https://cryptrapay.com",
    body: "Payments and settlement platform built from zero. Multi-currency wallet screens, merchant onboarding and live transaction state, with reconciliation that cut payment failures by 35%.",
    tech: "React / TypeScript / Node.js / Stripe & Paystack",
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
