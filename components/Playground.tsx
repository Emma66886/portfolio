import Image from "next/image";
import Link from "next/link";
import GameRecord from "@/components/games/GameRecord";
import { ArrowRightIcon } from "@/components/Icons";
import { games } from "@/lib/games/catalog";

/** Homepage pointer to the games, with the visitor's record at each if they've played. */
export default function Playground() {
  return (
    <section className="section playground" id="games">
      <div className="wrap playground-inner">
        <div className="playground-copy reveal">
          <p className="section-eyebrow">Off the clock</p>
          <h2>I Build Games Too</h2>
          <p className="body">
            Small ones, in my own time, mostly to try things client work rarely asks for. They&apos;re
            all built in 3D with three.js, and they remember how you did.
          </p>
          <ul className="playground-list">
            {games.map((game) => (
              <li key={game.slug}>
                <Link href={`/games/${game.slug}`} className="playground-game">
                  <span className="playground-game-title">
                    {game.title} <span className="arrow"><ArrowRightIcon /></span>
                  </span>
                  <GameRecord slug={game.slug} className="playground-record" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hero-actions">
            <Link href="/games" className="btn btn-primary magnetic">
              See all games <span className="arrow"><ArrowRightIcon /></span>
            </Link>
          </div>
        </div>

        <div className="playground-shots reveal">
          {games.slice(0, 3).map((game, i) => (
            <Link
              key={game.slug}
              href={`/games/${game.slug}`}
              className={`playground-shot shot-${i}`}
              data-tilt="5"
              tabIndex={-1}
              aria-hidden="true"
            >
              <Image src={game.image} alt="" width={1600} height={900} sizes="(max-width: 880px) 80vw, 500px" />
              <span className="playground-tag">{game.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
