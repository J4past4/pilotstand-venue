import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  ExhibitionVenue,
  VenueLayerVisibility,
  VenueStand,
} from '../types/venue';

export type Venue3DCameraMode = 'orbit' | 'walk';

interface VenueViewport3DProps {
  venue: ExhibitionVenue;
  matchingStandIds: Set<string>;
  selectedStandId: string | null;
  competitorStandIds: Set<string>;
  layers: VenueLayerVisibility;
  cameraMode: Venue3DCameraMode;
  onSelectStand: (standId: string) => void;
  focusTrigger?: { standId: string; walk?: boolean; seq: number } | null;
}

function createLabelTexture(
  title: string,
  subtitle?: string,
  bgColor = '#111315',
  textColor = '#ffffff',
  borderColor?: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = subtitle ? 160 : 112;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (borderColor) {
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  }

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const titleSize = title.length > 22 ? 34 : title.length > 14 ? 42 : 52;
  ctx.font = `800 ${titleSize}px "Plus Jakarta Sans", Inter, sans-serif`;
  ctx.fillText(
    title.length > 28 ? `${title.slice(0, 26)}…` : title,
    canvas.width / 2,
    subtitle ? 58 : canvas.height / 2
  );

  if (subtitle) {
    ctx.font = `600 28px Inter, sans-serif`;
    ctx.fillStyle = textColor === '#ffffff' ? 'rgba(255,255,255,0.8)' : 'rgba(17,19,21,0.7)';
    ctx.fillText(
      subtitle.length > 32 ? `${subtitle.slice(0, 30)}…` : subtitle,
      canvas.width / 2,
      118
    );
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export const VenueViewport3D: React.FC<VenueViewport3DProps> = ({
  venue,
  matchingStandIds,
  selectedStandId,
  competitorStandIds,
  layers,
  cameraMode,
  onSelectStand,
  focusTrigger,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraModeRef = useRef<Venue3DCameraMode>(cameraMode);
  cameraModeRef.current = cameraMode;

  const onSelectStandRef = useRef(onSelectStand);
  onSelectStandRef.current = onSelectStand;

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    standMeshes: Map<string, THREE.Mesh>;
    pillarGroup: THREE.Group;
    amenityGroup: THREE.Group;
    competitorGroup: THREE.Group;
    selectionRing: THREE.Mesh;
    walkYaw: number;
    walkPitch: number;
  } | null>(null);

  // Build static venue scene once per venue
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dfe5ee');
    scene.fog = new THREE.Fog('#dfe5ee', 160, 420);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.25, 650);
    const hallCenterX = venue.widthM * 0.45;
    const hallCenterZ = venue.depthM * 0.44;
    camera.position.set(hallCenterX + 82, 86, hallCenterZ + 78);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 6;
    controls.maxDistance = 260;
    controls.target.set(hallCenterX, 0, hallCenterZ);
    controls.update();

    // Lighting — Bright Expo Hall
    const hemi = new THREE.HemisphereLight('#ffffff', '#cbd5e1', 1.15);
    scene.add(hemi);

    const dirLight = new THREE.DirectionalLight('#fffdf7', 1.25);
    dirLight.position.set(hallCenterX + 60, 120, hallCenterZ - 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 380;
    const d = 160;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight('#dbeafe', 0.45);
    fillLight.position.set(-40, 60, venue.depthM + 40);
    scene.add(fillLight);

    // Base Concrete Hall Floor
    const baseFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(venue.widthM + 80, venue.depthM + 80),
      new THREE.MeshStandardMaterial({ color: '#cfd6e0', roughness: 0.92, metalness: 0.04 })
    );
    baseFloor.rotation.x = -Math.PI / 2;
    baseFloor.position.set(venue.widthM / 2, -0.04, venue.depthM / 2);
    baseFloor.receiveShadow = true;
    scene.add(baseFloor);

    // Zone Carpets
    for (const zone of venue.zones) {
      const mat = new THREE.MeshStandardMaterial({
        color: zone.carpetColor,
        roughness: 0.88,
        metalness: 0.02,
      });
      for (const r of zone.regions) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(r.width, 0.04, r.depth), mat);
        mesh.position.set(r.x + r.width / 2, -0.01, r.z + r.depth / 2);
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    }

    // Subtle Architectural Roof Trusses (high overhead so bird's eye stays clear, walk mode feels authentic)
    const trussMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.5,
      metalness: 0.45,
      transparent: true,
      opacity: 0.35,
    });
    for (let z = 16; z < venue.depthM; z += 24) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(venue.widthM, 0.45, 0.45), trussMat);
      beam.position.set(venue.widthM / 2, venue.ceilingHeightM, z);
      scene.add(beam);
    }

    // Stands
    const standMeshes = new Map<string, THREE.Mesh>();
    const pickableMeshes: THREE.Object3D[] = [];

    for (const stand of venue.stands) {
      const cx = stand.x + stand.width / 2;
      const cz = stand.z + stand.depth / 2;
      const area = stand.width * stand.depth;

      if (stand.status === 'available') {
        const mat = new THREE.MeshStandardMaterial({
          color: '#ffffff',
          roughness: 0.55,
          metalness: 0.05,
        });
        const plot = new THREE.Mesh(new THREE.BoxGeometry(stand.width - 0.12, 0.14, stand.depth - 0.12), mat);
        plot.position.set(cx, 0.07, cz);
        plot.receiveShadow = true;
        plot.castShadow = true;
        plot.userData = { standId: stand.id };
        scene.add(plot);
        standMeshes.set(stand.id, plot);
        pickableMeshes.push(plot);

        // Crisp green perimeter outline
        const edges = new THREE.EdgesGeometry(plot.geometry);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: '#16a34a' })
        );
        line.position.copy(plot.position);
        scene.add(line);

        // Floor badge with stand ID & size
        const tex = createLabelTexture(
          stand.id,
          `${stand.width}×${stand.depth}m`,
          '#ffffff',
          '#111827',
          '#16a34a'
        );
        const badge = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.min(stand.width * 0.85, 4.4), Math.min(stand.depth * 0.75, 1.8)),
          new THREE.MeshBasicMaterial({ map: tex })
        );
        badge.rotation.x = -Math.PI / 2;
        badge.position.set(cx, 0.155, cz);
        badge.userData = { standId: stand.id };
        scene.add(badge);
        pickableMeshes.push(badge);
      } else if (stand.status === 'reserved') {
        const mat = new THREE.MeshStandardMaterial({
          color: '#0ea5e9',
          roughness: 0.5,
          transparent: true,
          opacity: 0.78,
        });
        const plot = new THREE.Mesh(new THREE.BoxGeometry(stand.width - 0.12, 0.35, stand.depth - 0.12), mat);
        plot.position.set(cx, 0.175, cz);
        plot.castShadow = true;
        plot.receiveShadow = true;
        plot.userData = { standId: stand.id };
        scene.add(plot);
        standMeshes.set(stand.id, plot);
        pickableMeshes.push(plot);
      } else if (stand.status === 'feature') {
        const h = 4.2;
        const mat = new THREE.MeshStandardMaterial({
          color: '#a78bfa',
          roughness: 0.45,
          metalness: 0.1,
        });
        const pavilion = new THREE.Mesh(new THREE.BoxGeometry(stand.width - 0.2, h, stand.depth - 0.2), mat);
        pavilion.position.set(cx, h / 2, cz);
        pavilion.castShadow = true;
        pavilion.receiveShadow = true;
        pavilion.userData = { standId: stand.id };
        scene.add(pavilion);
        standMeshes.set(stand.id, pavilion);
        pickableMeshes.push(pavilion);

        // Top sign
        const tex = createLabelTexture(
          stand.exhibitorName || stand.id,
          stand.sponsor || 'Feature Zone',
          '#4c1d95',
          '#ffffff',
          '#c4b5fd'
        );
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.min(stand.width - 0.6, 12), Math.min(stand.depth * 0.45, 3.8)),
          new THREE.MeshBasicMaterial({ map: tex })
        );
        sign.rotation.x = -Math.PI / 2;
        sign.position.set(cx, h + 0.05, cz);
        scene.add(sign);
      } else {
        // Sold stand — architectural 3D exhibition booth
        const h = area >= 36 ? 3.5 : area >= 18 ? 3.0 : 2.5;
        const mat = new THREE.MeshStandardMaterial({
          color: '#fde68a',
          roughness: 0.62,
          metalness: 0.06,
        });
        const booth = new THREE.Mesh(new THREE.BoxGeometry(stand.width - 0.16, h, stand.depth - 0.16), mat);
        booth.position.set(cx, h / 2, cz);
        booth.castShadow = true;
        booth.receiveShadow = true;
        booth.userData = { standId: stand.id };
        scene.add(booth);
        standMeshes.set(stand.id, booth);
        pickableMeshes.push(booth);

        // Dark fascia header strip
        const fascia = new THREE.Mesh(
          new THREE.BoxGeometry(stand.width - 0.12, 0.36, stand.depth - 0.12),
          new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45 })
        );
        fascia.position.set(cx, h + 0.18, cz);
        scene.add(fascia);

        // Top company label for readability in orbit view
        if (stand.exhibitorName && area >= 12) {
          const tex = createLabelTexture(
            stand.exhibitorName,
            stand.id,
            '#1e293b',
            '#ffffff'
          );
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(stand.width - 0.4, 6.2), Math.min(stand.depth * 0.52, 2.2)),
            new THREE.MeshBasicMaterial({ map: tex })
          );
          sign.rotation.x = -Math.PI / 2;
          sign.position.set(cx, h + 0.38, cz);
          scene.add(sign);
        }
      }
    }

    // Structural Pillars Group
    const pillarGroup = new THREE.Group();
    const concreteMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.85,
      metalness: 0.08,
    });
    const hazardMat = new THREE.MeshStandardMaterial({
      color: '#f59e0b',
      roughness: 0.4,
      emissive: '#92400e',
      emissiveIntensity: 0.25,
    });
    for (const pillar of venue.pillars) {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(pillar.width, pillar.heightM, pillar.depth),
        concreteMat
      );
      col.position.set(
        pillar.x + pillar.width / 2,
        pillar.heightM / 2,
        pillar.z + pillar.depth / 2
      );
      col.castShadow = true;
      col.receiveShadow = true;
      pillarGroup.add(col);

      // High-vis warning collar at eye level (1.4m - 1.9m)
      const collar = new THREE.Mesh(
        new THREE.BoxGeometry(pillar.width + 0.12, 0.55, pillar.depth + 0.12),
        hazardMat
      );
      collar.position.set(
        pillar.x + pillar.width / 2,
        1.65,
        pillar.z + pillar.depth / 2
      );
      pillarGroup.add(collar);
    }
    scene.add(pillarGroup);

    // Amenities Group (Toilets, Catering, Info, First Aid)
    const amenityGroup = new THREE.Group();
    for (const am of venue.amenities) {
      const color =
        am.kind === 'toilets'
          ? '#0f766e'
          : am.kind === 'catering'
          ? '#0284c7'
          : am.kind === 'first-aid'
          ? '#dc2626'
          : '#4f46e5';
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(am.width, 3.2, am.depth),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
      );
      box.position.set(am.x + am.width / 2, 1.6, am.z + am.depth / 2);
      box.castShadow = true;
      amenityGroup.add(box);

      const tex = createLabelTexture(
        am.kind === 'toilets' ? 'TOILETS (WC)' : am.kind.toUpperCase(),
        am.label,
        color,
        '#ffffff',
        '#ffffff'
      );
      const spriteMat = new THREE.SpriteMaterial({ map: tex });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(am.x + am.width / 2, 4.6, am.z + am.depth / 2);
      sprite.scale.set(6.5, 2.1, 1);
      amenityGroup.add(sprite);
    }
    scene.add(amenityGroup);

    // Visitors Entrances Archways
    for (const ent of venue.entrances) {
      const arch = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 4.5, ent.widthM),
        new THREE.MeshStandardMaterial({ color: '#111315', roughness: 0.4 })
      );
      arch.position.set(ent.x + 1.2, 2.25, ent.z);
      scene.add(arch);

      const tex = createLabelTexture('VISITORS ENTRANCE', ent.label, '#111315', '#ffffff', '#ff4d2e');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      sprite.position.set(ent.x + 2.5, 5.8, ent.z);
      sprite.scale.set(9.5, 2.8, 1);
      scene.add(sprite);
    }

    // Competitor markers group (updated dynamically)
    const competitorGroup = new THREE.Group();
    scene.add(competitorGroup);

    // Selection Highlight Ring
    const selectionRing = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.25, 1),
      new THREE.MeshBasicMaterial({
        color: '#ff4d2e',
        wireframe: false,
        transparent: true,
        opacity: 0.45,
      })
    );
    selectionRing.visible = false;
    scene.add(selectionRing);

    sceneRefs.current = {
      scene,
      camera,
      controls,
      standMeshes,
      pillarGroup,
      amenityGroup,
      competitorGroup,
      selectionRing,
      walkYaw: 0,
      walkPitch: 0,
    };

    // Raycasting for stand selection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let isWalkLooking = false;
    let lastLookPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      if (cameraModeRef.current === 'walk') {
        isWalkLooking = true;
        lastLookPos = { x: e.clientX, y: e.clientY };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (cameraModeRef.current === 'walk' && isWalkLooking && sceneRefs.current) {
        const dx = e.clientX - lastLookPos.x;
        const dy = e.clientY - lastLookPos.y;
        lastLookPos = { x: e.clientX, y: e.clientY };
        sceneRefs.current.walkYaw -= dx * 0.0045;
        sceneRefs.current.walkPitch = Math.max(
          -0.65,
          Math.min(0.55, sceneRefs.current.walkPitch - dy * 0.0035)
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      isWalkLooking = false;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickableMeshes, false);
      if (hits.length > 0) {
        const standId = hits[0].object.userData?.standId as string | undefined;
        if (standId) onSelectStandRef.current(standId);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // WASD / Arrow key walking in Eye-Level mode
    const keysPressed = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }
      keysPressed.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Resize observer
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // Render loop
    let animId = 0;
    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);

      if (cameraModeRef.current === 'walk' && sceneRefs.current) {
        controls.enabled = false;
        const speed = keysPressed.has('ShiftLeft') || keysPressed.has('ShiftRight') ? 16 : 8.5;
        const yaw = sceneRefs.current.walkYaw;
        const pitch = sceneRefs.current.walkPitch;

        forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
        right.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) {
          camera.position.addScaledVector(forward, speed * dt);
        }
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) {
          camera.position.addScaledVector(forward, -speed * dt);
        }
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) {
          camera.position.addScaledVector(right, -speed * dt);
        }
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) {
          camera.position.addScaledVector(right, speed * dt);
        }

        // Keep at eye-level height (1.68m) and inside hall bounds
        camera.position.y = 1.68;
        camera.position.x = Math.max(-5, Math.min(venue.widthM + 10, camera.position.x));
        camera.position.z = Math.max(-5, Math.min(venue.depthM + 10, camera.position.z));

        const lookTarget = new THREE.Vector3(
          camera.position.x - Math.sin(yaw) * Math.cos(pitch) * 10,
          camera.position.y + Math.sin(pitch) * 10,
          camera.position.z - Math.cos(yaw) * Math.cos(pitch) * 10
        );
        camera.lookAt(lookTarget);
      } else {
        controls.enabled = true;
        controls.update();
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneRefs.current = null;
    };
  }, [venue]);

  // Sync layer visibility, dimming, selection ring & competitor beacons
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    refs.pillarGroup.visible = layers.pillars;
    refs.amenityGroup.visible = layers.amenities;

    // Update stand materials for filtering & selection
    for (const stand of venue.stands) {
      const mesh = refs.standMeshes.get(stand.id);
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const isSelected = stand.id === selectedStandId;
      const isCompetitor = layers.competitors && competitorStandIds.has(stand.id);
      const isMatching = matchingStandIds.has(stand.id);

      if (isCompetitor) {
        mat.color.set('#ef4444');
        mat.opacity = 1;
        mat.transparent = false;
      } else if (stand.status === 'available') {
        mat.color.set(isSelected ? '#bbf7d0' : '#ffffff');
        mat.opacity = isMatching || isSelected ? 1 : 0.35;
        mat.transparent = !(isMatching || isSelected);
      } else if (stand.status === 'sold') {
        mat.color.set('#fde68a');
        mat.opacity = isMatching || isSelected ? 1 : 0.45;
        mat.transparent = !(isMatching || isSelected);
      }
    }

    // Update Selection Ring
    const selectedStand: VenueStand | undefined = venue.stands.find(
      (s) => s.id === selectedStandId
    );
    if (selectedStand) {
      refs.selectionRing.visible = true;
      refs.selectionRing.scale.set(selectedStand.width + 0.6, 1, selectedStand.depth + 0.6);
      refs.selectionRing.position.set(
        selectedStand.x + selectedStand.width / 2,
        0.18,
        selectedStand.z + selectedStand.depth / 2
      );
    } else {
      refs.selectionRing.visible = false;
    }

    // Rebuild competitor beacons
    while (refs.competitorGroup.children.length > 0) {
      refs.competitorGroup.remove(refs.competitorGroup.children[0]);
    }
    if (layers.competitors && competitorStandIds.size > 0) {
      for (const standId of competitorStandIds) {
        const stand = venue.stands.find((s) => s.id === standId);
        if (!stand) continue;
        const cx = stand.x + stand.width / 2;
        const cz = stand.z + stand.depth / 2;
        const tex = createLabelTexture(
          'COMPETITOR',
          stand.exhibitorName || stand.id,
          '#dc2626',
          '#ffffff',
          '#fecaca'
        );
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
        sprite.position.set(cx, 6.2, cz);
        sprite.scale.set(7.5, 2.3, 1);
        refs.competitorGroup.add(sprite);
      }
    }
  }, [venue, matchingStandIds, selectedStandId, competitorStandIds, layers]);

  // Camera focus or teleport into Eye-Level Walkthrough
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    if (focusTrigger) {
      const stand = venue.stands.find((s) => s.id === focusTrigger.standId);
      if (stand) {
        const cx = stand.x + stand.width / 2;
        const cz = stand.z + stand.depth / 2;
        if (focusTrigger.walk || cameraMode === 'walk') {
          // Place user in aisle 5m south/east of the stand looking straight at it
          const camX = cx + stand.width / 2 + 3.2;
          const camZ = cz + stand.depth / 2 + 3.8;
          refs.camera.position.set(camX, 1.68, camZ);
          refs.walkYaw = Math.atan2(camX - cx, camZ - cz);
          refs.walkPitch = -0.04;
        } else {
          refs.controls.target.set(cx, 1.0, cz);
          refs.camera.position.set(cx + 22, 24, cz + 24);
          refs.controls.update();
        }
        return;
      }
    }

    // If user switches to walk mode without a specific focus trigger, place near selected stand or Central Entrance
    if (cameraMode === 'walk') {
      const targetStand = selectedStandId
        ? venue.stands.find((s) => s.id === selectedStandId)
        : null;
      if (targetStand) {
        const cx = targetStand.x + targetStand.width / 2;
        const cz = targetStand.z + targetStand.depth / 2;
        const camX = cx + targetStand.width / 2 + 3.2;
        const camZ = cz + targetStand.depth / 2 + 3.8;
        refs.camera.position.set(camX, 1.68, camZ);
        refs.walkYaw = Math.atan2(camX - cx, camZ - cz);
        refs.walkPitch = -0.04;
      } else {
        // Central Visitors Entrance looking west into hall
        refs.camera.position.set(89, 1.68, 129);
        refs.walkYaw = Math.PI / 2;
        refs.walkPitch = -0.03;
      }
    }
  }, [focusTrigger, cameraMode, selectedStandId, venue.stands]);

  return (
    <div className="venue-viewport3d-root" ref={mountRef}>
      {cameraMode === 'walk' && (
        <div className="venue-walk-hud">
          <span><strong>Eye-Level Walkthrough (1.68m)</strong></span>
          <span>• Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or Arrow keys to walk aisles</span>
          <span>• Drag to look around</span>
          <span>• Hold <kbd>Shift</kbd> to walk faster</span>
        </div>
      )}
    </div>
  );
};
