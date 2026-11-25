import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Compass,
  Focus,
  Hand,
  Maximize2,
  MousePointer2,
  Orbit,
  Play,
  RotateCcw,
  Settings2,
  ZoomIn,
  ZoomOut,
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
import { ProjectsDashboard } from './components/ProjectsDashboard';
import { RightInspector } from './components/RightInspector';
import { SetupGuidePage } from './components/SetupGuidePage';
import { StudioWalkthrough, WALKTHROUGH_DISMISSED_KEY } from './components/StudioWalkthrough';
import { TopBar } from './components/TopBar';
import { AgentDrawer } from './components/AgentDrawer';
import {
  CustomAssetBuilderModal,
  type BuilderMode,
} from './components/CustomAssetBuilderModal';
import { AssetLibraryModal } from './components/AssetLibraryModal';
import type { BetaUser, PublicAuthPromptOptions } from './components/BetaAuthGate';
import { QuoteRequestModal } from './components/QuoteRequestModal';
import { LaunchAdminModal } from './components/LaunchAdminModal';
import { FeedbackBoardModal } from './components/FeedbackBoardModal';
import { applyAgentActions } from './agent/actionExecutor';
import { sendStandAgentPrompt } from './agent/agentClient';
import { findNearestAllowedPosition } from './utils/wallCollision';
import {
  canRedoHistory,
  canUndoHistory,
  createHistoryState,
  pushHistoryState,
  redoHistoryState,
  undoHistoryState,
  type EditorHistoryState,
} from './utils/editorHistory';
import type { AgentAudioPayload, AgentChatMessage, AgentHistoryTurn } from './agent/types';
import type {
  AssetPrimitive,
  BrandAsset,
  BrandKitSetupResult,
  CameraPreset,
  CurrencyCode,
  CustomAssetCategory,
  CustomBuiltAsset,
  CustomModelAsset,
  SavedProject,
  ShellWallSide,
  StandConfig,
  StandItem,
  StandTemplate,
  SurfaceArtwork,
  ViewMode,
  ViewportNavMode,
} from './types/stand';
import {
  applyDocumentFavicon,
  buildBrandedStandFromSetup,
  ensureGoogleFontPairingLoaded,
} from './utils/brandKit';
import { exportProductionBriefHtml } from './utils/briefExport';
import { downloadDesignerSpecCsv, exportDesignerBriefHtml } from './utils/designerExport';
import { calculateEstimate, evaluateCompliance, formatArea, formatLength } from './utils/pricing';
import { trackLaunchMetric } from './utils/launchMetrics';
import { PerformanceAlertPopup } from './components/PerformanceAlertPopup';
import {
  detectInitialPerformanceMode,
  loadSavedPerformanceMode,
  PERFORMANCE_PROFILES,
  savePerformanceMode,
  type PerformanceMode,
  type SlowPerformanceAlert,
  type ViewportPerformanceMetrics,
} from './utils/performanceMode';

const STORAGE_KEY = 'zuki_exhibition_planner_projects_v2';
const ASSET_LIBRARY_STORAGE_KEY = 'zuki_custom_asset_library_v1';
const PURGED_STORAGE_KEYS = [
  'standcraft_studio_projects_v1',
  'zuki_exhibition_planner_projects_v1',
];

function getScopedStorageKey(baseKey: string, userEmail?: string | null): string {
  const clean = (userEmail || '').trim().toLowerCase();
  return clean ? `${baseKey}:${clean}` : baseKey;
}

