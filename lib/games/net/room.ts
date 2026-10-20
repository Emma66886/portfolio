/**
 * Online rooms for the turn-based games. The host's browser runs the table
 * (lib/games/table.ts) and is the only one holding the full game; each guest
 * sends moves and gets back updates cut down to what their seat may see.
 *
 * A room survives drops: a guest who loses the connection (or reloads the
 * page) redials and gets their seat back, and a host who reloads picks the
 * game up from sessionStorage under the same code.
 */
import { CPU_NAMES, createTable, type Level, type Rules, type Seat } from "@/lib/games/table";
import { dialer, listen, NetFailure, type Channel, type NetError } from "@/lib/games/net/peer";

/** Bumped when the messages change shape, so mismatched tabs say so instead of misbehaving. */
const PROTOCOL = 1;
const NAME_LENGTH = 16;
const GIVE_UP_AFTER = 45000;

export type Update<V, E> = {
  events: E[];
  view: V;
  /** A fresh picture rather than a step on from the last one: a new game, a rejoin. */
  reset: boolean;
};

export type LobbySeat = { name: string; kind: "host" | "guest" | "open" | "cpu"; online: boolean };

export type Lobby<C> = {
  code: string;
  config: C;
  /** Level for the CPU seats. */
  level: Level;
  seats: LobbySeat[];
  started: boolean;
  /** The seat this copy of the lobby was sent to. */
  you: number;
};

export type RoomStatus =
  | { state: "connecting" }
  | { state: "open" }
  | { state: "reconnecting" }
  | { state: "failed"; reason: NetError | "full" | "started" | "version" | "closed" | "lost" };

/** What a game tells the room about itself. */
export type RoomGame<S, A, V, E, C> = {
  /** The game's slug, which also keeps its rooms apart from other games'. */
  game: string;
  rules: Rules<S, A, V, E>;
  seatsFor(config: C): number;
  /** `round` counts rematches, so the first turn can move round the table. */
  create(config: C, round: number): { state: S; events: E[] };
};

type ToHost = { t: "hello"; v: number; id: string; name: string } | { t: "act"; a: unknown } | { t: "leave" };
type ToGuest<V, E, C> =
  | { t: "lobby"; lobby: Lobby<C> }
  | { t: "update"; update: Update<V, E> }
  | { t: "reject"; why: "full" | "started" | "version" }
  | { t: "closed" };

export const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, NAME_LENGTH);

type Member = { name: string; kind: LobbySeat["kind"]; id: string | null; ch: Channel | null };

type Saved<S, C> = {
  code: string;
  config: C;
  level: Level;
  members: Omit<Member, "ch">[];
  state: S | null;
  round: number;
};

const savedKey = (game: string) => `games:room:${game}`;

function load<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the room still works, it just won't survive a reload.
  }
}

/** The code of a room this tab was hosting before a reload, if there is one. */
export const hostedCode = (game: string) => load<Saved<unknown, unknown>>(savedKey(game))?.code ?? null;

