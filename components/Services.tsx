"use client";

import { useCallback, useEffect, useState } from "react";
import { capabilities } from "@/lib/data";

const send = (name: string, detail?: unknown) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

export default function Services() {
  // The globe replaces the list only once we know it can be drawn; the list is
  // what the server renders, and what anyone without WebGL keeps.
  const [globe, setGlobe] = useState(false);
  const [hovered, setHovered] = useState(-1);
  const [selected, setSelected] = useState(-1);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let supported = false;
    try {
      const probe = document.createElement("canvas");
      supported = !!(probe.getContext("webgl2") || probe.getContext("webgl"));
    } catch {
      supported = false;
    }
    if (!supported) return;

    window.__globeCount = capabilities.length;
    setGlobe(true);

    const onActive = (e: Event) => setSelected((e as CustomEvent).detail.index as number);
    const onHover = (e: Event) => setHovered((e as CustomEvent).detail.index as number);
    window.addEventListener("globe:active", onActive);
    window.addEventListener("globe:hover", onHover);
    return () => {
      window.removeEventListener("globe:active", onActive);
      window.removeEventListener("globe:hover", onHover);
      delete window.__globeCount;
    };
  }, []);

  const close = useCallback(() => {
    setSelected(-1);
    send("globe:clear");
  }, []);

  // Keyboard equivalent of spinning to a marker and clicking it.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const total = capabilities.length;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      send("globe:pick", { index: (Math.max(selected, 0) + 1) % total });
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      send("globe:pick", { index: (Math.max(selected, 0) - 1 + total) % total });
    } else if (e.key === "Escape") {
      close();
    }
  };

  const tip = hovered >= 0 ? capabilities[hovered] : null;
  const card = selected >= 0 ? capabilities[selected] : null;

  return (
    <section className="section services" id="services">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="section-eyebrow center">My Services</p>
          <h2 className="center">What I Can Do For You</h2>
          <span className="rule" />
        </div>
      </div>

      {globe ? (
        <div className="globe-section">
          <div
            className="globe-stage"
            tabIndex={0}
            role="group"
            aria-label={`What I can do: ${capabilities.length} capabilities pinned to a globe. Use the arrow keys to step through them.`}
            onKeyDown={onKeyDown}
          />

          <p className="globe-hint">
            Drag to spin the globe · Hover a marker to name it · Click one for the detail
          </p>

          {/* Rides above the pointer; the scene sets --x and --y. */}
          <div className={`globe-tip${tip ? " show" : ""}`} aria-hidden="true">
            {tip?.title}
          </div>

          {/* Pinned to its marker by the scene, and hidden when that marker
              turns to the back of the globe. */}
          <div className={`globe-card${card ? " show" : ""}`} aria-live="polite">
            {card && (
              <>
                <p className="globe-card-index">
                  <span>{String(selected + 1).padStart(2, "0")}</span> / {capabilities.length}
                </p>
                <h3>{card.title}</h3>
                <p className="globe-card-body">{card.body}</p>
                <button type="button" className="globe-card-close" onClick={close} aria-label="Close">
                  ×
                </button>
              </>
            )}
          </div>

          {/* The whole set, for screen readers and crawlers, which cannot see
              a canvas. */}
          <ul className="sr-only">
            {capabilities.map((capability) => (
              <li key={capability.title}>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="wrap">
          <ul className="capability-grid">
            {capabilities.map((capability) => (
              <li className="capability-card reveal" key={capability.title}>
                <h3>{capability.title}</h3>
                <p>{capability.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
