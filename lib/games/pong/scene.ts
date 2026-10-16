import * as THREE from "three";
import {
  BALL_RADIUS,
  CPU_Z,
  PADDLE_RADIUS,
  PADDLE_Y,
  PLAYER_Z,
  TABLE,
  type Match,
  type PongEvent,
} from "@/lib/games/pong/engine";

/** Site palette (app/globals.css), so the game sits inside the portfolio. */
const COLORS = {
  bg: "#140E0D",
  floor: "#1A1211",
  table: "#5E1B27",
  tableSide: "#2B1D1A",
  line: "#F6ECE7",
  player: "#C63B50",
  cpu: "#E8B46F",
  ball: "#FFF6EC",
  wood: "#B8875A",
  metal: "#3A2926",
  glow: "#D9A56B",
};

const TRAIL = 14;

const trailVertex = /* glsl */ `
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uScale * ${(BALL_RADIUS * 2.2).toFixed(4)} * (0.35 + 0.65 * aAlpha) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const trailFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)) * vAlpha * 0.55;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Playing surface: regulation white edges and the centre line for doubles. */
function tableTexture() {
  return canvasTexture(512, 920, (ctx) => {
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = COLORS.table;
    ctx.fillRect(0, 0, w, h);
    // A soft sheen toward the middle so the surface does not read as flat.
    const sheen = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.65);
    sheen.addColorStop(0, "rgba(255,220,200,0.07)");
    sheen.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 9;
    ctx.strokeRect(4.5, 4.5, w - 9, h - 9);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
  });
}

function netTexture() {
  return canvasTexture(1024, 64, (ctx) => {
    const { width: w, height: h } = ctx.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(20,12,11,0.85)";
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= w; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 10; y <= h; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(0, 0, w, 9);
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function makePaddle(rubber: string, seeThrough: boolean) {
  const rubberMat = new THREE.MeshStandardMaterial({
    color: rubber,
    // A touch of self-light keeps the far paddle from reading as bare wood.
    emissive: rubber,
    emissiveIntensity: 0.18,
    roughness: 0.7,
    transparent: seeThrough,
    opacity: seeThrough ? 0.62 : 1,
    depthWrite: !seeThrough,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: COLORS.wood,
    roughness: 0.6,
    transparent: seeThrough,
    opacity: seeThrough ? 0.75 : 1,
  });
  // Caps face along z once rotated, so the rubber faces the table.
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(PADDLE_RADIUS, PADDLE_RADIUS, 0.016, 48), [
    woodMat,
    rubberMat,
    rubberMat,
  ]);
  blade.rotation.x = Math.PI / 2;
  blade.castShadow = true;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.11, 0.026), woodMat);
  handle.position.y = -PADDLE_RADIUS - 0.045;
  handle.castShadow = true;

  const group = new THREE.Group();
  group.add(blade, handle);
  return group;
}

type Effect = { mesh: THREE.Mesh; age: number; life: number; size: number };

export type PongScene = ReturnType<typeof createPongScene>;

/**
 * Draws a Match. Holds no game state of its own beyond animation: paddle
 * swing, hit rings, the ball trail and camera shake.
 */
export function createPongScene(canvas: HTMLCanvasElement, options: { reducedMotion: boolean }) {
  const { reducedMotion } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 5, 12);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 30);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  // ---- Lights ----
  scene.add(new THREE.HemisphereLight("#F6ECE7", "#2B1D1A", 1.1));
  const key = new THREE.DirectionalLight("#FFF1E6", 2.4);
  key.position.set(0.8, 4, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -2.2;
  key.shadow.camera.right = 2.2;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -2.4;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 9;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 3;
  scene.add(key);
  // Burgundy backlight behind the CPU end, picking out the far edge.
  const rim = new THREE.PointLight("#C63B50", 6, 7, 1.6);
  rim.position.set(0, 1.4, CPU_Z - 1.4);
  scene.add(rim);

  // ---- Floor ----
  const floorY = -TABLE.height;
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(30, 30)),
    track(new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.95 }))
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(24, 48, COLORS.glow, COLORS.glow);
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.07;
  gridMat.depthWrite = false;
  grid.position.y = floorY + 0.002;
  track(grid.geometry);
  track(gridMat);
  scene.add(grid);

  const glowTex = track(glowTexture());
  const pool = new THREE.Mesh(
    track(new THREE.PlaneGeometry(7, 7)),
    track(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: "#A32639",
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = floorY + 0.004;
  scene.add(pool);

  // ---- Table ----
  const tableTex = track(tableTexture());
  const sideMat = track(new THREE.MeshStandardMaterial({ color: COLORS.tableSide, roughness: 0.8 }));
  const topMat = track(new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.55, metalness: 0.02 }));
  const top = new THREE.Mesh(
    track(new THREE.BoxGeometry(TABLE.halfWidth * 2, 0.03, TABLE.halfLength * 2)),
    // Box faces: +x, -x, +y, -y, +z, -z.
    [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]
  );
  top.position.y = -0.015;
  top.receiveShadow = true;
  top.castShadow = true;
  scene.add(top);

  const metalMat = track(new THREE.MeshStandardMaterial({ color: COLORS.metal, roughness: 0.5, metalness: 0.6 }));
  const legGeo = track(new THREE.BoxGeometry(0.05, TABLE.height - 0.03, 0.05));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, metalMat);
      leg.position.set(sx * (TABLE.halfWidth - 0.12), -TABLE.height / 2 - 0.015, sz * (TABLE.halfLength - 0.25));
      leg.castShadow = true;
      scene.add(leg);
    }
  }
  const frame = new THREE.Mesh(
    track(new THREE.BoxGeometry(TABLE.halfWidth * 2 - 0.3, 0.05, 0.05)),
    metalMat
  );
  frame.position.y = -0.09;
  scene.add(frame);

  // ---- Net ----
  const netWidth = TABLE.halfWidth * 2 + 0.3;
  const net = new THREE.Mesh(
    track(new THREE.PlaneGeometry(netWidth, TABLE.netHeight)),
    track(
      new THREE.MeshStandardMaterial({
        map: track(netTexture()),
        transparent: true,
        alphaTest: 0.2,
        side: THREE.DoubleSide,
        roughness: 0.9,
      })
    )
  );
  net.position.y = TABLE.netHeight / 2;
  net.castShadow = true;
  scene.add(net);
  const postGeo = track(new THREE.BoxGeometry(0.025, TABLE.netHeight + 0.03, 0.04));
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, metalMat);
    post.position.set(sx * (netWidth / 2), (TABLE.netHeight + 0.03) / 2 - 0.02, 0);
    post.castShadow = true;
    scene.add(post);
  }

  // ---- Paddles ----
  // The player's paddle sits between the camera and the ball at the moment
  // of contact, so it is drawn see-through.
  const playerPaddle = makePaddle(COLORS.player, true);
  const cpuPaddle = makePaddle(COLORS.cpu, false);
  for (const paddle of [playerPaddle, cpuPaddle]) {
    paddle.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        track(obj.geometry);
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => track(m));
      }
    });
    scene.add(paddle);
  }
  playerPaddle.position.set(0, PADDLE_Y, PLAYER_Z);
  cpuPaddle.position.set(0, PADDLE_Y, CPU_Z);

  // ---- Ball ----
  const ball = new THREE.Mesh(
    track(new THREE.SphereGeometry(BALL_RADIUS, 32, 20)),
    track(
      new THREE.MeshStandardMaterial({
        color: COLORS.ball,
        emissive: COLORS.glow,
        emissiveIntensity: 0.35,
        roughness: 0.35,
      })
    )
  );
  ball.castShadow = true;
  scene.add(ball);
  const halo = new THREE.Sprite(
    track(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: COLORS.glow,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
  );
  halo.scale.setScalar(BALL_RADIUS * 7);
  scene.add(halo);

  const trailPositions = new Float32Array(TRAIL * 3);
  const trailAlpha = new Float32Array(TRAIL);
  const trailGeo = track(new THREE.BufferGeometry());
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute("aAlpha", new THREE.BufferAttribute(trailAlpha, 1));
  const trailUniforms = { uScale: { value: 1 }, uColor: { value: new THREE.Color(COLORS.glow) } };
  const trail = new THREE.Points(
    trailGeo,
    track(
      new THREE.ShaderMaterial({
        vertexShader: trailVertex,
        fragmentShader: trailFragment,
        uniforms: trailUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
  );
  trail.frustumCulled = false;
  scene.add(trail);
  let trailLive = false;

  // ---- Effects: rings on paddle contact and on each bounce ----
  const ringGeo = track(new THREE.RingGeometry(0.8, 1, 48));
  const effects: Effect[] = [];
  const makeRing = (color: string) => {
    const mesh = new THREE.Mesh(
      ringGeo,
      track(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        })
      )
    );
    mesh.visible = false;
    scene.add(mesh);
    const effect = { mesh, age: 0, life: 1, size: 0.1 };
    effects.push(effect);
    return effect;
  };
  for (let i = 0; i < 8; i++) makeRing(COLORS.glow);
  let nextEffect = 0;
  const spawnRing = (x: number, y: number, z: number, flat: boolean, size: number, life: number) => {
    const effect = effects[nextEffect];
    nextEffect = (nextEffect + 1) % effects.length;
    effect.mesh.position.set(x, y, z);
    effect.mesh.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0);
    effect.age = 0;
    effect.life = life;
    effect.size = size;
    effect.mesh.visible = true;
  };

  // ---- Camera framing ----
  // Fits the full paddle range across the width at the player's end, then
  // pitches to centre the table vertically. Narrow screens get a wider lens,
  // a steeper angle and a camera that follows the paddle further.
  const view = { height: 1, back: 1, pitch: 0.4, follow: 0.12, halfView: 1.1 };
  const resize = (w: number, h: number) => {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const t = THREE.MathUtils.clamp((aspect - 0.6) / 1.1, 0, 1);
    camera.aspect = aspect;
    camera.fov = THREE.MathUtils.lerp(56, 44, t);
    camera.updateProjectionMatrix();

    view.halfView = THREE.MathUtils.lerp(0.8, 1.15, t);
    view.follow = THREE.MathUtils.lerp(0.45, 0.12, t);
    const dip = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(54, 35, t));
    const reach = view.halfView / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
    view.back = reach * Math.cos(dip);
    view.height = PADDLE_Y + reach * Math.sin(dip);
    const far = Math.atan2(view.height - PADDLE_Y, PLAYER_Z + view.back - CPU_Z);
    // Slightly below the midpoint, which leaves the HUD room at the top.
    view.pitch = far + (dip - far) * 0.47;

    trailUniforms.uScale.value = (height * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  };

  /** Pointer position across the canvas (0 to 1) to the paddle x that sits under it. */
  const pointerToX = (u: number) => ((u - 0.5) * 2 * view.halfView) / (1 - view.follow);

  let shake = 0;
  let playerPunch = 0;
  let cpuPunch = 0;
  let camX = 0;

  const onEvents = (events: PongEvent[]) => {
    for (const e of events) {
      if (e.type === "hit") {
        spawnRing(e.x, e.y, e.z - Math.sign(e.z) * 0.03, false, 0.32, 0.35);
        if (e.side === "player") playerPunch = 1;
        else cpuPunch = 1;
        if (!reducedMotion) shake = Math.max(shake, 0.004 + e.power * 0.01);
      } else if (e.type === "serve") {
        if (e.side === "player") playerPunch = 0.6;
        else cpuPunch = 0.6;
      } else if (e.type === "bounce") {
        spawnRing(e.x, 0.003, e.z, true, 0.12, 0.4);
      } else if (e.type === "point" && !reducedMotion) {
        shake = Math.max(shake, 0.012);
      }
    }
  };

  const render = (m: Match, dt: number) => {
    // Paddles: lean with their motion, and punch forward on contact.
    playerPunch = Math.max(0, playerPunch - dt * 6);
    cpuPunch = Math.max(0, cpuPunch - dt * 6);
    const lean = (vx: number) => THREE.MathUtils.clamp(-vx * 0.07, -0.45, 0.45);
    playerPaddle.position.set(m.player.x, PADDLE_Y, PLAYER_Z - Math.sin(playerPunch * Math.PI) * 0.07);
    playerPaddle.rotation.set(-0.12 - playerPunch * 0.25, 0, lean(m.player.vx));
    cpuPaddle.position.set(m.cpu.x, PADDLE_Y, CPU_Z + Math.sin(cpuPunch * Math.PI) * 0.07);
    cpuPaddle.rotation.set(0.12 + cpuPunch * 0.25, 0, lean(-m.cpu.vx));

    ball.position.set(m.ball.x, m.ball.y, m.ball.z);
    halo.position.copy(ball.position);
    const flying = m.phase === "rally" || m.phase === "point";
    halo.material.opacity = flying ? 0.55 : 0.35 + Math.sin(m.time * 4) * 0.1;

    // Trail: newest sample first, fading along its length.
    if (!flying || reducedMotion) {
      trailLive = false;
      trail.visible = false;
    } else {
      if (!trailLive) {
        for (let i = 0; i < TRAIL; i++) trailPositions.set([m.ball.x, m.ball.y, m.ball.z], i * 3);
        trailLive = true;
      }
      trailPositions.copyWithin(3, 0, (TRAIL - 1) * 3);
      trailPositions.set([m.ball.x, m.ball.y, m.ball.z], 0);
      for (let i = 0; i < TRAIL; i++) trailAlpha[i] = 1 - i / TRAIL;
      trailGeo.attributes.position.needsUpdate = true;
      trailGeo.attributes.aAlpha.needsUpdate = true;
      trail.visible = true;
    }

    for (const effect of effects) {
      if (!effect.mesh.visible) continue;
      effect.age += dt;
      const k = effect.age / effect.life;
      if (k >= 1) {
        effect.mesh.visible = false;
        continue;
      }
      effect.mesh.scale.setScalar(effect.size * (0.25 + 0.75 * Math.sqrt(k)));
      (effect.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85;
    }

    // Camera: drifts with the player's paddle, plus a short shake on impact.
    camX += (m.player.x * view.follow - camX) * (1 - Math.exp(-dt * (reducedMotion ? 30 : 6)));
    shake = Math.max(0, shake - dt * 0.05);
    const jitter = () => (Math.random() - 0.5) * 2 * shake;
    camera.position.set(camX + jitter(), view.height + jitter(), PLAYER_Z + view.back);
    camera.rotation.set(-view.pitch, 0, 0);

    renderer.render(scene, camera);
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
  };

  return { render, resize, onEvents, pointerToX, dispose };
}
