"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FullscreenButton, PauseIcon, SoundIcon } from "@/components/games/GameIcons";
import { formatDuration, timeAgo } from "@/lib/games/format";
import { anyTapped, BUTTON, createGamepads } from "@/lib/games/gamepad";
import { getPref, setPref, type PongMatch } from "@/lib/games/history";
import {
  createAutopilot,
  createMatch,
  DIFFICULTIES,
  PADDLE_RANGE,
  step,
  type Difficulty,
  type Match,
  type PongEvent,
  type Side,
} from "@/lib/games/pong/engine";
import type { PongScene } from "@/lib/games/pong/scene";
import { createSound } from "@/lib/games/pong/sound";
import { isVersus, summarizePong } from "@/lib/games/stats";
import { useFullscreen } from "@/lib/games/useFullscreen";

const GAME = "ping-pong";
const SETTINGS_KEY = `${GAME}:settings`;
/** The simulation always advances in steps this size, whatever the display's refresh rate. */
const STEP = 1 / 120;
/** Paddle speed with the keys, m/s. */
const KEY_SPEED = 3.2;
/** Paddle speed with a stick pushed all the way, m/s. */
const PAD_SPEED = 3.8;
const TARGETS = [5, 11] as const;

type Screen = "loading" | "menu" | "playing" | "paused" | "over" | "unsupported";
type Opponent = "cpu" | "friend";
type Settings = { difficulty: Difficulty; target: number; muted: boolean; opponent: Opponent };
type Hud = { player: number; cpu: number; server: Side; rally: number; waiting: Side | null };
type Result = {
  winner: Side;
  player: number;
  cpu: number;
  longestRally: number;
  duration: number;
  difficulty: Difficulty;
  versus: boolean;
  /** null while the save is in flight. */
  saved: boolean | null;
};

const DEFAULT_SETTINGS: Settings = { difficulty: "normal", target: 5, muted: false, opponent: "cpu" };
const hudFrom = (m: Match): Hud => ({
  player: m.score.player,
  cpu: m.score.cpu,
  server: m.server,
  rally: m.rally,
  // Waiting on a person to serve: always player 1, and player 2 in a two-player match.
  waiting: m.phase === "serve" && (m.server === "player" || m.versus) ? m.server : null,
});
/** What each side is called on screen. */
const names = (versus: boolean) =>
  versus ? { player: "Player 1", cpu: "Player 2", short: { player: "P1", cpu: "P2" } } : { player: "You", cpu: "CPU", short: { player: "You", cpu: "CPU" } };

function welcomeLine(status: string, matches: PongMatch[]) {
  if (status === "unavailable") {
    return "This browser isn't letting the site store anything, so matches won't be saved this time.";
  }
  if (status !== "ready" || !matches.length) {
    return "Take on the CPU, or hand a friend the arrow keys. Finished matches are saved in this browser.";
  }
  const { played, wins, losses, twoPlayer } = summarizePong(matches);
  const last = matches[0];
  if (!played) {
    return `Welcome back. ${twoPlayer} two-player ${twoPlayer === 1 ? "match" : "matches"} so far. Fancy a go at the CPU?`;
  }
  const lastLine = isVersus(last)
    ? `Last match: player ${last.result === "win" ? 1 : 2} won ${Math.max(last.playerScore, last.opponentScore)}-${Math.min(last.playerScore, last.opponentScore)}, two players`
    : `Last match: ${last.result === "win" ? "won" : "lost"} ${last.playerScore}-${last.opponentScore} on ${
        DIFFICULTIES[last.difficulty as Difficulty]?.label.toLowerCase() ?? last.difficulty
      }`;
  return `Welcome back. You're ${wins}-${losses} against the CPU. ${lastLine}, ${timeAgo(last.endedAt)}.`;
}