export function hostRoom<S, A, V, E, C>(
  spec: RoomGame<S, A, V, E, C>,
  opts: {
    code: string;
    name: string;
    config: C;
    level: Level;
    /** Pick up the game this tab was hosting before a reload. */
    resume: boolean;
    onLobby(lobby: Lobby<C>): void;
    /** Updates for the host's own seat, which is always seat 0. */
    onUpdate(update: Update<V, E>): void;
    onStatus(status: RoomStatus): void;
  }
) {
  const { rules } = spec;
  const saved = opts.resume ? load<Saved<S, C>>(savedKey(spec.game)) : null;
  let config = saved?.config ?? opts.config;
  let level = saved?.level ?? opts.level;
  let round = saved?.round ?? 0;
  const members: Member[] = saved
    ? saved.members.map((m) => ({ ...m, ch: null }))
    : [{ name: cleanName(opts.name) || "Host", kind: "host", id: null, ch: null }];
  if (!saved) resize();
  let table: ReturnType<typeof createTable<S, A, V, E>> | null = null;
  let listener: { close(): void } | null = null;
  let closed = false;

  function resize() {
    const n = spec.seatsFor(config);
    while (members.length < n) members.push({ name: "", kind: "open", id: null, ch: null });
    // Only open seats are ever dropped; the lobby won't offer fewer seats than people.
    while (members.length > n && members[members.length - 1].kind === "open") members.pop();
  }

  const lobbyFor = (you: number): Lobby<C> => ({
    code: opts.code,
    config,
    level,
    started: !!table,
    you,
    seats: members.map((m) => ({ name: m.name, kind: m.kind, online: m.kind !== "guest" || !!m.ch })),
  });

  function persist() {
    save(savedKey(spec.game), {
      code: opts.code,
      config,
      level,
      round,
      members: members.map(({ name, kind, id }) => ({ name, kind, id })),
      state: table?.state ?? null,
    } satisfies Saved<S, C>);
  }

  function broadcastLobby() {
    members.forEach((m, i) => m.ch?.send({ t: "lobby", lobby: lobbyFor(i) } satisfies ToGuest<V, E, C>));
    opts.onLobby(lobbyFor(0));
    persist();
  }

  const updateFor = (seat: number, events: E[], reset: boolean): Update<V, E> => ({
    events: events.map((e) => rules.redact(e, seat)),
    view: rules.view(table!.state, seat),
    reset,
  });

  function sendUpdates(events: E[], reset: boolean) {
    members.forEach((m, i) => m.ch?.send({ t: "update", update: updateFor(i, events, reset) } satisfies ToGuest<V, E, C>));
    opts.onUpdate(updateFor(0, events, reset));
    persist();
  }

  /** The first CPU name nobody at the table is already using. */
  const cpuName = (seat: number) => CPU_NAMES.find((n) => !members.some((m) => m.name.toLowerCase() === n.toLowerCase())) ?? `CPU ${seat}`;
  const seatsForTable = (): Seat[] =>
    members.map((m, i) => ({
      name: m.kind === "open" || (m.kind === "cpu" && !m.name) ? cpuName(i) : m.name,
      kind: m.kind === "host" ? "local" : m.kind === "guest" ? "remote" : "cpu",
      level,
      online: m.kind !== "guest" || !!m.ch,
    }));

  function open(state: S, events: E[]) {
    table?.dispose();
    // Seats nobody took become the CPU's for this game.
    members.forEach((m, i) => {
      if (m.kind === "open") Object.assign(m, { kind: "cpu", name: cpuName(i) });
    });
    table = createTable(rules, state, seatsForTable(), (evs) => sendUpdates(evs, false));
    broadcastLobby();
    sendUpdates(events, true);
    table.run();
  }

  function onGuest(ch: Channel) {
    let seat = -1;
    ch.onMessage = (raw) => {
      const msg = raw as ToHost;
      if (!msg || typeof msg !== "object") return;
      if (msg.t === "hello" && seat < 0) {
        if (msg.v !== PROTOCOL) return reject(ch, "version");
        const id = String(msg.id).slice(0, 64);
        const name = cleanName(String(msg.name ?? "")) || "Guest";
        // Back after a drop: their seat is waiting, even if the CPU stood in. A
        // new tab has a new id (phones kill background tabs), so a game under
        // way also matches an offline player by name.
        seat = members.findIndex((m) => m.id === id);
        if (seat < 0 && table) {
          seat = members.findIndex((m) => m.id && !m.ch && m.name.toLowerCase() === name.toLowerCase());
          if (seat >= 0) members[seat].id = id;
        }
        if (seat >= 0) {
          const m = members[seat];
          // Retire the old link quietly, so its close doesn't free the seat being handed back.
          if (m.ch) {
            m.ch.onClose = () => {};
            m.ch.close();
          }
          Object.assign(m, { ch, name, kind: "guest" });
        } else {
          if (table) return reject(ch, "started");
          seat = members.findIndex((m) => m.kind === "open");
          if (seat < 0) return reject(ch, "full");
          Object.assign(members[seat], { name, kind: "guest", id, ch });
        }
        if (table) Object.assign(table.seats[seat], { kind: "remote", online: true, name });
        // The lobby first, since it tells the guest which seat is theirs.
        broadcastLobby();
        if (table) {
          ch.send({ t: "update", update: updateFor(seat, [], true) } satisfies ToGuest<V, E, C>);
          table.run();
        }
      } else if (msg.t === "act" && seat >= 0 && table) {
        const action = rules.parse(msg.a);
        if (action) table.act(seat, action);
      } else if (msg.t === "leave" && seat >= 0) {
        ch.close();
      }
    };
    ch.onClose = () => {
      if (seat < 0 || members[seat].ch !== ch) return;
      const m = members[seat];
      m.ch = null;
      if (!table) Object.assign(m, { kind: "open", name: "", id: null });
      else if (table.seats[seat].kind === "remote") table.seats[seat].online = false;
      if (!closed) broadcastLobby();
    };
  }

  function reject(ch: Channel, why: "full" | "started" | "version") {
    ch.send({ t: "reject", why } satisfies ToGuest<V, E, C>);
    setTimeout(() => ch.close(), 500);
  }

  const ready = (async () => {
    opts.onStatus({ state: "connecting" });
    // After a reload the broker can take a few seconds to let go of the old registration.
    for (let attempt = 0; ; attempt++) {
      try {
        listener = await listen(spec.game, opts.code, onGuest);
        break;
      } catch (err) {
        const reason = err instanceof NetFailure ? err.reason : "offline";
        if (closed) return;
        if (reason === "taken" && saved && attempt < 6) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        opts.onStatus({ state: "failed", reason });
        throw err;
      }
    }
    if (closed) {
      listener.close();
      return;
    }
    opts.onStatus({ state: "open" });
    if (saved?.state) {
      table = createTable(rules, saved.state, seatsForTable(), (evs) => sendUpdates(evs, false));
      // Guests are offline until they redial.
      table.seats.forEach((s) => s.kind === "remote" && (s.online = false));
      broadcastLobby();
      opts.onUpdate(updateFor(0, [], true));
      table.run();
    } else {
      broadcastLobby();
    }
  })();

  return {
    ready,
    setConfig(next: C) {
      if (table) return;
      config = next;
      resize();
      broadcastLobby();
    },
    setLevel(next: Level) {
      level = next;
      if (table) table.seats.forEach((s) => (s.level = next));
      broadcastLobby();
    },
    start() {
      if (!members.some((m) => m.kind === "guest")) return;
      const { state, events } = spec.create(config, round);
      open(state, events);
    },
    rematch() {
      if (!table) return;
      round++;
      const { state, events } = spec.create(config, round);
      open(state, events);
    },
    /** Back to the lobby with everyone still connected, to change the settings. */
    toLobby() {
      table?.dispose();
      table = null;
      members.forEach((m) => {
        if (m.kind === "cpu") Object.assign(m, { kind: "open", name: "", id: null });
        if (m.kind === "guest" && !m.ch) Object.assign(m, { kind: "open", name: "", id: null });
      });
      resize();
      broadcastLobby();
    },
    act(action: A) {
      table?.act(0, action);
    },
    /** Lets the CPU play a seat whose player has dropped out. They get it back if they return. */
    cpuFor(seat: number) {
      if (!table || members[seat]?.kind !== "guest" || members[seat].ch) return;
      members[seat].kind = "cpu";
      Object.assign(table.seats[seat], { kind: "cpu", online: true });
      broadcastLobby();
      table.run();
    },
    close() {
      closed = true;
      table?.dispose();
      members.forEach((m) => {
        m.ch?.send({ t: "closed" } satisfies ToGuest<V, E, C>);
        const ch = m.ch;
        m.ch = null;
        setTimeout(() => ch?.close(), 300);
      });
      // Give the goodbyes a moment to go out before the connection is torn down.
      const line = listener;
      setTimeout(() => line?.close(), 350);
      save(savedKey(spec.game), null);
    },
  };
}

