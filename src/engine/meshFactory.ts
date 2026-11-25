import * as THREE from 'three';
import type {
  BrandAsset,
  ShellWallSide,
  StandConfig,
  StandItem,
  SurfaceArtwork,
  SurfaceZoneDef,
} from '../types/stand';
import { getFloorBumpTexture, getFloorTexture, getSurfaceTexture } from './textureComposer';

export interface BuildContext {
  config: StandConfig;
  assetsMap: Map<string, BrandAsset>;
  onTextureReady: () => void;
}

let sharedContactShadowTex: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (sharedContactShadowTex) return sharedContactShadowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.24)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.11)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  sharedContactShadowTex = new THREE.CanvasTexture(c);
  return sharedContactShadowTex;
}

function addContactShadow(parent: THREE.Group, w: number, d: number, y = 0.0025) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.12, d * 1.12),
    new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = 1;
  parent.add(mesh);
}

/**
 * Architectural softly rounded box (centered at origin) using ExtrudeGeometry
 * so furniture edges catch realistic specular rim highlights.
 */
function makeRoundedBoxGeometry(
  w: number,
  h: number,
  d: number,
  radius = 0.02,
  bevel = 0.008
): THREE.BufferGeometry {
  const r = Math.min(radius, w * 0.42, d * 0.42);
  const b = Math.min(bevel, h * 0.28, r * 0.5);
  const iw = Math.max(0.01, w - b * 2);
  const id = Math.max(0.01, d - b * 2);
  const ih = Math.max(0.004, h - b * 2);
  const hw = iw / 2;
  const hd = id / 2;
  const cr = Math.min(r, hw * 0.8, hd * 0.8);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + cr, -hd);
  shape.lineTo(hw - cr, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + cr);
  shape.lineTo(hw, hd - cr);
  shape.quadraticCurveTo(hw, hd, hw - cr, hd);
  shape.lineTo(-hw + cr, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - cr);
  shape.lineTo(-hw, -hd + cr);
  shape.quadraticCurveTo(-hw, -hd, -hw + cr, -hd);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: ih,
    bevelEnabled: b > 0.001,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 4,
  });
  // Orient extrusion along Y and center at origin
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, -ih / 2, 0);
  geom.computeVertexNormals();
  return geom;
}

function makeGraphicMaterial(
  artwork: SurfaceArtwork | undefined,
  role: SurfaceZoneDef['defaultRole'],
  aspect: number,
  ctx: BuildContext,
  forceBacklit = false,
  doubleSide = false
): THREE.MeshStandardMaterial {
  const tex = getSurfaceTexture(
    artwork,
    role,
    aspect,
    ctx.config,
    ctx.assetsMap,
    ctx.onTextureReady
  );
  const isGlowing = Boolean(forceBacklit || artwork?.emissive || role === 'screen');
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: role === 'screen' ? 0.16 : 0.62,
    metalness: role === 'screen' ? 0.08 : 0.02,
    emissive: isGlowing ? new THREE.Color('#ffffff') : new THREE.Color('#000000'),
    emissiveMap: isGlowing ? tex : null,
    emissiveIntensity: role === 'screen' ? 0.72 : isGlowing ? 0.48 : 0,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function tagInteractive(
  obj: THREE.Object3D,
  itemId: string,
  surfaceId?: string,
  surfaceLabel?: string
) {
  obj.userData.itemId = itemId;
  if (surfaceId) {
    obj.userData.surfaceId = surfaceId;
    obj.userData.surfaceLabel = surfaceLabel || surfaceId;
    obj.userData.brandable = true;
  }
}

function makeAluminumMat(color = '#C8CDD3'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.72,
    roughness: 0.28,
  });
}

function makeDarkMetalMat(color = '#252930'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.55,
    roughness: 0.36,
  });
}

function makeWhiteMatteMat(color = '#F7F7F5'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.02,
    roughness: 0.52,
  });
}

function makeWoodMat(color = '#C6A378'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.02,
    roughness: 0.58,
  });
}

function createCurvedPanelGeometry(
  width: number,
  height: number,
  curveDepth: number,
  segments = 32
): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(width, height, segments, 1);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = x / (width / 2); // -1 to 1
    // Parabolic gentle concave curve facing forward (+Z)
    const zOffset = curveDepth * (t * t - 0.5);
    pos.setZ(i, zOffset);
  }
  geom.computeVertexNormals();
  return geom;
}

