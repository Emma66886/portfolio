import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cellFor, pathFor, rotateCell, type Cell } from "@/lib/games/ludo/board";
import { HOME, PACE, TOKENS, YARD, target, type LudoEvent, type LudoView } from "@/lib/games/ludo/engine";

/** Player colours, warm enough to sit with the site's palette. */
export const TOKEN_COLORS = ["#C63B50", "#2F9E6E", "#E3B341", "#3B78C2"];
const TINTS = ["#F3C9CF", "#BFE3D1", "#F7E3B0", "#C6D8EF"];

const COLORS = {
  bg: "#140E0D",
  table: "#24150F",
  wood: "#6B3F27",
  paper: "#F7EFE3",
  line: "#CDBDA8",
  ink: "#3A2722",
  gold: "#D9A56B",
};

const N = 15;
const TEX = 2048;
const CELL = TEX / N;
/** How high the board's printed surface sits. */
const TOP = 0.2;
const DIE = 0.8;
/** The middle of red's yard; the die is thrown from the roller's own yard. */
const YARD_CENTRE: Cell = [2.5, 2.5];

const toLocal = ([r, c]: Cell, y = TOP) => new THREE.Vector3(c - 7, y, r - 7);

// ---- The printed board ----

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function boardTexture(maxAnisotropy: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, TEX, TEX);
  // Paper grain.
  const img = ctx.getImageData(0, 0, TEX, TEX);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  const cell = (r: number, c: number, fill: string | null) => {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 4;
    ctx.strokeRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
  };
  // The cross of track squares.
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inRows = r >= 6 && r <= 8;
      const inCols = c >= 6 && c <= 8;
      if (inRows !== inCols) cell(r, c, null);
    }
  }

  // Each colour's pieces, drawn as red's and turned a quarter per colour.
  for (let color = 0; color < 4; color++) {
    ctx.save();
    ctx.translate(TEX / 2, TEX / 2);
    ctx.rotate((color * Math.PI) / 2);
    ctx.translate(-TEX / 2, -TEX / 2);
    const fill = TOKEN_COLORS[color];

    // Yard: a coloured square with a cream court and four token spots.
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, CELL * 6, CELL * 6);
    ctx.fillStyle = COLORS.paper;
    ctx.beginPath();
    ctx.roundRect(CELL * 0.7, CELL * 0.7, CELL * 4.6, CELL * 4.6, CELL * 0.5);
    ctx.fill();
    for (const [r, c] of [
      [1.65, 1.65],
      [1.65, 3.35],
      [3.35, 1.65],
      [3.35, 3.35],
    ]) {
      ctx.beginPath();
      ctx.arc((c + 0.5) * CELL, (r + 0.5) * CELL, CELL * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = TINTS[color];
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = fill;
      ctx.stroke();
    }
    // Home column and start square.
    for (let c = 1; c <= 5; c++) cell(7, c, fill);
    cell(6, 1, fill);
    // An arrow on the start square, pointing the way round.
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.moveTo(1.28 * CELL, 6.5 * CELL);
    ctx.lineTo(1.62 * CELL, 6.3 * CELL);
    ctx.lineTo(1.62 * CELL, 6.42 * CELL);
    ctx.lineTo(1.78 * CELL, 6.42 * CELL);
    ctx.lineTo(1.78 * CELL, 6.58 * CELL);
    ctx.lineTo(1.62 * CELL, 6.58 * CELL);
    ctx.lineTo(1.62 * CELL, 6.7 * CELL);
    ctx.closePath();
    ctx.fill();
    // The star 8 squares on: a safe square.
    star(ctx, 6.5 * CELL, 2.5 * CELL, CELL * 0.34);
    ctx.lineWidth = 7;
    ctx.strokeStyle = "#B49A7E";
    ctx.stroke();
    // An arrow on the square where this colour turns for home.
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0.3 * CELL, 7.5 * CELL);
    ctx.lineTo(0.62 * CELL, 7.28 * CELL);
    ctx.lineTo(0.62 * CELL, 7.72 * CELL);
    ctx.closePath();
    ctx.fill();
    // Its triangle in the centre.
    ctx.beginPath();
    ctx.moveTo(6 * CELL, 6 * CELL);
    ctx.lineTo(7.5 * CELL, 7.5 * CELL);
    ctx.lineTo(6 * CELL, 9 * CELL);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(58,39,34,.35)";
  ctx.lineWidth = 5;
  ctx.strokeRect(6 * CELL, 6 * CELL, 3 * CELL, 3 * CELL);
  ctx.beginPath();
  ctx.moveTo(6 * CELL, 6 * CELL);
  ctx.lineTo(9 * CELL, 9 * CELL);
  ctx.moveTo(9 * CELL, 6 * CELL);
  ctx.lineTo(6 * CELL, 9 * CELL);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/** A die face: ivory with dark pips, and the one in red. */
