"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FullscreenButton, LeaveIcon, SoundIcon } from "@/components/games/GameIcons";
import { DropNotice, JoinForm, Lobby, NameField, useSavedName } from "@/components/games/OnlinePanels";
import { timeAgo } from "@/lib/games/format";
import { anyTapped, BUTTON, createGamepads } from "@/lib/games/gamepad";
import { getPref, setPref, type LudoMatch } from "@/lib/games/history";
import {
  COLORS,
  HOME,
  PACE,
  PLAYER_COUNTS,
  createLudo,
  ludoRules,
  paceLudo,
  seatColors,
  type LudoConfig,
  type LudoEvent,
  type LudoView,
} from "@/lib/games/ludo/engine";
import type { LudoScene } from "@/lib/games/ludo/scene";
import { createSound } from "@/lib/games/ludo/sound";
import { cleanCode } from "@/lib/games/net/peer";
import { hostedCode, joinedAs } from "@/lib/games/net/room";
import { newSeed } from "@/lib/games/rng";
import { summarizeLudo } from "@/lib/games/stats";
import { CPU_NAMES, LEVELS, type Level, type Seat } from "@/lib/games/table";
import { useFullscreen } from "@/lib/games/useFullscreen";
import { useSession, type SessionUpdate } from "@/lib/games/useSession";

const GAME = "ludo";
const SETTINGS_KEY = `${GAME}:settings`;
/** The same colours as the 3D tokens, for the HUD. */
const HUD_COLORS = ["#C63B50", "#2F9E6E", "#E3B341", "#3B78C2"];

const SPEC = {
  game: GAME,
  rules: ludoRules,
  hidden: false,
  seatsFor: (c: LudoConfig) => c.players,
  create: (c: LudoConfig, round: number) => createLudo(c, newSeed(), round),
};

type Mode = "cpu" | "local" | "online";
type Screen = "loading" | "menu" | "join" | "lobby" | "playing" | "over" | "unsupported";
type Settings = { mode: Mode; opponents: number; friends: number; online: number; level: Level; color: number; muted: boolean };
type Hud = { view: LudoView };
type Tally = { sixes: number[]; captures: number[]; lost: number[] };
type Result = { winner: number; me: number; home: number; captures: number; lost: number; sixes: number; turns: number; saved: boolean | null };

const DEFAULT_SETTINGS: Settings = { mode: "cpu", opponents: 1, friends: 2, online: 2, level: "normal", color: 0, muted: false };
const EMPTY_VIEW: LudoView = { you: 0, colors: [0, 2], tokens: [[-1, -1, -1, -1], [-1, -1, -1, -1]], turn: 0, phase: "roll", roll: null, legal: [], winner: null };

const homeCount = (tokens: number[]) => tokens.filter((p) => p === HOME).length;
/** Every legal move starts from the same place, so the table makes it without asking. */
const onlyOneMove = (v: LudoView) => new Set(v.legal.map((t) => v.tokens[v.turn][t])).size === 1;

function welcomeLine(status: string, matches: LudoMatch[]) {
  if (status === "unavailable") return "This browser isn't letting the site store anything, so games won't be saved this time.";
  if (status !== "ready" || !matches.length) return "Roll a six to get out, race all four home, and knock anyone you land on back to the start.";
  const { played, wins, losses } = summarizeLudo(matches);
  if (!played) return `Welcome back. Your last game was ${timeAgo(matches[0].endedAt)}, with friends on one screen.`;
  return `Welcome back. You're ${wins}-${losses}. Last game ${timeAgo(matches[0].endedAt)}.`;
}

