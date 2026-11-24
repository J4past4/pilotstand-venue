import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Check,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  Paintbrush,
  Palette,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { CATEGORY_META, EQUIPMENT_CATALOG } from '../data/catalog';
import { COLOR_PALETTES } from '../data/palettes';
import { STAND_TEMPLATES } from '../data/templates';
import type {
  BrandAsset,
  CurrencyCode,
  CustomModelAsset,
  EquipmentCategory,
  FloorMaterial,
  OpenSides,
  StandConfig,
  StandItem,
  StandTemplate,
} from '../types/stand';
import { formatLength, formatMoney } from '../utils/pricing';
import { EquipmentThumb } from './EquipmentThumb';

export type SidebarTab = 'catalog' | 'space' | 'branding' | 'templates' | 'layers';

interface LeftSidebarProps {
  activeTab: SidebarTab;
  onChangeTab: (tab: SidebarTab) => void;
  config: StandConfig;
  onUpdateConfig: (patch: Partial<StandConfig>) => void;
  items: StandItem[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  onAddCatalogItem: (catalogId: string) => void;
  onDuplicateItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onUpdateItem: (id: string, patch: Partial<StandItem>) => void;
  assets: BrandAsset[];
  onUploadAssets: (files: FileList) => void;
  onDeleteAsset: (assetId: string) => void;
  customModels: CustomModelAsset[];
  onUpload3DModels: (files: FileList) => void;
  onPlaceCustomModel: (modelAssetId: string) => void;
  onLoadSampleMachine: () => void;
  paintAssetId: string | null;
  onSetPaintAssetId: (assetId: string | null) => void;
  onApplyTemplate: (template: StandTemplate) => void;
  currency: CurrencyCode;
  pricingMode: 'hire' | 'buy';
}

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

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  activeTab,
  onChangeTab,
  config,
  onUpdateConfig,
  items,
  selectedItemId,
  onSelectItem,
  onAddCatalogItem,
  onDuplicateItem,
  onDeleteItem,
  onUpdateItem,
  assets,
  onUploadAssets,
  onDeleteAsset,
  customModels,
  onUpload3DModels,
  onPlaceCustomModel,
  onLoadSampleMachine,
  paintAssetId,
  onSetPaintAssetId,
  onApplyTemplate,
  currency,
  pricingMode,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<EquipmentCategory | 'all'>('all');
  const [dragActive, setDragActive] = useState(false);
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
        <button
          id="rail-tab-catalog"
          className={`rail-tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => onChangeTab('catalog')}
          title="Equipment & Furniture Catalog"
        >
          <LayoutGrid size={18} />
          <span>Kit</span>
        </button>
        <button
          id="rail-tab-space"
          className={`rail-tab-btn ${activeTab === 'space' ? 'active' : ''}`}
          onClick={() => onChangeTab('space')}
          title="Stand Size, Open Sides & Flooring"
        >
          <SlidersHorizontal size={18} />
          <span>Space</span>
        </button>
        <button
          id="rail-tab-branding"
          className={`rail-tab-btn ${activeTab === 'branding' ? 'active' : ''}`}
          onClick={() => onChangeTab('branding')}
          title="Custom Branding, Logos & Colour Schemes"
        >
          <Palette size={18} />
          <span>Brand</span>
        </button>
        <button
          id="rail-tab-templates"
          className={`rail-tab-btn ${activeTab === 'templates' ? 'active' : ''}`}
          onClick={() => onChangeTab('templates')}
          title="Ready-Made Stand Templates"
        >
          <LayoutTemplate size={18} />
          <span>Presets</span>
        </button>
        <button
          id="rail-tab-layers"
          className={`rail-tab-btn ${activeTab === 'layers' ? 'active' : ''}`}
          onClick={() => onChangeTab('layers')}
          title="Objects & Layers Outliner"
        >
          <Layers size={18} />
          <span>Layers</span>
          <span className="rail-count">{items.length}</span>
        </button>
      </nav>

      <div className="rail-panel-body">
        {/* ==================== EQUIPMENT CATALOG ==================== */}
        {activeTab === 'catalog' && (
          <div className="panel-section-stack">
            <div className="panel-header">
              <h2>Equipment &amp; 3D Models</h2>
              <p>Click or drag any item — or drop your own 3D machine directly onto the floor.</p>
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
              {customModels.length > 0 && (
                <div className="uploaded-models-list">
                  {customModels.map((m) => (
                    <button
                      key={m.id}
                      className="uploaded-model-chip"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-standcraft-model', m.id);
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

            <div className="search-input-wrap">
              <Search size={14} className="search-icon" />
              <input
                id="catalog-search-input"
                type="text"
                placeholder="Search quick-fold walls, desks, TVs..."
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
                      e.dataTransfer.setData('application/x-standcraft-catalog', item.id);
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
              <h2>Stand Footprint &amp; Shell</h2>
              <p>Confirm booked floor space, open aisle orientation, and finishes.</p>
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
          </div>
        )}

        {/* ==================== BRANDING, PALETTES & ARTWORK UPLOAD ==================== */}
        {activeTab === 'branding' && (
          <div className="panel-section-stack">
            <div className="panel-header">
              <h2>Brand &amp; Custom Artwork</h2>
              <p>Upload logos or graphics and click any stand surface to brand it instantly.</p>
            </div>

            <div className="control-block">
              <label className="block-label">Company Identity</label>
              <div className="field-stack">
                <input
                  id="brand-name-input"
                  className="text-input"
                  placeholder="Company / Brand Name"
                  value={config.brandName}
                  onChange={(e) => onUpdateConfig({ brandName: e.target.value })}
                />
                <input
                  id="brand-tagline-input"
                  className="text-input"
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

              <div
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
                <div className="dropzone-title">Upload Logo or Wall Artwork</div>
                <div className="dropzone-sub">PNG, JPG, SVG · Drop or browse</div>
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
              </div>

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
              <h2>Stand Templates</h2>
              <p>Start with an exhibition-ready layout and customize every detail.</p>
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
              <h2>Stand Equipment ({items.length})</h2>
              <p>Select, lock, hide, or duplicate placed items.</p>
            </div>
            <div className="layers-list">
              {items.length === 0 ? (
                <div className="empty-state-box">
                  Your stand is empty. Open the <strong>Kit</strong> tab to add quick-fold walls,
                  counters, and displays.
                </div>
              ) : (
                items.map((item) => {
                  const selected = item.id === selectedItemId;
                  return (
                    <div
                      key={item.id}
                      className={`layer-row ${selected ? 'selected' : ''}`}
                      onClick={() => onSelectItem(item.id)}
                    >
                      <span className="layer-name">{item.name}</span>
                      <div className="layer-actions" onClick={(e) => e.stopPropagation()}>
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
    </aside>
  );
};
