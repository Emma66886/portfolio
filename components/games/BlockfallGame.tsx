"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FullscreenButton, PauseIcon, SoundIcon } from "@/components/games/GameIcons";
import {
  createAutoplayer,
  createGame,
  step,
  type Action,
  type Game,
  type GameEvent,
} from "@/lib/games/blockfall/engine";
import type { BlockfallScene } from "@/lib/games/blockfall/scene";
import { createSound } from "@/lib/games/blockfall/sound";
import { formatDuration, timeAgo } from "@/lib/games/format";
import { anyTapped, BUTTON, createGamepads } from "@/lib/games/gamepad";
import { getPref, setPref, type BlockfallRun } from "@/lib/games/history";
import { formatScore, summarizeBlockfall } from "@/lib/games/stats";
import { useFullscreen } from "@/lib/games/useFullscreen";

const GAME = "blockfall";
const SETTINGS_KEY = `${GAME}:settings`;
/** The simulation always advances in steps this size, whatever the display's refresh rate. */
const STEP = 1 / 120;
const START_LEVELS = [1, 5, 10] as const;
const SPIN_NAMES = ["", "single", "double", "triple"];

type Screen = "loading" | "menu" | "playing" | "paused" | "over" | "unsupported";
type Settings = { startLevel: number; muted: boolean };
type Result = {
  score: number;
  lines: number;
  level: number;
  duration: number;
  quads: number;
  tSpins: number;
  best: boolean;
  /** null while the save is in flight. */
  saved: boolean | null;
};

const DEFAULT_SETTINGS: Settings = { startLevel: 1, muted: false };

function welcomeLine(status: string, runs: BlockfallRun[]) {
  if (status === "unavailable") {
    return "This browser isn't letting the site store anything, so your scores won't be saved this time.";
  }
  if (status !== "ready" || !runs.length) {
    return "Clear lines to score, and go for quads and T-spins for the big points. Every game you finish is saved in this browser.";
  }
  const { best, played } = summarizeBlockfall(runs);
  return `Welcome back. Your best is ${formatScore(best!.score)} with ${best!.lines} lines, set ${timeAgo(
    best!.endedAt
  )}. ${played === 1 ? "One game" : `${played} games`} played so far.`;
}

