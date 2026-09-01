import Image from "next/image";
import { ArrowRightIcon, MailIcon } from "@/components/Icons";
import { coreStack, heroStats, profile } from "@/lib/data";

export default function Hero() {
  return (
    <section className="hero" id="home">
      <div className="hero-bg" aria-hidden="true">
        <div className="hero-glow hero-glow-1" />
        <div className="hero-glow hero-glow-2" />
        <div className="hero-grid" />
      </div>

      <div className="wrap hero-inner">
        <div className="hero-copy">
          <p className="eyebrow">Hello, I&apos;m</p>
          <h1>
            {profile.name}
            <span className="h1-sub">{profile.role}</span>
          </h1>
          <p className="lead">{profile.tagline}</p>

          <div className="hero-actions">
            <a href="#projects" className="btn btn-primary">
              View My Work <span className="arrow"><ArrowRightIcon /></span>
            </a>
            <a href="#contact" className="btn btn-ghost">
              <MailIcon /> Contact Me
            </a>
          </div>

          <div className="hero-stats">
            {heroStats.map((stat) => (
              <div key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-photo">
          <div className="photo-frame">
            <Image
              src={profile.photo}
              alt={`Portrait of ${profile.name}`}
              width={640}
              height={640}
              priority
              sizes="(max-width: 880px) 330px, 400px"
            />
            <div className="photo-fade" aria-hidden="true" />
          </div>
          <div className="photo-badge">
            <span className="dot" /> Available for select engagements
          </div>
        </div>
      </div>

      <div className="wrap stack-strip">
        <p>Core stack in production</p>
        <ul>
          {coreStack.map((tech) => (
            <li key={tech}>{tech}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
