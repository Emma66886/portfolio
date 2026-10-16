"use client";

import { timeAgo } from "@/lib/games/format";
import { summarize } from "@/lib/games/history";
import { usePlayHistory } from "@/lib/games/usePlayHistory";

/** The visitor's own record at a game, read from this browser. */
export default function GameRecord({ slug, className }: { slug: string; className?: string }) {
  const { status, matches } = usePlayHistory(slug);
  if (status !== "ready") return null;

  if (!matches.length) {
    return <p className={className}>You haven&apos;t played this one yet.</p>;
  }
  const { wins, losses } = summarize(matches);
  return (
    <p className={className}>
      You&apos;re {wins}-{losses} against the CPU. Last played {timeAgo(matches[0].endedAt)}.
    </p>
  );
}