/** What to call out after a clear, if it's worth calling out. */
function callout(e: Extract<GameEvent, { type: "clear" | "spinNoLines" }>) {
  if (e.type === "spinNoLines") return e.spin === "full" ? "T-spin" : "Mini T-spin";
  let name = "";
  if (e.spin) name = `${e.spin === "mini" ? "Mini T-spin" : "T-spin"} ${SPIN_NAMES[e.lines]}`;
  else if (e.lines === 4) name = "Quad";
  if (name && e.b2b) name = `Back-to-back ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  const combo = e.combo > 0 ? `Combo ${e.combo}` : "";
  return [name, combo].filter(Boolean).join(" · ");
}

export default function BlockfallGame({
  runs,
  status,
  onGameEnd,
}: {
  runs: BlockfallRun[];
  status: "loading" | "ready" | "unavailable";
  /** Resolves to false when the game could not be saved. */
  onGameEnd: (record: BlockfallRun) => Promise<boolean>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [toast, setToast] = useState<{ text: string; points: number; key: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [paused, setPaused] = useState({ score: 0, level: 1 });
  const [announce, setAnnounce] = useState("");
  const fs = useFullscreen(stageRef);

  // The render loop lives outside React, so it reads these refs rather than
  // state. React only hears about the moments the overlays need to change.
  const screenRef = useRef<Screen>("loading");
  const settingsRef = useRef(settings);
  const gameRef = useRef<Game | null>(null);
  const demoRef = useRef<{ game: Game; ai: ReturnType<typeof createAutoplayer> } | null>(null);
  const sceneRef = useRef<BlockfallScene | null>(null);
  const soundRef = useRef<ReturnType<typeof createSound> | null>(null);
  /** Directions held on the keyboard; the loop adds any gamepad on top. */
  const held = useRef({ left: false, right: false, down: false });
  const actions = useRef<Action[]>([]);
  const bestRef = useRef(0);
  const onGameEndRef = useRef(onGameEnd);
  const toggleFullscreen = useRef(fs.toggle);
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    onGameEndRef.current = onGameEnd;
    toggleFullscreen.current = fs.toggle;
  }, [onGameEnd, fs.toggle]);

  useEffect(() => {
    bestRef.current = summarizeBlockfall(runs).best?.score ?? 0;
  }, [runs]);

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

  // ---- Game lifecycle ----
  const finish = useCallback(
    (g: Game) => {
      // A first game beats nothing, so it isn't called a personal best.
      const best = bestRef.current > 0 && g.score > bestRef.current;
      setResult({
        score: g.score,
        lines: g.lines,
        level: g.level,
        duration: g.time,
        quads: g.quads,
        tSpins: g.tSpins,
        best,
        saved: null,
      });
      setAnnounce(`Game over. ${formatScore(g.score)} points, ${g.lines} lines.`);
      go("over");
      onGameEndRef
        .current({
          game: GAME,
          score: g.score,
          lines: g.lines,
          level: g.level,
          startLevel: g.startLevel,
          pieces: g.pieces,
          quads: g.quads,
          tSpins: g.tSpins,
          maxCombo: g.maxCombo,
          duration: Math.round(g.time),
          endedAt: Date.now(),
        })
        .then((saved) => setResult((r) => (r ? { ...r, saved } : r)));
    },
    [go]
  );

  const handleEvents = useCallback(
    (g: Game, events: GameEvent[]) => {
      const sound = soundRef.current;
      for (const e of events) {
        if (e.type === "move") sound?.move();
        else if (e.type === "rotate") sound?.rotate();
        else if (e.type === "hold") sound?.hold();
        else if (e.type === "hardDrop") sound?.hardDrop();
        else if (e.type === "lock" && !events.some((x) => x.type === "hardDrop")) sound?.lock();
        else if (e.type === "clear" || e.type === "spinNoLines") {
          if (e.type === "clear") sound?.clear(e.lines, e.lines === 4 || !!e.spin);
          const text = callout(e);
          if (text) setToast({ text, points: e.points, key: performance.now() });
          if (e.type === "clear") setAnnounce(`${e.lines} ${e.lines === 1 ? "line" : "lines"}. Score ${formatScore(g.score)}.`);
        } else if (e.type === "level") {
          sound?.level();
          setToast({ text: `Level ${e.level}`, points: 0, key: performance.now() });
          setAnnounce(`Level ${e.level}`);
        } else if (e.type === "over") {
          sound?.over();
          finish(g);
        }
      }
    },
    [finish]
  );

  const startGame = useCallback(() => {
    soundRef.current?.unlock();
    gameRef.current = createGame(settingsRef.current.startLevel);
    actions.current = [];
    setResult(null);
    setToast(null);
    setAnnounce(`New game from level ${settingsRef.current.startLevel}.`);
    go("playing");
  }, [go]);

  const pause = useCallback(() => {
    const g = gameRef.current;
    if (screenRef.current !== "playing" || !g) return;
    setPaused({ score: g.score, level: g.level });
    go("paused");
  }, [go]);

  const resume = useCallback(() => {
    if (screenRef.current === "paused") go("playing");
  }, [go]);

  /** Ends the game where it stands and saves it, like topping out. */
  const endGame = () => {
    const g = gameRef.current;
    if (!g) return;
    g.phase = "over";
    sceneRef.current?.onEvents([{ type: "over" }], g);
    soundRef.current?.over();
    finish(g);
  };

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
      demoRef.current = { game: createGame(1), ai: createAutoplayer() };
    };

    const tick = (now: number) => {
      frame = 0;
      const scene = sceneRef.current;
      if (!scene || disposed) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : STEP;
      last = now;
      const pads = gamepads.poll();

      // Pads: A or Start begins a game from the menus, Start pauses and resumes.
      if ((screenRef.current === "menu" || screenRef.current === "over") && anyTapped(pads, BUTTON.A, BUTTON.START)) startGame();
      else if (screenRef.current === "playing" && anyTapped(pads, BUTTON.START)) pause();
      else if (screenRef.current === "paused" && anyTapped(pads, BUTTON.START)) resume();
      const current = screenRef.current;

      let shown: Game | null = null;
      if (current === "playing" && gameRef.current) {
        const g = gameRef.current;
        // Pads: stick or d-pad to move and soft-drop, up to hard-drop, A to
        // turn clockwise, B or X the other way, Y or a shoulder to hold.
        const both = { ...held.current };
        for (const pad of pads) {
          both.left ||= pad.x < -0.5;
          both.right ||= pad.x > 0.5;
          both.down ||= pad.y > 0.5;
          if (pad.tapped(BUTTON.A)) actions.current.push("rotateCW");
          if (pad.tapped(BUTTON.B) || pad.tapped(BUTTON.X)) actions.current.push("rotateCCW");
          if (pad.tapped(BUTTON.Y) || pad.tapped(BUTTON.LB) || pad.tapped(BUTTON.RB)) actions.current.push("hold");
          if (pad.tapped(BUTTON.UP)) actions.current.push("hardDrop");
        }
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const queued = actions.current;
          actions.current = [];
          const events = step(g, STEP, both, queued);
          if (events.length) {
            scene.onEvents(events, g);
            handleEvents(g, events);
          }
          if (screenRef.current !== "playing") break;
        }
        shown = g;
      } else if (current === "menu" || current === "over") {
        // Behind the game-over panel the final board stays up, so you can see how it ended.
        if (current === "over" && gameRef.current) {
          shown = gameRef.current;
        } else {
          if (!demoRef.current || demoRef.current.game.phase === "over") newDemo();
          const demo = demoRef.current!;
          acc += dt;
          while (acc >= STEP) {
            acc -= STEP;
            const events = step(demo.game, STEP, { left: false, right: false, down: false }, demo.ai(demo.game, STEP));
            if (events.length) scene.onEvents(events, demo.game);
          }
          shown = demo.game;
        }
      } else {
        // Paused: hold the last frame of the game.
        shown = gameRef.current;
        acc = 0;
      }

      if (shown) scene.render(shown, current === "paused" ? 0 : dt);

      // While paused the loop only keeps going to watch for a pad's Start button.
      const state = screenRef.current;
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
    window.addEventListener("gamepadconnected", kick);
    cleanups.push(() => window.removeEventListener("gamepadconnected", kick));

    import("@/lib/games/blockfall/scene").then(({ createBlockfallScene }) => {
      if (disposed) return;
      try {
        sceneRef.current = createBlockfallScene(canvas, { reducedMotion });
      } catch {
        go("unsupported");
        return;
      }
      const rect = stage.getBoundingClientRect();
      sceneRef.current.resize(rect.width, rect.height);
      newDemo();
      go("menu");
    });

    const resizer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      sceneRef.current?.resize(width, height);
      kick();
    });
    resizer.observe(stage);
    cleanups.push(() => resizer.disconnect());

    // Stop drawing while the stage is scrolled away, and pause a live game
    // rather than letting it play on unseen.
    const seen = new IntersectionObserver(
      ([entry]) => {
        visible = entry.intersectionRatio > 0.35;
        if (!visible && !document.fullscreenElement) pause();
        if (visible) kick();
      },
      { threshold: [0, 0.35, 0.6] }
    );
    seen.observe(stage);
    cleanups.push(() => seen.disconnect());

    const onVisibility = () => {
      if (document.hidden) pause();
      else kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

    // Keyboard: the usual layout, with letter keys as alternatives.
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const down = e.type === "keydown";
      const playing = screenRef.current === "playing";
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const hold = { ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", ArrowDown: "down", s: "down" }[k] as
        | keyof typeof held.current
        | undefined;
      if (hold) {
        held.current[hold] = down;
        if (playing) e.preventDefault();
        return;
      }
      if (!down) return;
      if (k === "f" && !e.repeat) {
        e.preventDefault();
        toggleFullscreen.current();
        return;
      }
      if ((k === "p" || k === "Escape") && (playing || screenRef.current === "paused")) {
        e.preventDefault();
        if (playing) pause();
        else resume();
        return;
      }
      if (!playing) return;
      const action = ({ ArrowUp: "rotateCW", x: "rotateCW", w: "rotateCW", z: "rotateCCW", q: "rotateCCW", " ": "hardDrop", c: "hold", Shift: "hold" } as Record<string, Action>)[k];
      if (!action) return;
      e.preventDefault();
      if (!e.repeat) actions.current.push(action);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const onBlur = () => {
      held.current = { left: false, right: false, down: false };
    };
    window.addEventListener("blur", onBlur);
    cleanups.push(() => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    });

    // Touch: drag sideways to move a cell per cell's width, drag down to
    // soft-drop, flick down to hard-drop, swipe up to hold, tap to turn.
    let gesture: {
      id: number;
      x0: number;
      y0: number;
      x: number;
      y: number;
      t0: number;
      axis: "x" | "y" | null;
      ax: number;
      ay: number;
      trail: { y: number; t: number }[];
    } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || screenRef.current !== "playing") return;
      if ((e.target as HTMLElement).closest("button")) return;
      gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: e.timeStamp, axis: null, ax: 0, ay: 0, trail: [] };
    };
    const onMove = (e: PointerEvent) => {
      const gs = gesture;
      if (!gs || e.pointerId !== gs.id || !sceneRef.current) return;
      const dx = e.clientX - gs.x;
      const dy = e.clientY - gs.y;
      gs.x = e.clientX;
      gs.y = e.clientY;
      gs.trail.push({ y: e.clientY, t: e.timeStamp });
      if (gs.trail.length > 8) gs.trail.shift();
      if (!gs.axis && Math.hypot(e.clientX - gs.x0, e.clientY - gs.y0) > 12) {
        gs.axis = Math.abs(e.clientX - gs.x0) > Math.abs(e.clientY - gs.y0) ? "x" : "y";
      }
      const cell = sceneRef.current.cellPixels() * 0.9;
      if (gs.axis === "x") {
        gs.ax += dx;
        while (gs.ax >= cell) {
          actions.current.push("right");
          gs.ax -= cell;
        }
        while (gs.ax <= -cell) {
          actions.current.push("left");
          gs.ax += cell;
        }
      } else if (gs.axis === "y" && dy > 0) {
        gs.ay += dy;
        while (gs.ay >= cell) {
          actions.current.push("down");
          gs.ay -= cell;
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      const gs = gesture;
      if (!gs || e.pointerId !== gs.id) return;
      gesture = null;
      if (screenRef.current !== "playing") return;
      if (!gs.axis) {
        if (e.timeStamp - gs.t0 < 350) actions.current.push("rotateCW");
        return;
      }
      if (gs.axis !== "y") return;
      const first = gs.trail[0];
      const speed = first && e.timeStamp > first.t ? (e.clientY - first.y) / (e.timeStamp - first.t) : 0;
      if (speed > 0.9) actions.current.push("hardDrop");
      else if (e.clientY - gs.y0 < -45) actions.current.push("hold");
    };
    stage.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    cleanups.push(() => {
      stage.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
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
  }, [go, handleEvents, pause, resume, startGame]);

  const quitToMenu = () => {
    gameRef.current = null;
    go("menu");
  };

  const hasRuns = status === "ready" && runs.length > 0;

  return (
    <div className="game">
      <div
        ref={stageRef}
        className={`game-stage blocks-stage${screen === "playing" ? " playing" : ""}${fs.filled ? " fill-window" : ""}`}
      >
        <canvas ref={canvasRef} className="game-canvas" aria-label="3D falling-block puzzle board" role="img" />

        <div className="game-tools">
          {(screen === "playing" || screen === "paused") && (
            <>
              <button
                type="button"
                className="game-tool"
                // Mouse clicks drop focus, so Space hard-drops instead of re-pressing this.
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
                  pause();
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

        {screen === "playing" && toast && (
          <p key={toast.key} className="game-flash blocks-callout">
            {toast.text}
            {toast.points > 0 && <span>+{formatScore(toast.points)}</span>}
          </p>
        )}

        {screen === "loading" && (
          <div className="game-overlay">
            <p className="game-loading">Stacking the blocks…</p>
          </div>
        )}

        {screen === "unsupported" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>This one needs WebGL</h2>
              <p className="game-copy">
                Your browser couldn&apos;t start a 3D context, so the board can&apos;t be drawn. Turning on
                hardware acceleration usually fixes it, or try another browser.
              </p>
            </div>
          </div>
        )}

        {screen === "menu" && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">Blockfall</p>
              <h2>{hasRuns ? "Back for another?" : "Ready when you are"}</h2>
              <p className="game-copy">{welcomeLine(status, runs)}</p>

              <fieldset className="game-choice">
                <legend>Start at level</legend>
                {START_LEVELS.map((level) => (
                  <label key={level}>
                    <input
                      type="radio"
                      name="blockfall-level"
                      value={level}
                      checked={settings.startLevel === level}
                      onChange={() => updateSettings({ startLevel: level })}
                    />
                    <span>Level {level}</span>
                  </label>
                ))}
              </fieldset>

              <button type="button" className="btn btn-primary game-start" onClick={startGame}>
                Start game
              </button>
              <p className="game-keys only-keys">
                Arrows to move and turn, Space to drop, C to hold. Z turns the other way. Gamepads work
                too.
              </p>
              <p className="game-keys only-touch">
                Drag to move, tap to turn, flick down to drop, swipe up to hold.
              </p>
            </div>
          </div>
        )}

        {screen === "paused" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>Paused</h2>
              <p className="game-copy">
                {formatScore(paused.score)} points so far, on level {paused.level}.
              </p>
              <div className="game-actions">
                <button type="button" className="btn btn-primary" onClick={resume} autoFocus>
                  Resume
                </button>
                <button type="button" className="btn btn-ghost" onClick={endGame}>
                  End and save
                </button>
              </div>
              <p className="game-keys">
                Ending now saves your score as it stands.{" "}
                <button type="button" className="game-link" onClick={quitToMenu}>
                  Quit without saving
                </button>
              </p>
            </div>
          </div>
        )}

        {screen === "over" && result && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">{result.best ? "New personal best" : "Game over"}</p>
              <h2>{formatScore(result.score)} points</h2>
              <ul className="game-stats">
                <li>
                  <strong>{result.lines}</strong>
                  <span>Lines</span>
                </li>
                <li>
                  <strong>{result.level}</strong>
                  <span>Level</span>
                </li>
                <li>
                  <strong>{result.quads}</strong>
                  <span>Quads</span>
                </li>
                <li>
                  <strong>{formatDuration(result.duration)}</strong>
                  <span>Time</span>
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
                <button type="button" className="btn btn-primary" onClick={startGame} autoFocus>
                  Play again
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => go("menu")}>
                  Change level
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
          <kbd>←</kbd> <kbd>→</kbd> move
        </span>
        <span>
          <kbd>↑</kbd> <kbd>Z</kbd> turn
        </span>
        <span>
          <kbd>↓</kbd> soft drop
        </span>
        <span>
          <kbd>Space</kbd> hard drop
        </span>
        <span>
          <kbd>C</kbd> hold
        </span>
        <span>
          <kbd>P</kbd> pause
        </span>
        <span>
          <kbd>F</kbd> full screen
        </span>
        <span>Gamepads: d-pad to move, A and B to turn, up to drop, Y to hold</span>
      </p>
    </div>
  );
}
