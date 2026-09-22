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

    // One delegated listener rather than one per element, so cards that appear
    // after this hook runs (the carousel clones, for instance) behave the same
    // as the ones present at mount.
    let hoveredTilt: HTMLElement | null = null;
    let hoveredMagnet: HTMLElement | null = null;

    const clearTilt = (el: HTMLElement) => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.classList.remove("tilting");
    };
    const clearMagnet = (el: HTMLElement) => {
      el.style.setProperty("--tx", "0px");
      el.style.setProperty("--ty", "0px");
    };

    // Pointer events fire faster than the screen refreshes, and each of these
    // effects measures layout. Batch them into one frame so a fast mouse cannot
    // force layout dozens of times between paints.
    let pointerFrame = 0;
    let pending: PointerEvent | null = null;

    const onPointerMove = (e: PointerEvent) => {
      pending = e;
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        const event = pending;
        pending = null;
        if (event) applyPointer(event);
      });
    };

    const applyPointer = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;

      // ---- Spotlight ----
      const spot = target?.closest<HTMLElement>(".spotlight");
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
        spot.style.setProperty("--my", `${e.clientY - r.top}px`);
      }

      // ---- Tilt ----
      const tilt = target?.closest<HTMLElement>("[data-tilt]") ?? null;
      if (hoveredTilt && hoveredTilt !== tilt) clearTilt(hoveredTilt);
      hoveredTilt = tilt;
      if (tilt) {
        const max = Number(tilt.dataset.tilt) || 6;
        const r = tilt.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
        tilt.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
        tilt.classList.add("tilting");
      }

      // ---- Magnetic buttons ----
      const magnet = target?.closest<HTMLElement>(".magnetic") ?? null;
      if (hoveredMagnet && hoveredMagnet !== magnet) clearMagnet(hoveredMagnet);
      hoveredMagnet = magnet;
      if (magnet) {
        const r = magnet.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        magnet.style.setProperty("--tx", `${(x * 0.22).toFixed(1)}px`);
        magnet.style.setProperty("--ty", `${(y * 0.3).toFixed(1)}px`);
      }
    };

    const onPointerOut = () => {
      if (hoveredTilt) clearTilt(hoveredTilt);
      if (hoveredMagnet) clearMagnet(hoveredMagnet);
      hoveredTilt = hoveredMagnet = null;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerOut);
    cleanups.push(() => {
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerOut);
      cancelAnimationFrame(pointerFrame);
      onPointerOut();
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);
}
