"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, CheckIcon, ExternalIcon } from "@/components/Icons";
import { profile, projects, type Project } from "@/lib/data";

/** Abstract CSS-drawn visual, used for projects with no live site to screenshot. */
function ProjectArt({ variant }: { variant: Project["variant"] }) {
  if (variant === "pv-1") {
    return (
      <div className="pv-art">
        <div className="pv-node">Editor</div>
        <div className="pv-line" />
        <div className="pv-node">Canvas</div>
        <div className="pv-line" />
        <div className="pv-node">Output</div>
      </div>
    );
  }

  if (variant === "pv-2") {
    return (
      <div className="pv-art pv-cal">
        {["40%", "70%", "55%", "88%", "62%", "34%"].map((height, i) => (
          <div
            className="pv-bar"
            key={i}
            style={{ "--h": height, "--i": i } as React.CSSProperties}
          />
        ))}
      </div>
    );
  }

  const rows =
    variant === "pv-4"
      ? ["SPF record", "DKIM signature", "DMARC policy"]
      : ["Merchant settlement", "Wallet · multi-currency", "Reconciliation"];

  return (
    <div className="pv-art pv-ledger">
      {rows.map((row, i) => (
        <div
          className="pv-row"
          key={row}
          style={{ "--i": i } as React.CSSProperties}
        >
          <span>{row}</span>
          <b>
            <CheckIcon />
          </b>
        </div>
      ))}
    </div>
  );
}

