import { ArrowRightIcon, CheckIcon, ExternalIcon } from "@/components/Icons";
import { profile, projects } from "@/lib/data";

type Variant = "pv-1" | "pv-2" | "pv-3" | "pv-4";

/** Each project card gets an abstract, CSS-drawn visual instead of a screenshot. */
function ProjectArt({ variant }: { variant: Variant }) {
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
          <div className="pv-bar" key={i} style={{ "--h": height, "--i": i } as React.CSSProperties} />
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
        <div className="pv-row" key={row} style={{ "--i": i } as React.CSSProperties}>
          <span>{row}</span>
          <b><CheckIcon /></b>
        </div>
      ))}
    </div>
  );
}

export default function Projects() {
  return (
    <section className="section projects" id="projects">
      <div className="wrap">
        <div className="section-head row reveal">
          <div>
            <p className="section-eyebrow">Featured Projects</p>
            <h2>Selected Work</h2>
          </div>
          <a href={profile.github} target="_blank" rel="noopener noreferrer" className="link-arrow magnetic">
            View GitHub <span className="arrow"><ArrowRightIcon /></span>
          </a>
        </div>

        <div className="cards-projects">
          {projects.map((project) => (
            <article className="project spotlight reveal" key={project.title} data-tilt="4">
              <div className={`project-visual ${project.variant}`}>
                <div className="pv-chrome"><span /><span /><span /></div>
                <ProjectArt variant={project.variant} />
                <p className="pv-caption">{project.caption}</p>
              </div>

              <div className="project-body">
                <h3>
                  {project.url ? (
                    <a href={project.url} target="_blank" rel="noopener noreferrer">
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
                  >
                    {project.url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    <ExternalIcon />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
