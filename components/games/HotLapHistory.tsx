"use client";

import { useState } from "react";
import HistoryPanel from "@/components/games/HistoryPanel";
import { formatLapTime, fullDate, timeAgo } from "@/lib/games/format";
import type { HotLapRun } from "@/lib/games/history";
import { summarizeHotLap } from "@/lib/games/stats";

const SHOWN = 8;

export default function HotLapHistory({
  runs,
  status,
  onClear,
}: {
  runs: HotLapRun[];
  status: "loading" | "ready" | "unavailable";
  onClear: () => Promise<void>;
}) {
  const [order, setOrder] = useState<"recent" | "fastest">("recent");
  const [showAll, setShowAll] = useState(false);
  const stats = summarizeHotLap(runs);
  const sorted = order === "fastest" ? [...runs].sort((a, b) => a.bestLap - b.bestLap) : runs;
  const list = showAll ? sorted : sorted.slice(0, SHOWN);

  return (
    <HistoryPanel title="Every race you've finished" status={status} count={runs.length} noun="races" onClear={onClear}>
      <ul className="history-stats">
        <li>
          <strong>{stats.bestLap ? formatLapTime(stats.bestLap) : "-"}</strong>
          <span>Best lap</span>
        </li>
        <li>
          <strong>{stats.bestThreeLaps ? formatLapTime(stats.bestThreeLaps.totalTime) : "-"}</strong>
          <span>Best 3-lap race</span>
        </li>
        <li>
          <strong>{stats.races}</strong>
          <span>Races</span>
        </li>
        <li>
          <strong>{stats.lapsDriven}</strong>
          <span>Laps driven</span>
        </li>
        <li>
          <strong>{stats.paceBeaten}</strong>
          <span>Pace car beaten</span>
        </li>
      </ul>

      <div className="history-order" role="group" aria-label="Sort races">
        {(["recent", "fastest"] as const).map((o) => (
          <button key={o} type="button" aria-pressed={order === o} onClick={() => setOrder(o)}>
            {o === "recent" ? "Most recent" : "Fastest lap"}
          </button>
        ))}
      </div>

      <ol className="history-list">
        {list.map((r) => (
          <li key={r.id} className="history-row runs">
            <span className="history-score">
              {formatLapTime(r.totalTime)}
              {r.bestLap === stats.bestLap && <span className="history-best">Best lap</span>}
            </span>
            <span className="history-detail">
              {r.laps === 1 ? "1 lap" : `${r.laps} laps`} · best {formatLapTime(r.bestLap)}
            </span>
            <span className="history-detail">
              {r.beatPace ? "Beat the pace car" : "Behind the pace car"}
              {r.hits > 0 && ` · ${r.hits} ${r.hits === 1 ? "hit" : "hits"}`}
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
