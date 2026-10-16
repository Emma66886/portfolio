"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, timeAgo } from "@/lib/games/format";
import { getPref, setPref, summarize, type MatchRecord } from "@/lib/games/history";
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

const GAME = "ping-pong";
const SETTINGS_KEY = `${GAME}:settings`;
/** The simulation always advances in steps this size, whatever the display's refresh rate. */
const STEP = 1 / 120;
/** Paddle speed with the arrow keys, m/s. */
const KEY_SPEED = 3.2;
const TARGETS = [5, 11] as const;

type Screen = "loading" | "menu" | "playing" | "paused" | "over" | "unsupported";
type Settings = { difficulty: Difficulty; target: number; muted: boolean };
type Hud = { player: number; cpu: number; server: Side; rally: number; serving: boolean };
type Result = {
  winner: Side;
  player: number;
  cpu: number;
  longestRally: number;
  duration: number;
  difficulty: Difficulty;
  /** null while the save is in flight. */
  saved: boolean | null;
};

const DEFAULT_SETTINGS: Settings = { difficulty: "normal", target: 5, muted: false };
const hudFrom = (m: Match): Hud => ({
  player: m.score.player,
  cpu: m.score.cpu,
  server: m.server,
  rally: m.rally,
  serving: m.phase === "serve" && m.server === "player",
});

function welcomeLine(status: string, matches: MatchRecord[]) {
  if (status === "unavailable") {
    return "This browser isn't letting the site store anything, so matches won't be saved this time.";
  }
  if (status !== "ready" || !matches.length) {
    return "Pick a level and see how long you can keep a rally going. Finished matches are saved in this browser.";
  }
  const { wins, losses } = summarize(matches);
  const last = matches[0];
  const level = DIFFICULTIES[last.difficulty as Difficulty]?.label.toLowerCase() ?? last.difficulty;
  return `Welcome back. You're ${wins}-${losses} against the CPU. Last match: ${
    last.result === "win" ? "won" : "lost"
  } ${last.playerScore}-${last.opponentScore} on ${level}, ${timeAgo(last.endedAt)}.`;
}

