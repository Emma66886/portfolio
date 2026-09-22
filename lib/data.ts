export const profile = {
  name: "Emmanuel Akinroye",
  firstName: "Emmanuel",
  lastName: "Akinroye",
  role: "Senior Frontend Engineer",
  email: "kinemcodes@gmail.com",
  phone: "+234 810 474 2511",
  phoneHref: "+2348104742511",
  github: "https://github.com/emma66886",
  linkedin: "https://www.linkedin.com/in/emmanuelakinroye/",
  cv: "/Emmanuel-Akinroye-CV.pdf",
  photo: "/emmanuel.jpg",
  location: "Remote, based in Nigeria, working worldwide",
  current: "CTO & Engineer, Usefleet",
  education: "CS50x, Harvard (edX) · DVM, University of Ibadan",
  tagline:
    "I build the front end of products people use all day: React and Next.js in TypeScript, real-time collaborative screens, dashboards and payment flows. Fully remote, working with teams in any time zone.",
} as const;

export const heroStats = [
  { value: "7+", label: "Years building UIs" },
  { value: "1,000+", label: "Concurrent live sessions" },
  { value: "70%", label: "Fewer runtime errors" },
];

export const coreStack = [
  "TypeScript", "React", "Next.js", "Redux",
  "Tailwind CSS", "Jest", "WebSockets", "Node.js",
];

export const highlights = [
  "7+ years shipping production React",
  "Real-time and collaborative interfaces",
  "Principal and founding engineer roles",
  "Fully remote across UK, EU and US hours",
];

export type ServiceIcon = "code" | "layers" | "bolt" | "card";

export const services: { icon: ServiceIcon; title: string; body: string }[] = [
  {
    icon: "code",
    title: "Frontend Product Engineering",
    body: "React and Next.js in TypeScript, from the first component through to production. I work directly on live codebases with founders and small teams.",
  },
  {
    icon: "layers",
    title: "Component & State Architecture",
    body: "Typed components other people can reuse, state that stays predictable as features pile up, and Jest tests so the pieces that matter keep working.",
  },
  {
    icon: "bolt",
    title: "Real-Time Interfaces",
    body: "Collaborative editors, live dashboards and messaging over WebSockets, holding shared state in sync across 1,000+ concurrent sessions at sub-50ms latency.",
  },
  {
    icon: "card",
    title: "Payments & Data-Heavy Screens",
    body: "Checkout and wallet flows, scheduling and capacity views, admin dashboards. The screens where a mistake costs someone money.",
  },
];

export const skillGroups = [
  {
    title: "Core",
    items: ["TypeScript", "JavaScript", "React", "Next.js", "HTML", "CSS"],
  },
  {
    title: "UI & Styling",
    items: ["Tailwind CSS", "Responsive layouts", "Component libraries", "Cross-browser UI"],
  },
  {
    title: "State & Data",
    items: ["Redux", "Context API", "REST APIs", "GraphQL", "WebSockets"],
  },
  {
    title: "Real-Time & Collaboration",
    items: ["Multiplayer state sync", "Live dashboards", "Messaging & notifications", "Sub-50ms latency"],
  },
  {
    title: "Testing & Quality",
    items: ["Jest", "Unit & integration tests", "Strict TypeScript", "Code review standards", "GitHub Actions CI/CD"],
  },
  {
    title: "Backend When It Helps",
    items: ["Node.js", "NestJS", "PostgreSQL", "Supabase", "Docker", "AWS"],
  },
];

export const experience = [
  {
    date: "Mar 2026 - Present · Remote",
    title: "Chief Technology Officer & Engineer",
    org: "Usefleet",
    url: "https://www.usefleet.xyz/",
    points: [
      "Own technical direction and lead engineering delivery, with the product surface and how it is built as my first concern.",
      "Set the frontend conventions the team works to: component boundaries, typing rules, Jest coverage and what has to pass before a release ships.",
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
      "Owned the client architecture: workspace state, authenticated data fetching and the component patterns the rest of the app is built from.",
      "Kept the front end fast under constant updates, and shipped it through GitHub Actions CI/CD with PostHog to see how it was actually used.",
    ],
  },
  {
    date: "Jan 2026 - Jun 2026 · Contract, Remote",
    title: "Senior Frontend Engineer",
    org: "Ridgeway, Texas, United States",
    points: [
      "Built the interface for an AI natural-language-to-action system, turning what users typed into operations they could watch run.",
      "Built the payment screens, handling sensitive transaction flows carefully on the client and keeping confidential data out of places it should not be.",
      "Work shipped on this product processed over $300,000 in transaction volume.",
      "Covered the critical flows with Jest so payment paths could not regress quietly.",
    ],
  },
  {
    date: "Jul 2025 - Dec 2025 · Contract, Remote",
    title: "Senior Frontend Engineer",
    org: "Timglobal, UK (Healthcare SaaS)",
    url: "https://timglobal.uk",
    points: [
      "Shipped features across a live multi-tenant healthcare platform used by care coordinators, field staff and providers.",
      "Built staff scheduling screens covering shift allocation, availability and capacity, giving operational leads a clear view of workload.",
      "Built real-time messaging and notifications that stayed responsive under sustained concurrent load.",
      "Built permission-aware screens where what each role can see and do follows the access rules, over sensitive personal data under UK care-sector requirements.",
    ],
  },
  {
    date: "Jul 2024 - Dec 2024 · Contract, Remote",
    title: "Senior Frontend Engineer & Tech Lead",
    org: "Cryptrapay",
    points: [
      "Founding engineer on a payments and settlement platform built from nothing, owning the interface end to end.",
      "Built React and TypeScript screens for multi-currency wallets, merchant onboarding and live transaction state.",
      "Reconciliation work kept ledger state consistent across systems and cut payment failures by 35%.",
    ],
  },
  {
    date: "Mar 2023 - Jun 2024 · Contract, Remote",
    title: "Senior Frontend Engineer",
    org: "Allark",
    points: [
      "Built a type-safe React and TypeScript frontend for complex real-time workflows, cutting runtime errors by 70%.",
      "Built the WebSocket layer behind it, carrying 1,000+ concurrent sessions at sub-50ms latency.",
      "Sole engineer on the platform, from the first screen through to production.",
      "Held 99.9% availability with fault tolerance across every external integration the UI depended on.",
    ],
  },
  {
    date: "2019 - 2023 · Remote",
    title: "Earlier Frontend Roles",
    org: "Neatio · Blockride · Bole · Remax Real Estate (Malta)",
    points: [
      "Led frontend delivery of a marketplace platform in a startup team, with verification flows that cut fraudulent transactions by 90%.",
      "Built a React and Next.js property platform serving 1,000+ monthly active users.",
      "Delivered API documentation and integration work that cut third-party integration time by 60%.",
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
