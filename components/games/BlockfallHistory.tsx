"use client";

import { useState } from "react";
import HistoryPanel from "@/components/games/HistoryPanel";
import { formatDuration, fullDate, timeAgo } from "@/lib/games/format";
import type { BlockfallRun } from "@/lib/games/history";
import { formatScore, summarizeBlockfall } from "@/lib/games/stats";

const SHOWN = 8;

export default function BlockfallHistory({
  runs,
  status,
  onClear,
}: {
  runs: BlockfallRun[];
  status: "loading" | "ready" | "unavailable";
  onClear: () => Promise<void>;
}) {
  const [order, setOrder] = useState<"recent" | "best">("recent");
  const [showAll, setShowAll] = useState(false);
  const stats = summarizeBlockfall(runs);
  const sorted = order === "best" ? [...runs].sort((a, b) => b.score - a.score) : runs;
  const list = showAll ? sorted : sorted.slice(0, SHOWN);

  return (
    <HistoryPanel title="Every game you've finished" status={status} count={runs.length} noun="games" onClear={onClear}>
      <ul className="history-stats">
        <li>
          <strong>{stats.played}</strong>
          <span>Played</span>
        </li>
        <li>
          <strong>{formatScore(stats.best?.score ?? 0)}</strong>
          <span>Best score</span>
        </li>
        <li>
          <strong>{stats.mostLines}</strong>
          <span>Most lines</span>
        </li>
        <li>
          <strong>{stats.highestLevel}</strong>
          <span>Highest level</span>
        </li>
        <li>
          <strong>{stats.quads}</strong>
          <span>Quads, all time</span>
        </li>
      </ul>

      <div className="history-order" role="group" aria-label="Sort games">
        {(["recent", "best"] as const).map((o) => (
          <button key={o} type="button" aria-pressed={order === o} onClick={() => setOrder(o)}>
            {o === "recent" ? "Most recent" : "Highest score"}
          </button>
        ))}
      </div>

      <ol className="history-list">
        {list.map((r) => (
          <li key={r.id} className="history-row runs">
            <span className="history-score">
              {formatScore(r.score)}
              {r.id === stats.best?.id && <span className="history-best">Best</span>}
            </span>
            <span className="history-detail">
              {r.lines} lines · level {r.level}
            </span>
            <span className="history-detail">
              {r.quads} {r.quads === 1 ? "quad" : "quads"} · {formatDuration(r.duration)}
            </span>
            <time className="history-when" dateTime={new Date(r.endedAt).toISOString()} title={fullDate(r.endedAt)}>
              {timeAgo(r.endedAt)}
            </time>
          </li>
        ))}
      </ol>
      {runs.length > SHOWN && (
        <button type="button" className="history-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${runs.length}`}
        </button>
      )}
    </HistoryPanel>
  );
}