export default function PongGame({
  matches,
  status,
  onMatchEnd,
}: {
  matches: PongMatch[];
  status: "loading" | "ready" | "unavailable";
  /** Resolves to false when the match could not be saved. */
  onMatchEnd: (record: PongMatch) => Promise<boolean>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hud, setHud] = useState<Hud>({ player: 0, cpu: 0, server: "player", rally: 0, waiting: null });
  const [versus, setVersus] = useState(false);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [announce, setAnnounce] = useState("");
  const fs = useFullscreen(stageRef);

  // The render loop lives outside React, so it reads these refs rather than
  // state. React only hears about the moments the HUD needs to change.
  const screenRef = useRef<Screen>("loading");
  const settingsRef = useRef(settings);
  const matchRef = useRef<Match | null>(null);
  const demoRef = useRef<{ match: Match; pilot: ReturnType<typeof createAutopilot> } | null>(null);
  const sceneRef = useRef<PongScene | null>(null);
  const soundRef = useRef<ReturnType<typeof createSound> | null>(null);
  const input = useRef({ x: 0, x2: 0, serve: false, serve2: false });
  // Held keys. A/D always move player 1; the arrows move player 2 in a
  // two-player match and player 1 otherwise.
  const keys = useRef({ a: false, d: false, left: false, right: false });
  const onMatchEndRef = useRef(onMatchEnd);
  const toggleFullscreen = useRef(fs.toggle);
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    onMatchEndRef.current = onMatchEnd;
    toggleFullscreen.current = fs.toggle;
  }, [onMatchEnd, fs.toggle]);

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

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      setPref(SETTINGS_KEY, next).catch(() => {});
      return next;
    });
  };

  useEffect(() => {
    settingsRef.current = settings;
    soundRef.current?.setMuted(settings.muted);
  }, [settings]);

  // ---- Match lifecycle ----
  const handleEvents = useCallback(
    (m: Match, events: PongEvent[]) => {
      const sound = soundRef.current;
      const who = names(m.versus);
      for (const e of events) {
        if (e.type === "hit") {
          sound?.hit(e.power);
          setHud(hudFrom(m));
        } else if (e.type === "bounce") {
          sound?.bounce();
        } else if (e.type === "serve" || e.type === "ready") {
          input.current.serve = false;
          input.current.serve2 = false;
          setHud(hudFrom(m));
        } else if (e.type === "point") {
          // In a two-player match someone always wins the point, so it's always good news.
          sound?.point(m.versus || e.winner === "player");
          setHud(hudFrom(m));
          setFlash({
            text: m.versus ? `${who[e.winner]}'s point` : e.winner === "player" ? "Your point" : "CPU's point",
            key: performance.now(),
          });
          setAnnounce(`${who.player} ${m.score.player}, ${who.cpu} ${m.score.cpu}`);
        } else if (e.type === "over") {
          setResult({
            winner: e.winner,
            player: m.score.player,
            cpu: m.score.cpu,
            longestRally: m.longestRally,
            duration: m.time,
            difficulty: m.difficulty,
            versus: m.versus,
            saved: null,
          });
          setAnnounce(
            m.versus
              ? `${who[e.winner]} wins ${m.score.player} to ${m.score.cpu}`
              : `${e.winner === "player" ? "You won" : "The CPU won"} ${m.score.player} to ${m.score.cpu}`
          );
          go("over");
          onMatchEndRef
            .current({
              game: GAME,
              mode: m.versus ? "versus" : "cpu",
              result: e.winner === "player" ? "win" : "loss",
              playerScore: m.score.player,
              opponentScore: m.score.cpu,
              difficulty: m.difficulty,
              target: m.target,
              longestRally: m.longestRally,
              duration: Math.round(m.time),
              endedAt: Date.now(),
            })
            .then((saved) => setResult((r) => (r ? { ...r, saved } : r)));
        }
      }
    },
    [go]
  );

  const startMatch = useCallback(() => {
    const { difficulty, target, opponent } = settingsRef.current;
    const isVs = opponent === "friend";
    soundRef.current?.unlock();
    const m = createMatch(isVs ? "normal" : difficulty, target, isVs);
    m.player.x = input.current.x;
    m.cpu.x = input.current.x2 = 0;
    matchRef.current = m;
    input.current.serve = input.current.serve2 = false;
    setVersus(isVs);
    setHud(hudFrom(m));
    setResult(null);
    setFlash(null);
    setAnnounce(`New match, first to ${target}. ${isVs ? "Player 1" : "Your"} serve.`);
    go("playing");
  }, [go]);

  /** Queues a serve for one side, if it's that side's turn. */
  const requestServe = useCallback((side: Side) => {
    const m = matchRef.current;
    if (screenRef.current !== "playing" || m?.phase !== "serve" || m.server !== side) return;
    if (side === "player") input.current.serve = true;
    else if (m.versus) input.current.serve2 = true;
  }, []);

  const togglePause = useCallback(() => {
    if (screenRef.current === "playing") go("paused");
    else if (screenRef.current === "paused") go("playing");
  }, [go]);

  // ---- Scene, render loop and input ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    let disposed = false;
    let frame = 0;
    let last = 0;
    let acc = 0;
    let visible = true;
    const cleanups: (() => void)[] = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gamepads = createGamepads();
    soundRef.current = createSound();
    soundRef.current.setMuted(settingsRef.current.muted);

    const newDemo = () => {
      const match = createMatch("normal", 11);
      match.timer = 0.6;
      demoRef.current = { match, pilot: createAutopilot() };
    };

    const clampX = (x: number) => Math.min(Math.max(x, -PADDLE_RANGE), PADDLE_RANGE);

    const tick = (now: number) => {
      frame = 0;
      const scene = sceneRef.current;
      if (!scene || disposed) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : STEP;
      last = now;
      const current = screenRef.current;
      const pads = gamepads.poll();

      // Pads: A or Start begins a match from the menus, Start pauses and resumes.
      if ((current === "menu" || current === "over") && anyTapped(pads, BUTTON.A, BUTTON.START)) startMatch();
      else if ((current === "playing" || current === "paused") && anyTapped(pads, BUTTON.START)) togglePause();

      let shown: Match | null = null;
      if (screenRef.current === "playing" && matchRef.current) {
        const m = matchRef.current;
        const k = keys.current;
        const inp = input.current;
        const p1 = (k.d ? 1 : 0) - (k.a ? 1 : 0) + (m.versus ? 0 : (k.right ? 1 : 0) - (k.left ? 1 : 0));
        const p2 = m.versus ? (k.right ? 1 : 0) - (k.left ? 1 : 0) : 0;
        if (p1) inp.x = clampX(inp.x + Math.sign(p1) * KEY_SPEED * dt);
        if (p2) inp.x2 = clampX(inp.x2 + Math.sign(p2) * KEY_SPEED * dt);
        // In a two-player match, the second pad (or the only pad, since player
        // 1 has the mouse and keyboard) plays player 2.
        pads.forEach((pad, i) => {
          const side: Side = !m.versus || (pads.length > 1 && i === 0) ? "player" : "cpu";
          if (side === "player") inp.x = clampX(inp.x + pad.x * PAD_SPEED * dt);
          else inp.x2 = clampX(inp.x2 + pad.x * PAD_SPEED * dt);
          if (pad.tapped(BUTTON.A) || pad.tapped(BUTTON.RB) || pad.tapped(BUTTON.LB)) requestServe(side);
        });

        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const events = step(m, STEP, { x: inp.x, serve: inp.serve, x2: inp.x2, serve2: inp.serve2 });
          if (events.length) {
            scene.onEvents(events);
            handleEvents(m, events);
          }
          if (screenRef.current !== "playing") break;
        }
        shown = m;
      } else if (screenRef.current === "menu" || screenRef.current === "over") {
        if (!demoRef.current || demoRef.current.match.phase === "over") newDemo();
        const demo = demoRef.current!;
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const events = step(demo.match, STEP, demo.pilot(demo.match, STEP));
          if (events.length) scene.onEvents(events);
        }
        shown = demo.match;
      } else {
        // Paused: hold the last frame of the match.
        shown = matchRef.current;
        acc = 0;
      }

      const state = screenRef.current;
      if (shown) scene.render(shown, state === "paused" ? 0 : dt);

      // While paused the loop only keeps going to watch for a pad's Start button.
      const animating = state === "playing" || state === "menu" || state === "over" || (state === "paused" && pads.length > 0);
      // A screen change inside this tick may already have queued the next one.
      if (animating && visible && !document.hidden) frame ||= requestAnimationFrame(tick);
      else last = 0;
    };

    const kick = () => {
      if (!frame && !disposed && sceneRef.current) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    kickRef.current = kick;

    import("@/lib/games/pong/scene").then(({ createPongScene }) => {
      if (disposed) return;
      try {
        sceneRef.current = createPongScene(canvas, { reducedMotion });
      } catch {
        go("unsupported");
        return;
      }
      const rect = stage.getBoundingClientRect();
      sceneRef.current.resize(rect.width, rect.height);
      newDemo();
      go("menu");
    });

    // Size the drawing buffer to the stage, and redraw a paused frame.
    const resizer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      sceneRef.current?.resize(width, height);
      kick();
    });
    resizer.observe(stage);
    cleanups.push(() => resizer.disconnect());

    // Stop drawing while the stage is scrolled away, and pause a live match
    // rather than letting it play on unseen.
    const seen = new IntersectionObserver(
      ([entry]) => {
        visible = entry.intersectionRatio > 0.35;
        if (!visible && screenRef.current === "playing" && !document.fullscreenElement) go("paused");
        if (visible) kick();
      },
      { threshold: [0, 0.35, 0.6] }
    );
    seen.observe(stage);
    cleanups.push(() => seen.disconnect());

    const onVisibility = () => {
      if (document.hidden && screenRef.current === "playing") go("paused");
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));
    window.addEventListener("gamepadconnected", kick);
    cleanups.push(() => window.removeEventListener("gamepadconnected", kick));

    // Pointer: the mouse plays player 1 across the whole width of the stage
    // (tracked on window so it keeps working if it drifts off the canvas). A
    // finger plays whichever player owns the half of the table it touched.
    const touches = new Map<number, Side>();
    const aimAt = (side: Side, clientX: number) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const rect = stage.getBoundingClientRect();
      const x = clampX(scene.pointerToX((clientX - rect.left) / rect.width));
      if (side === "player") input.current.x = x;
      else input.current.x2 = x;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (screenRef.current !== "playing") return;
      if (e.pointerType === "mouse") aimAt("player", e.clientX);
      else if (touches.has(e.pointerId)) aimAt(touches.get(e.pointerId)!, e.clientX);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (screenRef.current !== "playing") return;
      if ((e.target as HTMLElement).closest("button")) return;
      const rect = stage.getBoundingClientRect();
      const top = e.clientY < rect.top + rect.height / 2;
      const side: Side = e.pointerType !== "mouse" && matchRef.current?.versus && top ? "cpu" : "player";
      if (e.pointerType !== "mouse") touches.set(e.pointerId, side);
      aimAt(side, e.clientX);
      requestServe(side);
    };
    const onPointerUp = (e: PointerEvent) => touches.delete(e.pointerId);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    cleanups.push(() => {
      window.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    });

    // Keyboard. Against the CPU: arrows or A/D to move, Space or Enter to
    // serve. Two players: A/D and W for player 1, the arrows and Up for player
    // 2, and Space serves for whoever's turn it is. P or Esc pauses, F goes
    // full screen.
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const down = e.type === "keydown";
      const playing = screenRef.current === "playing";
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const held = ({ a: "a", d: "d", ArrowLeft: "left", ArrowRight: "right" } as const)[k as "a"];
      if (held) {
        keys.current[held] = down;
        if (playing) e.preventDefault();
        return;
      }
      if (!down || e.repeat) return;
      const m = matchRef.current;
      if (k === "f") {
        e.preventDefault();
        toggleFullscreen.current();
      } else if (playing && m && (k === " " || k === "Enter" || k === "w" || k === "ArrowUp")) {
        e.preventDefault();
        if (k === " ") requestServe(m.server);
        else if (k === "w") requestServe("player");
        else if (k === "ArrowUp") requestServe("cpu");
        else requestServe(m.versus ? "cpu" : "player");
      } else if ((k === "p" || k === "Escape") && (playing || screenRef.current === "paused")) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const onBlur = () => {
      keys.current = { a: false, d: false, left: false, right: false };
    };
    window.addEventListener("blur", onBlur);
    cleanups.push(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanups.forEach((fn) => fn());
      sceneRef.current?.dispose();
      sceneRef.current = null;
      soundRef.current?.dispose();
      soundRef.current = null;
      kickRef.current = () => {};
    };
  }, [go, handleEvents, requestServe, startMatch, togglePause]);

  const quit = () => {
    matchRef.current = null;
    setHud({ player: 0, cpu: 0, server: "player", rally: 0, waiting: null });
    go("menu");
  };

  const inMatch = screen === "playing" || screen === "paused";
  const level = DIFFICULTIES[settings.difficulty].label;
  const who = names(versus);
  const friend = settings.opponent === "friend";

  return (
    <div className="game">
      <div
        ref={stageRef}
        className={`game-stage pong-stage${screen === "playing" ? " playing" : ""}${fs.filled ? " fill-window" : ""}`}
      >
        <canvas ref={canvasRef} className="game-canvas" aria-label="3D ping pong table" role="img" />

        {inMatch && (
          <div className="pong-hud">
            <div className="pong-score" aria-hidden="true">
              <div className={`pong-side${hud.server === "player" ? " serving" : ""}`}>
                <span className="pong-name">{who.short.player}</span>
                <strong>{hud.player}</strong>
              </div>
              <span className="pong-vs">:</span>
              <div className={`pong-side cpu${hud.server === "cpu" ? " serving" : ""}`}>
                <strong>{hud.cpu}</strong>
                <span className="pong-name">{who.short.cpu}</span>
              </div>
            </div>
            <p className="pong-meta">
              First to {settings.target} · {versus ? "2 players" : level}
              {hud.rally > 1 && <span className="pong-rally"> · Rally {hud.rally}</span>}
            </p>
          </div>
        )}

        <div className="game-tools">
          {inMatch && (
            <>
              <button
                type="button"
                className="game-tool"
                // Mouse clicks drop focus, so Space serves instead of re-pressing this.
                onClick={(e) => {
                  updateSettings({ muted: !settings.muted });
                  if (e.detail) e.currentTarget.blur();
                }}
                aria-pressed={settings.muted}
                aria-label={settings.muted ? "Turn sound on" : "Mute sound"}
              >
                <SoundIcon muted={settings.muted} />
              </button>
              <button
                type="button"
                className="game-tool"
                onClick={(e) => {
                  togglePause();
                  if (e.detail) e.currentTarget.blur();
                }}
                aria-label="Pause"
              >
                <PauseIcon />
              </button>
            </>
          )}
          <FullscreenButton active={fs.fullscreen} onToggle={fs.toggle} />
        </div>

        {screen === "playing" && hud.waiting && (
          <p className="game-prompt">
            {!versus ? (
              "Your serve. Click, tap or press Space"
            ) : (
              <>
                Player {hud.waiting === "player" ? 1 : 2} to serve
                <span className="only-keys">: {hud.waiting === "player" ? "W" : "Up"} or Space</span>
                <span className="only-touch">: tap your half</span>
              </>
            )}
          </p>
        )}
        {screen === "playing" && flash && (
          <p key={flash.key} className="game-flash">
            {flash.text}
          </p>
        )}

        {screen === "loading" && (
          <div className="game-overlay">
            <p className="game-loading">Setting up the table…</p>
          </div>
        )}

        {screen === "unsupported" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>This one needs WebGL</h2>
              <p className="game-copy">
                Your browser couldn&apos;t start a 3D context, so the table can&apos;t be drawn. Turning on
                hardware acceleration usually fixes it, or try another browser.
              </p>
            </div>
          </div>
        )}

        {screen === "menu" && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">Ping Pong</p>
              <h2>{status === "ready" && matches.length ? "Back for another?" : "Ready when you are"}</h2>
              <p className="game-copy">{welcomeLine(status, matches)}</p>

              <fieldset className="game-choice">
                <legend>Opponent</legend>
                {(
                  [
                    ["cpu", "The CPU"],
                    ["friend", "A friend, same screen"],
                  ] as [Opponent, string][]
                ).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="pong-opponent"
                      value={value}
                      checked={settings.opponent === value}
                      onChange={() => updateSettings({ opponent: value })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              {!friend && (
                <fieldset className="game-choice">
                  <legend>Difficulty</legend>
                  {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                    <label key={d}>
                      <input
                        type="radio"
                        name="pong-difficulty"
                        value={d}
                        checked={settings.difficulty === d}
                        onChange={() => updateSettings({ difficulty: d })}
                      />
                      <span>{DIFFICULTIES[d].label}</span>
                    </label>
                  ))}
                </fieldset>
              )}

              <fieldset className="game-choice">
                <legend>Match</legend>
                {TARGETS.map((t) => (
                  <label key={t}>
                    <input
                      type="radio"
                      name="pong-target"
                      value={t}
                      checked={settings.target === t}
                      onChange={() => updateSettings({ target: t })}
                    />
                    <span>First to {t}</span>
                  </label>
                ))}
              </fieldset>

              {friend && (
                <>
                  <p className="game-keys pong-controls only-keys">
                    <b>Player 1</b> A and D or the mouse, W to serve. <b>Player 2</b> the arrow keys, Up to
                    serve. Space serves for whoever&apos;s turn it is, and two gamepads work too.
                  </p>
                  <p className="game-keys pong-controls only-touch">
                    Player 1 drags along the bottom half of the screen, player 2 along the top. Tap your
                    half to serve.
                  </p>
                </>
              )}

              <button type="button" className="btn btn-primary game-start" onClick={startMatch}>
                Start match
              </button>
              {!friend && (
                <p className="game-keys">
                  Mouse, touch, arrow keys or a gamepad. Where the ball meets your paddle sets the angle.
                </p>
              )}
            </div>
          </div>
        )}

        {screen === "paused" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>Paused</h2>
              <p className="game-copy">
                {who.player} {hud.player}, {who.cpu} {hud.cpu}. First to {settings.target}
                {versus ? "." : ` on ${level.toLowerCase()}.`}
              </p>
              <div className="game-actions">
                <button type="button" className="btn btn-primary" onClick={togglePause} autoFocus>
                  Resume
                </button>
                <button type="button" className="btn btn-ghost" onClick={quit}>
                  Quit match
                </button>
              </div>
              <p className="game-keys">Quitting leaves this match out of your history.</p>
            </div>
          </div>
        )}

        {screen === "over" && result && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">
                {result.versus ? "Two-player match" : result.winner === "player" ? "Match won" : "Match lost"}
              </p>
              <h2>
                {result.versus
                  ? `${names(true)[result.winner]} wins `
                  : result.winner === "player"
                    ? "You took it "
                    : "CPU takes it "}
                {Math.max(result.player, result.cpu)}-{Math.min(result.player, result.cpu)}
              </h2>
              <ul className="game-stats">
                <li>
                  <strong>{result.longestRally}</strong>
                  <span>Longest rally</span>
                </li>
                <li>
                  <strong>{formatDuration(result.duration)}</strong>
                  <span>Match time</span>
                </li>
                <li>
                  <strong>{result.versus ? "2P" : DIFFICULTIES[result.difficulty].label}</strong>
                  <span>{result.versus ? "Same screen" : "Level"}</span>
                </li>
              </ul>
              <p className="game-keys" role="status">
                {result.saved === null
                  ? "Saving to your history…"
                  : result.saved
                    ? "Saved to your history below."
                    : "Couldn't save this one. Your browser is blocking site storage."}
              </p>
              <div className="game-actions">
                <button type="button" className="btn btn-primary" onClick={startMatch} autoFocus>
                  {result.versus ? "Rematch" : "Play again"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => go("menu")}>
                  Change settings
                </button>
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
          <kbd>←</kbd> <kbd>→</kbd> or mouse to move
        </span>
        <span>
          <kbd>Space</kbd> or click to serve
        </span>
        <span>
          <kbd>P</kbd> pause
        </span>
        <span>
          <kbd>F</kbd> full screen
        </span>
        <span>Gamepads: stick to move, A to serve, Start to pause</span>
      </p>
    </div>
  );
}
