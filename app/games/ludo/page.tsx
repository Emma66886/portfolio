import type { Metadata } from "next";
import Link from "next/link";
import Ludo from "@/components/games/Ludo";
import { profile } from "@/lib/data";
import { gameBySlug } from "@/lib/games/catalog";

const game = gameBySlug("ludo")!;
const description =
  "Play Naija-rules Ludo with two dice on a 3D board in your browser: against the CPU, with friends on one screen, or online from a link. Built with three.js and WebRTC.";

export const metadata: Metadata = {
  title: `${game.title} | Games | ${profile.name}`,
  description,
  openGraph: {
    title: `${game.title} | ${profile.name}`,
    description,
    images: [{ url: game.image, width: 1600, height: 900, alt: `${game.title} game` }],
  },
};

export default function LudoPage() {
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
            The board game every family argues over, played with two dice the Naija way. One on one,
            each side plays two houses; with three or four, it&apos;s a house each. Play the CPU, pass
            one screen round, or send friends a link.
          </p>
        </header>

        <Ludo />

        <section className="build-notes rules-notes" aria-labelledby="rules-title">
          <div>
            <p className="section-eyebrow">House rules</p>
            <h2 id="rules-title">How it plays</h2>
          </div>
          <ul>
            <li>
              You roll two dice and play each one on its own, on any of your tokens, or both on the same
              one. A six brings a token out of its house. Double six, and you roll again once you&apos;ve
              played them.
            </li>
            <li>
              Land on someone else&apos;s token and it goes back to its house, and yours goes straight
              home. Start squares and stars are safe. A die nothing can use is lost.
            </li>
            <li>
              Tokens go once round the board and up their own coloured column, and getting home takes
              the exact number. One on one you play the two houses on your side, eight tokens. First to
              bring every token home wins.
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
              Online games are peer to peer over WebRTC, up to four players from one link. The host&apos;s
              browser rolls the dice and checks every move, so a guest can&apos;t fake a double six. If you drop
              out or reload, you&apos;re back in your seat with the board as it was.
            </li>
            <li>
              The rules know nothing about the board: a token is just a number of steps from its start.
              The board turns those into squares, with one colour&apos;s path drawn out and turned a
              quarter for each of the others. The CPU plans both dice together, trying every way to play
              the roll, and the hard one also plays out all 21 rolls its opponent could answer with.
            </li>
            <li>
              Three.js draws the board, the turned pawns and two dice that tumble to land on the numbers
              actually rolled. The board turns so your houses are always nearest you.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
