import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { DECK, PACE, SHAPES, SPECIALS, type Card, type Shape, type Suit, type WhotEvent, type WhotView } from "@/lib/games/whot/engine";

/** Cream cards with maroon shapes, the way Whot cards have always looked, on a dark green baize. */
const COLORS = {
  bg: "#140E0D",
  floor: "#1A1211",
  felt: "#1C3A31",
  feltEdge: "#0F2620",
  wood: "#5B3423",
  woodLight: "#7A4A30",
  card: "#FBF4E8",
  ink: "#8E1F2E",
  inkDark: "#5E1420",
  back: "#7E1B2A",
  backDeep: "#5A111D",
  gold: "#D9A56B",
  edge: "#E8DDCB",
};

export const CARD_W = 0.62;
export const CARD_H = 0.9;
const THICK = 0.008;
const STACK = 0.0055;
/** The atlas holds every face, 10 across and 6 down. */
const ATLAS = { cols: 10, rows: 6, cell: [256, 372] as const };

const MARKET = new THREE.Vector3(-0.62, 0, -0.05);
const PILE = new THREE.Vector3(0.62, 0, -0.05);
/** Where opponents' hands lie: an ellipse inside the rim. */
const SEAT_RX = 2.25;
const SEAT_RZ = 1.62;

// ---- Card art ----

function shapePath(ctx: CanvasRenderingContext2D, shape: Shape, cx: number, cy: number, r: number) {
  ctx.beginPath();
  if (shape === "circle") ctx.arc(cx, cy, r, 0, Math.PI * 2);
  else if (shape === "square") ctx.rect(cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72);
  else if (shape === "triangle") {
    const y = cy + r * 0.14;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      const px = cx + Math.cos(a) * r * 1.12;
      const py = y + Math.sin(a) * r * 1.12;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  } else if (shape === "cross") {
    const t = r * 0.36;
    ctx.moveTo(cx - t, cy - r);
    ctx.lineTo(cx + t, cy - r);
    ctx.lineTo(cx + t, cy - t);
    ctx.lineTo(cx + r, cy - t);
    ctx.lineTo(cx + r, cy + t);
    ctx.lineTo(cx + t, cy + t);
    ctx.lineTo(cx + t, cy + r);
    ctx.lineTo(cx - t, cy + r);
    ctx.lineTo(cx - t, cy + t);
    ctx.lineTo(cx - r, cy + t);
    ctx.lineTo(cx - r, cy - t);
    ctx.lineTo(cx - t, cy - t);
    ctx.closePath();
  } else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.46 : r * 1.08;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr + r * 0.06;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const fonts = () => {
  const css = getComputedStyle(document.documentElement);
  return {
    serif: css.getPropertyValue("--serif").trim() || "Georgia, serif",
    sans: css.getPropertyValue("--sans").trim() || getComputedStyle(document.body).fontFamily || "sans-serif",
  };
};

const LABELS: Record<number, string> = { 1: "HOLD ON", 2: "PICK TWO", 5: "PICK THREE", 8: "SUSPENSION", 14: "GENERAL MARKET" };

function drawFace(ctx: CanvasRenderingContext2D, card: Card, x0: number, y0: number) {
  const [w, h] = ATLAS.cell;
  const { serif, sans } = fonts();
  ctx.save();
  ctx.translate(x0, y0);
  const paper = ctx.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, "#FFF9F0");
  paper.addColorStop(1, "#F1E6D4");
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(142,31,46,.55)";
  ctx.lineWidth = 3;
  roundRect(ctx, 12, 12, w - 24, h - 24, 16);
  ctx.stroke();

  const whot = card.suit === "whot";
  const corner = (flip: boolean) => {
    ctx.save();
    if (flip) {
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
    }
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${card.n >= 10 ? 50 : 56}px ${serif}`;
    ctx.fillText(String(card.n), 46, 74);
    if (whot) {
      ctx.font = `800 20px ${sans}`;
      ctx.fillText("W", 46, 102);
    } else {
      shapePath(ctx, card.suit as Shape, 46, 98, 14);
      ctx.fill();
    }
    ctx.restore();
  };
  corner(false);
  corner(true);

  const cx = w / 2;
  const cy = h / 2;
  if (whot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.12);
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 70px ${serif}`;
    ctx.fillText("Whot", 0, -8);
    ctx.font = `800 17px ${sans}`;
    ctx.fillStyle = "#A8782F";
    ctx.fillText("CALL ANY SHAPE", 0, 44);
    ctx.restore();
  } else {
    const r = 62;
    const glow = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.1, cx, cy, r * 1.2);
    glow.addColorStop(0, "#B8384B");
    glow.addColorStop(1, COLORS.inkDark);
    shapePath(ctx, card.suit as Shape, cx, cy - 6, r);
    ctx.fillStyle = glow;
    ctx.fill();
  }

  const label = LABELS[card.n];
  if (label && !whot) {
    ctx.font = `800 15px ${sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(label).width + 22;
    ctx.fillStyle = "#E8C38E";
    roundRect(ctx, cx - width / 2, h - 108, width, 28, 14);
    ctx.fill();
    ctx.fillStyle = COLORS.inkDark;
    ctx.fillText(label, cx, h - 93);
  }
  ctx.restore();
}

function drawBack(ctx: CanvasRenderingContext2D) {
  const [w, h] = ATLAS.cell;
  const { serif } = fonts();
  ctx.fillStyle = COLORS.back;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(217,165,107,.18)";
  ctx.lineWidth = 2;
  for (let d = -h; d < w + h; d += 22) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + h, h);
    ctx.moveTo(d, h);
    ctx.lineTo(d + h, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = "#F1E2C8";
  ctx.lineWidth = 10;
  roundRect(ctx, 14, 14, w - 28, h - 28, 18);
  ctx.stroke();
  ctx.fillStyle = COLORS.backDeep;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, 82, 50, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#F6E7CC";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 46px ${serif}`;
  ctx.fillText("Whot", w / 2, h / 2 + 2);
}

function feltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(512, 480, 60, 512, 512, 520);
  g.addColorStop(0, "#255043");
  g.addColorStop(0.7, COLORS.felt);
  g.addColorStop(1, COLORS.feltEdge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  // Baize grain.
  const img = ctx.getImageData(0, 0, 1024, 1024);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = "rgba(217,165,107,.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(512, 512, 430, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([4, 10]);
  ctx.beginPath();
  ctx.arc(512, 512, 412, 0, Math.PI * 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** The called shape as a gold badge, for the marker that floats over the pile. */
function callTexture(shape: Shape) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = COLORS.gold;
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFF6EA";
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.ink;
  shapePath(ctx, shape, 128, 128, 58);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---- Geometry ----

function cardShape() {
  const r = 0.05;
  const [w, h] = [CARD_W / 2, CARD_H / 2];
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

/** A card with thickness: face, back and edge as three material groups. */
function cardGeometry() {
  const shape = cardShape();
  const face = new THREE.ShapeGeometry(shape, 5);
  const uv = face.attributes.uv as THREE.BufferAttribute;
  const pos = face.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  face.translate(0, 0, THICK / 2);
  const back = face.clone();
  back.rotateY(Math.PI);

  const pts = shape.getPoints(5);
  const verts: number[] = [];
  const norms: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const nx = b.y - a.y;
    const ny = a.x - b.x;
    const len = Math.hypot(nx, ny) || 1;
    const quad = [
      [a.x, a.y, -THICK / 2],
      [b.x, b.y, -THICK / 2],
      [b.x, b.y, THICK / 2],
      [a.x, a.y, -THICK / 2],
      [b.x, b.y, THICK / 2],
      [a.x, a.y, THICK / 2],
    ];
    for (const v of quad) {
      verts.push(...v);
      norms.push(nx / len, ny / len, 0);
    }
  }
  const edge = new THREE.BufferGeometry();
  edge.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  edge.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  edge.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((verts.length / 3) * 2).fill(0), 2));
  const merged = mergeGeometries([face.toNonIndexed(), back.toNonIndexed(), edge], true)!;
  face.dispose();
  back.dispose();
  edge.dispose();
  return merged;
}

// ---- The scene ----

type Where = { kind: "market" } | { kind: "pile" } | { kind: "hand"; seat: number };

