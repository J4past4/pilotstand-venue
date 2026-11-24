import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Compass,
  Eye,
  Grid2x2,
  Maximize2,
  Play,
  RotateCcw,
} from 'lucide-react';
import { CATALOG_MAP } from './data/catalog';
import { BUILTIN_BRAND_ASSETS } from './data/palettes';
import {
  createItemId,
  DEFAULT_STAND_CONFIG,
  instantiateTemplate,
  STAND_TEMPLATES,
} from './data/templates';
import { StandViewport3D, type StandViewportHandle } from './engine/StandViewport3D';
import {
  isSupportedModelFile,
  parseAndRegister3DModel,
  registerSampleShowcaseMachine,
} from './engine/modelLoader';
import { LeftSidebar, type SidebarTab } from './components/LeftSidebar';
import {
  EstimateModal,
  ExportModal,
  ProjectsModal,
  TemplatesModal,
} from './components/Modals';
import { RightInspector } from './components/RightInspector';
import { SetupGuidePage } from './components/SetupGuidePage';
import { StudioWalkthrough } from './components/StudioWalkthrough';
import { TopBar } from './components/TopBar';
import { AgentDrawer } from './components/AgentDrawer';
import { applyAgentActions } from './agent/actionExecutor';
import { sendStandAgentPrompt } from './agent/agentClient';
import type { AgentAudioPayload, AgentChatMessage, AgentHistoryTurn } from './agent/types';
import type {
  BrandAsset,
  BrandKitSetupResult,
  CameraPreset,
  CurrencyCode,
  CustomModelAsset,
  SavedProject,
  ShellWallSide,
  StandConfig,
  StandItem,
  StandTemplate,
  SurfaceArtwork,
  ViewMode,
} from './types/stand';
import {
  applyDocumentFavicon,
  buildBrandedStandFromSetup,
  ensureGoogleFontPairingLoaded,
} from './utils/brandKit';
import { exportProductionBriefHtml } from './utils/briefExport';
import { calculateEstimate, evaluateCompliance, formatArea, formatLength } from './utils/pricing';

const STORAGE_KEY = 'zuki_exhibition_planner_projects_v1';
const LEGACY_STORAGE_KEY = 'standcraft_studio_projects_v1';

interface HistorySnapshot {
  config: StandConfig;
  items: StandItem[];
}

function cloneSnapshot(config: StandConfig, items: StandItem[]): HistorySnapshot {
  return {
    config: JSON.parse(JSON.stringify(config)),
    items: JSON.parse(JSON.stringify(items)),
  };
}

