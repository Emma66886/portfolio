/**
 * GLSL for the background scene (components/Scene3D.tsx).
 */

// 3D simplex noise, Ian McEwan / Ashima Arts (MIT).
const simplexNoise = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/**
 * Shared by the particles and the links between them, so a link's endpoints
 * always land exactly on the particles they join. Works in screen space: the
 * pointer pushes particles aside and a click sends out a ring-shaped shockwave.
 */
const fieldChunk = /* glsl */ `
uniform float uTime;
uniform float uAspect;
uniform float uTanHalfFov;
uniform vec2 uPointer;        // NDC
uniform float uPointerActive; // 0..1, eased
uniform vec2 uClick;          // NDC
uniform float uClickAge;      // seconds since the last click

attribute float aSeed;

varying float vGlow;
varying float vDepth;

vec4 fieldPosition(vec3 p, float seed) {
  p += vec3(
    sin(uTime * 0.23 + seed * 6.283),
    cos(uTime * 0.19 + seed * 12.1),
    sin(uTime * 0.17 + seed * 3.7)
  ) * 0.35;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  vGlow = 0.0;
  if (vDepth <= 0.0) return mv;

  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  // NDC-y units per view-space unit at this depth.
  float toView = vDepth * uTanHalfFov;

  vec2 d = ndc - uPointer;
  d.x *= uAspect;
  float dist = length(d);
  vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0);
  float push = smoothstep(0.32, 0.0, dist) * uPointerActive;
  mv.xy += dir * push * 0.11 * toView;
  vGlow = max(push, smoothstep(0.55, 0.0, dist) * uPointerActive * 0.55);

  vec2 c = ndc - uClick;
  c.x *= uAspect;
  float cd = length(c);
  float ring = exp(-pow((cd - uClickAge * 1.1) * 8.0, 2.0)) * clamp(1.0 - uClickAge / 1.8, 0.0, 1.0);
  mv.xy += (cd > 1e-4 ? c / cd : vec2(0.0)) * ring * 0.09 * toView;
  vGlow = max(vGlow, ring);

  return mv;
}

float depthFade(float depth) {
  return smoothstep(40.0, 14.0, depth) * smoothstep(0.6, 3.0, depth);
}
`;

export const pointsVertex = /* glsl */ `
${fieldChunk}
uniform float uSize;
uniform float uPixelRatio;
attribute vec3 aColor;
varying vec3 vColor;

void main() {
  vec4 mv = fieldPosition(position, aSeed);
  gl_Position = projectionMatrix * mv;
  float size = uSize * (0.55 + aSeed * 0.9) * (1.0 + vGlow * 1.4);
  gl_PointSize = clamp(size * uPixelRatio * (10.0 / max(vDepth, 0.1)), 0.0, 36.0 * uPixelRatio);
  vColor = aColor;
}
`;

export const pointsFragment = /* glsl */ `
varying vec3 vColor;
varying float vGlow;
varying float vDepth;

float depthFade(float depth) {
  return smoothstep(40.0, 14.0, depth) * smoothstep(0.6, 3.0, depth);
}

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  vec3 color = mix(vColor, vec3(1.0, 0.92, 0.82), vGlow * 0.55);
  gl_FragColor = vec4(color, a * (0.5 + vGlow * 0.7) * depthFade(vDepth));
}
`;

export const linksVertex = /* glsl */ `
${fieldChunk}
void main() {
  gl_Position = projectionMatrix * fieldPosition(position, aSeed);
}
`;

export const linksFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHotColor;
varying float vGlow;
varying float vDepth;

float depthFade(float depth) {
  return smoothstep(40.0, 14.0, depth) * smoothstep(0.6, 3.0, depth);
}