export default function PongGame({
  matches,
  status,
  onMatchEnd,
}: {
  matches: MatchRecord[];
  status: "loading" | "ready" | "unavailable";
  /** Resolves to false when the match could not be saved. */
  onMatchEnd: (record: MatchRecord) => Promise<boolean>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hud, setHud] = useState<Hud>({ player: 0, cpu: 0, server: "player", rally: 0, serving: false });
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [announce, setAnnounce] = useState("");

  // The render loop lives outside React, so it reads these refs rather than
  // state. React only hears about the moments the HUD needs to change.
  const screenRef = useRef<Screen>("loading");
  const settingsRef = useRef(settings);
  const matchRef = useRef<Match | null>(null);
  const demoRef = useRef<{ match: Match; pilot: ReturnType<typeof createAutopilot> } | null>(null);
  const sceneRef = useRef<PongScene | null>(null);
  const soundRef = useRef<ReturnType<typeof createSound> | null>(null);
  const input = useRef({ x: 0, serveQueued: false, left: false, right: false });
  const onMatchEndRef = useRef(onMatchEnd);
  useEffect(() => {
    onMatchEndRef.current = onMatchEnd;
  }, [onMatchEnd]);
  const kickRef = useRef<() => void>(() => {});

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
      for (const e of events) {
        if (e.type === "hit") {
          sound?.hit(e.power);
          setHud(hudFrom(m));
        } else if (e.type === "bounce") {
          sound?.bounce();
        } else if (e.type === "serve" || e.type === "ready") {
          input.current.serveQueued = false;
          setHud(hudFrom(m));
        } else if (e.type === "point") {
          sound?.point(e.winner === "player");
          setHud(hudFrom(m));
          setFlash({ text: e.winner === "player" ? "Your point" : "CPU's point", key: performance.now() });
          setAnnounce(`You ${m.score.player}, CPU ${m.score.cpu}`);
        } else if (e.type === "over") {
          const outcome: Result = {
            winner: e.winner,
            player: m.score.player,
            cpu: m.score.cpu,
            longestRally: m.longestRally,
            duration: m.time,
            difficulty: m.difficulty,
            saved: null,
          };
          setResult(outcome);
          setAnnounce(
            `${e.winner === "player" ? "You won" : "The CPU won"} ${m.score.player} to ${m.score.cpu}`
          );
          go("over");
          onMatchEndRef
            .current({
              game: GAME,
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
    const { difficulty, target } = settingsRef.current;
    soundRef.current?.unlock();
    const m = createMatch(difficulty, target);
    m.player.x = input.current.x;
    matchRef.current = m;
    input.current.serveQueued = false;
    setHud(hudFrom(m));
    setResult(null);
    setFlash(null);
    setAnnounce(`New match, first to ${target}. Your serve.`);
    go("playing");
  }, [go]);

  const requestServe = useCallback(() => {
    const m = matchRef.current;
    if (screenRef.current === "playing" && m?.phase === "serve" && m.server === "player") {
      input.current.serveQueued = true;
    }
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
    soundRef.current = createSound();
    soundRef.current.setMuted(settingsRef.current.muted);

    const newDemo = () => {
      const match = createMatch("normal", 11);
      match.timer = 0.6;
      demoRef.current = { match, pilot: createAutopilot() };
    };

    const tick = (now: number) => {
      frame = 0;
      const scene = sceneRef.current;
      if (!scene || disposed) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : STEP;
      last = now;
      const current = screenRef.current;

      let shown: Match | null = null;
      if (current === "playing" && matchRef.current) {
        const m = matchRef.current;
        const keys = input.current;
        if (keys.left !== keys.right) {
          keys.x = Math.min(Math.max(keys.x + (keys.right ? 1 : -1) * KEY_SPEED * dt, -PADDLE_RANGE), PADDLE_RANGE);
        }
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          const events = step(m, STEP, { x: keys.x, serve: keys.serveQueued });
          if (events.length) {
            scene.onEvents(events);
            handleEvents(m, events);
          }
          if (screenRef.current !== "playing") break;
        }
        shown = m;
      } else if (current === "menu" || current === "over") {
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

      if (shown) scene.render(shown, current === "paused" ? 0 : dt);

      const animating = current === "playing" || current === "menu" || current === "over";
      if (animating && visible && !document.hidden) frame = requestAnimationFrame(tick);
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
        if (!visible && screenRef.current === "playing") go("paused");
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

    // Pointer: the paddle follows the pointer across the whole width of the
    // stage. Listening on window keeps it tracking when the mouse drifts off
    // the canvas mid-rally.
    const aimAt = (clientX: number) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const rect = stage.getBoundingClientRect();
      const u = (clientX - rect.left) / rect.width;
      input.current.x = Math.min(Math.max(scene.pointerToX(u), -PADDLE_RANGE), PADDLE_RANGE);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (screenRef.current === "playing") aimAt(e.clientX);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (screenRef.current !== "playing") return;
      if ((e.target as HTMLElement).closest("button")) return;
      aimAt(e.clientX);
      requestServe();
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    stage.addEventListener("pointerdown", onPointerDown);
    cleanups.push(() => {
      window.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("pointerdown", onPointerDown);
    });

    // Keyboard: arrows or A/D to move, Space or Enter to serve, P or Esc to pause.
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const down = e.type === "keydown";
      const playing = screenRef.current === "playing";
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") {
        input.current.left = down;
        if (playing) e.preventDefault();
      } else if (k === "arrowright" || k === "d") {
        input.current.right = down;
        if (playing) e.preventDefault();
      } else if (down && (k === " " || k === "enter") && playing) {
        e.preventDefault();
        requestServe();
      } else if (down && (k === "p" || k === "escape") && (playing || screenRef.current === "paused")) {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const onBlur = () => {
      input.current.left = false;
      input.current.right = false;
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
  }, [go, handleEvents, requestServe, togglePause]);

  const quit = () => {
    matchRef.current = null;
    setHud({ player: 0, cpu: 0, server: "player", rally: 0, serving: false });
    go("menu");
  };

  const inMatch = screen === "playing" || screen === "paused";
  const level = DIFFICULTIES[settings.difficulty].label;

  return (
    <div className="pong">
      <div
        ref={stageRef}
        className={`pong-stage${screen === "playing" ? " playing" : ""}`}
      >
        <canvas ref={canvasRef} className="pong-canvas" aria-label="3D ping pong table" role="img" />

        {inMatch && (
          <div className="pong-hud">
            <div className="pong-score" aria-hidden="true">
              <div className={`pong-side${hud.server === "player" ? " serving" : ""}`}>
                <span className="pong-name">You</span>
                <strong>{hud.player}</strong>
              </div>
              <span className="pong-vs">:</span>
              <div className={`pong-side cpu${hud.server === "cpu" ? " serving" : ""}`}>
                <strong>{hud.cpu}</strong>
                <span className="pong-name">CPU</span>
              </div>
            </div>
            <p className="pong-meta">
              First to {settings.target} · {level}
              {hud.rally > 1 && <span className="pong-rally"> · Rally {hud.rally}</span>}
            </p>
            <div className="pong-tools">
              <button
                type="button"
                className="pong-tool"
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
                className="pong-tool"
                onClick={(e) => {
                  togglePause();
                  if (e.detail) e.currentTarget.blur();
                }}
                aria-label="Pause"
              >
                <PauseIcon />
              </button>
            </div>
          </div>
        )}

        {screen === "playing" && hud.serving && (
          <p className="pong-prompt">Your serve. Click, tap or press Space</p>
        )}
        {screen === "playing" && flash && (
          <p key={flash.key} className="pong-flash">
            {flash.text}
          </p>
        )}

        {screen === "loading" && (
          <div className="pong-overlay">
            <p className="pong-loading">Setting up the table…</p>
          </div>
        )}

        {screen === "unsupported" && (
          <div className="pong-overlay">
            <div className="pong-panel">
              <h2>This one needs WebGL</h2>
              <p className="pong-copy">
                Your browser couldn&apos;t start a 3D context, so the table can&apos;t be drawn. Turning on
                hardware acceleration usually fixes it, or try another browser.
              </p>
            </div>
          </div>
        )}

        {screen === "menu" && (
          <div className="pong-overlay">
            <div className="pong-panel">
              <p className="section-eyebrow">Ping Pong</p>
              <h2>{status === "ready" && matches.length ? "Back for another?" : "Ready when you are"}</h2>
              <p className="pong-copy">{welcomeLine(status, matches)}</p>

              <fieldset className="pong-choice">
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

              <fieldset className="pong-choice">
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

              <button type="button" className="btn btn-primary pong-start" onClick={startMatch}>
                Start match
              </button>
              <p className="pong-keys">
                Mouse, touch or arrow keys to move. Where the ball meets your paddle sets the angle.
              </p>
            </div>
          </div>
        )}

        {screen === "paused" && (
          <div className="pong-overlay">
            <div className="pong-panel">
              <h2>Paused</h2>
              <p className="pong-copy">
                You {hud.player}, CPU {hud.cpu}. First to {settings.target} on {level.toLowerCase()}.
              </p>
              <div className="pong-actions">
                <button type="button" className="btn btn-primary" onClick={togglePause} autoFocus>
                  Resume
                </button>
                <button type="button" className="btn btn-ghost" onClick={quit}>
                  Quit match
                </button>
              </div>
              <p className="pong-keys">Quitting leaves this match out of your history.</p>
            </div>
          </div>
        )}

        {screen === "over" && result && (
          <div className="pong-overlay">
            <div className="pong-panel">
              <p className="section-eyebrow">{result.winner === "player" ? "Match won" : "Match lost"}</p>
              <h2>
                {result.winner === "player" ? "You took it " : "CPU takes it "}
                {Math.max(result.player, result.cpu)}-{Math.min(result.player, result.cpu)}
              </h2>
              <ul className="pong-stats">
                <li>
                  <strong>{result.longestRally}</strong>
                  <span>Longest rally</span>
                </li>
                <li>
                  <strong>{formatDuration(result.duration)}</strong>
                  <span>Match time</span>
                </li>
                <li>
                  <strong>{DIFFICULTIES[result.difficulty].label}</strong>
                  <span>Level</span>
                </li>
              </ul>
              <p className="pong-keys" role="status">
                {result.saved === null
                  ? "Saving to your history…"
                  : result.saved
                    ? "Saved to your history below."
                    : "Couldn't save this one. Your browser is blocking site storage."}
              </p>
              <div className="pong-actions">
                <button type="button" className="btn btn-primary" onClick={startMatch} autoFocus>
                  Play again
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
      <p className="pong-help">
        <span>
          <kbd>←</kbd> <kbd>→</kbd> or mouse to move
        </span>
        <span>
          <kbd>Space</kbd> or click to serve
        </span>
        <span>
          <kbd>P</kbd> to pause
        </span>
      </p>
    </div>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
      {muted ? (
        <path d="m16 9.5 5 5m0-5-5 5" />
      ) : (
        <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />
      )}
    </svg>
  );
}
