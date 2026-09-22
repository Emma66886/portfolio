"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  glowFragment,
  glowVertex,
  linksFragment,
  linksVertex,
  orbFragment,
  orbVertex,
  pointsFragment,
  pointsVertex,
} from "@/lib/shaders";

const PALETTE = ["#C63B50", "#C63B50", "#D9A56B", "#D9A56B", "#917065", "#F6ECE7"];
const FOV = 60;
const ORB_DEPTH = 6;
/** How far the camera flies into the field between the top and bottom of the page. */
const SCROLL_TRAVEL = 24;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Particles scattered through a box, plus links between nearby "node" particles. */
function buildField(count: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 34;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
    positions[i * 3 + 2] = 8 - Math.random() * 52;
    color.set(PALETTE[(Math.random() * PALETTE.length) | 0]);
    colors.set([color.r, color.g, color.b], i * 3);
    seeds[i] = Math.random();
  }

  const nodes = Math.min(count, 360);
  const linkPos: number[] = [];
  const linkSeed: number[] = [];
  const degree = new Uint8Array(nodes);
  for (let a = 0; a < nodes; a++) {
    for (let b = a + 1; b < nodes && degree[a] < 3; b++) {
      if (degree[b] >= 3) continue;
      const dx = positions[a * 3] - positions[b * 3];
      const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
      const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
      if (dx * dx + dy * dy + dz * dz > 30) continue;
      linkPos.push(...positions.subarray(a * 3, a * 3 + 3), ...positions.subarray(b * 3, b * 3 + 3));
      linkSeed.push(seeds[a], seeds[b]);
      degree[a]++;
      degree[b]++;
    }
  }

  const points = new THREE.BufferGeometry();
  points.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  points.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  points.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  const links = new THREE.BufferGeometry();
  links.setAttribute("position", new THREE.Float32BufferAttribute(linkPos, 3));
  links.setAttribute("aSeed", new THREE.Float32BufferAttribute(linkSeed, 1));

  return { points, links };
}

function glowQuad(color: string, opacity: number) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
}

/**
 * Fixed full-page WebGL background: a 3D particle network the camera flies
 * through as the page scrolls, reacting to the pointer (push + glow, click
 * shockwave, parallax), and a noise-driven orb pinned behind the hero portrait.
 * Purely decorative; if WebGL is unavailable the CSS backgrounds remain.
 */
