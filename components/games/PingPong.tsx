"use client";

import PlayHistory from "@/components/games/PlayHistory";
import PongGame from "@/components/games/PongGame";
import { usePlayHistory } from "@/lib/games/usePlayHistory";

export default function PingPong() {
  const history = usePlayHistory("ping-pong");

  return (
    <>
      <PongGame matches={history.matches} status={history.status} onMatchEnd={history.record} />
      <PlayHistory matches={history.matches} status={history.status} onClear={history.clear} />
    </>
  );
}
