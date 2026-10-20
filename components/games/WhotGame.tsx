"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FullscreenButton, HelpIcon, LeaveIcon, SoundIcon } from "@/components/games/GameIcons";
import { DropNotice, JoinForm, Lobby, NameField, useSavedName } from "@/components/games/OnlinePanels";
import { timeAgo } from "@/lib/games/format";
import { anyTapped, BUTTON, createGamepads } from "@/lib/games/gamepad";
import { getPref, setPref, type WhotRound } from "@/lib/games/history";
import { cleanCode } from "@/lib/games/net/peer";
import { hostedCode, joinedAs } from "@/lib/games/net/room";
import { newSeed } from "@/lib/games/rng";
import { summarizeWhot } from "@/lib/games/stats";
import { CPU_NAMES, LEVELS, type Level, type Seat } from "@/lib/games/table";
import { useFullscreen } from "@/lib/games/useFullscreen";
import { useSession, type SessionUpdate } from "@/lib/games/useSession";
import {
  DEALS,
  DECK,
  PACE,
  SHAPE_NAMES,
  SHAPES,
  SPECIALS,
  createWhot,
  paceWhot,
  whotRules,
  type Shape,
  type WhotConfig,
  type WhotEvent,
  type WhotView,
} from "@/lib/games/whot/engine";
import type { WhotScene } from "@/lib/games/whot/scene";
import { createSound } from "@/lib/games/whot/sound";

const GAME = "whot";
const SETTINGS_KEY = `${GAME}:settings`;

const SPEC = {
  game: GAME,
  rules: whotRules,
  hidden: true,
  seatsFor: (c: WhotConfig) => c.players,
  // The first turn moves one seat round with every rematch.
  create: (c: WhotConfig, round: number) => createWhot(c, newSeed(), round),
};

type Mode = "cpu" | "local" | "online";
type Screen = "loading" | "menu" | "join" | "lobby" | "playing" | "over" | "unsupported";
type Settings = { mode: Mode; opponents: number; friends: number; online: number; level: Level; deal: number; muted: boolean };
type Hud = { view: WhotView; you: number; handoff: number | null };
type Result = { winner: number; me: number; ending: "out" | "count"; counts: number[]; totals: number[] | null; turns: number; picked: number; saved: boolean | null };

const DEFAULT_SETTINGS: Settings = { mode: "cpu", opponents: 1, friends: 2, online: 2, level: "normal", deal: 5, muted: false };
const EMPTY_VIEW: WhotView = {
  you: 0,
  hand: [],
  counts: [0, 0],
  pile: [],
  market: 0,
  turn: 0,
  call: null,
  pick: null,
  playable: [],
  winner: null,
  ending: null,
  totals: null,
};

