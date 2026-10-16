"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, SoundIcon } from "@/components/games/GameIcons";
import { formatLapTime, timeAgo } from "@/lib/games/format";
import { getPref, setPref, type HotLapRun } from "@/lib/games/history";
import {
  autopilot,
  createRace,
  getTrack,
  ghostPose,
  ghostTimeAt,
  lapDistance,
  lapTime,
  NO_CONTROLS,
  paceGhost,
  raceTime,
  respawn,
  stepRace,
  type Controls,
  type Ghost,
  type Race,
  type RaceEvent,
} from "@/lib/games/hotlap/engine";
import type { HotLapScene } from "@/lib/games/hotlap/scene";
import { createSound } from "@/lib/games/hotlap/sound";
import { summarizeHotLap } from "@/lib/games/stats";

const GAME = "hot-lap";
const SETTINGS_KEY = `${GAME}:settings`;
const GHOST_KEY = `${GAME}:ghost`;
/** The simulation always advances in steps this size, whatever the display's refresh rate. */
const STEP = 1 / 120;
const LAP_CHOICES = [1, 3] as const;

type Screen = "loading" | "menu" | "playing" | "paused" | "over" | "unsupported";
type Opponent = "best" | "pace" | "none";
type Settings = { laps: number; opponent: Opponent; muted: boolean };
type SavedGhost = Ghost & { setAt: number };
type Result = {
  total: number;
  laps: number[];
  bestLap: number;
  hits: number;
  /** The best lap against the ghost it raced, if it raced one. */
  versus: { name: string; gap: number } | null;
  personalBest: boolean;
  saved: boolean | null;
};

const DEFAULT_SETTINGS: Settings = { laps: 3, opponent: "best", muted: false };
const signed = (n: number) => `${n < 0 ? "-" : "+"}${Math.abs(n).toFixed(2)}`;

