import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  Compass,
  DoorOpen,
  Eye,
  Flame,
  FolderOpen,
  Footprints,
  Layers,
  Map as MapIcon,
  Search,
  Sparkles,
  Star,
  Target,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { VenueMap2D } from './VenueMap2D';
import { VenueViewport3D } from '../engine/VenueViewport3D';
import { VENUE_STATUS_COLORS } from '../data/packagingInnovationsVenue';
import type {
  ExhibitionVenue,
  StandAnalytics,
  VenueFilterState,
  VenueLayerVisibility,
  VenueStand,
  VenueStandStatus,
} from '../types/venue';
import {
  computeStandAnalytics,
  filterAndSortStands,
  formatGbp,
  getOpenSidesLabel,
  getUniqueSectors,
} from '../utils/venueAnalytics';
import './venueExplorer.css';

export type VenueDisplayMode = '2d' | '3d' | 'walk';

export interface DesignStandHandoff {
  stand: VenueStand;
  analytics: StandAnalytics;
  venue: ExhibitionVenue;
}

interface VenueExplorerProps {
  venue: ExhibitionVenue;
  onDesignStand: (handoff: DesignStandHandoff) => void;
  onOpenStandDesigner: () => void;
  onOpenProjectsDashboard: () => void;
}

const DEFAULT_FILTERS: VenueFilterState = {
  search: '',
  statuses: ['available', 'sold', 'reserved', 'feature'],
  zoneId: 'all',
  minAreaM2: 0,
  maxAreaM2: 200,
  openSides: 'all',
  pillarFreeOnly: false,
  sectorFilter: 'all',
  sortBy: 'match',
};

const DEFAULT_LAYERS: VenueLayerVisibility = {
  pillars: true,
  amenities: true,
  footfallHeatmap: false,
  aisleWidths: true,
  competitors: true,
  dimensions: true,
};

