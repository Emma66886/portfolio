"use client";

import PongGame from "@/components/games/PongGame";
import PongHistory from "@/components/games/PongHistory";
import { usePlayHistory } from "@/lib/games/usePlayHistory";

export default function PingPong() {
  const history = usePlayHistory("ping-pong");

  return (
    <>
      <PongGame matches={history.records} status={history.status} onMatchEnd={history.record} />
      <PongHistory matches={history.records} status={history.status} onClear={history.clear} />
    </>
  );
}
