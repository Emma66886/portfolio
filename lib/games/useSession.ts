"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { newCode } from "@/lib/games/net/peer";
import { hostRoom, joinRoom, type HostRoom, type GuestRoom, type Lobby, type RoomGame, type RoomStatus, type Update } from "@/lib/games/net/room";
import { createTable, type Level, type Seat } from "@/lib/games/table";

/** An update as the screen gets it, with whose eyes it's seen through. */
export type SessionUpdate<V, E> = Update<V, E> & {
  /** The seat whose hand is on show, or -1 while a pass screen hides every hand. */
  you: number;
  /** On one shared screen: the person to hand the device to before their hand is shown. */
  handoff: number | null;
};

export type SessionSeat = {
  name: string;
  /** "you" only when one person at this screen is playing; "person" for anyone else human. */
  kind: "you" | "person" | "cpu" | "open";
  online: boolean;
};

export type SessionInfo<C> = {
  role: "local" | "host" | "guest" | null;
  seats: SessionSeat[];
  lobby: Lobby<C> | null;
  status: RoomStatus | null;
  /** The room code while online. */
  code: string | null;
};

const IDLE: SessionInfo<never> = { role: null, seats: [], lobby: null, status: null, code: null };

export const roomLink = (code: string) => `${location.origin}${location.pathname}?room=${code}`;