void main() {
  vec3 color = mix(uColor, uHotColor, vGlow);
  gl_FragColor = vec4(color, (0.08 + vGlow * 0.55) * depthFade(vDepth));
}
`;

/**
 * The hero orb: a sphere pushed around by two octaves of noise, plus a bulge
 * that swells toward the pointer as it approaches. Normals are rebuilt from
 * the displaced surface so the lighting follows the ripples.
 */
export const orbVertex = /* glsl */ `
${simplexNoise}
uniform float uTime;
uniform float uAmp;
uniform float uHover;
uniform vec3 uPointerDir; // object space

varying vec3 vNormal;
varying vec3 vViewPos;
varying float vNoise;

float displacement(vec3 p) {
  float n = snoise(p * 1.5 + uTime * 0.32) * 0.65 + snoise(p * 3.1 - uTime * 0.22) * 0.25;
  float bulge = pow(max(dot(p, uPointerDir), 0.0), 2.5) * uHover * 0.38;
  return n * uAmp + bulge;
}

void main() {
  vec3 n = normalize(position);
  vec3 pos = n * (1.0 + displacement(n));

  vec3 t = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  vec3 n1 = normalize(n + t * 0.01);
  vec3 n2 = normalize(n + b * 0.01);
  vec3 q1 = n1 * (1.0 + displacement(n1));
  vec3 q2 = n2 * (1.0 + displacement(n2));
  vec3 displacedNormal = normalize(cross(q1 - pos, q2 - pos));

  vNoise = displacement(n);
  vNormal = normalize(normalMatrix * displacedNormal);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const orbFragment = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uBody;
uniform vec3 uRim;
uniform float uHover;

varying vec3 vNormal;
varying vec3 vViewPos;
varying float vNoise;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(vec3(-0.5, 0.8, 0.7));
  vec3 H = normalize(L + V);

  float diffuse = max(dot(N, L), 0.0) * 0.5 + 0.28;
  float spec = pow(max(dot(N, H), 0.0), 46.0);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.4);

  vec3 base = mix(uDeep, uBody, smoothstep(-0.18, 0.22, vNoise));
  vec3 color = base * diffuse
    + uRim * fresnel * (0.5 + uHover * 0.55)
    + vec3(1.0, 0.86, 0.72) * spec * 0.35;
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Soft radial glow on a quad: the orb's halo and the cursor light. */
export const glowVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const glowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);
  gl_FragColor = vec4(uColor, a * uOpacity);
}
`;

/**
 * Gallery panels (lib/gallery.ts). Each panel is bent around the ring, then
 * lit like a hologram: scanlines, a sweep of light, colour separation that
 * grows while the ring is spinning, and a glowing edge on the panel in front.
 */
export const panelVertex = /* glsl */ `
uniform float uCurve;
varying vec2 vUv;
varying vec3 vViewPos;