export default function LudoGame({
  matches,
  status,
  onMatchEnd,
}: {
  matches: LudoMatch[];
  status: "loading" | "ready" | "unavailable";
  onMatchEnd: (record: LudoMatch) => Promise<boolean>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hud, setHud] = useState<Hud>({ view: EMPTY_VIEW });
  const [myMove, setMyMove] = useState<"roll" | "move" | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ text: string; sub?: string; key: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [name, setName] = useSavedName();
  const fs = useFullscreen(stageRef);

  const screenRef = useRef<Screen>("loading");
  const settingsRef = useRef(settings);
  const sceneRef = useRef<LudoScene | null>(null);
  const soundRef = useRef<ReturnType<typeof createSound> | null>(null);
  const hudRef = useRef(hud);
  const queue = useRef<SessionUpdate<LudoView, LudoEvent>[]>([]);
  const busyUntil = useRef(0);
  const waiting = useRef(false);
  const myMoveRef = useRef<"roll" | "move" | null>(null);
  const focusRef = useRef<number | null>(null);
  const kickRef = useRef<() => void>(() => {});
  const toggleFullscreen = useRef(fs.toggle);
  const onMatchEndRef = useRef(onMatchEnd);
  const game = useRef({ started: 0, turns: 0, recorded: true, tally: { sixes: [], captures: [], lost: [] } as Tally });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    onMatchEndRef.current = onMatchEnd;
    toggleFullscreen.current = fs.toggle;
  }, [onMatchEnd, fs.toggle]);

  const go = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
    kickRef.current();
  }, []);

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

  const onUpdate = useCallback((u: SessionUpdate<LudoView, LudoEvent>) => {
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
  /** Whether the person at this screen plays this seat. */
  const controls = useCallback((seat: number) => {
    const { role, seats, lobby } = infoRef.current;
    if (role === "local") return seats[seat] ? seats[seat].kind !== "cpu" : false;
    return seat === lobby?.you;
  }, []);

  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  const finish = useCallback(
    (view: LudoView, winner: number) => {
      const g = game.current;
      if (g.recorded) return;
      g.recorded = true;
      const { role, seats, lobby } = infoRef.current;
      const people = seats.filter((s) => s.kind === "person" || s.kind === "you").length;
      const mode: LudoMatch["mode"] = role === "local" ? (people > 1 ? "local" : "cpu") : "online";
      const me = role === "local" ? Math.max(0, seats.findIndex((s) => s.kind === "you")) : (lobby?.you ?? 0);
      const r: Result = {
        winner,
        me,
        home: homeCount(view.tokens[me]),
        captures: g.tally.captures[me] ?? 0,
        lost: g.tally.lost[me] ?? 0,
        sixes: g.tally.sixes[me] ?? 0,
        turns: g.turns,
        saved: null,
      };
      setResult(r);
      soundRef.current?.over(mode === "local" || winner === me);
      go("over");
      onMatchEndRef
        .current({
          game: GAME,
          mode,
          result: winner === me ? "win" : "loss",
          players: view.colors.length,
          winner: names(winner),
          difficulty: seats.some((s) => s.kind === "cpu") ? (lobby?.level ?? settingsRef.current.level) : null,
          color: COLORS[view.colors[me]].name,
          home: r.home,
          captures: r.captures,
          lost: r.lost,
          sixes: r.sixes,
          turns: g.turns,
          duration: Math.round((Date.now() - g.started) / 1000),
          endedAt: Date.now(),
        })
        .then((saved) => setResult((x) => (x ? { ...x, saved } : x)));
    },
    [go, names]
  );

  const present = useCallback(
    (u: SessionUpdate<LudoView, LudoEvent>) => {
      const scene = sceneRef.current!;
      const sound = soundRef.current;
      waiting.current = false;
      const fresh = u.reset && u.view.winner === null && u.view.tokens.every((t) => t.every((p) => p === -1)) && u.view.roll === null;
      // A new game, or one picked up part way through after a reload, which still gets saved.
      if (fresh || (u.reset && game.current.recorded && u.view.winner === null)) {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        const n = u.view.colors.length;
        game.current = { started: Date.now(), turns: 0, recorded: false, tally: { sixes: Array(n).fill(0), captures: Array(n).fill(0), lost: Array(n).fill(0) } };
        setResult(null);
        setFlash(null);
        setFocus(null);
        if (fresh) setAnnounce(`New game. ${names(u.view.turn)} to roll first.`);
      }
      if (u.reset) {
        scene.reset(u.view);
        if (screenRef.current !== "playing") go("playing");
      } else scene.apply(u.events, u.view);
      busyUntil.current = performance.now() + (u.events.length ? paceLudo(u.events) : 300);

      let t = 0;
      const tally = game.current.tally;
      for (const e of u.events) {
        if (e.type === "roll") {
          sound?.roll();
          if (e.value === 6) tally.sixes[e.seat]++;
          const at = t;
          later(at + PACE.roll - 120, () => setAnnounce(`${names(e.seat)} rolled a ${e.value}.`));
          t += PACE.roll;
        } else if (e.type === "move") {
          if (e.from === -1) {
            later(t, () => sound?.leaveYard());
            t += PACE.leaveYard;
          } else {
            for (let i = 0; i < e.to - e.from; i++) sound?.hop(t / 1000 + (i + 0.7) * (PACE.step / 1000), i === e.to - e.from - 1);
            t += (e.to - e.from) * PACE.step + 120;
          }
        } else if (e.type === "capture") {
          tally.captures[e.seat]++;
          tally.lost[e.victim]++;
          sound?.capture(t / 1000);
          const at = t;
          later(at, () => setFlash({ text: "Captured!", sub: `${names(e.victim)} goes back to the yard`, key: performance.now() }));
          t += PACE.capture;
        } else if (e.type === "home") {
          sound?.home(t / 1000);
          const at = t;
          later(at, () => setFlash({ text: "Home!", sub: `${names(e.seat)} has ${homeCount(u.view.tokens[e.seat])} of 4 in`, key: performance.now() }));
          t += PACE.home;
        } else if (e.type === "stuck") {
          const at = t;
          later(at, () => {
            sound?.stuck();
            setFlash({ text: "No move", sub: "Nothing can go with that roll", key: performance.now() });
          });
          t += PACE.stuck;
        } else if (e.type === "forfeit") {
          const at = t;
          later(at, () => {
            sound?.stuck();
            setFlash({ text: "Three sixes", sub: "Turn over", key: performance.now() });
          });
          t += PACE.forfeit;
        } else if (e.type === "bonus" && e.why === "six") {
          const at = t;
          later(at, () => setFlash({ text: "Six!", sub: `${names(e.seat)} rolls again`, key: performance.now() }));
        } else if (e.type === "turn") {
          game.current.turns++;
        } else if (e.type === "over") {
          const winner = e.winner;
          later(t + 300, () => setFlash({ text: `${names(winner)} wins!`, key: performance.now() }));
          later(t + 1500, () => finish(u.view, winner));
        }
      }
      const h = { view: u.view };
      hudRef.current = h;
      setHud(h);
    },
    [finish, go, names]
  );

  const roll = useCallback(() => {
    if (myMoveRef.current !== "roll") return;
    waiting.current = true;
    act({ type: "roll" });
  }, [act]);

  const moveToken = useCallback(
    (token: number) => {
      if (myMoveRef.current !== "move" || !hudRef.current.view.legal.includes(token)) return;
      waiting.current = true;
      setFocus(null);
      act({ type: "move", token });
    },
    [act]
  );

  /** Steps the keyboard or gamepad choice through the tokens that can move. */
  const stepFocus = useCallback((dir: number) => {
    const legal = hudRef.current.view.legal;
    if (!legal.length) return;
    const at = focusRef.current === null ? -1 : legal.indexOf(focusRef.current);
    setFocus(legal[at < 0 ? (dir > 0 ? 0 : legal.length - 1) : (at + dir + legal.length) % legal.length]);
  }, []);

  useEffect(() => {
    focusRef.current = focus;
    sceneRef.current?.setFocus(focus);
  }, [focus]);

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

      const { view } = hudRef.current;
      const ready =
        screenRef.current === "playing" &&
        !waiting.current &&
        !queue.current.length &&
        now >= busyUntil.current &&
        view.winner === null &&
        controls(view.turn);
      const mine = !ready ? null : view.phase === "roll" ? "roll" : view.phase === "move" && !onlyOneMove(view) ? "move" : null;
      if (mine !== myMoveRef.current) {
        myMoveRef.current = mine;
        setMyMove(mine);
        if (mine === "roll") soundRef.current?.yourTurn();
        if (mine === "move" && view.legal.length) setFocus(null);
      }
      scene.setInput({ legal: mine === "move" ? view.legal : [], roll: mine === "roll" });

      // Gamepad: A rolls or moves the chosen token, the d-pad chooses.
      const pads = gamepads.poll();
      if (pads.length && mine) {
        if (mine === "roll" && anyTapped(pads, BUTTON.A, BUTTON.X)) roll();
        if (mine === "move") {
          if (anyTapped(pads, BUTTON.LEFT, BUTTON.UP, BUTTON.LB)) stepFocus(-1);
          if (anyTapped(pads, BUTTON.RIGHT, BUTTON.DOWN, BUTTON.RB)) stepFocus(1);
          if (anyTapped(pads, BUTTON.A) && focusRef.current !== null) moveToken(focusRef.current);
        }
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

    import("@/lib/games/ludo/scene").then(({ createLudoScene }) => {
      if (disposed) return;
      try {
        sceneRef.current = createLudoScene(canvas, { reducedMotion });
      } catch {
        go("unsupported");
        return;
      }
      const rect = stage.getBoundingClientRect();
      sceneRef.current.resize(rect.width, rect.height);
      sceneRef.current.reset({ ...EMPTY_VIEW, colors: [0, 1, 2, 3], tokens: Array.from({ length: 4 }, () => [-1, -1, -1, -1]), you: 0 });
      const code = cleanCode(new URLSearchParams(location.search).get("room") ?? "");
      const s = settingsRef.current;
      if (code && hostedCode(GAME) === code) {
        hostGame({ players: s.online, color: s.color }, "", s.level, code);
        go("lobby");
      } else if (code && joinedAs(code)) {
        join(code, joinedAs(code)!);
        go("lobby");
      } else if (code) {
        setJoinCode(code);
        go("join");
      } else go("menu");
    });

    const resizer = new ResizeObserver(([entry]) => {
      sceneRef.current?.resize(entry.contentRect.width, entry.contentRect.height);
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

    // Pointer: click the die to roll, click a glowing token to move it.
    const at = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      return sceneRef.current?.hitTest((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height) ?? null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || screenRef.current !== "playing") return;
      const hit = at(e);
      sceneRef.current?.setHover(hit?.kind === "token" ? hit.token : null);
      canvas.style.cursor = (hit?.kind === "token" && myMoveRef.current === "move") || (hit?.kind === "die" && myMoveRef.current === "roll") ? "pointer" : "";
    };
    const onDown = (e: PointerEvent) => {
      if (screenRef.current !== "playing" || (e.target as HTMLElement).closest("button, .game-overlay")) return;
      const hit = at(e);
      if (hit?.kind === "token") moveToken(hit.token);
      else if (hit?.kind === "die" || myMoveRef.current === "roll") roll();
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerdown", onDown);
    cleanups.push(() => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerdown", onDown);
    });

    // Keyboard: Space or Enter rolls; then 1 to 4, or the arrows and Enter, move a token.
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "f") {
        e.preventDefault();
        toggleFullscreen.current();
        return;
      }
      if (screenRef.current !== "playing" || (e.target as HTMLElement).closest("button, a")) return;
      const mine = myMoveRef.current;
      if (mine === "roll" && (k === " " || k === "Enter")) {
        e.preventDefault();
        roll();
      } else if (mine === "move") {
        const n = Number(k);
        if (n >= 1 && n <= 4) {
          e.preventDefault();
          moveToken(n - 1);
        } else if (k.startsWith("Arrow")) {
          e.preventDefault();
          stepFocus(k === "ArrowLeft" || k === "ArrowUp" ? -1 : 1);
        } else if ((k === "Enter" || k === " ") && focusRef.current !== null) {
          e.preventDefault();
          moveToken(focusRef.current);
        }
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
  }, [go, present, roll, moveToken, stepFocus, controls, hostGame, join]);

  // Online: follow the room between its lobby and the board.
  useEffect(() => {
    if (info.role !== "host" && info.role !== "guest") return;
    const current = screenRef.current;
    if (info.status?.state === "failed") go("lobby");
    else if (info.lobby && !info.lobby.started && (current === "playing" || current === "over")) {
      queue.current = [];
      go("lobby");
    }
  }, [info, go]);

  const startLocal = () => {
    const s = settingsRef.current;
    soundRef.current?.unlock();
    queue.current = [];
    const seats: Seat[] =
      s.mode === "cpu"
        ? [
            { name: "You", kind: "local", level: s.level, online: true },
            ...Array.from({ length: s.opponents }, (_, i) => ({ name: CPU_NAMES[i], kind: "cpu" as const, level: s.level, online: true })),
          ]
        : Array.from({ length: s.friends }, (_, i) => ({ name: `Player ${i + 1}`, kind: "local" as const, level: s.level, online: true }));
    session.startLocal({ players: seats.length, color: s.color }, seats);
  };
  const hostOnline = () => {
    const s = settingsRef.current;
    soundRef.current?.unlock();
    queue.current = [];
    hostGame({ players: s.online, color: s.color }, name, s.level);
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
    setConfirmLeave(false);
    setJoinCode(null);
    go("menu");
  };

  const { view } = hud;
  const role = info.role;
  const shared = role === "local" && info.seats.filter((s) => s.kind === "person").length > 1;
  const turnName = names(view.turn);
  const turnIsCpu = info.seats[view.turn]?.kind === "cpu";
  const corner = (seat: number) => sceneRef.current?.cornerOf(seat) ?? "bl";

  let prompt = "";
  if (screen === "playing" && view.winner === null) {
    const yours = controls(view.turn);
    const who = shared ? `${turnName}, your` : "Your";
    if (!yours) prompt = turnIsCpu ? `${turnName} is thinking…` : `${turnName}'s turn`;
    else if (view.phase === "roll") prompt = myMove === "roll" ? `${who} roll. Tap the die or press Space` : `${who} roll`;
    else if (view.roll && onlyOneMove(view)) prompt = `Rolled a ${view.roll}. Only one move, so off it goes`;
    else if (view.roll) prompt = `${shared ? `${turnName}, you` : "You"} rolled a ${view.roll}${myMove === "move" ? ". Pick a glowing token" : ""}`;
  }

  const lobbyColors = info.lobby ? seatColors(info.lobby.config.players, info.lobby.config.color) : [];

  return (
    <div className="game">
      <div ref={stageRef} className={`game-stage ludo-stage${screen === "playing" ? " playing" : ""}${fs.filled ? " fill-window" : ""}`}>
        <canvas ref={canvasRef} className="game-canvas" aria-label="3D Ludo board" role="img" />

        {(screen === "playing" || screen === "over") && (
          <div className="table-hud ludo-hud" aria-hidden="true">
            {view.colors.map((color, seat) => (
              <div
                key={seat}
                className={`ludo-player ${corner(seat)}${view.turn === seat && view.winner === null ? " active" : ""}${info.seats[seat]?.online === false ? " offline" : ""}`}
                style={{ "--seat": HUD_COLORS[color] } as React.CSSProperties}
              >
                <span className="ludo-player-name">{names(seat)}</span>
                <span className="ludo-player-home">
                  {view.tokens[seat].map((p, i) => (
                    <i key={i} className={p === HOME ? "in" : p >= 0 ? "out" : ""} />
                  ))}
                </span>
              </div>
            ))}
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
              <button type="button" className="game-tool" onClick={() => setConfirmLeave(true)} aria-label="Leave game">
                <LeaveIcon />
              </button>
            </>
          )}
          <FullscreenButton active={fs.fullscreen} onToggle={fs.toggle} />
        </div>

        {screen === "playing" && prompt && <p className={`game-prompt ludo-prompt${myMove ? " mine" : ""}`}>{prompt}</p>}

        {screen === "playing" && myMove === "roll" && (
          <button type="button" className="ludo-roll" onClick={roll} style={{ "--seat": HUD_COLORS[view.colors[view.turn]] } as React.CSSProperties}>
            Roll the die <span className="only-keys">(Space)</span>
          </button>
        )}
        {screen === "playing" && myMove === "move" && (
          <div className="ludo-pick" role="group" aria-label="Move a token">
            {/* Tokens starting from the same place make the same move, so they share one button. */}
            {view.legal.filter((t, i) => view.legal.findIndex((u) => view.tokens[view.turn][u] === view.tokens[view.turn][t]) === i).map((t) => (
              <button
                key={t}
                type="button"
                className={focus === t ? "focus" : ""}
                style={{ "--seat": HUD_COLORS[view.colors[view.turn]] } as React.CSSProperties}
                onClick={() => moveToken(t)}
                onMouseEnter={() => sceneRef.current?.setHover(t)}
                onMouseLeave={() => sceneRef.current?.setHover(null)}
              >
                {view.tokens[view.turn][t] === -1 ? "Bring one out" : `Token ${t + 1}`}
                <kbd className="only-keys">{t + 1}</kbd>
              </button>
            ))}
          </div>
        )}

        {screen === "playing" && flash && (
          <p key={flash.key} className="game-flash whot-flash">
            {flash.text}
            {flash.sub && <span>{flash.sub}</span>}
          </p>
        )}

        {confirmLeave && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>Leave this game?</h2>
              <p className="game-copy">
                {role === "host"
                  ? "You're hosting, so this ends the game for everyone."
                  : role === "guest"
                    ? "The CPU can take your colour if the host lets it."
                    : "It won't be saved to your history."}
              </p>
              <div className="game-actions">
                <button type="button" className="btn btn-primary" onClick={() => setConfirmLeave(false)} autoFocus>
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
            <p className="game-loading">Setting out the board…</p>
          </div>
        )}

        {screen === "unsupported" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>This one needs WebGL</h2>
              <p className="game-copy">
                Your browser couldn&apos;t start a 3D context, so the board can&apos;t be drawn. Turning on hardware acceleration usually fixes it, or try another browser.
              </p>
            </div>
          </div>
        )}

        {screen === "menu" && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">Ludo</p>
              <h2>{status === "ready" && matches.length ? "Another game?" : "Ready to roll?"}</h2>
              <p className="game-copy">{welcomeLine(status, matches)}</p>

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
                    <input type="radio" name="ludo-mode" value={value} checked={settings.mode === value} onChange={() => updateSettings({ mode: value })} />
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
                        <input type="radio" name="ludo-opponents" checked={settings.opponents === n} onChange={() => updateSettings({ opponents: n })} />
                        <span>{n}</span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="game-choice">
                    <legend>CPU</legend>
                    {(Object.keys(LEVELS) as Level[]).map((l) => (
                      <label key={l}>
                        <input type="radio" name="ludo-level" checked={settings.level === l} onChange={() => updateSettings({ level: l })} />
                        <span>{LEVELS[l]}</span>
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              {settings.mode === "local" && (
                <fieldset className="game-choice">
                  <legend>Players</legend>
                  {PLAYER_COUNTS.map((n) => (
                    <label key={n}>
                      <input type="radio" name="ludo-friends" checked={settings.friends === n} onChange={() => updateSettings({ friends: n })} />
                      <span>{n}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {settings.mode === "online" && (
                <>
                  <fieldset className="game-choice">
                    <legend>Seats</legend>
                    {PLAYER_COUNTS.map((n) => (
                      <label key={n}>
                        <input type="radio" name="ludo-online" checked={settings.online === n} onChange={() => updateSettings({ online: n })} />
                        <span>{n}</span>
                      </label>
                    ))}
                  </fieldset>
                  <NameField id="ludo-name" name={name} onName={setName} />
                </>
              )}

              <fieldset className="game-choice ludo-colors">
                <legend>{settings.mode === "local" ? "Player 1's colour" : "Your colour"}</legend>
                {COLORS.map((c, i) => (
                  <label key={c.key}>
                    <input type="radio" name="ludo-color" checked={settings.color === i} onChange={() => updateSettings({ color: i })} />
                    <span style={{ "--seat": HUD_COLORS[i] } as React.CSSProperties}>{c.name}</span>
                  </label>
                ))}
              </fieldset>

              {settings.mode === "online" ? (
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
                  Start the game
                </button>
              )}
              <p className="game-keys">
                {settings.mode === "online"
                  ? "Your friends just open the link, no account or app needed. Empty seats go to the CPU."
                  : settings.mode === "local"
                    ? "Everyone takes their turn on this screen, in colour order."
                    : "Click the die or press Space to roll, then click a glowing token."}
              </p>
            </div>
          </div>
        )}

        {screen === "join" && (
          <div className="game-overlay">
            <div className="game-panel">
              <JoinForm title="Ludo" initialCode={joinCode} name={name} onName={setName} onJoin={joinOnline} onBack={toMenu} />
            </div>
          </div>
        )}

        {screen === "lobby" && (
          <div className="game-overlay">
            <div className="game-panel">
              <Lobby title="Ludo" info={info} onStart={session.start} onLeave={toMenu} seatColor={(i) => HUD_COLORS[lobbyColors[i] ?? 0]}>
                {info.lobby && (
                  <>
                    <fieldset className="game-choice">
                      <legend>Seats</legend>
                      {PLAYER_COUNTS.map((n) => {
                        const people = info.lobby!.seats.filter((s) => s.kind === "host" || s.kind === "guest").length;
                        return (
                          <label key={n}>
                            <input
                              type="radio"
                              name="ludo-lobby-seats"
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
                    {info.lobby.seats.length > 2 && (
                      <fieldset className="game-choice">
                        <legend>CPU for empty seats</legend>
                        {(Object.keys(LEVELS) as Level[]).map((l) => (
                          <label key={l}>
                            <input
                              type="radio"
                              name="ludo-lobby-level"
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

        {screen === "over" && result && !confirmLeave && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">{role === "local" ? (shared ? "Friends on one screen" : "Against the CPU") : "Online game"}</p>
              <h2>{!shared && result.winner === result.me ? "You won!" : `${names(result.winner)} wins`}</h2>
              <ul className="game-stats">
                <li>
                  <strong>{result.home}/4</strong>
                  <span>{shared ? `${names(0)} home` : "Home"}</span>
                </li>
                <li>
                  <strong>{result.captures}</strong>
                  <span>Captures</span>
                </li>
                <li>
                  <strong>{result.sixes}</strong>
                  <span>Sixes</span>
                </li>
              </ul>
              <p className="game-keys" role="status">
                {result.saved === null ? "Saving to your history…" : result.saved ? "Saved to your history below." : "Couldn't save this one. Your browser is blocking site storage."}
              </p>
              <div className="game-actions">
                {role === "guest" ? (
                  <>
                    <p className="game-copy online-wait">
                      Waiting for {info.lobby?.seats[0]?.name ?? "the host"} to start another
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
        {screen === "playing" && ` ${prompt}`}
      </p>
      <p className="game-help">
        <span>
          <kbd>Space</kbd> or click the die to roll
        </span>
        <span>
          <kbd>1</kbd> to <kbd>4</kbd>, or click a token, to move
        </span>
        <span>
          <kbd>F</kbd> full screen
        </span>
      </p>
    </div>
  );
}
