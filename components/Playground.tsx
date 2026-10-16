import Image from "next/image";
import Link from "next/link";
import GameRecord from "@/components/games/GameRecord";
import { ArrowRightIcon } from "@/components/Icons";
import { games } from "@/lib/games/catalog";

/** Homepage pointer to the games, with the visitor's record if they've played. */
export default function Playground() {
  const game = games[0];
  const href = `/games/${game.slug}`;

  return (
    <section className="section playground" id="games">
      <div className="wrap playground-inner">
        <div className="playground-copy reveal">
          <p className="section-eyebrow">Off the clock</p>
          <h2>I Build Games Too</h2>
          <p className="body">
            Small ones, in my own time, mostly to try things client work rarely asks for. The first is
            ping pong on a 3D table, built with three.js, and it remembers every match you finish.
          </p>
          <GameRecord slug={game.slug} className="playground-record" />
          <div className="hero-actions">
            <Link href={href} className="btn btn-primary magnetic">
              Play {game.title} <span className="arrow"><ArrowRightIcon /></span>
            </Link>
            <Link href="/games" className="btn btn-ghost magnetic">
              All games
            </Link>
          </div>
        </div>

        <Link href={href} className="playground-shot reveal" data-tilt="5" tabIndex={-1} aria-hidden="true">
          <Image src={game.image} alt="" width={1600} height={900} sizes="(max-width: 880px) 100vw, 600px" />
          <span className="playground-tag">{game.tech}</span>
        </Link>
      </div>
    </section>
  );
}
