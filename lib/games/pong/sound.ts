import { createSynth } from "@/lib/games/audio";

export function createSound() {
  const synth = createSynth();

  return {
    unlock: synth.unlock,
    setMuted: synth.setMuted,
    dispose: synth.dispose,
    hit(power: number) {
      synth.tone(780 + power * 260, { gain: 0.22, length: 0.07 });
    },
    bounce() {
      synth.tone(520, { gain: 0.12, length: 0.06 });
    },
    point(won: boolean) {
      if (won) {
        synth.tone(660, { length: 0.16 });
        synth.tone(990, { length: 0.22, delay: 0.09 });
      } else {
        synth.tone(440, { length: 0.16 });
        synth.tone(300, { length: 0.24, delay: 0.1 });
      }
    },
  };
}
