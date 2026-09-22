import { ExternalIcon } from "@/components/Icons";
import { experience } from "@/lib/data";

export default function Experience() {
  return (
    <section className="section experience" id="experience">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="section-eyebrow center">Career</p>
          <h2 className="center">Where I&apos;ve Shipped</h2>
          <span className="rule" />
        </div>

        <div className="timeline">
          {experience.map((role) => (
            <article className="tl-item reveal" key={`${role.org}-${role.date}`}>
              <div className="tl-dot" />
              <div className="tl-body spotlight">
                <span className="tl-date">{role.date}</span>
                <h3>{role.title}</h3>
                <p className="tl-org">
                  {"url" in role && role.url ? (
                    <a href={role.url} target="_blank" rel="noopener noreferrer">
                      {role.org}
                      <ExternalIcon />
                    </a>
                  ) : (
                    role.org
                  )}
                </p>
                <ul>
                  {role.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