function setRoomParam(code: string | null) {
  const url = new URL(location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  history.replaceState(history.state, "", url);
}

const seatsFromLobby = <C>(lobby: Lobby<C>): SessionSeat[] =>
  lobby.seats.map((s, i) => ({
    name: s.name,
    kind: i === lobby.you ? "you" : s.kind === "cpu" ? "cpu" : s.kind === "open" ? "open" : "person",
    online: s.online,
  }));

/**
 * One game session, whichever way it's being played: against the CPU or
 * friends on this screen, hosting an online room, or joining one. Updates go
 * to `onUpdate` in order, outside React state, so the game can queue them
 * behind its animations.
 */
export function useSession<S, A, V, E, C>(
  spec: RoomGame<S, A, V, E, C> & {
    /** Hands are private (Whot), so a shared screen hides them between players. */
    hidden: boolean;
  },
  onUpdate: (update: SessionUpdate<V, E>) => void
) {
  const [info, setInfo] = useState<SessionInfo<C>>(IDLE);
  const specRef = useRef(spec);
  const emit = useRef(onUpdate);
  useEffect(() => {
    emit.current = onUpdate;
  }, [onUpdate]);

  const local = useRef<{
    table: ReturnType<typeof createTable<S, A, V, E>>;
    config: C;
    round: number;
    shown: number;
    handoff: number | null;
  } | null>(null);
  const host = useRef<HostRoom | null>(null);
  const guest = useRef<GuestRoom | null>(null);
  const lobbyRef = useRef<Lobby<C> | null>(null);

  const stop = useCallback(() => {
    local.current?.table.dispose();
    local.current = null;
    host.current?.close();
    host.current = null;
    guest.current?.leave();
    guest.current = null;
    lobbyRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  // ---- On this screen ----

  const startLocal = useCallback(
    (config: C, seats: Seat[], round = 0) => {
      stop();
      const { rules, hidden } = specRef.current;
      const people = seats.filter((s) => s.kind === "local").length;
      const shared = hidden && people > 1;
      const first = seats.findIndex((s) => s.kind === "local");
      const { state, events } = specRef.current.create(config, round);
      const session = {
        config,
        round,
        // With hands to hide, nobody's are on show until the first player takes the device.
        shown: shared ? -1 : first,
        handoff: null as number | null,
        table: null as unknown as ReturnType<typeof createTable<S, A, V, E>>,
      };
      const send = (events: E[], reset: boolean) => {
        const seat = session.shown;
        emit.current({
          events: events.map((e) => rules.redact(e, seat)),
          view: rules.view(state, seat),
          reset,
          you: seat,
          handoff: session.handoff,
        });
      };
      const afterMove = (events: E[]) => {
        send(events, false);
        if (!shared) return;
        const turn = rules.turn(state);
        if (turn === null || turn === session.shown) return;
        // The turn has left the person holding the device: hide their hand, and
        // if the next turn is a person's, say who to pass it to.
        const handoff = seats[turn].kind === "local" ? turn : null;
        if (session.shown === -1 && session.handoff === handoff) return;
        session.shown = -1;
        session.handoff = handoff;
        send([], true);
      };
      session.table = createTable(rules, state, seats, afterMove);
      local.current = session;
      setInfo({
        role: "local",
        seats: seats.map((s) => ({
          name: s.name,
          kind: s.kind === "cpu" ? "cpu" : people === 1 ? "you" : "person",
          online: true,
        })),
        lobby: null,
        status: null,
        code: null,
      });
      const turn = rules.turn(state);
      if (shared && turn !== null && seats[turn].kind === "local") session.handoff = turn;
      send(events, true);
      session.table.run();
    },
    [stop]
  );

  /** On a shared screen: the next person has the device, so show their hand. */
  const reveal = useCallback(() => {
    const session = local.current;
    if (!session || session.handoff === null) return;
    const { rules } = specRef.current;
    session.shown = session.handoff;
    session.handoff = null;
    emit.current({ events: [], view: rules.view(session.table.state, session.shown), reset: true, you: session.shown, handoff: null });
  }, []);

  // ---- Online ----

  const hostGame = useCallback(
    (config: C, name: string, level: Level, resumeCode?: string) => {
      stop();
      const code = resumeCode ?? newCode();
      setRoomParam(code);
      setInfo({ ...IDLE, role: "host", code, status: { state: "connecting" } });
      const room = hostRoom(specRef.current, {
        code,
        name,
        config,
        level,
        resume: !!resumeCode,
        onLobby: (lobby) => {
          lobbyRef.current = lobby;
          setInfo((i) => ({ ...i, lobby, seats: seatsFromLobby(lobby) }));
        },
        onUpdate: (u) => emit.current({ ...u, you: 0, handoff: null }),
        onStatus: (status) => setInfo((i) => ({ ...i, status })),
      });
      room.ready.catch(() => {});
      host.current = room;
    },
    [stop]
  );

  const join = useCallback(
    (code: string, name: string) => {
      stop();
      setRoomParam(code);
      setInfo({ ...IDLE, role: "guest", code, status: { state: "connecting" } });
      guest.current = joinRoom<V, E, C>(specRef.current.game, {
        code,
        name,
        onLobby: (lobby) => {
          lobbyRef.current = lobby;
          setInfo((i) => ({ ...i, lobby, seats: seatsFromLobby(lobby) }));
        },
        onUpdate: (u) => emit.current({ ...u, you: lobbyRef.current?.you ?? -1, handoff: null }),
        onStatus: (status) => setInfo((i) => ({ ...i, status })),
      });
    },
    [stop]
  );

  // ---- Either way ----

  const act = useCallback((action: A) => {
    const session = local.current;
    if (session) {
      const { rules } = specRef.current;
      const turn = rules.turn(session.table.state);
      if (turn === null || session.handoff !== null || session.table.seats[turn].kind !== "local") return;
      // A shared screen only takes moves from the person whose hand is showing.
      if (session.shown >= 0 && specRef.current.hidden && session.shown !== turn) return;
      session.table.act(turn, action);
    } else if (host.current) host.current.act(action);
    else guest.current?.act(action);
  }, []);

  const rematch = useCallback(() => {
    const session = local.current;
    if (session) startLocal(session.config, session.table.seats, session.round + 1);
    else host.current?.rematch();
  }, [startLocal]);

  const leave = useCallback(() => {
    if (host.current || guest.current) setRoomParam(null);
    stop();
    setInfo(IDLE);
  }, [stop]);

  return {
    info,
    startLocal,
    reveal,
    hostGame,
    join,
    act,
    rematch,
    leave,
    /** Host only. */
    start: useCallback(() => host.current?.start(), []),
    toLobby: useCallback(() => host.current?.toLobby(), []),
    setConfig: useCallback((c: C) => host.current?.setConfig(c), []),
    setLevel: useCallback((l: Level) => host.current?.setLevel(l), []),
    cpuFor: useCallback((seat: number) => host.current?.cpuFor(seat), []),
  };
}

export type Session<S, A, V, E, C> = ReturnType<typeof useSession<S, A, V, E, C>>;
