import type { Metadata } from "next";
import Link from "next/link";
import HotLap from "@/components/games/HotLap";
import { profile } from "@/lib/data";
import { gameBySlug } from "@/lib/games/catalog";

const game = gameBySlug("hot-lap")!;
const description =
  "A 3D time-trial racer in your browser, built with three.js. Your best lap is saved in IndexedDB as a ghost car you race next time.";

export const metadata: Metadata = {
  title: `${game.title} | Games | ${profile.name}`,
  description,
  openGraph: {
    title: `${game.title} | ${profile.name}`,
    description,
    images: [{ url: game.image, width: 1600, height: 900, alt: `${game.title} game` }],
  },
};

export default function HotLapPage() {
  return (
    <main className="games-page">
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/games">Games</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{game.title}</span>
        </nav>
        <header className="games-head game-head">
          <h1>{game.title}</h1>
          <p className="lead">
            A time trial round a circuit at dusk. Beat the pace car, and your fastest lap is kept as
            a ghost, so the next time you visit you&apos;re racing yourself.
          </p>
        </header>

        <HotLap />

        <section className="build-notes" aria-labelledby="build-title">
          <div>
            <p className="section-eyebrow">Under the hood</p>
            <h2 id="build-title">How it&apos;s built</h2>
          </div>
          <ul>
            <li>
              The car is an arcade model: the body turns with the steering and grip drags the
              velocity round after it, so ease off the grip with the handbrake and it slides. The
              physics runs at a fixed 120 steps a second, apart from the drawing.
            </li>
            <li>
              The circuit is a closed curve through a dozen points, sampled every two metres. The
              pace car is the same physics driven by an autopilot that brakes for the tightest corner
              it could still stop for. Its lap is worked out in your browser when the page loads, and
              tests check it never leaves the tarmac.
            </li>
            <li>
              Your best lap is recorded twenty times a second and stored in IndexedDB as a ghost,
              along with every finished race. No account, no server, and clearing your site data
              wipes it.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