export default function HotLapGame({
  runs,
  status,
  onRaceEnd,
}: {
  runs: HotLapRun[];
  status: "loading" | "ready" | "unavailable";
  /** Resolves to false when the race could not be saved. */
  onRaceEnd: (record: HotLapRun) => Promise<boolean>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [best, setBest] = useState<SavedGhost | null>(null);
  const [pace, setPace] = useState<Ghost | null>(null);
  const [lap, setLap] = useState(1);
  const [countdown, setCountdown] = useState<{ text: string; key: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; sub: string; key: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [announce, setAnnounce] = useState("");

  // Fast-changing readouts are written straight to the DOM from the loop.
  const hud = {
    speed: useRef<HTMLElement>(null),
    gear: useRef<HTMLElement>(null),
    time: useRef<HTMLElement>(null),
    bestLap: useRef<HTMLElement>(null),
    gap: useRef<HTMLParagraphElement>(null),
    wrong: useRef<HTMLParagraphElement>(null),
    dot: useRef<SVGCircleElement>(null),
    ghostDot: useRef<SVGCircleElement>(null),
  };

  // The render loop lives outside React, so it reads these refs rather than state.
  const screenRef = useRef<Screen>("loading");
  const settingsRef = useRef(settings);
  const raceRef = useRef<Race | null>(null);
  const demoRef = useRef<Race | null>(null);
  const ghostRef = useRef<{ ghost: Ghost; name: string } | null>(null);
  const bestRef = useRef<SavedGhost | null>(null);
  const paceRef = useRef<Ghost | null>(null);
  const sceneRef = useRef<HotLapScene | null>(null);
  const soundRef = useRef<ReturnType<typeof createSound> | null>(null);
  const keys = useRef({ up: false, down: false, left: false, right: false, handbrake: false });
  const touch = useRef({ gas: false, brake: false, left: false, right: false });
  const onRaceEndRef = useRef(onRaceEnd);
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    onRaceEndRef.current = onRaceEnd;
  }, [onRaceEnd]);

  const go = useCallback((next: Screen) => {
    screenRef.current = next;
    setScreen(next);
    kickRef.current();
  }, []);

  // ---- Saved settings and the personal-best ghost ----
  useEffect(() => {
    getPref<Partial<Settings>>(SETTINGS_KEY).then(
      (saved) => saved && setSettings((s) => ({ ...s, ...saved })),
      () => {}
    );
    getPref<SavedGhost>(GHOST_KEY).then(
      (saved) => {
        if (saved?.samples) {
          bestRef.current = saved;
          setBest(saved);
        }
      },
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

  // Racing against your own ghost needs one to exist.
  const opponent: Opponent = settings.opponent === "best" && !best ? "pace" : settings.opponent;

  // ---- Minimap path, from the track itself ----
  const map = useMemo(() => {
    const t = getTrack();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let d = "";
    for (let i = 0; i < t.count; i += 3) {
      minX = Math.min(minX, t.x[i]);
      maxX = Math.max(maxX, t.x[i]);
      minZ = Math.min(minZ, t.z[i]);
      maxZ = Math.max(maxZ, t.z[i]);
      d += `${i ? "L" : "M"}${t.x[i].toFixed(1)} ${t.z[i].toFixed(1)}`;
    }
    const pad = 30;
    return {
      d: `${d}Z`,
      viewBox: `${minX - pad} ${minZ - pad} ${maxX - minX + pad * 2} ${maxZ - minZ + pad * 2}`,
      start: { x: t.x[0], z: t.z[0] },
    };
  }, []);

  // ---- Race lifecycle ----
  const finish = useCallback(
    (r: Race) => {
      const total = raceTime(r);
      const bestLap = r.bestLap!;
      const opponentGhost = ghostRef.current;
      const personalBest = !bestRef.current || bestLap < bestRef.current.lapTime;
      if (personalBest && r.bestGhost) {
        const saved = { ...r.bestGhost, setAt: Date.now() };
        bestRef.current = saved;
        setBest(saved);
        setPref(GHOST_KEY, saved).catch(() => {});
      }
      const paceLap = paceRef.current?.lapTime ?? Infinity;
      setResult({
        total,
        laps: r.lapTimes,
        bestLap,
        hits: r.hits,
        versus: opponentGhost ? { name: opponentGhost.name, gap: bestLap - opponentGhost.ghost.lapTime } : null,
        personalBest,
        saved: null,
      });
      setAnnounce(`Finished in ${formatLapTime(total)}. Best lap ${formatLapTime(bestLap)}.`);
      go("over");
      onRaceEndRef
        .current({
          game: GAME,
          laps: r.laps,
          totalTime: total,
          bestLap,
          lapTimes: r.lapTimes,
          beatPace: bestLap < paceLap,
          hits: r.hits,
          duration: Math.round(total),
          endedAt: Date.now(),
        })
        .then((saved) => setResult((res) => (res ? { ...res, saved } : res)));
    },
    [go]
  );
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  const handleEvents = useCallback((r: Race, events: RaceEvent[]) => {
    const sound = soundRef.current;
    for (const e of events) {
      if (e.type === "count") {
        sound?.count();
        setCountdown({ text: String(e.n), key: performance.now() });
      } else if (e.type === "go") {
        sound?.go();
        setCountdown({ text: "Go", key: performance.now() });
        setAnnounce("Go!");
      } else if (e.type === "hit") {
        sound?.hit(e.impact);
      } else if (e.type === "lap") {
        sound?.lap(e.best);
        const pb = e.best && (!bestRef.current || e.time < bestRef.current.lapTime);
        setToast({
          text: `Lap ${e.lap}  ${formatLapTime(e.time)}`,
          sub: pb ? "Personal best" : e.best && e.lap > 1 ? "Fastest lap this race" : "",
          key: performance.now(),
        });
        setLap(Math.min(e.lap + 1, r.laps));
        setAnnounce(`Lap ${e.lap}, ${formatLapTime(e.time)}`);
      } else if (e.type === "finish") {
        sound?.finish();
        finishRef.current(r);
      }
    }
  }, []);

  const startRace = useCallback(() => {
    const s = settingsRef.current;
    const sound = soundRef.current;
    sound?.unlock();
    sound?.setMuted(s.muted);
    const r = createRace(s.laps);
    raceRef.current = r;
    const pick = s.opponent === "best" && !bestRef.current ? "pace" : s.opponent;
    const paceNow = pick === "pace" ? (paceRef.current ??= paceGhost()) : null;
    ghostRef.current =
      pick === "best" && bestRef.current
        ? { ghost: bestRef.current, name: "your best" }
        : paceNow
          ? { ghost: paceNow, name: "the pace car" }
          : null;
    sceneRef.current?.reset();
    setLap(1);
    setResult(null);
    setToast(null);
    setCountdown(null);
    go("playing");
  }, [go]);

  const pause = useCallback(() => {
    if (screenRef.current !== "playing") return;
    soundRef.current?.quiet();
    go("paused");
  }, [go]);

  const resume = useCallback(() => {
    if (screenRef.current === "paused") go("playing");
  }, [go]);

  const quitToMenu = () => {
    raceRef.current = null;
    soundRef.current?.quiet();
    sceneRef.current?.reset();
    go("menu");
  };

  const reset = () => {
    if (raceRef.current && raceRef.current.phase === "racing") respawn(raceRef.current);
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
    soundRef.current = createSound();
    soundRef.current.setMuted(settingsRef.current.muted);

    const newDemo = () => {
      const r = createRace(1000);
      r.countdown = 0.01;
      demoRef.current = r;
    };

    const readControls = (): Controls => {
      const k = keys.current;
      const t = touch.current;
      let throttle = k.up || t.gas ? 1 : 0;
      let brake = k.down || t.brake ? 1 : 0;
      let steer = (k.right || t.right ? 1 : 0) - (k.left || t.left ? 1 : 0);
      let handbrake = k.handbrake;
      // A gamepad, if there is one: left stick steers, triggers for pedals.
      const pad = navigator.getGamepads?.().find((p) => p?.connected);
      if (pad) {
        const x = pad.axes[0] ?? 0;
        if (Math.abs(x) > 0.12) steer = Math.max(-1, Math.min(1, steer + x));
        throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0);
        brake = Math.max(brake, pad.buttons[6]?.value ?? 0);
        handbrake ||= !!pad.buttons[1]?.pressed;
      }
      return { throttle, brake, steer, handbrake };
    };

    const updateHud = (r: Race) => {
      const car = r.car;
      if (hud.speed.current) hud.speed.current.textContent = String(Math.round(Math.abs(car.speed) * 3.6));
      if (hud.gear.current) hud.gear.current.textContent = car.gear === 0 ? "R" : String(car.gear);
      if (hud.time.current) hud.time.current.textContent = formatLapTime(lapTime(r));
      if (hud.bestLap.current) hud.bestLap.current.textContent = r.bestLap ? formatLapTime(r.bestLap) : "--.---";
      hud.dot.current?.setAttribute("cx", car.x.toFixed(1));
      hud.dot.current?.setAttribute("cy", car.z.toFixed(1));
      const g = ghostRef.current;
      const gapEl = hud.gap.current;
      if (gapEl) {
        const t = g && r.phase === "racing" ? ghostTimeAt(g.ghost, lapDistance(r)) : null;
        if (t === null || !g) {
          gapEl.hidden = true;
        } else {
          const gap = lapTime(r) - t;
          gapEl.hidden = false;
          gapEl.textContent = `${signed(gap)} vs ${g.name}`;
          gapEl.dataset.ahead = String(gap < 0);
        }
      }
      if (hud.wrong.current) hud.wrong.current.hidden = !r.wrongWay;
    };

    const tick = (now: number) => {
      frame = 0;
      const scene = sceneRef.current;
      if (!scene || disposed) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : STEP;
      last = now;
      const current = screenRef.current;
      let shown: Race | null = null;

      if ((current === "playing" || current === "over") && raceRef.current) {
        const r = raceRef.current;
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          let c = current === "playing" ? readControls() : NO_CONTROLS;
          if (r.phase === "finished") {
            // After the flag, the car rolls on by itself at a gentle pace.
            const auto = autopilot(r);
            c = { ...auto, throttle: Math.min(auto.throttle, 0.3) };
          }
          const events = stepRace(r, STEP, c);
          if (events.length) {
            scene.onEvents(events);
            handleEvents(r, events);
          }
          if (screenRef.current === "paused") break;
        }
        shown = r;
        if (current === "playing") {
          soundRef.current?.drive(r.car);
          updateHud(r);
        }
      } else if (current === "menu" || current === "over") {
        if (!demoRef.current) newDemo();
        const demo = demoRef.current!;
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          stepRace(demo, STEP, demo.phase === "racing" ? autopilot(demo) : NO_CONTROLS);
        }
        shown = demo;
      } else {
        shown = raceRef.current;
        acc = 0;
      }

      if (shown) {
        const g = shown === raceRef.current ? ghostRef.current : null;
        // On the grid the ghost waits at the start of its lap; then it replays it.
        const pose = !g
          ? null
          : shown.phase === "racing"
            ? ghostPose(g.ghost, lapTime(shown))
            : shown.phase === "countdown"
              ? ghostPose(g.ghost, 0)
              : null;
        hud.ghostDot.current?.setAttribute("visibility", pose ? "visible" : "hidden");
        if (pose) {
          hud.ghostDot.current?.setAttribute("cx", pose.x.toFixed(1));
          hud.ghostDot.current?.setAttribute("cy", pose.z.toFixed(1));
        }
        scene.render(shown, pose, current === "paused" ? 0 : dt);
      }

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

    import("@/lib/games/hotlap/scene").then(({ createHotLapScene }) => {
      if (disposed) return;
      try {
        sceneRef.current = createHotLapScene(canvas, getTrack(), { reducedMotion });
      } catch {
        go("unsupported");
        return;
      }
      const rect = stage.getBoundingClientRect();
      sceneRef.current.resize(rect.width, rect.height);
      newDemo();
      go("menu");
      // The pace car's lap takes a moment to work out, so it waits until the page is idle.
      const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 200));
      idle(() => {
        if (disposed) return;
        paceRef.current ??= paceGhost();
        setPace(paceRef.current);
      });
    });

    const resizer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      sceneRef.current?.resize(width, height);
      kick();
    });
    resizer.observe(stage);
    cleanups.push(() => resizer.disconnect());

    const seen = new IntersectionObserver(
      ([entry]) => {
        visible = entry.intersectionRatio > 0.35;
        if (!visible) pause();
        else kick();
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

    const KEYS: Record<string, keyof typeof keys.current> = {
      ArrowUp: "up",
      w: "up",
      ArrowDown: "down",
      s: "down",
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
      " ": "handbrake",
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const down = e.type === "keydown";
      const playing = screenRef.current === "playing";
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (KEYS[k]) {
        keys.current[KEYS[k]] = down;
        if (playing) e.preventDefault();
        return;
      }
      if (!down) return;
      if ((k === "p" || k === "Escape") && (playing || screenRef.current === "paused")) {
        e.preventDefault();
        if (playing) pause();
        else resume();
      } else if (k === "r" && playing && raceRef.current?.phase === "racing") {
        respawn(raceRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    const onBlur = () => {
      keys.current = { up: false, down: false, left: false, right: false, handbrake: false };
      touch.current = { gas: false, brake: false, left: false, right: false };
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
  }, [go, handleEvents, pause, resume]);

  /** Hold-to-press handlers for the on-screen pedals and steering. */
  const pad = (control: keyof typeof touch.current) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      touch.current[control] = true;
    },
    onPointerUp: () => (touch.current[control] = false),
    onPointerCancel: () => (touch.current[control] = false),
    onLostPointerCapture: () => (touch.current[control] = false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const inRace = screen === "playing" || screen === "paused";
  const hasRuns = status === "ready" && runs.length > 0;
  const { bestLap } = summarizeHotLap(runs);

  let welcome: string;
  if (status === "unavailable") {
    welcome = "This browser isn't letting the site store anything, so your times and ghost won't be saved.";
  } else if (best) {
    welcome = `Welcome back. Your best lap is ${formatLapTime(best.lapTime)}, set ${timeAgo(best.setAt)}, and its ghost is on the grid waiting for you.`;
  } else if (hasRuns && bestLap) {
    welcome = `Welcome back. Your best lap is ${formatLapTime(bestLap)}.`;
  } else {
    welcome = `Beat the pace car${pace ? `'s ${formatLapTime(pace.lapTime)}` : ""}. Your fastest lap becomes a ghost you race next time.`;
  }

  return (
    <div className="game">
      <div ref={stageRef} className={`game-stage race-stage${screen === "playing" ? " playing" : ""}`}>
        <canvas ref={canvasRef} className="game-canvas" aria-label="3D race track" role="img" />

        {inRace && (
        <div className="race-hud">
          <div className="race-panel race-timing">
            <p className="race-lap">
              Lap <strong>{lap}</strong>/{settings.laps}
            </p>
            <p className="race-time">
              <strong ref={hud.time}>0.000</strong>
            </p>
            <p className="race-best">
              Best <span ref={hud.bestLap}>--.---</span>
            </p>
          </div>
          <p ref={hud.gap} className="race-gap" hidden />
          <div className="game-tools">
            <button
              type="button"
              className="game-tool"
              onClick={(e) => {
                reset();
                if (e.detail) e.currentTarget.blur();
              }}
              aria-label="Back onto the track"
              title="Back onto the track (R)"
            >
              <ResetIcon />
            </button>
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
          </div>
          <svg className="race-map" viewBox={map.viewBox} aria-hidden="true">
            <path d={map.d} className="race-map-track" />
            <circle cx={map.start.x} cy={map.start.z} r="9" className="race-map-start" />
            <circle ref={hud.ghostDot} r="13" className="race-map-ghost" visibility="hidden" />
            <circle ref={hud.dot} r="14" className="race-map-car" />
          </svg>
          <div className="race-panel race-speed">
            <strong ref={hud.speed}>0</strong>
            <span>
              km/h · gear <b ref={hud.gear}>1</b>
            </span>
          </div>
        </div>
        )}

        {screen === "playing" && (
          <div className="race-touch" aria-hidden="true">
            <div>
              <button type="button" {...pad("left")}>
                <SteerIcon dir={-1} />
              </button>
              <button type="button" {...pad("right")}>
                <SteerIcon dir={1} />
              </button>
            </div>
            <div>
              <button type="button" className="race-brake" {...pad("brake")}>
                Brake
              </button>
              <button type="button" className="race-gas" {...pad("gas")}>
                Gas
              </button>
            </div>
          </div>
        )}

        {screen === "playing" && (
          <p ref={hud.wrong} className="race-wrong" hidden>
            Wrong way
          </p>
        )}
        {screen === "playing" && countdown && (
          <p key={countdown.key} className={`race-count${countdown.text === "Go" ? " go" : ""}`}>
            {countdown.text}
          </p>
        )}
        {screen === "playing" && toast && (
          <p key={toast.key} className="game-flash race-toast">
            {toast.text}
            {toast.sub && <span>{toast.sub}</span>}
          </p>
        )}

        {screen === "loading" && (
          <div className="game-overlay">
            <p className="game-loading">Warming up the tyres…</p>
          </div>
        )}

        {screen === "unsupported" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>This one needs WebGL</h2>
              <p className="game-copy">
                Your browser couldn&apos;t start a 3D context, so the circuit can&apos;t be drawn. Turning on
                hardware acceleration usually fixes it, or try another browser.
              </p>
            </div>
          </div>
        )}

        {screen === "menu" && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">Hot Lap</p>
              <h2>{hasRuns ? "Back for another lap?" : "Ready when you are"}</h2>
              <p className="game-copy">{welcome}</p>

              <fieldset className="game-choice">
                <legend>Race length</legend>
                {LAP_CHOICES.map((n) => (
                  <label key={n}>
                    <input
                      type="radio"
                      name="hotlap-laps"
                      value={n}
                      checked={settings.laps === n}
                      onChange={() => updateSettings({ laps: n })}
                    />
                    <span>{n === 1 ? "1 lap" : `${n} laps`}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="game-choice">
                <legend>Ghost to race</legend>
                {(
                  [
                    ["best", best ? `Your best · ${formatLapTime(best.lapTime)}` : "Your best", !best],
                    ["pace", pace ? `Pace car · ${formatLapTime(pace.lapTime)}` : "Pace car", false],
                    ["none", "None", false],
                  ] as [Opponent, string, boolean][]
                ).map(([value, label, disabled]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="hotlap-ghost"
                      value={value}
                      checked={opponent === value}
                      disabled={disabled}
                      onChange={() => updateSettings({ opponent: value })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <button type="button" className="btn btn-primary game-start" onClick={startRace}>
                Start race
              </button>
              <p className="game-keys only-keys">
                Arrows or WASD to drive, Space for the handbrake, R to get back on the track.
              </p>
              <p className="game-keys only-touch">Steer and pedals are on screen once you start.</p>
            </div>
          </div>
        )}

        {screen === "paused" && (
          <div className="game-overlay">
            <div className="game-panel">
              <h2>Paused</h2>
              <div className="game-actions">
                <button type="button" className="btn btn-primary" onClick={resume} autoFocus>
                  Resume
                </button>
                <button type="button" className="btn btn-ghost" onClick={startRace}>
                  Restart race
                </button>
              </div>
              <p className="game-keys">
                <button type="button" className="game-link" onClick={quitToMenu}>
                  Quit to the menu
                </button>{" "}
                without saving this race.
              </p>
            </div>
          </div>
        )}

        {screen === "over" && result && (
          <div className="game-overlay">
            <div className="game-panel">
              <p className="section-eyebrow">{result.personalBest ? "New personal best lap" : "Chequered flag"}</p>
              <h2>{formatLapTime(result.total)}</h2>
              <ul className="game-stats">
                <li>
                  <strong>{formatLapTime(result.bestLap)}</strong>
                  <span>Best lap</span>
                </li>
                {result.versus && (
                  <li>
                    <strong className={result.versus.gap < 0 ? "race-ahead" : "race-behind"}>{signed(result.versus.gap)}</strong>
                    <span>vs {result.versus.name}</span>
                  </li>
                )}
                <li>
                  <strong>{result.hits}</strong>
                  <span>{result.hits === 1 ? "Barrier hit" : "Barrier hits"}</span>
                </li>
              </ul>
              {result.laps.length > 1 && (
                <ol className="race-laps">
                  {result.laps.map((t, i) => (
                    <li key={i} className={t === result.bestLap ? "best" : undefined}>
                      <span>Lap {i + 1}</span>
                      <span>{formatLapTime(t)}</span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="game-keys" role="status">
                {result.saved === null
                  ? "Saving to your history…"
                  : result.saved
                    ? result.personalBest
                      ? "Saved, and this lap is now the ghost you'll race."
                      : "Saved to your history below."
                    : "Couldn't save this one. Your browser is blocking site storage."}
              </p>
              <div className="game-actions">
                <button type="button" className="btn btn-primary" onClick={startRace} autoFocus>
                  Race again
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    raceRef.current = null;
                    sceneRef.current?.reset();
                    go("menu");
                  }}
                >
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
          <kbd>↑</kbd> <kbd>↓</kbd> gas and brake
        </span>
        <span>
          <kbd>←</kbd> <kbd>→</kbd> steer
        </span>
        <span>
          <kbd>Space</kbd> handbrake
        </span>
        <span>
          <kbd>R</kbd> back on track
        </span>
        <span>
          <kbd>P</kbd> pause
        </span>
        <span>Gamepads work too</span>
      </p>
    </div>
  );
}

function SteerIcon({ dir }: { dir: 1 | -1 }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
      <path d={dir < 0 ? "M15.5 4.5 7 12l8.5 7.5z" : "M8.5 4.5 17 12l-8.5 7.5z"} />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </svg>
  );
}
