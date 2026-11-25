import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Copy,
  ImagePlus,
  LayoutPanelTop,
  Lightbulb,
  Lock,
  RotateCw,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { CATALOG_MAP } from '../data/catalog';
import { getExclusiveModelById } from '../data/userModels';
import type {
  ArtworkFit,
  BrandAsset,
  ComplianceReport,
  FixtureBrandFace,
  FixtureOwner,
  ShellWallSide,
  StandConfig,
  StandItem,
  SurfaceArtwork,
  VenueBrandingConfig,
} from '../types/stand';
import {
  clampVenueBrandingToDims,
  computeVenueFixtureBrandableAreaM2,
  createDefaultVenueBranding,
  getAvailableFacesForFixture,
  getEffectiveFaceZoneWidth,
  getFaceLabel,
  getMaxZoneWidthForFixture,
  isItemBrandingAllowed,
  isVenueFixtureCatalogId,
  isVenuePermanentFixture,
} from '../utils/fixtures';
import { formatArea, formatLength } from '../utils/pricing';
import './inspector.css';

interface RightInspectorProps {
  config: StandConfig;
  onUpdateConfig: (patch: Partial<StandConfig>) => void;
  selectedItem: StandItem | null;
  selectedSurfaceId: string | null;
  selectedShellWall: ShellWallSide | null;
  onSelectShellWall: (side: ShellWallSide | null) => void;
  onUpdateItem: (id: string, patch: Partial<StandItem>, commit?: boolean) => void;
  onUpdateItemArtwork: (
    itemId: string,
    surfaceId: string,
    patch: Partial<SurfaceArtwork>
  ) => void;
  onUpdateShellArtwork: (side: ShellWallSide, patch: Partial<SurfaceArtwork> | null) => void;
  onDuplicateItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  assets: BrandAsset[];
  onUploadAssetForSurface: (
    file: File,
    target:
      | { kind: 'item'; itemId: string; surfaceId: string }
      | { kind: 'shell'; side: ShellWallSide }
  ) => void;
  compliance: ComplianceReport;
  onOpenBrandingTab: () => void;
  onEditCustomBuiltAsset?: (item: StandItem) => void;
  onClose: () => void;
}

const DEFAULT_ART: SurfaceArtwork = {
  assetId: null,
  fit: 'cover',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  bgColor: '#1B365D',
  emissive: false,
};

