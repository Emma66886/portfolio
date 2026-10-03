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
            I&apos;m a senior full-stack engineer with over seven years building production
            software that real businesses run on: multi-tenant SaaS, real-time systems and payments
            infrastructure, from the database through the API to the screen.
          </p>
          <p className="body">
            I work directly with founders on live codebases, own architecture end to end, and stay
            hands-on from schema design through to CI/CD and production monitoring. Recent work
            includes a multiplayer collaborative editor, a UK healthcare platform and a payments
            product I built from nothing. I work fully remote with teams anywhere. Today I&apos;m
            CTO at Usefleet, still writing code most days.
          </p>

          <ul className="checks">
            {highlights.map((item) => (
              <li key={item}>
                <span className="check-badge"><CheckIcon /></span>
                {item}
              </li>
            ))}
          </ul>

          <a href={profile.cv} className="btn btn-primary magnetic" download>
            Download CV <ArrowDownIcon />
          </a>
        </div>

        <aside className="info-card spotlight reveal">
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
