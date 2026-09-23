"use client";

import * as THREE from "three";
import { beamFragment, beamVertex } from "@/lib/shaders";

const MAX_NODES = 12;

/**
 * Turns the career timeline's vertical rule into a circuit board drawn in the
 * page's WebGL scene: a bus down the page with a branch, chip and connector at
 * every role, powering up as you scroll, with packets running down the powered
 * length. It tracks the real `.timeline` element, so the DOM stays the source
 * of truth for where anything sits.
 */
export function createTimelineBeam() {
  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uNodes: { value: new Float32Array(MAX_NODES) },
    uNodeCount: { value: 0 },
    uCore: { value: new THREE.Color("#7E2432") },
    uCharged: { value: new THREE.Color("#E8B27A") },
    uSizePx: { value: new THREE.Vector2(1, 1) },
    uSpinePx: { value: 0 },
  };

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
    })
  );
  mesh.visible = false;

  /** Quad width in CSS pixels, and where the bus sits inside it. */
  const WIDTH_PX = 190;
  const SPINE_PX = 150;

  return {
    mesh,

    setNodes(offsets: number[]) {
      const values = uniforms.uNodes.value;
      const count = Math.min(offsets.length, MAX_NODES);
      for (let i = 0; i < count; i++) values[i] = 1 - offsets[i]; // shader y runs bottom-up
      uniforms.uNodeCount.value = count;
    },

    /** Where the bus sits within the quad, so the caller can line it up. */
    get spineOffsetPx() {
      return SPINE_PX - WIDTH_PX / 2;
    },

    hide() {
      mesh.visible = false;
    },

    /** Line the board up with the timeline's rule and power it to `progress`. */
    place(
      lineX: number,
      rect: DOMRect,
      viewportHeight: number,
      halfHeight: number,
      aspect: number,
      depth: number,
      progress: number
    ) {
      const world = (px: number) => (px / (viewportHeight / 2)) * halfHeight;
      // The bus is off-centre in the quad, so shift the quad to put it on the line.
      const centreX = lineX - (SPINE_PX - WIDTH_PX / 2);
      const cx = (centreX / window.innerWidth) * 2 - 1;
      const cy = -(((rect.top + rect.height / 2) / viewportHeight) * 2 - 1);

      mesh.position.set(cx * halfHeight * aspect, cy * halfHeight, -depth);
      mesh.scale.set(world(WIDTH_PX), world(rect.height), 1);
      uniforms.uSizePx.value.set(WIDTH_PX, rect.height);
      uniforms.uSpinePx.value = SPINE_PX;
      uniforms.uProgress.value = progress;
      mesh.visible = true;
    },

    update(time: number) {
      if (mesh.visible) uniforms.uTime.value = time;
    },

    dispose() {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
  };
}
