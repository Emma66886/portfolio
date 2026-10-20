import type { Metadata } from "next";
import Link from "next/link";
import Whot from "@/components/games/Whot";
import { profile } from "@/lib/data";
import { gameBySlug } from "@/lib/games/catalog";
import { SPECIALS } from "@/lib/games/whot/engine";

const game = gameBySlug("whot")!;
const description =
  "Play Whot, the Nigerian card game, on a 3D table in your browser: against the CPU, with friends on one screen, or online from a link. Built with three.js and WebRTC.";

export const metadata: Metadata = {
  title: `${game.title} | Games | ${profile.name}`,
  description,
  openGraph: {
    title: `${game.title} | ${profile.name}`,
    description,
    images: [{ url: game.image, width: 1600, height: 900, alt: `${game.title} game` }],
  },
};

export default function WhotPage() {
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
            The card game half of Nigeria grew up on. Follow the shape or the number, hit people with
            pick two, and call &quot;check up&quot; when your hand is empty. Play the CPU, pass one
            screen round, or send a friend a link.
          </p>
        </header>

        <Whot />

        <section className="build-notes rules-notes" aria-labelledby="rules-title">
          <div>
            <p className="section-eyebrow">House rules</p>
            <h2 id="rules-title">How it plays</h2>
          </div>
          <ul>
            <li>
              Everyone gets five cards (or seven) and one card starts the pile. On your turn, play a card
              that matches the top card&apos;s shape or number. If you can&apos;t, or you&apos;d rather
              not, go to market and pick one, which ends your turn.
            </li>
            <li>
              {Object.entries(SPECIALS)
                .map(([n, s]) => `${n} is ${s.name.toLowerCase()}: ${s.does.toLowerCase()}.`)
                .join(" ")}
            </li>
            <li>
              A pick two or pick three can be passed on with another card of the same number, and the
              pick grows as it goes. First to play their last card wins. If every card is in someone&apos;s
              hand, the hands are counted (stars count double) and the lowest total wins.
            </li>
          </ul>
        </section>

        <section className="build-notes" aria-labelledby="build-title">
          <div>
            <p className="section-eyebrow">Under the hood</p>
            <h2 id="build-title">How it&apos;s built</h2>
          </div>
          <ul>
            <li>
              Online play is peer to peer over WebRTC. The host&apos;s browser is the referee: it holds
              the deck, checks every move, and sends each player only their own cards, so nobody can peek
              at a hand from their dev tools. A free broker introduces the two browsers; after that the
              site has no server in the loop.
            </li>
            <li>
              The rules are one pure TypeScript module, so the same code runs the CPU, the shared-screen
              game and the online host. The hard CPU plays fair by dealing out the cards it can&apos;t see
              at random and playing each option to the end a few hundred times, then picking what wins
              most.
            </li>
            <li>
              Three.js draws the table and every card, with the faces painted into one texture at load.
              Drop out of an online game, or reload the page, and you rejoin with your hand intact.
              Finished games are kept in IndexedDB in your browser.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