export function ShapeIcon({ shape, size = 22 }: { shape: Shape; size?: number }) {
  const paths: Record<Shape, React.ReactNode> = {
    circle: <circle cx="12" cy="12" r="8.5" />,
    triangle: <path d="M12 3.5 21.5 20h-19z" />,
    cross: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
    square: <rect x="4" y="4" width="16" height="16" />,
    star: <path d="m12 2.5 2.7 6.4 6.9.5-5.3 4.5 1.7 6.7L12 17l-5.9 3.6 1.7-6.7L2.5 9.4l6.9-.5z" />,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      {paths[shape]}
    </svg>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const PICKS: Record<number, string> = { 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };

function welcomeLine(status: string, rounds: WhotRound[]) {
  if (status === "unavailable") return "This browser isn't letting the site store anything, so games won't be saved this time.";
  if (status !== "ready" || !rounds.length) {
    return "Nigeria's favourite card game. Play the CPU, pass the phone round, or send a friend a link.";
  }
  const { played, wins, losses, online } = summarizeWhot(rounds);
  const last = rounds[0];
  if (!played) return `Welcome back. Your last game was ${timeAgo(last.endedAt)}, with friends on one screen.`;
  return `Welcome back. You're ${wins}-${losses}${online ? `, ${online} online` : ""}. Last game ${timeAgo(last.endedAt)}.`;
}

export default function WhotGame({
  rounds,
  status,
  onRoundEnd,
}: {
  rounds: WhotRound[];
  status: "loading" | "ready" | "unavailable";
  onRoundEnd: (record: WhotRound) => Promise<boolean>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hud, setHud] = useState<Hud>({ view: EMPTY_VIEW, you: 0, handoff: null });
  const [myMove, setMyMove] = useState(false);
  const [calling, setCalling] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ text: string; sub?: string; key: number } | null>(null);
  const [anchors, setAnchors] = useState<ReturnType<WhotScene["anchors"]>>({ seats: [], market: { x: 0.4, y: 0.5 } });
  const [result, setResult] = useState<Result | null>(null);
  const [panel, setPanel] = useState<"rules" | "leave" | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [name, setName] = useSavedName();
  const fs = useFullscreen(stageRef);

  const screenRef = useRef<Screen>("loading");
  const settingsRef = useRef(settings);
  const sceneRef = useRef<WhotScene | null>(null);
  const soundRef = useRef<ReturnType<typeof createSound> | null>(null);
  const hudRef = useRef(hud);
  const queue = useRef<SessionUpdate<WhotView, WhotEvent>[]>([]);
  const busyUntil = useRef(0);
  /** A move has been sent and its update hasn't come back yet. */
  const waiting = useRef(false);
  const myMoveRef = useRef(false);
  const kickRef = useRef<() => void>(() => {});
  const toggleFullscreen = useRef(fs.toggle);
  const onRoundEndRef = useRef(onRoundEnd);
  const game = useRef({ started: 0, picked: [] as number[], turns: 0, recorded: true, deal: 5 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    onRoundEndRef.current = onRoundEnd;
    toggleFullscreen.current = fs.toggle;
  }, [onRoundEnd, fs.toggle]);

  const go = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
    kickRef.current();
  }, []);

  // ---- Saved settings ----
  useEffect(() => {
    getPref<Partial<Settings>>(SETTINGS_KEY).then(
      (saved) => saved && setSettings((s) => ({ ...s, ...saved })),
      () => {}
    );
  }, []);
  const updateSettings = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      setPref(SETTINGS_KEY, next).catch(() => {});
      return next;
    });
  useEffect(() => {
    settingsRef.current = settings;
    soundRef.current?.setMuted(settings.muted);
  }, [settings]);

  // ---- Updates from the session, played back in order behind the animations ----
  const onUpdate = useCallback((u: SessionUpdate<WhotView, WhotEvent>) => {
    queue.current.push(u);
    kickRef.current();
  }, []);
  const session = useSession(SPEC, onUpdate);
  const { info, act, hostGame, join } = session;
  const infoRef = useRef(info);
  useEffect(() => {
    infoRef.current = info;
  }, [info]);

  const names = useCallback((seat: number) => {
    const s = infoRef.current.seats[seat];
    if (!s) return `Player ${seat + 1}`;
    return s.kind === "you" && infoRef.current.role === "local" ? "You" : s.name;
  }, []);

  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const finish = useCallback((view: WhotView, winner: number) => {
    const g = game.current;
    if (g.recorded) return;
    g.recorded = true;
    const { role, seats, lobby } = infoRef.current;
    const people = seats.filter((s) => s.kind === "person" || s.kind === "you").length;
    const mode: WhotRound["mode"] = role === "local" ? (people > 1 ? "local" : "cpu") : "online";
    const me = role === "local" ? Math.max(0, seats.findIndex((s) => s.kind === "you")) : (lobby?.you ?? 0);
    const cpus = seats.some((s) => s.kind === "cpu");
    const r: Result = {
      winner,
      me,
      ending: view.ending ?? "out",
      counts: view.counts,
      totals: view.totals,
      turns: g.turns,
      picked: g.picked[me] ?? 0,
      saved: null,
    };
    setResult(r);
    soundRef.current?.over(mode === "local" || winner === me);
    go("over");
    onRoundEndRef
      .current({
        game: GAME,
        mode,
        result: winner === me ? "win" : "loss",
        players: view.counts.length,
        winner: names(winner),
        difficulty: cpus ? (lobby?.level ?? settingsRef.current.level) : null,
        deal: g.deal,
        cardsLeft: view.counts[me],
        picked: r.picked,
        ending: r.ending,
        turns: g.turns,
        duration: Math.round((Date.now() - g.started) / 1000),
        endedAt: Date.now(),
      })
      .then((saved) => setResult((x) => (x ? { ...x, saved } : x)));
  }, [go, names]);

  /** Shows one update: animates it, plays its sounds and flashes, and refreshes the HUD. */
  const present = useCallback(
    (u: SessionUpdate<WhotView, WhotEvent>) => {
      const scene = sceneRef.current!;
      const sound = soundRef.current;
      const deal = u.events.find((e) => e.type === "deal");
      waiting.current = false;
      if (deal) {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        game.current = { started: Date.now(), picked: deal.counts.map(() => 0), turns: 0, recorded: false, deal: deal.counts[0] };
        setResult(null);
        setFlash(null);
        setCalling(null);
        setFocus(null);
        scene.setFocus(null);
        if (screenRef.current !== "playing") go("playing");
      }
      if (u.reset && !deal && game.current.recorded && u.view.winner === null) {
        // Picked up part way through after a reload: count from here, and still save the result.
        game.current = {
          started: Date.now(),
          picked: u.view.counts.map(() => 0),
          turns: 0,
          recorded: false,
          deal: infoRef.current.lobby?.config.deal ?? settingsRef.current.deal,
        };
      }
      if (u.reset && !deal) {
        scene.reset(u.view);
        // Rejoining a game already under way, or a host picking up after a reload.
        if (screenRef.current !== "playing" && screenRef.current !== "over") go("playing");
      } else scene.apply(u.events, u.view);
      const ms = u.events.length ? paceWhot(u.events) : 380;
      busyUntil.current = performance.now() + ms;

      let t = 0;
      for (const e of u.events) {
        if (e.type === "deal") {
          const cards = e.counts.reduce((a, b) => a + b, 0);
          sound?.deal(cards + 1, PACE.dealCard / 1000);
          t += cards * PACE.dealCard + PACE.dealSettle;
          setAnnounce(`New game, ${plural(e.counts[0], "card")} each.`);
        } else if (e.type === "play") {
          sound?.play(t / 1000 + 0.38);
          const card = DECK[e.card];
          const at = t;
          if (card.suit === "whot" && e.call) {
            later(at + 400, () => setFlash({ text: `${names(e.seat)} called ${SHAPE_NAMES[e.call!].many}`, key: performance.now() }));
          }
          setAnnounce(`${names(e.seat)} played ${card.suit === "whot" ? "a Whot" : `${card.n} ${SHAPE_NAMES[card.suit].one}`}.`);
          t += PACE.play;
        } else if (e.type === "draw") {
          for (let i = 0; i < e.cards.length; i++) sound?.draw(t / 1000 + i * (PACE.drawCard / 1000));
          game.current.picked[e.seat] = (game.current.picked[e.seat] ?? 0) + e.cards.length;
          if (e.why === "market") setAnnounce(`${names(e.seat)} went to market.`);
          t += e.cards.length * PACE.drawCard + 120;
        } else if (e.type === "refill") {
          later(t, () => setFlash({ text: "Market's empty", sub: "The pile goes back in", key: performance.now() }));
          t += PACE.refill;
        } else if (e.type === "hold" || e.type === "suspend" || e.type === "general" || e.type === "pick") {
          const at = t;
          const who = names(e.seat);
          const text =
            e.type === "pick"
              ? [`Pick ${PICKS[e.count] ?? e.count}`, `${who}, pass it on or pick`]
              : e.type === "hold"
                ? ["Hold on", `${who} plays again`]
                : e.type === "suspend"
                  ? ["Suspension", `${who} misses a turn`]
                  : ["General market", "Everyone else picks one"];
          later(at, () => {
            setFlash({ text: text[0], sub: text[1], key: performance.now() });
            if (e.type === "pick") sound?.pick();
            else sound?.special();
          });
          setAnnounce(`${text[0]}. ${text[1]}.`);
          t += PACE.flash;
        } else if (e.type === "last") {
          later(t, () => {
            setFlash({ text: "Last card!", sub: names(e.seat), key: performance.now() });
            sound?.last();
          });
        } else if (e.type === "turn") {
          game.current.turns++;
        } else if (e.type === "over") {
          const winner = e.winner;
          later(t + 250, () => {
            setFlash({ text: e.ending === "out" ? "Check up!" : "Cards counted", sub: `${names(winner)} wins`, key: performance.now() });
          });
          later(t + 1300, () => finish(u.view, winner));
        }
      }

      scene.setTable({ turn: u.view.winner === null ? u.view.turn : -1, call: u.view.call });
      const h = { view: u.view, you: u.you, handoff: u.handoff };
      hudRef.current = h;
      setHud(h);
      setAnchors(scene.anchors());
    },
    [finish, go, names]
  );

  // ---- Moves ----
  const playCard = useCallback(
    (card: number) => {
      const { view } = hudRef.current;
      if (!myMoveRef.current) return;
      if (!view.playable.includes(card)) {
        setFlash({ text: "That one doesn't match", sub: view.pick ? `Only a ${view.pick.n} passes the pick on` : undefined, key: performance.now() });
        return;
      }
      if (DECK[card].suit === "whot") {
        setCalling(card);
        return;
      }
      waiting.current = true;
      setFocus(null);
      sceneRef.current?.setFocus(null);
      act({ type: "play", card });
    },
    [act]
  );

  const call = useCallback(
    (shape: Shape) => {
      if (calling === null || !myMoveRef.current) return;
      waiting.current = true;
      setCalling(null);
      setFocus(null);
      sceneRef.current?.setFocus(null);
      act({ type: "play", card: calling, call: shape });
    },
    [calling, act]
  );

  const goToMarket = useCallback(() => {
    if (!myMoveRef.current) return;
    waiting.current = true;
    setFocus(null);
    sceneRef.current?.setFocus(null);
    act({ type: "draw" });
  }, [act]);

  const focusRef = useRef(focus);
  const callingRef = useRef(calling);
  useEffect(() => {
    focusRef.current = focus;
    callingRef.current = calling;
    sceneRef.current?.setFocus(focus);
  }, [focus, calling]);

  /** Steps the keyboard or gamepad selection through your hand. */
  const stepFocus = useCallback((dir: number) => {
    const order = sceneRef.current?.handOrder() ?? [];
    if (!order.length) return;
    const at = focusRef.current === null ? -1 : order.indexOf(focusRef.current);
    const next = at < 0 ? (dir > 0 ? 0 : order.length - 1) : (at + dir + order.length) % order.length;
    setFocus(order[next]);
  }, []);

  // ---- Scene, loop and input ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    let disposed = false;
    let frame = 0;
    let last = 0;
    let visible = true;
    const cleanups: (() => void)[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gamepads = createGamepads();
    soundRef.current = createSound();
    soundRef.current.setMuted(settingsRef.current.muted);

    const tick = (now: number) => {
      frame = 0;
      const scene = sceneRef.current;
      if (!scene || disposed) return;
      const dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;

      if (now >= busyUntil.current && queue.current.length) present(queue.current.shift()!);

      const { view, you, handoff } = hudRef.current;
      const live = screenRef.current === "playing";
      const mine =
        live &&
        !waiting.current &&
        !queue.current.length &&
        now >= busyUntil.current &&
        handoff === null &&
        view.winner === null &&
        you >= 0 &&
        view.turn === you;
      if (mine !== myMoveRef.current) {
        myMoveRef.current = mine;
        setMyMove(mine);
        if (mine) soundRef.current?.yourTurn();
      }
      scene.setInput({
        playable: mine ? view.playable : [],
        canDraw: mine,
        urgeDraw: mine && (!view.playable.length || !!view.pick),
      });

      // Gamepad: the d-pad or bumpers choose a card, A plays it, X goes to market.
      const pads = gamepads.poll();
      if (pads.length && mine && callingRef.current === null) {
        if (anyTapped(pads, BUTTON.LEFT, BUTTON.LB)) stepFocus(-1);
        if (anyTapped(pads, BUTTON.RIGHT, BUTTON.RB)) stepFocus(1);
        if (anyTapped(pads, BUTTON.A) && focusRef.current !== null) playCard(focusRef.current);
        if (anyTapped(pads, BUTTON.X, BUTTON.Y)) goToMarket();
      }

      scene.render(dt);
      if (visible && !document.hidden) frame ||= requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (!frame && !disposed && sceneRef.current) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    kickRef.current = kick;

    import("@/lib/games/whot/scene").then(({ createWhotScene }) => {
      if (disposed) return;
      try {
        sceneRef.current = createWhotScene(canvas, { reducedMotion });
      } catch {
        go("unsupported");
        return;
      }
      const rect = stage.getBoundingClientRect();
      sceneRef.current.resize(rect.width, rect.height);
      // An invite link, or this tab hosting a room before a reload.
      const code = cleanCode(new URLSearchParams(location.search).get("room") ?? "");
      if (code && hostedCode(GAME) === code) {
        hostGame({ players: settingsRef.current.online, deal: settingsRef.current.deal }, "", settingsRef.current.level, code);
        go("lobby");
      } else if (code && joinedAs(code)) {
        // Reloaded mid-game: take the same seat again.
        join(code, joinedAs(code)!);
        go("lobby");
      } else if (code) {
        setJoinCode(code);
        go("join");
      } else go("menu");
    });

    const resizer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      sceneRef.current?.resize(width, height);
      if (sceneRef.current) setAnchors(sceneRef.current.anchors());
      kick();
    });
    resizer.observe(stage);
    cleanups.push(() => resizer.disconnect());

    const seen = new IntersectionObserver(
      ([entry]) => {
        visible = entry.intersectionRatio > 0;
        if (visible) kick();
      },
      { threshold: [0, 0.1] }
    );
    seen.observe(stage);
    cleanups.push(() => seen.disconnect());
    const onVisibility = () => !document.hidden && kick();
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
    window.addEventListener("gamepadconnected", kick);
    cleanups.push(() => window.removeEventListener("gamepadconnected", kick));

    // Pointer: a mouse plays a card with one click. A finger picks a card up
    // first and plays it with a second tap, so a fat-fingered tap costs nothing.
    const at = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      return sceneRef.current?.hitTest((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height) ?? null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || screenRef.current !== "playing") return;
      const hit = at(e);
      sceneRef.current?.setHover(hit?.kind === "card" ? hit.card : null);
      canvas.style.cursor = hit && myMoveRef.current ? "pointer" : "";
    };
    const onDown = (e: PointerEvent) => {
      if (screenRef.current !== "playing" || (e.target as HTMLElement).closest("button, .game-overlay, .whot-call")) return;
      const hit = at(e);
      if (!hit) {
        setFocus(null);
        return;
      }
      if (hit.kind === "market") return goToMarket();
      if (e.pointerType === "mouse" || focusRef.current === hit.card) playCard(hit.card);
      else setFocus(hit.card);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerdown", onDown);
    cleanups.push(() => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerdown", onDown);
    });

    // Keyboard: arrows choose a card, Enter or Space plays it, M goes to
    // market, 1 to 5 call a shape after a Whot, F full screen.
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "f") {
        e.preventDefault();
        toggleFullscreen.current();
        return;
      }
      if (screenRef.current !== "playing") return;
      if (callingRef.current !== null) {
        const n = Number(k);
        if (n >= 1 && n <= 5) {
          e.preventDefault();
          callRef.current(SHAPES[n - 1]);
        } else if (k === "Escape") setCalling(null);
        return;
      }
      if (k === "ArrowLeft" || k === "ArrowRight") {
        e.preventDefault();
        stepFocus(k === "ArrowLeft" ? -1 : 1);
      } else if ((k === "Enter" || k === " ") && focusRef.current !== null && !(e.target as HTMLElement).closest("button, a")) {
        e.preventDefault();
        playCard(focusRef.current);
      } else if (k === "m" || k === "d") {
        e.preventDefault();
        goToMarket();
      }
    };
    window.addEventListener("keydown", onKey);
    cleanups.push(() => window.removeEventListener("keydown", onKey));

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanups.forEach((fn) => fn());
      timers.current.forEach(clearTimeout);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      soundRef.current?.dispose();
      soundRef.current = null;
      kickRef.current = () => {};
    };
  }, [go, present, playCard, goToMarket, stepFocus, hostGame, join]);

  const callRef = useRef(call);
  useEffect(() => {
    callRef.current = call;
  }, [call]);

  // Online: follow the room between its lobby and the table.
  useEffect(() => {
    if (info.role !== "host" && info.role !== "guest") return;
    const current = screenRef.current;
    if (info.status?.state === "failed") go("lobby");
    else if (info.lobby && !info.lobby.started && (current === "playing" || current === "over")) {
      queue.current = [];
      go("lobby");
    }
  }, [info, go]);

  // ---- Starting games ----
  const startLocal = () => {
    const s = settingsRef.current;
    soundRef.current?.unlock();
    queue.current = [];
    let seats: Seat[];
    if (s.mode === "cpu") {
      seats = [
        { name: "You", kind: "local", level: s.level, online: true },
        ...Array.from({ length: s.opponents }, (_, i) => ({ name: CPU_NAMES[i], kind: "cpu" as const, level: s.level, online: true })),
      ];
    } else {
      seats = Array.from({ length: s.friends }, (_, i) => ({ name: `Player ${i + 1}`, kind: "local" as const, level: s.level, online: true }));
    }
    session.startLocal({ players: seats.length, deal: s.deal }, seats);
  };

  const hostOnline = () => {
    const s = settingsRef.current;
    soundRef.current?.unlock();
    queue.current = [];
    session.hostGame({ players: s.online, deal: s.deal }, name, s.level);
    go("lobby");
  };

  const joinOnline = (code: string) => {
    soundRef.current?.unlock();
    queue.current = [];
    join(code, name);
    go("lobby");
  };

  const toMenu = () => {
    session.leave();
    queue.current = [];
    setPanel(null);
    setJoinCode(null);
    go("menu");
  };

  const { view, you, handoff } = hud;
  const role = info.role;
  const top = view.pile.length ? DECK[view.pile[view.pile.length - 1]] : null;
  const turnName = names(view.turn);
  const turnSeat = info.seats[view.turn];
  const shared = role === "local" && info.seats.filter((s) => s.kind === "person").length > 1;

  let prompt = "";
  if (screen === "playing" && view.winner === null && handoff === null && top) {
    if (!myMove) {
      prompt = you < 0 ? `${turnName}'s turn` : turnSeat?.kind === "cpu" ? `${turnName} is thinking…` : `${turnName}'s turn`;
    } else if (view.pick) {
      prompt = view.playable.length
        ? `Pick ${view.pick.count} coming your way. Pass it on with a ${view.pick.n}, or take them from the market`
        : `Nothing to pass it on with. Tap the market to pick ${view.pick.count}`;
    } else if (view.call) {
      const { one, many } = SHAPE_NAMES[view.call];
      prompt = view.playable.length ? `${many[0].toUpperCase()}${many.slice(1)} were called. Play a ${one} or a Whot` : `No ${many}. Go to market`;
    } else if (top) {
      const shape = SHAPE_NAMES[top.suit].one;
      prompt = view.playable.length ? `Your turn. Match the ${shape} or the ${top.n}` : `Nothing matches the ${top.n} ${shape}. Go to market`;
    }
  }

  const levelLabel = LEVELS[settings.level];
  const friendsHere = settings.mode === "local";
  const online = settings.mode === "online";

  return (
    <div className="game">
      <div ref={stageRef} className={`game-stage whot-stage${screen === "playing" ? " playing" : ""}${fs.filled ? " fill-window" : ""}`}>
        <canvas ref={canvasRef} className="game-canvas" aria-label="3D Whot card table" role="img" />

        {(screen === "playing" || screen === "over") && (
          <div className="table-hud" aria-hidden="true">
            {anchors.seats.map((a, seat) =>
              a && info.seats[seat] ? (
                <div
                  key={seat}
                  className={`seat-tag${view.turn === seat && view.winner === null ? " active" : ""}${info.seats[seat].online ? "" : " offline"}`}
                  style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
                >
                  <span className="seat-name">{names(seat)}</span>
                  <span className="seat-count">{plural(view.counts[seat] ?? 0, "card")}</span>
                  {view.counts[seat] === 1 && view.winner === null && <span className="seat-flag">Last card</span>}
                </div>
              ) : null
            )}
            <div className="whot-market-count" style={{ left: `${anchors.market.x * 100}%`, top: `${anchors.market.y * 100}%` }}>
              Market · {view.market}
            </div>
          </div>
        )}

        {screen === "playing" && <DropNotice info={info} onCpu={session.cpuFor} />}

        <div className="game-tools">
          {(screen === "playing" || screen === "over") && (
            <>
              <button
                type="button"
                className="game-tool"
                onClick={(e) => {
                  updateSettings({ muted: !settings.muted });
                  if (e.detail) e.currentTarget.blur();
                }}
                aria-pressed={settings.muted}
                aria-label={settings.muted ? "Turn sound on" : "Mute sound"}
              >
                <SoundIcon muted={settings.muted} />
              </button>
              <button type="button" className="game-tool" onClick={() => setPanel(panel === "rules" ? null : "rules")} aria-label="Card rules" aria-pressed={panel === "rules"}>
                <HelpIcon />
              </button>
              <button type="button" className="game-tool" onClick={() => setPanel("leave")} aria-label="Leave game">
                <LeaveIcon />
              </button>
            </>
          )}
          <FullscreenButton active={fs.fullscreen} onToggle={fs.toggle} />
        </div>

        {screen === "playing" && prompt && <p className={`game-prompt whot-prompt${myMove ? " mine" : ""}`}>{prompt}</p>}

        {screen === "playing" && myMove && (
          <button type="button" className={`whot-market${!view.playable.length || view.pick ? " urge" : ""}`} onClick={goToMarket}>
            {view.pick ? `Pick ${view.pick.count}` : "Go to market"}
            <span className="only-keys"> (M)</span>
          </button>
        )}

        {screen === "playing" && myMove && focus !== null && view.playable.includes(focus) && (
          <p className="whot-tap only-touch">Tap the card again to play it</p>
        )}

        {screen === "playing" && flash && (
          <p key={flash.key} className="game-flash whot-flash">
            {flash.text}
            {flash.sub && <span>{flash.sub}</span>}
          </p>
        )}

        {calling !== null && screen === "playing" && (
          <div className="whot-call" role="dialog" aria-label="Call a shape">
            <p>Whot! Call the next shape</p>
            <div>
              {SHAPES.map((shape, i) => (
                <button key={shape} type="button" onClick={() => call(shape)} autoFocus={i === 0}>
                  <ShapeIcon shape={shape} size={30} />
                  <span>{SHAPE_NAMES[shape].many}</span>
                  <kbd className="only-keys">{i + 1}</kbd>
                </button>
              ))}
            </div>
            <button type="button" className="game-link" onClick={() => setCalling(null)}>
              Keep the Whot for now
            </button>
          </div>
        )}

        {screen === "playing" && handoff !== null && (
          <div className="game-overlay whot-curtain">
            <div className="game-panel">
              <p className="section-eyebrow">Cards are hidden</p>
              <h2>Pass to {names(handoff)}</h2>
              <p className="game-copy">Everyone else, look away. {names(handoff)}, tap when you&apos;ve got the device.</p>
              <button type="button" className="btn btn-primary" onClick={session.reveal} autoFocus>
                Show my cards
              </button>
            </div>
          </div>
        )}

        {panel === "rules" && (screen === "playing" || screen === "over") && (
          <div className="game-overlay" onClick={() => setPanel(null)}>
            <div className="game-panel whot-rules" onClick={(e) => e.stopPropagation()}>
              <h2>The cards that do things</h2>
              <ul>
                {Object.entries(SPECIALS).map(([n, s]) => (
                  <li key={n}>
                    <strong>{n}</strong>
                    <span>
                      <b>{s.name}.</b> {s.does}.
                    </span>
                  </li>
                ))}
              </ul>
              <p className="game-keys">Follow the shape or the number. Can&apos;t, or won&apos;t? Go to market. First to play their last card wins.</p>
              <button type="button" className="btn btn-primary" onClick={() => setPanel(null)} autoFocus>
                Got it
              </button>
            </div>
          </div>
        )}

        {panel === "leave" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>Leave this game?</h2>
              <p className="game-copy">
                {role === "host"
                  ? "You're hosting, so this ends the game for everyone at the table."
                  : role === "guest"
                    ? "The CPU can take your seat if the host lets it."
                    : "It won't be saved to your history."}
              </p>
              <div className="game-actions">
                <button type="button" className="btn btn-primary" onClick={() => setPanel(null)} autoFocus>
                  Keep playing
                </button>
                <button type="button" className="btn btn-ghost" onClick={toMenu}>
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === "loading" && (
          <div className="game-overlay">
            <p className="game-loading">Shuffling the deck…</p>
          </div>
        )}

        {screen === "unsupported" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>This one needs WebGL</h2>
              <p className="game-copy">
                Your browser couldn&apos;t start a 3D context, so the table can&apos;t be drawn. Turning on hardware acceleration usually fixes it, or try another browser.
              </p>
            </div>
          </div>
        )}

        {screen === "menu" && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">Whot</p>
              <h2>{status === "ready" && rounds.length ? "Another round?" : "Shall we play?"}</h2>
              <p className="game-copy">{welcomeLine(status, rounds)}</p>

              <fieldset className="game-choice">
                <legend>Play</legend>
                {(
                  [
                    ["cpu", "Against the CPU"],
                    ["local", "Friends, one screen"],
                    ["online", "Online"],
                  ] as [Mode, string][]
                ).map(([value, label]) => (
                  <label key={value}>
                    <input type="radio" name="whot-mode" value={value} checked={settings.mode === value} onChange={() => updateSettings({ mode: value })} />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              {settings.mode === "cpu" && (
                <>
                  <fieldset className="game-choice">
                    <legend>Opponents</legend>
                    {[1, 2, 3].map((n) => (
                      <label key={n}>
                        <input type="radio" name="whot-opponents" checked={settings.opponents === n} onChange={() => updateSettings({ opponents: n })} />
                        <span>{n}</span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="game-choice">
                    <legend>CPU</legend>
                    {(Object.keys(LEVELS) as Level[]).map((l) => (
                      <label key={l}>
                        <input type="radio" name="whot-level" checked={settings.level === l} onChange={() => updateSettings({ level: l })} />
                        <span>{LEVELS[l]}</span>
                      </label>
                    ))}
                  </fieldset>
                </>
              )}

              {friendsHere && (
                <fieldset className="game-choice">
                  <legend>Players</legend>
                  {[2, 3, 4].map((n) => (
                    <label key={n}>
                      <input type="radio" name="whot-friends" checked={settings.friends === n} onChange={() => updateSettings({ friends: n })} />
                      <span>{n}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              {online && (
                <>
                  <fieldset className="game-choice">
                    <legend>Seats</legend>
                    {[2, 3, 4].map((n) => (
                      <label key={n}>
                        <input type="radio" name="whot-online" checked={settings.online === n} onChange={() => updateSettings({ online: n })} />
                        <span>{n}</span>
                      </label>
                    ))}
                  </fieldset>
                  <NameField id="whot-name" name={name} onName={setName} />
                </>
              )}

              <fieldset className="game-choice">
                <legend>Deal</legend>
                {DEALS.map((d) => (
                  <label key={d}>
                    <input type="radio" name="whot-deal" checked={settings.deal === d} onChange={() => updateSettings({ deal: d })} />
                    <span>{d} cards</span>
                  </label>
                ))}
              </fieldset>

              {online ? (
                <div className="game-actions">
                  <button type="button" className="btn btn-primary" onClick={hostOnline} disabled={!name.trim()}>
                    Create a game link
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => go("join")}>
                    I have a code
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary game-start" onClick={startLocal}>
                  Deal the cards
                </button>
              )}
              <p className="game-keys">
                {online
                  ? "Your friend just opens the link, no account or app needed. Empty seats go to the CPU."
                  : friendsHere
                    ? "Hands stay hidden: the game tells you when to pass the device."
                    : `${plural(settings.opponents, "opponent")} on ${levelLabel.toLowerCase()}. Click a card to play it, or use the arrow keys and Enter.`}
              </p>
            </div>
          </div>
        )}

        {screen === "join" && (
          <div className="game-overlay">
            <div className="game-panel">
              <JoinForm
                title="Whot"
                initialCode={joinCode}
                name={name}
                onName={setName}
                onJoin={joinOnline}
                onBack={toMenu}
              />
            </div>
          </div>
        )}

        {screen === "lobby" && (
          <div className="game-overlay">
            <div className="game-panel">
              <Lobby title="Whot" info={info} onStart={session.start} onLeave={toMenu}>
                {info.lobby && (
                  <>
                    <fieldset className="game-choice">
                      <legend>Seats</legend>
                      {[2, 3, 4].map((n) => {
                        const people = info.lobby!.seats.filter((s) => s.kind === "host" || s.kind === "guest").length;
                        return (
                          <label key={n}>
                            <input
                              type="radio"
                              name="whot-lobby-seats"
                              checked={info.lobby!.config.players === n}
                              disabled={n < people}
                              onChange={() => {
                                updateSettings({ online: n });
                                session.setConfig({ ...info.lobby!.config, players: n });
                              }}
                            />
                            <span>{n}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                    <fieldset className="game-choice">
                      <legend>Deal</legend>
                      {DEALS.map((d) => (
                        <label key={d}>
                          <input
                            type="radio"
                            name="whot-lobby-deal"
                            checked={info.lobby!.config.deal === d}
                            onChange={() => {
                              updateSettings({ deal: d });
                              session.setConfig({ ...info.lobby!.config, deal: d });
                            }}
                          />
                          <span>{d} cards</span>
                        </label>
                      ))}
                    </fieldset>
                    {info.lobby.seats.length > 2 && (
                      <fieldset className="game-choice">
                        <legend>CPU for empty seats</legend>
                        {(Object.keys(LEVELS) as Level[]).map((l) => (
                          <label key={l}>
                            <input
                              type="radio"
                              name="whot-lobby-level"
                              checked={info.lobby!.level === l}
                              onChange={() => {
                                updateSettings({ level: l });
                                session.setLevel(l);
                              }}
                            />
                            <span>{LEVELS[l]}</span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                  </>
                )}
              </Lobby>
            </div>
          </div>
        )}

        {screen === "over" && result && panel === null && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">{result.ending === "count" ? "The cards ran out" : role === "local" ? "Check up" : "Online game"}</p>
              <h2>
                {shared ? `${names(result.winner)} wins` : result.winner === result.me ? "You won!" : `${names(result.winner)} wins`}
              </h2>
              <ul className="game-stats">
                <li>
                  <strong>{result.counts[result.me]}</strong>
                  <span>{shared ? "P1 cards left" : "Cards left"}</span>
                </li>
                <li>
                  <strong>{result.turns}</strong>
                  <span>Turns</span>
                </li>
                <li>
                  <strong>{result.picked}</strong>
                  <span>Picked up</span>
                </li>
              </ul>
              {result.totals && (
                <p className="game-copy">
                  Hands counted: {result.totals.map((t, i) => `${names(i)} ${t}`).join(", ")}. Lowest wins.
                </p>
              )}
              <p className="game-keys" role="status">
                {result.saved === null ? "Saving to your history…" : result.saved ? "Saved to your history below." : "Couldn't save this one. Your browser is blocking site storage."}
              </p>
              <div className="game-actions">
                {role === "guest" ? (
                  <>
                    <p className="game-copy online-wait">
                      Waiting for {info.lobby?.seats[0]?.name ?? "the host"} to deal again
                      <span className="online-ellipsis" aria-hidden="true" />
                    </p>
                    <button type="button" className="btn btn-ghost" onClick={toMenu}>
                      Leave
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary" onClick={session.rematch} autoFocus>
                      {role === "host" ? "Rematch" : "Play again"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={role === "host" ? session.toLobby : toMenu}>
                      {role === "host" ? "Back to the lobby" : "Change settings"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p className="game-help">
        <span>
          Click a card to play it, or <kbd>←</kbd> <kbd>→</kbd> and <kbd>Enter</kbd>
        </span>
        <span>
          <kbd>M</kbd> go to market
        </span>
        <span>
          <kbd>1</kbd> to <kbd>5</kbd> call a shape
        </span>
        <span>
          <kbd>F</kbd> full screen
        </span>
      </p>
    </div>
  );
}