function loadGlobalBuiltAssets(assetLibraryKey: string): CustomBuiltAsset[] {
  try {
    const raw = localStorage.getItem(assetLibraryKey);
    if (raw) {
      const parsed = JSON.parse(raw) as CustomBuiltAsset[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

interface HistorySnapshot {
  config: StandConfig;
  items: StandItem[];
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

function loadInitialProjects(projectsStorageKey: string): SavedProject[] {
  try {
    for (const legacyKey of PURGED_STORAGE_KEYS) {
      localStorage.removeItem(legacyKey);
    }
    const raw = localStorage.getItem(projectsStorageKey);
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

interface AppProps {
  betaUser?: BetaUser | null;
  publicLaunch?: boolean;
  onSignOut?: () => void;
  onOpenPublicAuth?: (opts?: PublicAuthPromptOptions) => void;
  onOpenSupplierModal?: () => void;
}

function App({
  betaUser,
  publicLaunch = false,
  onSignOut,
  onOpenPublicAuth,
  onOpenSupplierModal,
}: AppProps) {
  const projectsStorageKey = getScopedStorageKey(STORAGE_KEY, betaUser?.email);
  const assetLibraryStorageKey = getScopedStorageKey(ASSET_LIBRARY_STORAGE_KEY, betaUser?.email);

  const [projects, setProjects] = useState<SavedProject[]>(() =>
    loadInitialProjects(projectsStorageKey)
  );
  const [activeProjectId, setActiveProjectId] = useState<string>(() => projects[0]?.id || 'proj-default');

  const activeProj = projects.find((p) => p.id === activeProjectId) || projects[0];

  const [projectName, setProjectName] = useState<string>(activeProj.name);
  const [config, setConfig] = useState<StandConfig>(activeProj.config);
  const [items, setItems] = useState<StandItem[]>(activeProj.items);
  const [customAssets, setCustomAssets] = useState<BrandAsset[]>(activeProj.customAssets || []);
  const [customBuiltAssets, setCustomBuiltAssets] = useState<CustomBuiltAsset[]>(() => {
    const globalList = loadGlobalBuiltAssets(assetLibraryStorageKey);
    const projList = activeProj.customBuiltAssets || [];
    const merged = new Map<string, CustomBuiltAsset>();
    for (const a of [...globalList, ...projList]) merged.set(a.id, a);
    return Array.from(merged.values());
  });

  useEffect(() => {
    try {
      localStorage.setItem(assetLibraryStorageKey, JSON.stringify(customBuiltAssets));
    } catch {
      // ignore storage quota errors
    }
  }, [assetLibraryStorageKey, customBuiltAssets]);

  // Main Projects Dashboard, Setup Guide & Guided Walkthrough Popup state
  const [showDashboard, setShowDashboard] = useState<boolean>(true);
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(false);
  const [tourActive, setTourActive] = useState<boolean>(false);

  // Sync brand fonts and browser favicon whenever config updates
  useEffect(() => {
    ensureGoogleFontPairingLoaded(config.displayFont, config.bodyFont);
    applyDocumentFavicon(config.faviconDataUrl);
  }, [config.displayFont, config.bodyFont, config.faviconDataUrl]);

  // Atomic undo/redo history stack
  const [historyState, setHistoryState] = useState<EditorHistoryState<HistorySnapshot>>(() =>
    createHistoryState({ config: activeProj.config, items: activeProj.items })
  );
  const canUndo = canUndoHistory(historyState);
  const canRedo = canRedoHistory(historyState);

  // UI & selection state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('catalog');
  const [railPanelOpen, setRailPanelOpen] = useState(false);
  const [standDetailsOpen, setStandDetailsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [viewportNavMode, setViewportNavMode] = useState<ViewportNavMode>('select');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string | null>(null);
  const [selectedShellWall, setSelectedShellWall] = useState<ShellWallSide | null>(null);
  const [paintAssetId, setPaintAssetId] = useState<string | null>(null);
  const [clipboardItem, setClipboardItem] = useState<StandItem | null>(null);
  const pasteCountRef = useRef<number>(0);
  const [currency, setCurrency] = useState<CurrencyCode>('GBP');
  const [pricingMode, setPricingMode] = useState<'hire' | 'buy'>('hire');

  // Modals & AI Designer drawer
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showQuoteRequestModal, setShowQuoteRequestModal] = useState(false);
  const [showAdminInsightsModal, setShowAdminInsightsModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [showAssetBuilder, setShowAssetBuilder] = useState(false);
  const [assetBuilderMode, setAssetBuilderMode] = useState<BuilderMode>('shapes');
  const [assetBuilderContext, setAssetBuilderContext] = useState<'editor' | 'dashboard'>('editor');
  const [editingCustomAsset, setEditingCustomAsset] = useState<{
    itemId?: string;
    assetId?: string;
    name: string;
    category?: CustomAssetCategory;
    primitives: AssetPrimitive[];
  } | null>(null);
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

  // Device graphics & performance mode (persisted per device in localStorage)
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(
    () => loadSavedPerformanceMode() ?? detectInitialPerformanceMode()
  );
  const [performanceMetrics, setPerformanceMetrics] = useState<ViewportPerformanceMetrics | null>(
    null
  );
  const handlePerformanceMetrics = useCallback((next: ViewportPerformanceMetrics) => {
    setPerformanceMetrics((prev) => {
      if (
        prev &&
        prev.avgFps === next.avgFps &&
        prev.isIdle === next.isIdle &&
        prev.isSoftwareWebGL === next.isSoftwareWebGL
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const [slowPerfAlert, setSlowPerfAlert] = useState<SlowPerformanceAlert | null>(null);
  const dismissedSlowModesRef = useRef<Set<PerformanceMode>>(new Set());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const handleChangePerformanceMode = useCallback(
    (nextMode: PerformanceMode) => {
      setPerformanceMode(nextMode);
      savePerformanceMode(nextMode);
      setSlowPerfAlert(null);
      // Allow future alerts if user switches to a higher mode that later runs slow
      dismissedSlowModesRef.current.delete(nextMode);
      const profile = PERFORMANCE_PROFILES[nextMode];
      notify(`Performance: ${profile.label} — ${profile.tagline}`);
    },
    [notify]
  );

  const handleSlowPerformanceDetected = useCallback((alert: SlowPerformanceAlert) => {
    if (dismissedSlowModesRef.current.has(alert.currentMode)) return;
    setSlowPerfAlert(alert);
  }, []);

  const handleDismissSlowAlert = useCallback(() => {
    setSlowPerfAlert((prev) => {
      if (prev) dismissedSlowModesRef.current.add(prev.currentMode);
      return null;
    });
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

  // Reset or commit state to atomic undo stack
  const resetHistory = useCallback((nextConfig: StandConfig, nextItems: StandItem[]) => {
    setHistoryState(createHistoryState({ config: nextConfig, items: nextItems }));
  }, []);

  const pushHistory = useCallback((nextConfig: StandConfig, nextItems: StandItem[]) => {
    setHistoryState((prev) => pushHistoryState(prev, { config: nextConfig, items: nextItems }, { maxEntries: 50 }));
  }, []);

  const handleUndo = useCallback(() => {
    setHistoryState((prev) => {
      const { nextState, snapshot } = undoHistoryState(prev);
      if (!snapshot) return prev;
      setConfig(snapshot.config);
      setItems(snapshot.items);
      setSelectedItemId((cur) => (cur && snapshot.items.some((i) => i.id === cur) ? cur : null));
      notify('Undid last change');
      return nextState;
    });
  }, [notify]);

  const handleRedo = useCallback(() => {
    setHistoryState((prev) => {
      const { nextState, snapshot } = redoHistoryState(prev);
      if (!snapshot) return prev;
      setConfig(snapshot.config);
      setItems(snapshot.items);
      setSelectedItemId((cur) => (cur && snapshot.items.some((i) => i.id === cur) ? cur : null));
      notify('Redid change');
      return nextState;
    });
  }, [notify]);

  // Persist any project-list mutations (create, duplicate, rename, delete) to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(projectsStorageKey, JSON.stringify(projects));
    } catch {
      // storage quota exceeded if huge images uploaded; silently skip persistence
    }
  }, [projects, projectsStorageKey]);

  // Auto-save active project edits into projects array
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProjects((prev) =>
        prev.map((p) =>
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
        )
      );
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
      const resolved = findNearestAllowedPosition(newItem, px, pz, config, items);
      newItem.x = resolved.x;
      newItem.z = resolved.z;
      const nextItems = [...items, newItem];
      setItems(nextItems);
      setRailPanelOpen(false);
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
        zUpFix: Boolean(asset.zUpFix),
        modelTintColor: asset.defaultTintColor,
        locked: false,
        visible: true,
        artwork: {},
      };
      const resolved = findNearestAllowedPosition(newItem, px, pz, config, items);
      newItem.x = resolved.x;
      newItem.z = resolved.z;
      const nextItems = [...items, newItem];
      setItems(nextItems);
      setRailPanelOpen(false);
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

  const placeCustomBuiltAsset = useCallback(
    (asset: CustomBuiltAsset, dropX?: number, dropZ?: number) => {
      const px = dropX !== undefined ? dropX : 0;
      const pz = dropZ !== undefined ? dropZ : 0.15;
      const newItem: StandItem = {
        id: createItemId('built'),
        catalogId: 'custom-built-asset',
        name: asset.name,
        customAssetId: asset.id,
        customPrimitives: asset.primitives.map((p) => ({
          ...p,
          points: p.points ? p.points.map((pt) => ({ ...pt })) : undefined,
        })),
        x: px,
        y: 0,
        z: pz,
        rotationY: 0,
        dims: { ...asset.dims },
        lockAspect: true,
        locked: false,
        visible: true,
        artwork: {},
      };
      const resolved = findNearestAllowedPosition(newItem, px, pz, config, items);
      newItem.x = resolved.x;
      newItem.z = resolved.z;
      const nextItems = [...items, newItem];
      setItems(nextItems);
      setRailPanelOpen(false);
      setSelectedItemId(newItem.id);
      setSelectedSurfaceId(null);
      setSelectedShellWall(null);
      pushHistory(config, nextItems);
      notify(`Placed "${asset.name}" (${asset.dims.w}×${asset.dims.d}×${asset.dims.h}m)`);
    },
    [items, config, pushHistory, notify]
  );

  const handleOpenAssetBuilder = useCallback(
    (mode: BuilderMode, context: 'editor' | 'dashboard' = 'editor') => {
      setEditingCustomAsset(null);
      setAssetBuilderMode(mode);
      setAssetBuilderContext(context);
      setShowAssetBuilder(true);
      setRailPanelOpen(false);
    },
    []
  );

  const handleEditCustomBuiltAsset = useCallback((item: StandItem) => {
    const matched = customBuiltAssets.find((a) => a.id === item.customAssetId);
    setEditingCustomAsset({
      itemId: item.id,
      assetId: item.customAssetId,
      name: item.name,
      category: matched?.category,
      primitives: item.customPrimitives || [],
    });
    setAssetBuilderContext('editor');
    setAssetBuilderMode('shapes');
    setShowAssetBuilder(true);
  }, [customBuiltAssets]);

  const handleEditLibraryBuiltAsset = useCallback((asset: CustomBuiltAsset) => {
    setEditingCustomAsset({
      assetId: asset.id,
      name: asset.name,
      category: asset.category,
      primitives: asset.primitives,
    });
    setAssetBuilderContext('dashboard');
    setAssetBuilderMode('shapes');
    setShowAssetBuilder(true);
  }, []);

  const handleSaveBuiltAsset = useCallback(
    (
      asset: CustomBuiltAsset,
      options: { editingItemId?: string; placeOnStand?: boolean; keepOpen?: boolean }
    ) => {
      setCustomBuiltAssets((prev) => {
        const exists = prev.some((a) => a.id === asset.id);
        return exists ? prev.map((a) => (a.id === asset.id ? asset : a)) : [asset, ...prev];
      });

      if (options.editingItemId) {
        setItems((prev) => {
          const next = prev.map((it) =>
            it.id === options.editingItemId
              ? {
                  ...it,
                  name: asset.name,
                  customAssetId: asset.id,
                  customPrimitives: asset.primitives.map((p) => ({
                    ...p,
                    points: p.points ? p.points.map((pt) => ({ ...pt })) : undefined,
                  })),
                  dims: { ...asset.dims },
                }
              : it
          );
          pushHistory(config, next);
          return next;
        });
        notify(`Updated "${asset.name}" (${asset.dims.w}×${asset.dims.d}×${asset.dims.h}m)`);
      } else if (options.placeOnStand) {
        placeCustomBuiltAsset(asset);
      } else {
        notify(`Saved "${asset.name}" to Asset Library`);
      }

      if (!options.keepOpen) {
        setShowAssetBuilder(false);
        setEditingCustomAsset(null);
      }
    },
    [config, pushHistory, notify, placeCustomBuiltAsset]
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<StandItem>, commit = true) => {
      setItems((prev) => {
        const affectsFootprint =
          patch.x !== undefined ||
          patch.z !== undefined ||
          patch.rotationY !== undefined ||
          patch.dims !== undefined;
        const next = prev.map((it) => {
          if (it.id !== id) return it;
          const updated = { ...it, ...patch };
          if (commit && affectsFootprint) {
            const resolved = findNearestAllowedPosition(
              updated,
              updated.x,
              updated.z,
              config,
              prev,
              { x: it.x, z: it.z }
            );
            updated.x = resolved.x;
            updated.z = resolved.z;
          }
          return updated;
        });
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
      const resolved = findNearestAllowedPosition(copy, copy.x, copy.z, config, items);
      copy.x = resolved.x;
      copy.z = resolved.z;
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

  const copySelectedItem = useCallback(() => {
    if (!selectedItemId) return;
    const src = items.find((i) => i.id === selectedItemId);
    if (!src) return;
    setClipboardItem(JSON.parse(JSON.stringify(src)) as StandItem);
    pasteCountRef.current = 0;
    notify(`Copied ${src.name}`);
  }, [items, selectedItemId, notify]);

  const cutSelectedItem = useCallback(() => {
    if (!selectedItemId) return;
    const src = items.find((i) => i.id === selectedItemId);
    if (!src) return;
    setClipboardItem(JSON.parse(JSON.stringify(src)) as StandItem);
    pasteCountRef.current = 0;
    const nextItems = items.filter((i) => i.id !== selectedItemId);
    setItems(nextItems);
    setSelectedItemId(null);
    setSelectedSurfaceId(null);
    pushHistory(config, nextItems);
    notify(`Cut ${src.name}`);
  }, [items, selectedItemId, config, pushHistory, notify]);

  const pasteClipboardItem = useCallback(() => {
    if (!clipboardItem) return;
    pasteCountRef.current += 1;
    const step = pasteCountRef.current;
    const copy: StandItem = {
      ...(JSON.parse(JSON.stringify(clipboardItem)) as StandItem),
      id: createItemId(clipboardItem.catalogId),
      x: Number((clipboardItem.x + 0.35 * step).toFixed(2)),
      z: Number((clipboardItem.z + 0.25 * step).toFixed(2)),
      locked: false,
    };
    const resolved = findNearestAllowedPosition(copy, copy.x, copy.z, config, items);
    copy.x = resolved.x;
    copy.z = resolved.z;
    const nextItems = [...items, copy];
    setItems(nextItems);
    setSelectedItemId(copy.id);
    setSelectedShellWall(null);
    pushHistory(config, nextItems);
    notify(`Pasted ${clipboardItem.name}`);
  }, [clipboardItem, config, items, pushHistory, notify]);

  const nudgeSelectedItem = useCallback(
    (dx: number, dz: number) => {
      if (!selectedItemId) return;
      const cur = items.find((i) => i.id === selectedItemId);
      if (!cur || cur.locked) return;
      updateItem(
        cur.id,
        {
          x: Number((cur.x + dx).toFixed(3)),
          z: Number((cur.z + dz).toFixed(3)),
        },
        true
      );
    },
    [selectedItemId, items, updateItem]
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

  const requirePublicAccountOrRun = useCallback(
    (reason: string, action: () => void) => {
      if (publicLaunch && !betaUser && onOpenPublicAuth) {
        onOpenPublicAuth({ mode: 'signup', reason, onSuccess: action });
        return;
      }
      action();
    },
    [publicLaunch, betaUser, onOpenPublicAuth]
  );

  // Export Actions
  const handleDownloadPng = useCallback(() => {
    requirePublicAccountOrRun(
      'Create a free account to download high-resolution 3D studio renders.',
      () => {
        const dataUrl = viewportRef.current?.captureSnapshot(1600, 1000);
        if (!dataUrl) return;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-3d-render.png`;
        a.click();
        trackLaunchMetric({
          event: 'png_exported',
          standAreaM2: Math.round(config.width * config.depth),
        });
        notify('Saved 1600×1000 studio PNG snapshot');
      }
    );
  }, [requirePublicAccountOrRun, projectName, config.width, config.depth, notify]);

  const handleExportBrief = useCallback(() => {
    requirePublicAccountOrRun(
      'Create a free account to export print-ready PDF production briefs & BOM schedules.',
      () => {
        const snap = viewportRef.current?.captureSnapshot(1400, 840) || null;
        const est = calculateEstimate(config, items, pricingMode);
        exportProductionBriefHtml(
          projectName,
          config,
          items,
          assetsMap,
          snap,
          currency,
          pricingMode
        );
        trackLaunchMetric({
          event: 'brief_exported',
          estimatedTotalGbp: Math.round(est.grandTotalGbp),
          standAreaM2: Math.round(config.width * config.depth),
          categories: Array.from(
            new Set(items.map((it) => CATALOG_MAP[it.catalogId]?.category).filter(Boolean) as string[])
          ),
        });
        notify('Opened print-ready Exhibition Production Brief');
      }
    );
  }, [requirePublicAccountOrRun, projectName, config, items, assetsMap, currency, pricingMode, notify]);

  const handleExportDesignerPack = useCallback(() => {
    requirePublicAccountOrRun(
      'Create a free account to export the Graphic Designer Artwork Specification Pack.',
      () => {
        const snap = viewportRef.current?.captureSnapshot(1400, 840) || null;
        const est = calculateEstimate(config, items, pricingMode);
        const pack = exportDesignerBriefHtml(projectName, config, items, assetsMap, snap);
        trackLaunchMetric({
          event: 'brief_exported',
          estimatedTotalGbp: Math.round(est.grandTotalGbp),
          standAreaM2: Math.round(config.width * config.depth),
          categories: Array.from(
            new Set(items.map((it) => CATALOG_MAP[it.catalogId]?.category).filter(Boolean) as string[])
          ),
        });
        notify(
          `Opened Designer Artwork Pack (${pack.standSummary.totalBrandedSurfaces} branded surface${pack.standSummary.totalBrandedSurfaces === 1 ? '' : 's'})`
        );
      }
    );
  }, [requirePublicAccountOrRun, projectName, config, items, assetsMap, pricingMode, notify]);

  const handleDownloadDesignerCsv = useCallback(() => {
    requirePublicAccountOrRun(
      'Create a free account to download the Graphic Designer CSV measurements schedule.',
      () => {
        const pack = downloadDesignerSpecCsv(projectName, config, items, assetsMap);
        notify(
          `Downloaded Designer CSV schedule (${pack.standSummary.totalBrandedSurfaces} branded surface${pack.standSummary.totalBrandedSurfaces === 1 ? '' : 's'})`
        );
      }
    );
  }, [requirePublicAccountOrRun, projectName, config, items, assetsMap, notify]);

  const handleDownloadJson = useCallback(() => {
    requirePublicAccountOrRun(
      'Create a free account to export and share project backup files.',
      () => {
        const payload: SavedProject = {
          id: activeProjectId,
          name: projectName,
          updatedAt: Date.now(),
          config,
          items,
          customAssets,
          customBuiltAssets,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pilotstand.json`;
        a.click();
        URL.revokeObjectURL(url);
        trackLaunchMetric({ event: 'json_exported' });
        notify('Exported project .JSON backup');
      }
    );
  }, [requirePublicAccountOrRun, activeProjectId, projectName, config, items, customAssets, customBuiltAssets, notify]);

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
          setShowDashboard(false);
          notify(`Imported "${imported.name}"`);
        } catch {
          notify('Invalid PilotStand JSON file');
        }
      };
      reader.readAsText(file);
    },
    [pushHistory, notify]
  );

  // Keyboard shortcuts (scoped to active main 3D editor, isolated from modals & Custom Asset Builder)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showDashboard || showSetupGuide || showAssetBuilder || showAssetLibrary) return;

      if (e.key === 'Escape') {
        if (showExportModal) {
          setShowExportModal(false);
          return;
        }
        if (showEstimateModal) {
          setShowEstimateModal(false);
          return;
        }
        if (showProjectsModal) {
          setShowProjectsModal(false);
          return;
        }
        if (showTemplatesModal) {
          setShowTemplatesModal(false);
          return;
        }
        if (showQuoteRequestModal) {
          setShowQuoteRequestModal(false);
          return;
        }
        if (showAdminInsightsModal) {
          setShowAdminInsightsModal(false);
          return;
        }
        if (showFeedbackModal) {
          setShowFeedbackModal(false);
          return;
        }
        if (showAgentDrawer) {
          setShowAgentDrawer(false);
          return;
        }
        if (viewportNavMode !== 'select') {
          setViewportNavMode('select');
          return;
        }
        setRailPanelOpen(false);
        setStandDetailsOpen(false);
        setPaintAssetId(null);
        setSelectedItemId(null);
        setSelectedShellWall(null);
        return;
      }

      if (
        showExportModal ||
        showEstimateModal ||
        showProjectsModal ||
        showTemplatesModal ||
        showQuoteRequestModal ||
        showAdminInsightsModal ||
        showFeedbackModal
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (mod && key === 'c' && selectedItemId) {
        e.preventDefault();
        copySelectedItem();
      } else if (mod && key === 'x' && selectedItemId) {
        e.preventDefault();
        cutSelectedItem();
      } else if (mod && key === 'v' && clipboardItem) {
        e.preventDefault();
        pasteClipboardItem();
      } else if (mod && key === 'd' && selectedItemId) {
        e.preventDefault();
        duplicateItem(selectedItemId);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemId) {
        e.preventDefault();
        deleteItem(selectedItemId);
      } else if (!mod && key === 'r' && selectedItemId) {
        e.preventDefault();
        const cur = itemsRef.current.find((i) => i.id === selectedItemId);
        if (cur && !cur.locked) {
          const delta = e.shiftKey ? -90 : 90;
          updateItem(cur.id, { rotationY: (cur.rotationY + delta + 360) % 360 }, true);
        }
      } else if (!mod && (e.key === '[' || e.key === ']') && selectedItemId) {
        e.preventDefault();
        const cur = itemsRef.current.find((i) => i.id === selectedItemId);
        if (cur && !cur.locked) {
          const delta = e.key === '[' ? -15 : 15;
          updateItem(cur.id, { rotationY: (cur.rotationY + delta + 360) % 360 }, true);
        }
      } else if (
        !mod &&
        selectedItemId &&
        (e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown')
      ) {
        e.preventDefault();
        const baseStep = config.snapToGrid ? config.gridStep || 0.1 : 0.1;
        const step = e.altKey ? 0.02 : e.shiftKey ? baseStep * 5 : baseStep;
        if (e.key === 'ArrowLeft') nudgeSelectedItem(-step, 0);
        else if (e.key === 'ArrowRight') nudgeSelectedItem(step, 0);
        else if (e.key === 'ArrowUp') nudgeSelectedItem(0, -step);
        else if (e.key === 'ArrowDown') nudgeSelectedItem(0, step);
      } else if (!mod && key === 'f') {
        e.preventDefault();
        viewportRef.current?.frameSelected();
      } else if (!mod && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        viewportRef.current?.zoomBy(0.82);
      } else if (!mod && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        viewportRef.current?.zoomBy(1.22);
      } else if (!mod && e.key === '0') {
        e.preventDefault();
        viewportRef.current?.setCameraPreset(viewMode === '2d' ? 'top' : viewMode === 'eye-level' ? 'eye-level' : 'isometric');
      } else if (!mod && key === 'v') {
        setViewportNavMode('select');
      } else if (!mod && key === 'o') {
        setViewportNavMode('orbit');
      } else if (!mod && key === 'h') {
        setViewportNavMode('pan');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    showDashboard,
    showSetupGuide,
    showAssetBuilder,
    showAssetLibrary,
    handleUndo,
    handleRedo,
    selectedItemId,
    clipboardItem,
    copySelectedItem,
    cutSelectedItem,
    pasteClipboardItem,
    duplicateItem,
    deleteItem,
    nudgeSelectedItem,
    config.snapToGrid,
    config.gridStep,
    viewMode,
    viewportNavMode,
    updateItem,
    showExportModal,
    showEstimateModal,
    showProjectsModal,
    showTemplatesModal,
    showQuoteRequestModal,
    showAdminInsightsModal,
    showFeedbackModal,
    showAgentDrawer,
  ]);

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
    setTourActive(true);
  }, []);

  const shouldAutoShowWalkthrough = useCallback(() => {
    try {
      return localStorage.getItem(WALKTHROUGH_DISMISSED_KEY) !== 'true';
    } catch {
      return true;
    }
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
      resetHistory(built.config, finalItems);
      setShowSetupGuide(false);

      window.setTimeout(() => viewportRef.current?.setCameraPreset('isometric', true), 80);
      if (result.startTour) {
        window.setTimeout(() => startWalkthrough(), 120);
      } else {
        notify(`Loaded "${built.projectTitle}"`);
      }
    },
    [startWalkthrough, notify, resetHistory]
  );

  const handleSkipSetup = useCallback(() => {
    const inst = instantiateTemplate(STAND_TEMPLATES[0]);
    setProjectName('Grand Flagship Pavilion (8m × 6m)');
    setConfig(inst.config);
    setItems(inst.items);
    setCustomAssets([]);
    setSelectedItemId(null);
    setSelectedSurfaceId(null);
    setSelectedShellWall(null);
    setPaintAssetId(null);
    resetHistory(inst.config, inst.items);
    setShowSetupGuide(false);
    setShowDashboard(false);
    window.setTimeout(() => viewportRef.current?.setCameraPreset('isometric', true), 80);
    if (shouldAutoShowWalkthrough()) {
      window.setTimeout(() => startWalkthrough(), 140);
    }
  }, [startWalkthrough, shouldAutoShowWalkthrough, resetHistory]);

  const handleOpenProject = useCallback(
    (proj: SavedProject) => {
      setActiveProjectId(proj.id);
      setProjectName(proj.name);
      setConfig(proj.config);
      setItems(proj.items);
      setCustomAssets(proj.customAssets || []);
      setSelectedItemId(null);
      setSelectedSurfaceId(null);
      setSelectedShellWall(null);
      setStandDetailsOpen(false);
      resetHistory(proj.config, proj.items);
      setShowDashboard(false);
      window.setTimeout(() => viewportRef.current?.setCameraPreset('isometric', true), 80);
      notify(`Opened "${proj.name}"`);
    },
    [notify, resetHistory]
  );

  const handleCreateBlankProject = useCallback(() => {
    const newId = `proj-${Date.now().toString(36)}`;
    const blankConfig: StandConfig = {
      ...DEFAULT_STAND_CONFIG,
      width: 4,
      depth: 3,
      openSides: 2,
      showShellWalls: true,
    };
    const nextNum = projects.length + 1;
    const newProj: SavedProject = {
      id: newId,
      name: `Untitled Stand ${nextNum}`,
      updatedAt: Date.now(),
      config: blankConfig,
      items: [],
      customAssets: [],
    };
    setProjects((prev) => [newProj, ...prev]);
    handleOpenProject(newProj);
  }, [projects.length, handleOpenProject]);

  const handleCreateProjectFromTemplate = useCallback(
    (tpl: StandTemplate) => {
      const inst = instantiateTemplate(tpl);
      const newId = `proj-${Date.now().toString(36)}`;
      const newProj: SavedProject = {
        id: newId,
        name: `${tpl.name} (${tpl.config.width}m × ${tpl.config.depth}m)`,
        updatedAt: Date.now(),
        config: inst.config,
        items: inst.items,
        customAssets: [],
      };
      setProjects((prev) => [newProj, ...prev]);
      handleOpenProject(newProj);
    },
    [handleOpenProject]
  );

  const handleDuplicateProject = useCallback(
    (proj: SavedProject) => {
      const newId = `proj-${Date.now().toString(36)}`;
      const copy: SavedProject = {
        id: newId,
        name: `${proj.name} (Copy)`,
        updatedAt: Date.now(),
        config: JSON.parse(JSON.stringify(proj.config)),
        items: JSON.parse(JSON.stringify(proj.items)),
        customAssets: [...(proj.customAssets || [])],
      };
      setProjects((prev) => [copy, ...prev]);
      notify(`Duplicated "${proj.name}"`);
    },
    [notify]
  );

  const handleRenameProject = useCallback(
    (id: string, newName: string) => {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: newName, updatedAt: Date.now() } : p))
      );
      if (id === activeProjectId) {
        setProjectName(newName);
      }
      notify(`Renamed to "${newName}"`);
    },
    [activeProjectId, notify]
  );

  const handleDeleteProject = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (id === activeProjectId && next[0]) {
          setActiveProjectId(next[0].id);
          setProjectName(next[0].name);
          setConfig(next[0].config);
          setItems(next[0].items);
          setCustomAssets(next[0].customAssets || []);
          resetHistory(next[0].config, next[0].items);
        }
        return next;
      });
      notify('Deleted project');
    },
    [activeProjectId, notify, resetHistory]
  );

  const handleExportProjectJson = useCallback(
    (proj: SavedProject) => {
      const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${proj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pilotstand.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`Exported "${proj.name}"`);
    },
    [notify]
  );

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
          setShowDashboard(false);
          void handleCompleteSetup(res);
        }}
        onBackToPlanner={() => setShowSetupGuide(false)}
        onSkipDemo={handleSkipSetup}
        onGoToDashboard={() => {
          setShowSetupGuide(false);
          setShowDashboard(true);
        }}
      />
    );
  }

  const totalCustomAssetCount =
    customBuiltAssets.length + customModels.length + customAssets.length;

  const assetModals = (
    <>
      {showAssetLibrary && (
        <AssetLibraryModal
          customBuiltAssets={customBuiltAssets}
          customModels={customModels}
          uploadedGraphics={customAssets}
          onClose={() => setShowAssetLibrary(false)}
          onOpenAssetBuilder={(mode) => {
            setShowAssetLibrary(false);
            handleOpenAssetBuilder(mode, showDashboard ? 'dashboard' : 'editor');
          }}
          onEditBuiltAsset={(asset) => {
            setShowAssetLibrary(false);
            handleEditLibraryBuiltAsset(asset);
          }}
          onDuplicateBuiltAsset={(asset) => {
            const copy: CustomBuiltAsset = {
              ...asset,
              id: `built-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
              name: `${asset.name} (Copy)`,
              primitives: asset.primitives.map((p) => ({
                ...p,
                points: p.points ? p.points.map((pt) => ({ ...pt })) : undefined,
              })),
              dims: { ...asset.dims },
              createdAt: Date.now(),
            };
            setCustomBuiltAssets((prev) => [copy, ...prev]);
            notify(`Duplicated "${asset.name}"`);
          }}
          onRenameBuiltAsset={(assetId, name, category) => {
            setCustomBuiltAssets((prev) =>
              prev.map((a) =>
                a.id === assetId
                  ? { ...a, name, ...(category ? { category } : {}) }
                  : a
              )
            );
          }}
          onDeleteBuiltAsset={(assetId) => {
            setCustomBuiltAssets((prev) => prev.filter((a) => a.id !== assetId));
            notify('Removed custom asset from library');
          }}
          onPlaceBuiltAsset={(asset) => {
            if (showDashboard) setShowDashboard(false);
            placeCustomBuiltAsset(asset);
          }}
          onRegisterCustomModel={(asset) => {
            setCustomModels((prev) => [asset, ...prev]);
            notify(`Saved 3D asset "${asset.name}" to library`);
          }}
          onUpdateCustomModel={(assetId, patch) => {
            setCustomModels((prev) =>
              prev.map((m) => (m.id === assetId ? { ...m, ...patch } : m))
            );
            notify('Updated 3D asset settings');
          }}
          onDeleteCustomModel={(assetId) => {
            setCustomModels((prev) => prev.filter((m) => m.id !== assetId));
          }}
          onPlaceCustomModel={(asset) => {
            if (showDashboard) setShowDashboard(false);
            placeCustomModelAsset(asset);
          }}
          onAddGraphicAsset={(asset) => {
            setCustomAssets((prev) => [asset, ...prev]);
            notify(`Saved graphic "${asset.name}" to library`);
          }}
          onUpdateGraphicAsset={(assetId, patch) => {
            setCustomAssets((prev) =>
              prev.map((g) => (g.id === assetId ? { ...g, ...patch } : g))
            );
          }}
          onDeleteGraphicAsset={(assetId) => {
            setCustomAssets((prev) => prev.filter((g) => g.id !== assetId));
            if (paintAssetId === assetId) setPaintAssetId(null);
          }}
        />
      )}

      {showAssetBuilder && (
        <CustomAssetBuilderModal
          initialMode={assetBuilderMode}
          launchContext={assetBuilderContext}
          editingAsset={editingCustomAsset}
          onClose={() => {
            setShowAssetBuilder(false);
            setEditingCustomAsset(null);
          }}
          onSaveAsset={handleSaveBuiltAsset}
        />
      )}
    </>
  );

  if (showDashboard) {
    return (
      <>
        <ProjectsDashboard
          projects={projects}
          activeProjectId={activeProjectId}
          currency={currency}
          canReturnToEditor={projects.length > 0}
          customAssetCount={totalCustomAssetCount}
          betaUser={betaUser}
          publicLaunch={publicLaunch}
          onSignOut={onSignOut}
          onOpenPublicAuth={
            onOpenPublicAuth ? () => onOpenPublicAuth({ mode: 'signup' }) : undefined
          }
          onOpenSupplierModal={onOpenSupplierModal}
          onOpenAdminInsights={() => setShowAdminInsightsModal(true)}
          onOpenFeedbackBoard={() => setShowFeedbackModal(true)}
          onReturnToEditor={() => setShowDashboard(false)}
          onOpenProject={handleOpenProject}
          onCreateBlankProject={handleCreateBlankProject}
          onCreateFromTemplate={handleCreateProjectFromTemplate}
          onDuplicateProject={handleDuplicateProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onExportProjectJson={handleExportProjectJson}
          onImportJson={handleImportJson}
          onOpenSetupGuide={() => {
            setShowDashboard(false);
            setShowSetupGuide(true);
          }}
          onStartWalkthrough={() => {
            setShowDashboard(false);
            window.setTimeout(() => startWalkthrough(), 120);
          }}
          onOpenAssetLibrary={() => setShowAssetLibrary(true)}
          onOpenAssetCreator={(mode) => handleOpenAssetBuilder(mode, 'dashboard')}
        />
        {assetModals}
        <LaunchAdminModal
          open={showAdminInsightsModal}
          onClose={() => setShowAdminInsightsModal(false)}
        />
        <FeedbackBoardModal
          open={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          betaUser={betaUser}
          standContext={{
            viewMode,
            standSize: `${config.width}×${config.depth}m`,
            itemCount: items.length,
          }}
        />
        {toast && <div role="status" className="studio-toast">{toast}</div>}
      </>
    );
  }

  return (
    <div className="studio-app-shell">
      <TopBar
        projectName={projectName}
        onChangeProjectName={setProjectName}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleOpenProject}
        onNewProject={handleCreateBlankProject}
        onOpenLoadModal={() => setShowProjectsModal(true)}
        onGoToDashboard={() => {
          setTourActive(false);
          setShowDashboard(true);
        }}
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          if (tourActive) setTourActive(false);
          setViewMode(mode);
        }}
        config={config}
        onUpdateConfig={updateConfig}
        performanceMode={performanceMode}
        onChangePerformanceMode={handleChangePerformanceMode}
        performanceMetrics={performanceMetrics}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canCopy={Boolean(selectedItemId)}
        canPaste={Boolean(clipboardItem)}
        onCopy={copySelectedItem}
        onCut={cutSelectedItem}
        onPaste={pasteClipboardItem}
        onDuplicate={() => {
          if (selectedItemId) duplicateItem(selectedItemId);
        }}
        estimatedTotalGbp={estimate.grandTotalGbp}
        currency={currency}
        agentOpen={showAgentDrawer}
        onToggleAgent={() => setShowAgentDrawer((v) => !v)}
        onOpenSetupGuide={() => {
          setTourActive(false);
          setShowSetupGuide(true);
        }}
        onOpenProjects={() => {
          setTourActive(false);
          setShowDashboard(true);
        }}
        onOpenTemplates={() => setShowTemplatesModal(true)}
        onOpenEstimate={() => {
          trackLaunchMetric({
            event: 'estimate_viewed',
            estimatedTotalGbp: Math.round(estimate.grandTotalGbp),
            standAreaM2: Math.round(config.width * config.depth),
            categories: Array.from(
              new Set(
                items.map((it) => CATALOG_MAP[it.catalogId]?.category).filter(Boolean) as string[]
              )
            ),
          });
          setShowEstimateModal(true);
        }}
        onOpenExport={() => setShowExportModal(true)}
        betaUser={betaUser}
        publicLaunch={publicLaunch}
        onSignOut={onSignOut}
        onOpenPublicAuth={
          onOpenPublicAuth ? () => onOpenPublicAuth({ mode: 'signup' }) : undefined
        }
        onOpenSupplierModal={onOpenSupplierModal}
        onOpenAdminInsights={() => setShowAdminInsightsModal(true)}
        onOpenFeedbackBoard={() => setShowFeedbackModal(true)}
      />

      <main className="studio-workspace">
        <LeftSidebar
          activeTab={sidebarTab}
          panelOpen={railPanelOpen}
          onClosePanel={() => setRailPanelOpen(false)}
          onChangeTab={(tab) => {
            setSidebarTab(tab);
            setRailPanelOpen(true);
            setStandDetailsOpen(false);
          }}
          config={config}
          onUpdateConfig={updateConfig}
          items={items}
          selectedItemId={selectedItemId}
          onSelectItem={(id) => {
            setRailPanelOpen(false);
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
          customBuiltAssets={customBuiltAssets}
          onOpenAssetBuilder={(mode) => handleOpenAssetBuilder(mode, 'editor')}
          onOpenAssetLibrary={() => setShowAssetLibrary(true)}
          onPlaceCustomBuiltAsset={(assetId) => {
            const a = customBuiltAssets.find((x) => x.id === assetId);
            if (a) placeCustomBuiltAsset(a);
          }}
          onDeleteCustomBuiltAsset={(assetId) => {
            setCustomBuiltAssets((prev) => prev.filter((a) => a.id !== assetId));
          }}
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
            navMode={viewportNavMode}
            performanceMode={performanceMode}
            compliance={compliance}
            paintAssetId={paintAssetId}
            onPerformanceMetrics={handlePerformanceMetrics}
            onSlowPerformanceDetected={handleSlowPerformanceDetected}
            onSelectItem={(itemId, surfaceId) => {
              setRailPanelOpen(false);
              setStandDetailsOpen(false);
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
            onDropCustomBuiltAsset={(assetId, x, z) => {
              const a = customBuiltAssets.find((ca) => ca.id === assetId);
              if (a) placeCustomBuiltAsset(a, x, z);
            }}
            onDrop3DFiles={(files, x, z) => handleUpload3DModels(files, x, z)}
          />

          {/* Top-Left Floating Space & Compliance HUD */}
          <div className="viewport-hud-top">
            <button className="stand-details-toggle" onClick={() => {
              setSelectedItemId(null);
              setSelectedShellWall(null);
              setRailPanelOpen(false);
              setStandDetailsOpen((open) => !open);
            }} aria-expanded={standDetailsOpen}><Settings2 size={16} />Stand details</button>
            <div className="hud-space-pill">
              <strong className="mono-num">
                {formatLength(config.width, config.unit)} × {formatLength(config.depth, config.unit)}
              </strong>
              <span className="hud-sep">·</span>
              <span className="mono-num">{formatArea(compliance.areaM2, config.unit)}</span>
              <span className="hud-aisle-segment">
                <span className="hud-sep">·</span>
                <span>{openSidesBadge}</span>
              </span>
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

          {/* Bottom-Center Floating Camera & Viewport Navigation Dock */}
          <div className="viewport-camera-dock" role="toolbar" aria-label="Viewport navigation and camera controls">
            <button
              type="button"
              className={`nav-mode-btn ${viewportNavMode === 'select' ? 'active' : ''}`}
              aria-pressed={viewportNavMode === 'select'}
              onClick={() => setViewportNavMode('select')}
              title="Select & Move items (V) — drag empty space to orbit"
              aria-label="Select and move mode"
            >
              <MousePointer2 size={14} />
            </button>
            {viewMode !== '2d' && (
              <button
                type="button"
                className={`nav-mode-btn ${viewportNavMode === 'orbit' ? 'active' : ''}`}
                aria-pressed={viewportNavMode === 'orbit'}
                onClick={() => setViewportNavMode('orbit')}
                title="Orbit camera (O) — drag anywhere to rotate view"
                aria-label="Orbit camera mode"
              >
                <Orbit size={14} />
              </button>
            )}
            <button
              type="button"
              className={`nav-mode-btn ${viewportNavMode === 'pan' ? 'active' : ''}`}
              aria-pressed={viewportNavMode === 'pan'}
              onClick={() => setViewportNavMode('pan')}
              title="Pan camera (H or hold Space) — drag anywhere to pan"
              aria-label="Pan camera mode"
            >
              <Hand size={14} />
            </button>
            <div className="dock-divider" />
            <select
              className="camera-preset-select"
              aria-label="Camera angle"
              value=""
              onChange={(event) => triggerCamera(event.target.value as CameraPreset)}
            >
              <option value="" disabled>Angle</option>
              <option value="isometric">Isometric</option>
              <option value="front">Front</option>
              <option value="back">Back</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
            <button className="camera-preset-button" onClick={() => triggerCamera('isometric')} title="Isometric 3D overview">
              <Compass size={14} />
              <span>Iso</span>
            </button>
            <button className="camera-preset-button" onClick={() => triggerCamera('front')} title="Front elevation view">
              <Maximize2 size={14} />
              <span>Front</span>
            </button>
            <button className="camera-preset-button" onClick={() => triggerCamera('back')} title="Back angle">
              <span>Back</span>
            </button>
            <button className="camera-preset-button" onClick={() => triggerCamera('left')} title="Left angle">
              <span>Left</span>
            </button>
            <button className="camera-preset-button" onClick={() => triggerCamera('right')} title="Right angle">
              <span>Right</span>
            </button>
            <div className="dock-divider" />
            <button
              type="button"
              onClick={() => viewportRef.current?.zoomBy(1.22)}
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              type="button"
              onClick={() => viewportRef.current?.zoomBy(0.82)}
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={() => viewportRef.current?.frameSelected()}
              title={selectedItemId ? 'Frame selected item (F)' : 'Fit stand to view (F)'}
              aria-label="Frame selection"
            >
              <Focus size={14} />
            </button>
            <button
              type="button"
              onClick={() => viewportRef.current?.setCameraPreset(viewMode === '2d' ? 'top' : viewMode === 'eye-level' ? 'eye-level' : 'isometric')}
              title="Reset camera (0)"
              aria-label="Reset camera"
            >
              <RotateCcw size={14} />
            </button>
            <div className="dock-divider" />
            <button onClick={startWalkthrough} title="Watch guided walkthrough — build a stand step by step" aria-label="Walkthrough">
              <Play size={13} />
              <span className="dock-walkthrough-label">Walkthrough</span>
            </button>
            <button onClick={handleDownloadPng} title="Download high-res PNG render" aria-label="Snapshot">
              <Camera size={14} />
            </button>
          </div>

          {/* Guided Mouse-Driven Walkthrough Modal */}
          <StudioWalkthrough
            active={tourActive}
            config={config}
            onClose={() => setTourActive(false)}
          />

          <AgentDrawer
            open={showAgentDrawer}
            onClose={() => setShowAgentDrawer(false)}
            messages={agentMessages}
            isLoading={agentLoading}
            canUndo={canUndo}
            onSendText={(text, viaVoice) => runAgentTurn({ text, viaVoice })}
            onSendAudio={(audio) => runAgentTurn({ audio, viaVoice: true })}
            onUndoLastTurn={() => {
              handleUndo();
              notify('Undid AI stand changes');
            }}
            onClearChat={() => setAgentMessages([])}
          />

          <PerformanceAlertPopup
            alert={slowPerfAlert}
            onApplyMode={handleChangePerformanceMode}
            onDismiss={handleDismissSlowAlert}
          />

          {toast && <div role="status" className="studio-toast">{toast}</div>}
        </section>

        {(selectedItem || selectedShellWall || standDetailsOpen) && <RightInspector
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
          onOpenBrandingTab={() => {
            setSidebarTab('branding');
            setRailPanelOpen(true);
          }}
          onEditCustomBuiltAsset={handleEditCustomBuiltAsset}
          onClose={() => {
            setSelectedItemId(null);
            setSelectedSurfaceId(null);
            setSelectedShellWall(null);
            setStandDetailsOpen(false);
          }}
        />}
      </main>

      {assetModals}

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
        onRequestQuotes={() => setShowQuoteRequestModal(true)}
      />

      <QuoteRequestModal
        open={showQuoteRequestModal}
        onClose={() => setShowQuoteRequestModal(false)}
        config={config}
        items={items}
        currency={currency}
        pricingMode={pricingMode}
        defaultName={betaUser?.name || ''}
        defaultEmail={betaUser?.email || ''}
        defaultCompany={betaUser?.company || config.brandName || ''}
      />

      <LaunchAdminModal
        open={showAdminInsightsModal}
        onClose={() => setShowAdminInsightsModal(false)}
      />

      <FeedbackBoardModal
        open={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        betaUser={betaUser}
        standContext={{
          viewMode,
          standSize: `${config.width}×${config.depth}m`,
          itemCount: items.length,
        }}
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
            customBuiltAssets: JSON.parse(JSON.stringify(customBuiltAssets)),
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
          if (proj.customBuiltAssets && proj.customBuiltAssets.length > 0) {
            setCustomBuiltAssets((prev) => {
              const merged = new Map<string, CustomBuiltAsset>();
              for (const a of [...prev, ...(proj.customBuiltAssets || [])]) merged.set(a.id, a);
              return Array.from(merged.values());
            });
          }
          setSelectedItemId(null);
          setSelectedShellWall(null);
          resetHistory(proj.config, proj.items);
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
        onExportDesignerPack={handleExportDesignerPack}
        onDownloadDesignerCsv={handleDownloadDesignerCsv}
        onDownloadJson={handleDownloadJson}
      />
    </div>
  );
}

export default App;
