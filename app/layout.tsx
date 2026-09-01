import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { profile } from "@/lib/data";
import "./globals.css";

// Self-hosted so builds never depend on reaching fonts.gstatic.com.
const jakarta = localFont({
  src: "./fonts/PlusJakartaSans-Variable.woff2",
  weight: "400 800",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const fraunces = localFont({
  src: "./fonts/Fraunces-Variable.woff2",
  weight: "600 700",
  style: "normal",
  variable: "--font-serif",
  display: "swap",
});

const description =
  "Emmanuel Akinroye is a senior full-stack engineer with 7+ years shipping production SaaS with TypeScript, React, Node.js and PostgreSQL, covering multi-tenant platforms, real-time systems and payments infrastructure.";

// Server-only: metadata is rendered on the server, so this needs no NEXT_PUBLIC_ prefix.
const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${profile.name} | ${profile.role}`,
  description,
  keywords: [
    "Emmanuel Akinroye", "full-stack engineer", "TypeScript", "React",
    "Next.js", "Node.js", "NestJS", "PostgreSQL", "SaaS", "remote engineer",
  ],
  authors: [{ name: profile.name, url: profile.linkedin }],
  openGraph: {
    title: `${profile.name} | ${profile.role}`,
    description,
    type: "profile",
    images: [{ url: profile.photo, width: 640, height: 640, alt: profile.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${profile.name} | ${profile.role}`,
    description,
    images: [profile.photo],
  },
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
          "<rect width='100' height='100' rx='22' fill='%23A32639'/>" +
          "<text y='71' x='50' text-anchor='middle' font-size='60' font-family='Georgia,serif' fill='%23F5EBE6'>E</text></svg>",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#140E0D",
  colorScheme: "dark",
};

/**
 * Scroll-reveal is progressive enhancement: the hidden state only applies once
 * this script confirms JS is running. If the bundle fails, hydration breaks, or
 * the hook never mounts, the page stays fully readable instead of showing a
 * blank space below the hero. The timeout is the second safety net: it drops
 * the hidden state if `useReveal` has not claimed the page within 5s.
 */
const revealBootstrap = `(function(){var d=document.documentElement;d.classList.add("js-reveal");
setTimeout(function(){if(!d.hasAttribute("data-reveal-ready"))d.classList.remove("js-reveal");},5000);})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${fraunces.variable}`}
      // The bootstrap script below adds `js-reveal` to <html> before React
      // hydrates, so the server and client markup differ by that one class.
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: revealBootstrap }} />
        {children}
      </body>
    </html>
  );
}
