"use client";

import { useEffect } from "react";

/**
 * Page-wide pointer and scroll effects, driven through CSS custom properties so
 * the styling stays in globals.css:
 * - `--scroll` on <html>: page scroll progress (0 to 1) for the progress bar
 * - `--tl-progress` on `.timeline`: how far the timeline line has filled
 * - `--mx` / `--my` on `.spotlight`: pointer position for the hover glow
 * - `[data-tilt]`: 3D tilt toward the pointer
 * - `.magnetic`: element drifts toward the pointer
 * Pointer effects only run for a fine pointer (mouse / trackpad) and
 * everything except the progress bar is skipped under reduced motion.
 */
export function useInteractions() {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const cleanups: (() => void)[] = [];

    // ---- Scroll progress + timeline fill ----
    const timeline = document.querySelector<HTMLElement>(".timeline");
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const max = root.scrollHeight - window.innerHeight;
        root.style.setProperty("--scroll", String(max > 0 ? window.scrollY / max : 0));

        if (timeline && !reduced) {
          const rect = timeline.getBoundingClientRect();
          const line = window.innerHeight * 0.6;
          const progress = Math.min(Math.max((line - rect.top) / rect.height, 0), 1);
          timeline.style.setProperty("--tl-progress", progress.toFixed(3));
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    });

    if (reduced || !finePointer) {
      return () => cleanups.forEach((fn) => fn());
    }
    root.classList.add("fx-pointer");
    cleanups.push(() => root.classList.remove("fx-pointer"));

    const on = <K extends keyof HTMLElementEventMap>(
      el: HTMLElement,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void
    ) => {
      el.addEventListener(type, fn);
      cleanups.push(() => el.removeEventListener(type, fn));
    };

    // ---- Spotlight ----
    document.querySelectorAll<HTMLElement>(".spotlight").forEach((el) => {
      on(el, "pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    });

    // ---- Tilt ----
    document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
      const max = Number(el.dataset.tilt) || 6;
      on(el, "pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
        el.classList.add("tilting");
      });
      on(el, "pointerleave", () => {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
        el.classList.remove("tilting");
      });
    });

    // ---- Magnetic buttons ----
    document.querySelectorAll<HTMLElement>(".magnetic").forEach((el) => {
      on(el, "pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.setProperty("--tx", `${(x * 0.22).toFixed(1)}px`);
        el.style.setProperty("--ty", `${(y * 0.3).toFixed(1)}px`);
      });
      on(el, "pointerleave", () => {
        el.style.setProperty("--tx", "0px");
        el.style.setProperty("--ty", "0px");
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);
}