export function buildStandItemMesh(item: StandItem, ctx: BuildContext): THREE.Group {
  const group = new THREE.Group();
  group.name = `item:${item.id}`;
  group.userData.itemId = item.id;

  const { w, h, d } = item.dims;
  const primaryHex = item.primaryColor || ctx.config.primaryColor || '#1B365D';
  const accentHex = item.accentColor || ctx.config.accentColor || '#D95D39';
  const aluminum = makeAluminumMat();
  const darkMetal = makeDarkMetalMat();
  const whiteMat = makeWhiteMatteMat(
    item.finish === 'oak' ? '#C6A378' : item.primaryColor || '#F7F7F5'
  );
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.45,
    metalness: 0.05,
  });
  const primaryMat = new THREE.MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.48,
    metalness: 0.06,
  });

  switch (item.catalogId) {
    case 'popup-wall-straight': {
      // Rear collapsible aluminum scissor lattice frame
      const frameDepth = Math.max(0.2, Math.min(d - 0.04, d * 0.78));
      const cols = Math.max(3, Math.round(w / 0.72));
      const rows = 3;
      const cellW = (w - 0.08) / cols;
      const cellH = (h - 0.14) / rows;
      const strutGeom = new THREE.CylinderGeometry(0.011, 0.011, 1, 6);

      // Vertical posts at rear
      for (let c = 0; c <= cols; c++) {
        const x = -w / 2 + 0.04 + c * cellW;
        const postRear = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, h - 0.04, 8),
          aluminum
        );
        postRear.position.set(x, h / 2, -frameDepth / 2);
        postRear.castShadow = true;
        group.add(postRear);

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, d), darkMetal);
        foot.position.set(x, 0.012, 0);
        group.add(foot);
      }

      // Scissor X cross-braces on back (offset ±0.012 in Z to eliminate coplanar interpenetration)
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const cx = -w / 2 + 0.04 + (c + 0.5) * cellW;
          const cy = 0.08 + (r + 0.5) * cellH;
          const diagLen = Math.hypot(cellW, cellH);
          const angle = Math.atan2(cellW, cellH);

          const s1 = new THREE.Mesh(strutGeom, aluminum);
          s1.scale.set(1, diagLen, 1);
          s1.position.set(cx, cy, -frameDepth / 2 - 0.012);
          s1.rotation.z = angle;
          group.add(s1);

          const s2 = new THREE.Mesh(strutGeom, aluminum);
          s2.scale.set(1, diagLen, 1);
          s2.position.set(cx, cy, -frameDepth / 2 + 0.012);
          s2.rotation.z = -angle;
          group.add(s2);
        }
      }

      // Solid backing panel + graphic front face
      const backing = new THREE.Mesh(
        new THREE.BoxGeometry(w, h - 0.03, 0.045),
        darkMetal
      );
      backing.position.set(0, h / 2 + 0.01, frameDepth / 2 - 0.03);
      backing.castShadow = true;
      backing.receiveShadow = true;
      group.add(backing);

      const frontMat = makeGraphicMaterial(item.artwork.front, 'hero', w / h, ctx, item.backlit);
      const frontMesh = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.04), frontMat);
      frontMesh.position.set(0, h / 2 + 0.01, frameDepth / 2 - 0.005);
      frontMesh.receiveShadow = true;
      tagInteractive(frontMesh, item.id, 'front', 'Main Graphic Mural');
      group.add(frontMesh);

      // Twin top gooseneck arm spotlights firmly mounted to backing top edge
      const numLights = w >= 2.4 ? 2 : 1;
      for (let i = 0; i < numLights; i++) {
        const lx = numLights === 1 ? 0 : i === 0 ? -w * 0.28 : w * 0.28;
        const mountZ = frameDepth / 2 - 0.03;
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.055, 0.052), darkMetal);
        clamp.position.set(lx, h + 0.012, mountZ);
        group.add(clamp);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.34), darkMetal);
        arm.position.set(lx, h + 0.035, mountZ + 0.17);
        group.add(arm);

        const lampPivot = new THREE.Group();
        lampPivot.position.set(lx, h + 0.025, mountZ + 0.34);
        lampPivot.rotation.x = -0.55; // aimed back & down toward the mural
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.052, 0.085, 12), darkMetal);
        head.position.y = -0.042;
        lampPivot.add(head);
        const bulb = new THREE.Mesh(
          new THREE.CircleGeometry(0.042, 12),
          new THREE.MeshBasicMaterial({ color: '#FFF7E0' })
        );
        bulb.position.y = -0.086;
        bulb.rotation.x = Math.PI / 2;
        lampPivot.add(bulb);
        group.add(lampPivot);
      }
      break;
    }

    case 'popup-wall-curved': {
      const curveDepth = Math.min(0.42, d * 0.62);
      const frontGeom = createCurvedPanelGeometry(w, h - 0.04, curveDepth, 36);
      const frontMat = makeGraphicMaterial(
        item.artwork.front,
        'hero',
        (w * 1.08) / h,
        ctx,
        item.backlit,
        false
      );
      const frontMesh = new THREE.Mesh(frontGeom, frontMat);
      frontMesh.position.set(0, h / 2 + 0.01, 0.04);
      frontMesh.castShadow = true;
      frontMesh.receiveShadow = true;
      tagInteractive(frontMesh, item.id, 'front', 'Curved Seamless Mural');
      group.add(frontMesh);

      // Dark backing shell slightly behind curved graphic
      const backGeom = createCurvedPanelGeometry(w, h - 0.04, curveDepth, 36);
      const backMesh = new THREE.Mesh(
        backGeom,
        new THREE.MeshStandardMaterial({
          color: '#23272F',
          roughness: 0.7,
          side: THREE.BackSide,
        })
      );
      backMesh.position.set(0, h / 2 + 0.01, 0.028);
      backMesh.castShadow = true;
      group.add(backMesh);

      // Rear curved scissor posts, horizontal tie struts, and feet kept strictly inside dims.d
      const posts = 5;
      const maxRearZ = -d / 2 + 0.02;
      for (let i = 0; i < posts; i++) {
        const t = -1 + (2 * i) / (posts - 1);
        const px = t * (w / 2 - 0.08);
        const panelZ = curveDepth * (t * t - 0.5) + 0.028;
        const pz = Math.max(maxRearZ + 0.04, panelZ - 0.14);
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.013, h - 0.04, 8),
          aluminum
        );
        post.position.set(px, h / 2, pz);
        group.add(post);

        // Horizontal tie struts connecting rear pole cleanly into curved backing shell
        const tieLen = Math.max(0.04, panelZ - pz);
        for (const ty of [0.22, h * 0.5, h - 0.22]) {
          const tie = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, tieLen), aluminum);
          tie.position.set(px, ty, pz + tieLen / 2);
          group.add(tie);
        }

        const footLen = Math.min(0.28, (panelZ - maxRearZ) + 0.06);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.022, footLen), darkMetal);
        foot.position.set(px, 0.011, Math.max(maxRearZ + footLen / 2, pz + 0.04));
        group.add(foot);
      }

      // Twin top spotlights with proper mount clamps
      for (const side of [-0.26, 0.26]) {
        const lx = side * w;
        const t = lx / (w / 2);
        const lz = curveDepth * (t * t - 0.5) + 0.028;
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.05, 0.042), darkMetal);
        clamp.position.set(lx, h + 0.008, lz);
        group.add(clamp);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.34), darkMetal);
        arm.position.set(lx, h + 0.03, lz + 0.17);
        group.add(arm);

        const lampPivot = new THREE.Group();
        lampPivot.position.set(lx, h + 0.022, lz + 0.34);
        lampPivot.rotation.x = -0.58;
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.05, 0.082, 12), darkMetal);
        head.position.y = -0.041;
        lampPivot.add(head);
        const bulb = new THREE.Mesh(
          new THREE.CircleGeometry(0.04, 12),
          new THREE.MeshBasicMaterial({ color: '#FFF7E0' })
        );
        bulb.position.y = -0.083;
        bulb.rotation.x = Math.PI / 2;
        lampPivot.add(bulb);
        group.add(lampPivot);
      }
      break;
    }

    case 'seg-lightbox': {
      const frameD = Math.min(d, 0.14);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.02, frameD), aluminum);
      frame.position.set(0, h / 2 + 0.01, 0);
      frame.castShadow = true;
      frame.receiveShadow = true;
      group.add(frame);

      // Stabilizing steel feet strictly within dims.d (or sleek minimal depth)
      const footD = Math.min(Math.max(d, 0.24), 0.36);
      for (const sx of [-w * 0.38, w * 0.38]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.02, footD), darkMetal);
        foot.position.set(sx, 0.01, 0);
        group.add(foot);
      }

      // Glowing front SEG fabric
      const frontMat = makeGraphicMaterial(
        item.artwork.front,
        'hero',
        w / h,
        ctx,
        item.backlit !== false
      );
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, h - 0.05), frontMat);
      front.position.set(0, h / 2 + 0.01, frameD / 2 + 0.004);
      tagInteractive(front, item.id, 'front', 'Illuminated Front Fabric');
      group.add(front);

      // Clean white rear diffuser
      const rear = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.04, h - 0.06),
        new THREE.MeshStandardMaterial({ color: '#EAECEF', roughness: 0.7 })
      );
      rear.position.set(0, h / 2 + 0.01, -frameD / 2 - 0.003);
      rear.rotation.y = Math.PI;
      group.add(rear);
      break;
    }

    case 'modular-wall': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, h, d), whiteMat);
      body.position.set(0, h / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Anodized end uprights
      for (const sx of [-w / 2 + 0.025, w / 2 - 0.025]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.055, h + 0.01, d + 0.015), aluminum);
        post.position.set(sx, h / 2, 0);
        post.castShadow = true;
        group.add(post);
      }

      const frontMat = makeGraphicMaterial(item.artwork.front, 'hero', w / h, ctx, item.backlit);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.06), frontMat);
      front.position.set(0, h / 2, d / 2 + 0.004);
      tagInteractive(front, item.id, 'front', 'Front Wall Panel');
      group.add(front);

      const backMat = makeGraphicMaterial(item.artwork.back, 'pattern', w / h, ctx, false);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.06), backMat);
      back.position.set(0, h / 2, -d / 2 - 0.004);
      back.rotation.y = Math.PI;
      tagInteractive(back, item.id, 'back', 'Rear Wall Panel');
      group.add(back);
      break;
    }

    case 'front-arch': {
      const pillarW = Math.min(0.68, w * 0.14);
      const headerH = Math.min(0.72, h * 0.24);
      const clearH = h - headerH;

      // Left & right pillars
      for (const side of [-1, 1] as const) {
        const px = side * (w / 2 - pillarW / 2);
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(pillarW, clearH, d), primaryMat);
        pillar.position.set(px, clearH / 2, 0);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        group.add(pillar);

        // Metallic plinth collar
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(pillarW + 0.04, 0.08, d + 0.04),
          aluminum
        );
        base.position.set(px, 0.04, 0);
        group.add(base);

        // Brandable front face on each pillar
        const sId = side === -1 ? 'pillar-left' : 'pillar-right';
        const pMat = makeGraphicMaterial(
          item.artwork[sId],
          'pattern',
          pillarW / clearH,
          ctx,
          false
        );
        const pFace = new THREE.Mesh(new THREE.PlaneGeometry(pillarW - 0.03, clearH - 0.12), pMat);
        pFace.position.set(px, clearH / 2 + 0.03, d / 2 + 0.005);
        tagInteractive(
          pFace,
          item.id,
          sId,
          side === -1 ? 'Left Column Graphic' : 'Right Column Graphic'
        );
        group.add(pFace);
      }

      // Sweeping top fascia bridge
      const fasciaBox = new THREE.Mesh(new THREE.BoxGeometry(w, headerH, d), primaryMat);
      fasciaBox.position.set(0, clearH + headerH / 2, 0);
      fasciaBox.castShadow = true;
      fasciaBox.receiveShadow = true;
      group.add(fasciaBox);

      // Accent top trim strip
      const topStrip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02), accentMat);
      topStrip.position.set(0, h + 0.01, 0);
      group.add(topStrip);

      // Front & rear fascia graphic banners
      const fasciaMat = makeGraphicMaterial(
        item.artwork.fascia,
        'fascia',
        w / headerH,
        ctx,
        item.backlit
      );
      const fasciaFront = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.06, headerH - 0.06),
        fasciaMat
      );
      fasciaFront.position.set(0, clearH + headerH / 2, d / 2 + 0.006);
      tagInteractive(fasciaFront, item.id, 'fascia', 'Overhead Fascia Header');
      group.add(fasciaFront);

      const fasciaBack = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.06, headerH - 0.06),
        fasciaMat
      );
      fasciaBack.position.set(0, clearH + headerH / 2, -d / 2 - 0.006);
      fasciaBack.rotation.y = Math.PI;
      tagInteractive(fasciaBack, item.id, 'fascia', 'Overhead Fascia Header');
      group.add(fasciaBack);

      // Recessed LED downlight pucks under fascia
      for (let i = -1; i <= 1; i++) {
        const puck = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16),
          new THREE.MeshBasicMaterial({ color: '#FFF6E0' })
        );
        puck.position.set(i * (w * 0.24), clearH - 0.005, 0);
        group.add(puck);
      }
      break;
    }

    case 'storage-cabin': {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), primaryMat);
      box.position.set(0, h / 2, 0);
      box.castShadow = true;
      box.receiveShadow = true;
      group.add(box);

      // Top trim band
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.05, d + 0.02), aluminum);
      cap.position.set(0, h - 0.02, 0);
      group.add(cap);

      // Front brand panel
      const frontMat = makeGraphicMaterial(item.artwork.front, 'hero', w / h, ctx, item.backlit);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.08), frontMat);
      front.position.set(0, h / 2, d / 2 + 0.005);
      tagInteractive(front, item.id, 'front', 'Front Exterior Facade');
      group.add(front);

      // Side brand panel (+X)
      const sideMat = makeGraphicMaterial(item.artwork.side, 'pattern', d / h, ctx, false);
      const sideRight = new THREE.Mesh(new THREE.PlaneGeometry(d - 0.04, h - 0.08), sideMat);
      sideRight.position.set(w / 2 + 0.005, h / 2, 0);
      sideRight.rotation.y = Math.PI / 2;
      tagInteractive(sideRight, item.id, 'side', 'Side Exterior Facade');
      group.add(sideRight);

      // Lockable flush door on -X side with brushed steel handle
      const doorOutline = new THREE.Mesh(
        new THREE.PlaneGeometry(0.82, 2.02),
        new THREE.MeshStandardMaterial({ color: '#20242B', roughness: 0.6 })
      );
      doorOutline.position.set(-w / 2 - 0.004, 1.02, 0);
      doorOutline.rotation.y = -Math.PI / 2;
      group.add(doorOutline);

      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.025), aluminum);
      handle.position.set(-w / 2 - 0.022, 1.04, 0.28);
      group.add(handle);
      break;
    }

    case 'rollup-banner': {
      // Brushed aluminum cassette base strictly within w × d
      const cassette = new THREE.Mesh(
        makeRoundedBoxGeometry(w, 0.088, Math.min(0.15, d * 0.6), 0.015, 0.005),
        aluminum
      );
      cassette.position.set(0, 0.044, 0);
      cassette.castShadow = true;
      group.add(cassette);

      // Stabilizing swivel feet strictly within dims.d
      const footD = Math.min(d, 0.28);
      for (const fx of [-w * 0.34, w * 0.34]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.016, footD), aluminum);
        foot.position.set(fx, 0.008, 0);
        group.add(foot);
      }

      // Rear telescopic pole + curved top hook joining pole cleanly into top rail
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, h - 0.07, 10), aluminum);
      pole.position.set(0, (h - 0.07) / 2 + 0.04, -0.05);
      group.add(pole);

      const hookArm = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.016, 0.068), aluminum);
      hookArm.position.set(0, h - 0.02, -0.022);
      group.add(hookArm);

      // Top clamp rail
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.028), aluminum);
      topRail.position.set(0, h - 0.016, 0.006);
      group.add(topRail);

      // Vertical graphic canvas (FrontSide only + separate light-block grey rear face)
      const bannerH = h - 0.12;
      const frontMat = makeGraphicMaterial(
        item.artwork.front,
        'logo',
        w / bannerH,
        ctx,
        item.backlit,
        false
      );
      const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.01, bannerH), frontMat);
      canvasMesh.position.set(0, 0.088 + bannerH / 2, 0.01);
      canvasMesh.castShadow = true;
      canvasMesh.receiveShadow = true;
      tagInteractive(canvasMesh, item.id, 'front', 'Vertical Banner Graphic');
      group.add(canvasMesh);

      const rearBack = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.01, bannerH),
        new THREE.MeshStandardMaterial({ color: '#D0D4DA', roughness: 0.78 })
      );
      rearBack.position.set(0, 0.088 + bannerH / 2, 0.007);
      rearBack.rotation.y = Math.PI;
      group.add(rearBack);
      break;
    }

    case 'hanging-cube': {
      const sideMat = makeGraphicMaterial(
        item.artwork.sides,
        'fascia',
        w / h,
        ctx,
        item.backlit !== false
      );
      const topBottomMat = new THREE.MeshStandardMaterial({
        color: '#232830',
        roughness: 0.7,
      });
      const cube = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [
        sideMat,
        sideMat,
        topBottomMat,
        topBottomMat,
        sideMat,
        sideMat,
      ]);
      cube.position.set(0, h / 2, 0);
      cube.castShadow = true;
      tagInteractive(cube, item.id, 'sides', '4-Sided Perimeter Wrap');
      group.add(cube);

      // 4 steel aircraft rigging cables extending up to venue roof
      const cableH = 2.6;
      const cableGeom = new THREE.CylinderGeometry(0.006, 0.006, cableH, 6);
      for (const sx of [-w / 2 + 0.08, w / 2 - 0.08]) {
        for (const sz of [-d / 2 + 0.08, d / 2 - 0.08]) {
          const cable = new THREE.Mesh(cableGeom, aluminum);
          cable.position.set(sx, h + cableH / 2, sz);
          group.add(cable);
        }
      }
      break;
    }

    case 'hanging-ring': {
      const radius = w / 2;
      const ringMat = makeGraphicMaterial(
        item.artwork.ring,
        'fascia',
        2.6,
        ctx,
        item.backlit !== false,
        false
      );
      if (ringMat.map) {
        const tiled = ringMat.map.clone();
        tiled.wrapS = THREE.RepeatWrapping;
        tiled.wrapT = THREE.ClampToEdgeWrapping;
        tiled.repeat.set(3, 1);
        tiled.userData = { ...tiled.userData, disposeOnCleanup: true };
        tiled.needsUpdate = true;
        ringMat.map = tiled;
        if (ringMat.emissiveMap) ringMat.emissiveMap = tiled;
      }
      const outer = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, h, 48, 1, true),
        ringMat
      );
      outer.position.set(0, h / 2, 0);
      outer.castShadow = true;
      tagInteractive(outer, item.id, 'ring', '360° Halo Graphic Band');
      group.add(outer);

      // Solid inner satin liner (prevents mirrored text on inner surface)
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(radius - 0.024, radius - 0.024, h - 0.01, 48, 1, true),
        new THREE.MeshStandardMaterial({
          color: '#E6E9EE',
          roughness: 0.65,
          metalness: 0.06,
          side: THREE.BackSide,
        })
      );
      inner.position.set(0, h / 2, 0);
      group.add(inner);

      // Upper & lower structural rim rings
      for (const ry of [0.02, h - 0.02]) {
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(radius - 0.012, 0.024, 10, 48),
          aluminum
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.y = ry;
        group.add(rim);
      }

      // 4 rigging wires
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.5, 6), aluminum);
        wire.position.set(Math.cos(angle) * (radius - 0.012), h + 1.25, Math.sin(angle) * (radius - 0.012));
        group.add(wire);
      }
      break;
    }

    case 'brand-totem': {
      // Base plate strictly within w × d envelope
      const base = new THREE.Mesh(makeRoundedBoxGeometry(w, 0.036, d, 0.02, 0.005), darkMetal);
      base.position.set(0, 0.018, 0);
      base.castShadow = true;
      group.add(base);

      // Aluminum carcass
      const carcassW = w - 0.04;
      const carcassD = Math.min(0.18, d * 0.45);
      const carcass = new THREE.Mesh(
        new THREE.BoxGeometry(carcassW, h - 0.036, carcassD),
        aluminum
      );
      carcass.position.set(0, 0.036 + (h - 0.036) / 2, 0);
      carcass.castShadow = true;
      group.add(carcass);

      // Glowing front & back faces
      const faceMat = makeGraphicMaterial(
        item.artwork.front,
        'logo',
        carcassW / h,
        ctx,
        item.backlit !== false
      );
      const front = new THREE.Mesh(new THREE.PlaneGeometry(carcassW - 0.04, h - 0.1), faceMat);
      front.position.set(0, 0.036 + (h - 0.036) / 2, carcassD / 2 + 0.004);
      tagInteractive(front, item.id, 'front', 'Illuminated Front Face');
      group.add(front);

      const back = new THREE.Mesh(new THREE.PlaneGeometry(carcassW - 0.04, h - 0.1), faceMat);
      back.position.set(0, 0.036 + (h - 0.036) / 2, -carcassD / 2 - 0.004);
      back.rotation.y = Math.PI;
      tagInteractive(back, item.id, 'front', 'Illuminated Front Face');
      group.add(back);
      break;
    }

    case 'tv-stand': {
      // Heavy steel base strictly within w × d
      const baseW = Math.min(w, 0.74);
      const baseD = Math.min(d, 0.52);
      const base = new THREE.Mesh(makeRoundedBoxGeometry(baseW, 0.028, baseD, 0.02, 0.005), darkMetal);
      base.position.set(0, 0.014, 0);
      base.castShadow = true;
      group.add(base);

      // Twin chrome uprights
      for (const sx of [-0.12, 0.12]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 1.54, 14), aluminum);
        col.position.set(sx, 0.79, -0.04);
        col.castShadow = true;
        group.add(col);
      }

      // Slim media shelf
      const shelf = new THREE.Mesh(makeRoundedBoxGeometry(0.54, 0.024, 0.28, 0.015, 0.004), darkMetal);
      shelf.position.set(0, 0.78, 0.07);
      group.add(shelf);

      // 55" TV bezel fitted within w
      const screenW = Math.min(w - 0.04, 1.24);
      const screenH = Math.min(0.72, screenW * 0.575);
      const bezel = new THREE.Mesh(
        makeRoundedBoxGeometry(screenW + 0.04, screenH + 0.04, 0.048, 0.012, 0.005),
        darkMetal
      );
      bezel.position.set(0, 1.58, 0.01);
      bezel.castShadow = true;
      group.add(bezel);

      // Glowing 4K display surface
      const screenMat = makeGraphicMaterial(
        item.artwork.screen,
        'screen',
        screenW / screenH,
        ctx,
        true
      );
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), screenMat);
      screen.position.set(0, 1.58, 0.036);
      tagInteractive(screen, item.id, 'screen', '4K Display Content');
      group.add(screen);
      break;
    }

    case 'led-video-wall': {
      const screenH = h - 0.32;
      // Floor support truss feet strictly within dims.d
      const footD = Math.min(d, 0.44);
      for (const sx of [-w * 0.36, 0, w * 0.36]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.036, footD), darkMetal);
        foot.position.set(sx, 0.018, 0);
        group.add(foot);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.32, 0.075), darkMetal);
        leg.position.set(sx, 0.178, -0.02);
        group.add(leg);
      }

      // LED cabinet housing
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(w, screenH, 0.13), darkMetal);
      cabinet.position.set(0, 0.32 + screenH / 2, 0);
      cabinet.castShadow = true;
      group.add(cabinet);

      // Glowing frameless LED canvas
      const ledMat = makeGraphicMaterial(
        item.artwork.screen,
        'screen',
        w / screenH,
        ctx,
        true
      );
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, screenH - 0.04), ledMat);
      screen.position.set(0, 0.32 + screenH / 2, 0.068);
      tagInteractive(screen, item.id, 'screen', 'LED Video Canvas');
      group.add(screen);
      break;
    }

    case 'feather-flag': {
      // Weighted cross-base centered at (0,0) strictly inside dims
      const armLen = Math.min(w, d, 0.56);
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.024, 0.065), darkMetal);
      b1.position.y = 0.012;
      group.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.024, armLen), darkMetal);
      b2.position.y = 0.012;
      group.add(b2);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.06, 12), aluminum);
      hub.position.y = 0.035;
      group.add(hub);

      // Curved fiberglass feather mast rooted cleanly at (0, 0.05, 0)
      const flagW = w * 0.72;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.04, 0),
        new THREE.Vector3(-flagW * 0.34, h * 0.45, 0),
        new THREE.Vector3(-flagW * 0.3, h * 0.82, 0),
        new THREE.Vector3(-flagW * 0.06, h * 0.98, 0),
        new THREE.Vector3(flagW * 0.36, h * 0.94, 0),
      ]);
      const mast = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.013, 8, false), darkMetal);
      mast.castShadow = true;
      group.add(mast);

      // Sculpted curved feather banner fabric
      const fShape = new THREE.Shape();
      fShape.moveTo(-flagW * 0.32, h * 0.2);
      fShape.quadraticCurveTo(-flagW * 0.34, h * 0.82, -flagW * 0.06, h * 0.97);
      fShape.quadraticCurveTo(flagW * 0.38, h * 0.96, flagW * 0.44, h * 0.72);
      fShape.lineTo(flagW * 0.38, h * 0.24);
      fShape.quadraticCurveTo(flagW * 0.05, h * 0.16, -flagW * 0.32, h * 0.2);

      const fGeom = new THREE.ShapeGeometry(fShape, 20);
      // Normalize UVs to [0..1]
      const posAttr = fGeom.attributes.position;
      const uvAttr = fGeom.attributes.uv;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < posAttr.count; i++) {
        minX = Math.min(minX, posAttr.getX(i));
        maxX = Math.max(maxX, posAttr.getX(i));
        minY = Math.min(minY, posAttr.getY(i));
        maxY = Math.max(maxY, posAttr.getY(i));
      }
      for (let i = 0; i < posAttr.count; i++) {
        uvAttr.setXY(
          i,
          (posAttr.getX(i) - minX) / Math.max(0.01, maxX - minX),
          (posAttr.getY(i) - minY) / Math.max(0.01, maxY - minY)
        );
      }

      const flagMat = makeGraphicMaterial(
        item.artwork.front,
        'logo',
        flagW / (h * 0.78),
        ctx,
        false,
        false
      );
      const flagFront = new THREE.Mesh(fGeom, flagMat);
      flagFront.position.z = 0.004;
      flagFront.castShadow = true;
      tagInteractive(flagFront, item.id, 'front', 'Flag Fabric Print');
      group.add(flagFront);

      const flagBack = new THREE.Mesh(
        fGeom,
        new THREE.MeshStandardMaterial({
          color: primaryHex,
          roughness: 0.75,
          side: THREE.BackSide,
        })
      );
      flagBack.position.z = -0.004;
      group.add(flagBack);
      break;
    }

    case 'reception-desk': {
      addContactShadow(group, w, d);
      // Recessed dark toe-kick plinth
      const kick = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.09, d - 0.14), darkMetal);
      kick.position.set(0, 0.045, 0);
      group.add(kick);

      // Main cabinet body kept cleanly within w × d
      const bodyH = h - 0.145;
      const bodyW = w - 0.06;
      const bodyD = d - 0.08;
      const body = new THREE.Mesh(
        makeRoundedBoxGeometry(bodyW, bodyH, bodyD, 0.02, 0.006),
        whiteMat
      );
      body.position.set(0, 0.09 + bodyH / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Sleek beveled countertop strictly within w × d
      const topMat =
        item.finish === 'oak'
          ? makeWoodMat()
          : new THREE.MeshStandardMaterial({
              color: '#FFFFFF',
              roughness: 0.22,
              metalness: 0.04,
            });
      const counterTop = new THREE.Mesh(
        makeRoundedBoxGeometry(w, 0.055, d, 0.024, 0.007),
        topMat
      );
      counterTop.position.set(0, h - 0.0275, 0);
      counterTop.castShadow = true;
      counterTop.receiveShadow = true;
      group.add(counterTop);

      // Accent LED under-counter reveal strip
      const ledStrip = new THREE.Mesh(
        new THREE.BoxGeometry(bodyW - 0.02, 0.016, 0.018),
        new THREE.MeshBasicMaterial({ color: accentHex })
      );
      ledStrip.position.set(0, h - 0.063, bodyD / 2 - 0.004);
      group.add(ledStrip);

      // Front UV-mapped branded wrap panel
      const frontMat = makeGraphicMaterial(
        item.artwork.front,
        'logo',
        bodyW / bodyH,
        ctx,
        item.backlit
      );
      const frontPanel = new THREE.Mesh(new THREE.PlaneGeometry(bodyW - 0.04, bodyH - 0.04), frontMat);
      frontPanel.position.set(0, 0.09 + bodyH / 2, bodyD / 2 + 0.005);
      tagInteractive(frontPanel, item.id, 'front', 'Front Counter Wrap');
      group.add(frontPanel);
      break;
    }

    case 'quickfold-counter': {
      addContactShadow(group, w, d);
      // Portable oval-top pop-up promo counter strictly within w × d
      const topMat = item.finish === 'oak' ? makeWoodMat() : makeWhiteMatteMat('#FFFFFF');
      const base = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 - 0.02, w / 2 - 0.02, 0.035, 32), darkMetal);
      base.scale.set(1, 1, (d - 0.04) / Math.max(0.01, w - 0.04));
      base.position.y = 0.0175;
      group.add(base);

      const bodyH = h - 0.08;
      const bodyCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(w / 2 - 0.035, w / 2 - 0.035, bodyH, 32),
        primaryMat
      );
      bodyCyl.scale.set(1, 1, (d - 0.07) / Math.max(0.01, w - 0.07));
      bodyCyl.position.y = 0.035 + bodyH / 2;
      bodyCyl.castShadow = true;
      bodyCyl.receiveShadow = true;
      group.add(bodyCyl);

      // Curved front graphic wrap (front 180 degrees)
      const wrapMat = makeGraphicMaterial(item.artwork.front, 'logo', (w * 1.4) / bodyH, ctx);
      const wrap = new THREE.Mesh(
        new THREE.CylinderGeometry(
          w / 2 - 0.029,
          w / 2 - 0.029,
          bodyH - 0.02,
          32,
          1,
          true,
          -Math.PI / 2,
          Math.PI
        ),
        wrapMat
      );
      wrap.scale.set(1, 1, (d - 0.058) / Math.max(0.01, w - 0.058));
      wrap.position.y = 0.035 + bodyH / 2;
      tagInteractive(wrap, item.id, 'front', 'Curved Front Wrap');
      group.add(wrap);

      const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.045, 32), topMat);
      top.scale.set(1, 1, d / w);
      top.position.y = h - 0.0225;
      top.castShadow = true;
      group.add(top);
      break;
    }

    case 'demo-kiosk': {
      addContactShadow(group, w, d);
      // Base plate
      const base = new THREE.Mesh(makeRoundedBoxGeometry(w, 0.035, d, 0.02, 0.005), darkMetal);
      base.position.y = 0.0175;
      group.add(base);

      // Pedestal column
      const bodyH = h - 0.14;
      const body = new THREE.Mesh(
        makeRoundedBoxGeometry(w * 0.86, bodyH, d * 0.72, 0.018, 0.005),
        whiteMat
      );
      body.position.set(0, 0.035 + bodyH / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Tapered collar bridging pedestal top cleanly to angled lectern (eliminates wedge air gap)
      const collar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.06, d * 0.68), darkMetal);
      collar.position.set(0, h - 0.105, 0);
      group.add(collar);

      // Branded front apron
      const frontMat = makeGraphicMaterial(item.artwork.front, 'logo', (w * 0.8) / bodyH, ctx);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.78, bodyH - 0.08), frontMat);
      front.position.set(0, 0.035 + bodyH / 2, (d * 0.72) / 2 + 0.005);
      tagInteractive(front, item.id, 'front', 'Kiosk Front Panel');
      group.add(front);

      // Angled lectern top + cleanly hinged laptop group (zero lectern piercing)
      const lecternGroup = new THREE.Group();
      lecternGroup.position.set(0, h - 0.078, 0.01);
      lecternGroup.rotation.x = 0.12;

      const lectern = new THREE.Mesh(
        makeRoundedBoxGeometry(w, 0.034, d * 0.92, 0.018, 0.005),
        whiteMat
      );
      lectern.castShadow = true;
      lecternGroup.add(lectern);

      // Sleek anodized laptop resting flush on lectern top (local y = +0.017)
      const laptopBase = new THREE.Mesh(
        makeRoundedBoxGeometry(0.35, 0.012, 0.23, 0.012, 0.003),
        aluminum
      );
      laptopBase.position.set(0, 0.023, 0.01);
      lecternGroup.add(laptopBase);

      // Hinge pivot at exact rear edge of laptopBase (local z = 0.01 - 0.115 = -0.105)
      const screenHinge = new THREE.Group();
      screenHinge.position.set(0, 0.029, -0.105);
      screenHinge.rotation.x = -0.34; // opens cleanly backward relative to lectern

      const laptopScreen = new THREE.Mesh(
        makeRoundedBoxGeometry(0.35, 0.22, 0.01, 0.01, 0.003),
        darkMetal
      );
      laptopScreen.position.set(0, 0.11, 0);
      screenHinge.add(laptopScreen);

      const screenGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.19),
        new THREE.MeshBasicMaterial({ color: '#38BDF8' })
      );
      screenGlow.position.set(0, 0.11, 0.006);
      screenHinge.add(screenGlow);

      lecternGroup.add(screenHinge);
      group.add(lecternGroup);
      break;
    }

    case 'display-plinth': {
      addContactShadow(group, w, d);
      const plinthH = h * 0.72;
      const body = new THREE.Mesh(
        makeRoundedBoxGeometry(w, plinthH, d, 0.018, 0.006),
        whiteMat
      );
      body.position.y = plinthH / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const frontMat = makeGraphicMaterial(item.artwork.front, 'logo', w / plinthH, ctx);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, plinthH - 0.06), frontMat);
      front.position.set(0, plinthH / 2, d / 2 + 0.004);
      tagInteractive(front, item.id, 'front', 'Plinth Front Face');
      group.add(front);

      // Illuminated LED top plate
      const glowPlate = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.04, 0.018, d - 0.04),
        new THREE.MeshBasicMaterial({ color: '#FFFDF7' })
      );
      glowPlate.position.y = plinthH + 0.009;
      group.add(glowPlate);

      // Clear acrylic vitrine showcase hood starting cleanly above glowPlate (no coplanar bottom)
      const hoodH = h - plinthH - 0.018;
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: '#E6F4FA',
        transparent: true,
        opacity: 0.24,
        roughness: 0.08,
        metalness: 0.05,
        transmission: 0.35,
      });
      const hood = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, hoodH, d - 0.02), glassMat);
      hood.position.y = plinthH + 0.018 + hoodH / 2;
      group.add(hood);

      // Brushed metal riser puck + sculpted showcase artifact resting cleanly on top
      const riserH = 0.032;
      const riser = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.min(w, d) * 0.2, Math.min(w, d) * 0.23, riserH, 24),
        aluminum
      );
      riser.position.y = plinthH + 0.018 + riserH / 2;
      group.add(riser);

      const artR = Math.min(w, d) * 0.16;
      const demoArtifact = new THREE.Mesh(new THREE.OctahedronGeometry(artR, 1), accentMat);
      demoArtifact.position.y = plinthH + 0.018 + riserH + artR;
      demoArtifact.castShadow = true;
      group.add(demoArtifact);
      break;
    }

    case 'bistro-table': {
      addContactShadow(group, 0.62, 0.62);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.024, 28), aluminum);
      base.position.y = 0.012;
      base.castShadow = true;
      group.add(base);

      // Full-height stem + under-table spider flange (eliminates 4mm gap under tabletop)
      const stemH = h - 0.055;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, stemH, 16), aluminum);
      stem.position.y = 0.022 + stemH / 2;
      stem.castShadow = true;
      group.add(stem);

      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.05, 0.024, 20), aluminum);
      flange.position.y = h - 0.044;
      group.add(flange);

      const topMat = item.finish === 'oak' ? makeWoodMat() : makeWhiteMatteMat('#FFFFFF');
      const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2 - 0.008, 0.034, 36), topMat);
      top.position.y = h - 0.017;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);
      break;
    }

    case 'meeting-table': {
      addContactShadow(group, w, d);
      const topMat = item.finish === 'oak' ? makeWoodMat() : makeWhiteMatteMat('#FBFBF9');
      const top = new THREE.Mesh(
        makeRoundedBoxGeometry(w, 0.04, d, 0.035, 0.007),
        topMat
      );
      top.position.y = h - 0.02;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);

      // Recessed under-frame apron + 4 angled architectural legs
      const apron = new THREE.Mesh(new THREE.BoxGeometry(w - 0.24, 0.035, d - 0.2), darkMetal);
      apron.position.y = h - 0.052;
      group.add(apron);

      const legGeom = new THREE.CylinderGeometry(0.021, 0.017, h - 0.04, 12);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(legGeom, darkMetal);
          leg.position.set(sx * (w / 2 - 0.13), (h - 0.04) / 2, sz * (d / 2 - 0.11));
          leg.rotation.z = -sx * 0.07;
          leg.rotation.x = sz * 0.06;
          leg.castShadow = true;
          group.add(leg);
        }
      }
      break;
    }

    case 'bar-stool': {
      addContactShadow(group, 0.44, 0.44);
      const seatH = h * 0.74;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.195, 0.02, 24), aluminum);
      base.position.y = 0.01;
      group.add(base);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, seatH, 14), aluminum);
      stem.position.y = seatH / 2;
      stem.castShadow = true;
      group.add(stem);

      // Footrest ring with 4 structural radial spokes connecting cleanly to stem
      const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.009, 10, 28), aluminum);
      footRing.rotation.x = Math.PI / 2;
      footRing.position.y = 0.28;
      group.add(footRing);

      for (let i = 0; i < 4; i++) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.145, 8), aluminum);
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.y = angle;
        spoke.position.set(Math.cos(angle) * 0.072, 0.28, -Math.sin(angle) * 0.072);
        group.add(spoke);
      }

      // Chrome gas-lift lever under seat
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 8), aluminum);
      lever.rotation.z = Math.PI / 2;
      lever.position.set(0.065, seatH - 0.045, 0);
      group.add(lever);

      const shellMat = item.primaryColor
        ? new THREE.MeshStandardMaterial({ color: item.primaryColor, roughness: 0.42 })
        : accentMat;
      const seat = new THREE.Mesh(makeRoundedBoxGeometry(0.38, 0.052, 0.36, 0.05, 0.012), shellMat);
      seat.position.y = seatH;
      seat.castShadow = true;
      group.add(seat);

      // Twin chrome backrest brackets connecting seat rear to sculpted backrest
      for (const bx of [-0.11, 0.11]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.16, 8), aluminum);
        strut.position.set(bx, seatH + 0.07, -0.155);
        strut.rotation.x = -0.15;
        group.add(strut);
      }

      const back = new THREE.Mesh(makeRoundedBoxGeometry(0.38, 0.21, 0.044, 0.04, 0.01), shellMat);
      back.position.set(0, seatH + 0.135, -0.165);
      back.rotation.x = -0.12;
      back.castShadow = true;
      group.add(back);
      break;
    }

    case 'meeting-chair': {
      addContactShadow(group, 0.5, 0.5);
      const seatH = 0.45;
      const legMat = makeWoodMat('#A67C52');
      const legGeom = new THREE.CylinderGeometry(0.016, 0.012, seatH, 10);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(legGeom, legMat);
          leg.position.set(sx * 0.185, seatH / 2, sz * 0.185);
          leg.rotation.z = -sx * 0.08;
          leg.rotation.x = sz * 0.08;
          leg.castShadow = true;
          group.add(leg);
        }
      }
      // Under-seat structural spider plate
      const spider = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.018, 0.32), darkMetal);
      spider.position.y = seatH - 0.024;
      group.add(spider);

      const seatMat = item.primaryColor
        ? new THREE.MeshStandardMaterial({ color: item.primaryColor, roughness: 0.52 })
        : makeWhiteMatteMat('#ECEAE4');
      const seat = new THREE.Mesh(makeRoundedBoxGeometry(0.45, 0.052, 0.43, 0.055, 0.012), seatMat);
      seat.position.y = seatH;
      seat.castShadow = true;
      group.add(seat);

      // Twin curved structural backrest uprights joining under-seat spider into backrest
      for (const bx of [-0.14, 0.14]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(bx, seatH - 0.02, -0.14),
          new THREE.Vector3(bx, seatH + 0.01, -0.205),
          new THREE.Vector3(bx, seatH + 0.19, -0.225),
        ]);
        const upright = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.011, 8, false), darkMetal);
        group.add(upright);
      }

      const backrest = new THREE.Mesh(makeRoundedBoxGeometry(0.44, 0.33, 0.044, 0.055, 0.01), seatMat);
      backrest.position.set(0, seatH + 0.21, -0.205);
      backrest.rotation.x = -0.11;
      backrest.castShadow = true;
      group.add(backrest);
      break;
    }

    case 'lounge-sofa': {
      addContactShadow(group, w, d);
      const fabricMat = new THREE.MeshStandardMaterial({
        color: item.primaryColor || '#38414F',
        roughness: 0.84,
      });
      const cushionMat = new THREE.MeshStandardMaterial({
        color: item.primaryColor || '#404A5A',
        roughness: 0.86,
      });
      // Slender tapered steel legs
      for (const sx of [-w / 2 + 0.12, w / 2 - 0.12]) {
        for (const sz of [-d / 2 + 0.12, d / 2 - 0.12]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.013, 0.16, 10), darkMetal);
          leg.position.set(sx, 0.08, sz);
          group.add(leg);
        }
      }
      const armW = 0.16;
      const innerW = Math.max(0.4, w - armW * 2 - 0.01);

      // Base deck
      const baseDeck = new THREE.Mesh(
        makeRoundedBoxGeometry(w - 0.02, 0.13, d - 0.02, 0.03, 0.012),
        fabricMat
      );
      baseDeck.position.y = 0.22;
      baseDeck.castShadow = true;
      baseDeck.receiveShadow = true;
      group.add(baseDeck);

      // Two plush rounded seat cushions sitting cleanly between armrests
      const cushionW = innerW / 2 - 0.01;
      for (const side of [-1, 1]) {
        const seatCush = new THREE.Mesh(
          makeRoundedBoxGeometry(cushionW, 0.13, d - 0.2, 0.045, 0.022),
          cushionMat
        );
        seatCush.position.set(side * (innerW / 4 + 0.002), 0.345, 0.07);
        seatCush.castShadow = true;
        seatCush.receiveShadow = true;
        group.add(seatCush);
      }

      // Backrest trimmed cleanly inside armrests (zero coplanar corner Z-fighting!)
      const back = new THREE.Mesh(
        makeRoundedBoxGeometry(innerW, 0.44, 0.17, 0.04, 0.018),
        fabricMat
      );
      back.position.set(0, 0.51, -d / 2 + 0.095);
      back.castShadow = true;
      group.add(back);

      // Left & right rounded armrests
      for (const sx of [-w / 2 + armW / 2, w / 2 - armW / 2]) {
        const arm = new THREE.Mesh(
          makeRoundedBoxGeometry(armW, 0.36, d, 0.04, 0.016),
          fabricMat
        );
        arm.position.set(sx, 0.46, 0);
        arm.castShadow = true;
        group.add(arm);
      }

      // Sculpted accent throw pillow resting cleanly on top of left seat cushion
      const pillow = new THREE.Mesh(
        makeRoundedBoxGeometry(0.32, 0.28, 0.09, 0.06, 0.028),
        accentMat
      );
      pillow.position.set(-innerW * 0.28, 0.54, -d / 2 + 0.26);
      pillow.rotation.set(-0.22, 0.24, 0.12);
      pillow.castShadow = true;
      group.add(pillow);
      break;
    }

    case 'coffee-table': {
      addContactShadow(group, w, d);
      const topMat = item.finish === 'oak' ? makeWoodMat() : makeWhiteMatteMat('#F7F7F5');
      const top = new THREE.Mesh(
        makeRoundedBoxGeometry(w, 0.034, d, 0.03, 0.006),
        topMat
      );
      top.position.y = h - 0.017;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);

      // Slender sled steel frame (legs start at y=0.02 on top of runner — zero coplanar Z-fighting)
      const legH = h - 0.054;
      for (const sx of [-w / 2 + 0.08, w / 2 - 0.08]) {
        const runner = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.02, d - 0.115), darkMetal);
        runner.position.set(sx, 0.01, 0);
        group.add(runner);

        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.024, legH, 0.024), darkMetal);
        leg1.position.set(sx, 0.02 + legH / 2, -d / 2 + 0.07);
        group.add(leg1);
        const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.024, legH, 0.024), darkMetal);
        leg2.position.set(sx, 0.02 + legH / 2, d / 2 - 0.07);
        group.add(leg2);
      }
      break;
    }

    case 'brochure-stand': {
      addContactShadow(group, w, d);
      const base = new THREE.Mesh(makeRoundedBoxGeometry(w, 0.026, d, 0.015, 0.004), aluminum);
      base.position.y = 0.013;
      base.castShadow = true;
      group.add(base);

      // Side frame rails
      const spineX = w / 2 - 0.022;
      for (const sx of [-spineX, spineX]) {
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.018, h - 0.05, 0.026), aluminum);
        spine.position.set(sx, 0.025 + (h - 0.05) / 2, 0);
        spine.rotation.x = 0.05;
        group.add(spine);
      }

      // 4 angled A4 acrylic pockets anchored cleanly into side spines + visible header stripes
      const brochureMat = makeWhiteMatteMat('#FFFFFF');
      const pocketMat = new THREE.MeshStandardMaterial({
        color: '#DDE6EE',
        transparent: true,
        opacity: 0.45,
        roughness: 0.18,
      });
      for (let i = 0; i < 4; i++) {
        const py = 0.32 + i * 0.285;
        const spineZ = (py - h / 2) * Math.sin(0.05);

        // Horizontal crossbar anchoring pocket solidly into both spines
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.036, 0.016, 0.018), aluminum);
        bar.position.set(0, py - 0.06, spineZ + 0.012);
        group.add(bar);

        const pocketGroup = new THREE.Group();
        pocketGroup.position.set(0, py, spineZ + 0.036);
        pocketGroup.rotation.x = -0.24;

        const pocket = new THREE.Mesh(new THREE.BoxGeometry(w - 0.044, 0.23, 0.03), pocketMat);
        pocketGroup.add(pocket);

        const paper = new THREE.Mesh(new THREE.BoxGeometry(w - 0.09, 0.25, 0.012), brochureMat);
        paper.position.set(0, 0.025, 0.002);
        pocketGroup.add(paper);

        // Header stripe attached cleanly on front face of brochure paper
        const headerStripe = new THREE.Mesh(new THREE.BoxGeometry(w - 0.092, 0.052, 0.004), accentMat);
        headerStripe.position.set(0, 0.108, 0.01);
        pocketGroup.add(headerStripe);

        group.add(pocketGroup);
      }
      break;
    }

    case 'planter-box': {
      addContactShadow(group, w, d);
      const potH = h * 0.35;
      const potMat = new THREE.MeshStandardMaterial({
        color: item.primaryColor || '#ECEAE4',
        roughness: 0.68,
      });
      const pot = new THREE.Mesh(
        makeRoundedBoxGeometry(w, potH, d, 0.035, 0.01),
        potMat
      );
      pot.position.y = potH / 2;
      pot.castShadow = true;
      pot.receiveShadow = true;
      group.add(pot);

      // Subtle recessed rim + dark potting soil / river pebbles
      const soil = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.07, 0.025, d - 0.07),
        new THREE.MeshStandardMaterial({ color: '#3B3028', roughness: 0.95 })
      );
      soil.position.y = potH - 0.008;
      group.add(soil);

      // Multi-stem architectural ficus / olive tree (replaces crude broccoli spheres)
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#614B38', roughness: 0.88 });
      const stems: [number, number, number, number, number][] = [
        [0, 0, h * 0.56, 0.04, 0.02],
        [-0.04, 0.03, h * 0.44, -0.18, 0.12],
        [0.045, -0.025, h * 0.48, 0.16, -0.11],
      ];
      for (const [sx, sz, sh, rx, rz] of stems) {
        const stemMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.011, 0.022, sh, 8),
          trunkMat
        );
        stemMesh.position.set(sx, potH + sh * 0.46, sz);
        stemMesh.rotation.set(rx, 0, rz);
        stemMesh.castShadow = true;
        group.add(stemMesh);
      }

      const leafShades = ['#3A6949', '#487C58', '#2F593D', '#588B65', '#427251'];
      const crownR = Math.min(w, d) * 0.56;
      const clusters: [number, number, number, number, number][] = [
        [0, potH + h * 0.56, 0, crownR * 0.52, 0.72],
        [-crownR * 0.38, potH + h * 0.44, crownR * 0.24, crownR * 0.42, 0.68],
        [crownR * 0.4, potH + h * 0.48, -crownR * 0.2, crownR * 0.44, 0.7],
        [-crownR * 0.26, potH + h * 0.52, -crownR * 0.3, crownR * 0.38, 0.74],
        [crownR * 0.24, potH + h * 0.39, crownR * 0.32, crownR * 0.36, 0.66],
        [0.04, potH + h * 0.63, -0.04, crownR * 0.34, 0.76],
        [-crownR * 0.14, potH + h * 0.36, -0.08, crownR * 0.32, 0.65],
        [crownR * 0.16, potH + h * 0.58, crownR * 0.14, crownR * 0.3, 0.72],
      ];
      clusters.forEach(([bx, by, bz, br, sy], idx) => {
        const foliage = new THREE.Mesh(
          new THREE.IcosahedronGeometry(br, 1),
          new THREE.MeshStandardMaterial({
            color: leafShades[idx % leafShades.length],
            roughness: 0.78,
          })
        );
        foliage.scale.set(1.08, sy, 1.02);
        foliage.rotation.set(idx * 0.7, idx * 1.1, idx * 0.4);
        foliage.position.set(bx, by, bz);
        foliage.castShadow = true;
        group.add(foliage);
      });
      break;
    }

    case 'truss-rig': {
      // Precision 4-chord box truss with 4-sided true diagonal lacing, corner junction cubes,
      // spotlight yoke C-clamps, and base plates strictly within w × d envelope
      const trussThick = Math.min(0.22, d * 0.62);
      const halfT = trussThick / 2;

      const makeTrussSegment = (len: number, vertical: boolean) => {
        const seg = new THREE.Group();
        const chordGeom = new THREE.CylinderGeometry(0.013, 0.013, len, 8);
        for (const a of [-halfT, halfT]) {
          for (const b of [-halfT, halfT]) {
            const chord = new THREE.Mesh(chordGeom, aluminum);
            if (vertical) {
              chord.position.set(a, 0, b);
            } else {
              chord.rotation.z = Math.PI / 2;
              chord.position.set(0, a, b);
            }
            chord.castShadow = true;
            seg.add(chord);
          }
        }
        // True 4-sided diagonal lacing calculated from exact stepLen and trussThick
        const steps = Math.max(4, Math.round(len / 0.28));
        const stepLen = len / steps;
        const diagLen = Math.hypot(stepLen, trussThick) * 0.96;
        const braceAngle = Math.atan2(trussThick, stepLen);
        const braceGeom = new THREE.CylinderGeometry(0.0065, 0.0065, diagLen, 6);

        for (let i = 0; i < steps; i++) {
          const offset = -len / 2 + (i + 0.5) * stepLen;
          const sign = i % 2 === 0 ? 1 : -1;

          if (vertical) {
            // Front (+Z) & Back (-Z) faces
            for (const fz of [-halfT, halfT]) {
              const b = new THREE.Mesh(braceGeom, aluminum);
              b.position.set(0, offset, fz);
              b.rotation.z = sign * braceAngle;
              seg.add(b);
            }
            // Left (-X) & Right (+X) faces
            for (const fx of [-halfT, halfT]) {
              const b = new THREE.Mesh(braceGeom, aluminum);
              b.position.set(fx, offset, 0);
              b.rotation.x = sign * braceAngle;
              seg.add(b);
            }
          } else {
            // Front (+Z) & Back (-Z) faces
            for (const fz of [-halfT, halfT]) {
              const b = new THREE.Mesh(braceGeom, aluminum);
              b.position.set(offset, 0, fz);
              b.rotation.z = Math.PI / 2 + sign * braceAngle;
              seg.add(b);
            }
            // Top (+Y) & Bottom (-Y) faces
            for (const fy of [-halfT, halfT]) {
              const b = new THREE.Mesh(braceGeom, aluminum);
              b.position.set(offset, fy, 0);
              b.rotation.z = Math.PI / 2;
              b.rotation.y = sign * braceAngle;
              seg.add(b);
            }
          }
        }
        return seg;
      };

      const plateW = Math.min(0.36, d);
      const legX = w / 2 - plateW / 2;
      const legH = h - trussThick - 0.022;

      const leftLeg = makeTrussSegment(legH, true);
      leftLeg.position.set(-legX, 0.022 + legH / 2, 0);
      group.add(leftLeg);

      const rightLeg = makeTrussSegment(legH, true);
      rightLeg.position.set(legX, 0.022 + legH / 2, 0);
      group.add(rightLeg);

      // Solid aluminum corner junction cubes where legs meet top beam
      for (const cx of [-legX, legX]) {
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(trussThick + 0.03, trussThick + 0.03, trussThick + 0.03),
          aluminum
        );
        cube.position.set(cx, h - halfT, 0);
        cube.castShadow = true;
        group.add(cube);
      }

      const spanLen = Math.max(0.4, legX * 2 - trussThick);
      const topBeam = makeTrussSegment(spanLen, false);
      topBeam.position.set(0, h - halfT, 0);
      group.add(topBeam);

      // Steel base plates strictly within dims.w × dims.d
      for (const sx of [-legX, legX]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, 0.022, plateW), darkMetal);
        plate.position.set(sx, 0.011, 0);
        plate.receiveShadow = true;
        group.add(plate);
      }

      // 4 Exhibition spotlights physically clamped to bottom chord via yoke brackets
      const spots = 4;
      for (let i = 0; i < spots; i++) {
        const sx = -spanLen * 0.36 + (i * spanLen * 0.72) / (spots - 1);
        const chordY = h - trussThick;
        const chordZ = halfT;

        // C-clamp + vertical yoke connecting chord to spotlight can
        const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.036, 0.042), darkMetal);
        clamp.position.set(sx, chordY, chordZ);
        group.add(clamp);

        const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.08, 0.018), darkMetal);
        yoke.position.set(sx, chordY - 0.048, chordZ + 0.01);
        group.add(yoke);

        const canPivot = new THREE.Group();
        canPivot.position.set(sx, chordY - 0.088, chordZ + 0.015);
        canPivot.rotation.x = 0.42;

        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.064, 0.135, 14), darkMetal);
        can.position.y = -0.025;
        canPivot.add(can);

        const lens = new THREE.Mesh(
          new THREE.CircleGeometry(0.054, 14),
          new THREE.MeshBasicMaterial({ color: '#FFF4D4' })
        );
        lens.position.y = -0.094;
        lens.rotation.x = Math.PI / 2;
        canPivot.add(lens);

        group.add(canPivot);
      }
      break;
    }

    default: {
      const fallback = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), whiteMat);
      fallback.position.y = h / 2;
      fallback.castShadow = true;
      fallback.receiveShadow = true;
      group.add(fallback);
    }
  }

  // Ensure every descendant knows its itemId for clean raycast picking
  group.traverse((child) => {
    if (!child.userData.itemId) {
      child.userData.itemId = item.id;
    }
  });

  group.position.set(item.x, item.y, item.z);
  group.rotation.y = (item.rotationY * Math.PI) / 180;
  group.visible = item.visible !== false;

  return group;
}

