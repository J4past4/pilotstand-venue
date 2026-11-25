import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileImage,
  Image,
  ImagePlus,
  Layers,
  Lock,
  Paintbrush,
  Plus,
  Search,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { CATEGORY_META, EQUIPMENT_CATALOG } from '../data/catalog';
import { COLOR_PALETTES } from '../data/palettes';
import { STAND_TEMPLATES } from '../data/templates';
import type { ExclusiveModelPreset } from '../data/userModels';
import type {
  BrandAsset,
  CurrencyCode,
  CustomBuiltAsset,
  CustomModelAsset,
  EquipmentCategory,
  FloorMaterial,
  OpenSides,
  StandConfig,
  StandItem,
  StandTemplate,
} from '../types/stand';
import {
  getOuterGridMargin,
  isVenuePermanentFixture,
} from '../utils/fixtures';
import { formatLength, formatMoney } from '../utils/pricing';
import { EquipmentThumb } from './EquipmentThumb';
import './sidebar.css';

export type SidebarTab = 'catalog' | 'space' | 'branding' | 'assets' | 'templates' | 'layers';

interface LeftSidebarProps {
  activeTab: SidebarTab;
  panelOpen?: boolean;
  onClosePanel?: () => void;
  onChangeTab: (tab: SidebarTab) => void;
  config: StandConfig;
  onUpdateConfig: (patch: Partial<StandConfig>) => void;
  items: StandItem[];
  selectedItemIds: string[];
  onSelectItem: (id: string, additive?: boolean) => void;
  onAddCatalogItem: (catalogId: string) => void;
  onDuplicateItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, patch: Partial<StandItem>) => void;
  assets: BrandAsset[];
  onUploadAssets: (files: FileList) => void;
  onDeleteAsset: (assetId: string) => void;
  customModels: CustomModelAsset[];
  exclusiveModels?: ExclusiveModelPreset[];
  onUpload3DModels: (files: FileList) => void;
  onPlaceCustomModel: (modelAssetId: string) => void;
  onPlaceExclusiveModel?: (presetId: string, branded: boolean) => void;
  onLoadSampleMachine: () => void;
  customBuiltAssets: CustomBuiltAsset[];
  onOpenAssetBuilder: (mode: 'shapes' | 'schematic') => void;
  onOpenAssetLibrary: () => void;
  onPlaceCustomBuiltAsset: (assetId: string) => void;
  onDeleteCustomBuiltAsset: (assetId: string) => void;
  paintAssetId: string | null;
  onSetPaintAssetId: (assetId: string | null) => void;
  onApplyTemplate: (template: StandTemplate) => void;
  onDuplicateStandLocation?: () => void;
  currency: CurrencyCode;
  pricingMode: 'hire' | 'buy';
}

const BUILD_TABS = [
  { id: 'catalog', label: 'Equipment' },
  { id: 'space', label: 'Space' },
  { id: 'templates', label: 'Presets' },
  { id: 'layers', label: 'Layers' },
] as const;

const RAIL_TABS = [
  { id: 'build', label: 'Build', icon: Box },
  { id: 'branding', label: 'Brand', icon: Paintbrush },
  { id: 'assets', label: 'Assets', icon: Image },
] as const;

const STANDARD_SIZES: { label: string; w: number; d: number }[] = [
  { label: '3×2m', w: 3, d: 2 },
  { label: '3×3m', w: 3, d: 3 },
  { label: '4×3m', w: 4, d: 3 },
  { label: '6×3m', w: 6, d: 3 },
  { label: '6×4m', w: 6, d: 4 },
  { label: '6×6m', w: 6, d: 6 },
];

