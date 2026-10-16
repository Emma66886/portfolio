import { formatLapTime, timeAgo } from "@/lib/games/format";
import type { BlockfallRun, GameSlug, HotLapRun, PongMatch, RecordOf } from "@/lib/games/history";

/** Expects matches newest first, as `listRecords` returns them. */
export function summarizePong(matches: PongMatch[]) {
  const wins = matches.filter((m) => m.result === "win").length;

  let streakCount = 0;
  while (streakCount < matches.length && matches[streakCount].result === matches[0].result) streakCount++;

  let bestWinStreak = 0;
  let run = 0;
  for (const m of matches) {
    run = m.result === "win" ? run + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, run);
  }

  return {
    played: matches.length,
    wins,
    losses: matches.length - wins,
    /** 0 to 1. */
    winRate: matches.length ? wins / matches.length : 0,
    /** Consecutive results matching the latest one. */
    streak: matches.length ? { result: matches[0].result, count: streakCount } : null,
    bestWinStreak,
    longestRally: matches.reduce((best, m) => Math.max(best, m.longestRally), 0),
  };
}

export function summarizeBlockfall(runs: BlockfallRun[]) {
  const best = runs.reduce<BlockfallRun | null>((top, r) => (!top || r.score > top.score ? r : top), null);
  return {
    played: runs.length,
    best,
    mostLines: runs.reduce((most, r) => Math.max(most, r.lines), 0),
    highestLevel: runs.reduce((most, r) => Math.max(most, r.level), 0),
    totalLines: runs.reduce((sum, r) => sum + r.lines, 0),
    quads: runs.reduce((sum, r) => sum + r.quads, 0),
  };
}

export function summarizeHotLap(runs: HotLapRun[]) {
  const fastest = (laps: number) =>
    runs.filter((r) => r.laps === laps).reduce<HotLapRun | null>((top, r) => (!top || r.totalTime < top.totalTime ? r : top), null);
  return {
    races: runs.length,
    bestLap: runs.reduce<number | null>((best, r) => (best === null || r.bestLap < best ? r.bestLap : best), null),
    bestThreeLaps: fastest(3),
    lapsDriven: runs.reduce((sum, r) => sum + r.lapTimes.length, 0),
    paceBeaten: runs.filter((r) => r.beatPace).length,
  };
}

export const formatScore = (n: number) => n.toLocaleString("en");

/** One line about the visitor's record at a game, for cards and the homepage. */
export function recordLine<G extends GameSlug>(game: G, records: RecordOf<G>[]): string {
  if (!records.length) return "You haven't played this one yet.";
  const last = `Last played ${timeAgo(records[0].endedAt)}.`;

  if (game === "ping-pong") {
    const { wins, losses } = summarizePong(records as PongMatch[]);
    return `You're ${wins}-${losses} against the CPU. ${last}`;
  }
  if (game === "hot-lap") {
    const { bestLap } = summarizeHotLap(records as HotLapRun[]);
    return `Your best lap is ${formatLapTime(bestLap!)}. ${last}`;
  }
  const { best } = summarizeBlockfall(records as BlockfallRun[]);
  return `Your best is ${formatScore(best!.score)} with ${best!.lines} lines. ${last}`;
}
