import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import GameRecord from "@/components/games/GameRecord";
import { ArrowRightIcon } from "@/components/Icons";
import { profile } from "@/lib/data";
import { games } from "@/lib/games/catalog";

const description =
  "Small browser games Emmanuel Akinroye builds in his own time, starting with 3D ping pong in three.js that remembers every match you play.";

export const metadata: Metadata = {
  title: `Games | ${profile.name}`,
  description,
  openGraph: {
    title: `Games | ${profile.name}`,
    description,
    images: [{ url: games[0].image, width: 1600, height: 900, alt: `${games[0].title} game` }],
  },
};

export default function GamesPage() {
  return (
    <main className="games-page">
      <div className="wrap">
        <header className="games-head">
          <p className="section-eyebrow">Off the clock</p>
          <h1>Games</h1>
          <p className="lead">
            Little games I build in my own time. They&apos;re where I try things client work rarely
            calls for, like real-time 3D in the browser. Everything runs on your device, and your
            results are kept there too, so they&apos;re waiting when you come back.
          </p>
        </header>

        <div className="game-grid">
          {games.map((game) => (
            <article className="game-card" key={game.slug}>
              <Link href={`/games/${game.slug}`} className="game-shot" tabIndex={-1} aria-hidden="true">
                <Image
                  src={game.image}
                  alt=""
                  width={1600}
                  height={900}
                  sizes="(max-width: 760px) 100vw, 560px"
                  // Above the fold, and the largest thing on the page.
                  loading="eager"
                />
              </Link>
              <div className="game-body">
                <h2>
                  <Link href={`/games/${game.slug}`}>{game.title}</Link>
                </h2>
                <p>{game.blurb}</p>
                <p className="tech">{game.tech}</p>
                <GameRecord slug={game.slug} className="game-record" />
                <Link href={`/games/${game.slug}`} className="btn btn-primary btn-sm">
                  Play {game.title} <span className="arrow"><ArrowRightIcon /></span>
                </Link>
              </div>
            </article>
          ))}

          <article className="game-card game-soon">
            <p className="section-eyebrow">Next up</p>
            <h2>More on the way</h2>
            <p>
              I add a new one when an idea sticks. Each is a chance to push something in the browser a
              bit further than a product would let me.
            </p>
          </article>
        </div>
      </div>
    </main>
  );
}