const FLOOR_OPTIONS: { id: FloorMaterial; label: string; swatch: string }[] = [
  { id: 'oak-timber', label: 'Warm Oak', swatch: 'linear-gradient(135deg,#CFAF86,#A98359)' },
  { id: 'charcoal-carpet', label: 'Charcoal', swatch: '#2E333B' },
  { id: 'navy-carpet', label: 'Navy', swatch: '#1E3452' },
  { id: 'light-concrete', label: 'Concrete', swatch: '#D8D5CE' },
  { id: 'slate-tile', label: 'Dark Slate', swatch: '#3B4047' },
  { id: 'brand-carpet', label: 'Custom', swatch: 'conic-gradient(#1B365D,#D95D39,#1F4E46,#1B365D)' },
];

export const LeftSidebar: React.FC<LeftSidebarProps> = React.memo(({
  activeTab,
  panelOpen = true,
  onClosePanel,
  onChangeTab,
  config,
  onUpdateConfig,
  items,
  selectedItemIds,
  onSelectItem,
  onAddCatalogItem,
  onDuplicateItem,
  onDeleteItem,
  onUpdateItem,
  assets,
  onUploadAssets,
  onDeleteAsset,
  customModels,
  exclusiveModels = [],
  onUpload3DModels,
  onPlaceCustomModel,
  onPlaceExclusiveModel,
  onLoadSampleMachine,
  customBuiltAssets,
  onOpenAssetBuilder,
  onOpenAssetLibrary,
  onPlaceCustomBuiltAsset,
  onDeleteCustomBuiltAsset,
  paintAssetId,
  onSetPaintAssetId,
  onApplyTemplate,
  onDuplicateStandLocation,
  currency,
  pricingMode,
}) => {
  const [search, setSearch] = useState('');
  const [lastBuildTab, setLastBuildTab] = useState<SidebarTab>('catalog');
  const activeRail = activeTab === 'branding' || activeTab === 'assets' ? activeTab : 'build';
  const [selectedCat, setSelectedCat] = useState<EquipmentCategory | 'all'>('all');
  const [dragActive, setDragActive] = useState(false);
  const [exclusiveBranded, setExclusiveBranded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelFileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return EQUIPMENT_CATALOG.filter((item) => {
      if (selectedCat !== 'all' && item.category !== selectedCat) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.badge && item.badge.toLowerCase().includes(q))
      );
    });
  }, [search, selectedCat]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadAssets(e.dataTransfer.files);
    }
  };

  return (
    <aside className="left-studio-rail" aria-label="Stand design tools">
      <nav className="rail-icon-strip" aria-label="Tool categories">
        {RAIL_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            id={`rail-tab-${id}`}
            className={`rail-tab-btn ${activeRail === id && (panelOpen || id === 'build') ? 'active' : ''}`}
            aria-controls="stand-tool-panel"
            aria-expanded={panelOpen && activeRail === id}
            onClick={() => {
              if (panelOpen && activeRail === id && onClosePanel) {
                onClosePanel();
                return;
              }
              onChangeTab(id === 'build' ? lastBuildTab : id);
            }}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div
        id="stand-tool-panel"
        className="rail-panel"
        role="region"
        aria-labelledby="stand-tool-panel-heading"
        hidden={!panelOpen}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onClosePanel) {
            e.stopPropagation();
            onClosePanel();
            document.getElementById(`rail-tab-${activeRail}`)?.focus();
          }
        }}
      >
        <div className="rail-panel-heading">
          <h2 id="stand-tool-panel-heading">{RAIL_TABS.find(({ id }) => id === activeRail)?.label}</h2>
          {onClosePanel && (
            <button
              type="button"
              className="rail-panel-close"
              onClick={() => {
                onClosePanel();
                document.getElementById(`rail-tab-${activeRail}`)?.focus();
              }}
              aria-label="Close tools"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {activeRail === 'build' && (
          <nav className="rail-build-nav" aria-label="Build tools">
            {BUILD_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                id={`rail-tab-${id}`}
                className={activeTab === id ? 'active' : ''}
                aria-current={activeTab === id ? 'true' : undefined}
                onClick={() => {
                  setLastBuildTab(id);
                  onChangeTab(id);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <div className="rail-panel-body" key={activeTab}>
          {/* ==================== EQUIPMENT CATALOG ==================== */}
          {activeTab === 'catalog' && (
            <div className="panel-section-stack">
              <div className="panel-header">
                <h3>Equipment</h3>
                <p>Click an item to add it or drag it onto the stand.</p>
              </div>

              <div className="search-input-wrap">
                <Search size={14} className="search-icon" />
                <input
                  id="catalog-search-input"
                  type="text"
                  aria-label="Search equipment"
                  placeholder="Search equipment"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button className="clear-search-btn" onClick={() => setSearch('')} aria-label="Clear search">
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="cat-pill-row">
                <button
                  className={`cat-pill ${selectedCat === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedCat('all')}
                >
                  All ({EQUIPMENT_CATALOG.length})
                </button>
                {(Object.keys(CATEGORY_META) as EquipmentCategory[]).map((cat) => (
                  <button
                    key={cat}
                    className={`cat-pill ${selectedCat === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCat(cat)}
                  >
                    {CATEGORY_META[cat].shortLabel}
                  </button>
                ))}
              </div>

              <div className="custom-builder-banner">
                <button
                  type="button"
                  id="btn-open-asset-builder-catalog"
                  className="secondary-btn custom-builder-banner-btn"
                  onClick={() => onOpenAssetBuilder('shapes')}
                >
                  <Layers size={13} />
                  <span>Build Custom Asset</span>
                </button>
                <button
                  type="button"
                  id="btn-open-schematic-catalog"
                  className="secondary-btn custom-builder-banner-btn"
                  onClick={() => onOpenAssetBuilder('schematic')}
                >
                  <FileImage size={13} />
                  <span>2D Schematic</span>
                </button>
              </div>

              <div className="catalog-grid">
                {filteredCatalog.map((item) => {
                  const price = pricingMode === 'hire' ? item.priceHire : item.priceBuy;
                  return (
                    <button
                      key={item.id}
                      id={`add-equip-${item.id}`}
                      className="catalog-card"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-zuki-catalog', item.id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => onAddCatalogItem(item.id)}
                      title={`${item.description} (Click or drag onto stand floor)`}
                    >
                      <div className="catalog-thumb-box">
                        <EquipmentThumb catalogId={item.id} />
                        {item.badge && <span className="equip-badge">{item.badge}</span>}
                        <span className="add-hover-badge">
                          <Plus size={12} /> Drag / Add
                        </span>
                      </div>
                      <div className="catalog-card-meta">
                        <div className="catalog-card-title">{item.shortName}</div>
                        <div className="catalog-card-sub">
                          <span className="mono-num">
                            {item.defaultDims.w}×{item.defaultDims.d}m
                          </span>
                          <span className="mono-num price-tag">{formatMoney(price, currency)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== STAND SPACE & SHELL SETUP ==================== */}
          {activeTab === 'space' && (
            <div className="panel-section-stack">
              <div className="panel-header">
                <h3>Stand footprint and shell</h3>
              </div>

              <div className="control-block">
                <div className="control-label-row">
                  <label>Standard Booth Sizes</label>
                  <div className="mini-toggle">
                    <button
                      className={config.unit === 'm' ? 'active' : ''}
                      onClick={() => onUpdateConfig({ unit: 'm' })}
                    >
                      m
                    </button>
                    <button
                      className={config.unit === 'ft' ? 'active' : ''}
                      onClick={() => onUpdateConfig({ unit: 'ft' })}
                    >
                      ft
                    </button>
                  </div>
                </div>
                <div className="size-preset-grid">
                  {STANDARD_SIZES.map((s) => {
                    const isActive = config.width === s.w && config.depth === s.d;
                    return (
                      <button
                        key={s.label}
                        className={`size-preset-btn ${isActive ? 'active' : ''}`}
                        onClick={() => onUpdateConfig({ width: s.w, depth: s.d })}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="control-block">
                <div className="slider-row">
                  <div className="slider-header">
                    <span>Width (Frontage)</span>
                    <span className="mono-num">{formatLength(config.width, config.unit)}</span>
                  </div>
                  <input
                    id="stand-width-slider"
                    type="range"
                    min={2}
                    max={12}
                    step={0.5}
                    value={config.width}
                    onChange={(e) => onUpdateConfig({ width: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="slider-row">
                  <div className="slider-header">
                    <span>Depth</span>
                    <span className="mono-num">{formatLength(config.depth, config.unit)}</span>
                  </div>
                  <input
                    id="stand-depth-slider"
                    type="range"
                    min={2}
                    max={10}
                    step={0.5}
                    value={config.depth}
                    onChange={(e) => onUpdateConfig({ depth: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="slider-row">
                  <div className="slider-header">
                    <span>Venue Height Limit</span>
                    <span className="mono-num">{formatLength(config.heightLimit, config.unit)}</span>
                  </div>
                  <input
                    id="stand-height-limit-slider"
                    type="range"
                    min={2.4}
                    max={5.5}
                    step={0.1}
                    value={config.heightLimit}
                    onChange={(e) => onUpdateConfig({ heightLimit: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div className="control-block">
                <label className="block-label">Booth Configuration (Open Sides)</label>
                <div className="open-sides-grid">
                  {(
                    [
                      { n: 1, title: 'Inline', sub: '1 Open' },
                      { n: 2, title: 'Corner', sub: '2 Open' },
                      { n: 3, title: 'Peninsula', sub: '3 Open' },
                      { n: 4, title: 'Island', sub: '4 Open' },
                    ] as { n: OpenSides; title: string; sub: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.n}
                      id={`open-sides-${opt.n}`}
                      className={`open-side-card ${config.openSides === opt.n ? 'active' : ''}`}
                      onClick={() =>
                        onUpdateConfig({
                          openSides: opt.n,
                          showShellWalls: opt.n === 4 ? false : config.showShellWalls,
                        })
                      }
                    >
                      <div className={`side-diagram sides-${opt.n}`} aria-hidden="true" />
                      <div className="side-card-title">{opt.title}</div>
                      <div className="side-card-sub">{opt.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {config.openSides < 4 && (
                <div className="control-block">
                  <div className="toggle-row">
                    <div>
                      <div className="toggle-title">Shell Scheme Perimeter Walls</div>
                      <div className="toggle-sub">Click any wall in 3D to apply full-wall artwork</div>
                    </div>
                    <input
                      id="toggle-shell-walls"
                      type="checkbox"
                      className="studio-switch"
                      checked={config.showShellWalls}
                      onChange={(e) => onUpdateConfig({ showShellWalls: e.target.checked })}
                    />
                  </div>
                  {config.showShellWalls && (
                    <div className="slider-row" style={{ marginTop: 10 }}>
                      <div className="slider-header">
                        <span>Shell Wall Height</span>
                        <span className="mono-num">
                          {formatLength(config.shellWallHeight, config.unit)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={2.2}
                        max={3.6}
                        step={0.1}
                        value={config.shellWallHeight}
                        onChange={(e) =>
                          onUpdateConfig({ shellWallHeight: parseFloat(e.target.value) })
                        }
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="control-block">
                <label className="block-label">Flooring Finish</label>
                <div className="floor-grid">
                  {FLOOR_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      className={`floor-option-card ${config.floorMaterial === f.id ? 'active' : ''}`}
                      onClick={() => onUpdateConfig({ floorMaterial: f.id })}
                    >
                      <span className="floor-swatch" style={{ background: f.swatch }} />
                      <span className="floor-label">{f.label}</span>
                    </button>
                  ))}
                </div>
                {config.floorMaterial === 'brand-carpet' && (
                  <div className="color-inline-row" style={{ marginTop: 10 }}>
                    <span>Custom Carpet Colour</span>
                    <input
                      type="color"
                      value={config.floorColor}
                      onChange={(e) => onUpdateConfig({ floorColor: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <div className="control-block">
                <div className="toggle-row">
                  <div>
                    <div className="toggle-title">Outer Meter Grid (1m)</div>
                    <div className="toggle-sub">
                      Surrounds the planned stand area for placing permanent venue pillars &amp; fixtures
                    </div>
                  </div>
                  <input
                    id="space-toggle-outer-grid"
                    type="checkbox"
                    className="studio-switch"
                    checked={config.showOuterGrid !== false}
                    onChange={(e) =>
                      onUpdateConfig({
                        showOuterGrid: e.target.checked,
                        showGrid: e.target.checked ? true : config.showGrid,
                      })
                    }
                  />
                </div>
                {config.showOuterGrid !== false && (
                  <div className="slider-row" style={{ marginTop: 10 }}>
                    <div className="slider-header">
                      <span>Outer Grid Margin</span>
                      <span className="mono-num">
                        +{formatLength(getOuterGridMargin(config), config.unit)}
                      </span>
                    </div>
                    <input
                      id="outer-grid-margin-slider"
                      type="range"
                      min={1}
                      max={6}
                      step={1}
                      value={getOuterGridMargin(config)}
                      onChange={(e) =>
                        onUpdateConfig({ outerGridMargin: parseInt(e.target.value, 10) })
                      }
                    />
                  </div>
                )}
              </div>

              {onDuplicateStandLocation && (
                <div className="control-block">
                  <label className="block-label">Stand Location Variations</label>
                  <button
                    id="btn-new-layout-keep-fixtures"
                    type="button"
                    className="secondary-btn full-width"
                    onClick={onDuplicateStandLocation}
                  >
                    <Copy size={13} />
                    <span>New Design for This Stand (Keep Fixtures)</span>
                  </button>
                  <p className="helper-note" style={{ marginTop: 6 }}>
                    Duplicates this exact stand footprint, walls, and permanent fixtures so you can
                    try another layout without re-placing venue pillars.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Brand identity and colours */}
          {activeTab === 'branding' && (
            <div className="panel-section-stack">
              <div className="control-block">
                <label className="block-label">Company Identity</label>
                <div className="field-stack">
                  <input
                    id="brand-name-input"
                    className="text-input"
                    aria-label="Company or brand name"
                    placeholder="Company / Brand Name"
                    value={config.brandName}
                    onChange={(e) => onUpdateConfig({ brandName: e.target.value })}
                  />
                  <input
                    id="brand-tagline-input"
                    className="text-input"
                    aria-label="Short tagline or stand message"
                    placeholder="Short Tagline or Stand Message"
                    value={config.brandTagline}
                    onChange={(e) => onUpdateConfig({ brandTagline: e.target.value })}
                  />
                </div>
              </div>

              <div className="control-block">
                <label className="block-label">Curated Colour Schemes</label>
                <div className="palette-list">
                  {COLOR_PALETTES.map((p) => {
                    const active =
                      config.primaryColor.toLowerCase() === p.primaryColor.toLowerCase() &&
                      config.accentColor.toLowerCase() === p.accentColor.toLowerCase();
                    return (
                      <button
                        key={p.id}
                        id={`palette-${p.id}`}
                        className={`palette-card ${active ? 'active' : ''}`}
                        onClick={() =>
                          onUpdateConfig({
                            primaryColor: p.primaryColor,
                            accentColor: p.accentColor,
                            wallColor: p.wallColor,
                            floorMaterial: p.floorMaterial,
                            floorColor: p.floorColor,
                            trimColor: p.trimColor,
                          })
                        }
                      >
                        <div className="palette-dots">
                          <span style={{ background: p.primaryColor }} />
                          <span style={{ background: p.accentColor }} />
                          <span style={{ background: p.wallColor }} />
                          <span style={{ background: p.floorColor }} />
                        </div>
                        <div className="palette-info">
                          <div className="palette-name">{p.name}</div>
                        </div>
                        {active && <Check size={14} className="palette-check" />}
                      </button>
                    );
                  })}
                </div>

                <div className="custom-swatches-row">
                  <label className="swatch-picker">
                    <input
                      type="color"
                      value={config.primaryColor}
                      onChange={(e) => onUpdateConfig({ primaryColor: e.target.value })}
                    />
                    <span>Primary</span>
                  </label>
                  <label className="swatch-picker">
                    <input
                      type="color"
                      value={config.accentColor}
                      onChange={(e) => onUpdateConfig({ accentColor: e.target.value })}
                    />
                    <span>Accent</span>
                  </label>
                  <label className="swatch-picker">
                    <input
                      type="color"
                      value={config.wallColor}
                      onChange={(e) => onUpdateConfig({ wallColor: e.target.value })}
                    />
                    <span>Walls</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'assets' && (
            <div className="panel-section-stack">
              {exclusiveModels.length > 0 && onPlaceExclusiveModel && (
                <div className="custom-3d-box" id="exclusive-models-section">
                  <div className="custom-3d-head">
                    <span className="custom-3d-title">
                      <Box size={13} /> Exclusive 3D Models
                    </span>
                    <span className="mono-num custom-3d-formats">GLB</span>
                  </div>
                  <p className="custom-builder-desc">
                    Choose branded or unbranded mast graphics, then click or drag onto the stand floor. You can also toggle branding anytime in the Inspector.
                  </p>
                  <div className="fit-btn-row" style={{ marginBottom: 8 }}>
                    <button
                      id="btn-exclusive-branded"
                      type="button"
                      className={`fit-btn ${exclusiveBranded ? 'active' : ''}`}
                      onClick={() => setExclusiveBranded(true)}
                    >
                      Branded
                    </button>
                    <button
                      id="btn-exclusive-unbranded"
                      type="button"
                      className={`fit-btn ${!exclusiveBranded ? 'active' : ''}`}
                      onClick={() => setExclusiveBranded(false)}
                    >
                      Unbranded
                    </button>
                  </div>
                  <div className="uploaded-models-list">
                    {exclusiveModels.map((preset) => (
                      <button
                        key={preset.id}
                        id={`btn-place-exclusive-${preset.id}`}
                        type="button"
                        className="uploaded-model-chip"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/x-zuki-model',
                            `${preset.id}|${exclusiveBranded ? 'branded' : 'unbranded'}`
                          );
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={() => onPlaceExclusiveModel(preset.id, exclusiveBranded)}
                        title={preset.description}
                      >
                        <span className="uploaded-model-name">{preset.name}</span>
                        <span className="mono-num uploaded-model-meta">
                          {preset.defaultDims.w}×{preset.defaultDims.d}m ·{' '}
                          {exclusiveBranded ? 'Branded' : 'Unbranded'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Asset Builder (Simple Shapes + 2D Schematic Auto/Trace) */}
              <div className="custom-3d-box">
                <div className="custom-3d-head">
                  <span className="custom-3d-title">
                    <Layers size={13} /> Custom Asset Builder
                  </span>
                  <button
                    type="button"
                    className="cab-text-btn"
                    onClick={onOpenAssetLibrary}
                  >
                    Open Library →
                  </button>
                </div>
                <p className="custom-builder-desc">
                  Create custom products, furniture, structures, or machinery from dimensioned shapes, or auto-generate &amp; trace from a 2D schematic.
                </p>
                <div className="custom-3d-actions">
                  <button
                    type="button"
                    id="btn-open-asset-builder"
                    className="primary-btn custom-3d-upload-btn"
                    onClick={() => onOpenAssetBuilder('shapes')}
                  >
                    <Plus size={13} />
                    <span>Shape Builder</span>
                  </button>
                  <button
                    type="button"
                    id="btn-open-schematic-builder"
                    className="secondary-btn custom-3d-sample-btn"
                    onClick={() => onOpenAssetBuilder('schematic')}
                    title="Upload a 2D drawing or schematic to auto-generate or trace a 3D model"
                  >
                    <FileImage size={13} />
                    <span>2D Schematic</span>
                  </button>
                </div>
                {customBuiltAssets.length > 0 && (
                  <div className="uploaded-models-list">
                    {customBuiltAssets.map((a) => (
                      <div key={a.id} className="uploaded-model-chip-wrap">
                        <button
                          type="button"
                          className="uploaded-model-chip"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-zuki-custom-asset', a.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => onPlaceCustomBuiltAsset(a.id)}
                          title="Click or drag onto stand floor"
                        >
                          <span className="uploaded-model-name">{a.name}</span>
                          <span className="mono-num uploaded-model-meta">
                            {a.dims.w}×{a.dims.d}×{a.dims.h}m · {a.primitives.length}p
                          </span>
                        </button>
                        <button
                          type="button"
                          className="uploaded-model-del-btn"
                          title="Remove custom asset from library"
                          onClick={() => onDeleteCustomBuiltAsset(a.id)}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom 3D Models (.GLB, .GLTF, .STL, .OBJ) */}
              <div className="custom-3d-box">
                <div className="custom-3d-head">
                  <span className="custom-3d-title">
                    <Box size={13} /> Import 3D Model
                  </span>
                  <span className="mono-num custom-3d-formats">GLB · STL · OBJ</span>
                </div>
                <div className="custom-3d-actions">
                  <button
                    id="btn-upload-3d-model"
                    className="primary-btn custom-3d-upload-btn"
                    onClick={() => modelFileInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    <span>Upload 3D</span>
                  </button>
                  <button
                    id="btn-sample-machine"
                    className="secondary-btn custom-3d-sample-btn"
                    onClick={onLoadSampleMachine}
                    title="Place a sample industrial CNC showcase machine onto the stand"
                  >
                    Sample CNC
                  </button>
                  <input
                    ref={modelFileInputRef}
                    id="model-3d-file-input"
                    type="file"
                    accept=".glb,.gltf,.stl,.obj"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        onUpload3DModels(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />
                </div>
                {customModels.some((m) => !m.isExclusive) && (
                  <div className="uploaded-models-list">
                    {customModels
                      .filter((m) => !m.isExclusive)
                      .map((m) => (
                        <button
                          key={m.id}
                          className="uploaded-model-chip"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-zuki-model', m.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => onPlaceCustomModel(m.id)}
                          title="Click or drag onto stand floor"
                        >
                          <span className="uploaded-model-name">{m.name}</span>
                          <span className="mono-num uploaded-model-meta">
                            {m.originalDims.w}×{m.originalDims.d}m · {m.format.toUpperCase()}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <div className="control-block">
                <div className="control-label-row">
                  <label className="block-label" style={{ marginBottom: 0 }}>
                    Artwork &amp; Logo Uploads
                  </label>
                  {paintAssetId && (
                    <button
                      className="exit-paint-btn"
                      onClick={() => onSetPaintAssetId(null)}
                    >
                      Done Assigning
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  id="artwork-upload-dropzone"
                  className={`upload-dropzone ${dragActive ? 'drag-over' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                >
                  <ImagePlus size={20} />
                  <span className="dropzone-title">Upload Logo or Wall Artwork</span>
                  <span className="dropzone-sub">PNG, JPG, SVG · Drop or browse</span>
                </button>
                <input
                  ref={fileInputRef}
                  id="artwork-file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      onUploadAssets(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />

                <div className="asset-library-grid">
                  {assets.map((asset) => {
                    const isPainting = paintAssetId === asset.id;
                    return (
                      <div
                        key={asset.id}
                        className={`asset-card ${isPainting ? 'painting' : ''}`}
                      >
                        <div className="asset-preview-wrap">
                          <img src={asset.dataUrl} alt={asset.name} />
                          {asset.kind === 'uploaded' && (
                            <button
                              className="asset-delete-btn"
                              title="Remove uploaded asset"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteAsset(asset.id);
                              }}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                        <div className="asset-card-footer">
                          <span className="asset-name" title={asset.name}>
                            {asset.name}
                          </span>
                          <button
                            id={`paint-asset-${asset.id}`}
                            className={`asset-assign-btn ${isPainting ? 'active' : ''}`}
                            onClick={() => onSetPaintAssetId(isPainting ? null : asset.id)}
                            title="Click, then click any wall, counter, banner, or screen in 3D"
                          >
                            <Paintbrush size={11} />
                            <span>{isPainting ? 'Click 3D' : 'Assign'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TEMPLATES SIDEBAR ==================== */}
          {activeTab === 'templates' && (
            <div className="panel-section-stack">
              <div className="panel-header">
                <h3>Stand templates</h3>
              </div>
              <div className="template-sidebar-list">
                {STAND_TEMPLATES.map((tpl) => (
                  <div key={tpl.id} className="template-mini-card">
                    <div className="tpl-mini-top">
                      <span className="tpl-size-pill">{tpl.dimensionsLabel}</span>
                      <span className="tpl-open-pill">{tpl.openSidesLabel}</span>
                    </div>
                    <h3>{tpl.name}</h3>
                    <p>{tpl.subtitle}</p>
                    <button
                      id={`apply-template-${tpl.id}`}
                      className="secondary-btn full-width"
                      onClick={() => onApplyTemplate(tpl)}
                    >
                      Load Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==================== LAYERS / SCENE OUTLINER ==================== */}
          {activeTab === 'layers' && (
            <div className="panel-section-stack">
              <div className="panel-header">
                <h3>Stand equipment ({items.length})</h3>
                <p>Select, lock, hide, or duplicate placed items.</p>
              </div>
              <div className="layers-list">
                {items.length === 0 ? (
                  <div className="empty-state-box">
                    Your stand is empty. Open <strong>Equipment</strong> to add walls, counters, and displays.
                  </div>
                ) : (
                  items.map((item) => {
                    const selected = selectedItemIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`layer-row ${selected ? 'selected' : ''}`}
                      >
                        <button
                          type="button"
                          className="layer-name rail-layer-select"
                          aria-current={selected ? 'true' : undefined}
                          title="Click to select · Ctrl+click to add/remove from selection"
                          onClick={(e) => onSelectItem(item.id, e.ctrlKey || e.metaKey)}
                        >
                          <span>{item.name}</span>
                          {item.isPermanentFixture && (
                            <span
                              className={`layer-fixture-badge ${
                                isVenuePermanentFixture(item) ? 'venue' : 'own'
                              }`}
                            >
                              {isVenuePermanentFixture(item) ? 'Venue' : 'Fixed'}
                            </span>
                          )}
                        </button>
                        <div className="layer-actions">
                          <button
                            className="tiny-icon-btn"
                            title={item.visible === false ? 'Show' : 'Hide'}
                            onClick={() =>
                              onUpdateItem(item.id, { visible: item.visible === false })
                            }
                          >
                            {item.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            className="tiny-icon-btn"
                            title={item.locked ? 'Unlock' : 'Lock position'}
                            onClick={() => onUpdateItem(item.id, { locked: !item.locked })}
                          >
                            {item.locked ? <Lock size={13} /> : <Unlock size={13} />}
                          </button>
                          <button
                            className="tiny-icon-btn"
                            title="Duplicate"
                            onClick={() => onDuplicateItem(item.id)}
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            className="tiny-icon-btn danger"
                            title="Delete"
                            onClick={() => onDeleteItem(item.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
});
