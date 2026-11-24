import * as THREE from 'three';
import type {
  BrandAsset,
  FloorMaterial,
  StandConfig,
  SurfaceArtwork,
  SurfaceZoneDef,
} from '../types/stand';

const loadedImages = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<HTMLImageElement>>();

export function preloadImage(dataUrl: string): Promise<HTMLImageElement> {
  const existing = loadedImages.get(dataUrl);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }
  const inflight = loadingPromises.get(dataUrl);
  if (inflight) return inflight;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImages.set(dataUrl, img);
      loadingPromises.delete(dataUrl);
      resolve(img);
    };
    img.onerror = (err) => {
      loadingPromises.delete(dataUrl);
      reject(err);
    };
    img.src = dataUrl;
  });

  loadingPromises.set(dataUrl, promise);
  return promise;
}

const surfaceTextureCache = new Map<string, THREE.CanvasTexture>();

export function clearSurfaceTextureCache() {
  for (const tex of surfaceTextureCache.values()) {
    tex.dispose();
  }
  surfaceTextureCache.clear();
}

function drawProceduralBrandGraphic(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  role: SurfaceZoneDef['defaultRole'],
  config: StandConfig,
  bgColor?: string,
  customHeading?: string
) {
  const primary = bgColor || config.primaryColor || '#1B365D';
  const accent = config.accentColor || '#D95D39';
  const brand = (customHeading || config.brandName || 'YOUR BRAND').toUpperCase();
  const tagline = config.brandTagline || 'Exhibition Showcase';

  // Background
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, primary);
  grad.addColorStop(1, shadeHex(primary, -18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (role === 'screen') {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(w * 0.04, h * 0.06, w * 0.92, h * 0.1);
    ctx.fillStyle = accent;
    ctx.fillRect(w * 0.06, h * 0.24, w * 0.28, h * 0.015);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 ${Math.round(h * 0.11)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(brand, w * 0.06, h * 0.42);
    ctx.fillStyle = '#94A3B8';
    ctx.font = `400 ${Math.round(h * 0.05)}px Inter, sans-serif`;
    ctx.fillText(tagline, w * 0.06, h * 0.54);
    // Decorative UI chart bars
    for (let i = 0; i < 6; i++) {
      const barH = h * (0.14 + ((i * 19) % 28) * 0.01);
      ctx.fillStyle = i % 2 === 0 ? accent : '#38BDF8';
      ctx.fillRect(w * (0.58 + i * 0.058), h * 0.82 - barH, w * 0.036, barH);
    }
    return;
  }

  if (role === 'pattern') {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(2, w * 0.004);
    const step = Math.max(48, Math.round(Math.min(w, h) / 6));
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = accent;
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.09)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(brand, w / 2, h * 0.5);
    return;
  }

  // Subtle architectural stripe
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(w * 0.68, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w, h);
  ctx.lineTo(w * 0.82, h);
  ctx.closePath();
  ctx.fill();

  // Accent bar
  ctx.fillStyle = accent;
  if (role === 'fascia') {
    ctx.fillRect(0, h - Math.max(8, h * 0.09), w, Math.max(8, h * 0.09));
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = Math.min(h * 0.46, (w * 0.72) / Math.max(4, brand.length * 0.62));
    ctx.font = `800 ${Math.round(fontSize)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(brand, w / 2, h * 0.47);
    return;
  }

  if (role === 'logo') {
    ctx.fillRect(w * 0.38, h * 0.28, w * 0.24, Math.max(6, h * 0.014));
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fontSize = Math.min(h * 0.22, (w * 0.8) / Math.max(4, brand.length * 0.65));
    ctx.font = `800 ${Math.round(fontSize)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(brand, w / 2, h * 0.48);

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    const subSize = Math.max(14, Math.round(fontSize * 0.34));
    ctx.font = `500 ${subSize}px Inter, sans-serif`;
    ctx.fillText(tagline.slice(0, 34), w / 2, h * 0.63);
    return;
  }

  // Hero mural fallback
  ctx.fillRect(w * 0.08, h * 0.22, w * 0.1, Math.max(8, h * 0.014));
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const titleSize = Math.min(h * 0.17, (w * 0.75) / Math.max(4, brand.length * 0.62));
  ctx.font = `800 ${Math.round(titleSize)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(brand, w * 0.08, h * 0.47);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = `500 ${Math.round(h * 0.055)}px Inter, sans-serif`;
  ctx.fillText(tagline, w * 0.08, h * 0.59);

  // Decorative accent circle
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.arc(w * 0.84, h * 0.5, Math.min(w, h) * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function shadeHex(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + percent));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + percent));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + percent));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function recolorPresetSvgDataUrl(dataUrl: string, primary: string, accent: string): string {
  if (!dataUrl.startsWith('data:image/svg+xml')) return dataUrl;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl;
  const prefix = dataUrl.slice(0, commaIdx + 1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(dataUrl.slice(commaIdx + 1));
  } catch {
    return dataUrl;
  }
  const darkPrimary = shadeHex(primary, -26);
  const midPrimary = shadeHex(primary, -10);
  const lightPrimary = shadeHex(primary, 14);
  const replaced = decoded
    .replace(/#1B365D/gi, primary)
    .replace(/#1B3A63/gi, primary)
    .replace(/#13294B/gi, midPrimary)
    .replace(/#0E213C/gi, darkPrimary)
    .replace(/#0E1E38/gi, darkPrimary)
    .replace(/#203F6E/gi, lightPrimary)
    .replace(/#254E80/gi, lightPrimary)
    .replace(/#D95D39/gi, accent)
    .replace(/#E86A42/gi, accent);
  return prefix + encodeURIComponent(replaced);
}

export function getSurfaceTexture(
  artwork: SurfaceArtwork | undefined,
  role: SurfaceZoneDef['defaultRole'],
  aspect: number,
  config: StandConfig,
  assetsMap: Map<string, BrandAsset>,
  onImageReady?: () => void
): THREE.CanvasTexture {
  const safeAspect = Math.max(0.25, Math.min(6, aspect));
  const maxDim = 1024;
  const cw = safeAspect >= 1 ? maxDim : Math.round(maxDim * safeAspect);
  const ch = safeAspect >= 1 ? Math.round(maxDim / safeAspect) : maxDim;

  const asset = artwork?.assetId ? assetsMap.get(artwork.assetId) : undefined;
  const effectivePrimary = artwork?.bgColor || config.primaryColor || '#1B365D';
  const effectiveAccent = config.accentColor || '#D95D39';
  const effectiveDataUrl =
    asset && asset.id.startsWith('preset-') && asset.dataUrl.startsWith('data:image/svg+xml')
      ? recolorPresetSvgDataUrl(asset.dataUrl, effectivePrimary, effectiveAccent)
      : asset?.dataUrl;

  const cacheKey = JSON.stringify({
    cw,
    ch,
    role,
    assetId: asset?.id || null,
    fit: artwork?.fit || 'cover',
    scale: artwork?.scale ?? 1,
    ox: artwork?.offsetX ?? 0,
    oy: artwork?.offsetY ?? 0,
    bg: effectivePrimary,
    heading: artwork?.customHeading || config.brandName,
    tagline: config.brandTagline,
    accent: effectiveAccent,
    loaded: effectiveDataUrl ? Boolean(loadedImages.get(effectiveDataUrl)) : false,
  });

  const cached = surfaceTextureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(128, cw);
  canvas.height = Math.max(128, ch);
  const ctx = canvas.getContext('2d')!;

  if (asset && effectiveDataUrl) {
    const img = loadedImages.get(effectiveDataUrl);
    if (img && img.complete && img.naturalWidth > 0) {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      grad.addColorStop(0, effectivePrimary);
      grad.addColorStop(1, shadeHex(effectivePrimary, -20));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const userFit = artwork?.fit || 'cover';
      const userScale = artwork?.scale ?? 1;
      const offsetX = (artwork?.offsetX ?? 0) * canvas.width;
      const offsetY = (artwork?.offsetY ?? 0) * canvas.height;

      const imgAspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      const canvasAspect = canvas.width / canvas.height;

      // Prevent severe horizontal text cropping when a wide graphic is placed on a tall narrow panel
      const fit =
        userFit === 'cover' && imgAspect > 1.3 && canvasAspect < 0.72 ? 'contain' : userFit;

      let drawW = canvas.width;
      let drawH = canvas.height;

      if (fit === 'cover') {
        if (imgAspect > canvasAspect) {
          drawH = canvas.height;
          drawW = drawH * imgAspect;
        } else {
          drawW = canvas.width;
          drawH = drawW / imgAspect;
        }
      } else if (fit === 'contain') {
        if (imgAspect > canvasAspect) {
          drawW = canvas.width * 0.92;
          drawH = drawW / imgAspect;
        } else {
          drawH = canvas.height * 0.92;
          drawW = drawH * imgAspect;
        }
      }

      drawW *= userScale;
      drawH *= userScale;

      const dx = (canvas.width - drawW) / 2 + offsetX;
      const dy = (canvas.height - drawH) / 2 + offsetY;
      ctx.drawImage(img, dx, dy, drawW, drawH);
    } else {
      // Draw immediate placeholder brand graphic while async image finishes decoding
      drawProceduralBrandGraphic(
        ctx,
        canvas.width,
        canvas.height,
        role,
        config,
        artwork?.bgColor,
        artwork?.customHeading
      );
      preloadImage(effectiveDataUrl)
        .then(() => {
          onImageReady?.();
        })
        .catch(() => {
          // ignore broken image
        });
    }
  } else {
    drawProceduralBrandGraphic(
      ctx,
      canvas.width,
      canvas.height,
      role,
      config,
      artwork?.bgColor,
      artwork?.customHeading
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  // Limit cache size softly
  if (surfaceTextureCache.size > 140) {
    const firstKey = surfaceTextureCache.keys().next().value;
    if (firstKey) {
      surfaceTextureCache.get(firstKey)?.dispose();
      surfaceTextureCache.delete(firstKey);
    }
  }
  surfaceTextureCache.set(cacheKey, texture);
  return texture;
}

const floorTextureCache = new Map<string, THREE.CanvasTexture>();

export function getFloorTexture(
  material: FloorMaterial,
  customColor: string,
  widthM: number,
  depthM: number
): THREE.CanvasTexture {
  const key = `${material}:${customColor}`;
  let baseTex = floorTextureCache.get(key);

  if (!baseTex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    if (material === 'oak-timber') {
      ctx.fillStyle = '#C4A074';
      ctx.fillRect(0, 0, 512, 512);
      const planks = 8;
      const plankH = 512 / planks;
      for (let i = 0; i < planks; i++) {
        const y = i * plankH;
        const tone = i % 3 === 0 ? '#C6A378' : i % 3 === 1 ? '#B99468' : '#CFAF86';
        ctx.fillStyle = tone;
        ctx.fillRect(0, y, 512, plankH - 2);
        // subtle grain streaks
        ctx.strokeStyle = 'rgba(92, 64, 38, 0.14)';
        ctx.lineWidth = 1.5;
        for (let g = 0; g < 6; g++) {
          ctx.beginPath();
          const gy = y + 6 + g * (plankH / 6.5);
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(170, gy + 3, 340, gy - 3, 512, gy);
          ctx.stroke();
        }
        // plank seam
        ctx.fillStyle = 'rgba(72, 48, 28, 0.28)';
        ctx.fillRect(0, y + plankH - 2, 512, 2);
        const jointX = ((i * 173 + 90) % 440) + 36;
        ctx.fillRect(jointX, y, 2, plankH);
      }
    } else if (material === 'light-concrete') {
      ctx.fillStyle = '#DBD8D2';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 900; i++) {
        const x = (i * 97) % 512;
        const y = (i * 163) % 512;
        const r = 10 + (i % 24);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(110,108,102,0.05)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(120,118,112,0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 510, 510);
    } else if (material === 'slate-tile') {
      ctx.fillStyle = '#3B4047';
      ctx.fillRect(0, 0, 512, 512);
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#41474F' : '#393E45';
          ctx.fillRect(c * 256 + 3, r * 256 + 3, 250, 250);
        }
      }
    } else {
      // Woven expo carpet (charcoal, navy, or custom brand color)
      const baseHex =
        material === 'charcoal-carpet'
          ? '#2F343B'
          : material === 'navy-carpet'
            ? '#1E3452'
            : customColor || '#2F343B';
      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, 512, 512);
      // Subtle ribbed carpet texture
      for (let y = 0; y < 512; y += 6) {
        ctx.fillStyle = y % 12 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.07)';
        ctx.fillRect(0, y, 512, 3);
      }
      for (let x = 0; x < 512; x += 8) {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(x, 0, 2, 512);
      }
    }

    baseTex = new THREE.CanvasTexture(canvas);
    baseTex.colorSpace = THREE.SRGBColorSpace;
    baseTex.wrapS = THREE.RepeatWrapping;
    baseTex.wrapT = THREE.RepeatWrapping;
    baseTex.anisotropy = 8;
    floorTextureCache.set(key, baseTex);
  }

  const cloned = baseTex.clone();
  cloned.needsUpdate = true;
  const tileSize = material === 'oak-timber' ? 1.8 : material === 'slate-tile' ? 1.2 : 1.5;
  cloned.repeat.set(Math.max(1, widthM / tileSize), Math.max(1, depthM / tileSize));
  return cloned;
}

const floorBumpCache = new Map<string, THREE.CanvasTexture>();

export function getFloorBumpTexture(
  material: FloorMaterial,
  widthM: number,
  depthM: number
): THREE.CanvasTexture {
  let baseBump = floorBumpCache.get(material);

  if (!baseBump) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    if (material === 'oak-timber') {
      const planks = 8;
      const plankH = 512 / planks;
      for (let i = 0; i < planks; i++) {
        const y = i * plankH;
        // subtle wood grain ridges
        ctx.strokeStyle = 'rgba(165, 165, 165, 0.35)';
        ctx.lineWidth = 1.2;
        for (let g = 0; g < 6; g++) {
          ctx.beginPath();
          const gy = y + 6 + g * (plankH / 6.5);
          ctx.moveTo(0, gy);
          ctx.bezierCurveTo(170, gy + 3, 340, gy - 3, 512, gy);
          ctx.stroke();
        }
        // recessed plank bevel seams
        ctx.fillStyle = '#202020';
        ctx.fillRect(0, y + plankH - 3, 512, 3);
        const jointX = ((i * 173 + 90) % 440) + 36;
        ctx.fillRect(jointX, y, 3, plankH);
      }
    } else if (material === 'light-concrete') {
      for (let i = 0; i < 1200; i++) {
        const x = (i * 97) % 512;
        const y = (i * 163) % 512;
        const r = 4 + (i % 14);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(155,155,155,0.22)' : 'rgba(95,95,95,0.22)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#383838';
      ctx.lineWidth = 3;
      ctx.strokeRect(1.5, 1.5, 509, 509);
    } else if (material === 'slate-tile') {
      ctx.fillStyle = '#969696';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#242424';
      ctx.fillRect(0, 0, 512, 4);
      ctx.fillRect(0, 254, 512, 5);
      ctx.fillRect(0, 0, 4, 512);
      ctx.fillRect(254, 0, 5, 512);
    } else {
      // Ribbed woven carpet micro-relief
      for (let y = 0; y < 512; y += 6) {
        ctx.fillStyle = y % 12 === 0 ? '#A8A8A8' : '#585858';
        ctx.fillRect(0, y, 512, 3);
      }
      for (let x = 0; x < 512; x += 8) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x, 0, 2, 512);
      }
    }

    baseBump = new THREE.CanvasTexture(canvas);
    baseBump.wrapS = THREE.RepeatWrapping;
    baseBump.wrapT = THREE.RepeatWrapping;
    baseBump.anisotropy = 4;
    floorBumpCache.set(material, baseBump);
  }

  const cloned = baseBump.clone();
  cloned.needsUpdate = true;
  const tileSize = material === 'oak-timber' ? 1.8 : material === 'slate-tile' ? 1.2 : 1.5;
  cloned.repeat.set(Math.max(1, widthM / tileSize), Math.max(1, depthM / tileSize));
  return cloned;
}
