"use client";

import type { GameSlug } from "@/lib/games/history";
import { recordLine } from "@/lib/games/stats";
import { usePlayHistory } from "@/lib/games/usePlayHistory";

/** The visitor's own record at a game, read from this browser. */
export default function GameRecord({ slug, className }: { slug: GameSlug; className?: string }) {
  const { status, records } = usePlayHistory(slug);
  if (status !== "ready") return null;
  return <p className={className}>{recordLine(slug, records)}</p>;
}
