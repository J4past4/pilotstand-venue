import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Check,
  Copy,
  FileImage,
  ImagePlus,
  Layers,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  computePrimitivesBounds,
  CUSTOM_ASSET_CATEGORIES,
} from '../engine/customAssetMesh';
import { isSupportedModelFile, parseAndRegister3DModel } from '../engine/modelLoader';
import type {
  BrandAsset,
  CustomAssetCategory,
  CustomBuiltAsset,
  CustomModelAsset,
} from '../types/stand';
import type { BuilderMode } from './CustomAssetBuilderModal';
import './assetLibrary.css';

type LibraryTab = 'all' | 'built' | 'models' | 'graphics';

interface AssetLibraryModalProps {
  customBuiltAssets: CustomBuiltAsset[];
  customModels: CustomModelAsset[];
  uploadedGraphics: BrandAsset[];
  onClose: () => void;
  onOpenAssetBuilder: (mode: BuilderMode) => void;
  onEditBuiltAsset: (asset: CustomBuiltAsset) => void;
  onDuplicateBuiltAsset: (asset: CustomBuiltAsset) => void;
  onRenameBuiltAsset: (assetId: string, name: string, category?: CustomAssetCategory) => void;
  onDeleteBuiltAsset: (assetId: string) => void;
  onPlaceBuiltAsset: (asset: CustomBuiltAsset) => void;
  onRegisterCustomModel: (asset: CustomModelAsset) => void;
  onUpdateCustomModel: (assetId: string, patch: Partial<CustomModelAsset>) => void;
  onDeleteCustomModel: (assetId: string) => void;
  onPlaceCustomModel: (asset: CustomModelAsset) => void;
  onAddGraphicAsset: (asset: BrandAsset) => void;
  onUpdateGraphicAsset: (assetId: string, patch: Partial<BrandAsset>) => void;
  onDeleteGraphicAsset: (assetId: string) => void;
}

const CATEGORY_LABEL_MAP: Record<CustomAssetCategory, string> = {
  product: 'Product',
  machine: 'Machine',
  furniture: 'Furniture',
  structure: 'Structure',
  signage: 'Signage',
  other: 'Other',
};

/**
 * Compact top-down architectural SVG thumbnail rendered directly from a CustomBuiltAsset's primitives.
 */
