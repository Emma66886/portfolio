/**
 * The referee for the turn-based games (Whot and Ludo). A game supplies its
 * rules as pure functions over a plain, JSON-safe state; the table holds that
 * state, takes moves from whoever's turn it is, plays the CPU seats, and
 * reports every change as a list of events for the screens to animate.
 *
 * The same table runs a game against the CPU, on one shared screen, and
 * online, where it lives in the host's browser and the guests' moves arrive
 * over the network. Only the host ever holds the whole state.
 */

export type Level = "easy" | "normal" | "hard";
export const LEVELS: Record<Level, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/** What the CPU seats are called, in seat order after the people. */
export const CPU_NAMES = ["Kinem", "Ada", "Kemi"];

/** "local" is a person at this screen, "remote" a person in another browser. */
export type SeatKind = "local" | "cpu" | "remote";

export type Seat = {
  name: string;
  kind: SeatKind;
  /** How well the seat plays when the CPU has it. */
  level: Level;
  /** False while a remote player's connection is down. */
  online: boolean;
};

export interface Rules<S, A, V, E> {
  /** Plays a move, changing `state`. Null when the move isn't allowed, and the state is untouched. */
  apply(state: S, seat: number, action: A): E[] | null;
  /** What one seat can see. Seat -1 sees only what's public. */
  view(state: S, seat: number): V;
  /** An event as one seat should hear it, with anything private to others removed. */
  redact(event: E, seat: number): E;
  /** The seat the game is waiting on, or null once it's over. */
  turn(state: S): number | null;
  /** The CPU's move. It only reads what that seat could see at a real table. */
  cpu(state: S, seat: number, level: Level): A;
  /** A move to make for a person, because there's nothing about it for them to choose. */
  forced(state: S): A | null;
  /** How long, in milliseconds, the screen takes to animate these events. */
  pace(events: E[]): number;
  /** Untrusted input from another browser, checked and turned into an action, or null. */
  parse(raw: unknown): A | null;
}

/** A CPU waits this long after the screen catches up, so its move reads as a decision. */
const THINK = { min: 550, spread: 450 };
const FORCED_DELAY = 380;

export type Table<S, A> = ReturnType<typeof createTable<S, A, unknown, unknown>>;

export function createTable<S, A, V, E>(
  rules: Rules<S, A, V, E>,
  state: S,
  seats: Seat[],
  /** Every change, with full information. Whoever shows it redacts it per seat. */
  onEvents: (events: E[]) => void
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busyUntil = 0;
  let disposed = false;

  const commit = (seat: number, action: A) => {
    const events = rules.apply(state, seat, action);
    if (!events) return false;
    const now = Date.now();
    busyUntil = Math.max(now, busyUntil) + rules.pace(events);
    onEvents(events);
    schedule();
    return true;
  };

  /** Lines up the next move the table makes by itself: a CPU's, or a forced one. */
  function schedule() {
    clearTimeout(timer);
    if (disposed) return;
    const seat = rules.turn(state);
    if (seat === null) return;
    const cpu = seats[seat].kind === "cpu";
    if (!cpu && !rules.forced(state)) return;
    const wait = Math.max(0, busyUntil - Date.now()) + (cpu ? THINK.min + Math.random() * THINK.spread : FORCED_DELAY);
    timer = setTimeout(() => {
      if (disposed || rules.turn(state) !== seat) return;
      const action = seats[seat].kind === "cpu" ? rules.cpu(state, seat, seats[seat].level) : rules.forced(state);
      if (action) commit(seat, action);
    }, wait);
  }

  return {
    state,
    seats,
    /** A person's move. False when it isn't their turn or the move isn't allowed. */
    act(seat: number, action: A) {
      if (disposed || rules.turn(state) !== seat || seats[seat].kind === "cpu") return false;
      return commit(seat, action);
    },
    /** Starts the table, or picks up again after a seat has changed hands. */
    run: schedule,
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
