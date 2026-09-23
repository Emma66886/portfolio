"use client";

import * as THREE from "three";
import { constellationFragment, constellationVertex, linkFragment, linkVertex } from "@/lib/shaders";

export type ConstellationGroup = { title: string; items: string[] };

const GROUP_COLORS = ["#C63B50", "#D9A56B", "#E0566B", "#917065", "#F0C89A", "#A8556A"];

/** Deterministic pseudo-random, so the layout is the same on every render. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The skill groups drawn as a slowly turning constellation: one node per
 * technology, wired to the others in its group, with links between the groups
 * themselves. The readable list stays in the DOM; this sits above it, and
 * hovering a group there lights that cluster and dims the rest.
 */
export function createConstellation(groups: ConstellationGroup[]) {
  const root = new THREE.Group();
  root.visible = false;

  const positions: number[] = [];
  const colors: number[] = [];
  const groupIds: number[] = [];
  const seeds: number[] = [];
  /** Index of the first node of each group, used to wire the groups together. */
  const groupStart: number[] = [];
  const color = new THREE.Color();

  groups.forEach((group, g) => {
    groupStart.push(positions.length / 3);
    const angle = (g / groups.length) * Math.PI * 2;
    const centre = new THREE.Vector3(
      Math.cos(angle) * 1.35,
      (hash(g * 7.3) - 0.5) * 0.62,
      Math.sin(angle) * 1.35
    );
    color.set(GROUP_COLORS[g % GROUP_COLORS.length]);

    group.items.forEach((_, i) => {
      const n = g * 37 + i;
      // Spread the group's nodes around its centre.
      const theta = hash(n) * Math.PI * 2;
      const phi = Math.acos(2 * hash(n + 0.5) - 1);
      const radius = 0.3 + hash(n + 1.5) * 0.36;
      positions.push(
        centre.x + Math.sin(phi) * Math.cos(theta) * radius,
        centre.y + Math.cos(phi) * radius * 0.8,
        centre.z + Math.sin(phi) * Math.sin(theta) * radius
      );
      colors.push(color.r, color.g, color.b);
      groupIds.push(g);
      seeds.push(hash(n + 3.7));
    });
  });

  const nodeCount = positions.length / 3;
  const nodes = new THREE.BufferGeometry();
  nodes.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  nodes.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  nodes.setAttribute("aGroup", new THREE.Float32BufferAttribute(groupIds, 1));
  nodes.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));

  // ---- Links: around each group, then between the groups ----
  const linkPos: number[] = [];
  const linkColor: number[] = [];
  const linkGroup: number[] = [];
  const at = (i: number) => positions.slice(i * 3, i * 3 + 3);
  const colorAt = (i: number) => colors.slice(i * 3, i * 3 + 3);

  const addLink = (a: number, b: number, g: number) => {
    linkPos.push(...at(a), ...at(b));
    linkColor.push(...colorAt(a), ...colorAt(b));
    linkGroup.push(g, g);
  };

  groups.forEach((group, g) => {
    const start = groupStart[g];
    const count = group.items.length;
    for (let i = 0; i < count; i++) addLink(start + i, start + ((i + 1) % count), g);
    // One strand across the cluster, so it reads as a mesh rather than a ring.
    if (count > 3) addLink(start, start + Math.floor(count / 2), g);
    // And a link on to the next group.
    const next = groupStart[(g + 1) % groups.length];
    addLink(start, next, g);
  });

  const links = new THREE.BufferGeometry();
  links.setAttribute("position", new THREE.Float32BufferAttribute(linkPos, 3));
  links.setAttribute("aColor", new THREE.Float32BufferAttribute(linkColor, 3));
  links.setAttribute("aGroup", new THREE.Float32BufferAttribute(linkGroup, 1));

  const shared = {
    uTime: { value: 0 },
    uFocus: { value: 0 },
    uFocusAmount: { value: 0 },
  };

  const nodeMaterial = new THREE.ShaderMaterial({
    vertexShader: constellationVertex,
    fragmentShader: constellationFragment,
    uniforms: { ...shared, uSize: { value: 34 }, uPixelRatio: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const linkMaterial = new THREE.ShaderMaterial({
    vertexShader: linkVertex,
    fragmentShader: linkFragment,
    uniforms: shared,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const spin = new THREE.Group();
  spin.add(new THREE.LineSegments(links, linkMaterial), new THREE.Points(nodes, nodeMaterial));
  root.add(spin);

  let focus = -1;
  let lastFocus = 0;
  let amount = 0;
  let tilt = 0;

  return {
    root,
    nodeCount,

    setPixelRatio(ratio: number) {
      nodeMaterial.uniforms.uPixelRatio.value = ratio;
    },

    /** Light one group and dim the others; -1 for all. */
    setFocus(index: number | null) {
      focus = index ?? -1;
    },

    hide() {
      root.visible = false;
    },

    place(rect: DOMRect, viewportHeight: number, halfHeight: number, aspect: number, depth: number) {
      const cx = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
      const cy = -(((rect.top + rect.height / 2) / viewportHeight) * 2 - 1);
      const world = (px: number) => (px / (viewportHeight / 2)) * halfHeight;
      root.position.set(cx * halfHeight * aspect, cy * halfHeight, -depth);
      // Fit the constellation (about 4 units across) to the stage.
      root.scale.setScalar(Math.min(world(rect.width) / 3.4, world(rect.height) / 2.2));
      root.visible = true;
    },

    update(time: number, dt: number, pointerX: number, pointerY: number) {
      if (!root.visible) return;
      shared.uTime.value = time;
      // Hold the last group while the highlight fades out, and fade the
      // strength rather than the index, so nothing sweeps across the clusters.
      if (focus >= 0) lastFocus = focus;
      amount += ((focus >= 0 ? 1 : 0) - amount) * Math.min(1, dt * 7);
      shared.uFocus.value = lastFocus;
      shared.uFocusAmount.value = amount;

      spin.rotation.y += dt * 0.12;
      tilt += (pointerY * 0.18 - tilt) * Math.min(1, dt * 2);
      spin.rotation.x = tilt + Math.sin(time * 0.24) * 0.06;
      root.rotation.y = pointerX * 0.12;
    },

    dispose() {
      nodes.dispose();
      links.dispose();
      nodeMaterial.dispose();
      linkMaterial.dispose();
    },
  };
}

declare global {
  interface Window {
    /** Published by the Skills section for the background scene to pick up. */
    __skillGroups?: ConstellationGroup[];
  }
}
