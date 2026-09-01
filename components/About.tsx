import {
  ArrowDownIcon,
  BriefcaseIcon,
  CapIcon,
  CheckIcon,
  MailIcon,
  PhoneIcon,
  PinIcon,
} from "@/components/Icons";
import { highlights, profile } from "@/lib/data";

const details = [
  { Icon: PinIcon, label: "Location", value: profile.location },
  { Icon: MailIcon, label: "Email", value: profile.email, href: `mailto:${profile.email}` },
  { Icon: PhoneIcon, label: "Phone", value: profile.phone, href: `tel:${profile.phoneHref}` },
  { Icon: BriefcaseIcon, label: "Currently", value: profile.current },
  { Icon: CapIcon, label: "Education", value: profile.education },
];

export default function About() {
  return (
    <section className="section about" id="about">
      <div className="wrap about-grid">
        <div className="reveal">
          <p className="section-eyebrow">About Me</p>
          <h2>
            Building Systems That
            <br />
            Carry Real Weight
          </h2>
          <p className="body">
            I&apos;m a senior full-stack engineer with over seven years building production software
            that real businesses run on. Recent work is healthcare SaaS for a UK care provider,
            covering scheduling, multi-tenant access control and audit logging over sensitive
            personal data, alongside payments platforms and real-time collaboration
            infrastructure.
          </p>
          <p className="body">
            I work directly with founders on live codebases, own architecture end to end, and stay
            hands-on from schema design through to CI/CD and production monitoring. I work fully
            remote with teams anywhere in the world. Today I serve as CTO at Usefleet, where I lead
            engineering delivery while still writing the code.
          </p>

          <ul className="checks">
            {highlights.map((item) => (
              <li key={item}>
                <span className="check-badge"><CheckIcon /></span>
                {item}
              </li>
            ))}
          </ul>

          <a href={profile.cv} className="btn btn-primary" download>
            Download CV <ArrowDownIcon />
          </a>
        </div>

        <aside className="info-card reveal">
          {details.map(({ Icon, label, value, href }) => (
            <div className="info-row" key={label}>
              <span className="info-ico"><Icon /></span>
              <div>
                <h4>{label}</h4>
                <p>{href ? <a href={href}>{value}</a> : value}</p>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
