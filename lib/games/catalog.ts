import type { GameSlug } from "@/lib/games/history";

export type Game = {
  slug: GameSlug;
  title: string;
  /** One or two sentences for the games index card. */
  blurb: string;
  tech: string;
  image: string;
};

/** Every playable game, in the order the games page lists them. */
export const games: Game[] = [
  {
    slug: "ping-pong",
    title: "Ping Pong",
    blurb:
      "Table tennis against the CPU on a full 3D table. Where the ball meets your paddle sets the angle, so aim for the corners.",
    tech: "Three.js / WebGL / IndexedDB",
    image: "/games/ping-pong.webp",
  },
  {
    slug: "blockfall",
    title: "Blockfall",
    blurb:
      "The falling-block puzzle you already know, built in 3D. Clear lines, chain combos, land T-spins and chase your best score.",
    tech: "Three.js / WebGL / IndexedDB",
    image: "/games/blockfall.webp",
  },
  {
    slug: "hot-lap",
    title: "Hot Lap",
    blurb:
      "A time-trial racer on a circuit at dusk. Beat the pace car, and your fastest lap comes back as a ghost to race next visit.",
    tech: "Three.js / WebGL / IndexedDB",
    image: "/games/hot-lap.webp",
  },
  {
    slug: "whot",
    title: "Whot",
    blurb:
      "The Nigerian card game on a 3D table. Play the CPU, pass one phone round your friends, or send someone a link and play online.",
    tech: "Three.js / WebRTC / IndexedDB",
    image: "/games/whot.webp",
  },
  {
    slug: "ludo",
    title: "Ludo",
    blurb:
      "Four colours, one die, no mercy. Up to four players against the CPU, round one screen, or online from a link you send.",
    tech: "Three.js / WebRTC / IndexedDB",
    image: "/games/ludo.webp",
  },
];

export const gameBySlug = (slug: GameSlug) => games.find((g) => g.slug === slug);
