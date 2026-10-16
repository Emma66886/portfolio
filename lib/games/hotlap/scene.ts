import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MAX_SPEED, type Pose, type Race, type RaceEvent } from "@/lib/games/hotlap/engine";
import { locate, pointAt, type Track } from "@/lib/games/hotlap/track";

const COLORS = {
  fog: "#2C1719",
  skyTop: "#0B0810",
  skyMid: "#241220",
  skyHorizon: "#40191E",
  sun: "#F09858",
  ground: "#1F2314",
  asphalt: "#383538",
  barrierA: "#A32639",
  barrierB: "#EBDCCB",
  player: "#C63B50",
  ghost: "#E3B06C",
  lamp: "#FFD9A0",
};

/** Low in the sky, behind the far end of the start straight. */
const SUN_DIR = new THREE.Vector3(-0.72, 0.2, -0.66).normalize();
const SKID_QUADS = 1600;
const SMOKE = 160;

/** Repeatable randomness, so the scenery is the same on every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, base: string, amount: number, rand: () => number) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < amount; i++) {
    const v = rand();
    ctx.fillStyle = v > 0.5 ? `rgba(255,240,225,${(v - 0.5) * 0.12})` : `rgba(0,0,0,${v * 0.25})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

/**
 * A strip following the track between two sideways offsets (flat), or a wall
 * standing at one offset (when `wallHeight` is set). Texture v runs along the
 * track, scaled so a whole number of repeats fits one lap and the seam hides.
 */