void main() {
  vUv = uv;
  vec3 pos = position;
  // Parabolic approximation of the ring's curvature across the panel.
  pos.z -= pos.x * pos.x * uCurve;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const panelFragment = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uActive;
uniform float uVelocity;
uniform vec3 uAccent;
uniform vec3 uGlow;

varying vec2 vUv;
varying vec3 vViewPos;

void main() {
  vec2 uv = vUv;
  vec2 fromCentre = uv - 0.5;

  // Colour separation, but only while the ring is actually moving: three
  // texture samples per pixel across five panels is real fill rate to spend on
  // an effect nobody can see when it is still.
  vec3 color;
  if (uVelocity > 0.004) {
    float split = uVelocity * 0.022 * (0.4 + length(fromCentre));
    color = vec3(
      texture2D(uMap, uv + vec2(split, 0.0)).r,
      texture2D(uMap, uv).g,
      texture2D(uMap, uv - vec2(split, 0.0)).b
    );
  } else {
    color = texture2D(uMap, uv).rgb;
  }

  // Scanlines and a slow sweep of light across the surface.
  float scan = 0.96 + 0.04 * sin(uv.y * 620.0 - uTime * 3.0);
  float sweep = smoothstep(0.35, 0.0, abs(fract(uv.x * 0.5 - uTime * 0.06) - 0.5));
  color *= scan;
  color += uAccent * sweep * 0.06;

  // Edge: a bright rim that lifts on the panel facing the viewer.
  float edge = 1.0 - smoothstep(0.0, 0.028, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
  color = mix(color, mix(uGlow, uAccent, 0.45), edge * (0.35 + uActive * 0.5));

  // Panels turned away sit back, but stay legible enough to read as a row.
  color *= 0.42 + uActive * 0.58;
  float alpha = 0.55 + uActive * 0.45;

  // Fade the far edges so the ring dissolves instead of stopping hard.
  alpha *= smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x);

  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * The career timeline's spine (lib/timeline.ts): a light conduit standing in
 * for the CSS rule. A bright core inside a soft haze, charged up to the point
 * you have scrolled to, with pulses running down the charged part and a flare
 * at each role.
 */
export const beamVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const beamFragment = /* glsl */ `
#define MAX_NODES 12

uniform float uTime;
uniform float uProgress;    // 0..1, how far down the timeline the page is read
uniform float uNodes[MAX_NODES];
uniform int uNodeCount;
uniform vec2 uSizePx;       // quad size in CSS pixels, so line widths stay even
uniform float uSpinePx;     // where the bus sits across the quad
uniform vec3 uCore;
uniform vec3 uCharged;

varying vec2 vUv;

// Distance from p to the segment ab.
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float trace(vec2 p, vec2 a, vec2 b, float width) {
  return smoothstep(width, width * 0.4, segment(p, a, b));
}

float hexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

void main() {
  // Work in pixels: traces then keep the same weight at any timeline length.
  vec2 p = vec2(vUv.x * uSizePx.x, (1.0 - vUv.y) * uSizePx.y); // y down from the top
  float sx = uSpinePx;
  float readTo = uProgress * uSizePx.y;

  float lit = 0.0;   // the charged circuitry
  float dim = 0.0;   // the same circuitry, unpowered

  // ---- Main bus, plus a thinner one beside it ----
  float bus = trace(p, vec2(sx, 0.0), vec2(sx, uSizePx.y), 1.6);
  float busGlow = smoothstep(7.0, 0.0, abs(p.x - sx)) * 0.16;
  float sideBus = trace(p, vec2(sx - 30.0, 0.0), vec2(sx - 30.0, uSizePx.y), 0.7)
                * step(0.35, fract(p.y * 0.04));  // dashed
  dim += bus + busGlow + sideBus * 0.7;

  // ---- A branch, chip and connector at every role ----
  for (int i = 0; i < MAX_NODES; i++) {
    if (i >= uNodeCount) break;
    float ny = (1.0 - uNodes[i]) * uSizePx.y;
    if (abs(p.y - ny) > 90.0) continue; // nothing from this node reaches here

    // Right-angle branch out to the left, ending in a via.
    float branch = trace(p, vec2(sx, ny), vec2(sx - 30.0, ny), 1.2)
                 + trace(p, vec2(sx - 30.0, ny), vec2(sx - 30.0, ny - 26.0), 1.2);
    float via = smoothstep(3.4, 1.6, length(p - vec2(sx - 30.0, ny - 26.0)));

    // Short connector toward the card on the right, with a contact pad.
    float lead = trace(p, vec2(sx, ny), vec2(sx + 22.0, ny), 1.3);
    vec2 padVec = abs(p - vec2(sx + 24.0, ny)) - vec2(3.0, 2.2);
    float pad = smoothstep(1.2, 0.0, max(padVec.x, padVec.y));

    // The chip itself: a hexagon sitting on the bus.
    float hex = abs(hexagon(p - vec2(sx, ny), 8.0));
    float chip = smoothstep(1.7, 0.4, hex);
    float chipFill = smoothstep(0.0, -4.0, hexagon(p - vec2(sx, ny), 8.0)) * 0.22;

    float breathe = 0.7 + 0.3 * sin(uTime * 1.7 + float(i) * 1.3);
    dim += (branch + lead) * 0.8 + chip + via + pad;
    // Powered roles hum a little.
    if (ny <= readTo) lit += (chip * 1.3 + chipFill + via + pad + (branch + lead) * 0.5) * breathe;
  }

  // ---- Packets running down the powered length ----
  float packets = 0.0;
  for (int i = 0; i < 3; i++) {
    float head = fract(uTime * 0.16 + float(i) * 0.333) * readTo;
    float d = p.y - head;
    // A dash with a short tail behind it.
    packets += (exp(-pow(d * 0.22, 2.0)) + exp(-pow((d + 14.0) * 0.1, 2.0)) * 0.3)
             * smoothstep(3.2, 0.0, abs(p.x - sx));
  }

  float charged = smoothstep(0.0, 6.0, readTo - p.y);
  lit += dim * charged;
  packets *= charged;

  float intensity = dim * 0.5 + lit * 0.72 + packets * 1.0;
  vec3 color = mix(uCore, uCharged, clamp(charged * 0.75 + packets, 0.0, 1.0));
  // Premultiplied: alpha carries the same value, so the quad never paints a
  // dark rectangle over the page where the circuitry is empty.
  gl_FragColor = vec4(color * intensity, clamp(intensity, 0.0, 1.0));
}
`;

/**
 * Skills constellation (lib/constellation.ts). Colour comes in per vertex
 * rather than from a palette uniform, since dynamically indexing a uniform
 * array is not portable in older GLSL.
 */
export const constellationVertex = /* glsl */ `
uniform float uTime;
uniform float uFocus;
uniform float uFocusAmount;
uniform float uSize;
uniform float uPixelRatio;

attribute vec3 aColor;
attribute float aGroup;
attribute float aSeed;

varying vec3 vColor;
varying float vFocus;

void main() {
  vec3 p = position;
  // Each node drifts a little, so the constellation never looks frozen.
  p += vec3(
    sin(uTime * 0.5 + aSeed * 6.28),
    cos(uTime * 0.42 + aSeed * 3.14),
    sin(uTime * 0.6 + aSeed * 1.7)
  ) * 0.035;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // uFocusAmount fades the effect in and out, so nothing sweeps through the
  // other groups on the way to the one being hovered.
  float near = 1.0 - smoothstep(0.0, 0.9, abs(aGroup - uFocus));
  float focused = mix(1.0, mix(0.16, 1.4, near), uFocusAmount);
  vFocus = focused;
  vColor = aColor;

  float twinkle = 0.85 + 0.15 * sin(uTime * 2.2 + aSeed * 9.0);
  gl_PointSize = uSize * uPixelRatio * twinkle * (0.45 + focused * 0.75) * (7.0 / max(-mv.z, 0.1));
}
`;

export const constellationFragment = /* glsl */ `
varying vec3 vColor;
varying float vFocus;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  float core = smoothstep(0.45, 0.0, r);
  float halo = smoothstep(1.0, 0.0, r) * 0.4;
  vec3 color = mix(vColor, vec3(1.0, 0.94, 0.88), core * 0.5);
  float alpha = (core + halo) * (0.42 + vFocus * 0.78);
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export const linkVertex = /* glsl */ `
uniform float uFocus;
uniform float uFocusAmount;
attribute vec3 aColor;
attribute float aGroup;
varying vec3 vColor;
varying float vFocus;

void main() {
  vColor = aColor;
  float near = 1.0 - smoothstep(0.0, 0.9, abs(aGroup - uFocus));
  vFocus = mix(1.0, mix(0.12, 1.5, near), uFocusAmount);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const linkFragment = /* glsl */ `
varying vec3 vColor;
varying float vFocus;

void main() {
  float alpha = 0.16 + vFocus * 0.5;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

/**
 * Globe in the Services section (lib/globe.ts). Land dots fade as they turn
 * away, so the sphere reads as lit from the viewer's side.
 */
export const globeDotVertex = /* glsl */ `
uniform float uSize;
uniform float uPixelRatio;
varying float vFacing;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // The dot sits on the sphere, so its position is also its normal.
  vec3 normal = normalize(mat3(modelViewMatrix) * position);
  vFacing = max(dot(normal, normalize(-mv.xyz)), 0.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixelRatio * (0.55 + vFacing * 0.6) * (6.0 / max(-mv.z, 0.1));
}
`;

export const globeDotFragment = /* glsl */ `
uniform vec3 uLand;
uniform vec3 uShade;
varying float vFacing;

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float dot_ = smoothstep(1.0, 0.25, d);
  vec3 color = mix(uShade, uLand, pow(vFacing, 0.6));
  gl_FragColor = vec4(color, dot_ * (0.55 + vFacing * 0.45));
}
`;

export const markerVertex = /* glsl */ `
uniform float uTime;
uniform float uActive;
uniform float uSize;
uniform float uPixelRatio;

attribute float aIndex;

varying float vFacing;
varying float vActive;
varying float vPhase;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 normal = normalize(mat3(modelViewMatrix) * position);
  vFacing = max(dot(normal, normalize(-mv.xyz)), 0.0);
  vActive = 1.0 - min(abs(aIndex - uActive), 1.0);
  // Offset per marker, so the pins beat together but not in lockstep.
  vPhase = fract(uTime * 0.62 + aIndex * 0.09);

  gl_Position = projectionMatrix * mv;
  // Constant size: the beat happens inside the sprite, so the pin does not
  // jitter and the expanding ping always has room.
  // A small outward thump on the beat, on top of the growth inside the sprite.
  float thump = 1.0 + 0.1 * (exp(-pow((vPhase - 0.06) * 13.0, 2.0))
                           + exp(-pow((vPhase - 0.21) * 15.0, 2.0)) * 0.55);
  gl_PointSize = uSize * uPixelRatio * (0.55 + vFacing * 0.75) * thump
               * (1.0 + vActive * 0.55) * (6.0 / max(-mv.z, 0.1));
}
`;

export const markerFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;

varying float vFacing;
varying float vActive;
varying float vPhase;

/** Layer src over dst, both premultiplied. */
vec4 over(vec4 dst, vec4 src) {
  return vec4(src.rgb + dst.rgb * (1.0 - src.a), src.a + dst.a * (1.0 - src.a));
}

void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;

  // Two thumps per cycle, the second softer: a heartbeat rather than a throb.
  float beat = exp(-pow((vPhase - 0.06) * 13.0, 2.0))
             + exp(-pow((vPhase - 0.21) * 15.0, 2.0)) * 0.55;

  // The ping travels out from the pin on each beat.
  float ringRadius = 0.26 + vPhase * 0.7;
  float ping = smoothstep(0.09, 0.0, abs(d - ringRadius)) * (1.0 - vPhase) * (0.7 + vActive * 0.3);

  // A dark base, so a pin never disappears into the gold of the continents.
  float base = smoothstep(0.66, 0.34, d);
  float rim = smoothstep(0.40, 0.31, d) - smoothstep(0.30, 0.22, d);
  float core = smoothstep(0.19 + beat * 0.11, 0.10, d);

  vec4 color = vec4(0.0);
  color = over(color, vec4(vec3(0.05, 0.03, 0.03) * base * 0.8, base * 0.8));
  color = over(color, vec4(uColor * ping, ping));
  color = over(color, vec4(uColor * rim * (0.85 + beat * 0.15), rim * (0.85 + beat * 0.15)));
  color = over(color, vec4(mix(uColor, uHot, 0.4 + beat * 0.6) * core, core));

  // Fade out round the back of the globe.
  float visible = smoothstep(0.0, 0.35, vFacing);
  gl_FragColor = color * visible * (0.82 + vActive * 0.18);
}
`;