function ProjectCard({
  project,
  clone,
}: {
  project: Project;
  clone?: boolean;
}) {
  return (
    <article
      className="project spotlight"
      data-tilt="4"
      // Clones exist only to make the loop seamless: keep them out of the
      // accessibility tree and out of the tab order.
      {...(clone ? { "aria-hidden": true, inert: true } : {})}
    >
      <div
        className={`project-visual ${project.variant}${project.image ? " has-shot" : ""}`}
      >
        {project.image && (
          <Image
            className="pv-shot"
            src={project.image}
            alt={`Screenshot of the ${project.title} website`}
            width={1200}
            height={750}
            sizes="380px"
          />
        )}
        <div className="pv-chrome">
          <span />
          <span />
          <span />
        </div>
        {!project.image && <ProjectArt variant={project.variant} />}
        <p className="pv-caption">{project.caption}</p>
      </div>

      <div className="project-body">
        <h3>
          {project.url ? (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={clone ? -1 : undefined}
            >
              {project.title}
            </a>
          ) : (
            project.title
          )}
        </h3>
        <p>{project.body}</p>
        <p className="tech">{project.tech}</p>

        {project.url && (
          <a
            className="project-link"
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={clone ? -1 : undefined}
          >
            {project.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
            <ExternalIcon />
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * The ring itself is drawn by the background WebGL scene, which only needs an
 * empty box to line itself up with. Everything readable stays here in HTML:
 * the front panel's details, and a list of every project for screen readers
 * and crawlers, which never see the canvas.
 */
function GalleryStage({
  active,
  index,
  total,
}: {
  active: Project;
  index: number;
  total: number;
}) {
  return (
    <div className="gallery">
      <div className="gallery-stage" aria-hidden="true" />

      <div className="wrap gallery-readout">
        <p className="gallery-count">
          <span>{String(index + 1).padStart(2, "0")}</span> /{" "}
          {String(total).padStart(2, "0")}
        </p>
        <h3>{active.title}</h3>
        <p className="gallery-body">{active.body}</p>
        <p className="tech">{active.tech}</p>
        {active.url && (
          <a
            className="project-link"
            href={active.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {active.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
            <ExternalIcon />
          </a>
        )}
        <p className="gallery-hint">Drag the ring, or use the arrows</p>
      </div>

      <ul className="sr-only">
        {projects.map((project) => (
          <li key={project.title}>
            <h3>{project.title}</h3>
            <p>{project.body}</p>
            <p>{project.tech}</p>
            {project.url && (
              <a href={project.url} target="_blank" rel="noopener noreferrer">
                {project.title} website
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Projects() {
  // Server-rendered markup is always the plain grid, so the section works with
  // no JS, no WebGL or reduced motion. After mount we upgrade to the 3D ring,
  // or to the flat carousel where WebGL is unavailable.
  const [mode, setMode] = useState<"grid" | "carousel" | "gallery">("grid");
  const [activeIndex, setActiveIndex] = useState(0);
  const carousel = mode === "carousel";
  const trackRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef<HTMLDivElement>(null);
  const nudgeRef = useRef<(direction: number) => void>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let webgl = false;
    try {
      const probe = document.createElement("canvas");
      webgl = !!(probe.getContext("webgl2") || probe.getContext("webgl"));
    } catch {
      webgl = false;
    }

    if (!webgl) {
      setMode("carousel");
      return;
    }

    // Hand the scene what to draw; it picks this up on its next frame.
    window.__galleryItems = projects.map(({ title, caption, image }) => ({
      title,
      caption,
      image,
    }));
    setMode("gallery");

    const onActive = (e: Event) =>
      setActiveIndex((e as CustomEvent).detail.index as number);
    window.addEventListener("gallery:active", onActive);
    return () => {
      window.removeEventListener("gallery:active", onActive);
      delete window.__galleryItems;
    };
  }, []);

  const go = (direction: number) =>
    window.dispatchEvent(
      new CustomEvent("gallery:go", { detail: { direction } }),
    );

  useEffect(() => {
    const track = trackRef.current;
    const shifter = shiftRef.current;
    if (!carousel || !track || !shifter) return;

    // The endless drift is a CSS animation, so the compositor runs it and a
    // busy main thread (the WebGL background, image decoding, React) cannot
    // stutter it. JavaScript only sets an extra offset for drags and arrows,
    // which is also a plain transform the compositor can animate.
    const SPEED = 32; // px per second
    let half = 0;
    let shift = 0;
    let dragging = false;
    let lastX = 0;
    let dragDistance = 0;

    const applyShift = () => shifter.style.setProperty("--shift", `${shift}px`);

    const measure = () => {
      half = track.scrollWidth / 2;
      // Constant speed whatever the card count or viewport.
      if (half > 0)
        track.style.setProperty(
          "--marquee-duration",
          `${(half / SPEED).toFixed(2)}s`,
        );
    };
    measure();

    // Shifting by exactly one copy is invisible (the track holds two), so the
    // offset can be folded back to keep the number small.
    const normalize = () => {
      if (!half || dragging) return;
      const wrapped = shift % half;
      if (wrapped === shift) return;
      shift = wrapped;
      shifter.style.transition = "none";
      applyShift();
      void shifter.offsetWidth; // flush, so the next change animates again
      shifter.style.transition = "";
    };

    const nudge = (direction: number) => {
      const card = track.querySelector<HTMLElement>(".project");
      shift -= direction * ((card?.offsetWidth ?? 340) + 24);
      applyShift();
    };
    nudgeRef.current = nudge;

    const pause = () => track.classList.add("paused");
    const resume = () => track.classList.remove("paused");

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      dragDistance = 0;
      lastX = e.clientX;
      shifter.classList.add("dragging");
      pause();
      track.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      dragDistance += Math.abs(dx);
      shift += dx;
      applyShift();
    };
    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      shifter.classList.remove("dragging");
      track.releasePointerCapture(e.pointerId);
      resume();
      normalize();
    };
    // A drag that ends on a link must not also open it.
    const onClick = (e: MouseEvent) => {
      if (dragDistance > 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const observer = new ResizeObserver(measure);
    observer.observe(track);

    track.addEventListener("pointerenter", pause);
    track.addEventListener("pointerleave", resume);
    track.addEventListener("pointerdown", onDown);
    track.addEventListener("pointermove", onMove);
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    track.addEventListener("click", onClick, true);
    track.addEventListener("focusin", pause);
    track.addEventListener("focusout", resume);
    shifter.addEventListener("transitionend", normalize);

    return () => {
      observer.disconnect();
      nudgeRef.current = null;
      track.removeEventListener("pointerenter", pause);
      track.removeEventListener("pointerleave", resume);
      track.removeEventListener("pointerdown", onDown);
      track.removeEventListener("pointermove", onMove);
      track.removeEventListener("pointerup", endDrag);
      track.removeEventListener("pointercancel", endDrag);
      track.removeEventListener("click", onClick, true);
      track.removeEventListener("focusin", pause);
      track.removeEventListener("focusout", resume);
      shifter.removeEventListener("transitionend", normalize);
    };
  }, [carousel]);

  return (
    <section className="section projects" id="projects">
      <div className="wrap">
        <div className="section-head row reveal">
          <div>
            <p className="section-eyebrow">Featured Projects</p>
            <h2>Selected Projects</h2>
          </div>
          <div className="head-actions">
            {mode !== "grid" && (
              <div className="carousel-nav">
                <button
                  type="button"
                  aria-label="Previous project"
                  onClick={() =>
                    mode === "gallery" ? go(-1) : nudgeRef.current?.(-1)
                  }
                >
                  <ArrowRightIcon className="flip" />
                </button>
                <button
                  type="button"
                  aria-label="Next project"
                  onClick={() =>
                    mode === "gallery" ? go(1) : nudgeRef.current?.(1)
                  }
                >
                  <ArrowRightIcon />
                </button>
              </div>
            )}
            <a
              href={profile.github}
              target="_blank"
              rel="noopener noreferrer"
              className="link-arrow magnetic"
            >
              View GitHub{" "}
              <span className="arrow">
                <ArrowRightIcon />
              </span>
            </a>
          </div>
        </div>
      </div>

      {mode === "gallery" ? (
        <GalleryStage
          active={projects[activeIndex] ?? projects[0]}
          index={activeIndex}
          total={projects.length}
        />
      ) : carousel ? (
        <div
          className="carousel"
          aria-roledescription="carousel"
          aria-label="Selected Projects"
        >
          {/* No `reveal` class here: this subtree mounts after useReveal has
              collected its elements, so it would never be marked visible. */}
          <div className="carousel-shift" ref={shiftRef}>
            <div className="carousel-track" ref={trackRef}>
              {projects.map((project) => (
                <ProjectCard project={project} key={project.title} />
              ))}
              {projects.map((project) => (
                <ProjectCard
                  project={project}
                  key={`${project.title}-clone`}
                  clone
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="wrap">
          <div className="cards-projects">
            {projects.map((project) => (
              <div className="reveal" key={project.title}>
                <ProjectCard project={project} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
