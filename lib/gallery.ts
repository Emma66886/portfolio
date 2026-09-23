"use client";

import * as THREE from "three";
import { glowFragment, glowVertex, panelFragment, panelVertex } from "@/lib/shaders";

export type GalleryItem = { title: string; caption: string; image?: string };

type Options = {
  items: GalleryItem[];
  onActiveChange: (index: number) => void;
};

const PANEL_ASPECT = 1200 / 750;
/** Space between panels, as a multiple of panel width. */
const SPACING = 1.5;
/**
 * How far each panel turns with the ring. Below 1 the panels stay angled
 * toward the viewer, so the ones either side of the front are still legible
 * instead of edge-on: with only a handful of projects a true ring would turn
 * them 72 degrees away and they would disappear.
 */
const FACING = 0.58;
/** Radians per second the ring turns by itself: a full turn in about 40s. */
const AUTO_SPEED = 0.158;
/** How long the ring holds still on a panel after you interact with it. */
const HOLD_AFTER_INPUT = 2.5;

/** Fallback texture for a project with no screenshot: its name on a gradient. */
function labelTexture(item: GalleryItem) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 750;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 1200, 750);
    gradient.addColorStop(0, "#2C1B1C");
    gradient.addColorStop(1, "#4A2A2E");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 750);

    ctx.strokeStyle = "rgba(217,165,107,.25)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (750 / 8) * i);
      ctx.lineTo(1200, (750 / 8) * i);
      ctx.stroke();
    }

    ctx.fillStyle = "#F6ECE7";
    ctx.font = "600 78px Georgia, 'Times New Roman', serif";
    ctx.fillText(item.title, 80, 380);
    ctx.fillStyle = "#D9A56B";
    ctx.font = "500 34px system-ui, sans-serif";
    ctx.fillText(item.caption.toUpperCase(), 80, 450);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Project screenshots as panels on a slowly turning ring, drawn inside the
 * page's existing WebGL scene. The ring tracks a DOM element so it lines up
 * with the layout, and reports which panel is at the front so the section can
 * show that project's text as ordinary HTML.
 */
