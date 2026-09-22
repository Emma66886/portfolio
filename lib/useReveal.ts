"use client";

import { useEffect } from "react";

/**
 * Adds `.visible` to every `.reveal` element once it has scrolled past the
 * trigger line. Uses a scroll check rather than IntersectionObserver alone:
 * a fast flick or an anchor jump can carry a section across the viewport
 * between two animation frames, and an observer never fires for it, leaving
 * that section invisible for good.
 */
export function useReveal() {
  useEffect(() => {
    // Tells the bootstrap script in layout.tsx that the hook is alive, so it
    // does not fall back to showing everything.
    document.documentElement.setAttribute("data-reveal-ready", "");

    let pending = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!pending.length) return;

    const revealAll = () => {
      pending.forEach((el) => el.classList.add("visible"));
      pending = [];
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealAll();
      return;
    }

    let frame = 0;

    const check = () => {
      frame = 0;
      const trigger = window.innerHeight - 60;

      pending = pending.filter((el) => {
        if (el.getBoundingClientRect().top >= trigger) return true;

        // Stagger cards that come into view together.
        const siblings = Array.from(el.parentElement?.children ?? []);
        el.style.animationDelay = `${Math.min(siblings.indexOf(el), 5) * 90}ms`;
        el.classList.add("visible");
        return false;
      });

      if (!pending.length) teardown();
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };

    function teardown() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    check();

    return teardown;
  }, []);
}
