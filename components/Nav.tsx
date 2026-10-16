"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navLinks, profile } from "@/lib/data";

export default function Nav() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("#home");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Highlight the section currently filling the viewport.
  useEffect(() => {
    if (!onHome) return;
    const sections = navLinks
      .filter((l) => l.href.startsWith("#"))
      .map((l) => document.querySelector<HTMLElement>(l.href))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(`#${visible.target.id}`);
      },
      { threshold: [0.25, 0.5], rootMargin: "-88px 0px -45% 0px" }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [onHome]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href.startsWith("#") ? onHome && active === href : pathname.startsWith(href);

  return (
    <header className={`nav${scrolled ? " scrolled" : ""}`}>
      <div className="scroll-progress" aria-hidden="true">
        <span className="scroll-progress-fill" />
        <span className="scroll-progress-head" />
      </div>
      <div className="wrap nav-inner">
        <NavLink href="#home" onHome={onHome} className="brand" onClick={() => setOpen(false)}>
          <span className="brand-name">
            {profile.firstName} <span className="accent">{profile.lastName}</span>
          </span>
          <span className="brand-role">{profile.role}</span>
        </NavLink>

        <nav className={`nav-links${open ? " open" : ""}`}>
          {navLinks.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              onHome={onHome}
              className={isActive(link.href) ? "active" : undefined}
              // Pages are marked current; sections only get the highlight.
              aria-current={isActive(link.href) && !link.href.startsWith("#") ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            href="#contact"
            onHome={onHome}
            className="btn btn-primary btn-sm nav-cta"
            onClick={() => setOpen(false)}
          >
            Hire Me
          </NavLink>
        </nav>

        <button
          className={`nav-toggle${open ? " open" : ""}`}
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}

/**
 * Section links stay plain anchors on the homepage, so the jump is a native
 * smooth scroll. Off it they become `/#section` and, like other pages, go
 * through the router.
 */
function NavLink({
  href,
  onHome,
  ...props
}: { href: string; onHome: boolean } & Omit<React.ComponentProps<"a">, "href">) {
  if (href.startsWith("#") && onHome) return <a href={href} {...props} />;
  return <Link href={href.startsWith("#") ? `/${href}` : href} {...props} />;
}
