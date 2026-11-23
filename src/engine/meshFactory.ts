import * as THREE from 'three';
import type {
  BrandAsset,
  ShellWallSide,
  StandConfig,
  StandItem,
  SurfaceArtwork,
  SurfaceZoneDef,
} from '../types/stand';
import { getFloorTexture, getSurfaceTexture } from './textureComposer';

export interface BuildContext {
  config: StandConfig;
  assetsMap: Map<string, BrandAsset>;
  onTextureReady: () => void;
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
    const t = (x / (width / 2)); // -1 to 1
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
      const frameDepth = Math.max(0.24, d * 0.8);
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

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, d), darkMetal);
        foot.position.set(x, 0.0125, 0);
        group.add(foot);
      }

      // Scissor X cross-braces on back
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const cx = -w / 2 + 0.04 + (c + 0.5) * cellW;
          const cy = 0.08 + (r + 0.5) * cellH;
          const diagLen = Math.hypot(cellW, cellH);
          const angle = Math.atan2(cellW, cellH);

          const s1 = new THREE.Mesh(strutGeom, aluminum);
          s1.scale.set(1, diagLen, 1);
          s1.position.set(cx, cy, -frameDepth / 2);
          s1.rotation.z = angle;
          group.add(s1);

          const s2 = new THREE.Mesh(strutGeom, aluminum);
          s2.scale.set(1, diagLen, 1);
          s2.position.set(cx, cy, -frameDepth / 2);
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

      // Twin top gooseneck arm spotlights
      const numLights = w >= 2.4 ? 2 : 1;
      for (let i = 0; i < numLights; i++) {
        const lx = numLights === 1 ? 0 : (i === 0 ? -w * 0.28 : w * 0.28);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.34), darkMetal);
        arm.position.set(lx, h + 0.04, frameDepth / 2 + 0.14);
        group.add(arm);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.09, 12), darkMetal);
        head.position.set(lx, h + 0.01, frameDepth / 2 + 0.3);
        head.rotation.x = 0.55;
        group.add(head);
        const bulb = new THREE.Mesh(
          new THREE.CircleGeometry(0.042, 12),
          new THREE.MeshBasicMaterial({ color: '#FFF7E0' })
        );
        bulb.position.set(lx, h - 0.025, frameDepth / 2 + 0.27);
        bulb.rotation.x = Math.PI / 2 + 0.55;
        group.add(bulb);
      }
      break;
    }

    case 'popup-wall-curved': {
      const curveDepth = Math.min(0.45, d * 0.68);
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
      frontMesh.position.set(0, h / 2 + 0.01, 0.03);
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
      backMesh.position.set(0, h / 2 + 0.01, 0.018);
      backMesh.castShadow = true;
      group.add(backMesh);

      // Rear curved scissor struts & feet
      const posts = 5;
      for (let i = 0; i < posts; i++) {
        const t = -1 + (2 * i) / (posts - 1);
        const px = t * (w / 2 - 0.08);
        const pz = curveDepth * (t * t - 0.5) - 0.14;
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.013, h - 0.04, 8),
          aluminum
        );
        post.position.set(px, h / 2, pz);
        group.add(post);

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.34), darkMetal);
        foot.position.set(px, 0.0125, pz + 0.06);
        group.add(foot);
      }

      // Twin top spotlights
      for (const side of [-0.26, 0.26]) {
        const lx = side * w;
        const t = lx / (w / 2);
        const lz = curveDepth * (t * t - 0.5);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.34), darkMetal);
        arm.position.set(lx, h + 0.03, lz + 0.18);
        group.add(arm);
        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.08, 12), darkMetal);
        head.position.set(lx, h + 0.0, lz + 0.34);
        head.rotation.x = 0.6;
        group.add(head);
      }
      break;
    }

    case 'seg-lightbox': {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), aluminum);
      frame.position.set(0, h / 2 + 0.02, 0);
      frame.castShadow = true;
      frame.receiveShadow = true;
      group.add(frame);

      // Stabilizing steel feet
      for (const sx of [-w * 0.38, w * 0.38]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.42), darkMetal);
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
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, h - 0.03), frontMat);
      front.position.set(0, h / 2 + 0.02, d / 2 + 0.004);
      tagInteractive(front, item.id, 'front', 'Illuminated Front Fabric');
      group.add(front);

      // Clean white rear diffuser
      const rear = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.04, h - 0.04),
        new THREE.MeshStandardMaterial({ color: '#EAECEF', roughness: 0.7 })
      );
      rear.position.set(0, h / 2 + 0.02, -d / 2 - 0.003);
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
      // Brushed aluminum cassette base
      const cassette = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.09, 0.16), aluminum);
      cassette.position.set(0, 0.045, 0);
      cassette.castShadow = true;
      group.add(cassette);

      // Stabilizing swivel feet
      for (const fx of [-w * 0.34, w * 0.34]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.018, 0.34), aluminum);
        foot.position.set(fx, 0.009, 0.02);
        group.add(foot);
      }

      // Rear telescopic pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, h - 0.06, 8), aluminum);
      pole.position.set(0, h / 2, -0.05);
      group.add(pole);

      // Top clamp rail
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.032, 0.03), aluminum);
      topRail.position.set(0, h - 0.016, 0.005);
      group.add(topRail);

      // Vertical graphic canvas
      const bannerH = h - 0.12;
      const frontMat = makeGraphicMaterial(
        item.artwork.front,
        'logo',
        w / bannerH,
        ctx,
        item.backlit,
        true
      );
      const canvasMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, bannerH), frontMat);
      canvasMesh.position.set(0, 0.09 + bannerH / 2, 0.01);
      canvasMesh.castShadow = true;
      canvasMesh.receiveShadow = true;
      tagInteractive(canvasMesh, item.id, 'front', 'Vertical Banner Graphic');
      group.add(canvasMesh);
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
        true
      );
      if (ringMat.map) {
        const tiled = ringMat.map.clone();
        tiled.wrapS = THREE.RepeatWrapping;
        tiled.wrapT = THREE.ClampToEdgeWrapping;
        tiled.repeat.set(3, 1);
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

      // Upper & lower structural rim rings
      for (const ry of [0.02, h - 0.02]) {
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(radius, 0.025, 10, 48),
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
        wire.position.set(Math.cos(angle) * radius, h + 1.25, Math.sin(angle) * radius);
        group.add(wire);
      }
      break;
    }

    case 'brand-totem': {
      // Base plate
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.04, d + 0.14), darkMetal);
      base.position.set(0, 0.02, 0);
      base.castShadow = true;
      group.add(base);

      // Aluminum carcass
      const carcass = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.04, d * 0.55), aluminum);
      carcass.position.set(0, h / 2 + 0.02, 0);
      carcass.castShadow = true;
      group.add(carcass);

      // Glowing front & back faces
      const faceMat = makeGraphicMaterial(
        item.artwork.front,
        'logo',
        w / h,
        ctx,
        item.backlit !== false
      );
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.1), faceMat);
      front.position.set(0, h / 2 + 0.02, (d * 0.55) / 2 + 0.004);
      tagInteractive(front, item.id, 'front', 'Illuminated Front Face');
      group.add(front);

      const back = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, h - 0.1), faceMat);
      back.position.set(0, h / 2 + 0.02, -(d * 0.55) / 2 - 0.004);
      back.rotation.y = Math.PI;
      tagInteractive(back, item.id, 'front', 'Illuminated Front Face');
      group.add(back);
      break;
    }

    case 'tv-stand': {
      // Heavy steel base
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.03, 0.54), darkMetal);
      base.position.set(0, 0.015, 0);
      base.castShadow = true;
      group.add(base);

      // Twin chrome uprights
      for (const sx of [-0.12, 0.12]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.55, 12), aluminum);
        col.position.set(sx, 0.79, -0.04);
        col.castShadow = true;
        group.add(col);
      }

      // Slim media shelf
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.025, 0.3), darkMetal);
      shelf.position.set(0, 0.78, 0.08);
      group.add(shelf);

      // 55" TV bezel
      const screenW = 1.24;
      const screenH = 0.72;
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(screenW + 0.05, screenH + 0.05, 0.055), darkMetal);
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
      screen.position.set(0, 1.58, 0.04);
      tagInteractive(screen, item.id, 'screen', '4K Display Content');
      group.add(screen);
      break;
    }

    case 'led-video-wall': {
      const screenH = h - 0.32;
      // Floor support truss feet
      for (const sx of [-w * 0.36, 0, w * 0.36]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, d + 0.24), darkMetal);
        foot.position.set(sx, 0.02, -0.05);
        group.add(foot);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), darkMetal);
        leg.position.set(sx, 0.18, -0.04);
        group.add(leg);
      }

      // LED cabinet housing
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(w, screenH, 0.14), darkMetal);
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
      screen.position.set(0, 0.32 + screenH / 2, 0.074);
      tagInteractive(screen, item.id, 'screen', 'LED Video Canvas');
      group.add(screen);
      break;
    }

    case 'feather-flag': {
      // Weighted cross-base
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.025, 0.07), darkMetal);
      b1.position.y = 0.0125;
      group.add(b1);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.55), darkMetal);
      b2.position.y = 0.0125;
      group.add(b2);

      // Mast pole
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, h, 8), darkMetal);
      mast.position.set(-w * 0.36, h / 2, 0);
      mast.castShadow = true;
      group.add(mast);

      // Flag fabric shape (tapered rounded feather banner)
      const flagH = h * 0.78;
      const flagW = w * 0.85;
      const flagMat = makeGraphicMaterial(
        item.artwork.front,
        'logo',
        flagW / flagH,
        ctx,
        false,
        true
      );
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(flagW, flagH), flagMat);
      flag.position.set(0.05, h - flagH / 2 - 0.08, 0);
      flag.castShadow = true;
      tagInteractive(flag, item.id, 'front', 'Flag Fabric Print');
      group.add(flag);
      break;
    }

    case 'reception-desk': {
      // Recessed dark toe-kick plinth
      const kick = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.09, d - 0.12), darkMetal);
      kick.position.set(0, 0.045, 0);
      group.add(kick);

      // Main cabinet body
      const bodyH = h - 0.14;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, bodyH, d - 0.08), whiteMat);
      body.position.set(0, 0.09 + bodyH / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Overhanging sleek countertop
      const topMat =
        item.finish === 'oak'
          ? makeWoodMat()
          : new THREE.MeshStandardMaterial({
              color: '#FFFFFF',
              roughness: 0.22,
              metalness: 0.04,
            });
      const counterTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.055, d + 0.05), topMat);
      counterTop.position.set(0, h - 0.028, 0.01);
      counterTop.castShadow = true;
      counterTop.receiveShadow = true;
      group.add(counterTop);

      // Accent LED under-counter reveal strip
      const ledStrip = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.02, 0.018, 0.02),
        new THREE.MeshBasicMaterial({ color: accentHex })
      );
      ledStrip.position.set(0, h - 0.064, d / 2 - 0.032);
      group.add(ledStrip);

      // Front UV-mapped branded wrap panel
      const frontMat = makeGraphicMaterial(
        item.artwork.front,
        'logo',
        w / bodyH,
        ctx,
        item.backlit
      );
      const frontPanel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, bodyH - 0.04), frontMat);
      frontPanel.position.set(0, 0.09 + bodyH / 2, (d - 0.08) / 2 + 0.005);
      tagInteractive(frontPanel, item.id, 'front', 'Front Counter Wrap');
      group.add(frontPanel);
      break;
    }

    case 'quickfold-counter': {
      // Portable oval-top pop-up promo counter
      const topMat = item.finish === 'oak' ? makeWoodMat() : makeWhiteMatteMat('#FFFFFF');
      const base = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.035, 28), darkMetal);
      base.scale.set(1, 1, d / w);
      base.position.y = 0.0175;
      group.add(base);

      const bodyH = h - 0.08;
      const bodyCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(w / 2 - 0.02, w / 2 - 0.02, bodyH, 32),
        primaryMat
      );
      bodyCyl.scale.set(1, 1, (d - 0.04) / w);
      bodyCyl.position.y = 0.035 + bodyH / 2;
      bodyCyl.castShadow = true;
      bodyCyl.receiveShadow = true;
      group.add(bodyCyl);

      // Curved front graphic wrap (front 180 degrees)
      const wrapMat = makeGraphicMaterial(item.artwork.front, 'logo', (w * 1.4) / bodyH, ctx);
      const wrap = new THREE.Mesh(
        new THREE.CylinderGeometry(
          w / 2 - 0.014,
          w / 2 - 0.014,
          bodyH - 0.02,
          28,
          1,
          true,
          -Math.PI / 2,
          Math.PI
        ),
        wrapMat
      );
      wrap.scale.set(1, 1, (d - 0.03) / w);
      wrap.position.y = 0.035 + bodyH / 2;
      tagInteractive(wrap, item.id, 'front', 'Curved Front Wrap');
      group.add(wrap);

      const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 + 0.03, w / 2 + 0.03, 0.045, 32), topMat);
      top.scale.set(1, 1, (d + 0.05) / w);
      top.position.y = h - 0.0225;
      top.castShadow = true;
      group.add(top);
      break;
    }

    case 'demo-kiosk': {
      // Base plate
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), darkMetal);
      base.position.y = 0.0175;
      group.add(base);

      // Pedestal column
      const bodyH = h - 0.14;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, bodyH, d * 0.72), whiteMat);
      body.position.set(0, 0.035 + bodyH / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      // Branded front apron
      const frontMat = makeGraphicMaterial(item.artwork.front, 'logo', (w * 0.8) / bodyH, ctx);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, bodyH - 0.08), frontMat);
      front.position.set(0, 0.035 + bodyH / 2, (d * 0.72) / 2 + 0.005);
      tagInteractive(front, item.id, 'front', 'Kiosk Front Panel');
      group.add(front);

      // Angled lectern top
      const lectern = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d * 0.92), whiteMat);
      lectern.position.set(0, h - 0.09, 0.01);
      lectern.rotation.x = 0.12;
      lectern.castShadow = true;
      group.add(lectern);

      // Sleek laptop / interactive tablet prop
      const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.014, 0.24), aluminum);
      laptopBase.position.set(0, h - 0.065, 0.02);
      laptopBase.rotation.x = 0.12;
      group.add(laptopBase);

      const laptopScreen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.23, 0.012), darkMetal);
      laptopScreen.position.set(0, h + 0.035, -0.095);
      laptopScreen.rotation.x = -0.22;
      group.add(laptopScreen);

      const screenGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.33, 0.2),
        new THREE.MeshBasicMaterial({ color: '#38BDF8' })
      );
      screenGlow.position.set(0, h + 0.035, -0.087);
      screenGlow.rotation.x = -0.22;
      group.add(screenGlow);
      break;
    }

    case 'display-plinth': {
      const plinthH = h * 0.72;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, plinthH, d), whiteMat);
      body.position.y = plinthH / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const frontMat = makeGraphicMaterial(item.artwork.front, 'logo', w / plinthH, ctx);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.03, plinthH - 0.04), frontMat);
      front.position.set(0, plinthH / 2, d / 2 + 0.004);
      tagInteractive(front, item.id, 'front', 'Plinth Front Face');
      group.add(front);

      // Illuminated LED top plate
      const glowPlate = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.04, 0.02, d - 0.04),
        new THREE.MeshBasicMaterial({ color: '#FFFDF7' })
      );
      glowPlate.position.y = plinthH + 0.01;
      group.add(glowPlate);

      // Clear acrylic vitrine showcase hood
      const hoodH = h - plinthH;
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: '#E6F4FA',
        transparent: true,
        opacity: 0.28,
        roughness: 0.08,
        metalness: 0.05,
        transmission: 0.4,
      });
      const hood = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, hoodH, d - 0.02), glassMat);
      hood.position.y = plinthH + hoodH / 2;
      group.add(hood);

      // Stylized demo product inside vitrine
      const demoArtifact = new THREE.Mesh(
        new THREE.OctahedronGeometry(Math.min(w, d) * 0.22, 0),
        accentMat
      );
      demoArtifact.position.y = plinthH + hoodH * 0.42;
      demoArtifact.castShadow = true;
      group.add(demoArtifact);
      break;
    }

    case 'bistro-table': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.025, 24), aluminum);
      base.position.y = 0.0125;
      base.castShadow = true;
      group.add(base);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, h - 0.06, 16), aluminum);
      stem.position.y = (h - 0.06) / 2 + 0.02;
      stem.castShadow = true;
      group.add(stem);

      const topMat = item.finish === 'oak' ? makeWoodMat() : makeWhiteMatteMat('#FFFFFF');
      const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.036, 32), topMat);
      top.position.y = h - 0.018;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);
      break;
    }

    case 'meeting-table': {
      const topMat = item.finish === 'oak' ? makeWoodMat() : makeWhiteMatteMat('#FBFBF9');
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.042, d), topMat);
      top.position.y = h - 0.021;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);

      // 4 angled architectural legs
      const legGeom = new THREE.CylinderGeometry(0.022, 0.018, h - 0.04, 10);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(legGeom, darkMetal);
          leg.position.set(sx * (w / 2 - 0.12), (h - 0.04) / 2, sz * (d / 2 - 0.1));
          leg.rotation.z = -sx * 0.07;
          leg.rotation.x = sz * 0.06;
          leg.castShadow = true;
          group.add(leg);
        }
      }
      break;
    }

    case 'bar-stool': {
      const seatH = h * 0.74;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.022, 20), aluminum);
      base.position.y = 0.011;
      group.add(base);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, seatH, 12), aluminum);
      stem.position.y = seatH / 2;
      stem.castShadow = true;
      group.add(stem);

      const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.01, 8, 24), aluminum);
      footRing.rotation.x = Math.PI / 2;
      footRing.position.y = 0.28;
      group.add(footRing);

      const shellMat = item.primaryColor
        ? new THREE.MeshStandardMaterial({ color: item.primaryColor, roughness: 0.42 })
        : accentMat;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.055, 0.38), shellMat);
      seat.position.y = seatH;
      seat.castShadow = true;
      group.add(seat);

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.048), shellMat);
      back.position.set(0, seatH + 0.12, -0.17);
      back.rotation.x = -0.12;
      back.castShadow = true;
      group.add(back);
      break;
    }

    case 'meeting-chair': {
      const seatH = 0.45;
      const legMat = makeWoodMat('#A67C52');
      const legGeom = new THREE.CylinderGeometry(0.016, 0.013, seatH, 8);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(legGeom, legMat);
          leg.position.set(sx * 0.19, seatH / 2, sz * 0.19);
          leg.rotation.z = -sx * 0.08;
          leg.rotation.x = sz * 0.08;
          leg.castShadow = true;
          group.add(leg);
        }
      }
      const seatMat = item.primaryColor
        ? new THREE.MeshStandardMaterial({ color: item.primaryColor, roughness: 0.55 })
        : makeWhiteMatteMat('#ECEAE4');
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.44), seatMat);
      seat.position.y = seatH;
      seat.castShadow = true;
      group.add(seat);

      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.045), seatMat);
      backrest.position.set(0, seatH + 0.2, -0.2);
      backrest.rotation.x = -0.1;
      backrest.castShadow = true;
      group.add(backrest);
      break;
    }

    case 'lounge-sofa': {
      const fabricMat = new THREE.MeshStandardMaterial({
        color: item.primaryColor || '#38414F',
        roughness: 0.84,
      });
      // Slender steel legs
      for (const sx of [-w / 2 + 0.12, w / 2 - 0.12]) {
        for (const sz of [-d / 2 + 0.12, d / 2 - 0.12]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.16, 8), darkMetal);
          leg.position.set(sx, 0.08, sz);
          group.add(leg);
        }
      }
      // Base frame + seat cushion
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), fabricMat);
      base.position.y = 0.28;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      // Backrest
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.38, 0.18), fabricMat);
      back.position.set(0, 0.57, -d / 2 + 0.09);
      back.castShadow = true;
      group.add(back);

      // Left & right armrests
      for (const sx of [-w / 2 + 0.09, w / 2 - 0.09]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, d), fabricMat);
        arm.position.set(sx, 0.5, 0);
        arm.castShadow = true;
        group.add(arm);
      }

      // Accent throw pillow
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.11), accentMat);
      pillow.position.set(-w * 0.26, 0.52, -0.14);
      pillow.rotation.set(-0.2, 0.25, 0.15);
      group.add(pillow);
      break;
    }

    case 'coffee-table': {
      const topMat = item.finish === 'oak' ? makeWoodMat() : makeWhiteMatteMat('#F7F7F5');
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), topMat);
      top.position.y = h - 0.0175;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);

      // Slender hairpin/sled steel frame
      for (const sx of [-w / 2 + 0.08, w / 2 - 0.08]) {
        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.025, h - 0.03, 0.025), darkMetal);
        leg1.position.set(sx, (h - 0.03) / 2, -d / 2 + 0.07);
        group.add(leg1);
        const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.025, h - 0.03, 0.025), darkMetal);
        leg2.position.set(sx, (h - 0.03) / 2, d / 2 - 0.07);
        group.add(leg2);
        const runner = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, d - 0.14), darkMetal);
        runner.position.set(sx, 0.01, 0);
        group.add(runner);
      }
      break;
    }

    case 'brochure-stand': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.028, d), aluminum);
      base.position.y = 0.014;
      base.castShadow = true;
      group.add(base);

      // Zig-zag side frame rails
      for (const sx of [-w / 2 + 0.02, w / 2 - 0.02]) {
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.018, h - 0.06, 0.028), aluminum);
        spine.position.set(sx, h / 2, 0);
        spine.rotation.x = 0.05;
        group.add(spine);
      }

      // 4 angled A4 acrylic pockets + white brochure stacks
      const brochureMat = makeWhiteMatteMat('#FFFFFF');
      for (let i = 0; i < 4; i++) {
        const py = 0.32 + i * 0.29;
        const pocket = new THREE.Mesh(
          new THREE.BoxGeometry(w - 0.06, 0.24, 0.035),
          new THREE.MeshStandardMaterial({
            color: '#DDE6EE',
            transparent: true,
            opacity: 0.55,
            roughness: 0.2,
          })
        );
        pocket.position.set(0, py, 0.05);
        pocket.rotation.x = -0.25;
        group.add(pocket);

        const paper = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.26, 0.012), brochureMat);
        paper.position.set(0, py + 0.03, 0.04);
        paper.rotation.x = -0.25;
        group.add(paper);

        const headerStripe = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.05, 0.014), accentMat);
        headerStripe.position.set(0, py + 0.12, 0.015);
        headerStripe.rotation.x = -0.25;
        group.add(headerStripe);
      }
      break;
    }

    case 'planter-box': {
      const potH = h * 0.36;
      const potMat = new THREE.MeshStandardMaterial({
        color: item.primaryColor || '#E8E6E1',
        roughness: 0.72,
      });
      const pot = new THREE.Mesh(new THREE.BoxGeometry(w, potH, d), potMat);
      pot.position.y = potH / 2;
      pot.castShadow = true;
      pot.receiveShadow = true;
      group.add(pot);

      const soil = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.06, 0.03, d - 0.06),
        new THREE.MeshStandardMaterial({ color: '#3A2E26', roughness: 0.95 })
      );
      soil.position.y = potH - 0.01;
      group.add(soil);

      // Trunk & architectural sculpted foliage clusters
      const trunkMat = new THREE.MeshStandardMaterial({ color: '#5C4634', roughness: 0.9 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.035, h * 0.45, 8), trunkMat);
      trunk.position.y = potH + h * 0.2;
      trunk.castShadow = true;
      group.add(trunk);

      const leafShades = ['#3B6E4C', '#4B825B', '#2F5C3F', '#568F64'];
      const blobs: [number, number, number, number][] = [
        [0, potH + h * 0.46, 0, w * 0.44],
        [-w * 0.22, potH + h * 0.36, w * 0.12, w * 0.32],
        [w * 0.22, potH + h * 0.38, -w * 0.1, w * 0.34],
        [0.05, potH + h * 0.56, -0.06, w * 0.28],
        [-0.08, potH + h * 0.32, -0.18, w * 0.26],
      ];
      blobs.forEach(([bx, by, bz, br], idx) => {
        const foliage = new THREE.Mesh(
          new THREE.DodecahedronGeometry(br, 1),
          new THREE.MeshStandardMaterial({
            color: leafShades[idx % leafShades.length],
            roughness: 0.76,
          })
        );
        foliage.position.set(bx, by, bz);
        foliage.castShadow = true;
        group.add(foliage);
      });
      break;
    }

    case 'truss-rig': {
      // Aluminum goal-post box truss with 4 directional exhibition spotlights
      const trussThick = 0.22;
      const makeTrussSegment = (len: number, vertical: boolean) => {
        const seg = new THREE.Group();
        const r = trussThick / 2;
        const chordGeom = new THREE.CylinderGeometry(0.014, 0.014, len, 6);
        for (const a of [-r, r]) {
          for (const b of [-r, r]) {
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
        // Cross braces
        const steps = Math.max(4, Math.floor(len / 0.35));
        const stepLen = len / steps;
        const braceGeom = new THREE.CylinderGeometry(0.008, 0.008, trussThick * 1.35, 5);
        for (let i = 0; i < steps; i++) {
          const offset = -len / 2 + (i + 0.5) * stepLen;
          const b1 = new THREE.Mesh(braceGeom, aluminum);
          if (vertical) {
            b1.position.set(0, offset, r);
            b1.rotation.z = i % 2 === 0 ? 0.78 : -0.78;
          } else {
            b1.position.set(offset, 0, r);
            b1.rotation.z = i % 2 === 0 ? 0.78 : -0.78;
          }
          seg.add(b1);
        }
        return seg;
      };

      const leftLeg = makeTrussSegment(h - trussThick / 2, true);
      leftLeg.position.set(-w / 2 + trussThick / 2, (h - trussThick / 2) / 2, 0);
      group.add(leftLeg);

      const rightLeg = makeTrussSegment(h - trussThick / 2, true);
      rightLeg.position.set(w / 2 - trussThick / 2, (h - trussThick / 2) / 2, 0);
      group.add(rightLeg);

      const topBeam = makeTrussSegment(w, false);
      topBeam.position.set(0, h - trussThick / 2, 0);
      group.add(topBeam);

      // Base plates
      for (const sx of [-w / 2 + trussThick / 2, w / 2 - trussThick / 2]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.024, 0.45), darkMetal);
        plate.position.set(sx, 0.012, 0);
        group.add(plate);
      }

      // 4 Exhibition spotlights mounted under the top beam
      const spots = 4;
      for (let i = 0; i < spots; i++) {
        const sx = -w * 0.34 + (i * w * 0.68) / (spots - 1);
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.068, 0.14, 12), darkMetal);
        can.position.set(sx, h - trussThick - 0.08, 0.1);
        can.rotation.x = 0.45;
        group.add(can);

        const lens = new THREE.Mesh(
          new THREE.CircleGeometry(0.056, 12),
          new THREE.MeshBasicMaterial({ color: '#FFF4D4' })
        );
        lens.position.set(sx, h - trussThick - 0.14, 0.13);
        lens.rotation.x = Math.PI / 2 + 0.45;
        group.add(lens);
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
  const plinthH = 0.045;

  // Raised exhibition stand floor platform with procedural texture
  const floorTex = getFloorTexture(config.floorMaterial, config.floorColor, width, depth);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    roughness:
      config.floorMaterial === 'oak-timber'
        ? 0.56
        : config.floorMaterial === 'slate-tile'
          ? 0.42
          : 0.88,
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

  // Subtle aluminum ramp bevel around open edges
  const bevelMat = makeAluminumMat('#B8BEC6');
  const frontBevel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.06, 0.015, 0.045), bevelMat);
  frontBevel.position.set(0, -plinthH + 0.008, depth / 2 + 0.02);
  group.add(frontBevel);

  // Shell scheme perimeter walls depending on openSides:
  // 1 = Inline (back + left + right walls)
  // 2 = Corner (back + left walls; front + right open)
  // 3 = Peninsula (back wall only; front + left + right open)
  // 4 = Island (0 perimeter walls)
  if (showShellWalls && openSides < 4) {
    const wallT = 0.08;
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
        new THREE.BoxGeometry(wallLen, shellWallHeight, wallT),
        wallMat
      );
      core.position.set(0, shellWallHeight / 2, 0);
      core.castShadow = true;
      core.receiveShadow = true;
      wGroup.add(core);

      // Modular 1m aluminum vertical mullions
      const panels = Math.max(1, Math.round(wallLen));
      for (let i = 0; i <= panels; i++) {
        const mx = -wallLen / 2 + (i * wallLen) / panels;
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.042, shellWallHeight + 0.02, wallT + 0.014),
          postMat
        );
        post.position.set(mx, shellWallHeight / 2, 0);
        post.castShadow = true;
        wGroup.add(post);
      }

      // Top & bottom aluminum channels
      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(wallLen + 0.04, 0.045, wallT + 0.016),
        postMat
      );
      topRail.position.set(0, shellWallHeight, 0);
      wGroup.add(topRail);

      // Brandable interior graphic surface on the shell wall!
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
        // Clickable subtle inner overlay so Click-to-Assign works on blank shell walls too!
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

    // Left wall (-X) for Inline (1) & Corner (2)
    if (openSides <= 2) {
      buildShellWall('left', depth, -width / 2 - wallT / 2, 0, Math.PI / 2);
    }

    // Right wall (+X) for Inline (1)
    if (openSides === 1) {
      buildShellWall('right', depth, width / 2 + wallT / 2, 0, -Math.PI / 2);
    }
  }

  return group;
}

