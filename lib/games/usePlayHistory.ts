"use client";

import { useCallback, useEffect, useState } from "react";
import { addMatch, clearMatches, listMatches, type MatchRecord } from "@/lib/games/history";

type State = {
  /** "unavailable" when this browser will not let the site store anything. */
  status: "loading" | "ready" | "unavailable";
  matches: MatchRecord[];
};

/**
 * A game's saved matches, newest first. Starts as "loading" on the server and
 * on first paint, since IndexedDB only exists in the browser.
 */
export function usePlayHistory(game: string) {
  const [state, setState] = useState<State>({ status: "loading", matches: [] });

  useEffect(() => {
    let alive = true;
    listMatches(game).then(
      (matches) => alive && setState({ status: "ready", matches }),
      () => alive && setState({ status: "unavailable", matches: [] })
    );
    return () => {
      alive = false;
    };
  }, [game]);

  /** Resolves to false when the match could not be saved. */
  const record = useCallback(async (match: MatchRecord) => {
    try {
      const saved = await addMatch(match);
      setState((s) => ({ status: "ready", matches: [saved, ...s.matches] }));
      return true;
    } catch {
      setState((s) => ({ ...s, status: "unavailable" }));
      return false;
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await clearMatches(game);
      setState({ status: "ready", matches: [] });
    } catch {
      setState((s) => ({ ...s, status: "unavailable" }));
    }
  }, [game]);

  return { ...state, record, clear };
}