function readImageFile(file: File): Promise<BrandAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        resolve({
          id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          dataUrl,
          width: img.naturalWidth || 1000,
          height: img.naturalHeight || 1000,
          kind: 'uploaded',
          category: file.type.includes('svg') || file.type.includes('png') ? 'logo' : 'banner',
        });
      };
      img.onerror = () => {
        resolve({
          id: `asset-${Date.now().toString(36)}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          dataUrl,
          width: 1000,
          height: 1000,
          kind: 'uploaded',
          category: 'banner',
        });
      };
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function loadInitialProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedProject[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fallback to default template
  }
  const initial = instantiateTemplate(STAND_TEMPLATES[0]);
  return [
    {
      id: 'proj-default',
      name: 'Grand Flagship Pavilion (8m × 6m)',
      updatedAt: Date.now(),
      config: initial.config,
      items: initial.items,
      customAssets: [],
    },
  ];
}

export function App() {
  const [projects, setProjects] = useState<SavedProject[]>(() => loadInitialProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => projects[0]?.id || 'proj-default');

  const activeProj = projects.find((p) => p.id === activeProjectId) || projects[0];

  const [projectName, setProjectName] = useState<string>(activeProj.name);
  const [config, setConfig] = useState<StandConfig>(activeProj.config);
  const [items, setItems] = useState<StandItem[]>(activeProj.items);
  const [customAssets, setCustomAssets] = useState<BrandAsset[]>(activeProj.customAssets || []);

  // First-page Setup Guide & 30-second Cinematic Walkthrough state
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(true);
  const [tourActive, setTourActive] = useState<boolean>(false);
  const [tourPaused, setTourPaused] = useState<boolean>(false);

  // Sync brand fonts and browser favicon whenever config updates
  useEffect(() => {
    ensureGoogleFontPairingLoaded(config.displayFont, config.bodyFont);
    applyDocumentFavicon(config.faviconDataUrl);
  }, [config.displayFont, config.bodyFont, config.faviconDataUrl]);

  // History stack
  const [history, setHistory] = useState<HistorySnapshot[]>(() => [
    cloneSnapshot(activeProj.config, activeProj.items),
  ]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);

  // UI & selection state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('catalog');
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string | null>(null);
  const [selectedShellWall, setSelectedShellWall] = useState<ShellWallSide | null>(null);
  const [paintAssetId, setPaintAssetId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');
  const [pricingMode, setPricingMode] = useState<'hire' | 'buy'>('hire');

  // Modals & AI Designer drawer
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAgentDrawer, setShowAgentDrawer] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const viewportRef = useRef<StandViewportHandle | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const allAssets = useMemo(
    () => [...customAssets, ...BUILTIN_BRAND_ASSETS],
    [customAssets]
  );

  const assetsMap = useMemo(() => {
    const map = new Map<string, BrandAsset>();
    allAssets.forEach((a) => map.set(a.id, a));
    return map;
  }, [allAssets]);

  const compliance = useMemo(() => evaluateCompliance(config, items), [config, items]);
  const estimate = useMemo(
    () => calculateEstimate(config, items, pricingMode),
    [config, items, pricingMode]
  );

  // Commit state to undo stack
  const pushHistory = useCallback(
    (nextConfig: StandConfig, nextItems: StandItem[]) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIdx + 1);
        const updated = [...sliced, cloneSnapshot(nextConfig, nextItems)].slice(-40);
        setHistoryIdx(updated.length - 1);
        return updated;
      });
    },
    [historyIdx]
  );

  const handleUndo = useCallback(() => {
    if (historyIdx <= 0) return;
    const target = history[historyIdx - 1];
    setHistoryIdx(historyIdx - 1);
    setConfig(JSON.parse(JSON.stringify(target.config)));
    setItems(JSON.parse(JSON.stringify(target.items)));
  }, [history, historyIdx]);

  const handleRedo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const target = history[historyIdx + 1];
    setHistoryIdx(historyIdx + 1);
    setConfig(JSON.parse(JSON.stringify(target.config)));
    setItems(JSON.parse(JSON.stringify(target.items)));
  }, [history, historyIdx]);

  // Auto-save active project to localStorage
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === activeProjectId
            ? {
                ...p,
                name: projectName,
                updatedAt: Date.now(),
                config,
                items,
                customAssets,
              }
            : p
        );
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // storage quota exceeded if huge images uploaded; silently skip persistence
        }
        return next;
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, projectName, config, items, customAssets]);

  const updateConfig = useCallback(
    (patch: Partial<StandConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch };
        pushHistory(next, items);
        return next;
      });
    },
    [items, pushHistory]
  );

  const [customModels, setCustomModels] = useState<CustomModelAsset[]>([]);

  const addCatalogItem = useCallback(
    (catalogId: string, dropX?: number, dropZ?: number) => {
      const def = CATALOG_MAP[catalogId];
      if (!def) return;
      const offsetJitter = ((items.length % 5) - 2) * 0.22;
      const px =
        dropX !== undefined
          ? dropX
          : Math.max(-config.width / 2 + 0.5, Math.min(config.width / 2 - 0.5, offsetJitter));
      const pz =
        dropZ !== undefined
          ? dropZ
          : Math.max(-config.depth / 2 + 0.5, Math.min(config.depth / 2 - 0.5, offsetJitter * 0.7));
      const newItem: StandItem = {
        id: createItemId(catalogId),
        catalogId,
        name: def.name,
        x: px,
        y: def.elevatedY ?? 0,
        z: pz,
        rotationY: 0,
        dims: { ...def.defaultDims },
        backlit: def.supportsBacklit ? true : false,
        locked: false,
        visible: true,
        artwork: {},
      };
      const nextItems = [...items, newItem];
      setItems(nextItems);
      setSelectedItemId(newItem.id);
      setSelectedSurfaceId(def.surfaces[0]?.id || null);
      setSelectedShellWall(null);
      pushHistory(config, nextItems);
      notify(`Added ${def.shortName}`);
    },
    [items, config, pushHistory, notify]
  );

  const placeCustomModelAsset = useCallback(
    (asset: CustomModelAsset, dropX?: number, dropZ?: number) => {
      const px = dropX !== undefined ? dropX : 0;
      const pz = dropZ !== undefined ? dropZ : 0.15;
      const newItem: StandItem = {
        id: createItemId('model3d'),
        catalogId: 'custom-3d-model',
        name: asset.name,
        customModelId: asset.id,
        x: px,
        y: 0,
        z: pz,
        rotationY: 0,
        dims: { ...asset.originalDims },
        lockAspect: true,
        zUpFix: false,
        locked: false,
        visible: true,
        artwork: {},
      };
      const nextItems = [...items, newItem];
      setItems(nextItems);
      setSelectedItemId(newItem.id);
      setSelectedSurfaceId(null);
      setSelectedShellWall(null);
      pushHistory(config, nextItems);
      notify(`Placed 3D model "${asset.name}" (${asset.originalDims.w}×${asset.originalDims.d}m)`);
    },
    [items, config, pushHistory, notify]
  );

  const handleUpload3DModels = useCallback(
    async (files: FileList, dropX?: number, dropZ?: number) => {
      const modelFiles = Array.from(files).filter(isSupportedModelFile);
      if (modelFiles.length === 0) {
        notify('Drop a .GLB, .GLTF, .STL, or .OBJ 3D model file (or upload images in Brand tab)');
        return;
      }
      let placedCount = 0;
      for (const file of modelFiles) {
        try {
          const asset = await parseAndRegister3DModel(file);
          setCustomModels((prev) => [asset, ...prev]);
          placeCustomModelAsset(
            asset,
            dropX !== undefined ? Number((dropX + placedCount * 0.4).toFixed(2)) : undefined,
            dropZ
          );
          placedCount += 1;
        } catch (err) {
          console.error(err);
          notify(`Could not parse 3D file "${file.name}"`);
        }
      }
    },
    [placeCustomModelAsset, notify]
  );

  const handleLoadSampleMachine = useCallback(() => {
    const sample = registerSampleShowcaseMachine();
    setCustomModels((prev) => (prev.some((m) => m.id === sample.id) ? prev : [sample, ...prev]));
    placeCustomModelAsset(sample, 0.4, 0.2);
  }, [placeCustomModelAsset]);

  const updateItem = useCallback(
    (id: string, patch: Partial<StandItem>, commit = true) => {
      setItems((prev) => {
        const next = prev.map((it) => (it.id === id ? { ...it, ...patch } : it));
        if (commit) pushHistory(config, next);
        return next;
      });
    },
    [config, pushHistory]
  );

  const moveItem = useCallback(
    (id: string, x: number, z: number, commit: boolean) => {
      setItems((prev) => {
        const next = prev.map((it) => (it.id === id ? { ...it, x, z } : it));
        if (commit) pushHistory(config, next);
        return next;
      });
    },
    [config, pushHistory]
  );

  const updateItemArtwork = useCallback(
    (itemId: string, surfaceId: string, patch: Partial<SurfaceArtwork>) => {
      setItems((prev) => {
        const next = prev.map((it) => {
          if (it.id !== itemId) return it;
          const cur: SurfaceArtwork = it.artwork[surfaceId] || {
            assetId: null,
            fit: 'cover',
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            bgColor: config.primaryColor,
            emissive: false,
          };
          return {
            ...it,
            artwork: {
              ...it.artwork,
              [surfaceId]: { ...cur, ...patch },
            },
          };
        });
        pushHistory(config, next);
        return next;
      });
    },
    [config, pushHistory]
  );

  const updateShellArtwork = useCallback(
    (side: ShellWallSide, patch: Partial<SurfaceArtwork> | null) => {
      setConfig((prev) => {
        const nextShell = { ...prev.shellArtwork };
        if (patch === null) {
          delete nextShell[side];
        } else {
          const cur: SurfaceArtwork = nextShell[side] || {
            assetId: null,
            fit: 'cover',
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            bgColor: prev.primaryColor,
            emissive: false,
          };
          nextShell[side] = { ...cur, ...patch };
        }
        const nextCfg = { ...prev, shellArtwork: nextShell };
        pushHistory(nextCfg, items);
        return nextCfg;
      });
    },
    [items, pushHistory]
  );

  const duplicateItem = useCallback(
    (id: string) => {
      const src = items.find((i) => i.id === id);
      if (!src) return;
      const copy: StandItem = {
        ...JSON.parse(JSON.stringify(src)),
        id: createItemId(src.catalogId),
        x: Number((src.x + 0.35).toFixed(2)),
        z: Number((src.z + 0.25).toFixed(2)),
        locked: false,
      };
      const nextItems = [...items, copy];
      setItems(nextItems);
      setSelectedItemId(copy.id);
      pushHistory(config, nextItems);
      notify(`Duplicated ${src.name}`);
    },
    [items, config, pushHistory, notify]
  );

  const deleteItem = useCallback(
    (id: string) => {
      const nextItems = items.filter((i) => i.id !== id);
      setItems(nextItems);
      if (selectedItemId === id) {
        setSelectedItemId(null);
        setSelectedSurfaceId(null);
      }
      pushHistory(config, nextItems);
      notify('Removed equipment from stand');
    },
    [items, selectedItemId, config, pushHistory, notify]
  );

  const handleUploadAssets = useCallback(
    async (files: FileList) => {
      const uploaded: BrandAsset[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        try {
          uploaded.push(await readImageFile(file));
        } catch {
          // skip unreadable
        }
      }
      if (uploaded.length > 0) {
        setCustomAssets((prev) => [...uploaded, ...prev]);
        setPaintAssetId(uploaded[0].id);
        notify(`Uploaded ${uploaded.length} graphic${uploaded.length > 1 ? 's' : ''} — click any 3D surface to assign!`);
      }
    },
    [notify]
  );

  const handleUploadAssetForSurface = useCallback(
    async (
      file: File,
      target:
        | { kind: 'item'; itemId: string; surfaceId: string }
        | { kind: 'shell'; side: ShellWallSide }
    ) => {
      try {
        const asset = await readImageFile(file);
        setCustomAssets((prev) => [asset, ...prev]);
        if (target.kind === 'item') {
          updateItemArtwork(target.itemId, target.surfaceId, {
            assetId: asset.id,
            fit: asset.category === 'logo' ? 'contain' : 'cover',
          });
        } else {
          updateShellArtwork(target.side, {
            assetId: asset.id,
            fit: 'cover',
          });
        }
        notify(`Applied "${asset.name}" to stand surface`);
      } catch {
        notify('Could not load image file');
      }
    },
    [updateItemArtwork, updateShellArtwork, notify]
  );

  const handlePaintSurface = useCallback(
    (
      target:
        | { kind: 'item'; itemId: string; surfaceId: string }
        | { kind: 'shell'; side: ShellWallSide }
    ) => {
      if (!paintAssetId) return;
      const asset = assetsMap.get(paintAssetId);
      const fit = asset?.category === 'logo' ? 'contain' : 'cover';
      if (target.kind === 'item') {
        updateItemArtwork(target.itemId, target.surfaceId, {
          assetId: paintAssetId,
          fit,
        });
        notify(`Applied "${asset?.name || 'Artwork'}" to surface`);
      } else {
        updateShellArtwork(target.side, {
          assetId: paintAssetId,
          fit: 'cover',
        });
        notify(`Applied "${asset?.name || 'Artwork'}" to ${target.side.toUpperCase()} wall`);
      }
    },
    [paintAssetId, assetsMap, updateItemArtwork, updateShellArtwork, notify]
  );

  const applyTemplate = useCallback(
    (template: StandTemplate) => {
      const inst = instantiateTemplate(template);
      setConfig(inst.config);
      setItems(inst.items);
      setSelectedItemId(null);
      setSelectedSurfaceId(null);
      setSelectedShellWall(null);
      setPaintAssetId(null);
      pushHistory(inst.config, inst.items);
      setTimeout(() => viewportRef.current?.setCameraPreset('isometric', true), 40);
      notify(`Loaded "${template.name}" template`);
    },
    [pushHistory, notify]
  );

  const startBlankStand = useCallback(
    (w: number, d: number, openSides: 1 | 2 | 3 | 4) => {
      const nextCfg: StandConfig = {
        ...DEFAULT_STAND_CONFIG,
        width: w,
        depth: d,
        openSides,
        showShellWalls: openSides < 4,
      };
      setConfig(nextCfg);
      setItems([]);
      setSelectedItemId(null);
      setSelectedShellWall(null);
      pushHistory(nextCfg, []);
      setTimeout(() => viewportRef.current?.setCameraPreset('isometric', true), 40);
      notify(`Created blank ${w}×${d}m stand`);
    },
    [pushHistory, notify]
  );

  // Export Actions
  const handleDownloadPng = useCallback(() => {
    const dataUrl = viewportRef.current?.captureSnapshot(1600, 1000);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-3d-render.png`;
    a.click();
    notify('Saved 1600×1000 studio PNG snapshot');
  }, [projectName, notify]);

  const handleExportBrief = useCallback(() => {
    const snap = viewportRef.current?.captureSnapshot(1400, 840) || null;
    exportProductionBriefHtml(
      projectName,
      config,
      items,
      assetsMap,
      snap,
      currency,
      pricingMode
    );
    notify('Opened print-ready Exhibition Production Brief');
  }, [projectName, config, items, assetsMap, currency, pricingMode, notify]);

  const handleDownloadJson = useCallback(() => {
    const payload: SavedProject = {
      id: activeProjectId,
      name: projectName,
      updatedAt: Date.now(),
      config,
      items,
      customAssets,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zuki-stand.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Exported project .JSON backup');
  }, [activeProjectId, projectName, config, items, customAssets, notify]);

  const handleImportJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || '')) as SavedProject;
          if (!parsed.config || !Array.isArray(parsed.items)) throw new Error('Invalid');
          const newId = `proj-${Date.now().toString(36)}`;
          const imported: SavedProject = {
            ...parsed,
            id: newId,
            updatedAt: Date.now(),
          };
          setProjects((prev) => [imported, ...prev]);
          setActiveProjectId(newId);
          setProjectName(imported.name || 'Imported Stand');
          setConfig(imported.config);
          setItems(imported.items);
          setCustomAssets(imported.customAssets || []);
          pushHistory(imported.config, imported.items);
          notify(`Imported "${imported.name}"`);
        } catch {
          notify('Invalid Zuki Exhibition Planner JSON file');
        }
      };
      reader.readAsText(file);
    },
    [pushHistory, notify]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedItemId) {
        e.preventDefault();
        duplicateItem(selectedItemId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemId) {
        e.preventDefault();
        deleteItem(selectedItemId);
      } else if (e.key.toLowerCase() === 'r' && selectedItemId) {
        const cur = items.find((i) => i.id === selectedItemId);
        if (cur) {
          updateItem(cur.id, { rotationY: (cur.rotationY + 90) % 360 }, true);
        }
      } else if (e.key === 'Escape') {
        setPaintAssetId(null);
        setSelectedItemId(null);
        setSelectedShellWall(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, selectedItemId, duplicateItem, deleteItem, items, updateItem]);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  const triggerCamera = useCallback(
    (preset: CameraPreset) => {
      if (preset === 'top') {
        setViewMode('2d');
      } else if (preset === 'eye-level') {
        setViewMode('eye-level');
      } else {
        if (viewMode !== '3d') setViewMode('3d');
        setTimeout(() => viewportRef.current?.setCameraPreset(preset), 10);
      }
    },
    [viewMode]
  );

  const runAgentTurn = useCallback(
    async (opts: { text?: string; audio?: AgentAudioPayload; viaVoice?: boolean }) => {
      if (agentLoading) return;
      const userMsgId = `msg-${Date.now().toString(36)}-u`;
      const initialUserContent =
        opts.text?.trim() || (opts.audio ? `Voice request (${opts.audio.durationSec}s audio)` : '');

      if (!initialUserContent && !opts.audio) return;

      const historyTurns: AgentHistoryTurn[] = agentMessages
        .filter((m): m is AgentChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      setAgentMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: 'user',
          content: initialUserContent,
          timestamp: Date.now(),
          viaVoice: opts.viaVoice || Boolean(opts.audio),
        },
      ]);
      setAgentLoading(true);

      try {
        const resp = await sendStandAgentPrompt({
          message: opts.text,
          audio: opts.audio,
          history: historyTurns,
          config,
          items,
        });

        // If the server transcribed an audio clip, replace the placeholder user bubble
        if (resp.transcript && opts.audio) {
          setAgentMessages((prev) =>
            prev.map((m) => (m.id === userMsgId ? { ...m, content: resp.transcript! } : m))
          );
        }

        const exec = applyAgentActions(config, items, resp.actions || []);
        if (exec.mutated) {
          setConfig(exec.nextConfig);
          setItems(exec.nextItems);
          setSelectedItemId(null);
          setSelectedSurfaceId(null);
          setSelectedShellWall(null);
          pushHistory(exec.nextConfig, exec.nextItems);
          notify(
            exec.appliedSummaries.length === 1
              ? exec.appliedSummaries[0]
              : `AI applied ${exec.appliedSummaries.length} stand updates`
          );
        }
        if (exec.cameraPreset) {
          triggerCamera(exec.cameraPreset);
        }

        setAgentMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now().toString(36)}-a`,
            role: 'assistant',
            content: resp.reply,
            timestamp: Date.now(),
            appliedSummaries: exec.appliedSummaries,
            warnings: exec.warnings,
            meta: resp.meta,
            canUndo: exec.mutated,
          },
        ]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to reach AI Stand Designer right now.';
        setAgentMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now().toString(36)}-e`,
            role: 'system',
            content: message,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setAgentLoading(false);
      }
    },
    [agentLoading, agentMessages, config, items, pushHistory, notify, triggerCamera]
  );

  const startWalkthrough = useCallback(() => {
    setViewMode('3d');
    setSelectedItemId(null);
    setSelectedShellWall(null);
    setPaintAssetId(null);
    setTourPaused(false);
    setTourActive(true);
  }, []);

  const handleCompleteSetup = useCallback(
    async (result: BrandKitSetupResult) => {
      ensureGoogleFontPairingLoaded(result.displayFont, result.bodyFont);
      applyDocumentFavicon(result.faviconDataUrl);

      const built = buildBrandedStandFromSetup(STAND_TEMPLATES[0], result);

      // Parse any uploaded 3D model files and place them on the pavilion floor
      const extraModelItems: StandItem[] = [];
      const newlyLoadedModels: CustomModelAsset[] = [];
      for (let i = 0; i < result.customModelFiles.length; i++) {
        try {
          const modelAsset = await parseAndRegister3DModel(result.customModelFiles[i]);
          newlyLoadedModels.push(modelAsset);
          extraModelItems.push({
            id: createItemId('model3d'),
            catalogId: 'custom-3d-model',
            name: modelAsset.name,
            customModelId: modelAsset.id,
            x: Number((-1.2 + i * 0.9).toFixed(2)),
            y: 0,
            z: 0.3,
            rotationY: 0,
            dims: { ...modelAsset.originalDims },
            lockAspect: true,
            zUpFix: false,
            locked: false,
            visible: true,
            artwork: {},
          });
        } catch {
          // skip invalid model file
        }
      }

      if (newlyLoadedModels.length > 0) {
        setCustomModels((prev) => [...newlyLoadedModels, ...prev]);
      }

      const finalItems = [...built.items, ...extraModelItems];
      setProjectName(built.projectTitle);
      setConfig(built.config);
      setItems(finalItems);
      setCustomAssets((prev) => {
        const map = new Map<string, BrandAsset>();
        [...built.uploadedAssets, ...prev].forEach((a) => map.set(a.id, a));
        return Array.from(map.values());
      });
      setSelectedItemId(null);
      setSelectedSurfaceId(null);
      setSelectedShellWall(null);
      setPaintAssetId(null);
      setHistory([cloneSnapshot(built.config, finalItems)]);
      setHistoryIdx(0);
      setShowSetupGuide(false);

      if (result.startTour) {
        window.setTimeout(() => startWalkthrough(), 80);
      } else {
        window.setTimeout(() => viewportRef.current?.setCameraPreset('isometric', true), 80);
        notify(`Loaded "${built.projectTitle}"`);
      }
    },
    [startWalkthrough, notify]
  );

  const handleSkipSetup = useCallback(() => {
    const inst = instantiateTemplate(STAND_TEMPLATES[0]);
    setProjectName('Grand Flagship Pavilion (8m × 6m)');
    setConfig(inst.config);
    setItems(inst.items);
    setSelectedItemId(null);
    setSelectedSurfaceId(null);
    setSelectedShellWall(null);
    setHistory([cloneSnapshot(inst.config, inst.items)]);
    setHistoryIdx(0);
    setShowSetupGuide(false);
    window.setTimeout(() => startWalkthrough(), 80);
  }, [startWalkthrough]);

  const openSidesBadge =
    config.openSides === 1
      ? 'Inline (1 Open)'
      : config.openSides === 2
        ? 'Corner (2 Open)'
        : config.openSides === 3
          ? 'Peninsula (3 Open)'
          : 'Island (4 Open)';

  if (showSetupGuide) {
    return (
      <SetupGuidePage
        initialConfig={config}
        initialAssets={customAssets}
        onComplete={(res) => {
          void handleCompleteSetup(res);
        }}
        onSkipDemo={handleSkipSetup}
      />
    );
  }

  return (
    <div className="studio-app-shell">
      <TopBar
        projectName={projectName}
        onChangeProjectName={setProjectName}
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          if (tourActive) setTourActive(false);
          setViewMode(mode);
        }}
        config={config}
        onUpdateConfig={updateConfig}
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        estimatedTotalGbp={estimate.grandTotalGbp}
        currency={currency}
        agentOpen={showAgentDrawer}
        onToggleAgent={() => setShowAgentDrawer((v) => !v)}
        onOpenSetupGuide={() => {
          setTourActive(false);
          setShowSetupGuide(true);
        }}
        onOpenProjects={() => setShowProjectsModal(true)}
        onOpenTemplates={() => setShowTemplatesModal(true)}
        onOpenEstimate={() => setShowEstimateModal(true)}
        onOpenExport={() => setShowExportModal(true)}
      />

      <main className="studio-workspace">
        <LeftSidebar
          activeTab={sidebarTab}
          onChangeTab={setSidebarTab}
          config={config}
          onUpdateConfig={updateConfig}
          items={items}
          selectedItemId={selectedItemId}
          onSelectItem={(id) => {
            setSelectedItemId(id);
            setSelectedShellWall(null);
          }}
          onAddCatalogItem={addCatalogItem}
          onDuplicateItem={duplicateItem}
          onDeleteItem={deleteItem}
          onUpdateItem={(id, patch) => updateItem(id, patch, true)}
          assets={allAssets}
          onUploadAssets={handleUploadAssets}
          onDeleteAsset={(id) => {
            setCustomAssets((prev) => prev.filter((a) => a.id !== id));
            if (paintAssetId === id) setPaintAssetId(null);
          }}
          customModels={customModels}
          onUpload3DModels={(files) => handleUpload3DModels(files)}
          onPlaceCustomModel={(modelId) => {
            const m = customModels.find((x) => x.id === modelId);
            if (m) placeCustomModelAsset(m);
          }}
          onLoadSampleMachine={handleLoadSampleMachine}
          paintAssetId={paintAssetId}
          onSetPaintAssetId={setPaintAssetId}
          onApplyTemplate={applyTemplate}
          currency={currency}
          pricingMode={pricingMode}
        />

        <section className="viewport-stage" aria-label="Interactive 3D exhibition stand canvas">
          <StandViewport3D
            ref={viewportRef}
            config={config}
            items={items}
            assetsMap={assetsMap}
            selectedItemId={selectedItemId}
            selectedShellWall={selectedShellWall}
            viewMode={viewMode}
            compliance={compliance}
            paintAssetId={paintAssetId}
            tourActive={tourActive && !tourPaused}
            onUserInterruptTour={() => setTourPaused(true)}
            onSelectItem={(itemId, surfaceId) => {
              setSelectedItemId(itemId);
              setSelectedSurfaceId(surfaceId || null);
            }}
            onSelectShellWall={setSelectedShellWall}
            onMoveItem={moveItem}
            onPaintSurface={handlePaintSurface}
            onDropCatalogItem={(catalogId, x, z) => addCatalogItem(catalogId, x, z)}
            onDropCustomModelAsset={(modelId, x, z) => {
              const m = customModels.find((cm) => cm.id === modelId);
              if (m) placeCustomModelAsset(m, x, z);
            }}
            onDrop3DFiles={(files, x, z) => handleUpload3DModels(files, x, z)}
          />

          {/* Top-Left Floating Space & Compliance HUD */}
          <div className="viewport-hud-top">
            <div className="hud-space-pill">
              <strong className="mono-num">
                {formatLength(config.width, config.unit)} × {formatLength(config.depth, config.unit)}
              </strong>
              <span className="hud-sep">·</span>
              <span className="mono-num">{formatArea(compliance.areaM2, config.unit)}</span>
              <span className="hud-sep">·</span>
              <span>{openSidesBadge}</span>
            </div>

            <div className={`hud-compliance-pill ${compliance.isCompliant ? 'ok' : 'warn'}`}>
              {compliance.isCompliant ? (
                <>
                  <CheckCircle2 size={13} />
                  <span>Within Bounds</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={13} />
                  <span>
                    {compliance.outOfBoundsIds.length > 0
                      ? `${compliance.outOfBoundsIds.length} Out of Bounds`
                      : `${compliance.overHeightIds.length} Over Height Limit`}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 30-Second HyperFrames-Styled Cinematic Walkthrough */}
          <StudioWalkthrough
            active={tourActive}
            paused={tourPaused}
            config={config}
            viewportRef={viewportRef}
            onTogglePause={() => setTourPaused((p) => !p)}
            onFinish={() => {
              setTourActive(false);
              setTourPaused(false);
              notify('Walkthrough complete — click any element to start customizing!');
            }}
            onSkip={() => {
              setTourActive(false);
              setTourPaused(false);
              viewportRef.current?.setCameraPreset('isometric');
            }}
          />

          {/* Bottom-Center Floating Camera Dock (hidden while 30s timeline bar is active) */}
          {!tourActive && (
            <div className="viewport-camera-dock" role="toolbar" aria-label="Camera views">
              <button onClick={() => triggerCamera('isometric')} title="Isometric 3D overview">
                <Compass size={14} />
                <span>Iso</span>
              </button>
              <button onClick={() => triggerCamera('front')} title="Front elevation view">
                <Maximize2 size={14} />
                <span>Front</span>
              </button>
              <button onClick={() => triggerCamera('left')} title="Left angle">
                <span>Left</span>
              </button>
              <button onClick={() => triggerCamera('right')} title="Right angle">
                <span>Right</span>
              </button>
              <button onClick={() => triggerCamera('top')} title="2D Top-Down Floor Plan">
                <Grid2x2 size={14} />
                <span>Top 2D</span>
              </button>
              <button onClick={() => triggerCamera('eye-level')} title="Visitor eye-level view (1.65m)">
                <Eye size={14} />
                <span>Eye Level</span>
              </button>
              <div className="dock-divider" />
              <button onClick={startWalkthrough} title="Replay 30-second animated walkthrough">
                <Play size={13} />
                <span>30s Tour</span>
              </button>
              <button onClick={handleDownloadPng} title="Download high-res PNG render">
                <Camera size={14} />
                <span>Snapshot</span>
              </button>
              <button
                onClick={() => viewportRef.current?.setCameraPreset(viewMode === '2d' ? 'top' : 'isometric')}
                title="Reset camera"
                aria-label="Reset camera"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          )}

          <AgentDrawer
            open={showAgentDrawer}
            onClose={() => setShowAgentDrawer(false)}
            messages={agentMessages}
            isLoading={agentLoading}
            canUndo={historyIdx > 0}
            onSendText={(text, viaVoice) => runAgentTurn({ text, viaVoice })}
            onSendAudio={(audio) => runAgentTurn({ audio, viaVoice: true })}
            onUndoLastTurn={() => {
              handleUndo();
              notify('Undid AI stand changes');
            }}
            onClearChat={() => setAgentMessages([])}
          />

          {toast && <div className="studio-toast">{toast}</div>}
        </section>

        <RightInspector
          config={config}
          onUpdateConfig={updateConfig}
          selectedItem={selectedItem}
          selectedSurfaceId={selectedSurfaceId}
          selectedShellWall={selectedShellWall}
          onSelectShellWall={setSelectedShellWall}
          onUpdateItem={updateItem}
          onUpdateItemArtwork={updateItemArtwork}
          onUpdateShellArtwork={updateShellArtwork}
          onDuplicateItem={duplicateItem}
          onDeleteItem={deleteItem}
          assets={allAssets}
          onUploadAssetForSurface={handleUploadAssetForSurface}
          compliance={compliance}
          onOpenBrandingTab={() => setSidebarTab('branding')}
        />
      </main>

      <TemplatesModal
        open={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
        onApplyTemplate={applyTemplate}
        onStartBlank={startBlankStand}
      />

      <EstimateModal
        open={showEstimateModal}
        onClose={() => setShowEstimateModal(false)}
        config={config}
        items={items}
        currency={currency}
        onChangeCurrency={setCurrency}
        pricingMode={pricingMode}
        onChangePricingMode={setPricingMode}
        onExportBrief={handleExportBrief}
      />

      <ProjectsModal
        open={showProjectsModal}
        onClose={() => setShowProjectsModal(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSaveNewCopy={() => {
          const newId = `proj-${Date.now().toString(36)}`;
          const copy: SavedProject = {
            id: newId,
            name: `${projectName} (Copy)`,
            updatedAt: Date.now(),
            config: JSON.parse(JSON.stringify(config)),
            items: JSON.parse(JSON.stringify(items)),
            customAssets: [...customAssets],
          };
          setProjects((prev) => [copy, ...prev]);
          setActiveProjectId(newId);
          setProjectName(copy.name);
          notify(`Saved copy "${copy.name}"`);
        }}
        onLoadProject={(proj) => {
          setActiveProjectId(proj.id);
          setProjectName(proj.name);
          setConfig(proj.config);
          setItems(proj.items);
          setCustomAssets(proj.customAssets || []);
          setSelectedItemId(null);
          setSelectedShellWall(null);
          setHistory([cloneSnapshot(proj.config, proj.items)]);
          setHistoryIdx(0);
          notify(`Loaded "${proj.name}"`);
        }}
        onDeleteProject={(id) => {
          setProjects((prev) => {
            const next = prev.filter((p) => p.id !== id);
            if (id === activeProjectId && next[0]) {
              setActiveProjectId(next[0].id);
              setProjectName(next[0].name);
              setConfig(next[0].config);
              setItems(next[0].items);
            }
            return next;
          });
        }}
        onImportJson={handleImportJson}
      />

      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        onDownloadPng={handleDownloadPng}
        onExportBrief={handleExportBrief}
        onDownloadJson={handleDownloadJson}
      />
    </div>
  );
}

export default App;