export function buildBoothShell(ctx: BuildContext): THREE.Group {
  const { config } = ctx;
  const group = new THREE.Group();
  group.name = 'booth-shell';

  const { width, depth, openSides, showShellWalls, shellWallHeight } = config;
  const plinthH = 0.048;

  // Raised exhibition stand floor platform with procedural diffuse + bump maps
  const floorTex = getFloorTexture(config.floorMaterial, config.floorColor, width, depth);
  const floorBump = getFloorBumpTexture(config.floorMaterial, width, depth);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    bumpMap: floorBump,
    bumpScale:
      config.floorMaterial === 'oak-timber'
        ? 0.008
        : config.floorMaterial === 'slate-tile'
          ? 0.01
          : config.floorMaterial === 'light-concrete'
            ? 0.005
            : 0.012,
    roughness:
      config.floorMaterial === 'oak-timber'
        ? 0.52
        : config.floorMaterial === 'slate-tile'
          ? 0.38
          : config.floorMaterial === 'light-concrete'
            ? 0.78
            : 0.9,
    metalness: 0.03,
  });

  const trimMat = makeAluminumMat(config.trimColor || '#C5C9CE');

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(width, plinthH, depth),
    [trimMat, trimMat, floorMat, trimMat, trimMat, trimMat]
  );
  platform.position.set(0, -plinthH / 2, 0);
  platform.receiveShadow = true;
  platform.userData.isFloor = true;
  group.add(platform);

  // Subtle aluminum ramp bevels on ALL open edges (flush, no corner nubs)
  const bevelMat = makeAluminumMat('#B8BEC6');
  const bevelD = 0.042;
  const bevelH = 0.014;
  // Front (+Z) is always open
  const frontBevel = new THREE.Mesh(new THREE.BoxGeometry(width, bevelH, bevelD), bevelMat);
  frontBevel.position.set(0, -plinthH + bevelH / 2, depth / 2 + bevelD / 2);
  group.add(frontBevel);

  // Right (+X) is open when openSides >= 2 (Corner, Peninsula, Island)
  if (openSides >= 2 || !showShellWalls) {
    const rightBevel = new THREE.Mesh(new THREE.BoxGeometry(bevelD, bevelH, depth), bevelMat);
    rightBevel.position.set(width / 2 + bevelD / 2, -plinthH + bevelH / 2, 0);
    group.add(rightBevel);
  }
  // Left (-X) is open when openSides >= 3 (Peninsula, Island)
  if (openSides >= 3 || !showShellWalls) {
    const leftBevel = new THREE.Mesh(new THREE.BoxGeometry(bevelD, bevelH, depth), bevelMat);
    leftBevel.position.set(-width / 2 - bevelD / 2, -plinthH + bevelH / 2, 0);
    group.add(leftBevel);
  }
  // Back (-Z) is open when openSides === 4 (Island)
  if (openSides === 4 || !showShellWalls) {
    const backBevel = new THREE.Mesh(new THREE.BoxGeometry(width, bevelH, bevelD), bevelMat);
    backBevel.position.set(0, -plinthH + bevelH / 2, -depth / 2 - bevelD / 2);
    group.add(backBevel);
  }

  // Shell scheme perimeter walls depending on openSides:
  // 1 = Inline (back + left + right walls)
  // 2 = Corner (back + left walls; front + right open)
  // 3 = Peninsula (back wall only; front + left + right open)
  // 4 = Island (0 perimeter walls)
  if (showShellWalls && openSides < 4) {
    const wallT = 0.08;
    const totalWallH = shellWallHeight + plinthH; // grounded cleanly on hallFloor (y = -0.048)
    const wallMat = new THREE.MeshStandardMaterial({
      color: config.wallColor || '#F4F3EF',
      roughness: 0.72,
      metalness: 0.02,
    });
    const postMat = makeAluminumMat('#CFD4DA');

    const buildShellWall = (
      side: ShellWallSide,
      wallLen: number,
      px: number,
      pz: number,
      rotY: number
    ) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(px, 0, pz);
      wGroup.rotation.y = rotY;

      const core = new THREE.Mesh(
        new THREE.BoxGeometry(wallLen, totalWallH, wallT),
        wallMat
      );
      core.position.set(0, shellWallHeight - totalWallH / 2, 0);
      core.castShadow = true;
      core.receiveShadow = true;
      wGroup.add(core);

      // Modular 1m aluminum vertical mullions grounded to hallFloor
      const panels = Math.max(1, Math.round(wallLen));
      for (let i = 0; i <= panels; i++) {
        const mx = -wallLen / 2 + (i * wallLen) / panels;
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.042, totalWallH + 0.015, wallT + 0.014),
          postMat
        );
        post.position.set(mx, shellWallHeight - totalWallH / 2 + 0.005, 0);
        post.castShadow = true;
        wGroup.add(post);
      }

      // Top & bottom aluminum channels
      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(wallLen + 0.02, 0.044, wallT + 0.016),
        postMat
      );
      topRail.position.set(0, shellWallHeight, 0);
      wGroup.add(topRail);

      const bottomRail = new THREE.Mesh(
        new THREE.BoxGeometry(wallLen + 0.02, 0.036, wallT + 0.016),
        postMat
      );
      bottomRail.position.set(0, -plinthH + 0.018, 0);
      wGroup.add(bottomRail);

      // Brandable interior graphic surface on the shell wall
      const art = config.shellArtwork[side];
      if (art?.assetId) {
        const mat = makeGraphicMaterial(art, 'hero', wallLen / shellWallHeight, ctx, art.emissive);
        const graphicPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(wallLen - 0.06, shellWallHeight - 0.08),
          mat
        );
        graphicPlane.position.set(0, shellWallHeight / 2, wallT / 2 + 0.008);
        graphicPlane.receiveShadow = true;
        graphicPlane.userData.shellWall = side;
        graphicPlane.userData.brandable = true;
        wGroup.add(graphicPlane);
      } else {
        // Clickable subtle inner overlay so Click-to-Assign works on blank shell walls too
        const hitPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(wallLen - 0.06, shellWallHeight - 0.08),
          new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        hitPlane.position.set(0, shellWallHeight / 2, wallT / 2 + 0.008);
        hitPlane.userData.shellWall = side;
        hitPlane.userData.brandable = true;
        wGroup.add(hitPlane);
      }

      group.add(wGroup);
    };

    // Back wall (-Z)
    buildShellWall('back', width, 0, -depth / 2 - wallT / 2, 0);

    // Left wall (-X) for Inline (1) & Corner (2) + solid corner infill post
    if (openSides <= 2) {
      buildShellWall('left', depth, -width / 2 - wallT / 2, 0, Math.PI / 2);
      const cornerL = new THREE.Mesh(
        new THREE.BoxGeometry(wallT + 0.016, totalWallH + 0.02, wallT + 0.016),
        postMat
      );
      cornerL.position.set(
        -width / 2 - wallT / 2,
        shellWallHeight - totalWallH / 2 + 0.01,
        -depth / 2 - wallT / 2
      );
      cornerL.castShadow = true;
      group.add(cornerL);
    }

    // Right wall (+X) for Inline (1) + solid corner infill post
    if (openSides === 1) {
      buildShellWall('right', depth, width / 2 + wallT / 2, 0, -Math.PI / 2);
      const cornerR = new THREE.Mesh(
        new THREE.BoxGeometry(wallT + 0.016, totalWallH + 0.02, wallT + 0.016),
        postMat
      );
      cornerR.position.set(
        width / 2 + wallT / 2,
        shellWallHeight - totalWallH / 2 + 0.01,
        -depth / 2 - wallT / 2
      );
      cornerR.castShadow = true;
      group.add(cornerR);
    }
  }

  return group;
}

