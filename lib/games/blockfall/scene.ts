import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  CLEAR_DELAY,
  COLS,
  NEXT_SHOWN,
  PIECES,
  ROWS,
  VISIBLE,
  cellsOf,
  dropDistance,
  pivotOf,
  previewCells,
  type Game,
  type GameEvent,
  type PieceType,
} from "@/lib/games/blockfall/engine";

/**
 * Piece colours drawn from the site palette and pushed apart enough to tell
 * at a glance, rather than the usual bright primaries.
 */
export const PIECE_COLORS: Record<PieceType, string> = {
  I: "#E3A857",
  J: "#5F7CB0",
  L: "#E07A4F",
  O: "#EED9B7",
  S: "#7FA37A",
  T: "#9B4A7A",
  Z: "#C63B50",
};

const COLORS = {
  bg: "#140E0D",
  well: "#1C1312",
  rail: "#2B1D1A",
  glow: "#D9A56B",
  label: "#A99087",
  value: "#F6ECE7",
  dead: "#3A2E2B",
};

const FOV = 32;
const BLOCK = 0.9;
const PARTICLES = 240;

const toWorldX = (x: number) => x - (COLS - 1) / 2;
const toWorldY = (y: number) => y - (VISIBLE - 1) / 2;

/**
 * Side columns sit closer and smaller on narrow screens, with room left at the
 * top for the toolbar. The top also leaves the row above the well in view,
 * since new pieces enter there.
 */
