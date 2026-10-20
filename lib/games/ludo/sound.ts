import { createSynth } from "@/lib/games/audio";

const SCALE = [523, 659, 784, 1047, 1319];

export function createSound() {
  const synth = createSynth();

  return {
    unlock: synth.unlock,
    setMuted: synth.setMuted,
    dispose: synth.dispose,
    /** The die clattering to a stop: knocks that bunch up and soften. */
    roll() {
      let t = 0;
      for (let i = 0; i < 7; i++) {
        synth.noise({ gain: 0.11 - i * 0.012, length: 0.035, freq: 1800 + Math.random() * 900, delay: t });
        t += 0.13 - i * 0.012;
      }
    },
    hop(delay: number, last: boolean) {
      synth.tone(last ? 520 : 640, { gain: last ? 0.09 : 0.05, length: 0.05, slide: 0.7, type: "triangle", delay });
    },
    leaveYard() {
      synth.tone(SCALE[0], { gain: 0.07, length: 0.12, slide: 1 });
      synth.tone(SCALE[2], { gain: 0.07, length: 0.16, slide: 1, delay: 0.08 });
    },
    capture(delay = 0) {
      synth.tone(180, { gain: 0.18, length: 0.16, slide: 0.5, delay });
      synth.tone(700, { gain: 0.07, length: 0.3, slide: 0.35, delay: delay + 0.05 });
    },
    home(delay = 0) {
      [2, 3, 4].forEach((n, i) => synth.tone(SCALE[n], { gain: 0.07, length: 0.18, slide: 1, delay: delay + i * 0.07 }));
    },
    stuck() {
      synth.tone(300, { gain: 0.05, length: 0.14, slide: 0.85 });
    },
    yourTurn() {
      synth.tone(880, { gain: 0.04, length: 0.1, slide: 1 });
    },
    over(won: boolean) {
      const notes = won ? [0, 1, 2, 3, 4] : [3, 2, 1, 0];
      notes.forEach((n, i) => synth.tone(SCALE[n] * (won ? 1 : 0.75), { gain: 0.08, length: 0.26, slide: 1, delay: i * 0.11 }));
    },
  };
}
