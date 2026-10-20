"use client";

import LudoGame from "@/components/games/LudoGame";
import TableHistory from "@/components/games/TableHistory";
import { formatDuration } from "@/lib/games/format";
import { summarizeLudo } from "@/lib/games/stats";
import { usePlayHistory } from "@/lib/games/usePlayHistory";

export default function Ludo() {
  const history = usePlayHistory("ludo");
  const stats = summarizeLudo(history.records);

  return (
    <>
      <LudoGame matches={history.records} status={history.status} onMatchEnd={history.record} />
      <TableHistory
        records={history.records}
        status={history.status}
        onClear={history.clear}
        stats={[
          { label: "Games", value: stats.played },
          { label: "Won-lost", value: `${stats.wins}-${stats.losses}` },
          { label: "Win rate", value: `${Math.round(stats.winRate * 100)}%` },
          { label: "Best win streak", value: stats.bestWinStreak },
          { label: "Captures", value: stats.captures },
          { label: "Online wins", value: stats.onlineWins },
        ]}
        streak={
          stats.streak && stats.streak.count > 1
            ? stats.streak.result === "win"
              ? `You've won your last ${stats.streak.count} in a row.`
              : `${stats.streak.count} losses in a row. The die owes you one.`
            : null
        }
        detail={(r) => `${r.color} · ${r.home}/4 home · ${r.captures} ${r.captures === 1 ? "capture" : "captures"} · ${formatDuration(r.duration)}`}
      />
    </>
  );
}
