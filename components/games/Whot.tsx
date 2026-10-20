"use client";

import TableHistory from "@/components/games/TableHistory";
import WhotGame from "@/components/games/WhotGame";
import { formatDuration } from "@/lib/games/format";
import { summarizeWhot } from "@/lib/games/stats";
import { usePlayHistory } from "@/lib/games/usePlayHistory";

export default function Whot() {
  const history = usePlayHistory("whot");
  const stats = summarizeWhot(history.records);

  return (
    <>
      <WhotGame rounds={history.records} status={history.status} onRoundEnd={history.record} />
      <TableHistory
        records={history.records}
        status={history.status}
        onClear={history.clear}
        stats={[
          { label: "Games", value: stats.played },
          { label: "Won-lost", value: `${stats.wins}-${stats.losses}` },
          { label: "Win rate", value: `${Math.round(stats.winRate * 100)}%` },
          { label: "Best win streak", value: stats.bestWinStreak },
          { label: "Online wins", value: stats.onlineWins },
          { label: "Quickest win", value: stats.quickestWin === null ? "-" : `${stats.quickestWin} turns` },
        ]}
        streak={
          stats.streak && stats.streak.count > 1
            ? stats.streak.result === "win"
              ? `You've won your last ${stats.streak.count} in a row.`
              : `${stats.streak.count} losses in a row. The next deal is yours.`
            : null
        }
        detail={(r) =>
          `${r.result === "win" || r.mode === "local" ? `${r.turns} turns` : `${r.cardsLeft} ${r.cardsLeft === 1 ? "card" : "cards"} left`} · ${
            r.ending === "count" ? "counted out" : formatDuration(r.duration)
          }`
        }
      />
    </>
  );
}
