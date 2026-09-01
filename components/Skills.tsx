import { skillGroups } from "@/lib/data";

export default function Skills() {
  return (
    <section className="section skills" id="skills">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="section-eyebrow center">Toolkit</p>
          <h2 className="center">Technologies I Work With</h2>
          <span className="rule" />
        </div>

        <div className="skill-groups">
          {skillGroups.map((group) => (
            <div className="skill-group reveal" key={group.title}>
              <h4>{group.title}</h4>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
