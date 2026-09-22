import { BoltIcon, CardIcon, CodeIcon, LayersIcon } from "@/components/Icons";
import { services, type ServiceIcon } from "@/lib/data";

const icons: Record<ServiceIcon, React.ComponentType> = {
  code: CodeIcon,
  layers: LayersIcon,
  bolt: BoltIcon,
  card: CardIcon,
};

export default function Services() {
  return (
    <section className="section services" id="services">
      <div className="wrap">
        <div className="section-head reveal">
          <p className="section-eyebrow center">My Services</p>
          <h2 className="center">What I Can Do For You</h2>
          <span className="rule" />
        </div>

        <div className="cards-4">
          {services.map((service) => {
            const Icon = icons[service.icon];
            return (
              <article className="card spotlight reveal" key={service.title}>
                <div className="card-ico">
                  <Icon />
                </div>
                <h3>{service.title}</h3>
                <p>{service.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
