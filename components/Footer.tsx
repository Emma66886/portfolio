import { GitHubIcon, LinkedInIcon, MailIcon } from "@/components/Icons";
import { profile } from "@/lib/data";

const socials = [
  { Icon: LinkedInIcon, href: profile.linkedin, name: "LinkedIn", external: true },
  { Icon: GitHubIcon, href: profile.github, name: "GitHub", external: true },
  { Icon: MailIcon, href: `mailto:${profile.email}`, name: "Email", external: false },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div className="brand">
          <span className="brand-name">
            {profile.firstName} <span className="accent">{profile.lastName}</span>
          </span>
          <span className="brand-role">{profile.role}</span>
        </div>

        <p className="copy">
          © {new Date().getFullYear()} {profile.name}. All rights reserved.
        </p>

        <div className="socials">
          {socials.map(({ Icon, href, name, external }) => (
            <a
              key={name}
              href={href}
              aria-label={name}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <Icon />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
