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
