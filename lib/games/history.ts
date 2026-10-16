/**
 * Play history and game settings, kept in the visitor's own browser with
 * IndexedDB. Nothing here leaves the device.
 *
 * Every call rejects when IndexedDB is missing or blocked (some private
 * windows, or site data turned off), and callers treat that as "history
 * unavailable" rather than an error worth showing.
 */

type Base = {
  id?: number;
  /** Seconds of play, not counting pauses. */
  duration: number;
  /** Epoch milliseconds. */
  endedAt: number;
};

export type PongMatch = Base & {
  game: "ping-pong";
  result: "win" | "loss";
  playerScore: number;
  opponentScore: number;
  difficulty: string;
  /** Points needed to win the match. */
  target: number;
  longestRally: number;
};

export type BlockfallRun = Base & {
  game: "blockfall";
  score: number;
  lines: number;
  /** Level reached when the stack topped out. */
  level: number;
  startLevel: number;
  pieces: number;
  /** Four-line clears. */
  quads: number;
  tSpins: number;
  maxCombo: number;
};

export type HotLapRun = Base & {
  game: "hot-lap";
  /** Laps in the race. */
  laps: number;
  /** Seconds, the sum of every lap. */
  totalTime: number;
  bestLap: number;
  lapTimes: number[];
  /** The best lap beat the pace car's. */
  beatPace: boolean;
  /** Times the car hit the barrier. */
  hits: number;
};

/** One finished game. Each game's records carry its own slug from lib/games/catalog.ts. */
export type PlayRecord = PongMatch | BlockfallRun | HotLapRun;
export type GameSlug = PlayRecord["game"];
export type RecordOf<G extends GameSlug> = Extract<PlayRecord, { game: G }>;

const DB_NAME = "akinroye-games";
const DB_VERSION = 1;
// Named before there was more than one game. Renaming it would mean a
// migration for nothing, since the store holds any game's records.
const RECORDS = "matches";
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
      if (!db.objectStoreNames.contains(RECORDS)) {
        const store = db.createObjectStore(RECORDS, { keyPath: "id", autoIncrement: true });
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

const forGame = (game: GameSlug) => IDBKeyRange.bound([game, -Infinity], [game, Infinity]);

/** Every recorded game of one kind, newest first. */
export async function listRecords<G extends GameSlug>(game: G): Promise<RecordOf<G>[]> {
  const db = await openDb();
  const tx = db.transaction(RECORDS, "readonly");
  const records: RecordOf<G>[] = [];
  const request = tx.objectStore(RECORDS).index("byGame").openCursor(forGame(game), "prev");
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    records.push(cursor.value as RecordOf<G>);
    cursor.continue();
  };
  await done(tx);
  return records;
}

/** Stores a finished game and returns it with its new id. */
export async function addRecord<R extends PlayRecord>(record: R): Promise<R> {
  const db = await openDb();
  const tx = db.transaction(RECORDS, "readwrite");
  const request = tx.objectStore(RECORDS).add(record);
  await done(tx);
  return { ...record, id: request.result as number };
}

export async function clearRecords(game: GameSlug): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(RECORDS, "readwrite");
  const request = tx.objectStore(RECORDS).index("byGame").openCursor(forGame(game));
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
