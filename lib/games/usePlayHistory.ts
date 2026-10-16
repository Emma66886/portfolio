"use client";

import { useCallback, useEffect, useState } from "react";
import { addRecord, clearRecords, listRecords, type GameSlug, type RecordOf } from "@/lib/games/history";

type State<G extends GameSlug> = {
  /** "unavailable" when this browser will not let the site store anything. */
  status: "loading" | "ready" | "unavailable";
  records: RecordOf<G>[];
};

/**
 * A game's saved records, newest first. Starts as "loading" on the server and
 * on first paint, since IndexedDB only exists in the browser.
 */
export function usePlayHistory<G extends GameSlug>(game: G) {
  const [state, setState] = useState<State<G>>({ status: "loading", records: [] });

  useEffect(() => {
    let alive = true;
    listRecords(game).then(
      (records) => alive && setState({ status: "ready", records }),
      () => alive && setState({ status: "unavailable", records: [] })
    );
    return () => {
      alive = false;
    };
  }, [game]);

  /** Resolves to false when the record could not be saved. */
  const record = useCallback(async (entry: RecordOf<G>) => {
    try {
      const saved = await addRecord(entry);
      setState((s) => ({ status: "ready", records: [saved, ...s.records] }));
      return true;
    } catch {
      setState((s) => ({ ...s, status: "unavailable" }));
      return false;
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await clearRecords(game);
      setState({ status: "ready", records: [] });
    } catch {
      setState((s) => ({ ...s, status: "unavailable" }));
    }
  }, [game]);

  return { ...state, record, clear };
}
