import { profile } from "@/lib/data";

export default function Contact() {
  return (
    <section className="cta" id="contact">
      <div className="cta-bg" aria-hidden="true">
        <span className="cta-orb cta-orb-1" />
        <span className="cta-orb cta-orb-2" />
      </div>
      <div className="wrap cta-inner reveal">
        <h2>Let&apos;s Work Together</h2>
        <p>
          Got a product whose front end needs a senior pair of hands? Tell me what you&apos;re
          building.
        </p>
        <div className="cta-actions">
          <a href={`mailto:${profile.email}`} className="btn btn-primary magnetic">
            Get In Touch
          </a>
          <a href={profile.cv} className="btn btn-ghost magnetic" download>
            Download CV
          </a>
        </div>
      </div>
    </section>
  );
}