function trackStrip(
  t: Track,
  opts: { from: number; to?: number; y?: number; wallHeight?: number; repeat: number; range?: [number, number] }
) {
  const [start, end] = opts.range ?? [0, t.count];
  const closed = !opts.range;
  const vScale = Math.round(t.length / opts.repeat) / t.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const steps = end - start + (closed ? 1 : 0);
  for (let k = 0; k < steps; k++) {
    const i = (start + k) % t.count;
    const rx = -t.tz[i];
    const rz = t.tx[i];
    const v = (start + k) * t.spacing * vScale;
    if (opts.wallHeight) {
      const x = t.x[i] + rx * opts.from;
      const z = t.z[i] + rz * opts.from;
      positions.push(x, 0, z, x, opts.wallHeight, z);
      uvs.push(v, 0, v, 1);
      const side = Math.sign(opts.from);
      normals.push(-rx * side, 0, -rz * side, -rx * side, 0, -rz * side);
    } else {
      const y = opts.y ?? 0;
      positions.push(t.x[i] + rx * opts.from, y, t.z[i] + rz * opts.from, t.x[i] + rx * opts.to!, y, t.z[i] + rz * opts.to!);
      uvs.push(0, v, 1, v);
      normals.push(0, 1, 0, 0, 1, 0);
    }
    if (k > 0) {
      const a = (k - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

/** A small sports car facing +z, built from a side profile. */
function makeCar(paint: string, ghost: boolean) {
  const parts: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (parts.push(x), x);

  const ghostMat = ghost
    ? keep(
        new THREE.MeshStandardMaterial({
          color: paint,
          emissive: paint,
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.32,
          depthWrite: false,
        })
      )
    : null;
  const paintMat =
    ghostMat ?? keep(new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const glassMat = ghostMat ?? keep(new THREE.MeshStandardMaterial({ color: "#0D0A0B", metalness: 0.6, roughness: 0.2, envMapIntensity: 0.5 }));
  const trimMat = ghostMat ?? keep(new THREE.MeshStandardMaterial({ color: "#181314", roughness: 0.6 }));
  const tyreMat = ghostMat ?? keep(new THREE.MeshStandardMaterial({ color: "#2A2321", roughness: 0.85 }));
  const rimMat = ghostMat ?? keep(new THREE.MeshStandardMaterial({ color: "#B9AFA8", metalness: 0.9, roughness: 0.3 }));
  const headMat = ghostMat ?? keep(new THREE.MeshStandardMaterial({ color: "#FFF4E2", emissive: "#FFF1D6", emissiveIntensity: 2 }));
  const tailMat = ghostMat ?? keep(new THREE.MeshStandardMaterial({ color: "#5A0B12", emissive: "#FF2A3A", emissiveIntensity: 0.6 }));

  const extrudeProfile = (pts: [number, number][], width: number) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -width / 2);
    // Profile x runs along the car: turn it to +z.
    geo.rotateY(-Math.PI / 2);
    return keep(geo);
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Painted lower body up to the waistline, a narrower glass canopy on top,
  // and a painted roof panel over that.
  const shell = new THREE.Mesh(
    extrudeProfile(
      [
        [-2.2, 0.3],
        [2.12, 0.3],
        [2.28, 0.45],
        [2.22, 0.62],
        [1.0, 0.8],
        [-1.95, 0.86],
        [-2.26, 0.82],
      ],
      1.8
    ),
    paintMat
  );
  const canopy = new THREE.Mesh(
    extrudeProfile(
      [
        [1.02, 0.78],
        [0.25, 1.17],
        [-0.95, 1.19],
        [-1.9, 0.84],
      ],
      1.4
    ),
    glassMat
  );
  const roof = new THREE.Mesh(
    extrudeProfile(
      [
        [0.22, 1.2],
        [-0.92, 1.22],
        [-0.9, 1.25],
        [0.2, 1.23],
      ],
      1.26
    ),
    paintMat
  );
  const diffuser = new THREE.Mesh(keep(new THREE.BoxGeometry(1.5, 0.16, 0.12)), trimMat);
  diffuser.position.set(0, 0.36, -2.27);
  body.add(shell, canopy, roof, diffuser);

  const spoiler = new THREE.Mesh(keep(new THREE.BoxGeometry(1.75, 0.05, 0.36)), paintMat);
  spoiler.position.set(0, 1.12, -2.02);
  const strutGeo = keep(new THREE.BoxGeometry(0.05, 0.22, 0.1));
  for (const x of [-0.55, 0.55]) {
    const strut = new THREE.Mesh(strutGeo, glassMat);
    strut.position.set(x, 1.0, -2.0);
    body.add(strut);
  }
  body.add(spoiler);

  const lampGeo = keep(new THREE.BoxGeometry(0.42, 0.1, 0.06));
  for (const x of [-0.58, 0.58]) {
    const head = new THREE.Mesh(lampGeo, headMat);
    head.position.set(x, 0.6, 2.28);
    head.rotation.x = -0.2;
    body.add(head);
  }
  const tailGeo = keep(new THREE.BoxGeometry(0.52, 0.1, 0.05));
  for (const x of [-0.58, 0.58]) {
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(x, 0.72, -2.32);
    body.add(tail);
  }

  const tyreGeo = keep(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 20));
  tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = keep(new THREE.CylinderGeometry(0.23, 0.23, 0.32, 10));
  rimGeo.rotateZ(Math.PI / 2);
  const wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  for (const [x, z] of [
    [-0.94, 1.38],
    [0.94, 1.38],
    [-0.96, -1.34],
    [0.96, -1.34],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const spin = new THREE.Group();
    spin.add(new THREE.Mesh(tyreGeo, tyreMat), new THREE.Mesh(rimGeo, rimMat));
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin, front: z > 0 });
  }

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = !ghost;
  });

  return {
    root,
    body,
    wheels,
    tailMat,
    dispose: () => parts.forEach((p) => p.dispose()),
  };
}

export type HotLapScene = ReturnType<typeof createHotLapScene>;

/**
 * Draws a Race. Holds no race state of its own beyond animation: the chase
 * camera, wheel spin, body roll, skid marks and smoke.
 */