export const RightInspector: React.FC<RightInspectorProps> = React.memo(({
  config,
  onUpdateConfig,
  selectedItem,
  selectedSurfaceId,
  selectedShellWall,
  onSelectShellWall,
  onUpdateItem,
  onUpdateItemArtwork,
  onUpdateShellArtwork,
  onDuplicateItem,
  onDeleteItem,
  assets,
  onUploadAssetForSurface,
  compliance,
  onOpenBrandingTab,
  onEditCustomBuiltAsset,
  onClose,
}) => {
  const surfaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const inspectorBodyRef = useRef<HTMLDivElement>(null);

  const scrollToSection = (id: string) => {
    inspectorBodyRef.current?.querySelector(`#${id}`)?.scrollIntoView({ block: 'start' });
  };

  useEffect(() => {
    inspectorBodyRef.current?.scrollTo({ top: 0 });
  }, [selectedItem?.id]);
  const uploadTargetRef = useRef<
    | { kind: 'item'; itemId: string; surfaceId: string }
    | { kind: 'shell'; side: ShellWallSide }
    | null
  >(null);

  const triggerZoneUpload = (
    target:
      | { kind: 'item'; itemId: string; surfaceId: string }
      | { kind: 'shell'; side: ShellWallSide }
  ) => {
    uploadTargetRef.current = target;
    surfaceFileInputRef.current?.click();
  };

  const handleZoneFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = uploadTargetRef.current;
    if (file && target) {
      onUploadAssetForSurface(file, target);
    }
    e.target.value = '';
  };

  // ==================== SHELL WALL INSPECTOR ====================
  if (selectedShellWall && !selectedItem) {
    const wallLen = selectedShellWall === 'back' ? config.width : config.depth;
    const art = config.shellArtwork[selectedShellWall] || {
      ...DEFAULT_ART,
      bgColor: config.primaryColor,
    };

    return (
      <aside className="right-inspector contextual-inspector" aria-label="Shell wall inspector">
        <input
          ref={surfaceFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleZoneFileChange}
        />
        <div className="inspector-header">
          <LayoutPanelTop className="inspector-heading-icon" size={24} aria-hidden="true" />
          <div className="inspector-heading">
            <h2>
              {selectedShellWall.charAt(0).toUpperCase() + selectedShellWall.slice(1)} wall graphic
            </h2>
            <p className="inspector-kicker">Perimeter shell wall</p>
          </div>
          <button
            type="button"
            className="inspector-close"
            onClick={onClose}
            aria-label="Close wall inspector"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="inspector-body">
          <div className="print-spec-banner">
            <span>Full Wall Print Dimensions</span>
            <strong className="mono-num">
              {Math.round(wallLen * 1000)} × {Math.round(config.shellWallHeight * 1000)} mm
            </strong>
          </div>

          <div className="control-block">
            <div className="control-label-row">
              <label className="block-label" style={{ marginBottom: 0 }}>
                Wall Mural Artwork
              </label>
              <button
                className="upload-inline-btn"
                onClick={() => triggerZoneUpload({ kind: 'shell', side: selectedShellWall })}
              >
                <ImagePlus size={12} /> Upload
              </button>
            </div>

            <div className="mini-asset-strip">
              <button
                className={`mini-asset-chip ${!art.assetId ? 'active' : ''}`}
                onClick={() => onUpdateShellArtwork(selectedShellWall, null)}
              >
                <span>Blank Wall</span>
              </button>
              {assets.map((a) => (
                <button
                  key={a.id}
                  className={`mini-asset-chip ${art.assetId === a.id ? 'active' : ''}`}
                  onClick={() =>
                    onUpdateShellArtwork(selectedShellWall, {
                      ...art,
                      assetId: a.id,
                    })
                  }
                  title={a.name}
                >
                  <img src={a.dataUrl} alt={a.name} />
                </button>
              ))}
            </div>

            {art.assetId && (
              <div className="artwork-framing-controls">
                <div className="fit-btn-row">
                  {(['cover', 'contain', 'stretch'] as ArtworkFit[]).map((mode) => (
                    <button
                      key={mode}
                      className={`fit-btn ${art.fit === mode ? 'active' : ''}`}
                      onClick={() => onUpdateShellArtwork(selectedShellWall, { fit: mode })}
                    >
                      {mode === 'cover' ? 'Fill' : mode === 'contain' ? 'Contain' : 'Stretch'}
                    </button>
                  ))}
                </div>
                <div className="slider-row">
                  <div className="slider-header">
                    <span>Scale</span>
                    <span className="mono-num">{Math.round(art.scale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={2}
                    step={0.05}
                    value={art.scale}
                    onChange={(e) =>
                      onUpdateShellArtwork(selectedShellWall, {
                        scale: parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="color-inline-row">
                  <span>Backdrop Fill</span>
                  <input
                    type="color"
                    value={art.bgColor}
                    onChange={(e) =>
                      onUpdateShellArtwork(selectedShellWall, { bgColor: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // ==================== SELECTED ITEM INSPECTOR ====================
  if (selectedItem) {
    const def = CATALOG_MAP[selectedItem.catalogId];
    const isOutOfBounds = compliance.outOfBoundsIds.includes(selectedItem.id);
    const isOverHeight = compliance.overHeightIds.includes(selectedItem.id);
    const isPermanent = Boolean(selectedItem.isPermanentFixture);
    const isVenueFixture = isVenuePermanentFixture(selectedItem);
    const venueBranding: VenueBrandingConfig =
      selectedItem.venueBranding ??
      createDefaultVenueBranding(selectedItem.dims, selectedItem.catalogId);
    const availableFixtureFaces = getAvailableFacesForFixture(selectedItem);
    const maxZoneW = getMaxZoneWidthForFixture(selectedItem.dims, selectedItem.catalogId);
    const venueBrandableAreaM2 = computeVenueFixtureBrandableAreaM2(selectedItem);
    const canShowArtwork = isVenueFixture
      ? Boolean(venueBranding.allowed)
      : Boolean(def && def.surfaces.length > 0);

    const updateVenueBranding = (patch: Partial<VenueBrandingConfig>, commit = true) => {
      const merged = clampVenueBrandingToDims(
        { ...venueBranding, ...patch },
        selectedItem.dims,
        selectedItem.catalogId
      );
      onUpdateItem(selectedItem.id, { venueBranding: merged }, commit);
    };

    const toggleFixtureFace = (face: FixtureBrandFace) => {
      const current = venueBranding.allowedFaces || ['front'];
      const exists = current.includes(face);
      const next = exists
        ? current.length > 1
          ? current.filter((f) => f !== face)
          : current
        : [...current, face];
      updateVenueBranding({ allowedFaces: next }, true);
    };

    const updateFixtureDims = (nextDims: { w: number; h: number; d: number }, commit = false) => {
      const patch: Partial<StandItem> = { dims: nextDims };
      if (selectedItem.venueBranding) {
        patch.venueBranding = clampVenueBrandingToDims(
          selectedItem.venueBranding,
          nextDims,
          selectedItem.catalogId
        );
      }
      onUpdateItem(selectedItem.id, patch, commit);
    };

    return (
      <aside className="right-inspector contextual-inspector" id="item-inspector" aria-label="Selected item inspector">
        <input
          ref={surfaceFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleZoneFileChange}
        />

        <div className="inspector-header">
          <Box className="inspector-heading-icon" size={24} aria-hidden="true" />
          <div className="inspector-heading">
            <h2>{selectedItem.name}</h2>
            <p className="inspector-kicker">
              {isVenueFixture
                ? 'Permanent Venue Fixture'
                : isPermanent
                  ? 'Own Permanent Fixture'
                  : def?.category || 'Equipment'}{' '}
              · Selected
            </p>
          </div>
          <button
            type="button"
            className="inspector-close"
            onClick={onClose}
            title="Deselect item (Esc)"
            aria-label="Close item inspector"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="inspector-quickbar">
          <button
            id="btn-rotate-90"
            className="quick-action-btn"
            onClick={() =>
              onUpdateItem(
                selectedItem.id,
                { rotationY: (selectedItem.rotationY + 90) % 360 },
                true
              )
            }
            title="Rotate 90°"
          >
            <RotateCw size={14} />
            <span>90°</span>
          </button>
          <button
            id="btn-duplicate-item"
            className="quick-action-btn"
            onClick={() => onDuplicateItem(selectedItem.id)}
            title="Duplicate (Ctrl+D)"
          >
            <Copy size={14} />
            <span>Copy</span>
          </button>
          <button
            className={`quick-action-btn ${selectedItem.locked ? 'active' : ''}`}
            onClick={() => onUpdateItem(selectedItem.id, { locked: !selectedItem.locked }, true)}
            title={selectedItem.locked ? 'Unlock position' : 'Lock position'}
            aria-pressed={Boolean(selectedItem.locked)}
          >
            {selectedItem.locked ? <Lock size={14} /> : <Unlock size={14} />}
            <span>{selectedItem.locked ? 'Locked' : 'Lock'}</span>
          </button>
          <button
            id="btn-delete-item"
            className="quick-action-btn danger"
            onClick={() => onDeleteItem(selectedItem.id)}
            title="Delete item (Del)"
            aria-label="Delete item"
          >
            <Trash2 size={14} />
          </button>
        </div>

        <nav className="inspector-sections" aria-label="Item properties">
          <button type="button" onClick={() => scrollToSection('item-fixture')}>Fixture</button>
          <button type="button" onClick={() => scrollToSection('item-size')}>Size</button>
          <button type="button" onClick={() => scrollToSection('item-finish')}>Finish</button>
          {canShowArtwork && (
            <button type="button" onClick={() => scrollToSection('item-artwork')}>Artwork</button>
          )}
          <button type="button" onClick={() => scrollToSection('item-position')}>Position</button>
        </nav>

        <div className="inspector-body" ref={inspectorBodyRef}>
          {(isOutOfBounds || isOverHeight) && (
            <div className="inspector-alert">
              <AlertTriangle size={15} />
              <div>
                {isOutOfBounds && <div>Extends outside booked stand footprint.</div>}
                {isOverHeight && (
                  <div>
                    Exceeds venue height limit ({formatLength(config.heightLimit, config.unit)}).
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== PERMANENT FIXTURE & VENUE BRANDING ==================== */}
          <section id="item-fixture" className="inspector-section">
            <h3 className="inspector-section-title">Site Fixture &amp; Branding Rules</h3>
            <div className="control-block" style={{ marginBottom: 0 }}>
              <div className="toggle-row compact" style={{ marginTop: 0 }}>
                <div>
                  <div className="toggle-title">Permanent Stand-Location Fixture</div>
                  <div className="toggle-sub">
                    Fixed to this stand location; preserved across new design variations &amp; allowed on outer meter grid
                  </div>
                </div>
                <input
                  id="toggle-permanent-fixture"
                  type="checkbox"
                  className="studio-switch"
                  checked={isPermanent}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const owner: FixtureOwner =
                      selectedItem.fixtureOwner ??
                      (isVenueFixtureCatalogId(selectedItem.catalogId) ? 'venue' : 'venue');
                    onUpdateItem(
                      selectedItem.id,
                      {
                        isPermanentFixture: checked,
                        fixtureOwner: checked ? owner : undefined,
                        venueBranding:
                          checked && owner === 'venue'
                            ? selectedItem.venueBranding ??
                              createDefaultVenueBranding(selectedItem.dims, selectedItem.catalogId)
                            : selectedItem.venueBranding,
                      },
                      true
                    );
                  }}
                />
              </div>

              {isPermanent && (
                <div className="fixture-rules-panel">
                  <label className="block-label" style={{ marginTop: 10 }}>
                    Fixture Ownership
                  </label>
                  <div className="fit-btn-row">
                    <button
                      type="button"
                      id="fixture-owner-venue"
                      className={`fit-btn ${isVenueFixture ? 'active' : ''}`}
                      onClick={() =>
                        onUpdateItem(
                          selectedItem.id,
                          {
                            fixtureOwner: 'venue',
                            venueBranding:
                              selectedItem.venueBranding ??
                              createDefaultVenueBranding(selectedItem.dims, selectedItem.catalogId),
                          },
                          true
                        )
                      }
                    >
                      Exhibition / Venue
                    </button>
                    <button
                      type="button"
                      id="fixture-owner-own"
                      className={`fit-btn ${!isVenueFixture ? 'active' : ''}`}
                      onClick={() =>
                        onUpdateItem(selectedItem.id, { fixtureOwner: 'own' }, true)
                      }
                    >
                      Own Fixed Asset
                    </button>
                  </div>

                  {isVenueFixture && (
                    <div className="venue-branding-rules">
                      <div className="toggle-row compact" style={{ marginTop: 10 }}>
                        <div>
                          <div className="toggle-title">Allow Branding on Venue Fixture?</div>
                          <div className="toggle-sub">
                            Specify whether organizer permits graphics on this permanent feature
                          </div>
                        </div>
                        <input
                          id="toggle-venue-branding-allowed"
                          type="checkbox"
                          className="studio-switch"
                          checked={Boolean(venueBranding.allowed)}
                          onChange={(e) =>
                            updateVenueBranding({ allowed: e.target.checked }, true)
                          }
                        />
                      </div>

                      {!venueBranding.allowed ? (
                        <div className="fixture-branding-status restricted">
                          Branding not permitted — excluded from print area &amp; Click-to-Brand.
                        </div>
                      ) : (
                        <div className="venue-brand-area-controls">
                          <div className="print-spec-banner" style={{ marginTop: 8, marginBottom: 8 }}>
                            <span>Permitted Brandable Area</span>
                            <strong className="mono-num">
                              {venueBrandableAreaM2.toFixed(2)} m² ({venueBranding.allowedFaces.length}{' '}
                              {venueBranding.allowedFaces.length === 1 ? 'face' : 'faces'})
                            </strong>
                          </div>

                          {availableFixtureFaces.length > 1 && (
                            <div style={{ marginBottom: 8 }}>
                              <label className="block-label">Permitted Faces</label>
                              <div className="fit-btn-row">
                                {availableFixtureFaces.map((face) => (
                                  <button
                                    key={face}
                                    type="button"
                                    id={`venue-face-${face}`}
                                    className={`fit-btn ${
                                      venueBranding.allowedFaces.includes(face) ? 'active' : ''
                                    }`}
                                    onClick={() => toggleFixtureFace(face)}
                                  >
                                    {face.charAt(0).toUpperCase() + face.slice(1)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ marginBottom: 8 }}>
                            <label className="block-label">Brandable Zone Presets</label>
                            <div className="fit-btn-row">
                              <button
                                type="button"
                                className="fit-btn"
                                onClick={() =>
                                  updateVenueBranding({
                                    zoneWidthM: maxZoneW,
                                    zoneHeightM: Number(selectedItem.dims.h.toFixed(2)),
                                    zoneBottomM: 0,
                                  })
                                }
                              >
                                Full Face
                              </button>
                              <button
                                type="button"
                                className="fit-btn"
                                onClick={() => {
                                  const h = Math.min(1.6, selectedItem.dims.h);
                                  const b = Math.min(0.8, Math.max(0, selectedItem.dims.h - h));
                                  updateVenueBranding({
                                    zoneWidthM: maxZoneW,
                                    zoneHeightM: Number(h.toFixed(2)),
                                    zoneBottomM: Number(b.toFixed(2)),
                                  });
                                }}
                              >
                                Eye-Level
                              </button>
                              <button
                                type="button"
                                className="fit-btn"
                                onClick={() => {
                                  const h = Math.min(1.2, selectedItem.dims.h);
                                  const b = Math.max(0, selectedItem.dims.h - h - 0.2);
                                  updateVenueBranding({
                                    zoneWidthM: maxZoneW,
                                    zoneHeightM: Number(h.toFixed(2)),
                                    zoneBottomM: Number(b.toFixed(2)),
                                  });
                                }}
                              >
                                Upper Band
                              </button>
                            </div>
                          </div>

                          <div className="slider-row">
                            <div className="slider-header">
                              <span>
                                {selectedItem.catalogId === 'venue-pillar-round'
                                  ? 'Brandable Wrap Width'
                                  : 'Brandable Width'}
                              </span>
                              <span className="mono-num">
                                {formatLength(venueBranding.zoneWidthM, config.unit)}
                              </span>
                            </div>
                            <input
                              id="venue-brand-width-slider"
                              type="range"
                              min={0.1}
                              max={maxZoneW}
                              step={0.05}
                              value={Math.min(maxZoneW, venueBranding.zoneWidthM)}
                              onChange={(e) =>
                                updateVenueBranding({ zoneWidthM: parseFloat(e.target.value) }, false)
                              }
                              onPointerUp={() => updateVenueBranding({}, true)}
                            />
                          </div>

                          <div className="slider-row">
                            <div className="slider-header">
                              <span>Brandable Height</span>
                              <span className="mono-num">
                                {formatLength(venueBranding.zoneHeightM, config.unit)}
                              </span>
                            </div>
                            <input
                              id="venue-brand-height-slider"
                              type="range"
                              min={0.1}
                              max={Number(selectedItem.dims.h.toFixed(2))}
                              step={0.05}
                              value={Math.min(selectedItem.dims.h, venueBranding.zoneHeightM)}
                              onChange={(e) =>
                                updateVenueBranding({ zoneHeightM: parseFloat(e.target.value) }, false)
                              }
                              onPointerUp={() => updateVenueBranding({}, true)}
                            />
                          </div>

                          <div className="slider-row">
                            <div className="slider-header">
                              <span>Bottom Elevation</span>
                              <span className="mono-num">
                                {formatLength(venueBranding.zoneBottomM, config.unit)}
                              </span>
                            </div>
                            <input
                              id="venue-brand-bottom-slider"
                              type="range"
                              min={0}
                              max={Math.max(0, Number((selectedItem.dims.h - venueBranding.zoneHeightM).toFixed(2)))}
                              step={0.05}
                              value={Math.min(
                                Math.max(0, selectedItem.dims.h - venueBranding.zoneHeightM),
                                venueBranding.zoneBottomM
                              )}
                              onChange={(e) =>
                                updateVenueBranding({ zoneBottomM: parseFloat(e.target.value) }, false)
                              }
                              onPointerUp={() => updateVenueBranding({}, true)}
                            />
                          </div>

                          <input
                            id="venue-brand-notes-input"
                            type="text"
                            className="text-input"
                            style={{ marginTop: 8 }}
                            placeholder="Venue branding rules (e.g. magnetic wrap only, no drilling)"
                            value={venueBranding.notes || ''}
                            onChange={(e) =>
                              updateVenueBranding({ notes: e.target.value }, true)
                            }
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section id="item-size" className="inspector-section">
            <h3 className="inspector-section-title">Size</h3>
            <dl className="inspector-dimensions">
              <div><dt>Width</dt><dd>{formatLength(selectedItem.dims.w, config.unit)}</dd></div>
              <div><dt>Depth</dt><dd>{formatLength(selectedItem.dims.d, config.unit)}</dd></div>
              <div><dt>Height</dt><dd>{formatLength(selectedItem.dims.h, config.unit)}</dd></div>
            </dl>
            {(selectedItem.catalogId === 'custom-3d-model' ||
              selectedItem.catalogId === 'custom-built-asset') && (
              <div className="control-block branding-zones-block">
                <div className="control-label-row">
                  <label className="block-label" style={{ marginBottom: 0 }}>
                    {selectedItem.catalogId === 'custom-built-asset'
                      ? 'Custom Built Asset Scale'
                      : '3D Showcase Model Scale & CAD Fix'}
                  </label>
                </div>

                {selectedItem.catalogId === 'custom-built-asset' && onEditCustomBuiltAsset && (
                  <button
                    type="button"
                    className="primary-btn full-width"
                    style={{ marginBottom: 10 }}
                    onClick={() => onEditCustomBuiltAsset(selectedItem)}
                  >
                    <Box size={14} />
                    <span>Edit Shapes / Dimensions</span>
                  </button>
                )}

                <div className="toggle-row compact" style={{ marginTop: 0, marginBottom: 8 }}>
                  <span>Lock Proportions</span>
                  <input
                    type="checkbox"
                    className="studio-switch"
                    checked={selectedItem.lockAspect !== false}
                    onChange={(e) =>
                      onUpdateItem(selectedItem.id, { lockAspect: e.target.checked }, true)
                    }
                  />
                </div>

                <div className="slider-row">
                  <div className="slider-header">
                    <span>Width</span>
                    <span className="mono-num">{formatLength(selectedItem.dims.w, config.unit)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={6}
                    step={0.05}
                    value={selectedItem.dims.w}
                    onChange={(e) => {
                      const nw = parseFloat(e.target.value);
                      if (selectedItem.lockAspect !== false) {
                        const ratio = nw / Math.max(0.05, selectedItem.dims.w);
                        updateFixtureDims(
                          {
                            w: nw,
                            h: Number((selectedItem.dims.h * ratio).toFixed(2)),
                            d: Number((selectedItem.dims.d * ratio).toFixed(2)),
                          },
                          false
                        );
                      } else {
                        updateFixtureDims({ ...selectedItem.dims, w: nw }, false);
                      }
                    }}
                  />
                </div>

                <div className="slider-row">
                  <div className="slider-header">
                    <span>Height</span>
                    <span className="mono-num">{formatLength(selectedItem.dims.h, config.unit)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={4.8}
                    step={0.05}
                    value={selectedItem.dims.h}
                    onChange={(e) => {
                      const nh = parseFloat(e.target.value);
                      if (selectedItem.lockAspect !== false) {
                        const ratio = nh / Math.max(0.05, selectedItem.dims.h);
                        updateFixtureDims(
                          {
                            w: Number((selectedItem.dims.w * ratio).toFixed(2)),
                            h: nh,
                            d: Number((selectedItem.dims.d * ratio).toFixed(2)),
                          },
                          false
                        );
                      } else {
                        updateFixtureDims({ ...selectedItem.dims, h: nh }, false);
                      }
                    }}
                  />
                </div>

                <div className="slider-row">
                  <div className="slider-header">
                    <span>Depth</span>
                    <span className="mono-num">{formatLength(selectedItem.dims.d, config.unit)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={6}
                    step={0.05}
                    value={selectedItem.dims.d}
                    onChange={(e) => {
                      const nd = parseFloat(e.target.value);
                      if (selectedItem.lockAspect !== false) {
                        const ratio = nd / Math.max(0.05, selectedItem.dims.d);
                        updateFixtureDims(
                          {
                            w: Number((selectedItem.dims.w * ratio).toFixed(2)),
                            h: Number((selectedItem.dims.h * ratio).toFixed(2)),
                            d: nd,
                          },
                          false
                        );
                      } else {
                        updateFixtureDims({ ...selectedItem.dims, d: nd }, false);
                      }
                    }}
                  />
                </div>

                {selectedItem.catalogId === 'custom-3d-model' &&
                  (selectedItem.supportsBrandingToggle ||
                    getExclusiveModelById(selectedItem.customModelId)?.supportsBrandingToggle) && (
                    <div className="control-block" style={{ marginTop: 10, marginBottom: 4 }}>
                      <label className="block-label">Machine Branding</label>
                      <div className="fit-btn-row">
                        <button
                          id="btn-model-branded"
                          type="button"
                          className={`fit-btn ${selectedItem.modelBranded !== false ? 'active' : ''}`}
                          onClick={() =>
                            onUpdateItem(selectedItem.id, { modelBranded: true }, true)
                          }
                        >
                          Branded
                        </button>
                        <button
                          id="btn-model-unbranded"
                          type="button"
                          className={`fit-btn ${selectedItem.modelBranded === false ? 'active' : ''}`}
                          onClick={() =>
                            onUpdateItem(selectedItem.id, { modelBranded: false }, true)
                          }
                        >
                          Unbranded
                        </button>
                      </div>
                    </div>
                  )}

                {selectedItem.catalogId === 'custom-3d-model' && (
                  <div className="toggle-row compact" style={{ marginTop: 10 }}>
                    <span>CAD Z-Up → Y-Up Fix</span>
                    <input
                      id="toggle-cad-zup"
                      type="checkbox"
                      className="studio-switch"
                      checked={Boolean(selectedItem.zUpFix)}
                      onChange={(e) => {
                        const nextZ = e.target.checked;
                        onUpdateItem(
                          selectedItem.id,
                          {
                            zUpFix: nextZ,
                            dims: {
                              w: selectedItem.dims.w,
                              h: selectedItem.dims.d,
                              d: selectedItem.dims.h,
                            },
                          },
                          true
                        );
                      }}
                    />
                  </div>
                )}

                <div className="color-inline-row" style={{ marginTop: 8 }}>
                  <span>CAD Mesh Tint</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {selectedItem.modelTintColor && (
                      <button
                        className="fit-btn"
                        style={{ padding: '2px 6px' }}
                        onClick={() =>
                          onUpdateItem(selectedItem.id, { modelTintColor: undefined }, true)
                        }
                      >
                        Reset
                      </button>
                    )}
                    <input
                      type="color"
                      value={selectedItem.modelTintColor || '#D4DBE3'}
                      onChange={(e) =>
                        onUpdateItem(selectedItem.id, { modelTintColor: e.target.value }, true)
                      }
                    />
                  </div>
                </div>
              </div>
            )}


            {def?.resizable && (
              <div className="control-block">
                <label className="block-label">Equipment Dimensions</label>
                <div className="slider-row">
                  <div className="slider-header">
                    <span>Width</span>
                    <span className="mono-num">{formatLength(selectedItem.dims.w, config.unit)}</span>
                  </div>
                  <input
                    type="range"
                    min={def.minDims.w}
                    max={def.maxDims.w}
                    step={0.05}
                    value={selectedItem.dims.w}
                    onChange={(e) => {
                      const nw = parseFloat(e.target.value);
                      const nextDims =
                        selectedItem.catalogId === 'venue-pillar-round'
                          ? { ...selectedItem.dims, w: nw, d: nw }
                          : { ...selectedItem.dims, w: nw };
                      updateFixtureDims(nextDims, false);
                    }}
                  />
                </div>
                {isVenueFixtureCatalogId(selectedItem.catalogId) &&
                  selectedItem.catalogId !== 'venue-pillar-round' && (
                    <div className="slider-row">
                      <div className="slider-header">
                        <span>Depth</span>
                        <span className="mono-num">
                          {formatLength(selectedItem.dims.d, config.unit)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={def.minDims.d}
                        max={def.maxDims.d}
                        step={0.05}
                        value={selectedItem.dims.d}
                        onChange={(e) =>
                          updateFixtureDims(
                            { ...selectedItem.dims, d: parseFloat(e.target.value) },
                            false
                          )
                        }
                      />
                    </div>
                  )}
                <div className="slider-row">
                  <div className="slider-header">
                    <span>Height</span>
                    <span className="mono-num">{formatLength(selectedItem.dims.h, config.unit)}</span>
                  </div>
                  <input
                    type="range"
                    min={def.minDims.h}
                    max={def.maxDims.h}
                    step={0.05}
                    value={selectedItem.dims.h}
                    onChange={(e) =>
                      updateFixtureDims(
                        { ...selectedItem.dims, h: parseFloat(e.target.value) },
                        false
                      )
                    }
                  />
                </div>
              </div>
            )}
          </section>

          <section id="item-finish" className="inspector-section">
            <h3 className="inspector-section-title">Finish</h3>
            <div className="fit-btn-row" style={{ marginBottom: 10 }}>
              {(['matte', 'oak', 'metal'] as const).map((fin) => (
                <button
                  key={fin}
                  className={`fit-btn ${(selectedItem.finish || 'matte') === fin ? 'active' : ''}`}
                  onClick={() => onUpdateItem(selectedItem.id, { finish: fin }, true)}
                >
                  {fin === 'matte' ? 'Matte White' : fin === 'oak' ? 'Warm Oak' : 'Anodized'}
                </button>
              ))}
            </div>
            <div className="custom-swatches-row">
              <label className="swatch-picker">
                <input
                  type="color"
                  value={selectedItem.primaryColor || config.primaryColor}
                  onChange={(e) =>
                    onUpdateItem(selectedItem.id, { primaryColor: e.target.value }, true)
                  }
                />
                <span>Body</span>
              </label>
              <label className="swatch-picker">
                <input
                  type="color"
                  value={selectedItem.accentColor || config.accentColor}
                  onChange={(e) =>
                    onUpdateItem(selectedItem.id, { accentColor: e.target.value }, true)
                  }
                />
                <span>Accent</span>
              </label>
            </div>
          </section>

          {canShowArtwork && isItemBrandingAllowed(selectedItem) && (
            <section id="item-artwork" className="inspector-section">
              <div className="control-label-row">
                <h3 className="inspector-section-title">
                  {isVenueFixture ? 'Permitted Venue Artwork' : 'Artwork'}
                </h3>
                <Sparkles size={13} className="accent-icon" />
              </div>

              {(isVenueFixture
                ? venueBranding.allowedFaces.map((face) => ({
                    id: face,
                    label: getFaceLabel(selectedItem.catalogId, face),
                    printW: Math.round(getEffectiveFaceZoneWidth(selectedItem, face) * 1000),
                    printH: Math.round(Math.min(selectedItem.dims.h, venueBranding.zoneHeightM) * 1000),
                  }))
                : (def?.surfaces || []).map((zone) => {
                    const scaleW = selectedItem.dims.w / (def?.defaultDims.w || 1);
                    const scaleH = selectedItem.dims.h / (def?.defaultDims.h || 1);
                    return {
                      id: zone.id,
                      label: zone.label,
                      printW: Math.round(zone.widthMm * scaleW),
                      printH: Math.round(zone.heightMm * scaleH),
                    };
                  })
              ).map((zone) => {
                const art: SurfaceArtwork = {
                  ...DEFAULT_ART,
                  ...(selectedItem.artwork[zone.id] || { bgColor: config.primaryColor }),
                };
                const printW = zone.printW;
                const printH = zone.printH;
                const isFocused = selectedSurfaceId === zone.id;

                return (
                  <div
                    key={zone.id}
                    className={`surface-zone-card ${isFocused ? 'focused' : ''}`}
                  >
                    <div className="surface-zone-head">
                      <div>
                        <div className="surface-zone-title">{zone.label}</div>
                        <div className="surface-zone-size mono-num">
                          Print: {printW} × {printH} mm
                        </div>
                      </div>
                      <button
                        id={`upload-zone-${zone.id}`}
                        className="upload-inline-btn"
                        onClick={() =>
                          triggerZoneUpload({
                            kind: 'item',
                            itemId: selectedItem.id,
                            surfaceId: zone.id,
                          })
                        }
                      >
                        <ImagePlus size={12} />
                        <span>Upload</span>
                      </button>
                    </div>

                    <div className="mini-asset-strip">
                      <button
                        className={`mini-asset-chip ${!art.assetId ? 'active' : ''}`}
                        onClick={() =>
                          onUpdateItemArtwork(selectedItem.id, zone.id, { assetId: null })
                        }
                        title="Use automatic company name & brand colors"
                      >
                        <span>Auto Brand</span>
                      </button>
                      {assets.map((a) => (
                        <button
                          key={a.id}
                          className={`mini-asset-chip ${art.assetId === a.id ? 'active' : ''}`}
                          onClick={() =>
                            onUpdateItemArtwork(selectedItem.id, zone.id, {
                              assetId: a.id,
                              fit: a.category === 'logo' ? 'contain' : 'cover',
                            })
                          }
                          title={a.name}
                        >
                          <img src={a.dataUrl} alt={a.name} />
                        </button>
                      ))}
                    </div>

                    <div className="artwork-framing-controls">
                      {art.assetId && (
                        <>
                          <div className="fit-btn-row">
                            {(['cover', 'contain', 'stretch'] as ArtworkFit[]).map((mode) => (
                              <button
                                key={mode}
                                className={`fit-btn ${art.fit === mode ? 'active' : ''}`}
                                onClick={() =>
                                  onUpdateItemArtwork(selectedItem.id, zone.id, { fit: mode })
                                }
                              >
                                {mode === 'cover'
                                  ? 'Fill'
                                  : mode === 'contain'
                                    ? 'Fit Logo'
                                    : 'Stretch'}
                              </button>
                            ))}
                          </div>

                          <div className="slider-row">
                            <div className="slider-header">
                              <span>Graphic Scale</span>
                              <span className="mono-num">{Math.round(art.scale * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min={0.25}
                              max={2}
                              step={0.05}
                              value={art.scale}
                              onChange={(e) =>
                                onUpdateItemArtwork(selectedItem.id, zone.id, {
                                  scale: parseFloat(e.target.value),
                                })
                              }
                            />
                          </div>

                          <div className="dual-slider-grid">
                            <div className="slider-row">
                              <div className="slider-header">
                                <span>Offset X</span>
                                <span className="mono-num">{Math.round(art.offsetX * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min={-0.45}
                                max={0.45}
                                step={0.02}
                                value={art.offsetX}
                                onChange={(e) =>
                                  onUpdateItemArtwork(selectedItem.id, zone.id, {
                                    offsetX: parseFloat(e.target.value),
                                  })
                                }
                              />
                            </div>
                            <div className="slider-row">
                              <div className="slider-header">
                                <span>Offset Y</span>
                                <span className="mono-num">{Math.round(art.offsetY * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min={-0.45}
                                max={0.45}
                                step={0.02}
                                value={art.offsetY}
                                onChange={(e) =>
                                  onUpdateItemArtwork(selectedItem.id, zone.id, {
                                    offsetY: parseFloat(e.target.value),
                                  })
                                }
                              />
                            </div>
                          </div>
                        </>
                      )}

                      <div className="color-inline-row">
                        <span>Surface Backdrop</span>
                        <input
                          type="color"
                          value={art.bgColor}
                          onChange={(e) =>
                            onUpdateItemArtwork(selectedItem.id, zone.id, {
                              bgColor: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="toggle-row compact">
                        <span className="inline-icon-label">
                          <Lightbulb size={12} /> Backlit LED Glow
                        </span>
                        <input
                          type="checkbox"
                          className="studio-switch"
                          checked={Boolean(art.emissive || selectedItem.backlit)}
                          onChange={(e) =>
                            onUpdateItemArtwork(selectedItem.id, zone.id, {
                              emissive: e.target.checked,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          <section id="item-position" className="inspector-section">
            <h3 className="inspector-section-title">Position &amp; orientation</h3>
            <div className="coord-grid">
              <label className="num-field">
                <span>X ({config.unit})</span>
                <input
                  type="number"
                  step={0.1}
                  value={Number(selectedItem.x.toFixed(2))}
                  onChange={(e) =>
                    onUpdateItem(selectedItem.id, { x: parseFloat(e.target.value) || 0 }, true)
                  }
                />
              </label>
              <label className="num-field">
                <span>Z ({config.unit})</span>
                <input
                  type="number"
                  step={0.1}
                  value={Number(selectedItem.z.toFixed(2))}
                  onChange={(e) =>
                    onUpdateItem(selectedItem.id, { z: parseFloat(e.target.value) || 0 }, true)
                  }
                />
              </label>
              <label className="num-field">
                <span>Elev Y ({config.unit})</span>
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={5}
                  value={Number(selectedItem.y.toFixed(2))}
                  onChange={(e) =>
                    onUpdateItem(
                      selectedItem.id,
                      { y: Math.max(0, parseFloat(e.target.value) || 0) },
                      true
                    )
                  }
                />
              </label>
            </div>

            <div className="slider-row" style={{ marginTop: 10 }}>
              <div className="slider-header">
                <span>Rotation</span>
                <span className="mono-num">{Math.round(selectedItem.rotationY)}°</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                step={5}
                value={selectedItem.rotationY > 180 ? selectedItem.rotationY - 360 : selectedItem.rotationY}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, { rotationY: parseFloat(e.target.value) }, false)
                }
                onPointerUp={() =>
                  onUpdateItem(selectedItem.id, { rotationY: selectedItem.rotationY }, true)
                }
              />
            </div>
          </section>
        </div>
      </aside>
    );
  }

  // ==================== DEFAULT STAND OVERVIEW INSPECTOR ====================
  return (
    <aside className="right-inspector contextual-inspector" aria-label="Stand space overview">
      <div className="inspector-header">
        <Box className="inspector-heading-icon" size={24} aria-hidden="true" />
        <div className="inspector-heading">
          <h2>
            {formatLength(config.width, config.unit)} × {formatLength(config.depth, config.unit)}{' '}
            stand
          </h2>
          <p className="inspector-kicker">Space &amp; brand overview</p>
        </div>
        <button
          type="button"
          className="inspector-close"
          onClick={onClose}
          aria-label="Close stand overview"
        >
          <X size={19} aria-hidden="true" />
        </button>
      </div>

      <div className="inspector-body">
        <div className={`compliance-card ${compliance.isCompliant ? 'ok' : 'warn'}`}>
          {compliance.isCompliant ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <div>
            <div className="compliance-title">
              {compliance.isCompliant ? 'Space Verified' : 'Attention Required'}
            </div>
            <div className="compliance-sub">
              {compliance.isCompliant
                ? 'All items fit inside booked footprint & height limits.'
                : `${compliance.outOfBoundsIds.length} outside bounds · ${compliance.overHeightIds.length} over height`}
            </div>
          </div>
        </div>

        <div className="metrics-grid">
          <div className="metric-box">
            <span>Floor Area</span>
            <strong className="mono-num">{formatArea(compliance.areaM2, config.unit)}</strong>
          </div>
          <div className="metric-box">
            <span>Print Graphics</span>
            <strong className="mono-num">{compliance.totalPrintAreaM2.toFixed(1)} m²</strong>
          </div>
        </div>

        <div className="control-block">
          <div className="slider-header">
            <span>Floor Space Utilization</span>
            <span className="mono-num">{compliance.occupancyPct}%</span>
          </div>
          <div className="occupancy-bar">
            <div
              className={`occupancy-fill ${compliance.occupancyPct > 65 ? 'tight' : ''}`}
              style={{ width: `${compliance.occupancyPct}%` }}
            />
          </div>
          <p className="helper-note">
            {compliance.occupancyPct <= 55
              ? 'Comfortable visitor walkway clearance across open aisles.'
              : 'Dense layout — consider leaving 1.2m clear aisle entryways.'}
          </p>
        </div>

        {config.showShellWalls && config.openSides < 4 && (
          <div className="control-block">
            <label className="block-label">Brand Perimeter Shell Walls</label>
            <div className="shell-wall-shortcuts">
              <button
                className="secondary-btn"
                onClick={() => onSelectShellWall('back')}
              >
                Back Wall {config.shellArtwork.back?.assetId ? '✓' : ''}
              </button>
              {config.openSides <= 2 && (
                <button
                  className="secondary-btn"
                  onClick={() => onSelectShellWall('left')}
                >
                  Left Wall {config.shellArtwork.left?.assetId ? '✓' : ''}
                </button>
              )}
              {config.openSides === 1 && (
                <button
                  className="secondary-btn"
                  onClick={() => onSelectShellWall('right')}
                >
                  Right Wall {config.shellArtwork.right?.assetId ? '✓' : ''}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="control-block">
          <label className="block-label">Active Brand Palette</label>
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
          <button
            className="secondary-btn full-width"
            style={{ marginTop: 10 }}
            onClick={onOpenBrandingTab}
          >
            Upload Logos &amp; Artwork
          </button>
        </div>

      </div>
    </aside>
  );
});