/**
 * Refined matte-ceramic architectural scale figures (Foster+Partners / Apple Retail style):
 * opaque (zero X-ray ghost artifacts), continuous anatomical silhouette (feet, tapered legs,
 * pelvis, contoured LatheGeometry torso, shoulder yoke, connected neck, ovoid head, natural
 * articulated arms), grounded squarely on hallFloor (y = -0.048) with smart aisle placement.
 */
export function buildScaleFigures(config: StandConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = 'scale-figures';

  const hallFloorY = -0.048;

  const buildPerson = (
    heightM: number,
    bodyHex: string,
    accentHex: string,
    x: number,
    z: number,
    rotY: number,
    pose: 'relaxed' | 'observing'
  ) => {
    const p = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: bodyHex,
      roughness: 0.74,
      metalness: 0.04,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: accentHex,
      roughness: 0.65,
      metalness: 0.06,
    });

    const scale = heightM / 1.74;

    // Grounded soft contact shadow on hall floor
    addContactShadow(p, 0.56, 0.44, 0.003);

    // 1. Feet / shoes resting cleanly at y = 0
    for (const [side, zOff, yaw] of [
      [-1, 0.02, 0.08],
      [1, -0.02, -0.1],
    ] as const) {
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.12, 6, 12), shoeMat);
      foot.rotation.x = Math.PI / 2;
      foot.rotation.z = yaw;
      foot.scale.set(1.05, 1, 0.72);
      foot.position.set(side * 0.095, 0.026, 0.04 + zOff);
      foot.castShadow = true;
      p.add(foot);
    }

    // 2. Sculpted tapered legs (calves + knees + thighs)
    for (const [side, zOff] of [
      [-1, 0.02],
      [1, -0.02],
    ] as const) {
      const lx = side * 0.092;
      const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.038, 0.41, 14), mat);
      calf.position.set(lx, 0.235, zOff * 0.5);
      calf.castShadow = true;
      p.add(calf);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), mat);
      knee.position.set(lx, 0.44, zOff * 0.2);
      p.add(knee);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.055, 0.42, 14), mat);
      thigh.position.set(lx, 0.65, 0);
      thigh.castShadow = true;
      p.add(thigh);
    }

    // 3. Sculpted pelvis & contoured torso via LatheGeometry (seamless waist-to-chest taper)
    const torsoPts = [
      new THREE.Vector2(0.02, 0.79),
      new THREE.Vector2(0.155, 0.84), // hips
      new THREE.Vector2(0.145, 0.94),
      new THREE.Vector2(0.132, 1.04), // waist
      new THREE.Vector2(0.158, 1.18), // ribcage
      new THREE.Vector2(0.182, 1.32), // chest / upper back
      new THREE.Vector2(0.155, 1.38), // collar slope
      new THREE.Vector2(0.058, 1.42), // base of neck
      new THREE.Vector2(0.01, 1.425),
    ];
    const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoPts, 24), mat);
    torso.scale.set(1.06, 1, 0.68);
    torso.castShadow = true;
    torso.receiveShadow = true;
    p.add(torso);

    // 4. Rounded shoulder yoke bridging seamlessly into both arms
    const yoke = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.29, 8, 14), mat);
    yoke.rotation.z = Math.PI / 2;
    yoke.scale.set(1, 1, 0.85);
    yoke.position.set(0, 1.345, 0);
    yoke.castShadow = true;
    p.add(yoke);

    // 5. Connected neck bridging torso cleanly into ovoid sculpted head (zero air gap!)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.054, 0.11, 14), mat);
    neck.position.set(0, 1.455, 0.006);
    neck.castShadow = true;
    p.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.102, 20, 18), mat);
    head.scale.set(0.86, 1.1, 0.94);
    head.position.set(0, 1.59, 0.012);
    head.castShadow = true;
    p.add(head);

    // 6. Articulated arms (upper arm + elbow + forearm + hand) rooted cleanly in shoulder yoke
    const addArm = (side: -1 | 1, upperRotX: number, upperRotZ: number, elbowBendX: number) => {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(side * 0.195, 1.34, 0);
      shoulderPivot.rotation.set(upperRotX, 0, upperRotZ);

      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.044, 0.22, 6, 12), mat);
      upper.position.y = -0.13;
      upper.castShadow = true;
      shoulderPivot.add(upper);

      const elbowPivot = new THREE.Group();
      elbowPivot.position.y = -0.27;
      elbowPivot.rotation.x = elbowBendX;

      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.2, 6, 12), mat);
      forearm.position.y = -0.12;
      forearm.castShadow = true;
      elbowPivot.add(forearm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), mat);
      hand.scale.set(0.85, 1.15, 0.65);
      hand.position.y = -0.255;
      elbowPivot.add(hand);

      shoulderPivot.add(elbowPivot);
      p.add(shoulderPivot);
    };

    if (pose === 'observing') {
      addArm(-1, 0.06, 0.09, -0.22);
      addArm(1, -0.18, -0.1, -0.62); // relaxed observing gesture
    } else {
      addArm(-1, 0.04, 0.08, -0.18);
      addArm(1, -0.05, -0.08, -0.22);
    }

    p.scale.setScalar(scale);
    p.position.set(x, hallFloorY, z);
    p.rotation.y = rotY;
    return p;
  };

  // Smart aisle placement: never trap a visitor behind a solid right shell wall on Inline booths
  if (config.openSides === 1) {
    // Inline booth: only front (+Z) is open -> place both visitors naturally in front aisle
    group.add(
      buildPerson(
        1.76,
        '#CFD5DF',
        '#8E99A8',
        config.width * 0.34,
        config.depth / 2 + 0.92,
        Math.PI * 0.88,
        'observing'
      )
    );
    group.add(
      buildPerson(
        1.66,
        '#B6BFC9',
        '#7C8796',
        -config.width * 0.36,
        config.depth / 2 + 1.05,
        -Math.PI * 0.86,
        'relaxed'
      )
    );
  } else {
    // Corner, Peninsula, Island: right (+X) and front (+Z) aisles are open
    group.add(
      buildPerson(
        1.76,
        '#CFD5DF',
        '#8E99A8',
        config.width / 2 + 0.62,
        config.depth * 0.18,
        -Math.PI * 0.62,
        'observing'
      )
    );
    group.add(
      buildPerson(
        1.66,
        '#B6BFC9',
        '#7C8796',
        -config.width * 0.42,
        config.depth / 2 + 0.96,
        Math.PI * 0.92,
        'relaxed'
      )
    );
  }

  return group;
}
