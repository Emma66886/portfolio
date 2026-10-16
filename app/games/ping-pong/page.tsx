import type { Metadata } from "next";
import Link from "next/link";
import PingPong from "@/components/games/PingPong";
import { profile } from "@/lib/data";
import { gameBySlug } from "@/lib/games/catalog";

const game = gameBySlug("ping-pong")!;
const description =
  "Play 3D table tennis against the CPU in your browser. Built with three.js, with your match history saved locally in IndexedDB.";

export const metadata: Metadata = {
  title: `${game.title} | Games | ${profile.name}`,
  description,
  openGraph: {
    title: `${game.title} | ${profile.name}`,
    description,
    images: [{ url: game.image, width: 1600, height: 900, alt: `${game.title} game` }],
  },
};

export default function PingPongPage() {
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
            First to 5 or 11, win by two, against a CPU on three levels. Catch the ball on the edge of
            your paddle to send it wide, and move as you hit it to add pace.
          </p>
        </header>

        <PingPong />

        <section className="build-notes" aria-labelledby="build-title">
          <div>
            <p className="section-eyebrow">Under the hood</p>
            <h2 id="build-title">How it&apos;s built</h2>
          </div>
          <ul>
            <li>
              Three.js draws the table, paddles and ball, with real-time shadows so you can judge the
              ball&apos;s height. Every shot is planned from the spot where it will bounce, which is
              how it always clears the net.
            </li>
            <li>
              The rules live in their own module and run at a fixed 120 steps a second, apart from
              the drawing, so the game plays the same on a 60Hz laptop and a 144Hz monitor. I tuned
              the three CPU levels by simulating thousands of matches against bots of different
              skill.
            </li>
            <li>
              Finished matches go into IndexedDB in your browser, along with your level and sound
              settings. No account, no server, and clearing your site data wipes it.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