export type HostRoom = ReturnType<typeof hostRoom>;

type Joined = { id: string; name: string };
const joinedKey = (code: string) => `games:guest:${code}`;

/** The name this tab joined a room under, so a reload can walk straight back in. */
export const joinedAs = (code: string) => load<Joined>(joinedKey(code))?.name ?? null;

function guestId(code: string, name: string) {
  const id = load<Joined>(joinedKey(code))?.id ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  save(joinedKey(code), { id, name } satisfies Joined);
  return id;
}

export function joinRoom<V, E, C>(
  game: string,
  opts: {
    code: string;
    name: string;
    onLobby(lobby: Lobby<C>): void;
    onUpdate(update: Update<V, E>): void;
    onStatus(status: RoomStatus): void;
  }
) {
  const id = guestId(opts.code, cleanName(opts.name) || "Guest");
  let line: Awaited<ReturnType<typeof dialer>> | null = null;
  let ch: Channel | null = null;
  let left = false;
  let lostAt = 0;

  const fail = (reason: Extract<RoomStatus, { state: "failed" }>["reason"]) => {
    left = true;
    save(joinedKey(opts.code), null);
    opts.onStatus({ state: "failed", reason });
    line?.close();
  };

  async function connect(): Promise<void> {
    if (left || !line) return;
    try {
      const next = await line.dial();
      if (left) return next.close();
      ch = next;
      lostAt = 0;
      next.onMessage = (raw) => {
        const msg = raw as ToGuest<V, E, C>;
        if (msg?.t === "lobby") opts.onLobby(msg.lobby);
        else if (msg?.t === "update") opts.onUpdate(msg.update);
        else if (msg?.t === "reject") fail(msg.why);
        else if (msg?.t === "closed") fail("closed");
      };
      next.onClose = () => {
        if (left || ch !== next) return;
        ch = null;
        lostAt ||= Date.now();
        opts.onStatus({ state: "reconnecting" });
        setTimeout(connect, 1500);
      };
      next.send({ t: "hello", v: PROTOCOL, id, name: cleanName(opts.name) || "Guest" } satisfies ToHost);
      opts.onStatus({ state: "open" });
    } catch (err) {
      if (left) return;
      const reason = err instanceof NetFailure ? err.reason : "offline";
      // First contact: say what went wrong. Mid-game: keep trying for a while, the host may be reloading.
      if (!lostAt) return fail(reason);
      if (Date.now() - lostAt > GIVE_UP_AFTER) return fail("lost");
      setTimeout(connect, 2000);
    }
  }

  const ready = (async () => {
    opts.onStatus({ state: "connecting" });
    try {
      line = await dialer(game, opts.code);
    } catch (err) {
      fail(err instanceof NetFailure ? err.reason : "offline");
      return;
    }
    await connect();
  })();

  return {
    ready,
    act(action: unknown) {
      ch?.send({ t: "act", a: action } satisfies ToHost);
    },
    leave() {
      left = true;
      save(joinedKey(opts.code), null);
      ch?.send({ t: "leave" } satisfies ToHost);
      const last = ch;
      setTimeout(() => {
        last?.close();
        line?.close();
      }, 200);
    },
  };
}

export type GuestRoom = ReturnType<typeof joinRoom>;
