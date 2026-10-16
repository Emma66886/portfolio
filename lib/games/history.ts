/**
 * Play history and game settings, kept in the visitor's own browser with
 * IndexedDB. Nothing here leaves the device.
 *
 * Every call rejects when IndexedDB is missing or blocked (some private
 * windows, or site data turned off), and callers treat that as "history
 * unavailable" rather than an error worth showing.
 */

export type MatchRecord = {
  id?: number;
  /** Slug from lib/games/catalog.ts. */
  game: string;
  result: "win" | "loss";
  playerScore: number;
  opponentScore: number;
  difficulty: string;
  /** Points needed to win the match. */
  target: number;
  longestRally: number;
  /** Seconds of play, not counting pauses. */
  duration: number;
  /** Epoch milliseconds. */
  endedAt: number;
};

const DB_NAME = "akinroye-games";
const DB_VERSION = 1;
const MATCHES = "matches";
const PREFS = "prefs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MATCHES)) {
        const store = db.createObjectStore(MATCHES, { keyPath: "id", autoIncrement: true });
        store.createIndex("byGame", ["game", "endedAt"]);
      }
      if (!db.objectStoreNames.contains(PREFS)) {
        db.createObjectStore(PREFS, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Step aside if a newer version of the site opens the database in
      // another tab and needs to upgrade it.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another tab"));
  });

  // Let a later call try again rather than caching the failure.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

const forGame = (game: string) => IDBKeyRange.bound([game, -Infinity], [game, Infinity]);

/** Every recorded match for a game, newest first. */
export async function listMatches(game: string): Promise<MatchRecord[]> {
  const db = await openDb();
  const tx = db.transaction(MATCHES, "readonly");
  const matches: MatchRecord[] = [];
  const request = tx.objectStore(MATCHES).index("byGame").openCursor(forGame(game), "prev");
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    matches.push(cursor.value as MatchRecord);
    cursor.continue();
  };
  await done(tx);
  return matches;
}

/** Stores a finished match and returns it with its new id. */
export async function addMatch(match: MatchRecord): Promise<MatchRecord> {
  const db = await openDb();
  const tx = db.transaction(MATCHES, "readwrite");
  const request = tx.objectStore(MATCHES).add(match);
  await done(tx);
  return { ...match, id: request.result as number };
}

export async function clearMatches(game: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(MATCHES, "readwrite");
  const request = tx.objectStore(MATCHES).index("byGame").openCursor(forGame(game));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
  await done(tx);
}

export async function getPref<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(PREFS, "readonly");
  const request = tx.objectStore(PREFS).get(key);
  await done(tx);
  return (request.result as { value: T } | undefined)?.value;
}

export async function setPref<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PREFS, "readwrite");
  tx.objectStore(PREFS).put({ key, value });
  await done(tx);
}

export type HistorySummary = {
  played: number;
  wins: number;
  losses: number;
  /** 0 to 1. */
  winRate: number;
  /** Consecutive results matching the latest one. */
  streak: { result: MatchRecord["result"]; count: number } | null;
  bestWinStreak: number;
  longestRally: number;
};

/** Expects matches newest first, as `listMatches` returns them. */
export function summarize(matches: MatchRecord[]): HistorySummary {
  const wins = matches.filter((m) => m.result === "win").length;

  let streakCount = 0;
  while (streakCount < matches.length && matches[streakCount].result === matches[0].result) streakCount++;

  let bestWinStreak = 0;
  let run = 0;
  for (const m of matches) {
    run = m.result === "win" ? run + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, run);
  }

  return {
    played: matches.length,
    wins,
    losses: matches.length - wins,
    winRate: matches.length ? wins / matches.length : 0,
    streak: matches.length ? { result: matches[0].result, count: streakCount } : null,
    bestWinStreak,
    longestRally: matches.reduce((best, m) => Math.max(best, m.longestRally), 0),
  };
}