export default function Scene3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < 768;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !small, powerPreference: "high-performance" });
    } catch {
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
    camera.position.set(0, 0, 10);
    scene.add(camera);
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

    // ---- Particle field ----
    const fieldUniforms = {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uTanHalfFov: { value: tanHalfFov },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPointerActive: { value: 0 },
      uClick: { value: new THREE.Vector2(0, 0) },
      uClickAge: { value: 99 },
    };
    const { points: pointsGeo, links: linksGeo } = buildField(small ? 1100 : 2400);
    const pointsMat = new THREE.ShaderMaterial({
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      uniforms: { ...fieldUniforms, uSize: { value: small ? 3.2 : 2.6 }, uPixelRatio: { value: pixelRatio } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const linksMat = new THREE.ShaderMaterial({
      vertexShader: linksVertex,
      fragmentShader: linksFragment,
      uniforms: {
        ...fieldUniforms,
        uColor: { value: new THREE.Color("#D9A56B") },
        uHotColor: { value: new THREE.Color("#E0566B") },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const field = new THREE.Group();
    field.add(new THREE.LineSegments(linksGeo, linksMat), new THREE.Points(pointsGeo, pointsMat));
    scene.add(field);

    // ---- Hero orb (camera child, so it stays pinned behind the portrait) ----
    const orbUniforms = {
      uTime: { value: 0 },
      uAmp: { value: 0.07 },
      uHover: { value: 0 },
      uPointerDir: { value: new THREE.Vector3(0, 0, 1) },
      uDeep: { value: new THREE.Color("#1A0609") },
      uBody: { value: new THREE.Color("#6E1622") },
      uRim: { value: new THREE.Color("#C98A55") },
    };
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, small ? 16 : 32),
      new THREE.ShaderMaterial({ vertexShader: orbVertex, fragmentShader: orbFragment, uniforms: orbUniforms })
    );
    const halo = glowQuad("#A32639", 0.32);
    halo.scale.setScalar(2.9);
    halo.position.z = -1.4;
    const orbGroup = new THREE.Group();
    orbGroup.add(halo, orb);
    orbGroup.visible = false;
    camera.add(orbGroup);

    // ---- Cursor light ----
    const cursorLight = glowQuad("#C63B50", 0);
    cursorLight.scale.setScalar(4.5);
    cursorLight.position.z = -8;
    camera.add(cursorLight);

    // ---- Input ----
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: 0, targetActive: 0 };
    let clickTime = -99;
    let orbPulse = 0;
    const started = performance.now();
    const now = () => (performance.now() - started) / 1000;

    const onPointerMove = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = -(e.clientY / window.innerHeight) * 2 + 1;
      pointer.targetActive = 1;
      if (reduced) requestRender();
    };
    const onPointerLeave = () => (pointer.targetActive = 0);
    const onPointerDown = (e: PointerEvent) => {
      if (reduced) return;
      fieldUniforms.uClick.value.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      clickTime = now();
      orbPulse = 1;
    };
    const onTouchEnd = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") pointer.targetActive = 0;
    };

    // ---- Layout ----
    // Measure the wrapper, not `.photo-frame`: the frame tilts under the
    // pointer, and a tilted element's bounding box grows and shifts, which
    // would feed straight back into the orb's size and position as a wobble.
    const heroPhoto = document.querySelector<HTMLElement>(".hero-photo");
    let scroll = 0;
    let scrollTarget = 0;

    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollTarget = max > 0 ? window.scrollY / max : 0;
      if (reduced) {
        scroll = scrollTarget;
        requestRender();
      }
    };

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fieldUniforms.uAspect.value = camera.aspect;
      readScroll();
    };

    const placeOrb = () => {
      if (!heroPhoto) return;
      const r = heroPhoto.getBoundingClientRect();
      if (r.bottom < -r.height * 0.4 || r.width === 0) {
        orbGroup.visible = false;
        return;
      }
      orbGroup.visible = true;
      const h = window.innerHeight;
      const halfH = tanHalfFov * ORB_DEPTH;
      const cx = ((r.left + r.width / 2) / window.innerWidth) * 2 - 1;
      const cy = -(((r.top + r.height * 0.44) / h) * 2 - 1);
      orbGroup.position.set(cx * halfH * camera.aspect, cy * halfH, -ORB_DEPTH);
      orbGroup.scale.setScalar(((r.width * 0.58) / (h / 2)) * halfH);
      orbLeanBase.copy(orbGroup.position);
    };

    // ---- Frame ----
    const pointerView = new THREE.Vector3();
    const orbLeanBase = new THREE.Vector3();
    const orbLean = 0.16;
    const inverseRotation = new THREE.Quaternion();

    const update = (time: number, dt: number) => {
      const ease = reduced ? 1 : 1 - Math.pow(0.001, dt);
      pointer.x = lerp(pointer.x, pointer.tx, ease * 0.9);
      pointer.y = lerp(pointer.y, pointer.ty, ease * 0.9);
      pointer.active = lerp(pointer.active, pointer.targetActive, ease * 0.5);
      scroll = lerp(scroll, scrollTarget, ease);

      fieldUniforms.uTime.value = time;
      fieldUniforms.uPointer.value.set(pointer.x, pointer.y);
      fieldUniforms.uPointerActive.value = reduced ? 0 : pointer.active;
      fieldUniforms.uClickAge.value = time - clickTime;

      // Parallax and scroll fly-through.
      camera.position.set(pointer.x * 0.9, pointer.y * 0.55, 10 - scroll * SCROLL_TRAVEL);
      camera.lookAt(pointer.x * 0.25, pointer.y * 0.15, camera.position.z - 10);
      field.rotation.z = scroll * 0.5;
      field.rotation.y = Math.sin(time * 0.05) * 0.08;

      // Cursor light follows the pointer at its own depth.
      const halfH = tanHalfFov * 8;
      cursorLight.position.x = pointer.x * halfH * camera.aspect;
      cursorLight.position.y = pointer.y * halfH;
      (cursorLight.material as THREE.ShaderMaterial).uniforms.uOpacity.value = reduced ? 0 : pointer.active * 0.22;

      placeOrb();
      if (orbGroup.visible) {
        // Lean toward the pointer, capped so the orb stays behind the portrait.
        const leanX = orbLean * (pointer.x * tanHalfFov * ORB_DEPTH * camera.aspect - orbLeanBase.x);
        const leanY = orbLean * (pointer.y * tanHalfFov * ORB_DEPTH - orbLeanBase.y);
        const leanScale = Math.min(1, (orbGroup.scale.x * 0.22) / Math.hypot(leanX, leanY) || 0);
        orbGroup.position.x = orbLeanBase.x + leanX * leanScale * pointer.active;
        orbGroup.position.y = orbLeanBase.y + leanY * leanScale * pointer.active;

        const s = orbGroup.scale.x;
        const halfOrb = tanHalfFov * ORB_DEPTH;
        pointerView.set(
          pointer.x * halfOrb * camera.aspect - orbGroup.position.x,
          pointer.y * halfOrb - orbGroup.position.y,
          0
        );
        const dist = pointerView.length() / s;
        const hoverTarget = THREE.MathUtils.clamp(1 - (dist - 1.05) / 0.95, 0, 1) * pointer.active;
        orbUniforms.uHover.value = lerp(orbUniforms.uHover.value, reduced ? 0 : hoverTarget, ease * 0.5);

        orbPulse = Math.max(0, orbPulse - dt * 1.4);
        orbUniforms.uAmp.value = 0.065 + orbUniforms.uHover.value * 0.05 + orbPulse * 0.07;
        orbUniforms.uTime.value = time * (1 + orbUniforms.uHover.value * 0.8);

        orb.rotation.y += dt * 0.12;
        orb.rotation.x = lerp(orb.rotation.x, -pointer.y * 0.35, ease * 0.3);
        pointerView.z = s * 0.35;
        inverseRotation.copy(orb.quaternion).invert();
        orbUniforms.uPointerDir.value.copy(pointerView.normalize().applyQuaternion(inverseRotation));
      }
    };

    let frame = 0;
    let running = false;
    let last = 0;

    /**
     * Software renderers and weak GPUs can't keep up with a full-screen
     * particle field, so shed work a tier at a time rather than letting the
     * whole page stutter.
     *
     * The orb is never hidden: it sits behind the portrait and is the one piece
     * a visitor is actively playing with, so making it vanish mid-interaction
     * reads as a broken page. It gets a cheaper mesh instead. Two consecutive
     * slow windows are required, so one stutter (a scroll, a background tab
     * waking up) does not permanently strip the scene.
     */
    const links = field.children[0];
    const lowDetailOrb = new THREE.IcosahedronGeometry(1, 8);
    let tier = 0;
    let slowWindows = 0;
    let sampleFrames = 0;
    let sampleStart = 0;

    const checkPerformance = (time: number) => {
      // Ignore the first seconds: load-time jank is not a weak GPU.
      if (tier >= 3 || time < 3) return;
      if (!sampleStart) {
        sampleStart = time;
        return;
      }
      sampleFrames++;
      const elapsed = time - sampleStart;
      if (elapsed < 2) return;
      const fps = sampleFrames / elapsed;
      sampleFrames = 0;
      sampleStart = time;

      if (fps >= 32) {
        slowWindows = 0;
        return;
      }
      if (++slowWindows < 2) return;
      slowWindows = 0;

      tier++;
      if (tier === 1) {
        renderer.setPixelRatio(1);
        resize();
      } else if (tier === 2) {
        links.visible = false;
        cursorLight.visible = false;
      } else {
        const full = orb.geometry;
        orb.geometry = lowDetailOrb;
        full.dispose();
        pointsGeo.setDrawRange(0, Math.floor(pointsGeo.attributes.position.count / 2));
      }
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const time = now();
      const dt = Math.min(time - last, 0.05);
      last = time;
      update(time, dt);
      renderer.render(scene, camera);
      checkPerformance(time);
    };

    function requestRender() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update(0, 0);
        renderer.render(scene, camera);
      });
    }

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = now();
      loop();
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onScroll = () => {
      readScroll();
      if (reduced) requestRender();
    };
    const onResize = () => {
      resize();
      if (reduced) requestRender();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onTouchEnd, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    if (reduced) requestRender();
    else start();
    canvas.classList.add("ready");

    return () => {
      stop();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onTouchEnd);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      lowDetailOrb.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="bg-scene" aria-hidden="true" />;
}