function dieFace(value: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FBF5EA";
  ctx.fillRect(0, 0, 256, 256);
  const at: Record<number, [number, number][]> = {
    1: [[128, 128]],
    2: [
      [70, 70],
      [186, 186],
    ],
    3: [
      [66, 66],
      [128, 128],
      [190, 190],
    ],
    4: [
      [72, 72],
      [184, 72],
      [72, 184],
      [184, 184],
    ],
    5: [
      [66, 66],
      [190, 66],
      [128, 128],
      [66, 190],
      [190, 190],
    ],
    6: [
      [72, 62],
      [184, 62],
      [72, 128],
      [184, 128],
      [72, 194],
      [184, 194],
    ],
  };
  for (const [x, y] of at[value]) {
    ctx.beginPath();
    ctx.arc(x, y, value === 1 ? 34 : 24, 0, Math.PI * 2);
    ctx.fillStyle = value === 1 ? "#B3283C" : "#2A1C18";
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Box faces are +x, -x, +y, -y, +z, -z. Opposite faces add up to 7. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
/** The turn that puts each value on top. */
const FACE_UP: Record<number, THREE.Quaternion> = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
  3: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
  2: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
};

function pawnGeometry() {
  const profile = [
    [0, 0],
    [0.33, 0],
    [0.36, 0.035],
    [0.34, 0.085],
    [0.25, 0.12],
    [0.17, 0.2],
    [0.13, 0.33],
    [0.2, 0.39],
    [0.21, 0.42],
    [0.13, 0.46],
    [0, 0.46],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(profile, 36);
  const head = new THREE.SphereGeometry(0.16, 28, 18);
  head.translate(0, 0.57, 0);
  const merged = mergeGeometries([body, head])!;
  body.dispose();
  head.dispose();
  return merged;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

type Hop = { points: THREE.Vector3[]; start: number; hop: number; arc: number; spin: boolean };
type Token = {
  group: THREE.Group;
  pawn: THREE.Mesh;
  hit: THREE.Mesh;
  ring: THREE.Mesh;
  seat: number;
  index: number;
  progress: number;
  hop: Hop | null;
  bob: number;
};

export type LudoHit = { kind: "token"; token: number } | { kind: "die" } | null;
export type LudoScene = ReturnType<typeof createLudoScene>;

export function createLudoScene(canvas: HTMLCanvasElement, options: { reducedMotion: boolean }) {
  const { reducedMotion } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 26, 48);
  const pmrem = keep(new THREE.PMREMGenerator(renderer));
  const room = new RoomEnvironment();
  scene.environment = keep(pmrem.fromScene(room, 0.04).texture);
  scene.environmentIntensity = 0.4;
  room.dispose();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);

  // ---- Lights ----
  scene.add(new THREE.HemisphereLight("#FFF3E4", "#2A1610", 0.7));
  const sun = new THREE.DirectionalLight("#FFF0DC", 2.2);
  sun.position.set(-5, 14, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.PointLight("#C63B50", 30, 30, 1.5);
  rim.position.set(0, 4, -12);
  scene.add(rim);

  // ---- Table and board ----
  const table = new THREE.Mesh(
    keep(new THREE.CircleGeometry(30, 64)),
    keep(new THREE.MeshStandardMaterial({ color: COLORS.table, roughness: 0.85 }))
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  const board = new THREE.Group();
  scene.add(board);
  const base = new THREE.Mesh(
    keep(new RoundedBoxGeometry(16.3, TOP, 16.3, 3, 0.09)),
    keep(new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.42, metalness: 0.05 }))
  );
  base.position.y = TOP / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  board.add(base);
  const face = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(N, N)),
    keep(new THREE.MeshStandardMaterial({ map: keep(boardTexture(renderer.capabilities.getMaxAnisotropy())), roughness: 0.62 }))
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = TOP + 0.002;
  face.receiveShadow = true;
  board.add(face);

  // ---- Highlights ----
  const ringGeo = keep(new THREE.RingGeometry(0.38, 0.5, 40));
  const makeRing = (color: string) => {
    const ring = new THREE.Mesh(
      ringGeo,
      keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }))
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    board.add(ring);
    return ring;
  };
  const destination = makeRing(COLORS.gold);
  destination.scale.setScalar(1.15);

  // ---- Tokens ----
  const pawnGeo = keep(pawnGeometry());
  const hitGeo = keep(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 12));
  const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
  const pawnMats = TOKEN_COLORS.map((c) =>
    keep(new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.18, emissive: c, emissiveIntensity: 0 }))
  );
  let tokens: Token[] = [];
  let colors: number[] = [];

  function buildTokens(seatColors: number[]) {
    for (const t of tokens) {
      board.remove(t.group, t.ring);
      (t.pawn.material as THREE.Material).dispose();
    }
    colors = seatColors;
    tokens = [];
    seatColors.forEach((color, seat) => {
      for (let index = 0; index < TOKENS; index++) {
        const group = new THREE.Group();
        // Each pawn gets its own material so it can glow on its own.
        const pawn = new THREE.Mesh(pawnGeo, pawnMats[color].clone());
        pawn.castShadow = true;
        pawn.receiveShadow = true;
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.y = 0.45;
        group.add(pawn, hit);
        board.add(group);
        tokens.push({ group, pawn, hit, ring: makeRing(TOKEN_COLORS[color]), seat, index, progress: YARD, hop: null, bob: 0 });
      }
    });
  }

  /** Resting spot for every token, nudging apart any that share a square. */
  function layout() {
    const spots = new Map<string, Token[]>();
    for (const t of tokens) {
      const [r, c] = cellFor(colors[t.seat], t.progress, t.index);
      const key = `${r.toFixed(2)},${c.toFixed(2)}`;
      spots.set(key, [...(spots.get(key) ?? []), t]);
    }
    const rest = new Map<Token, { pos: THREE.Vector3; scale: number }>();
    for (const group of spots.values()) {
      const n = group.length;
      group.forEach((t, i) => {
        const pos = toLocal(cellFor(colors[t.seat], t.progress, t.index));
        if (n > 1) {
          const a = (i / n) * Math.PI * 2 + Math.PI / 4;
          pos.x += Math.cos(a) * 0.2;
          pos.z += Math.sin(a) * 0.2;
        }
        const scale = t.progress === HOME ? 0.6 : n > 1 ? 0.72 : 1;
        rest.set(t, { pos, scale });
      });
    }
    return rest;
  }
  let rest = layout();

  // ---- Die ----
  const dieMats = FACE_VALUES.map((v) => keep(new THREE.MeshStandardMaterial({ map: keep(dieFace(v)), roughness: 0.35 })));
  const die = new THREE.Mesh(keep(new RoundedBoxGeometry(DIE, DIE, DIE, 4, 0.11)), dieMats);
  die.castShadow = true;
  const dieRest = new THREE.Vector3(0, TOP + DIE / 2, 0);
  die.position.copy(dieRest);
  die.quaternion.copy(FACE_UP[6]);
  board.add(die);
  const dieGlow = makeRing(COLORS.gold);
  dieGlow.position.set(0, TOP + 0.01, 0);
  dieGlow.scale.setScalar(1.25);
  let dieRoll: { from: THREE.Vector3; spinAxis: THREE.Vector3; spins: number; end: THREE.Quaternion; start: number; dur: number } | null = null;

  // ---- Camera ----
  let viewerColor = 0;
  const view = { width: 1, height: 1 };
  const corners = [-8.2, 8.2].flatMap((x) => [-8.2, 8.2].map((z) => new THREE.Vector3(x, TOP, z)));
  const resize = (w: number, h: number) => {
    view.width = Math.max(1, w);
    view.height = Math.max(1, h);
    renderer.setSize(view.width, view.height, false);
    const aspect = view.width / view.height;
    const tall = THREE.MathUtils.clamp((1.4 - aspect) / 0.7, 0, 1);
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.lerp(36, 44, tall);
    camera.updateProjectionMatrix();
    const dip = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(56, 64, tall));
    // Back the camera off until the whole board fits, with room left above for the prompt.
    const lookAt = new THREE.Vector3(0, 0, THREE.MathUtils.lerp(0.9, 0.4, tall));
    let dist = 10;
    for (let i = 0; i < 40; i++) {
      camera.position.set(lookAt.x, lookAt.y + Math.sin(dip) * dist, lookAt.z + Math.cos(dip) * dist);
      camera.lookAt(lookAt);
      camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        const p = c.clone().project(camera);
        return Math.abs(p.x) < 0.94 && p.y < 0.8 && p.y > -0.95;
      });
      if (fits) break;
      dist += 0.5;
    }
  };

  // ---- State ----
  let clock = 0;
  let legal: number[] = [];
  let canRoll = false;
  let turnSeat = -1;
  let you = 0;
  let hovered: number | null = null;
  let focused: number | null = null;
  let rollValue: number | null = null;

  function sync(v: LudoView) {
    you = Math.max(0, v.you);
    if (colors.join() !== v.colors.join()) buildTokens(v.colors);
    viewerColor = v.colors[you] ?? 0;
    // Your colour's yard comes round to the bottom left.
    board.rotation.y = ((1 + viewerColor) * Math.PI) / 2;
    tokens.forEach((t) => {
      t.progress = v.tokens[t.seat][t.index];
      t.hop = null;
    });
    rest = layout();
    for (const t of tokens) {
      const r = rest.get(t)!;
      t.group.position.copy(r.pos);
      t.group.scale.setScalar(r.scale);
      t.group.rotation.set(0, 0, 0);
    }
    turnSeat = v.winner === null ? v.turn : -1;
    if (v.roll) {
      rollValue = v.roll;
      die.quaternion.copy(FACE_UP[v.roll]);
    }
  }

  const tokenOf = (seat: number, index: number) => tokens.find((t) => t.seat === seat && t.index === index)!;

  function apply(events: LudoEvent[], v: LudoView) {
    let t = 0;
    for (const e of events) {
      if (e.type === "roll") {
        rollValue = e.value;
        const throwFrom = toLocal(rotateCell(YARD_CENTRE, colors[e.seat]), TOP + 2.2).multiplyScalar(0.7);
        throwFrom.y = TOP + 2.2;
        const yaw = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * Math.PI * 2);
        dieRoll = {
          from: throwFrom,
          spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize(),
          spins: reducedMotion ? 0 : 3 + Math.random() * 2,
          end: yaw.multiply(FACE_UP[e.value]),
          start: clock + t,
          dur: reducedMotion ? 200 : PACE.roll - 80,
        };
        t += PACE.roll;
      } else if (e.type === "move") {
        const tok = tokenOf(e.seat, e.token);
        const cells = pathFor(colors[e.seat], e.from, e.to, e.token);
        const points = [tok.group.position.clone(), ...cells.map((c) => toLocal(c))];
        const leaving = e.from === YARD;
        tok.hop = {
          points,
          start: clock + t,
          hop: leaving ? PACE.leaveYard - 40 : PACE.step,
          arc: leaving ? 1.1 : 0.42,
          spin: false,
        };
        tok.progress = e.to;
        t += leaving ? PACE.leaveYard : (e.to - e.from) * PACE.step + 120;
      } else if (e.type === "capture") {
        const tok = tokenOf(e.victim, e.token);
        tok.progress = YARD;
        tok.hop = {
          points: [toLocal(cellFor(colors[e.victim], e.from, e.token)), toLocal(cellFor(colors[e.victim], YARD, e.token))],
          start: clock + t - 60,
          hop: PACE.capture - 60,
          arc: 3.2,
          spin: !reducedMotion,
        };
        t += PACE.capture;
      } else if (e.type === "home") t += PACE.home;
      else if (e.type === "stuck") t += PACE.stuck;
      else if (e.type === "forfeit") t += PACE.forfeit;
    }
    rest = layout();
    turnSeat = v.winner === null ? v.turn : -1;
    // If anything disagrees with the view (a missed update, say), the view wins.
    if (tokens.some((tok) => tok.progress !== v.tokens[tok.seat]?.[tok.index])) sync(v);
  }

  // ---- Picking ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitTest = (u: number, v: number): LudoHit => {
    ndc.set(u * 2 - 1, -(v * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    if (legal.length) {
      const mine = tokens.filter((t) => t.seat === turnSeat && legal.includes(t.index));
      const hit = raycaster.intersectObjects(mine.map((t) => t.hit), false)[0];
      if (hit) return { kind: "token", token: mine.find((t) => t.hit === hit.object)!.index };
    }
    if (raycaster.intersectObject(die, false).length) return { kind: "die" };
    return null;
  };

  // ---- Frame ----
  const pos = new THREE.Vector3();
  function render(dtSeconds: number) {
    clock += dtSeconds * 1000;
    const dt = Math.min(dtSeconds, 0.1);
    const pulse = reducedMotion ? 0.6 : 0.5 + Math.sin(clock / 240) * 0.5;

    for (const tok of tokens) {
      const r = rest.get(tok)!;
      const isLegal = turnSeat === tok.seat && legal.includes(tok.index);
      const goal = isLegal ? 1 : 0;
      tok.bob += (goal - tok.bob) * (1 - Math.exp(-dt * 10));
      const mat = tok.pawn.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = tok.bob * (0.12 + pulse * 0.18) + (tok.index === focused && isLegal ? 0.2 : 0);

      const hop = tok.hop;
      if (hop && clock >= hop.start) {
        const steps = hop.points.length - 1;
        const elapsed = clock - hop.start;
        const seg = Math.min(steps - 1, Math.floor(elapsed / hop.hop));
        const k = Math.min(1, (elapsed - seg * hop.hop) / hop.hop);
        const a = hop.points[seg];
        const b = seg === steps - 1 ? r.pos : hop.points[seg + 1];
        pos.lerpVectors(a, b, ease(k));
        pos.y += Math.sin(k * Math.PI) * hop.arc;
        tok.group.position.copy(pos);
        tok.group.rotation.y = hop.spin ? k * Math.PI * 4 : 0;
        tok.group.scale.setScalar(THREE.MathUtils.lerp(tok.group.scale.x, r.scale, 0.2));
        if (elapsed >= steps * hop.hop) {
          tok.hop = null;
          tok.group.rotation.y = 0;
        }
      } else if (!hop) {
        const lift = isLegal && !reducedMotion ? 0.08 + Math.sin(clock / 220 + tok.index) * 0.06 : 0;
        const hoverLift = (tok.index === hovered || tok.index === focused) && isLegal ? 0.18 : 0;
        tok.group.position.x += (r.pos.x - tok.group.position.x) * (1 - Math.exp(-dt * 14));
        tok.group.position.z += (r.pos.z - tok.group.position.z) * (1 - Math.exp(-dt * 14));
        tok.group.position.y += (r.pos.y + lift + hoverLift - tok.group.position.y) * (1 - Math.exp(-dt * 14));
        tok.group.scale.setScalar(tok.group.scale.x + (r.scale - tok.group.scale.x) * (1 - Math.exp(-dt * 10)));
      }
      const ringMat = tok.ring.material as THREE.MeshBasicMaterial;
      tok.ring.visible = tok.bob > 0.02;
      tok.ring.position.set(r.pos.x, TOP + 0.012, r.pos.z);
      ringMat.opacity = tok.bob * (0.45 + pulse * 0.45);
    }

    // Where the chosen token would land.
    const pick = focused ?? hovered;
    const chosen = pick !== null && legal.includes(pick) ? tokenOf(turnSeat, pick) : null;
    const dm = destination.material as THREE.MeshBasicMaterial;
    if (chosen && rollValue) {
      const to = target(chosen.progress, rollValue);
      if (to !== null) {
        destination.position.copy(toLocal(cellFor(colors[chosen.seat], to, chosen.index), TOP + 0.014));
        destination.visible = true;
        dm.opacity = 0.5 + pulse * 0.4;
      }
    } else destination.visible = false;

    // The die: tumbling in from the thrower's side, or waiting to be rolled.
    if (dieRoll && clock >= dieRoll.start) {
      const k = Math.min(1, (clock - dieRoll.start) / dieRoll.dur);
      const glide = 1 - Math.pow(1 - k, 3);
      die.position.lerpVectors(dieRoll.from, dieRest, glide);
      const bounce = Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) * (1 - k) * 1.6;
      die.position.y = dieRest.y + bounce * (1 - glide * 0.3);
      const spin = new THREE.Quaternion().setFromAxisAngle(dieRoll.spinAxis, (1 - glide) * dieRoll.spins * Math.PI * 2);
      die.quaternion.copy(spin.multiply(dieRoll.end));
      if (k >= 1) {
        dieRoll = null;
        die.position.copy(dieRest);
      }
    } else if (!dieRoll) {
      const wait = canRoll && !reducedMotion ? Math.sin(clock / 300) * 0.06 + 0.08 : 0;
      die.position.y += (dieRest.y + wait - die.position.y) * (1 - Math.exp(-dt * 8));
    }
    const gm = dieGlow.material as THREE.MeshBasicMaterial;
    dieGlow.visible = canRoll;
    gm.opacity = 0.35 + pulse * 0.45;

    renderer.render(scene, camera);
  }

  return {
    resize,
    apply,
    reset: sync,
    /** What the player at this screen can do right now. */
    setInput(next: { legal: number[]; roll: boolean }) {
      legal = next.legal;
      canRoll = next.roll;
    },
    setHover(token: number | null) {
      hovered = token;
    },
    setFocus(token: number | null) {
      focused = token;
    },
    hitTest,
    /** Which corner of the screen a seat's yard has come round to. */
    cornerOf(seat: number): "bl" | "tl" | "tr" | "br" {
      return (["bl", "tl", "tr", "br"] as const)[(colors[seat] - viewerColor + 4) % 4];
    },
    get busy() {
      return !!dieRoll || tokens.some((t) => t.hop);
    },
    render,
    dispose() {
      for (const t of tokens) (t.pawn.material as THREE.Material).dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