const BuiltAssetMiniPreview: React.FC<{ asset: CustomBuiltAsset }> = ({ asset }) => {
  const bounds = useMemo(() => computePrimitivesBounds(asset.primitives), [asset.primitives]);
  const spanW = Math.max(200, bounds.widthMm);
  const spanD = Math.max(200, bounds.depthMm);
  const pad = Math.max(spanW, spanD) * 0.16;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const vbW = spanW + pad * 2;
  const vbH = spanD + pad * 2;

  return (
    <svg
      className="alib-thumb-svg"
      viewBox={`${cx - vbW / 2} ${cz - vbH / 2} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {asset.primitives.map((p) => {
        const effD = p.kind === 'cylinder' || p.kind === 'cone' || p.kind === 'ring' ? p.w : p.d;
        const stroke = '#0f172a';
        const sw = Math.max(8, Math.max(vbW, vbH) * 0.014);
        if (p.kind === 'cylinder' || p.kind === 'cone' || p.kind === 'sphere' || p.kind === 'ring') {
          return (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.z}
              r={p.w / 2}
              fill={p.color}
              fillOpacity={p.finish === 'glass' ? 0.35 : 0.88}
              stroke={stroke}
              strokeWidth={sw}
            />
          );
        }
        if (p.kind === 'extrusion' && p.points && p.points.length >= 3) {
          const pts = p.points.map((pt) => `${p.x + pt.x},${p.z + pt.y}`).join(' ');
          return (
            <polygon
              key={p.id}
              points={pts}
              fill={p.color}
              fillOpacity={0.88}
              stroke={stroke}
              strokeWidth={sw}
            />
          );
        }
        return (
          <rect
            key={p.id}
            x={p.x - p.w / 2}
            y={p.z - effD / 2}
            width={p.w}
            height={effD}
            rx={Math.min(p.w, effD) * 0.06}
            fill={p.color}
            fillOpacity={p.finish === 'glass' ? 0.35 : 0.88}
            stroke={stroke}
            strokeWidth={sw}
            transform={p.rotY ? `rotate(${-p.rotY} ${p.x} ${p.z})` : undefined}
          />
        );
      })}
    </svg>
  );
};

export const AssetLibraryModal: React.FC<AssetLibraryModalProps> = ({
  customBuiltAssets,
  customModels,
  uploadedGraphics,
  onClose,
  onOpenAssetBuilder,
  onEditBuiltAsset,
  onDuplicateBuiltAsset,
  onRenameBuiltAsset,
  onDeleteBuiltAsset,
  onPlaceBuiltAsset,
  onRegisterCustomModel,
  onUpdateCustomModel,
  onDeleteCustomModel,
  onPlaceCustomModel,
  onAddGraphicAsset,
  onUpdateGraphicAsset,
  onDeleteGraphicAsset,
}) => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('all');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CustomAssetCategory | 'all'>('all');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Upload & Setup 3D Model drawer state
  const modelInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingModel, setPendingModel] = useState<CustomModelAsset | null>(null);
  const [modelNameDraft, setModelNameDraft] = useState('');
  const [modelCatDraft, setModelCatDraft] = useState<CustomAssetCategory>('product');
  const [modelWMm, setModelWMm] = useState(1000);
  const [modelDMm, setModelDMm] = useState(1000);
  const [modelHMm, setModelHMm] = useState(1000);
  const [modelZUp, setModelZUp] = useState(false);
  const [modelTint, setModelTint] = useState('');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Upload & Setup 2D Graphic drawer state
  const graphicInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingGraphic, setPendingGraphic] = useState<BrandAsset | null>(null);
  const [graphicNameDraft, setGraphicNameDraft] = useState('');
  const [graphicCatDraft, setGraphicCatDraft] = useState<'logo' | 'banner' | 'screen' | 'pattern'>('logo');

  const handleSelect3DFile = async (file: File) => {
    setUploadError(null);
    if (!isSupportedModelFile(file)) {
      setUploadError('Unsupported 3D format. Please choose a .GLB, .GLTF, .STL, or .OBJ file.');
      return;
    }
    try {
      const parsed = await parseAndRegister3DModel(file);
      setPendingModel(parsed);
      setEditingModelId(null);
      setModelNameDraft(parsed.name);
      setModelCatDraft('product');
      setModelWMm(Math.round(parsed.originalDims.w * 1000));
      setModelDMm(Math.round(parsed.originalDims.d * 1000));
      setModelHMm(Math.round(parsed.originalDims.h * 1000));
      setModelZUp(false);
      setModelTint('');
    } catch {
      setUploadError(`Could not parse "${file.name}". Please verify the 3D file is valid.`);
    }
  };

  const openModelConfigure = (m: CustomModelAsset) => {
    setPendingModel(m);
    setEditingModelId(m.id);
    setModelNameDraft(m.name);
    setModelCatDraft(m.category || 'product');
    setModelWMm(Math.round(m.originalDims.w * 1000));
    setModelDMm(Math.round(m.originalDims.d * 1000));
    setModelHMm(Math.round(m.originalDims.h * 1000));
    setModelZUp(Boolean(m.zUpFix));
    setModelTint(m.defaultTintColor || '');
  };

  const savePendingModel = (placeNow: boolean) => {
    if (!pendingModel) return;
    const configured: CustomModelAsset = {
      ...pendingModel,
      name: modelNameDraft.trim() || pendingModel.name,
      category: modelCatDraft,
      originalDims: {
        w: Math.max(0.05, Number((modelWMm / 1000).toFixed(2))),
        d: Math.max(0.05, Number((modelDMm / 1000).toFixed(2))),
        h: Math.max(0.05, Number((modelHMm / 1000).toFixed(2))),
      },
      zUpFix: modelZUp,
      defaultTintColor: modelTint || undefined,
    };

    if (editingModelId) {
      onUpdateCustomModel(editingModelId, configured);
    } else {
      onRegisterCustomModel(configured);
    }
    setPendingModel(null);
    setEditingModelId(null);

    if (placeNow) {
      onPlaceCustomModel(configured);
      onClose();
    }
  };

  const handleSelectGraphicFile = (file: File) => {
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const cleanName = file.name.replace(/\.[^.]+$/, '');
        const guessedCat =
          file.type.includes('svg') || file.type.includes('png') ? 'logo' : 'banner';
        setPendingGraphic({
          id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: cleanName,
          dataUrl,
          width: img.naturalWidth || 1000,
          height: img.naturalHeight || 1000,
          kind: 'uploaded',
          category: guessedCat,
        });
        setGraphicNameDraft(cleanName);
        setGraphicCatDraft(guessedCat);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const savePendingGraphic = () => {
    if (!pendingGraphic) return;
    onAddGraphicAsset({
      ...pendingGraphic,
      name: graphicNameDraft.trim() || pendingGraphic.name,
      category: graphicCatDraft,
    });
    setPendingGraphic(null);
  };

  const q = search.trim().toLowerCase();

  const filteredBuilt = useMemo(() => {
    return customBuiltAssets.filter((a) => {
      if (categoryFilter !== 'all' && (a.category || 'product') !== categoryFilter) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q);
    });
  }, [customBuiltAssets, categoryFilter, q]);

  const filteredModels = useMemo(() => {
    return customModels.filter((m) => {
      if (categoryFilter !== 'all' && (m.category || 'product') !== categoryFilter) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.format.toLowerCase().includes(q);
    });
  }, [customModels, categoryFilter, q]);

  const filteredGraphics = useMemo(() => {
    return uploadedGraphics.filter((g) => {
      if (!q) return true;
      return g.name.toLowerCase().includes(q) || (g.category || '').toLowerCase().includes(q);
    });
  }, [uploadedGraphics, q]);

  const totalCount = customBuiltAssets.length + customModels.length + uploadedGraphics.length;

  return (
    <div
      className="modal-backdrop alib-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="alib-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Asset Library"
      >
        {/* ==================== HEADER ==================== */}
        <header className="alib-header">
          <div className="alib-header-left">
            <div className="alib-header-icon">
              <Layers size={18} />
            </div>
            <div>
              <h2>Asset Library</h2>
              <p>
                Create, upload, name &amp; configure reusable 3D assets and graphics across all
                stands.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="cab-close-btn"
            onClick={onClose}
            aria-label="Close Asset Library"
          >
            <X size={18} />
          </button>
        </header>

        {/* ==================== QUICK CREATE / UPLOAD BAR ==================== */}
        <div className="alib-action-bar">
          <button
            type="button"
            id="alib-create-shapes-btn"
            className="primary-btn"
            onClick={() => onOpenAssetBuilder('shapes')}
          >
            <Plus size={14} />
            <span>Create with Shapes</span>
          </button>
          <button
            type="button"
            id="alib-create-schematic-btn"
            className="secondary-btn"
            onClick={() => onOpenAssetBuilder('schematic')}
          >
            <FileImage size={14} />
            <span>From 2D Schematic</span>
          </button>
          <button
            type="button"
            id="alib-upload-3d-btn"
            className="secondary-btn"
            onClick={() => modelInputRef.current?.click()}
          >
            <Upload size={14} />
            <span>Upload 3D (.GLB / .STL / .OBJ)</span>
          </button>
          <button
            type="button"
            id="alib-upload-graphic-btn"
            className="secondary-btn"
            onClick={() => graphicInputRef.current?.click()}
          >
            <ImagePlus size={14} />
            <span>Upload 2D Graphic</span>
          </button>

          <input
            ref={modelInputRef}
            type="file"
            accept=".glb,.gltf,.stl,.obj"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleSelect3DFile(file);
              e.target.value = '';
            }}
          />
          <input
            ref={graphicInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleSelectGraphicFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* ==================== INLINE UPLOAD & SETUP PANEL ==================== */}
        {uploadError && (
          <div className="alib-error-banner">
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {pendingModel && (
          <div className="alib-setup-panel">
            <div className="alib-setup-head">
              <strong>
                <SlidersHorizontal size={14} />{' '}
                {editingModelId ? 'Configure 3D Asset' : 'Set Up Uploaded 3D Asset'} (
                {pendingModel.format.toUpperCase()})
              </strong>
              <button
                type="button"
                className="alib-link-btn"
                onClick={() => {
                  setPendingModel(null);
                  setEditingModelId(null);
                }}
              >
                Cancel
              </button>
            </div>
            <div className="alib-setup-grid">
              <label className="cab-num-field">
                <span>Asset Name</span>
                <input
                  type="text"
                  className="cab-input-text"
                  value={modelNameDraft}
                  onChange={(e) => setModelNameDraft(e.target.value)}
                  placeholder="e.g. Display Product, Coffee Machine..."
                />
              </label>
              <label className="cab-num-field">
                <span>Category</span>
                <select
                  className="cab-input-text"
                  value={modelCatDraft}
                  onChange={(e) => setModelCatDraft(e.target.value as CustomAssetCategory)}
                >
                  {CUSTOM_ASSET_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="cab-num-field">
                <span>Width (mm)</span>
                <input
                  type="number"
                  min={50}
                  max={12000}
                  step={10}
                  value={modelWMm}
                  onChange={(e) => setModelWMm(Math.max(50, Number(e.target.value) || 50))}
                />
              </label>
              <label className="cab-num-field">
                <span>Depth (mm)</span>
                <input
                  type="number"
                  min={50}
                  max={12000}
                  step={10}
                  value={modelDMm}
                  onChange={(e) => setModelDMm(Math.max(50, Number(e.target.value) || 50))}
                />
              </label>
              <label className="cab-num-field">
                <span>Height (mm)</span>
                <input
                  type="number"
                  min={50}
                  max={8000}
                  step={10}
                  value={modelHMm}
                  onChange={(e) => setModelHMm(Math.max(50, Number(e.target.value) || 50))}
                />
              </label>
              <label className="cab-num-field">
                <span>Optional Tint</span>
                <div className="alib-tint-row">
                  <input
                    type="color"
                    value={modelTint || '#CBD5E1'}
                    onChange={(e) => setModelTint(e.target.value)}
                  />
                  {modelTint && (
                    <button
                      type="button"
                      className="alib-link-btn"
                      onClick={() => setModelTint('')}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>
            </div>
            <div className="alib-setup-footer">
              <label className="alib-checkbox-label">
                <input
                  type="checkbox"
                  checked={modelZUp}
                  onChange={(e) => setModelZUp(e.target.checked)}
                />
                <span>Apply CAD Z-Up → Y-Up orientation fix</span>
              </label>
              <div className="alib-setup-btns">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => savePendingModel(false)}
                >
                  <Check size={14} /> Save to Library
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => savePendingModel(true)}
                >
                  <Plus size={14} /> Save &amp; Place on Stand
                </button>
              </div>
            </div>
          </div>
        )}

        {pendingGraphic && (
          <div className="alib-setup-panel">
            <div className="alib-setup-head">
              <strong>
                <ImagePlus size={14} /> Set Up Uploaded 2D Graphic
              </strong>
              <button
                type="button"
                className="alib-link-btn"
                onClick={() => setPendingGraphic(null)}
              >
                Cancel
              </button>
            </div>
            <div className="alib-graphic-setup-row">
              <img
                src={pendingGraphic.dataUrl}
                alt={graphicNameDraft}
                className="alib-graphic-setup-thumb"
              />
              <div className="alib-setup-grid" style={{ flex: 1 }}>
                <label className="cab-num-field">
                  <span>Graphic Name</span>
                  <input
                    type="text"
                    className="cab-input-text"
                    value={graphicNameDraft}
                    onChange={(e) => setGraphicNameDraft(e.target.value)}
                  />
                </label>
                <label className="cab-num-field">
                  <span>Usage Category</span>
                  <select
                    className="cab-input-text"
                    value={graphicCatDraft}
                    onChange={(e) =>
                      setGraphicCatDraft(
                        e.target.value as 'logo' | 'banner' | 'screen' | 'pattern'
                      )
                    }
                  >
                    <option value="logo">Logo</option>
                    <option value="banner">Wall / Banner Artwork</option>
                    <option value="screen">Digital Screen</option>
                    <option value="pattern">Texture / Pattern</option>
                  </select>
                </label>
              </div>
              <button type="button" className="primary-btn" onClick={savePendingGraphic}>
                <Check size={14} /> Save Graphic
              </button>
            </div>
          </div>
        )}

        {/* ==================== FILTER & SEARCH TOOLBAR ==================== */}
        <div className="alib-toolbar">
          <div className="alib-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              className={activeTab === 'all' ? 'active' : ''}
              onClick={() => setActiveTab('all')}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'built'}
              className={activeTab === 'built' ? 'active' : ''}
              onClick={() => setActiveTab('built')}
            >
              Custom Built ({customBuiltAssets.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'models'}
              className={activeTab === 'models' ? 'active' : ''}
              onClick={() => setActiveTab('models')}
            >
              Uploaded 3D ({customModels.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'graphics'}
              className={activeTab === 'graphics' ? 'active' : ''}
              onClick={() => setActiveTab('graphics')}
            >
              2D Graphics ({uploadedGraphics.length})
            </button>
          </div>

          <div className="alib-search-wrap">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {activeTab !== 'graphics' && (
          <div className="alib-cat-strip">
            <button
              type="button"
              className={`alib-cat-pill ${categoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              All Categories
            </button>
            {CUSTOM_ASSET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`alib-cat-pill ${categoryFilter === cat.id ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* ==================== ASSET CARDS GRID ==================== */}
        <div className="alib-body">
          {totalCount === 0 ? (
            <div className="alib-empty">
              <Box size={32} />
              <h3>Your Asset Library is empty</h3>
              <p>
                Build custom products, counters, structures, or machinery from simple dimensioned
                shapes, trace from a 2D schematic, or upload your own 3D models &amp; brand
                graphics.
              </p>
              <div className="alib-empty-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => onOpenAssetBuilder('shapes')}
                >
                  <Plus size={14} /> Create First Asset
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => modelInputRef.current?.click()}
                >
                  <Upload size={14} /> Upload 3D Model
                </button>
              </div>
            </div>
          ) : (
            <div className="alib-grid">
              {/* Custom Built 3D Assets */}
              {(activeTab === 'all' || activeTab === 'built') &&
                filteredBuilt.map((asset) => {
                  const isRenaming = renamingId === asset.id;
                  return (
                    <article key={asset.id} className="alib-card">
                      <div className="alib-card-preview">
                        <BuiltAssetMiniPreview asset={asset} />
                        <span className="alib-type-badge">
                          {CATEGORY_LABEL_MAP[asset.category || 'product']}
                        </span>
                      </div>
                      <div className="alib-card-body">
                        <div className="alib-card-title-row">
                          {isRenaming ? (
                            <input
                              type="text"
                              className="alib-rename-input"
                              value={renameDraft}
                              autoFocus
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => {
                                if (renameDraft.trim()) {
                                  onRenameBuiltAsset(asset.id, renameDraft.trim());
                                }
                                setRenamingId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (renameDraft.trim()) {
                                    onRenameBuiltAsset(asset.id, renameDraft.trim());
                                  }
                                  setRenamingId(null);
                                }
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                            />
                          ) : (
                            <h3 title={asset.name}>{asset.name}</h3>
                          )}
                          {!isRenaming && (
                            <button
                              type="button"
                              className="alib-icon-btn"
                              title="Rename asset"
                              onClick={() => {
                                setRenamingId(asset.id);
                                setRenameDraft(asset.name);
                              }}
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                        <div className="alib-card-meta mono-num">
                          <span>
                            {Math.round(asset.dims.w * 1000)} × {Math.round(asset.dims.d * 1000)} ×{' '}
                            {Math.round(asset.dims.h * 1000)} mm
                          </span>
                          <span>· {asset.primitives.length} parts</span>
                        </div>
                      </div>
                      <div className="alib-card-footer">
                        <button
                          type="button"
                          className="primary-btn alib-place-btn"
                          onClick={() => {
                            onPlaceBuiltAsset(asset);
                            onClose();
                          }}
                        >
                          <Plus size={13} /> Place on Stand
                        </button>
                        <button
                          type="button"
                          className="alib-icon-btn"
                          title="Edit shapes & dimensions"
                          onClick={() => onEditBuiltAsset(asset)}
                        >
                          <SlidersHorizontal size={13} />
                        </button>
                        <button
                          type="button"
                          className="alib-icon-btn"
                          title="Duplicate asset"
                          onClick={() => onDuplicateBuiltAsset(asset)}
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          type="button"
                          className="alib-icon-btn danger"
                          title="Delete asset"
                          onClick={() => onDeleteBuiltAsset(asset.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}

              {/* Uploaded 3D Models */}
              {(activeTab === 'all' || activeTab === 'models') &&
                filteredModels.map((m) => (
                  <article key={m.id} className="alib-card">
                    <div className="alib-card-preview alib-model-preview">
                      <Box size={30} />
                      <span className="alib-format-tag mono-num">{m.format.toUpperCase()}</span>
                      <span className="alib-type-badge">
                        {CATEGORY_LABEL_MAP[m.category || 'product']}
                      </span>
                    </div>
                    <div className="alib-card-body">
                      <div className="alib-card-title-row">
                        <h3 title={m.name}>{m.name}</h3>
                      </div>
                      <div className="alib-card-meta mono-num">
                        <span>
                          {Math.round(m.originalDims.w * 1000)} ×{' '}
                          {Math.round(m.originalDims.d * 1000)} ×{' '}
                          {Math.round(m.originalDims.h * 1000)} mm
                        </span>
                      </div>
                    </div>
                    <div className="alib-card-footer">
                      <button
                        type="button"
                        className="primary-btn alib-place-btn"
                        onClick={() => {
                          onPlaceCustomModel(m);
                          onClose();
                        }}
                      >
                        <Plus size={13} /> Place on Stand
                      </button>
                      <button
                        type="button"
                        className="alib-icon-btn"
                        title="Rename & configure dimensions"
                        onClick={() => openModelConfigure(m)}
                      >
                        <SlidersHorizontal size={13} />
                      </button>
                      <button
                        type="button"
                        className="alib-icon-btn danger"
                        title="Delete 3D model"
                        onClick={() => onDeleteCustomModel(m.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}

              {/* Uploaded 2D Graphics */}
              {(activeTab === 'all' || activeTab === 'graphics') &&
                filteredGraphics.map((g) => {
                  const isRenaming = renamingId === g.id;
                  return (
                    <article key={g.id} className="alib-card">
                      <div className="alib-card-preview alib-graphic-preview">
                        <img src={g.dataUrl} alt={g.name} />
                        <span className="alib-type-badge">{g.category || 'graphic'}</span>
                      </div>
                      <div className="alib-card-body">
                        <div className="alib-card-title-row">
                          {isRenaming ? (
                            <input
                              type="text"
                              className="alib-rename-input"
                              value={renameDraft}
                              autoFocus
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => {
                                if (renameDraft.trim()) {
                                  onUpdateGraphicAsset(g.id, { name: renameDraft.trim() });
                                }
                                setRenamingId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (renameDraft.trim()) {
                                    onUpdateGraphicAsset(g.id, { name: renameDraft.trim() });
                                  }
                                  setRenamingId(null);
                                }
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                            />
                          ) : (
                            <h3 title={g.name}>{g.name}</h3>
                          )}
                          {!isRenaming && (
                            <button
                              type="button"
                              className="alib-icon-btn"
                              title="Rename graphic"
                              onClick={() => {
                                setRenamingId(g.id);
                                setRenameDraft(g.name);
                              }}
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                        <div className="alib-card-meta mono-num">
                          <span>
                            {g.width} × {g.height} px
                          </span>
                        </div>
                      </div>
                      <div className="alib-card-footer">
                        <select
                          className="alib-graphic-cat-select"
                          value={g.category || 'logo'}
                          onChange={(e) =>
                            onUpdateGraphicAsset(g.id, {
                              category: e.target.value as 'logo' | 'banner' | 'screen' | 'pattern',
                            })
                          }
                        >
                          <option value="logo">Logo</option>
                          <option value="banner">Banner</option>
                          <option value="screen">Screen</option>
                          <option value="pattern">Pattern</option>
                        </select>
                        <button
                          type="button"
                          className="alib-icon-btn danger"
                          title="Delete graphic"
                          onClick={() => onDeleteGraphicAsset(g.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
