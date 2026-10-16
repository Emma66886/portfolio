import { createSynth } from "@/lib/games/audio";

const SCALE = [523, 659, 784, 1047, 1319];

export function createSound() {
  const synth = createSynth();
  let lastMove = 0;

  return {
    unlock: synth.unlock,
    setMuted: synth.setMuted,
    dispose: synth.dispose,
    move() {
      // Auto-repeat fires fast; one tick per few frames is plenty.
      const now = performance.now();
      if (now - lastMove < 30) return;
      lastMove = now;
      synth.tone(1400, { gain: 0.03, length: 0.025, slide: 0.8, type: "triangle" });
    },
    rotate() {
      synth.tone(980, { gain: 0.045, length: 0.04, slide: 0.7, type: "triangle" });
    },
    hold() {
      synth.tone(560, { gain: 0.06, length: 0.08, slide: 1.4 });
    },
    lock() {
      synth.tone(210, { gain: 0.13, length: 0.08, slide: 0.6 });
    },
    hardDrop() {
      synth.tone(150, { gain: 0.2, length: 0.12, slide: 0.5 });
      synth.tone(95, { gain: 0.12, length: 0.18, slide: 0.6 });
    },
    /** A rising run, one note per line, with an extra top note for quads and T-spins. */
    clear(lines: number, special: boolean) {
      for (let i = 0; i < lines; i++) synth.tone(SCALE[i], { gain: 0.09, length: 0.2, slide: 1, delay: i * 0.055 });
      if (special) synth.tone(SCALE[4], { gain: 0.08, length: 0.35, slide: 1, delay: lines * 0.055 });
    },
    level() {
      [0, 2, 4].forEach((n, i) => synth.tone(SCALE[n], { gain: 0.08, length: 0.18, slide: 1, delay: i * 0.08 }));
    },
    over() {
      [784, 622, 523, 392].forEach((f, i) => synth.tone(f, { gain: 0.08, length: 0.3, slide: 0.95, delay: i * 0.14 }));
    },
  };
}
