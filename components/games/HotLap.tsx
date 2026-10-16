"use client";

import HotLapGame from "@/components/games/HotLapGame";
import HotLapHistory from "@/components/games/HotLapHistory";
import { usePlayHistory } from "@/lib/games/usePlayHistory";

export default function HotLap() {
  const history = usePlayHistory("hot-lap");

  return (
    <>
      <HotLapGame runs={history.records} status={history.status} onRaceEnd={history.record} />
      <HotLapHistory runs={history.records} status={history.status} onClear={history.clear} />
    </>
  );
}
