"use client";

import { useEffect, useState } from "react";
import { skillGroups } from "@/lib/data";

/** Tells the background scene which cluster to light, or -1 for all of them. */
const focusGroup = (index: number | null) =>
  window.dispatchEvent(new CustomEvent("skills:focus", { detail: { group: index } }));

export default function Skills() {
  // The constellation stage only appears once we know it can be drawn,
  // otherwise it would leave an empty gap above the list.
  const [stage, setStage] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      const probe = document.createElement("canvas");
      if (probe.getContext("webgl2") || probe.getContext("webgl")) {
        window.__skillGroups = skillGroups.map(({ title, items }) => ({ title, items: [...items] }));
        setStage(true);
      }
    } catch {
      /* no WebGL: the list below is the whole section */
    }
  }, []);

  // Leave nothing dimmed behind if this unmounts mid-hover.
  useEffect(
    () => () => {
      focusGroup(null);
    },
    []
  );

  return (
    <section className="section skills" id="skills">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="section-eyebrow center">Toolkit</p>
          <h2 className="center">Technologies I Work With</h2>
          <span className="rule" />
        </div>

        {stage && <div className="skills-stage" aria-hidden="true" />}

        <div className="skill-groups">
          {skillGroups.map((group, index) => (
            <div
              className="skill-group spotlight reveal"
              key={group.title}
              onPointerEnter={stage ? () => focusGroup(index) : undefined}
              onPointerLeave={stage ? () => focusGroup(null) : undefined}
            >
              <h4>{group.title}</h4>
              <ul>
                {group.items.map((item, i) => (
                  <li key={item} style={{ "--i": i } as React.CSSProperties}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