export function buildScaleFigures(config: StandConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = 'scale-figures';

  const buildPerson = (heightM: number, tint: string, x: number, z: number, rotY: number) => {
    const p = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.55,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82,
    });

    const scale = heightM / 1.74;
    // Legs
    for (const lx of [-0.085, 0.085]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.042, 0.82, 10), mat);
      leg.position.set(lx, 0.41, 0);
      leg.castShadow = true;
      p.add(leg);
    }
    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.58, 12), mat);
    torso.scale.set(1.15, 1, 0.68);
    torso.position.y = 1.11;
    torso.castShadow = true;
    p.add(torso);

    // Arms
    for (const ax of [-0.21, 0.21]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.52, 8), mat);
      arm.position.set(ax, 1.07, 0);
      arm.rotation.z = ax < 0 ? 0.08 : -0.08;
      p.add(arm);
    }

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 14), mat);
    head.position.y = 1.56;
    head.castShadow = true;
    p.add(head);

    p.scale.setScalar(scale);
    p.position.set(x, 0, z);
    p.rotation.y = rotY;
    return p;
  };

  // Visitors standing naturally in adjacent aisles without blocking front reception desk branding
  group.add(
    buildPerson(1.75, '#7E8794', config.width / 2 + 0.52, config.depth * 0.22, -Math.PI * 0.65)
  );
  group.add(
    buildPerson(1.66, '#5A6577', -config.width * 0.44, config.depth / 2 + 0.98, Math.PI * 0.92)
  );

  return group;
}
