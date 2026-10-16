"use client";

import BlockfallGame from "@/components/games/BlockfallGame";
import BlockfallHistory from "@/components/games/BlockfallHistory";
import { usePlayHistory } from "@/lib/games/usePlayHistory";

export default function Blockfall() {
  const history = usePlayHistory("blockfall");

  return (
    <>
      <BlockfallGame runs={history.records} status={history.status} onGameEnd={history.record} />
      <BlockfallHistory runs={history.records} status={history.status} onClear={history.clear} />
    </>
  );
}
