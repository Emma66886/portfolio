import type { Metadata } from "next";
import Link from "next/link";
import Ludo from "@/components/games/Ludo";
import { profile } from "@/lib/data";
import { gameBySlug } from "@/lib/games/catalog";

const game = gameBySlug("ludo")!;
const description =
  "Play Ludo on a 3D board in your browser: against the CPU, with friends on one screen, or online from a link. Built with three.js and WebRTC.";

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
            The board game every family argues over. Two to four players, against the CPU, round one
            screen, or online with friends who just open a link you send them.
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
              Roll a six to bring a token out of your yard. Every six rolls again, but three in a row
              and your turn is over.
            </li>
            <li>
              Land on someone else&apos;s token and it goes back to their yard, unless it&apos;s on a
              start square or a star, which are safe. A capture, or a token getting home, earns you
              another roll.
            </li>
            <li>
              Tokens go once round the board and up their own coloured column. Getting home takes the
              exact number. First to bring all four home wins.
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
              browser rolls the die and checks every move, so a guest can&apos;t fake a six. If you drop
              out or reload, you&apos;re back in your seat with the board as it was.
            </li>
            <li>
              The rules know nothing about the board: a token is just a number of steps from its start.
              The board turns those into squares, with one colour&apos;s path drawn out and turned a
              quarter for each of the others. The CPU weighs every move for captures, safe squares and
              how many tokens could hit it next turn.
            </li>
            <li>
              Three.js draws the board, the turned pawns and a die that tumbles to land on the number
              that was actually rolled. The board turns so your colour is always nearest you.
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
