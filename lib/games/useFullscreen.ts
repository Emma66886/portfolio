"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type WebkitDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

const fullscreenElement = () => document.fullscreenElement ?? (document as WebkitDocument).webkitFullscreenElement ?? null;

/**
 * Full screen for a game's stage. Uses the Fullscreen API where there is one,
 * and otherwise (iPhone Safari only allows it for video) makes the stage fill
 * the window instead. `toggle` is stable, so game loops can hold on to it.
 */
export function useFullscreen(target: RefObject<HTMLElement | null>, options: { landscape?: boolean } = {}) {
  const [native, setNative] = useState(false);
  const [filled, setFilled] = useState(false);
  const filledRef = useRef(false);
  const landscape = useRef(options.landscape);

  useEffect(() => {
    const onChange = () => {
      const on = !!target.current && fullscreenElement() === target.current;
      setNative(on);
      if (!on) (screen.orientation as LockableOrientation | undefined)?.unlock?.();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [target]);

  const setFill = useCallback((on: boolean) => {
    filledRef.current = on;
    setFilled(on);
    // The page underneath shouldn't scroll while the stage covers it.
    document.documentElement.style.overflow = on ? "hidden" : "";
  }, []);

  // Escape leaves the fill-the-window mode, as it would real full screen.
  useEffect(() => {
    if (!filled) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFill(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [filled, setFill]);

  const toggle = useCallback(async () => {
    const el = target.current as WebkitElement | null;
    if (!el) return;
    const doc = document as WebkitDocument;
    if (fullscreenElement()) {
      await (document.exitFullscreen ? document.exitFullscreen() : doc.webkitExitFullscreen?.());
      return;
    }
    if (filledRef.current) {
      setFill(false);
      return;
    }
    const request = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (request) {
      let entered = false;
      try {
        await request();
        entered = true;
      } catch {
        // Refused (or not allowed here): fall back to filling the window.
      }
      if (entered) {
        // Racing reads better sideways. Only phones support this, and only in full screen.
        if (landscape.current) {
          try {
            await (screen.orientation as LockableOrientation | undefined)?.lock?.("landscape");
          } catch {
            // Not supported on this device.
          }
        }
        return;
      }
    }
    setFill(true);
  }, [target, setFill]);

  return { fullscreen: native || filled, filled, toggle };
}
