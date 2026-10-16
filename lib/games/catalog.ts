export type Game = {
  slug: string;
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
];

export const gameBySlug = (slug: string) => games.find((g) => g.slug === slug);
