import type { Metadata } from "next";
import Link from "next/link";
import Blockfall from "@/components/games/Blockfall";
import { profile } from "@/lib/data";
import { gameBySlug } from "@/lib/games/catalog";

const game = gameBySlug("blockfall")!;
const description =
  "A 3D falling-block puzzle in your browser, built with three.js, with every game you finish saved locally in IndexedDB.";

export const metadata: Metadata = {
  title: `${game.title} | Games | ${profile.name}`,
  description,
  openGraph: {
    title: `${game.title} | ${profile.name}`,
    description,
    images: [{ url: game.image, width: 1600, height: 900, alt: `${game.title} game` }],
  },
};

export default function BlockfallPage() {
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
            The falling-block puzzle you already know, drawn in 3D. Fill a row to clear it, clear four
            at once for a quad, and slot T pieces in with a last-second turn for T-spins.
          </p>
        </header>

        <Blockfall />

        <section className="build-notes" aria-labelledby="build-title">
          <div>
            <p className="section-eyebrow">Under the hood</p>
            <h2 id="build-title">How it&apos;s built</h2>
          </div>
          <ul>
            <li>
              The rules follow the modern standard: a shuffled bag of all seven pieces, hold, a ghost
              piece, wall kicks when a turn is blocked, and a short grace period before a piece locks.
              The rules are tested on their own, including a few thousand pieces played by the same
              bot that runs the demo behind the menu.
            </li>
            <li>
              Three.js draws every block as a lit, rounded cube with real shadows on the back of the
              well. Cleared rows burst into tumbling cubes, and the camera leans toward wherever
              you&apos;re working.
            </li>
            <li>
              Finished games go into IndexedDB in your browser, along with your starting level and
              sound setting. No account, no server, and clearing your site data wipes it.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