type Obj = {
  mesh: THREE.Mesh;
  face: THREE.MeshStandardMaterial;
  /** The card this mesh is showing, or null when it's face down and nobody here knows it. */
  card: number | null;
  where: Where;
  tween: { from: THREE.Vector3; fromQ: THREE.Quaternion; fromS: number; start: number; dur: number; arc: number } | null;
  /** Smoothed hover and highlight, for the hand at the bottom. */
  lift: number;
  glow: number;
  dim: number;
};

export type Hit = { kind: "card"; card: number } | { kind: "market" } | null;

export type WhotScene = ReturnType<typeof createWhotScene>;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const suitOrder: Record<Suit, number> = { circle: 0, triangle: 1, cross: 2, square: 3, star: 4, whot: 5 };

export function createWhotScene(canvas: HTMLCanvasElement, options: { reducedMotion: boolean }) {
  const { reducedMotion } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 9, 20);
  const pmrem = keep(new THREE.PMREMGenerator(renderer));
  const room = new RoomEnvironment();
  scene.environment = keep(pmrem.fromScene(room, 0.04).texture);
  scene.environmentIntensity = 0.35;
  room.dispose();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 40);

  // ---- Lights ----
  scene.add(new THREE.HemisphereLight("#FFF1E0", "#24130F", 0.55));
  const lamp = new THREE.SpotLight("#FFE9CF", 60, 16, 0.75, 0.55, 1.6);
  lamp.position.set(0.6, 6.2, 1.4);
  lamp.target.position.set(0, 0, -0.1);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1536, 1536);
  lamp.shadow.bias = -0.0002;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.radius = 4;
  scene.add(lamp, lamp.target);
  const rim = new THREE.PointLight("#C63B50", 8, 9, 1.6);
  rim.position.set(0, 1.6, -3.6);
  scene.add(rim);

  // ---- Table ----
  const floor = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(40, 40)),
    keep(new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95 }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.1;
  floor.receiveShadow = true;
  scene.add(floor);

  const woodMat = keep(new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.45, metalness: 0.05 }));
  const top = new THREE.Mesh(keep(new THREE.CylinderGeometry(3.32, 3.22, 0.22, 96)), woodMat);
  top.position.y = -0.11;
  top.receiveShadow = true;
  scene.add(top);
  const bumper = new THREE.Mesh(
    keep(new THREE.TorusGeometry(3.2, 0.09, 16, 120)),
    keep(new THREE.MeshStandardMaterial({ color: COLORS.woodLight, roughness: 0.35, metalness: 0.08 }))
  );
  bumper.rotation.x = Math.PI / 2;
  bumper.position.y = 0.01;
  bumper.castShadow = true;
  scene.add(bumper);
  const pedestal = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.5, 0.9, 1, 32)), woodMat);
  pedestal.position.y = -0.7;
  scene.add(pedestal);
  const felt = new THREE.Mesh(
    keep(new THREE.CircleGeometry(3.12, 96)),
    keep(new THREE.MeshStandardMaterial({ map: keep(feltTexture()), roughness: 0.92 }))
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.002;
  felt.receiveShadow = true;
  scene.add(felt);

  // ---- Markers: whose turn, what to do, what shape was called ----
  const glowTex = keep(glowTexture());
  const marker = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(1.6, 1.6)),
    keep(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: COLORS.gold,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.006;
  scene.add(marker);
  const marketGlow = marker.clone();
  marketGlow.material = keep((marker.material as THREE.MeshBasicMaterial).clone());
  marketGlow.scale.setScalar(0.85);
  marketGlow.position.set(MARKET.x, 0.007, MARKET.z);
  scene.add(marketGlow);

  const callTextures = Object.fromEntries(SHAPES.map((sh) => [sh, keep(callTexture(sh))])) as Record<Shape, THREE.CanvasTexture>;
  const callSprite = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: callTextures.circle, transparent: true, depthWrite: false })));
  callSprite.scale.setScalar(0.42);
  callSprite.visible = false;
  scene.add(callSprite);

  // ---- Cards ----
  const [cw, ch] = ATLAS.cell;
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = cw * ATLAS.cols;
  atlasCanvas.height = ch * ATLAS.rows;
  const atlas = keep(new THREE.CanvasTexture(atlasCanvas));
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const backCanvas = document.createElement("canvas");
  [backCanvas.width, backCanvas.height] = ATLAS.cell;
  const backTex = keep(new THREE.CanvasTexture(backCanvas));
  backTex.colorSpace = THREE.SRGBColorSpace;
  backTex.anisotropy = atlas.anisotropy;
  // Each card's face is a copy of the atlas offset to its own cell. The copies
  // share one image on the GPU, but each has to be told when it changes.
  const faceMaps: THREE.Texture[] = [];
  const paint = () => {
    const ctx = atlasCanvas.getContext("2d")!;
    DECK.forEach((card) => drawFace(ctx, card, (card.id % ATLAS.cols) * cw, Math.floor(card.id / ATLAS.cols) * ch));
    drawBack(backCanvas.getContext("2d")!);
    atlas.needsUpdate = true;
    faceMaps.forEach((m) => (m.needsUpdate = true));
    backTex.needsUpdate = true;
  };
  paint();
  // Redraw with the site's fonts once they've loaded.
  document.fonts?.ready.then(() => !disposed && paint());

  const geometry = keep(cardGeometry());
  const backMat = keep(new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.5 }));
  const edgeMat = keep(new THREE.MeshStandardMaterial({ color: COLORS.edge, roughness: 0.7 }));
  const objs: Obj[] = DECK.map(() => {
    const map = keep(atlas.clone());
    map.repeat.set(1 / ATLAS.cols, 1 / ATLAS.rows);
    faceMaps.push(map);
    const face = keep(new THREE.MeshStandardMaterial({ map, roughness: 0.48, emissive: COLORS.gold, emissiveIntensity: 0 }));
    const mesh = new THREE.Mesh(geometry, [face, backMat, edgeMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { mesh, face, card: null, where: { kind: "market" }, tween: null, lift: 0, glow: 0, dim: 0 };
  });
  const showFace = (o: Obj, card: number | null) => {
    o.card = card;
    if (card === null) return;
    o.face.map!.offset.set((card % ATLAS.cols) / ATLAS.cols, 1 - (Math.floor(card / ATLAS.cols) + 1) / ATLAS.rows);
  };

  // ---- Where everything is ----
  let players = 2;
  /** The seat at the bottom, whose hand is held up to the camera. */
  let bottom = 0;
  /** The seat whose cards are face up for this screen, or -1. */
  let you = 0;
  let market: Obj[] = [];
  let pile: Obj[] = [];
  let hands: Obj[][] = [[], []];

  const seatAngle = (seat: number) => {
    const rel = (seat - bottom + players) % players;
    if (players === 2) return rel * Math.PI;
    if (players === 3) return (rel * Math.PI * 2) / 3;
    return (rel * Math.PI) / 2;
  };
  const seatPoint = (seat: number, scale = 1) => {
    const a = seatAngle(seat);
    return new THREE.Vector3(-Math.sin(a) * SEAT_RX * scale, 0, Math.cos(a) * SEAT_RZ * scale);
  };

  /** Your hand in display order: grouped by shape, low to high. */
  const ordered = (list: Obj[]) =>
    you === bottom && you >= 0
      ? [...list].sort((a, b) => {
          const ca = DECK[a.card ?? 0];
          const cb = DECK[b.card ?? 0];
          return suitOrder[ca.suit] - suitOrder[cb.suit] || ca.n - cb.n;
        })
      : list;

  // ---- Camera framing and the held hand ----
  const view = { width: 1, height: 1, handDist: 2.4, handScale: 1, handY: 0, handMaxW: 2 };
  const target = new THREE.Vector3();
  const resize = (w: number, h: number) => {
    view.width = Math.max(1, w);
    view.height = Math.max(1, h);
    renderer.setSize(view.width, view.height, false);
    const aspect = view.width / view.height;
    camera.aspect = aspect;
    const tall = THREE.MathUtils.clamp((1.5 - aspect) / 0.85, 0, 1);
    camera.fov = THREE.MathUtils.lerp(38, 50, tall);
    camera.updateProjectionMatrix();
    // Fit the seats across, and the far seat plus room for your hand top to bottom.
    const halfW = (players > 2 ? SEAT_RX + 0.75 : 1.85) * THREE.MathUtils.lerp(1, 0.94, tall);
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const dip = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(52, 60, tall));
    const fitW = halfW / Math.tan(hHalf);
    const fitH = (SEAT_RZ + 1.3) / Math.tan(vHalf) / 1.15;
    const dist = Math.max(fitW, fitH) + 0.4;
    target.set(0, 0, THREE.MathUtils.lerp(0.55, 0.8, tall));
    camera.position.set(0, target.y + Math.sin(dip) * dist, target.z + Math.cos(dip) * dist);
    camera.lookAt(target);
    camera.updateMatrixWorld();

    const visH = 2 * view.handDist * Math.tan(vHalf);
    view.handScale = (visH * THREE.MathUtils.lerp(0.25, 0.2, tall)) / CARD_H;
    view.handY = -visH / 2 + CARD_H * view.handScale * THREE.MathUtils.lerp(0.64, 0.7, tall);
    view.handMaxW = visH * aspect * 0.9;
  };

  // Scratch objects for layout.
  const qa = new THREE.Quaternion();
  const ex = new THREE.Euler();
  const vx = new THREE.Vector3();
  const flatUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const flatDown = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  const yaw = (a: number) => qa.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a);

  let hovered: number | null = null;
  let focused: number | null = null;

  /** The resting place of a card, written into `pos`, `quat` and returned scale. */
  function place(o: Obj, pos: THREE.Vector3, quat: THREE.Quaternion) {
    const w = o.where;
    if (w.kind === "market") {
      const i = market.indexOf(o);
      pos.set(MARKET.x + (hash(i) - 0.5) * 0.012, 0.004 + i * STACK, MARKET.z + (hash(i + 9) - 0.5) * 0.012);
      // Turned so the word on the back reads the right way up from your seat.
      quat.copy(yaw(Math.PI + 0.06)).multiply(flatDown);
      return 1;
    }
    if (w.kind === "pile") {
      const i = pile.indexOf(o);
      const id = o.card ?? i;
      pos.set(PILE.x + (hash(id * 3 + i) - 0.5) * 0.14, 0.004 + i * STACK, PILE.z + (hash(id * 7 + i) - 0.5) * 0.12);
      quat.copy(yaw((hash(id * 11 + i * 5) - 0.5) * 0.7)).multiply(flatUp);
      return 1;
    }
    const hand = hands[w.seat];
    if (w.seat === bottom) {
      const list = ordered(hand);
      const i = list.indexOf(o);
      const n = list.length;
      const s = view.handScale;
      const spacing = Math.min(CARD_W * s * 0.68, n > 1 ? (view.handMaxW - CARD_W * s) / (n - 1) : 0);
      const k = i - (n - 1) / 2;
      const spread = THREE.MathUtils.clamp(0.05 - n * 0.002, 0.012, 0.05);
      const lifted = o.lift * CARD_H * s * 0.22;
      // In front of the camera, fanned on a shallow curve, each card a hair nearer than the last.
      vx.set(k * spacing, view.handY - k * k * spread * spacing * 0.2 + lifted, -view.handDist + i * 0.004 + o.lift * 0.02);
      ex.set(0, you === w.seat ? 0 : Math.PI, -k * spread);
      quat.setFromEuler(ex).premultiply(camera.quaternion);
      pos.copy(vx).applyMatrix4(camera.matrixWorld);
      return s * (1 + o.lift * 0.06);
    }
    // Another player's hand: face down on the felt, fanned, tops toward the middle.
    const i = hand.indexOf(o);
    const n = hand.length;
    const a = seatAngle(w.seat);
    const turn = Math.PI - a;
    const spacing = Math.min(0.17, 1.9 / Math.max(1, n));
    const k = i - (n - 1) / 2;
    const c = seatPoint(w.seat);
    const tx = Math.cos(turn);
    const tz = -Math.sin(turn);
    pos.set(c.x + tx * k * spacing, 0.006 + i * 0.0012, c.z + tz * k * spacing);
    quat.copy(yaw(turn + k * 0.05)).multiply(flatDown);
    return 0.82;
  }

  const restPos = new THREE.Vector3();
  const restQ = new THREE.Quaternion();
  let clock = 0;

  /** Sends a card to wherever it now belongs, after `delay` ms. */
  function fly(o: Obj, delay: number, dur: number, arc: number) {
    o.tween = {
      from: o.mesh.position.clone(),
      fromQ: o.mesh.quaternion.clone(),
      fromS: o.mesh.scale.x,
      start: clock + delay,
      dur: reducedMotion ? Math.min(dur, 160) : dur,
      arc: reducedMotion ? 0 : arc,
    };
  }

  /** Every card that is out of place glides back in, as when a hand closes up after a card leaves. */
  function settle(delay: number, dur = 260) {
    for (const o of objs) {
      if (o.tween) continue;
      const s = place(o, restPos, restQ);
      if (o.mesh.position.distanceToSquared(restPos) > 1e-6 || Math.abs(o.mesh.scale.x - s) > 1e-3 || o.mesh.quaternion.angleTo(restQ) > 1e-3) fly(o, delay, dur, 0);
    }
  }

  function snapAll() {
    for (const o of objs) {
      o.tween = null;
      const s = place(o, o.mesh.position, o.mesh.quaternion);
      o.mesh.scale.setScalar(s);
    }
  }

  const move = (o: Obj, where: Where) => {
    const from = o.where;
    if (from.kind === "market") market.splice(market.indexOf(o), 1);
    else if (from.kind === "pile") pile.splice(pile.indexOf(o), 1);
    else hands[from.seat].splice(hands[from.seat].indexOf(o), 1);
    o.where = where;
    if (where.kind === "market") market.push(o);
    else if (where.kind === "pile") pile.push(o);
    else hands[where.seat].push(o);
  };

  /** Matches the meshes to a view from scratch, keeping each card where it already is when it can. */
  function sync(v: WhotView, animate: boolean) {
    players = v.counts.length;
    you = v.you;
    if (v.you >= 0) bottom = v.you;
    bottom = Math.min(bottom, players - 1);
    const free = new Set(objs);
    const claim = (...tests: ((o: Obj) => boolean)[]) => {
      for (const test of tests) for (const o of free) if (test(o)) return free.delete(o), o;
      return null;
    };
    const any = () => true;
    const nextPile = v.pile.map((id) => {
      const o = claim((o) => o.card === id && o.where.kind === "pile", (o) => o.card === id, any)!;
      showFace(o, id);
      return o;
    });
    const nextHands = v.counts.map((count, seat) => {
      if (seat === you) {
        return v.hand.map((id) => {
          const o = claim((o) => o.card === id && o.where.kind !== "market", (o) => o.where.kind === "hand" && o.where.seat === seat, any)!;
          showFace(o, id);
          return o;
        });
      }
      const list: Obj[] = [];
      for (let i = 0; i < count; i++) list.push(claim((o) => o.where.kind === "hand" && o.where.seat === seat && o.card === null, (o) => o.where.kind === "hand" && o.where.seat === seat, (o) => o.where.kind === "market", any)!);
      return list;
    });
    const nextMarket = [...free].sort((a, b) => market.indexOf(a) - market.indexOf(b));
    market = nextMarket;
    pile = nextPile;
    hands = nextHands;
    market.forEach((o) => ((o.where = { kind: "market" }), (o.card = null)));
    pile.forEach((o) => (o.where = { kind: "pile" }));
    hands.forEach((list, seat) =>
      list.forEach((o) => {
        o.where = { kind: "hand", seat };
        if (seat !== you) o.card = null;
      })
    );
    resize(view.width, view.height);
    if (animate) settle(0, 380);
    else snapAll();
  }

  /** Plays out a step of the game. Timings follow PACE in the engine, so the table waits the right time. */
  function apply(events: WhotEvent[], v: WhotView) {
    let t = 0;
    for (const e of events) {
      if (e.type === "deal") {
        sync({ ...v, pile: [], hand: [], counts: v.counts.map(() => 0), market: 54 }, false);
        // Shuffle the stack visually: everything starts face down in the market.
        objs.forEach((o) => (o.card = null));
        const most = Math.max(...e.counts);
        for (let round = 0; round < most; round++) {
          for (let k = 0; k < players; k++) {
            const seat = (e.first + k) % players;
            if (round >= e.counts[seat]) continue;
            const o = market[market.length - 1];
            move(o, { kind: "hand", seat });
            if (seat === you && e.hands[seat]) showFace(o, e.hands[seat]![round]);
            fly(o, t, 380, 0.35);
            t += PACE.dealCard;
          }
        }
        const topCard = market[market.length - 1];
        move(topCard, { kind: "pile" });
        showFace(topCard, e.top);
        fly(topCard, t, 420, 0.4);
        t += PACE.dealSettle;
      } else if (e.type === "play") {
        const hand = hands[e.seat];
        const o = (e.seat === you ? hand.find((h) => h.card === e.card) : hand[e.from]) ?? hand[hand.length - 1];
        if (!o) continue;
        move(o, { kind: "pile" });
        showFace(o, e.card);
        fly(o, t, PACE.play - 40, 0.5);
        settle(t + 60);
        t += PACE.play;
      } else if (e.type === "draw") {
        for (const card of e.cards) {
          const o = market[market.length - 1];
          if (!o) break;
          move(o, { kind: "hand", seat: e.seat });
          o.card = null;
          if (card !== null && e.seat === you) showFace(o, card);
          fly(o, t, 420, 0.3);
          t += PACE.drawCard;
        }
        settle(t);
        t += 120;
      } else if (e.type === "refill") {
        const under = pile.slice(0, -1);
        under.forEach((o, i) => {
          move(o, { kind: "market" });
          o.card = null;
          fly(o, t + i * 8, 420, 0.25);
        });
        // The market is new cards under the old ones.
        market = [...under, ...market.filter((o) => !under.includes(o))];
        t += PACE.refill;
      } else if (e.type === "hold" || e.type === "suspend" || e.type === "general" || e.type === "pick") {
        t += PACE.flash;
      }
    }
    // If anything has drifted from the truth (a missed update, say), the view wins.
    const mine = you >= 0 ? new Set(hands[you].map((o) => o.card)) : new Set();
    const off =
      market.length !== v.market ||
      pile.length !== v.pile.length ||
      pile[pile.length - 1]?.card !== v.pile[v.pile.length - 1] ||
      hands.some((h, i) => h.length !== v.counts[i]) ||
      (you >= 0 && (mine.size !== v.hand.length || v.hand.some((id) => !mine.has(id))));
    if (off) sync(v, true);
  }

  // ---- Input and highlights ----
  let playable = new Set<number>();
  let canDraw = false;
  let urgeDraw = false;
  let turnSeat = -1;
  let call: Shape | null = null;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitTest = (u: number, v: number): Hit => {
    ndc.set(u * 2 - 1, -(v * 2 - 1));
    raycaster.setFromCamera(ndc, camera);
    if (you >= 0) {
      const mine = hands[you].filter((o) => !o.tween);
      const hit = raycaster.intersectObjects(mine.map((o) => o.mesh), false)[0];
      if (hit) {
        const o = mine.find((m) => m.mesh === hit.object);
        if (o?.card != null) return { kind: "card", card: o.card };
      }
    }
    const topMarket = market[market.length - 1];
    if (topMarket && raycaster.intersectObject(topMarket.mesh, false).length) return { kind: "market" };
    // A generous target around the market stack, since it's small on a phone.
    const ground = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground) && ground.distanceTo(MARKET) < 0.5) {
      return { kind: "market" };
    }
    return null;
  };

  // ---- Frame ----
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  function render(dtSeconds: number) {
    // Tweens run on real time, so a slow frame rate can't leave them behind the
    // game. Only the smoothing below uses the clamped step.
    clock += dtSeconds * 1000;
    const dt = Math.min(dtSeconds, 0.1);
    const pulse = reducedMotion ? 0.6 : 0.5 + Math.sin(clock / 260) * 0.5;
    for (const o of objs) {
      if (o.where.kind === "hand" && o.where.seat === bottom && you === bottom) {
        const on = o.card !== null && playable.has(o.card);
        const goalLift = (o.card === focused ? 1 : o.card === hovered ? 0.75 : on ? 0.32 : 0) * (playable.size || o.card === focused ? 1 : 0.5);
        o.lift += (goalLift - o.lift) * (1 - Math.exp(-dt * 16));
        o.glow += ((on ? 1 : 0) - o.glow) * (1 - Math.exp(-dt * 10));
        o.dim += ((playable.size && !on ? 1 : 0) - o.dim) * (1 - Math.exp(-dt * 10));
      } else {
        o.lift = o.glow = o.dim = 0;
      }
      o.face.emissiveIntensity = o.glow * (0.1 + pulse * 0.12);
      o.face.color.setScalar(1 - o.dim * 0.42);

      const s = place(o, restPos, restQ);
      const tw = o.tween;
      if (tw && clock < tw.start) {
        // Still waiting its turn to move.
      } else if (tw) {
        const k = Math.min(1, (clock - tw.start) / tw.dur);
        const e = ease(k);
        tmpP.lerpVectors(tw.from, restPos, e);
        tmpP.y += Math.sin(k * Math.PI) * tw.arc;
        o.mesh.position.copy(tmpP);
        tmpQ.slerpQuaternions(tw.fromQ, restQ, e);
        o.mesh.quaternion.copy(tmpQ);
        o.mesh.scale.setScalar(THREE.MathUtils.lerp(tw.fromS, s, e));
        if (k >= 1) o.tween = null;
      } else {
        o.mesh.position.copy(restPos);
        o.mesh.quaternion.copy(restQ);
        o.mesh.scale.setScalar(s);
      }
      // A hand held up to the camera would throw a shadow from nowhere.
      o.mesh.castShadow = !(o.where.kind === "hand" && o.where.seat === bottom && !o.tween);
    }

    // Turn marker: a pool of light in front of whoever's turn it is.
    const mm = marker.material as THREE.MeshBasicMaterial;
    if (turnSeat >= 0 && turnSeat < players) {
      const p = turnSeat === bottom ? new THREE.Vector3(0, 0, SEAT_RZ + 0.55) : seatPoint(turnSeat, 0.98);
      marker.position.x += (p.x - marker.position.x) * (1 - Math.exp(-dt * 8));
      marker.position.z += (p.z - marker.position.z) * (1 - Math.exp(-dt * 8));
      mm.opacity += (0.45 + pulse * 0.2 - mm.opacity) * (1 - Math.exp(-dt * 6));
    } else mm.opacity *= Math.exp(-dt * 6);
    const gm = marketGlow.material as THREE.MeshBasicMaterial;
    gm.opacity += ((canDraw ? (urgeDraw ? 0.5 + pulse * 0.4 : 0.22) : 0) - gm.opacity) * (1 - Math.exp(-dt * 8));

    if (call) {
      const topPile = pile[pile.length - 1];
      const y = 0.62 + (reducedMotion ? 0 : Math.sin(clock / 420) * 0.05);
      callSprite.position.set(topPile ? topPile.mesh.position.x : PILE.x, y, (topPile ? topPile.mesh.position.z : PILE.z) - 0.05);
      callSprite.visible = !topPile?.tween;
    } else callSprite.visible = false;

    renderer.render(scene, camera);
  }

  let disposed = false;

  return {
    resize: (w: number, h: number) => {
      resize(w, h);
      snapAll();
    },
    apply,
    /** A fresh picture: a new game, a rejoin, or someone else taking the device. */
    reset: (v: WhotView) => sync(v, true),
    /** What the player can do right now. Empty when it isn't their move. */
    setInput(next: { playable: number[]; canDraw: boolean; urgeDraw: boolean }) {
      playable = new Set(next.playable);
      canDraw = next.canDraw;
      urgeDraw = next.urgeDraw;
      if (focused !== null && !hands[you]?.some((o) => o.card === focused)) focused = null;
    },
    setTable(next: { turn: number; call: Shape | null }) {
      turnSeat = next.turn;
      if (next.call !== call && next.call) callSprite.material.map = callTextures[next.call];
      call = next.call;
    },
    hitTest,
    setHover(card: number | null) {
      hovered = card;
    },
    setFocus(card: number | null) {
      focused = card;
    },
    /** Your cards left to right, as the keyboard steps through them. */
    handOrder: () => (you >= 0 ? ordered(hands[you]).map((o) => o.card!) : []),
    /** Where the name tags and the market's label go, as fractions of the stage. Your own seat has no tag. */
    anchors() {
      const toStage = (p: THREE.Vector3) => {
        p.project(camera);
        return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
      };
      return {
        // On the table side of each hand, clear of the toolbar and the screen edges.
        seats: Array.from({ length: players }, (_, seat) => (seat === bottom ? null : toStage(seatPoint(seat, 0.66)))),
        market: toStage(MARKET.clone().add(new THREE.Vector3(0, 0, CARD_H * 0.62))),
      };
    },
    get busy() {
      return objs.some((o) => o.tween);
    },
    render,
    dispose() {
      disposed = true;
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