export function createHotLapScene(canvas: HTMLCanvasElement, track: Track, options: { reducedMotion: boolean }) {
  const { reducedMotion } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COLORS.fog, 220, 1350);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2600);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(item: T) => (disposables.push(item), item);
  const rand = seeded(1979);

  const pmrem = keep(new THREE.PMREMGenerator(renderer));
  const room = new RoomEnvironment();
  scene.environment = keep(pmrem.fromScene(room, 0.04).texture);
  scene.environmentIntensity = 0.45;
  room.dispose();

  // ---- Sky: dark overhead, burgundy at the horizon, the sun glowing low ----
  const sky = new THREE.Mesh(
    keep(new THREE.SphereGeometry(2200, 32, 16)),
    keep(
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(COLORS.skyTop) },
          uMid: { value: new THREE.Color(COLORS.skyMid) },
          uHorizon: { value: new THREE.Color(COLORS.skyHorizon) },
          uSun: { value: new THREE.Color(COLORS.sun) },
          uSunDir: { value: SUN_DIR },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uMid;
          uniform vec3 uHorizon;
          uniform vec3 uSun;
          uniform vec3 uSunDir;
          varying vec3 vDir;
          void main() {
            vec3 dir = normalize(vDir);
            float h = dir.y;
            vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.16, h));
            col = mix(col, uTop, smoothstep(0.12, 0.6, h));
            float sun = max(dot(dir, uSunDir), 0.0);
            // A warm band along the horizon, brightest toward the sun, and the sun itself.
            float band = exp(-max(h, 0.0) * 16.0);
            col += uSun * band * (0.08 + 0.7 * pow(sun, 4.0));
            col += uSun * pow(sun, 900.0) * 3.0;
            if (h < 0.0) col = uHorizon * 0.6;
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      })
    )
  );
  scene.add(sky);

  // ---- Light ----
  scene.add(new THREE.HemisphereLight("#B07A7E", "#2B1D1A", 1.1));
  const sun = new THREE.DirectionalLight("#FFB27A", 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 320 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // ---- Ground ----
  const groundTex = keep(canvasTexture(256, 256, (ctx) => speckle(ctx, COLORS.ground, 2200, rand)));
  groundTex.repeat.set(500, 500);
  const ground = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(5000, 5000)),
    keep(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }))
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Tarmac, kerbs and barriers ----
  const hw = track.halfWidth;
  const wallAt = hw + track.verge;
  const asphalt = keep(
    canvasTexture(256, 512, (ctx) => {
      speckle(ctx, COLORS.asphalt, 9000, rand);
      ctx.fillStyle = "rgba(246,236,231,0.9)";
      ctx.fillRect(4, 0, 6, 512);
      ctx.fillRect(246, 0, 6, 512);
      ctx.fillStyle = "rgba(246,236,231,0.55)";
      ctx.fillRect(126, 0, 4, 256);
    })
  );
  const road = new THREE.Mesh(
    keep(trackStrip(track, { from: -hw, to: hw, y: 0.02, repeat: 16 })),
    keep(new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.82 }))
  );
  road.receiveShadow = true;
  scene.add(road);

  const kerbTex = keep(
    canvasTexture(64, 128, (ctx) => {
      ctx.fillStyle = COLORS.barrierA;
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = COLORS.barrierB;
      ctx.fillRect(0, 64, 64, 64);
    })
  );
  const kerbMat = keep(new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6 }));
  // Kerbs line the corners only: runs of samples with real curvature.
  let run: number | null = null;
  for (let i = 0; i <= track.count; i++) {
    const curved = i < track.count && Math.abs(track.curvature[i]) > 1 / 110;
    if (curved && run === null) run = i;
    if (!curved && run !== null) {
      const range: [number, number] = [Math.max(0, run - 6), Math.min(track.count, i + 6)];
      for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(
          keep(trackStrip(track, { from: side * hw, to: side * (hw + 1.3), y: 0.035, repeat: 3, range })),
          kerbMat
        );
        strip.receiveShadow = true;
        scene.add(strip);
      }
      run = null;
    }
  }

  const barrierTex = keep(
    canvasTexture(128, 32, (ctx) => {
      ctx.fillStyle = COLORS.barrierB;
      ctx.fillRect(0, 0, 128, 32);
      ctx.fillStyle = COLORS.barrierA;
      ctx.fillRect(0, 0, 64, 32);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(0, 27, 128, 5);
    })
  );
  const barrierMat = keep(new THREE.MeshStandardMaterial({ map: barrierTex, roughness: 0.7, side: THREE.DoubleSide }));
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(keep(trackStrip(track, { from: side * wallAt, wallHeight: 0.9, repeat: 6 })), barrierMat);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
  }

  // ---- Start line and gantry ----
  const start = pointAt(track, 0);
  const checker = keep(
    canvasTexture(128, 32, (ctx) => {
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 4; y++) {
          ctx.fillStyle = (x + y) % 2 ? "#F6ECE7" : "#151010";
          ctx.fillRect(x * 8, y * 8, 8, 8);
        }
      }
    })
  );
  checker.wrapS = checker.wrapT = THREE.ClampToEdgeWrapping;
  // Flat on the ground, then turned so its width runs across the track.
  const lineGeo = keep(new THREE.PlaneGeometry(hw * 2, 2.4));
  lineGeo.rotateX(-Math.PI / 2);
  const line = new THREE.Mesh(lineGeo, keep(new THREE.MeshStandardMaterial({ map: checker, roughness: 0.7 })));
  line.rotation.y = start.heading;
  line.position.set(start.x, 0.04, start.z);
  scene.add(line);

  const gantry = new THREE.Group();
  gantry.position.set(start.x, 0, start.z);
  gantry.rotation.y = start.heading;
  const steel = keep(new THREE.MeshStandardMaterial({ color: "#2E2422", metalness: 0.7, roughness: 0.4 }));
  const postGeo = keep(new THREE.BoxGeometry(0.5, 7.4, 0.5));
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, steel);
    post.position.set(side * (hw + 1.6), 3.7, 0);
    post.castShadow = true;
    gantry.add(post);
  }
  const beam = new THREE.Mesh(keep(new THREE.BoxGeometry(hw * 2 + 3.7, 1.1, 0.6)), steel);
  beam.position.y = 6.9;
  beam.castShadow = true;
  gantry.add(beam);
  const startLights = [-2.2, 0, 2.2].map((x) => {
    const mat = keep(new THREE.MeshStandardMaterial({ color: "#1A1212", emissive: "#000000", emissiveIntensity: 1.3 }));
    const lamp = new THREE.Mesh(keep(new THREE.CircleGeometry(0.42, 20)), mat);
    // Faces drivers coming up to the line.
    lamp.position.set(x, 6.9, -0.31);
    lamp.rotation.y = Math.PI;
    gantry.add(lamp);
    return mat;
  });
  scene.add(gantry);

  // ---- Grandstand along the start straight ----
  const crowdTex = keep(
    canvasTexture(256, 64, (ctx) => {
      ctx.fillStyle = "#2A1E1C";
      ctx.fillRect(0, 0, 256, 64);
      const palette = ["#C63B50", "#D9A56B", "#F6ECE7", "#7FA37A", "#5F7CB0", "#9B4A7A"];
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = palette[Math.floor(rand() * palette.length)];
        ctx.globalAlpha = 0.35 + rand() * 0.5;
        ctx.fillRect(rand() * 256, rand() * 64, 2, 2);
      }
      ctx.globalAlpha = 1;
    })
  );
  crowdTex.repeat.set(4, 1);
  const stand = new THREE.Group();
  const standMid = pointAt(track, -60, -(wallAt + 9));
  stand.position.set(standMid.x, 0, standMid.z);
  stand.rotation.y = standMid.heading;
  const tierMat = keep(new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 }));
  // Local +x points away from the track on this side, so the tiers climb outward.
  for (let k = 0; k < 5; k++) {
    const tier = new THREE.Mesh(keep(new THREE.BoxGeometry(6, 1.2 + k * 1.2, 70)), tierMat);
    tier.position.set(k * 2.2, (1.2 + k * 1.2) / 2, 0);
    tier.castShadow = tier.receiveShadow = true;
    stand.add(tier);
  }
  const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(14, 0.4, 74)), steel);
  roof.position.set(4.4, 9.2, 0);
  roof.rotation.z = 0.08;
  roof.castShadow = true;
  stand.add(roof);
  scene.add(stand);

  // ---- Lamps every so often outside the barriers ----
  const glowTex = keep(
    canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    })
  );
  const poleGeo = keep(new THREE.CylinderGeometry(0.12, 0.16, 9, 6));
  const headGeo = keep(new THREE.BoxGeometry(0.9, 0.25, 0.5));
  const headMat = keep(new THREE.MeshStandardMaterial({ color: "#FFE8C8", emissive: COLORS.lamp, emissiveIntensity: 2.5 }));
  const glowMat = keep(
    new THREE.SpriteMaterial({ map: glowTex, color: COLORS.lamp, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  for (let s = 20, k = 0; s < track.length - 20; s += 68, k++) {
    const side = k % 2 ? 1 : -1;
    const p = pointAt(track, s, side * (wallAt + 2));
    const pole = new THREE.Mesh(poleGeo, steel);
    pole.position.set(p.x, 4.5, p.z);
    pole.castShadow = true;
    const head = new THREE.Mesh(headGeo, headMat);
    const toward = pointAt(track, s, side * (wallAt + 0.6));
    head.position.set(toward.x, 9, toward.z);
    head.rotation.y = p.heading;
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(toward.x, 8.8, toward.z);
    glow.scale.setScalar(6);
    scene.add(pole, head, glow);
  }

  // ---- Trees scattered outside the circuit ----
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.count; i++) {
    minX = Math.min(minX, track.x[i]);
    maxX = Math.max(maxX, track.x[i]);
    minZ = Math.min(minZ, track.z[i]);
    maxZ = Math.max(maxZ, track.z[i]);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const TREES = 420;
  const crownGeo = keep(new THREE.ConeGeometry(2, 6.5, 7));
  crownGeo.translate(0, 5.2, 0);
  const trunkGeo = keep(new THREE.CylinderGeometry(0.25, 0.32, 2.2, 5));
  trunkGeo.translate(0, 1.1, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, keep(new THREE.MeshStandardMaterial({ roughness: 0.95 })), TREES);
  const trunks = new THREE.InstancedMesh(trunkGeo, keep(new THREE.MeshStandardMaterial({ color: "#3A2A20", roughness: 1 })), TREES);
  const treeColors = ["#3D3A24", "#33361F", "#4B3E27", "#2F3A27"].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let placed = 0;
  for (let tries = 0; placed < TREES && tries < TREES * 8; tries++) {
    const x = cx + (rand() - 0.5) * (maxX - minX + 500);
    const z = cz + (rand() - 0.5) * (maxZ - minZ + 500);
    const loc = locate(track, x, z, 0, track.count >> 1);
    if (Math.abs(loc.d) < wallAt + 7) continue;
    // Keep the grandstand clear.
    if (Math.hypot(x - standMid.x, z - standMid.z) < 50) continue;
    const size = 0.7 + rand() * 0.8;
    m.compose(v.set(x, 0, z), q.setFromAxisAngle(sc.set(0, 1, 0), rand() * 6), sc.set(size, size * (0.8 + rand() * 0.5), size));
    crowns.setMatrixAt(placed, m);
    trunks.setMatrixAt(placed, m);
    crowns.setColorAt(placed, treeColors[Math.floor(rand() * treeColors.length)]);
    placed++;
  }
  crowns.count = trunks.count = placed;
  crowns.castShadow = trunks.castShadow = true;
  scene.add(crowns, trunks);

  // ---- A lit skyline on the horizon ----
  const windowTex = keep(
    canvasTexture(64, 128, (ctx) => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 7) {
        for (let x = 3; x < 64; x += 6) {
          if (rand() < 0.38) {
            ctx.fillStyle = rand() < 0.8 ? "#FFC98A" : "#F6ECE7";
            ctx.fillRect(x, y, 3, 3);
          }
        }
      }
    })
  );
  const BUILDINGS = 110;
  const city = new THREE.InstancedMesh(
    keep(new THREE.BoxGeometry(1, 1, 1)),
    keep(new THREE.MeshStandardMaterial({ color: "#1B1314", emissive: "#FFFFFF", emissiveMap: windowTex, emissiveIntensity: 0.9, roughness: 1 })),
    BUILDINGS
  );
  for (let i = 0; i < BUILDINGS; i++) {
    const angle = (i / BUILDINGS) * Math.PI * 2 + rand() * 0.04;
    const r = 950 + rand() * 250;
    const h = 25 + rand() * rand() * 140;
    const w = 18 + rand() * 40;
    m.compose(v.set(cx + Math.cos(angle) * r, h / 2, cz + Math.sin(angle) * r), q.setFromAxisAngle(sc.set(0, 1, 0), -angle), sc.set(w, h, w * 0.8));
    city.setMatrixAt(i, m);
  }
  scene.add(city);

  // ---- Cars ----
  const player = makeCar(COLORS.player, false);
  const ghostCar = makeCar(COLORS.ghost, true);
  disposables.push(player, ghostCar);
  scene.add(player.root, ghostCar.root);
  const beamLight = new THREE.SpotLight("#FFE6C4", 60, 70, 0.45, 0.6, 1.4);
  beamLight.position.set(0, 0.9, 2.1);
  beamLight.target.position.set(0, 0, 18);
  player.root.add(beamLight, beamLight.target);

  // ---- Skid marks: a ring buffer of quads behind the rear wheels ----
  const skidPos = new Float32Array(SKID_QUADS * 4 * 3);
  const skidIndex: number[] = [];
  for (let i = 0; i < SKID_QUADS; i++) {
    const a = i * 4;
    skidIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const skidGeo = keep(new THREE.BufferGeometry());
  skidGeo.setAttribute("position", new THREE.BufferAttribute(skidPos, 3).setUsage(THREE.DynamicDrawUsage));
  skidGeo.setIndex(skidIndex);
  const skids = new THREE.Mesh(
    skidGeo,
    keep(new THREE.MeshBasicMaterial({ color: "#0A0707", transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))
  );
  skids.frustumCulled = false;
  scene.add(skids);
  let skidNext = 0;
  const lastMark: (THREE.Vector3 | null)[] = [null, null];

  // ---- Smoke and dust ----
  const smokePos = new Float32Array(SMOKE * 3);
  const smokeLife = new Float32Array(SMOKE);
  const smokeSize = new Float32Array(SMOKE);
  const smokeTint = new Float32Array(SMOKE);
  const smokeGeo = keep(new THREE.BufferGeometry());
  smokeGeo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute("aLife", new THREE.BufferAttribute(smokeLife, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute("aSize", new THREE.BufferAttribute(smokeSize, 1).setUsage(THREE.DynamicDrawUsage));
  smokeGeo.setAttribute("aTint", new THREE.BufferAttribute(smokeTint, 1));
  const smokeUniforms = { uScale: { value: 400 } };
  const smoke = new THREE.Points(
    smokeGeo,
    keep(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: smokeUniforms,
        vertexShader: /* glsl */ `
          attribute float aLife;
          attribute float aSize;
          attribute float aTint;
          uniform float uScale;
          varying float vLife;
          varying float vTint;
          void main() {
            vLife = aLife;
            vTint = aTint;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = uScale * aSize / -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vLife;
          varying float vTint;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d) * clamp(vLife, 0.0, 1.0) * 0.32;
            vec3 col = mix(vec3(0.78, 0.74, 0.72), vec3(0.42, 0.31, 0.22), vTint);
            gl_FragColor = vec4(col, a);
          }`,
      })
    )
  );
  smoke.frustumCulled = false;
  scene.add(smoke);
  let smokeNext = 0;

  // ---- Camera rig ----
  const cam = { pos: new THREE.Vector3(), yaw: 0, ready: false, shake: 0, baseFov: 60 };
  const look = new THREE.Vector3();

  const resize = (w: number, h: number) => {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Tall screens get a taller field of view, so the road ahead still fits.
    cam.baseFov = camera.aspect < 1 ? 74 : 58;
    camera.updateProjectionMatrix();
    smokeUniforms.uScale.value = (height * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.baseFov / 2)));
  };

  const onEvents = (events: RaceEvent[]) => {
    for (const e of events) {
      if (e.type === "hit" && !reducedMotion) cam.shake = Math.min(0.6, cam.shake + e.impact * 0.04);
    }
  };

  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const wheelWorld = (index: number, out: THREE.Vector3) =>
    out.copy(player.wheels[index].pivot.position).setY(0.04).applyMatrix4(player.root.matrixWorld);

  const render = (race: Race, ghost: Pose | null, dt: number) => {
    const car = race.car;
    const speed = Math.abs(car.speed);

    // Car body: roll into slides, squat under power, dive under braking.
    player.root.position.set(car.x, 0, car.z);
    player.root.rotation.y = car.heading;
    const roll = THREE.MathUtils.clamp(-car.slip * 0.012 + car.steer * speed * 0.0016, -0.07, 0.07);
    const pitch = car.braking ? 0.025 : car.throttle > 0 ? -0.012 : 0;
    player.body.rotation.z += (roll - player.body.rotation.z) * (1 - Math.exp(-dt * 8));
    player.body.rotation.x += (pitch - player.body.rotation.x) * (1 - Math.exp(-dt * 8));
    for (const w of player.wheels) {
      w.spin.rotation.x += (car.speed / 0.36) * dt;
      if (w.front) w.pivot.rotation.y = -car.steer * 0.42;
    }
    player.tailMat.emissiveIntensity = car.braking ? 3.2 : 0.6;
    player.root.updateMatrixWorld();

    ghostCar.root.visible = !!ghost;
    if (ghost) {
      ghostCar.root.position.set(ghost.x, 0, ghost.z);
      ghostCar.root.rotation.y = ghost.heading;
    }

    // Skid marks from the rear wheels while sliding or locking up.
    const marking = race.phase !== "countdown" && !car.offTrack && speed > 4 && (Math.abs(car.slip) > 3.2 || (car.braking && speed > 25));
    for (const k of [0, 1]) {
      const p = wheelWorld(k + 2, new THREE.Vector3());
      const prev = lastMark[k];
      if (marking && prev && prev.distanceToSquared(p) > 0.09) {
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * 0.14;
        const nz = (dx / len) * 0.14;
        skidPos.set([prev.x - nx, 0.045, prev.z - nz, prev.x + nx, 0.045, prev.z + nz, p.x - nx, 0.045, p.z - nz, p.x + nx, 0.045, p.z + nz], skidNext * 12);
        skidNext = (skidNext + 1) % SKID_QUADS;
        skidGeo.attributes.position.needsUpdate = true;
        lastMark[k] = p;
      } else if (!marking || !prev) {
        lastMark[k] = marking ? p : null;
      }
    }

    // Smoke from sliding tyres, dust from the grass.
    const smoking = !reducedMotion && speed > 6 && (Math.abs(car.slip) > 5 || car.offTrack);
    if (smoking && Math.random() < dt * 40) {
      const p = wheelWorld(Math.random() < 0.5 ? 2 : 3, new THREE.Vector3());
      smokePos.set([p.x, 0.4, p.z], smokeNext * 3);
      smokeLife[smokeNext] = 1;
      smokeSize[smokeNext] = 1.2;
      smokeTint[smokeNext] = car.offTrack ? 1 : 0;
      smokeGeo.attributes.aTint.needsUpdate = true;
      smokeNext = (smokeNext + 1) % SMOKE;
    }
    for (let i = 0; i < SMOKE; i++) {
      if (smokeLife[i] <= 0) continue;
      smokeLife[i] -= dt * 0.8;
      smokeSize[i] += dt * 2.2;
      smokePos[i * 3 + 1] += dt * 0.6;
    }
    smokeGeo.attributes.position.needsUpdate = true;
    smokeGeo.attributes.aLife.needsUpdate = true;
    smokeGeo.attributes.aSize.needsUpdate = true;

    // Start lights: red one by one through the countdown, green at the start.
    const lit = race.phase === "countdown" ? Math.min(3, Math.max(0, 4 - Math.ceil(race.countdown))) : 0;
    const green = race.phase !== "countdown" && race.time < 1.4 && race.lap === 0;
    startLights.forEach((mat, i) => mat.emissive.set(green ? "#1FD15F" : i < lit ? "#FF1426" : "#000000"));

    // Chase camera: swings round with the car, looks a little ahead, and
    // widens its view with speed.
    const moving = Math.hypot(car.vx, car.vz) > 3;
    const travel = moving ? Math.atan2(car.vx, car.vz) : car.heading;
    const wantYaw = car.heading + wrap(travel - car.heading) * 0.4;
    if (!cam.ready) cam.yaw = wantYaw;
    cam.yaw += wrap(wantYaw - cam.yaw) * (1 - Math.exp(-dt * (reducedMotion ? 12 : 5)));
    const back = 7.4 + speed * 0.028;
    const height = 2.5 + speed * 0.008;
    const want = new THREE.Vector3(car.x - Math.sin(cam.yaw) * back, height, car.z - Math.cos(cam.yaw) * back);
    if (!cam.ready) {
      cam.pos.copy(want);
      cam.ready = true;
    }
    cam.pos.lerp(want, 1 - Math.exp(-dt * 10));
    cam.shake = Math.max(0, cam.shake - dt * 1.5);
    const rumble = car.offTrack && !reducedMotion ? Math.min(speed, 30) * 0.004 : 0;
    const jitter = () => (Math.random() - 0.5) * 2 * (cam.shake + rumble);
    camera.position.set(cam.pos.x + jitter(), cam.pos.y + jitter(), cam.pos.z + jitter());
    look.set(car.x + Math.sin(cam.yaw) * 6, 1.1, car.z + Math.cos(cam.yaw) * 6);
    camera.lookAt(look);
    const fov = cam.baseFov + (reducedMotion ? 0 : (speed / MAX_SPEED) * 12);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Keep the sky round the camera and the sun's shadow box round the car.
    sky.position.copy(camera.position);
    sun.target.position.set(car.x, 0, car.z);
    sun.position.set(car.x + SUN_DIR.x * 150, SUN_DIR.y * 150, car.z + SUN_DIR.z * 150);

    renderer.render(scene, camera);
  };

  /** Snap the camera behind the car, for a new race. */
  const reset = () => {
    cam.ready = false;
    lastMark[0] = lastMark[1] = null;
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
    crowns.dispose();
    trunks.dispose();
    city.dispose();
    renderer.dispose();
  };

  return { render, resize, onEvents, reset, dispose };
}
