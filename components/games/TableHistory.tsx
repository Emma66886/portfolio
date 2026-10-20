"use client";

import { useState } from "react";
import HistoryPanel from "@/components/games/HistoryPanel";
import { fullDate, timeAgo } from "@/lib/games/format";
import type { LudoMatch, WhotRound } from "@/lib/games/history";

const SHOWN = 8;

const modeLine = (r: WhotRound | LudoMatch) =>
  r.mode === "online"
    ? `Online, ${r.players} players`
    : r.mode === "local"
      ? `${r.players} friends, one screen`
      : `vs ${r.players - 1} CPU${r.players > 2 ? "s" : ""}${r.difficulty ? `, ${r.difficulty}` : ""}`;

/** History for the turn-based games: the game supplies its headline numbers and one line per game. */
export default function TableHistory<R extends WhotRound | LudoMatch>({
  records,
  status,
  onClear,
  stats,
  streak,
  detail,
}: {
  records: R[];
  status: "loading" | "ready" | "unavailable";
  onClear: () => Promise<void>;
  stats: { label: string; value: string | number }[];
  streak: string | null;
  detail: (r: R) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? records : records.slice(0, SHOWN);

  return (
    <HistoryPanel title="Every game you've finished" status={status} count={records.length} noun="games" onClear={onClear}>
      <ul className="history-stats">
        {stats.map((s) => (
          <li key={s.label}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
      {streak && <p className="history-streak">{streak}</p>}

      <ol className="history-list">
        {list.map((r) => {
          const shared = r.mode === "local";
          return (
            <li key={r.id} className={`history-row ${shared ? "versus" : r.result}`}>
              <span className="history-badge" aria-label={shared ? "Friends on one screen" : r.result === "win" ? "Won" : "Lost"}>
                {shared ? `${r.players}P` : r.result === "win" ? "W" : "L"}
              </span>
              <span className="history-score">{shared ? r.winner : r.result === "win" ? "Won" : "Lost"}</span>
              <span className="history-detail">{modeLine(r)}</span>
              <span className="history-detail">{detail(r)}</span>
              <time className="history-when" dateTime={new Date(r.endedAt).toISOString()} title={fullDate(r.endedAt)}>
                {timeAgo(r.endedAt)}
              </time>
            </li>
          );
        })}
      </ol>
      {records.length > SHOWN && (
        <button type="button" className="history-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${records.length}`}
        </button>
      )}
    </HistoryPanel>
  );
}