export const VenueExplorer: React.FC<VenueExplorerProps> = ({
  venue,
  onDesignStand,
  onOpenStandDesigner,
  onOpenProjectsDashboard,
}) => {
  const [displayMode, setDisplayMode] = useState<VenueDisplayMode>('2d');
  const [filters, setFilters] = useState<VenueFilterState>(DEFAULT_FILTERS);
  const [layers, setLayers] = useState<VenueLayerVisibility>(DEFAULT_LAYERS);
  const [selectedStandId, setSelectedStandId] = useState<string | null>('AC72');
  const [hoveredStandId, setHoveredStandId] = useState<string | null>(null);
  const [pinnedCompetitorIds, setPinnedCompetitorIds] = useState<Set<string>>(() => new Set());
  const [competitorSector, setCompetitorSector] = useState<string>('none');
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(() => new Set(['AC72', 'K130', 'W64']));
  const [compareOpen, setCompareOpen] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState<{
    standId: string;
    walk?: boolean;
    seq: number;
  } | null>(null);

  const sectors = useMemo(() => getUniqueSectors(venue), [venue]);

  // Combined competitor set (manual pins + sector watchlist)
  const competitorStandIds = useMemo(() => {
    const set = new Set<string>(pinnedCompetitorIds);
    if (competitorSector !== 'none') {
      for (const s of venue.stands) {
        if (s.status === 'sold' && s.sector === competitorSector) {
          set.add(s.id);
        }
      }
    }
    return set;
  }, [pinnedCompetitorIds, competitorSector, venue.stands]);

  // Precompute analytics for all stands
  const analyticsMap = useMemo(() => {
    const map = new Map<string, StandAnalytics>();
    for (const s of venue.stands) {
      map.set(s.id, computeStandAnalytics(s, venue, competitorStandIds));
    }
    return map;
  }, [venue, competitorStandIds]);

  const matchingStands = useMemo(
    () => filterAndSortStands(venue, analyticsMap, filters),
    [venue, analyticsMap, filters]
  );

  const matchingStandIds = useMemo(
    () => new Set(matchingStands.map((s) => s.id)),
    [matchingStands]
  );

  // Inventory summary stats
  const inventoryStats = useMemo(() => {
    let availableCount = 0;
    let availableArea = 0;
    let soldCount = 0;
    let reservedCount = 0;
    for (const s of venue.stands) {
      if (s.status === 'available') {
        availableCount += 1;
        availableArea += s.width * s.depth;
      } else if (s.status === 'sold') {
        soldCount += 1;
      } else if (s.status === 'reserved') {
        reservedCount += 1;
      }
    }
    return {
      availableCount,
      availableArea: Math.round(availableArea),
      soldCount,
      reservedCount,
    };
  }, [venue.stands]);

  const selectedStand = useMemo(
    () => venue.stands.find((s) => s.id === selectedStandId) || null,
    [venue.stands, selectedStandId]
  );

  const selectedAnalytics = selectedStand ? analyticsMap.get(selectedStand.id) || null : null;
  const selectedZone = selectedStand
    ? venue.zones.find((z) => z.id === selectedStand.zoneId) || null
    : null;

  const toggleStatusFilter = (status: VenueStandStatus) => {
    setFilters((prev) => {
      const exists = prev.statuses.includes(status);
      const next = exists
        ? prev.statuses.filter((s) => s !== status)
        : [...prev.statuses, status];
      return { ...prev, statuses: next.length > 0 ? next : ['available'] };
    });
  };

  const toggleAvailableOnly = () => {
    setFilters((prev) => {
      const isOnlyAvail = prev.statuses.length === 1 && prev.statuses[0] === 'available';
      return {
        ...prev,
        statuses: isOnlyAvail ? ['available', 'sold', 'reserved', 'feature'] : ['available'],
      };
    });
  };

  const toggleShortlist = (standId: string) => {
    setShortlistIds((prev) => {
      const next = new Set(prev);
      if (next.has(standId)) {
        next.delete(standId);
      } else if (next.size < 4) {
        next.add(standId);
      }
      return next;
    });
  };

  const togglePinCompetitor = (standId: string) => {
    setPinnedCompetitorIds((prev) => {
      const next = new Set(prev);
      if (next.has(standId)) next.delete(standId);
      else next.add(standId);
      return next;
    });
  };

  const handleSelectAndFocus = (standId: string, walk = false) => {
    setSelectedStandId(standId);
    if (walk) {
      setDisplayMode('walk');
    }
    setFocusTrigger({ standId, walk, seq: Date.now() });
  };

  const shortlistedStands = useMemo(
    () => venue.stands.filter((s) => shortlistIds.has(s.id)),
    [venue.stands, shortlistIds]
  );

  const isAvailableOnly =
    filters.statuses.length === 1 && filters.statuses[0] === 'available';

  return (
    <div className="venue-shell">
      {/* ==================== TOP HEADER ==================== */}
      <header className="venue-topbar">
        <div className="venue-topbar-left">
          <div className="venue-brand-pill">
            <BrandMark size={26} />
            <span>PilotStand</span>
            <span className="venue-brand-badge">Venue</span>
          </div>
          <div className="venue-event-divider" />
          <div className="venue-event-meta">
            <span className="venue-event-title">
              {venue.name} {venue.edition}
            </span>
            <span className="venue-event-sub">
              {venue.venueLocation} • {venue.hallName} • {venue.organizer} (Issue {venue.issueNumber})
            </span>
          </div>
        </div>

        {/* 2D / 3D / Eye-Level Mode Switcher */}
        <div className="venue-mode-segmented" role="tablist" aria-label="Hall View Mode">
          <button
            type="button"
            role="tab"
            aria-selected={displayMode === '2d'}
            className={`venue-mode-btn ${displayMode === '2d' ? 'active' : ''}`}
            onClick={() => setDisplayMode('2d')}
          >
            <MapIcon size={14} />
            <span>2D Floorplan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={displayMode === '3d'}
            className={`venue-mode-btn ${displayMode === '3d' ? 'active' : ''}`}
            onClick={() => setDisplayMode('3d')}
          >
            <Box size={14} />
            <span>3D Hall</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={displayMode === 'walk'}
            className={`venue-mode-btn ${displayMode === 'walk' ? 'active' : ''}`}
            onClick={() => setDisplayMode('walk')}
          >
            <Footprints size={14} />
            <span>Walkthrough</span>
          </button>
        </div>

        <div className="venue-topbar-right">
          <button
            type="button"
            className="venue-btn"
            onClick={() => setCompareOpen(true)}
            title="Compare shortlisted stands side-by-side"
          >
            <Star size={14} color="#f59e0b" fill={shortlistIds.size > 0 ? '#f59e0b' : 'none'} />
            <span>Compare ({shortlistIds.size})</span>
          </button>
          <button
            type="button"
            className="venue-btn"
            onClick={onOpenProjectsDashboard}
            title="View your saved 3D stand designs"
          >
            <FolderOpen size={14} />
            <span>My Designs</span>
          </button>
          <button
            type="button"
            className="venue-btn dark"
            onClick={onOpenStandDesigner}
            title="Switch to 3D Stand Designer"
          >
            <Sparkles size={14} />
            <span>3D Designer</span>
          </button>
        </div>
      </header>

      {/* ==================== WORKSPACE ==================== */}
      <div className="venue-workspace">
        {/* LEFT FILTER & DISCOVERY SIDEBAR */}
        <aside className="venue-sidebar">
          <div className="venue-stats-strip">
            <div className="venue-stat-box">
              <span className="venue-stat-val available">{inventoryStats.availableCount}</span>
              <span className="venue-stat-lbl">Available</span>
            </div>
            <div className="venue-stat-box">
              <span className="venue-stat-val">{inventoryStats.availableArea}m²</span>
              <span className="venue-stat-lbl">Unsold Space</span>
            </div>
            <div className="venue-stat-box">
              <span className="venue-stat-val">{inventoryStats.soldCount}</span>
              <span className="venue-stat-lbl">Booked Brands</span>
            </div>
          </div>

          <div className="venue-sidebar-scroll">
            {/* Search */}
            <div className="venue-search-box">
              <Search size={14} />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Search stand (AC72) or exhibitor (Amcor)..."
              />
            </div>

            {/* Status & Quick Available Toggle */}
            <div className="venue-filter-section">
              <div className="venue-section-label">
                <span>Stand Availability</span>
                <button
                  type="button"
                  onClick={toggleAvailableOnly}
                  style={{
                    border: 'none',
                    background: 'none',
                    color: '#ff4d2e',
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {isAvailableOnly ? 'Show All' : 'Unsold Only'}
                </button>
              </div>
              <div className="venue-chip-row">
                {(['available', 'sold', 'reserved', 'feature'] as VenueStandStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`venue-chip ${filters.statuses.includes(st) ? 'active' : ''}`}
                    onClick={() => toggleStatusFilter(st)}
                  >
                    {VENUE_STATUS_COLORS[st]?.label || st}
                  </button>
                ))}
              </div>
            </div>

            {/* Zone Filter */}
            <div className="venue-filter-section">
              <div className="venue-section-label">Exhibition Zone</div>
              <select
                className="venue-select"
                value={filters.zoneId}
                onChange={(e) => setFilters((f) => ({ ...f, zoneId: e.target.value }))}
              >
                <option value="all">All Zones ({venue.zones.length})</option>
                {venue.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Stand Size & Open Sides */}
            <div className="venue-filter-section">
              <div className="venue-section-label">Stand Size (m²)</div>
              <div className="venue-chip-row">
                {[
                  { label: 'Any', min: 0, max: 200 },
                  { label: '≤15m²', min: 0, max: 15 },
                  { label: '16–32m²', min: 16, max: 32 },
                  { label: '33m²+', min: 33, max: 200 },
                ].map((preset) => {
                  const active =
                    filters.minAreaM2 === preset.min && filters.maxAreaM2 === preset.max;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={`venue-chip ${active ? 'active' : ''}`}
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          minAreaM2: preset.min,
                          maxAreaM2: preset.max,
                        }))
                      }
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="venue-filter-section">
              <div className="venue-section-label">Open Sides (Visibility)</div>
              <div className="venue-chip-row">
                {(['all', 1, 2, 3, 4] as const).map((os) => (
                  <button
                    key={String(os)}
                    type="button"
                    className={`venue-chip ${filters.openSides === os ? 'active' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, openSides: os }))}
                  >
                    {os === 'all' ? 'Any' : os === 4 ? '4 (Island)' : `${os} Open`}
                  </button>
                ))}
              </div>
              <label className="venue-toggle-row">
                <span>Pillar-Free Plots Only</span>
                <input
                  type="checkbox"
                  checked={filters.pillarFreeOnly}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, pillarFreeOnly: e.target.checked }))
                  }
                />
              </label>
            </div>

            {/* Competitor Watchlist */}
            <div className="venue-filter-section">
              <div className="venue-section-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Target size={12} color="#dc2626" /> Competitor Radar
                </span>
                {competitorStandIds.size > 0 && (
                  <span style={{ color: '#dc2626', fontWeight: 800 }}>
                    {competitorStandIds.size} flagged
                  </span>
                )}
              </div>
              <select
                className="venue-select"
                value={competitorSector}
                onChange={(e) => setCompetitorSector(e.target.value)}
              >
                <option value="none">Highlight competitors by sector…</option>
                {sectors.map((sec) => (
                  <option key={sec} value={sec}>
                    Flag Sector: {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Map Layers */}
            <div className="venue-filter-section">
              <div className="venue-section-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Layers size={12} /> Hall Map Layers
                </span>
              </div>
              <div className="venue-chip-row">
                <button
                  type="button"
                  className={`venue-chip ${layers.pillars ? 'active' : ''}`}
                  onClick={() => setLayers((l) => ({ ...l, pillars: !l.pillars }))}
                >
                  Pillars
                </button>
                <button
                  type="button"
                  className={`venue-chip ${layers.amenities ? 'active' : ''}`}
                  onClick={() => setLayers((l) => ({ ...l, amenities: !l.amenities }))}
                >
                  Toilets & Cafe
                </button>
                <button
                  type="button"
                  className={`venue-chip ${layers.footfallHeatmap ? 'active' : ''}`}
                  onClick={() =>
                    setLayers((l) => ({ ...l, footfallHeatmap: !l.footfallHeatmap }))
                  }
                >
                  <Flame size={11} /> Footfall
                </button>
                <button
                  type="button"
                  className={`venue-chip ${layers.aisleWidths ? 'active' : ''}`}
                  onClick={() => setLayers((l) => ({ ...l, aisleWidths: !l.aisleWidths }))}
                >
                  Aisles
                </button>
              </div>
            </div>

            {/* Matching Stands Ranked List */}
            <div className="venue-filter-section">
              <div className="venue-section-label">
                <span>Matching Stands ({matchingStands.length})</span>
                <select
                  value={filters.sortBy}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      sortBy: e.target.value as VenueFilterState['sortBy'],
                    }))
                  }
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--ink-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="match">Best Match</option>
                  <option value="footfall">Highest Footfall</option>
                  <option value="price-asc">Lowest Price</option>
                  <option value="area-desc">Largest Area</option>
                  <option value="area-asc">Smallest Area</option>
                </select>
              </div>

              <div className="venue-results-list">
                {matchingStands.slice(0, 60).map((stand) => {
                  const a = analyticsMap.get(stand.id)!;
                  const isSel = selectedStandId === stand.id;
                  const isComp = competitorStandIds.has(stand.id);
                  return (
                    <button
                      key={stand.id}
                      type="button"
                      className={`venue-stand-card ${isSel ? 'selected' : ''}`}
                      onClick={() => handleSelectAndFocus(stand.id, false)}
                      onMouseEnter={() => setHoveredStandId(stand.id)}
                      onMouseLeave={() => setHoveredStandId(null)}
                    >
                      <div className="venue-stand-card-top">
                        <span className="venue-stand-id">
                          {stand.id}
                          {stand.exhibitorName ? ` — ${stand.exhibitorName}` : ''}
                        </span>
                        {stand.status === 'available' ? (
                          <span className="match-badge">{a.matchScore}%</span>
                        ) : (
                          <span className={`status-pill status-${stand.status}`}>
                            {isComp ? 'Competitor' : stand.status}
                          </span>
                        )}
                      </div>
                      <div className="venue-stand-meta">
                        <span>
                          {stand.width}×{stand.depth}m ({a.areaM2}m²) • {stand.openSides} open
                        </span>
                        {stand.status === 'available' && (
                          <strong className="mono-num">{formatGbp(a.spaceOnlyPriceGbp)}</strong>
                        )}
                      </div>
                      {a.obstructingPillars.length > 0 && (
                        <div style={{ fontSize: 10.5, color: '#b45309', fontWeight: 700 }}>
                          ⚠ Pillar obstruction
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER 2D / 3D VIEWPORT */}
        <main className="venue-center">
          {displayMode === '2d' ? (
            <VenueMap2D
              venue={venue}
              matchingStandIds={matchingStandIds}
              analyticsMap={analyticsMap}
              selectedStandId={selectedStandId}
              hoveredStandId={hoveredStandId}
              competitorStandIds={competitorStandIds}
              shortlistIds={shortlistIds}
              layers={layers}
              onSelectStand={(id) => setSelectedStandId(id)}
              onHoverStand={setHoveredStandId}
              focusTrigger={focusTrigger}
            />
          ) : (
            <VenueViewport3D
              venue={venue}
              matchingStandIds={matchingStandIds}
              selectedStandId={selectedStandId}
              competitorStandIds={competitorStandIds}
              layers={layers}
              cameraMode={displayMode === 'walk' ? 'walk' : 'orbit'}
              onSelectStand={(id) => setSelectedStandId(id)}
              focusTrigger={focusTrigger}
            />
          )}
        </main>

        {/* RIGHT STAND INSPECTOR */}
        <aside className="venue-inspector">
          {selectedStand && selectedAnalytics ? (
            <>
              <div className="venue-inspector-scroll">
                {/* Header */}
                <div className="venue-inspector-header">
                  <div className="venue-inspector-title-row">
                    <h2 className="venue-inspector-title">Stand {selectedStand.id}</h2>
                    <span className={`status-pill status-${selectedStand.status}`}>
                      {VENUE_STATUS_COLORS[selectedStand.status]?.label || selectedStand.status}
                    </span>
                  </div>
                  {selectedStand.exhibitorName && (
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-primary)' }}>
                      {selectedStand.exhibitorName}
                      {selectedStand.sector && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 11.5,
                            fontWeight: 500,
                            color: 'var(--ink-muted)',
                          }}
                        >
                          Sector: {selectedStand.sector}
                        </span>
                      )}
                    </div>
                  )}
                  {selectedZone && (
                    <div className="venue-zone-pill">
                      <span
                        className="venue-zone-dot"
                        style={{ background: selectedZone.carpetColor }}
                      />
                      <span>{selectedZone.name}</span>
                    </div>
                  )}
                </div>

                {/* Key Dimensions & Pricing */}
                <div className="venue-metrics-grid">
                  <div className="venue-metric-card">
                    <span className="venue-metric-label">Footprint</span>
                    <span className="venue-metric-value">
                      {selectedStand.width}m × {selectedStand.depth}m
                    </span>
                  </div>
                  <div className="venue-metric-card">
                    <span className="venue-metric-label">Total Area</span>
                    <span className="venue-metric-value">{selectedAnalytics.areaM2} m²</span>
                  </div>
                  <div className="venue-metric-card">
                    <span className="venue-metric-label">Configuration</span>
                    <span className="venue-metric-value" style={{ fontSize: 12 }}>
                      {getOpenSidesLabel(selectedStand.openSides)}
                    </span>
                  </div>
                  <div className="venue-metric-card">
                    <span className="venue-metric-label">
                      {selectedStand.status === 'available' ? 'Space-Only Est.' : 'Hall Ceiling'}
                    </span>
                    <span className="venue-metric-value">
                      {selectedStand.status === 'available'
                        ? formatGbp(selectedAnalytics.spaceOnlyPriceGbp)
                        : `${venue.ceilingHeightM}m`}
                    </span>
                  </div>
                </div>

                {selectedStand.status === 'available' && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--ink-secondary)',
                      background: 'var(--surface-1)',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    Turnkey Shell Scheme Est.:{' '}
                    <strong className="mono-num">
                      {formatGbp(selectedAnalytics.shellSchemePriceGbp)}
                    </strong>{' '}
                    <span style={{ color: 'var(--ink-muted)' }}>(incl. walls, carpet & fascia)</span>
                  </div>
                )}

                {/* Pillar Obstruction Check */}
                {selectedAnalytics.obstructingPillars.length > 0 ? (
                  <div className="venue-alert-card warn">
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>Structural Pillar Obstruction</strong>
                      <div style={{ marginTop: 2 }}>
                        {selectedAnalytics.obstructingPillars.map((p) => p.label).join(', ')}.
                        Inspect in Eye-Level Walkthrough before booking.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="venue-alert-card ok">
                    <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>Clear Pillar-Free Plot</strong>
                      <div style={{ marginTop: 1 }}>
                        No structural columns inside this footprint. Unobstructed aisle sightlines.
                      </div>
                    </div>
                  </div>
                )}

                {selectedStand.notes && (
                  <div style={{ fontSize: 12, color: 'var(--ink-secondary)', lineHeight: 1.45 }}>
                    {selectedStand.notes}
                  </div>
                )}

                {/* Location & Footfall Intelligence */}
                <div className="venue-filter-section">
                  <div className="venue-section-label">Location & Footfall Intel</div>
                  <div
                    style={{
                      background: 'var(--surface-1)',
                      padding: '9px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <span>Estimated Footfall Score</span>
                      <span className="mono-num">{selectedAnalytics.footfallScore} / 100</span>
                    </div>
                    <div className="footfall-bar-track">
                      <div
                        className="footfall-bar-fill"
                        style={{ width: `${selectedAnalytics.footfallScore}%` }}
                      />
                    </div>
                  </div>

                  <div className="venue-intel-list">
                    {selectedAnalytics.nearestEntrance && (
                      <div className="venue-intel-row">
                        <span className="venue-intel-left">
                          <DoorOpen size={13} /> {selectedAnalytics.nearestEntrance.label}
                        </span>
                        <span className="venue-intel-val">
                          {selectedAnalytics.nearestEntrance.distanceM}m
                        </span>
                      </div>
                    )}
                    {selectedAnalytics.nearestToilet && (
                      <div className="venue-intel-row">
                        <span className="venue-intel-left">
                          <Compass size={13} /> {selectedAnalytics.nearestToilet.label}
                        </span>
                        <span className="venue-intel-val">
                          {selectedAnalytics.nearestToilet.distanceM}m
                        </span>
                      </div>
                    )}
                    {selectedAnalytics.nearestFeature && (
                      <div className="venue-intel-row">
                        <span className="venue-intel-left">
                          <Sparkles size={13} /> {selectedAnalytics.nearestFeature.label}
                        </span>
                        <span className="venue-intel-val">
                          {selectedAnalytics.nearestFeature.distanceM}m
                        </span>
                      </div>
                    )}
                    {selectedAnalytics.nearestCompetitor && (
                      <div
                        className="venue-intel-row"
                        style={{ background: '#fef2f2', border: '1px solid #fecaca' }}
                      >
                        <span className="venue-intel-left" style={{ color: '#991b1b' }}>
                          <Target size={13} /> Competitor: {selectedAnalytics.nearestCompetitor.name}
                        </span>
                        <span className="venue-intel-val" style={{ color: '#991b1b' }}>
                          {selectedAnalytics.nearestCompetitor.distanceM}m
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Nearby Exhibitors */}
                {selectedAnalytics.neighboringExhibitors.length > 0 && (
                  <div className="venue-filter-section">
                    <div className="venue-section-label">Nearby Confirmed Exhibitors</div>
                    <div className="venue-neighbor-list">
                      {selectedAnalytics.neighboringExhibitors.map((nb) => {
                        const isPinned = competitorStandIds.has(nb.standId);
                        return (
                          <div key={nb.standId} className="venue-neighbor-row">
                            <div
                              className="venue-neighbor-info"
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleSelectAndFocus(nb.standId, false)}
                            >
                              <span className="venue-neighbor-name">
                                {nb.name} ({nb.standId})
                              </span>
                              <span className="venue-neighbor-sub">
                                {nb.sector || 'Exhibitor'} • {nb.distanceM}m away
                              </span>
                            </div>
                            <button
                              type="button"
                              className={`venue-chip danger ${isPinned ? 'active' : ''}`}
                              onClick={() => togglePinCompetitor(nb.standId)}
                              title="Flag as competitor on the hall map"
                            >
                              {isPinned ? 'Competitor' : 'Flag'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="venue-inspector-actions">
                {selectedStand.status === 'available' && (
                  <button
                    type="button"
                    className="venue-btn primary full"
                    onClick={() =>
                      onDesignStand({
                        stand: selectedStand,
                        analytics: selectedAnalytics,
                        venue,
                      })
                    }
                  >
                    <Sparkles size={15} />
                    <span>Design Stand {selectedStand.id} in 3D</span>
                    <ArrowRight size={14} />
                  </button>
                )}

                <button
                  type="button"
                  className="venue-btn dark full"
                  onClick={() => handleSelectAndFocus(selectedStand.id, true)}
                >
                  <Eye size={14} />
                  <span>Walk to Stand (1.68m Eye-Level)</span>
                </button>

                <div style={{ display: 'flex', gap: 6 }}>
                  {selectedStand.status === 'available' && (
                    <button
                      type="button"
                      className="venue-btn full"
                      onClick={() => toggleShortlist(selectedStand.id)}
                    >
                      <Star
                        size={14}
                        color="#f59e0b"
                        fill={shortlistIds.has(selectedStand.id) ? '#f59e0b' : 'none'}
                      />
                      <span>
                        {shortlistIds.has(selectedStand.id) ? 'Shortlisted' : 'Shortlist'}
                      </span>
                    </button>
                  )}

                  {selectedStand.status === 'sold' && (
                    <button
                      type="button"
                      className="venue-btn full"
                      onClick={() => togglePinCompetitor(selectedStand.id)}
                    >
                      <Target size={14} color="#dc2626" />
                      <span>
                        {pinnedCompetitorIds.has(selectedStand.id)
                          ? 'Unflag Competitor'
                          : 'Track as Competitor'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 24, color: 'var(--ink-muted)', fontSize: 13 }}>
              Click any stand on the floorplan to inspect dimensions, pillar obstructions, footfall,
              neighboring competitors, and launch the 3D Stand Designer.
            </div>
          )}
        </aside>
      </div>

      {/* ==================== SIDE-BY-SIDE COMPARE MODAL ==================== */}
      {compareOpen && (
        <div className="venue-modal-backdrop" onClick={() => setCompareOpen(false)}>
          <div className="venue-compare-modal" onClick={(e) => e.stopPropagation()}>
            <div className="venue-compare-header">
              <h3>Shortlisted Stand Comparison ({shortlistedStands.length}/4)</h3>
              <button
                type="button"
                className="venue-btn"
                onClick={() => setCompareOpen(false)}
              >
                <X size={14} /> Close
              </button>
            </div>
            <div className="venue-compare-body">
              {shortlistedStands.length === 0 ? (
                <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                  Click the Shortlist button on any available stand to compare up to 4 plots side by
                  side.
                </p>
              ) : (
                <table className="venue-compare-table">
                  <thead>
                    <tr>
                      <th>Stand</th>
                      <th>Zone</th>
                      <th>Dimensions</th>
                      <th>Open Sides</th>
                      <th>Footfall</th>
                      <th>Pillars</th>
                      <th>Entrance / WC</th>
                      <th>Space-Only</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortlistedStands.map((st) => {
                      const a = analyticsMap.get(st.id)!;
                      const z = venue.zones.find((zn) => zn.id === st.zoneId);
                      return (
                        <tr key={st.id}>
                          <td>
                            <strong>{st.id}</strong>
                          </td>
                          <td>{z?.shortName || st.zoneId}</td>
                          <td className="mono-num">
                            {st.width}×{st.depth}m ({a.areaM2}m²)
                          </td>
                          <td>{getOpenSidesLabel(st.openSides)}</td>
                          <td className="mono-num">
                            <strong>{a.footfallScore}/100</strong>
                          </td>
                          <td>
                            {a.obstructingPillars.length > 0 ? (
                              <span style={{ color: '#b45309', fontWeight: 700 }}>
                                ⚠ Pillar
                              </span>
                            ) : (
                              <span style={{ color: '#15803d', fontWeight: 700 }}>Clear</span>
                            )}
                          </td>
                          <td className="mono-num">
                            {a.nearestEntrance?.distanceM ?? '—'}m / {a.nearestToilet?.distanceM ?? '—'}m
                          </td>
                          <td className="mono-num">
                            <strong>{formatGbp(a.spaceOnlyPriceGbp)}</strong>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="venue-btn primary"
                                onClick={() => {
                                  setCompareOpen(false);
                                  onDesignStand({ stand: st, analytics: a, venue });
                                }}
                              >
                                Design 3D
                              </button>
                              <button
                                type="button"
                                className="venue-btn"
                                onClick={() => toggleShortlist(st.id)}
                                title="Remove from shortlist"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