export function createGallery({ items, onActiveChange }: Options) {
  const group = new THREE.Group();
  group.visible = false;

  const count = items.length;
  const step = (Math.PI * 2) / count;
  const geometry = new THREE.PlaneGeometry(1, 1 / PANEL_ASPECT, 24, 12);
  const loader = new THREE.TextureLoader();
  const ring = new THREE.Group();
  // A few degrees of tilt: enough to look down on the ring, so it reads as a
  // ring rather than a flat row, and so the platform below is not edge-on.
  ring.rotation.x = 0.085;
  group.add(ring);

  // Glow behind the ring, so the panels read as lit from within the page
  // rather than pasted onto it. Facing the camera, since a floor plane at this
  // tilt is nearly edge-on and therefore invisible.
  const platform = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: glowFragment,
      uniforms: { uColor: { value: new THREE.Color("#A32639") }, uOpacity: { value: 0.38 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(platform);

  const panels = items.map((item, i) => {
    const texture = item.image ? loader.load(item.image) : labelTexture(item);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;

    const material = new THREE.ShaderMaterial({
      vertexShader: panelVertex,
      fragmentShader: panelFragment,
      uniforms: {
        uMap: { value: texture },
        uTime: { value: 0 },
        uActive: { value: 0 },
        uVelocity: { value: 0 },
        uCurve: { value: 0 },
        uAccent: { value: new THREE.Color("#D9A56B") },
        uGlow: { value: new THREE.Color("#C63B50") },
      },
      transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.index = i;
    ring.add(mesh);
    return { mesh, material, texture };
  });

  let radius = 1;
  let rotation = 0;
  let velocity = 0;
  let dragging = false;
  let active = -1;
  let pointerOver = false;
  /** Auto-rotation resumes once the clock passes this. */
  let holdUntil = 0;
  let spinRate = 0;

  const layout = (panelWidth: number) => {
    radius = (count * panelWidth * SPACING) / (Math.PI * 2);
    panels.forEach(({ mesh, material }, i) => {
      const angle = i * step;
      mesh.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      mesh.scale.set(panelWidth, panelWidth, 1);
      // Bend each panel around the ring so the row reads as one curved surface.
      material.uniforms.uCurve.value = panelWidth / (2 * radius);
    });
    platform.scale.setScalar(radius * 2.6);
    platform.position.z = -radius * 0.35;
  };

  const indexFromRotation = () => ((Math.round(-rotation / step) % count) + count) % count;

  return {
    group,
    get radius() {
      return radius;
    },

    /** Size and place the ring so its front panel sits `depth` in front of the camera. */
    place(rect: DOMRect, viewportHeight: number, halfHeight: number, aspect: number, depth: number) {
      const world = (px: number) => (px / (viewportHeight / 2)) * halfHeight;
      const panelWidth = Math.min(world(rect.width) * 0.34, world(rect.height) * 0.66 * PANEL_ASPECT);
      layout(panelWidth);

      const cx = ((rect.left + rect.width / 2) / window.innerWidth) * 2 - 1;
      const cy = -(((rect.top + rect.height * 0.5) / viewportHeight) * 2 - 1);
      group.position.set(cx * halfHeight * aspect, cy * halfHeight, -(depth + radius));
      group.visible = true;
    },

    hide() {
      group.visible = false;
    },

    setPointerOver(over: boolean) {
      pointerOver = over;
    },

    startDrag() {
      dragging = true;
      velocity = 0;
    },

    /** `dx` is pointer movement in pixels, `width` the stage width in pixels. */
    drag(dx: number, width: number) {
      if (!dragging) return;
      const delta = (dx / width) * Math.PI * 1.2;
      rotation += delta;
      velocity = delta * 12;
    },

    endDrag() {
      dragging = false;
    },

    /** Step the ring by whole panels (arrow buttons, keyboard). */
    go(direction: number, time: number) {
      rotation -= direction * step;
      velocity = 0;
      holdUntil = time + HOLD_AFTER_INPUT;
    },

    /** Bring a specific panel to the front. */
    focus(index: number, time: number) {
      const current = indexFromRotation();
      let diff = ((index - current + count) % count + count) % count;
      if (diff > count / 2) diff -= count;
      rotation -= diff * step;
      velocity = 0;
      holdUntil = time + HOLD_AFTER_INPUT;
    },

    /** Which panel a ray hits, or -1. */
    hit(raycaster: THREE.Raycaster) {
      const intersects = raycaster.intersectObjects(panels.map((p) => p.mesh), false);
      return intersects.length ? (intersects[0].object.userData.index as number) : -1;
    },

    update(time: number, dt: number) {
      if (!group.visible) return;

      const previous = rotation;

      if (!dragging) {
        if (Math.abs(velocity) > 0.02) {
          // Carry on from a flick, slowing down.
          rotation += velocity * dt;
          velocity *= Math.pow(0.02, dt);
          if (Math.abs(velocity) <= 0.02) holdUntil = time + HOLD_AFTER_INPUT;
        } else if (pointerOver || time < holdUntil) {
          // Held still on the nearest panel: either the pointer is on the ring,
          // or you just moved it and are presumably reading.
          const target = Math.round(rotation / step) * step;
          rotation += (target - rotation) * Math.min(1, dt * 4);
        } else {
          rotation -= AUTO_SPEED * dt;
        }
      }

      ring.rotation.y = rotation;
      // Feeds the shader's colour split, so it responds to a flick and to the
      // gentle turn alike.
      spinRate = dt > 0 ? Math.abs(rotation - previous) / dt : 0;

      const index = indexFromRotation();
      if (index !== active) {
        active = index;
        onActiveChange(index);
      }

      panels.forEach(({ mesh, material }, i) => {
        // Where this panel currently sits on the ring, as -PI..PI so the two
        // sides stay symmetrical.
        let angle = (i * step + rotation) % (Math.PI * 2);
        if (angle > Math.PI) angle -= Math.PI * 2;
        if (angle < -Math.PI) angle += Math.PI * 2;

        // Turn it back toward the viewer. The panel is a child of the ring, so
        // the ring's own rotation has to come out of its local angle.
        mesh.rotation.y = angle * FACING - rotation;

        // 1 when this panel faces the viewer, falling off to the sides.
        const facing = Math.max(0, Math.cos(angle));
        material.uniforms.uTime.value = time;
        material.uniforms.uActive.value = Math.pow(facing, 1.4);
        material.uniforms.uVelocity.value = Math.min(spinRate * 0.05, 1);
      });
    },

    dispose() {
      platform.geometry.dispose();
      (platform.material as THREE.Material).dispose();
      geometry.dispose();
      panels.forEach(({ material, texture }) => {
        material.dispose();
        texture.dispose();
      });
    },
  };
}

declare global {
  interface Window {
    /** Published by the Projects section for the background scene to pick up. */
    __galleryItems?: GalleryItem[];
  }
}
