/**
 * Gamepads, read once per frame by each game's loop. Browsers only report a
 * pad after one of its buttons has been pressed, and there are no events for
 * button presses, so this compares each poll with the last to tell a fresh
 * press from a held button.
 *
 * Button numbers follow the "standard" mapping that Xbox, PlayStation and
 * most other pads report in every major browser.
 */

export const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

const DEAD_ZONE = 0.18;

export type Pad = {
  /** Left stick, with the d-pad taking over when pressed: -1 (left or up) to 1 (right or down). */
  x: number;
  y: number;
  pressed(button: number): boolean;
  /** Pressed now but not at the previous poll. */
  tapped(button: number): boolean;
  /** How far an analogue button (the triggers) is pressed, 0 to 1. */
  value(button: number): number;
};

const deadZone = (v: number) => (Math.abs(v) < DEAD_ZONE ? 0 : (v - Math.sign(v) * DEAD_ZONE) / (1 - DEAD_ZONE));

export function createGamepads() {
  const previous = new Map<number, boolean[]>();

  return {
    /** Every connected pad, in the order the browser lists them. */
    poll(): Pad[] {
      const list = typeof navigator !== "undefined" && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
      const pads: Pad[] = [];
      for (const gp of list) {
        if (!gp?.connected) continue;
        const now = gp.buttons.map((b) => b.pressed || b.value > 0.5);
        const before = previous.get(gp.index) ?? [];
        previous.set(gp.index, now);
        const dx = (now[BUTTON.RIGHT] ? 1 : 0) - (now[BUTTON.LEFT] ? 1 : 0);
        const dy = (now[BUTTON.DOWN] ? 1 : 0) - (now[BUTTON.UP] ? 1 : 0);
        pads.push({
          x: dx || deadZone(gp.axes[0] ?? 0),
          y: dy || deadZone(gp.axes[1] ?? 0),
          pressed: (b) => !!now[b],
          tapped: (b) => !!now[b] && !before[b],
          value: (b) => gp.buttons[b]?.value ?? 0,
        });
      }
      return pads;
    },
  };
}

/** True when any pad just pressed one of these buttons. */
export const anyTapped = (pads: Pad[], ...buttons: number[]) => pads.some((p) => buttons.some((b) => p.tapped(b)));