const LAYOUTS = {
  wide: { column: 8.3, preview: 0.62, previewSmall: 0.5, text: 1, top: 11.4, bottom: -10.7, width: 20.6 },
  narrow: { column: 6.75, preview: 0.48, previewSmall: 0.4, text: 0.78, top: 13.4, bottom: -10.6, width: 16.3 },
};

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A flat label drawn into a canvas, redrawn only when its text changes. */
function makeText(width: number, height: number, style: { weight: number; color: string; spacing?: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round((512 * height) / width);
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  let current: string | null = null;

  const draw = (text: string) => {
    current = text;
    const family = getComputedStyle(document.body).fontFamily || "sans-serif";
    let size = canvas.height * 0.72;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = style.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${style.spacing ?? 0}px`;
    // Shrink long numbers to fit rather than letting them run off the plane.
    do {
      ctx.font = `${style.weight} ${size}px ${family}`;
      size *= 0.92;
    } while (ctx.measureText(text).width > canvas.width * 0.94 && size > 10);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    texture.needsUpdate = true;
  };

  return {
    mesh,
    set(text: string) {
      if (text !== current) draw(text);
    },
    /** Redraws with the page font once it has loaded. */
    refresh() {
      if (current !== null) draw(current);
    },
    dispose() {
      texture.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

export type BlockfallScene = ReturnType<typeof createBlockfallScene>;

/**
 * Draws a Game. Holds no game state of its own beyond animation: piece
 * motion, rows falling into place, particles, streaks and camera movement.
 */
export function createBlockfallScene(canvas: HTMLCanvasElement, options: { reducedMotion: boolean }) {
  const { reducedMotion } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap = pmrem.fromScene(room, 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
  const disposables: { dispose(): void }[] = [envMap, pmrem];
  const track = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  // ---- Lights ----
  scene.add(new THREE.HemisphereLight("#F6ECE7", "#2B1D1A", 0.8));
  const key = new THREE.DirectionalLight("#FFF1E6", 1.9);
  key.position.set(-6, 12, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 13, bottom: -13, near: 1, far: 40 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);

  // ---- Backdrop: the site's warm glow and grid, far enough back to parallax ----
  const backdrop = new THREE.Mesh(
    track(new THREE.PlaneGeometry(90, 56)),
    track(
      new THREE.MeshBasicMaterial({
        toneMapped: false,
        map: track(
          canvasTexture(1024, 640, (ctx) => {
            const { width: w, height: h } = ctx.canvas;
            ctx.fillStyle = COLORS.bg;
            ctx.fillRect(0, 0, w, h);
            const glow = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.42);
            glow.addColorStop(0, "rgba(163,38,57,0.38)");
            glow.addColorStop(0.55, "rgba(120,80,64,0.12)");
            glow.addColorStop(1, "rgba(20,14,13,0)");
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "rgba(217,165,107,0.06)";
            ctx.lineWidth = 1;
            for (let x = 0; x <= w; x += 32) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, h);
              ctx.stroke();
            }
            for (let y = 0; y <= h; y += 32) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(w, y);
              ctx.stroke();
            }
          })
        ),
      })
    )
  );
  backdrop.position.z = -9;
  scene.add(backdrop);

  // ---- The well ----
  const wellBack = new THREE.Mesh(
    track(new THREE.PlaneGeometry(COLS, VISIBLE)),
    track(
      new THREE.MeshStandardMaterial({
        color: COLORS.well,
        roughness: 0.92,
        map: track(
          canvasTexture(320, 640, (ctx) => {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, 320, 640);
            ctx.strokeStyle = "rgba(217,165,107,0.55)";
            ctx.lineWidth = 1.5;
            for (let x = 0; x <= 320; x += 32) {
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, 640);
              ctx.stroke();
            }
            for (let y = 0; y <= 640; y += 32) {
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(320, y);
              ctx.stroke();
            }
          })
        ),
      })
    )
  );
  wellBack.position.z = -BLOCK / 2 - 0.05;
  wellBack.receiveShadow = true;
  scene.add(wellBack);

  const railMat = track(new THREE.MeshStandardMaterial({ color: COLORS.rail, roughness: 0.35, metalness: 0.65 }));
  const edgeMat = track(
    new THREE.MeshStandardMaterial({ color: COLORS.glow, emissive: COLORS.glow, emissiveIntensity: 0.9 })
  );
  const railDepth = BLOCK + 0.2;
  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  const halfW = COLS / 2 + 0.11;
  const floorY = -VISIBLE / 2 - 0.11;
  addBox(0.22, VISIBLE + 0.44, railDepth, -halfW, 0.11, -0.05, railMat);
  addBox(0.22, VISIBLE + 0.44, railDepth, halfW, 0.11, -0.05, railMat);
  addBox(COLS + 0.66, 0.22, railDepth, 0, floorY, -0.05, railMat);
  // Thin lit strips along the front edges of the frame.
  addBox(0.05, VISIBLE + 0.44, 0.05, -halfW, 0.11, railDepth / 2 - 0.03, edgeMat);
  addBox(0.05, VISIBLE + 0.44, 0.05, halfW, 0.11, railDepth / 2 - 0.03, edgeMat);
  addBox(COLS + 0.66, 0.05, 0.05, 0, floorY, railDepth / 2 - 0.03, edgeMat);

  // ---- Blocks ----
  const blockGeo = track(new RoundedBoxGeometry(BLOCK, BLOCK, BLOCK, 3, 0.11));
  const pieceColors = Object.fromEntries(PIECES.map((p) => [p, new THREE.Color(PIECE_COLORS[p])])) as Record<
    PieceType,
    THREE.Color
  >;
  const blockMat = track(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.08 }));
  const board = new THREE.InstancedMesh(blockGeo, blockMat, COLS * ROWS);
  board.castShadow = true;
  board.receiveShadow = true;
  board.count = 0;
  board.frustumCulled = false;
  scene.add(board);

  const activeMat = track(
    new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.08, emissiveIntensity: 0.18 })
  );
  const active = new THREE.Group();
  const activeSpin = new THREE.Group();
  active.add(activeSpin);
  const activeBlocks = Array.from({ length: 4 }, () => {
    const mesh = new THREE.Mesh(blockGeo, activeMat);
    mesh.castShadow = true;
    activeSpin.add(mesh);
    return mesh;
  });
  scene.add(active);

  const ghostMat = track(
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.13, depthWrite: false, toneMapped: false })
  );
  const ghostBox = new THREE.BoxGeometry(BLOCK * 0.98, BLOCK * 0.98, BLOCK * 0.98);
  const ghostEdgeGeo = track(new THREE.EdgesGeometry(ghostBox));
  ghostBox.dispose();
  const ghostEdgeMat = track(
    new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false })
  );
  const ghost = new THREE.Group();
  const ghostBlocks = Array.from({ length: 4 }, () => {
    const cell = new THREE.Group();
    cell.add(new THREE.Mesh(blockGeo, ghostMat), new THREE.LineSegments(ghostEdgeGeo, ghostEdgeMat));
    ghost.add(cell);
    return cell;
  });
  scene.add(ghost);

  // ---- Hold and next: small turning models beside the well ----
  const makePreview = () => {
    const material = track(new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.08, transparent: true }));
    const group = new THREE.Group();
    const blocks = Array.from({ length: 4 }, () => {
      const mesh = new THREE.Mesh(blockGeo, material);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    });
    let shown: PieceType | null = null;
    scene.add(group);
    return {
      group,
      set(type: PieceType | null, dim = false) {
        group.visible = !!type;
        material.opacity = dim ? 0.35 : 1;
        if (!type || type === shown) return;
        shown = type;
        material.color.copy(pieceColors[type]);
        previewCells(type).forEach(([x, y], i) => blocks[i].position.set(x, y, 0));
      },
    };
  };
  const holdPreview = makePreview();
  const nextPreviews = Array.from({ length: NEXT_SHOWN }, makePreview);

  const labelStyle = { weight: 700, color: COLORS.label, spacing: 18 };
  const valueStyle = { weight: 800, color: COLORS.value };
  const texts = {
    hold: makeText(3.2, 0.62, labelStyle),
    next: makeText(3.2, 0.62, labelStyle),
    scoreLabel: makeText(3.2, 0.62, labelStyle),
    score: makeText(3.8, 1.2, valueStyle),
    levelLabel: makeText(3.2, 0.62, labelStyle),
    level: makeText(3.8, 1.2, valueStyle),
    linesLabel: makeText(3.2, 0.62, labelStyle),
    lines: makeText(3.8, 1.2, valueStyle),
  };
  Object.values(texts).forEach((t) => {
    scene.add(t.mesh);
    disposables.push(t);
  });
  texts.hold.set("HOLD");
  texts.next.set("NEXT");
  texts.scoreLabel.set("SCORE");
  texts.levelLabel.set("LEVEL");
  texts.linesLabel.set("LINES");
  document.fonts?.ready.then(() => Object.values(texts).forEach((t) => t.refresh()));

  // ---- Effects ----
  // Cleared blocks burst into small tumbling cubes.
  const bitGeo = track(new THREE.BoxGeometry(0.24, 0.24, 0.24));
  const bitMat = track(new THREE.MeshStandardMaterial({ roughness: 0.35, emissiveIntensity: 0.2 }));
  const bits = new THREE.InstancedMesh(bitGeo, bitMat, PARTICLES);
  bits.frustumCulled = false;
  bits.count = 0;
  scene.add(bits);
  type Bit = { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; spin: THREE.Vector3; life: number; max: number; color: THREE.Color };
  let liveBits: Bit[] = [];

  const glowTex = track(
    canvasTexture(256, 32, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 32);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 32);
    })
  );
  const streakTex = track(
    canvasTexture(32, 256, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(255,255,255,0.9)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 256);
    })
  );
  const planeGeo = track(new THREE.PlaneGeometry(1, 1));
  type Fx = { mesh: THREE.Mesh; age: number; life: number; kind: "bar" | "streak" };
  const fx: Fx[] = [];
  const makeFx = (kind: Fx["kind"]) => {
    const mesh = new THREE.Mesh(
      planeGeo,
      track(
        new THREE.MeshBasicMaterial({
          map: kind === "bar" ? glowTex : streakTex,
          color: kind === "bar" ? "#FFF4E8" : COLORS.glow,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
      )
    );
    mesh.visible = false;
    scene.add(mesh);
    const item = { mesh, age: 0, life: 1, kind };
    fx.push(item);
    return item;
  };
  for (let i = 0; i < 4; i++) makeFx("bar");
  for (let i = 0; i < 4; i++) makeFx("streak");
  const useFx = (kind: Fx["kind"], life: number) => {
    const item = fx.find((f) => f.kind === kind && !f.mesh.visible) ?? fx.find((f) => f.kind === kind)!;
    item.age = 0;
    item.life = life;
    item.mesh.visible = true;
    return item;
  };

  // ---- Animation state ----
  /** Per row, how far it still has to fall into place after a clear. */
  const rowDrop = new Float32Array(ROWS);
  /** Recently locked cells glow briefly. */
  const lockGlow = new Float32Array(ROWS * COLS);
  let spin = 0;
  let snapPiece = true;
  let shake = 0;
  let pulse = 0;
  let overAge = -1;
  let time = 0;
  let layout = LAYOUTS.wide;
  const view = { dist: 40, cy: 0, yaw: 0, pitch: 0 };
  let width = 1;
  let height = 1;
  let lastGame: Game | null = null;

  const color = new THREE.Color();
  const white = new THREE.Color("#FFF8F0").multiplyScalar(1.6);
  const dead = new THREE.Color(COLORS.dead);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  const placeColumns = () => {
    const L = layout;
    const left = -L.column;
    const right = L.column;
    texts.hold.mesh.position.set(left, 9.4, 0);
    holdPreview.group.position.set(left, 7.4, 0);
    holdPreview.group.scale.setScalar(L.preview);
    texts.scoreLabel.mesh.position.set(left, 4.5, 0);
    texts.score.mesh.position.set(left, 3.45, 0);
    texts.levelLabel.mesh.position.set(left, 1.8, 0);
    texts.level.mesh.position.set(left, 0.75, 0);
    texts.linesLabel.mesh.position.set(left, -0.9, 0);
    texts.lines.mesh.position.set(left, -1.95, 0);
    texts.next.mesh.position.set(right, 9.4, 0);
    const nextY = [7.4, 5.0, 2.9];
    nextPreviews.forEach((p, i) => {
      p.group.position.set(right, nextY[i], 0);
      p.group.scale.setScalar(i === 0 ? L.preview : L.previewSmall);
    });
    Object.values(texts).forEach((t) => t.mesh.scale.setScalar(L.text));
  };

  const resize = (w: number, h: number) => {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    layout = aspect < 0.95 ? LAYOUTS.narrow : LAYOUTS.wide;
    placeColumns();
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const tall = layout.top - layout.bottom;
    // Fit the whole layout, plus the depth of the blocks standing proud of z = 0.
    view.dist = Math.max(tall / 2 / t, layout.width / 2 / (t * aspect)) * 1.03 + BLOCK / 2;
    view.cy = (layout.top + layout.bottom) / 2;
  };

  /** Screen pixels per board cell, so touch drags can move one cell per cell's width. */
  const cellPixels = () => height / (2 * (view.dist - BLOCK / 2) * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));

  const burst = (rows: number[], g: Game) => {
    for (const y of rows) {
      for (let x = 0; x < COLS; x++) {
        const type = PIECES[g.board[y * COLS + x] - 1];
        for (let k = 0; k < 2 && liveBits.length < PARTICLES; k++) {
          liveBits.push({
            p: new THREE.Vector3(toWorldX(x) + (Math.random() - 0.5) * 0.5, toWorldY(y), 0.2),
            v: new THREE.Vector3((Math.random() - 0.5) * 7, 3 + Math.random() * 6, 2 + Math.random() * 6),
            r: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0),
            spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
            life: 0.8 + Math.random() * 0.4,
            max: 1.2,
            color: type ? pieceColors[type] : white,
          });
        }
      }
    }
  };

  const onEvents = (events: GameEvent[], g: Game) => {
    for (const e of events) {
      if (e.type === "spawn") {
        snapPiece = true;
        spin = 0;
      } else if (e.type === "rotate" && !reducedMotion) {
        // Start turned back the way it came and ease into the new orientation.
        spin = e.dir * (Math.PI / 2);
      } else if (e.type === "hardDrop" && e.distance > 0) {
        const columns = new Map<number, number>();
        for (const [x, y] of e.cells) columns.set(x, Math.min(columns.get(x) ?? Infinity, y));
        for (const [x, y] of columns) {
          const item = useFx("streak", 0.24);
          const h = e.distance + 1;
          item.mesh.position.set(toWorldX(x), toWorldY(y) + h / 2 - 0.5, 0.48);
          item.mesh.scale.set(BLOCK * 0.9, h, 1);
        }
        if (!reducedMotion) shake = Math.max(shake, 0.05 + e.distance * 0.006);
      } else if (e.type === "lock") {
        for (const [x, y] of e.cells) if (y < ROWS) lockGlow[y * COLS + x] = 1;
      } else if (e.type === "clear") {
        for (const y of e.rows) {
          const item = useFx("bar", CLEAR_DELAY + 0.12);
          item.mesh.position.set(0, toWorldY(y), 0.5);
          item.mesh.scale.set(COLS + 0.6, 1.6, 1);
        }
        if (!reducedMotion) {
          burst(e.rows, g);
          shake = Math.max(shake, 0.04 * e.lines);
        }
      } else if (e.type === "collapse") {
        // Each surviving row drops by however many cleared rows were under it.
        let next = 0;
        for (let old = 0; old < ROWS; old++) {
          if (e.rows.includes(old)) continue;
          rowDrop[next] = reducedMotion ? 0 : old - next;
          next++;
        }
        lockGlow.fill(0);
      } else if (e.type === "level") {
        pulse = 1;
      } else if (e.type === "over") {
        overAge = 0;
      }
    }
  };

  const render = (g: Game, dt: number) => {
    time += dt;
    if (g !== lastGame) {
      // Switched game (demo to match, or a fresh start): drop the last one's leftovers.
      lastGame = g;
      overAge = g.phase === "over" ? 1 : -1;
      rowDrop.fill(0);
      lockGlow.fill(0);
      liveBits = [];
      snapPiece = true;
    }
    if (overAge >= 0) overAge += dt;

    // ---- Settled blocks ----
    const clearing = g.phase === "clearing" ? g.clearing : [];
    const clearT = clearing.length ? 1 - Math.max(g.timer, 0) / CLEAR_DELAY : 0;
    let n = 0;
    for (let y = 0; y < ROWS; y++) {
      rowDrop[y] *= Math.exp(-dt * 14);
      if (rowDrop[y] < 0.002) rowDrop[y] = 0;
      for (let x = 0; x < COLS; x++) {
        const v = g.board[y * COLS + x];
        if (!v) continue;
        const i = y * COLS + x;
        color.copy(pieceColors[PIECES[v - 1]]);
        let s = 1;
        if (clearing.includes(y)) {
          color.lerp(white, Math.min(1, clearT * 2.2));
          s = 1 - clearT * clearT;
        }
        if (lockGlow[i] > 0) {
          color.lerp(white, lockGlow[i] * 0.35);
          lockGlow[i] = Math.max(0, lockGlow[i] - dt * 5);
        }
        // Game over: the stack greys out from the bottom up.
        if (overAge >= 0 && y < overAge * 26) color.lerp(dead, 0.85);
        pos.set(toWorldX(x), toWorldY(y + rowDrop[y]), 0);
        scl.setScalar(Math.max(s, 0.001));
        board.setMatrixAt(n, matrix.compose(pos, quat.identity(), scl));
        board.setColorAt(n, color);
        n++;
      }
    }
    board.count = n;
    board.instanceMatrix.needsUpdate = true;
    if (board.instanceColor) board.instanceColor.needsUpdate = true;

    // ---- Falling piece and its ghost ----
    const piece = g.piece;
    active.visible = !!piece;
    ghost.visible = !!piece && g.phase === "playing";
    if (piece) {
      const [px, py] = pivotOf(piece);
      const target = new THREE.Vector3(toWorldX(px), toWorldY(py), 0);
      if (snapPiece) {
        active.position.copy(target);
        snapPiece = false;
      } else {
        active.position.lerp(target, 1 - Math.exp(-dt * 40));
      }
      spin *= Math.exp(-dt * 22);
      activeSpin.rotation.z = spin;
      const tint = pieceColors[piece.type];
      activeMat.color.copy(tint);
      activeMat.emissive.copy(tint);
      ghostMat.color.copy(tint);
      ghostEdgeMat.color.copy(tint);
      const cells = cellsOf(piece);
      const drop = dropDistance(g);
      cells.forEach(([x, y], i) => {
        activeBlocks[i].position.set(toWorldX(x) - target.x, toWorldY(y) - target.y, 0);
        ghostBlocks[i].position.set(toWorldX(x), toWorldY(y - drop), 0);
      });
    }

    // ---- Side columns ----
    const wobble = reducedMotion ? 0 : Math.sin(time * 0.9) * 0.45;
    holdPreview.set(g.hold, !g.canHold);
    holdPreview.group.rotation.set(0.25, wobble, 0);
    nextPreviews.forEach((p, i) => {
      p.set(g.queue[i] ?? null);
      p.group.rotation.set(0.25, wobble + i * 0.4, 0);
    });
    texts.score.set(g.score.toLocaleString("en"));
    texts.level.set(String(g.level));
    texts.lines.set(String(g.lines));

    // ---- Particles ----
    liveBits = liveBits.filter((b) => (b.life -= dt) > 0);
    liveBits.forEach((b, i) => {
      b.v.y -= 22 * dt;
      b.p.addScaledVector(b.v, dt);
      b.r.x += b.spin.x * dt;
      b.r.y += b.spin.y * dt;
      b.r.z += b.spin.z * dt;
      scl.setScalar(Math.min(1, b.life / 0.5));
      bits.setMatrixAt(i, matrix.compose(b.p, quat.setFromEuler(b.r), scl));
      bits.setColorAt(i, b.color);
    });
    bits.count = liveBits.length;
    bits.instanceMatrix.needsUpdate = true;
    if (bits.instanceColor) bits.instanceColor.needsUpdate = true;

    for (const item of fx) {
      if (!item.mesh.visible) continue;
      item.age += dt;
      const k = item.age / item.life;
      if (k >= 1) {
        item.mesh.visible = false;
        continue;
      }
      const material = item.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = item.kind === "bar" ? Math.sin(Math.min(k * 1.4, 1) * Math.PI) * 0.9 : (1 - k) * 0.7;
    }

    pulse = Math.max(0, pulse - dt * 1.2);
    edgeMat.emissiveIntensity = 0.9 + pulse * 3;

    // ---- Camera: leans toward the piece, drifts a little, shakes on impact ----
    const pieceX = piece ? toWorldX(pivotOf(piece)[0]) : 0;
    const yawTarget = reducedMotion ? 0 : (pieceX / (COLS / 2)) * 0.07 + Math.sin(time * 0.25) * 0.025;
    const pitchTarget = reducedMotion ? 0 : 0.035 + Math.sin(time * 0.19) * 0.012;
    view.yaw += (yawTarget - view.yaw) * (1 - Math.exp(-dt * 2.5));
    view.pitch += (pitchTarget - view.pitch) * (1 - Math.exp(-dt * 2.5));
    shake = Math.max(0, shake - dt * 0.35);
    const jitter = () => (Math.random() - 0.5) * 2 * shake;
    camera.position.set(
      Math.sin(view.yaw) * view.dist + jitter(),
      view.cy + Math.sin(view.pitch) * view.dist + jitter(),
      Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist
    );
    camera.lookAt(0, view.cy, 0);

    renderer.render(scene, camera);
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
    room.dispose();
    board.dispose();
    bits.dispose();
    renderer.dispose();
  };

  return { render, resize, onEvents, cellPixels, dispose };
}
