import { createSynth } from "@/lib/games/audio";

const SCALE = [523, 659, 784, 1047, 1319];

export function createSound() {
  const synth = createSynth();

  return {
    unlock: synth.unlock,
    setMuted: synth.setMuted,
    dispose: synth.dispose,
    /** A card snapping down on the pile. */
    play(delay = 0) {
      synth.noise({ gain: 0.16, length: 0.07, freq: 2600, delay });
      synth.tone(190, { gain: 0.08, length: 0.06, slide: 0.6, delay: delay + 0.02 });
    },
    /** A card sliding off the market. */
    draw(delay = 0) {
      synth.noise({ gain: 0.06, length: 0.12, freq: 4200, q: 0.6, delay });
    },
    deal(count: number, gap: number) {
      for (let i = 0; i < count; i++) synth.noise({ gain: 0.035, length: 0.05, freq: 3600, delay: i * gap });
    },
    special() {
      synth.tone(SCALE[2], { gain: 0.07, length: 0.14, slide: 1 });
      synth.tone(SCALE[3], { gain: 0.06, length: 0.2, slide: 1, delay: 0.07 });
    },
    /** Someone was made to pick: a low, falling pair. */
    pick() {
      synth.tone(330, { gain: 0.08, length: 0.16, slide: 0.8 });
      synth.tone(247, { gain: 0.07, length: 0.22, slide: 0.8, delay: 0.1 });
    },
    yourTurn() {
      synth.tone(880, { gain: 0.04, length: 0.1, slide: 1 });
    },
    last() {
      synth.tone(988, { gain: 0.05, length: 0.08, slide: 1 });
      synth.tone(988, { gain: 0.05, length: 0.08, slide: 1, delay: 0.12 });
    },
    over(won: boolean) {
      const notes = won ? [0, 1, 2, 3, 4] : [3, 2, 1, 0];
      notes.forEach((n, i) => synth.tone(SCALE[n] * (won ? 1 : 0.75), { gain: 0.08, length: 0.26, slide: 1, delay: i * 0.11 }));
    },
  };
}
