"use client";

import * as THREE from "three";
import { LAND_DOTS, MARKER_SPOTS } from "@/lib/globe-dots";
import {
  globeDotFragment,
  globeDotVertex,
  glowFragment,
  glowVertex,
  markerFragment,
  markerVertex,
} from "@/lib/shaders";

const RADIUS = 1;

/** Latitude and longitude in degrees to a point on the globe. */
function onSphere(lat: number, lon: number, radius = RADIUS) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * A globe for the Services section: the continents picked out in dots, with a
 * marker on land for each capability. It turns by itself, stops while you are
 * pointing at it, and reports which marker is under the pointer so the section
 * can show that capability's text as HTML.
 */
export function createGlobe(markerCount: number) {
  const root = new THREE.Group();
  root.visible = false;
  // Three nested groups so the rotations do not fight each other: the axis
  // carries the planet's tilt and whatever tilt the viewer drags in, and the
  // spin only ever turns around that axis.
  const axis = new THREE.Group();
  axis.rotation.z = THREE.MathUtils.degToRad(-14);
  const spin = new THREE.Group();
  axis.add(spin);
  root.add(axis);

  // ---- Solid core, so the far side of the globe is hidden ----
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS * 0.985, 48, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#15100F") })
  );
  spin.add(core);

  // ---- Continents ----
  const dotCount = LAND_DOTS.length / 2;
  const dotPositions = new Float32Array(dotCount * 3);
  for (let i = 0; i < dotCount; i++) {
    const point = onSphere(LAND_DOTS[i * 2] / 10, LAND_DOTS[i * 2 + 1] / 10, RADIUS * 1.002);
    dotPositions.set([point.x, point.y, point.z], i * 3);
  }
  const dots = new THREE.BufferGeometry();
  dots.setAttribute("position", new THREE.BufferAttribute(dotPositions, 3));
  const dotMaterial = new THREE.ShaderMaterial({
    vertexShader: globeDotVertex,
    fragmentShader: globeDotFragment,
    uniforms: {
      uSize: { value: 3.6 },
      uPixelRatio: { value: 1 },
      uLand: { value: new THREE.Color("#F0BE86") },
      uShade: { value: new THREE.Color("#8E2233") },
    },
    transparent: true,
    depthWrite: false,
  });
  spin.add(new THREE.Points(dots, dotMaterial));

  // ---- Halo ----
  // A billboard rather than a shell: it has to stay behind the globe and face
  // the camera, and the globe itself is spinning.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      uniforms: { uColor: { value: new THREE.Color("#A32639") }, uOpacity: { value: 0.45 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.scale.setScalar(RADIUS * 3.2);
  halo.position.z = -RADIUS * 0.6;
  root.add(halo);

  // ---- Capability markers ----
  const count = Math.min(markerCount, MARKER_SPOTS.length);
  const markerPositions = new Float32Array(count * 3);
  const markerIndex = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const [lat, lon] = MARKER_SPOTS[i];
    const point = onSphere(lat, lon, RADIUS * 1.015);
    markerPositions.set([point.x, point.y, point.z], i * 3);
    markerIndex[i] = i;
  }
  const markers = new THREE.BufferGeometry();
  markers.setAttribute("position", new THREE.BufferAttribute(markerPositions, 3));
  markers.setAttribute("aIndex", new THREE.BufferAttribute(markerIndex, 1));
  const markerMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uActive: { value: -1 },
      uSize: { value: 30 },
      uPixelRatio: { value: 1 },
      // Crimson and white, so the pins read against gold continents.
      uColor: { value: new THREE.Color("#E0566B") },
      uHot: { value: new THREE.Color("#FFF6F0") },
    },
    vertexShader: markerVertex,
    fragmentShader: markerFragment,
    transparent: true,
    depthWrite: false,
    // Normal blending, not additive: the pins need to cover the land dots
    // underneath them rather than glow through them.
    premultipliedAlpha: true,
  });
  const markerPoints = new THREE.Points(markers, markerMaterial);
  markerPoints.renderOrder = 2; // always after the continents
  spin.add(markerPoints);

  let rotation = 0;
  let tilt = 0;
  let spinVelocity = 0;
  let paused = false;
  let dragging = false;
  let active = -1;
  /** Set when a capability is chosen, so the globe turns to bring it forward. */
  let target: number | null = null;

  const markerWorld = new THREE.Vector3();
  const centreWorld = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  return {
    root,
    markerPoints,
    markerCount: count,

    setPixelRatio(ratio: number) {
      dotMaterial.uniforms.uPixelRatio.value = ratio;
      markerMaterial.uniforms.uPixelRatio.value = ratio;
    },

    setPaused(value: boolean) {
      paused = value;
    },

    startDrag() {
      dragging = true;
      spinVelocity = 0;
      target = null;
    },

    /** Drag in pixels, against the size of the stage. */
    drag(dx: number, dy: number, size: number) {
      if (!dragging) return;
      const step = (dx / size) * Math.PI * 2;
      rotation += step;
      spinVelocity = step * 10;
      // Tilting is clamped: past about 35 degrees you are looking at a pole.
      tilt = THREE.MathUtils.clamp(tilt + (dy / size) * Math.PI, -0.62, 0.62);
    },

    endDrag() {
      dragging = false;
    },

    /**
     * Where a marker currently is on screen, and whether it faces the viewer.
     * Call after the frame has been rendered, so the matrices are current.
     */
    screenPosition(index: number, camera: THREE.Camera) {
      markerWorld
        .set(markerPositions[index * 3], markerPositions[index * 3 + 1], markerPositions[index * 3 + 2])
        .applyMatrix4(markerPoints.matrixWorld);
      centreWorld.setFromMatrixPosition(root.matrixWorld);
      camera.getWorldPosition(toCamera).sub(markerWorld);
      const facing = markerWorld.clone().sub(centreWorld).normalize().dot(toCamera.normalize());

      const projected = markerWorld.clone().project(camera);
      return {
        x: (projected.x * 0.5 + 0.5) * window.innerWidth,
        y: (-projected.y * 0.5 + 0.5) * window.innerHeight,
        facing,
        depth: projected.z,
        // Behind the globe, or behind the camera.
        front: facing > 0.12 && projected.z < 1,
      };
    },

    setActive(index: number) {
      active = index;
      markerMaterial.uniforms.uActive.value = index;
    },

    /** Turn the globe until this marker faces the viewer. */
    turnTo(index: number) {
      target = index;
    },

    hide() {
      root.visible = false;
    },

    place(rect: DOMRect, viewportHeight: number, halfHeight: number, aspect: number, depth: number) {
      const world = (px: number) => (px / (viewportHeight / 2)) * halfHeight;
      const cx = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
      const cy = -(((rect.top + rect.height / 2) / viewportHeight) * 2 - 1);
      root.position.set(cx * halfHeight * aspect, cy * halfHeight, -depth);
      root.scale.setScalar(Math.min(world(rect.width) * 0.42, world(rect.height) * 0.46));
      root.visible = true;
    },

    update(time: number, dt: number) {
      if (!root.visible) return;
      markerMaterial.uniforms.uTime.value = time;

      if (dragging) {
        // rotation is driven straight from the pointer
      } else if (Math.abs(spinVelocity) > 0.02) {
        rotation += spinVelocity * dt;
        spinVelocity *= Math.pow(0.05, dt);
      } else if (target !== null) {
        // Shortest way round to put the chosen marker at the front.
        // A marker at longitude L sits at local (cos L, ., sin L); turning the
        // globe by L - 90 degrees brings it round to face the camera.
        const [, lon] = MARKER_SPOTS[target];
        const wanted = THREE.MathUtils.degToRad(lon) - Math.PI / 2;
        let delta = (wanted - rotation) % (Math.PI * 2);
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        rotation += delta * Math.min(1, dt * 3);
        if (Math.abs(delta) < 0.01) target = null;
      } else if (!paused) {
        rotation += dt * 0.12;
      }

      spin.rotation.y = rotation;
      axis.rotation.x = tilt;
    },

    dispose() {
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      halo.geometry.dispose();
      (halo.material as THREE.Material).dispose();
      dots.dispose();
      dotMaterial.dispose();
      markers.dispose();
      markerMaterial.dispose();
    },

    get activeIndex() {
      return active;
    },
  };
}

declare global {
  interface Window {
    /** Published by the Services section: how many capabilities to pin. */
    __globeCount?: number;
  }
}
