import { formatLapTime, timeAgo } from "@/lib/games/format";
import type { BlockfallRun, GameSlug, HotLapRun, LudoMatch, PongMatch, RecordOf, WhotRound } from "@/lib/games/history";

export const isVersus = (m: PongMatch) => m.mode === "versus";

/**
 * Your record against the CPU. Two-player matches are counted but kept out
 * of it, since neither side of those is necessarily you. Expects matches
 * newest first, as `listRecords` returns them.
 */
export function summarizePong(all: PongMatch[]) {
  const matches = all.filter((m) => !isVersus(m));
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
    longestRally: all.reduce((best, m) => Math.max(best, m.longestRally), 0),
    twoPlayer: all.length - matches.length,
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

/**
 * Your record at a turn-based game: against the CPU and online, where one
 * seat is plainly you. Games between friends on one screen are counted apart.
 * Expects records newest first.
 */
function summarizeTable<R extends WhotRound | LudoMatch>(all: R[]) {
  const games = all.filter((r) => r.mode !== "local");
  const wins = games.filter((r) => r.result === "win").length;
  let streak = 0;
  while (streak < games.length && games[streak].result === games[0].result) streak++;
  let bestWinStreak = 0;
  let run = 0;
  for (const r of games) {
    run = r.result === "win" ? run + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, run);
  }
  return {
    games,
    played: games.length,
    wins,
    losses: games.length - wins,
    winRate: games.length ? wins / games.length : 0,
    streak: games.length ? { result: games[0].result, count: streak } : null,
    bestWinStreak,
    online: games.filter((r) => r.mode === "online").length,
    onlineWins: games.filter((r) => r.mode === "online" && r.result === "win").length,
    shared: all.length - games.length,
  };
}

export function summarizeWhot(all: WhotRound[]) {
  const base = summarizeTable(all);
  const won = base.games.filter((r) => r.result === "win");
  return {
    ...base,
    /** Fewest turns round the table in a game you won. */
    quickestWin: won.reduce<number | null>((best, r) => (best === null || r.turns < best ? r.turns : best), null),
    picked: base.games.reduce((sum, r) => sum + r.picked, 0),
  };
}

export function summarizeLudo(all: LudoMatch[]) {
  const base = summarizeTable(all);
  return {
    ...base,
    captures: base.games.reduce((sum, r) => sum + r.captures, 0),
    mostCaptures: base.games.reduce((most, r) => Math.max(most, r.captures), 0),
    sixes: base.games.reduce((sum, r) => sum + r.sixes, 0),
  };
}

export const formatScore = (n: number) => n.toLocaleString("en");

/** One line about the visitor's record at a game, for cards and the homepage. */
export function recordLine<G extends GameSlug>(game: G, records: RecordOf<G>[]): string {
  if (!records.length) return "You haven't played this one yet.";
  const last = `Last played ${timeAgo(records[0].endedAt)}.`;

  if (game === "ping-pong") {
    const { played, wins, losses, twoPlayer } = summarizePong(records as PongMatch[]);
    if (!played) return `${twoPlayer} two-player ${twoPlayer === 1 ? "match" : "matches"} played. ${last}`;
    return `You're ${wins}-${losses} against the CPU. ${last}`;
  }
  if (game === "hot-lap") {
    const { bestLap } = summarizeHotLap(records as HotLapRun[]);
    return `Your best lap is ${formatLapTime(bestLap!)}. ${last}`;
  }
  if (game === "whot" || game === "ludo") {
    const { played, wins, losses, online, shared } = summarizeTable(records as (WhotRound | LudoMatch)[]);
    if (!played) return `${shared} ${shared === 1 ? "game" : "games"} with friends on one screen. ${last}`;
    return `You're ${wins}-${losses}${online ? `, ${online} of those online` : ""}. ${last}`;
  }
  const { best } = summarizeBlockfall(records as BlockfallRun[]);
  return `Your best is ${formatScore(best!.score)} with ${best!.lines} lines. ${last}`;
}
