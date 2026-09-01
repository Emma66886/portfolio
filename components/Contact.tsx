import { profile } from "@/lib/data";

export default function Contact() {
  return (
    <section className="cta" id="contact">
      <div className="cta-bg" aria-hidden="true" />
      <div className="wrap cta-inner reveal">
        <h2>Let&apos;s Work Together</h2>
        <p>
          Have a platform to build or a codebase that needs a senior pair of hands? I&apos;d love to
          hear about it.
        </p>
        <div className="cta-actions">
          <a href={`mailto:${profile.email}`} className="btn btn-primary">
            Get In Touch
          </a>
          <a href={profile.cv} className="btn btn-ghost" download>
            Download CV
          </a>
        </div>
      </div>
    </section>
  );
}
