"use client";

import { useState } from "react";
import HistoryPanel from "@/components/games/HistoryPanel";
import { formatDuration, fullDate, timeAgo } from "@/lib/games/format";
import type { PongMatch } from "@/lib/games/history";
import { summarizePong } from "@/lib/games/stats";

const SHOWN = 8;
const LEVELS: Record<string, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export default function PongHistory({
  matches,
  status,
  onClear,
}: {
  matches: PongMatch[];
  status: "loading" | "ready" | "unavailable";
  onClear: () => Promise<void>;
}) {
  const [showAll, setShowAll] = useState(false);
  const stats = summarizePong(matches);
  const list = showAll ? matches : matches.slice(0, SHOWN);

  return (
    <HistoryPanel
      title="Every match you've finished"
      status={status}
      count={matches.length}
      noun="matches"
      onClear={onClear}
    >
      <ul className="history-stats">
        <li>
          <strong>{stats.played}</strong>
          <span>Played</span>
        </li>
        <li>
          <strong>
            {stats.wins}-{stats.losses}
          </strong>
          <span>Won-lost</span>
        </li>
        <li>
          <strong>{Math.round(stats.winRate * 100)}%</strong>
          <span>Win rate</span>
        </li>
        <li>
          <strong>{stats.bestWinStreak}</strong>
          <span>Best win streak</span>
        </li>
        <li>
          <strong>{stats.longestRally}</strong>
          <span>Longest rally</span>
        </li>
      </ul>
      {stats.streak && stats.streak.count > 1 && (
        <p className="history-streak">
          {stats.streak.result === "win"
            ? `You've won your last ${stats.streak.count} in a row.`
            : `The CPU has taken the last ${stats.streak.count}. Maybe drop a level?`}
        </p>
      )}

      <ol className="history-list">
        {list.map((m) => (
          <li key={m.id} className={`history-row ${m.result}`}>
            <span className="history-badge" aria-label={m.result === "win" ? "Won" : "Lost"}>
              {m.result === "win" ? "W" : "L"}
            </span>
            <span className="history-score">
              {m.playerScore}-{m.opponentScore}
            </span>
            <span className="history-detail">
              {LEVELS[m.difficulty] ?? m.difficulty} · first to {m.target}
            </span>
            <span className="history-detail">
              Rally {m.longestRally} · {formatDuration(m.duration)}
            </span>
            <time className="history-when" dateTime={new Date(m.endedAt).toISOString()} title={fullDate(m.endedAt)}>
              {timeAgo(m.endedAt)}
            </time>
          </li>
        ))}
      </ol>
      {matches.length > SHOWN && (
        <button type="button" className="history-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${matches.length}`}
        </button>
      )}
    </HistoryPanel>
  );
}
