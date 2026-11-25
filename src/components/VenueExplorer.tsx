import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Building2,
  CheckCircle2,
  Compass,
  DoorOpen,
  ExternalLink,
  Eye,
  Flame,
  FolderOpen,
  Footprints,
  Layers,
  Map as MapIcon,
  Radar,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Waves,
  X,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { VenueMap2D } from './VenueMap2D';
import { OrganizerStudioModal } from './OrganizerStudioModal';
import { VenueViewport3D, type TestFitBrandConfig } from '../engine/VenueViewport3D';
import { VENUE_STATUS_COLORS } from '../data/packagingInnovationsVenue';
import { getExhibitorBrandProfile } from '../data/exhibitorBrands';
import type {
  ExhibitionVenue,
  OrganizerBrandTheme,
  StandAnalytics,
  StandCustomBrand,
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

interface UpsellOption {
  id: string;
  label: string;
  priceGbp: number;
}

const ORGANIZER_UPSELLS: UpsellOption[] = [
  { id: 'power-3kw', label: '3kW / 16A Power Supply', priceGbp: 420 },
  { id: 'rigging', label: 'Overhead Banner Rigging Point', priceGbp: 680 },
  { id: 'fibre', label: 'Dedicated 100Mbps Fibre Line', priceGbp: 550 },
  { id: 'scanners', label: 'Lead Capture Scanners (×2)', priceGbp: 295 },
  { id: 'av-furniture', label: 'Lounge Furniture & 55" 4K AV Pack', priceGbp: 890 },
];

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
  venue: initialVenue,
  onDesignStand,
  onOpenStandDesigner,
  onOpenProjectsDashboard,
}) => {
  const [venue, setVenue] = useState<ExhibitionVenue>(initialVenue);
  const [studioOpen, setStudioOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<'none' | 'filters' | 'inspector'>('none');
  const [displayMode, setDisplayMode] = useState<VenueDisplayMode>('3d');
  const [filters, setFilters] = useState<VenueFilterState>(DEFAULT_FILTERS);
  const [layers, setLayers] = useState<VenueLayerVisibility>(DEFAULT_LAYERS);
  const [showSightlines, setShowSightlines] = useState<boolean>(false);
  const [showVisitorFlow, setShowVisitorFlow] = useState<boolean>(true);
  const [selectedStandId, setSelectedStandId] = useState<string | null>('AC72');
  const [hoveredStandId, setHoveredStandId] = useState<string | null>(null);
  const [pinnedCompetitorIds, setPinnedCompetitorIds] = useState<Set<string>>(() => new Set());
  const [competitorSector, setCompetitorSector] = useState<string>('none');
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(
    () => new Set(['AC72', 'K130', 'W64'])
  );
  const [compareOpen, setCompareOpen] = useState(false);
  const [focusTrigger, setFocusTrigger] = useState<{
    standId: string;
    walk?: boolean;
    seq: number;
  } | null>(null);

  // Live "Test-Fit Your Brand" preview directly inside the 3D NEC Hall
  const [testFit, setTestFit] = useState<TestFitBrandConfig>({
    enabled: false,
    companyName: 'Your Brand UK',
    tagline: 'Sustainable Packaging Innovation',
    primaryColor: '#0f172a',
    accentColor: '#ff4d2e',
    packageTier: 'flagship',
  });

  // Organizer Upsell Package & 48h Stand Hold Reservation state
  const [shellSchemeSelected, setShellSchemeSelected] = useState<boolean>(true);
  const [selectedUpsells, setSelectedUpsells] = useState<Set<string>>(
    () => new Set(['power-3kw', 'scanners'])
  );
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveForm, setReserveForm] = useState({
    company: '',
    contactName: '',
    email: '',
    phone: '',
  });
  const [reserveRef, setReserveRef] = useState<string | null>(null);

  const sectors = useMemo(() => getUniqueSectors(venue), [venue]);

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

  const inventoryStats = useMemo(() => {
    let availableCount = 0;
    let availableArea = 0;
    let soldCount = 0;
    for (const s of venue.stands) {
      if (s.status === 'available') {
        availableCount += 1;
        availableArea += s.width * s.depth;
      } else if (s.status === 'sold') {
        soldCount += 1;
      }
    }
    return {
      availableCount,
      availableArea: Math.round(availableArea),
      soldCount,
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
  const selectedBrandProfile =
    selectedStand && selectedStand.status === 'sold'
      ? getExhibitorBrandProfile(selectedStand.exhibitorName, selectedStand.sector)
      : null;

  const upsellTotalGbp = useMemo(() => {
    let sum = 0;
    for (const u of ORGANIZER_UPSELLS) {
      if (selectedUpsells.has(u.id)) sum += u.priceGbp;
    }
    return sum;
  }, [selectedUpsells]);

  const packageGrandTotalGbp = selectedAnalytics
    ? (shellSchemeSelected
        ? selectedAnalytics.shellSchemePriceGbp
        : selectedAnalytics.spaceOnlyPriceGbp) + upsellTotalGbp
    : 0;

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
      if (next.has(standId)) next.delete(standId);
      else if (next.size < 4) next.add(standId);
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

  const toggleUpsell = (id: string) => {
    setSelectedUpsells((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAndFocus = (standId: string, walk = false) => {
    setSelectedStandId(standId);
    if (walk) {
      setDisplayMode('walk');
      setMobileSheet('none');
    }
    setFocusTrigger({ standId, walk, seq: Date.now() });
  };

  const handleLoadVenue = (nextVenue: ExhibitionVenue) => {
    setVenue(nextVenue);
    setFilters(DEFAULT_FILTERS);
    setPinnedCompetitorIds(new Set());
    setCompetitorSector('none');
    const firstAvail = nextVenue.stands.find((s) => s.status === 'available') || nextVenue.stands[0];
    setSelectedStandId(firstAvail?.id || null);
    setShortlistIds(new Set(firstAvail ? [firstAvail.id] : []));
    setFocusTrigger(null);
  };

  const handleUpdateTheme = (
    theme: OrganizerBrandTheme,
    showName?: string,
    venueLocation?: string
  ) => {
    setVenue((prev) => ({
      ...prev,
      name: showName?.trim() || prev.name,
      venueLocation: venueLocation?.trim() || prev.venueLocation,
      organizer: theme.organizerName || prev.organizer,
      brandTheme: theme,
    }));
  };

  const handleApplyStandBrand = (
    standId: string,
    exhibitorName: string,
    brand: StandCustomBrand
  ) => {
    setVenue((prev) => ({
      ...prev,
      stands: prev.stands.map((s) =>
        s.id === standId
          ? { ...s, status: 'sold', exhibitorName, customBrand: brand }
          : s
      ),
    }));
    setSelectedStandId(standId);
    setFocusTrigger({ standId, walk: false, seq: Date.now() });
  };

  const handleSubmitReservation = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = `NEC-PI26-${selectedStand?.id || 'STAND'}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    setReserveRef(ref);
  };

  const shortlistedStands = useMemo(
    () => venue.stands.filter((s) => shortlistIds.has(s.id)),
    [venue.stands, shortlistIds]
  );

  const isAvailableOnly =
    filters.statuses.length === 1 && filters.statuses[0] === 'available';

  const shellThemeStyle = useMemo(
    () =>
      ({
        ...(venue.brandTheme?.primaryColor
          ? { '--brand-primary': venue.brandTheme.primaryColor }
          : {}),
        ...(venue.brandTheme?.accentColor
          ? { '--brand-accent': venue.brandTheme.accentColor }
          : {}),
      }) as React.CSSProperties,
    [venue.brandTheme]
  );

  return (
    <div className="venue-shell" style={shellThemeStyle}>
      {/* ==================== TOP HEADER ==================== */}
      <header className="venue-topbar">
        <div className="venue-topbar-left">
          <div className="venue-brand-pill">
            <BrandMark size={26} />
            <span>{venue.brandTheme?.organizerName || 'PilotStand'}</span>
            <span className="venue-brand-badge">{venue.brandTheme?.badgeText || 'Venue'}</span>
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

        {/* 2D / 3D / Walkthrough Mode Switcher */}
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
            onClick={() => setStudioOpen(true)}
            title="Switch shows, import CSV/JSON floorplan, auto-scrape exhibitor brands & white-label embed"
          >
            <Building2 size={14} />
            <span>Organizer Studio</span>
          </button>
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
        <aside className={`venue-sidebar ${mobileSheet === 'filters' ? 'mobile-open' : ''}`}>
          <div className="venue-mobile-drawer-close">
            <span>Filters & Stands ({matchingStands.length})</span>
            <button type="button" className="venue-btn" onClick={() => setMobileSheet('none')}>
              <X size={13} /> Done
            </button>
          </div>
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
            <div className="venue-search-box">
              <Search size={14} />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                placeholder="Search stand (AC72) or brand (Amcor)..."
              />
            </div>

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
              <div className="venue-section-label">Open Sides & Obstructions</div>
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

            {/* Competitor Radar */}
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

            {/* Intelligence & Venue Layers */}
            <div className="venue-filter-section">
              <div className="venue-section-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Layers size={12} /> Intelligence Layers
                </span>
              </div>
              <div className="venue-chip-row">
                <button
                  type="button"
                  className={`venue-chip ${layers.pillars ? 'active' : ''}`}
                  onClick={() => setLayers((l) => ({ ...l, pillars: !l.pillars }))}
                >
                  NEC Pillars
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
                  className={`venue-chip ${showSightlines ? 'active' : ''}`}
                  onClick={() => setShowSightlines((v) => !v)}
                  title="Cast 3D sightline rays from entrances & boulevards to check obstructions"
                >
                  <Radar size={11} /> Sightlines
                </button>
                <button
                  type="button"
                  className={`venue-chip ${showVisitorFlow ? 'active' : ''}`}
                  onClick={() => setShowVisitorFlow((v) => !v)}
                  title="Animate visitor traffic flowing from NEC Atrium Entrances"
                >
                  <Waves size={11} /> Visitor Flow
                </button>
                <button
                  type="button"
                  className={`venue-chip ${layers.footfallHeatmap ? 'active' : ''}`}
                  onClick={() =>
                    setLayers((l) => ({ ...l, footfallHeatmap: !l.footfallHeatmap }))
                  }
                >
                  <Flame size={11} /> Heatmap
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
                          ⚠ NEC pillar obstruction
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
              testFit={testFit}
              showSightlines={showSightlines}
              showVisitorFlow={showVisitorFlow}
              onSelectStand={(id) => setSelectedStandId(id)}
              focusTrigger={focusTrigger}
            />
          )}
        </main>

        {/* RIGHT STAND INSPECTOR & B2B SALES PANEL */}
        <aside className={`venue-inspector ${mobileSheet === 'inspector' ? 'mobile-open' : ''}`}>
          <div className="venue-mobile-drawer-close">
            <span>{selectedStand ? `Stand ${selectedStand.id}` : 'Stand Inspector'}</span>
            <button type="button" className="venue-btn" onClick={() => setMobileSheet('none')}>
              <X size={13} /> Close
            </button>
          </div>
          {selectedStand && selectedAnalytics ? (
            <>
              <div className="venue-inspector-scroll">
                <div className="venue-inspector-header">
                  <div className="venue-inspector-title-row">
                    <h2 className="venue-inspector-title">Stand {selectedStand.id}</h2>
                    <span className={`status-pill status-${selectedStand.status}`}>
                      {VENUE_STATUS_COLORS[selectedStand.status]?.label || selectedStand.status}
                    </span>
                  </div>

                  {/* Researched Brand Identity Card for Booked Stands */}
                  {selectedBrandProfile && (
                    <div
                      style={{
                        borderRadius: 9,
                        overflow: 'hidden',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--surface-1)',
                        marginTop: 4,
                      }}
                    >
                      <div
                        style={{
                          height: 6,
                          background: `linear-gradient(90deg, ${selectedBrandProfile.primaryColor}, ${selectedBrandProfile.accentColor})`,
                        }}
                      />
                      <div style={{ padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>
                          {selectedBrandProfile.company}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-secondary)', lineHeight: 1.35 }}>
                          {selectedBrandProfile.tagline}
                        </div>
                        {selectedBrandProfile.highlights && (
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)', lineHeight: 1.35 }}>
                            {selectedBrandProfile.highlights}
                          </div>
                        )}
                        <a
                          href={selectedBrandProfile.website}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: '#1d4ed8',
                            textDecoration: 'none',
                            marginTop: 2,
                          }}
                        >
                          <Building2 size={12} /> Visit Official Website <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                  )}

                  {selectedStand.status === 'feature' && selectedStand.exhibitorName && (
                    <div style={{ fontSize: 14, fontWeight: 700 }}>
                      {selectedStand.exhibitorName}
                      {selectedStand.sponsor && (
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-muted)' }}>
                          Sponsored by {selectedStand.sponsor}
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

                {/* Dimensions & Pricing Grid */}
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

                {/* Live "Test-Fit Your Brand" Studio inside the 3D NEC Hall */}
                {selectedStand.status === 'available' && (
                  <div
                    style={{
                      background: '#fff7f5',
                      border: '1px solid rgba(255, 77, 46, 0.35)',
                      borderRadius: 10,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        fontWeight: 800,
                        color: '#111315',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Sparkles size={13} color="#ff4d2e" /> Live Test-Fit Your Brand in 3D
                      </span>
                      <input
                        type="checkbox"
                        checked={testFit.enabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setTestFit((t) => ({ ...t, enabled: checked }));
                          if (checked && displayMode === '2d') setDisplayMode('3d');
                        }}
                        style={{ accentColor: '#ff4d2e', width: 16, height: 16 }}
                      />
                    </label>
                    {testFit.enabled && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          type="text"
                          value={testFit.companyName}
                          onChange={(e) =>
                            setTestFit((t) => ({ ...t, companyName: e.target.value }))
                          }
                          placeholder="Your Company Name"
                          className="venue-select"
                        />
                        <input
                          type="text"
                          value={testFit.tagline}
                          onChange={(e) =>
                            setTestFit((t) => ({ ...t, tagline: e.target.value }))
                          }
                          placeholder="Stand Tagline"
                          className="venue-select"
                        />
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <label style={{ fontSize: 11, fontWeight: 600 }}>
                            Brand:
                            <input
                              type="color"
                              value={testFit.primaryColor}
                              onChange={(e) =>
                                setTestFit((t) => ({ ...t, primaryColor: e.target.value }))
                              }
                              style={{ marginLeft: 4, width: 24, height: 22, border: 'none' }}
                            />
                          </label>
                          <select
                            className="venue-select"
                            value={testFit.packageTier}
                            onChange={(e) =>
                              setTestFit((t) => ({
                                ...t,
                                packageTier: e.target.value as TestFitBrandConfig['packageTier'],
                              }))
                            }
                          >
                            <option value="shell">Shell Scheme Booth</option>
                            <option value="modular">Executive Modular</option>
                            <option value="flagship">Flagship + Hanging Cube</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Pillar Obstruction Check */}
                {selectedAnalytics.obstructingPillars.length > 0 ? (
                  <div className="venue-alert-card warn">
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>NEC Structural Column Obstruction</strong>
                      <div style={{ marginTop: 2 }}>
                        {selectedAnalytics.obstructingPillars.map((p) => p.label).join(', ')}.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="venue-alert-card ok">
                    <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <strong>Clear Pillar-Free Plot</strong>
                      <div style={{ marginTop: 1 }}>
                        Unobstructed aisle sightlines across all {selectedStand.openSides} open sides.
                      </div>
                    </div>
                  </div>
                )}

                {/* Organizer Upsells & Turnkey Package Configurator */}
                {selectedStand.status === 'available' && (
                  <div className="venue-filter-section">
                    <div className="venue-section-label">
                      <span>Organizer Package & Upsells</span>
                      <span className="mono-num" style={{ color: '#111315' }}>
                        {formatGbp(packageGrandTotalGbp)}
                      </span>
                    </div>
                    <div className="venue-chip-row">
                      <button
                        type="button"
                        className={`venue-chip ${!shellSchemeSelected ? 'active' : ''}`}
                        onClick={() => setShellSchemeSelected(false)}
                      >
                        Space Only
                      </button>
                      <button
                        type="button"
                        className={`venue-chip ${shellSchemeSelected ? 'active' : ''}`}
                        onClick={() => setShellSchemeSelected(true)}
                      >
                        Turnkey Shell (+£85/m²)
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {ORGANIZER_UPSELLS.map((u) => (
                        <label
                          key={u.id}
                          className="venue-toggle-row"
                          style={{ padding: '5px 8px', fontSize: 11.5 }}
                        >
                          <span>
                            {u.label}{' '}
                            <strong className="mono-num" style={{ color: 'var(--ink-muted)' }}>
                              +{formatGbp(u.priceGbp)}
                            </strong>
                          </span>
                          <input
                            type="checkbox"
                            checked={selectedUpsells.has(u.id)}
                            onChange={() => toggleUpsell(u.id)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Location & Footfall Intelligence */}
                <div className="venue-filter-section">
                  <div className="venue-section-label">NEC Location & Footfall Intel</div>
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

                {/* Nearby Confirmed Exhibitors */}
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
                  <>
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
                      <span>Design Stand {selectedStand.id} in Full 3D</span>
                      <ArrowRight size={14} />
                    </button>
                    <button
                      type="button"
                      className="venue-btn dark full"
                      onClick={() => {
                        setReserveRef(null);
                        setReserveOpen(true);
                      }}
                    >
                      <ShieldCheck size={14} />
                      <span>
                        Reserve 48h Hold ({formatGbp(packageGrandTotalGbp)})
                      </span>
                    </button>
                  </>
                )}

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="venue-btn full"
                    onClick={() => handleSelectAndFocus(selectedStand.id, true)}
                  >
                    <Eye size={14} />
                    <span>Walk (1.68m)</span>
                  </button>

                  {selectedStand.status === 'available' ? (
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
                  ) : selectedStand.status === 'sold' ? (
                    <button
                      type="button"
                      className="venue-btn full"
                      onClick={() => togglePinCompetitor(selectedStand.id)}
                    >
                      <Target size={14} color="#dc2626" />
                      <span>
                        {pinnedCompetitorIds.has(selectedStand.id) ? 'Unflag' : 'Track Rival'}
                      </span>
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 24, color: 'var(--ink-muted)', fontSize: 13 }}>
              Click any stand on the NEC Halls 6–8 floorplan to inspect dimensions, real exhibitor
              branding, pillar obstructions, sightlines, and launch the 3D Stand Designer.
            </div>
          )}
        </aside>
      </div>

      {/* ==================== 48-HOUR STAND RESERVATION MODAL ==================== */}
      {reserveOpen && selectedStand && selectedAnalytics && (
        <div className="venue-modal-backdrop" onClick={() => setReserveOpen(false)}>
          <div
            className="venue-compare-modal"
            style={{ width: 'min(520px, 95vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="venue-compare-header">
              <h3>Reserve 48-Hour Option — Stand {selectedStand.id}</h3>
              <button
                type="button"
                className="venue-btn"
                onClick={() => setReserveOpen(false)}
              >
                <X size={14} /> Close
              </button>
            </div>
            <div className="venue-compare-body">
              {reserveRef ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="venue-alert-card ok">
                    <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                    <div>
                      <strong>48-Hour Stand Hold Requested!</strong>
                      <div style={{ marginTop: 4 }}>
                        Reference: <strong className="mono-num">{reserveRef}</strong>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--ink-secondary)', margin: 0 }}>
                    The {venue.organizer} commercial team has received your specification for{' '}
                    <strong>
                      Stand {selectedStand.id} ({selectedStand.width}m × {selectedStand.depth}m,{' '}
                      {selectedAnalytics.areaM2}m²)
                    </strong>{' '}
                    with estimated total{' '}
                    <strong className="mono-num">{formatGbp(packageGrandTotalGbp)}</strong>.
                  </p>
                  <button
                    type="button"
                    className="venue-btn primary full"
                    onClick={() => {
                      setReserveOpen(false);
                      onDesignStand({
                        stand: selectedStand,
                        analytics: selectedAnalytics,
                        venue,
                      });
                    }}
                  >
                    <Sparkles size={14} /> Start Designing Stand {selectedStand.id} in 3D Now
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmitReservation}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <div
                    style={{
                      background: 'var(--surface-1)',
                      padding: 10,
                      borderRadius: 9,
                      border: '1px solid var(--border-subtle)',
                      fontSize: 12.5,
                    }}
                  >
                    <div>
                      <strong>
                        Stand {selectedStand.id} — {selectedStand.width}m × {selectedStand.depth}m (
                        {selectedAnalytics.areaM2}m²)
                      </strong>
                    </div>
                    <div style={{ color: 'var(--ink-secondary)', marginTop: 3 }}>
                      {shellSchemeSelected ? 'Turnkey Shell Scheme' : 'Space Only'} +{' '}
                      {selectedUpsells.size} organizer add-on(s) • Total:{' '}
                      <strong className="mono-num">{formatGbp(packageGrandTotalGbp)}</strong>
                    </div>
                  </div>
                  <input
                    required
                    type="text"
                    className="venue-select"
                    placeholder="Company Name *"
                    value={reserveForm.company}
                    onChange={(e) => setReserveForm((f) => ({ ...f, company: e.target.value }))}
                  />
                  <input
                    required
                    type="text"
                    className="venue-select"
                    placeholder="Your Full Name *"
                    value={reserveForm.contactName}
                    onChange={(e) =>
                      setReserveForm((f) => ({ ...f, contactName: e.target.value }))
                    }
                  />
                  <input
                    required
                    type="email"
                    className="venue-select"
                    placeholder="Work Email *"
                    value={reserveForm.email}
                    onChange={(e) => setReserveForm((f) => ({ ...f, email: e.target.value }))}
                  />
                  <input
                    type="tel"
                    className="venue-select"
                    placeholder="Direct Phone (optional)"
                    value={reserveForm.phone}
                    onChange={(e) => setReserveForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                  <button type="submit" className="venue-btn primary full">
                    <ShieldCheck size={14} /> Request 48-Hour Stand Hold
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

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
                              <span style={{ color: '#b45309', fontWeight: 700 }}>⚠ Pillar</span>
                            ) : (
                              <span style={{ color: '#15803d', fontWeight: 700 }}>Clear</span>
                            )}
                          </td>
                          <td className="mono-num">
                            {a.nearestEntrance?.distanceM ?? '—'}m /{' '}
                            {a.nearestToilet?.distanceM ?? '—'}m
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
      {/* ==================== MOBILE BOTTOM BAR ==================== */}
      <nav className="venue-mobile-bar" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`venue-mobile-tab ${mobileSheet === 'filters' ? 'active' : ''}`}
          onClick={() => setMobileSheet((m) => (m === 'filters' ? 'none' : 'filters'))}
        >
          <SlidersHorizontal size={17} />
          <span>Filters</span>
        </button>
        <button
          type="button"
          className={`venue-mobile-tab ${mobileSheet === 'inspector' ? 'active' : ''}`}
          onClick={() => setMobileSheet((m) => (m === 'inspector' ? 'none' : 'inspector'))}
        >
          <Sparkles size={17} />
          <span>{selectedStand ? `Stand ${selectedStand.id}` : 'Details'}</span>
        </button>
        <button
          type="button"
          className={`venue-mobile-tab ${displayMode === 'walk' ? 'active' : ''}`}
          onClick={() => {
            setMobileSheet('none');
            setDisplayMode((d) => (d === 'walk' ? '3d' : 'walk'));
          }}
        >
          <Footprints size={17} />
          <span>{displayMode === 'walk' ? '3D Orbit' : 'Walk'}</span>
        </button>
        <button
          type="button"
          className="venue-mobile-tab"
          onClick={() => {
            setMobileSheet('none');
            setStudioOpen(true);
          }}
        >
          <Building2 size={17} />
          <span>Organizer</span>
        </button>
      </nav>

      {/* ==================== ORGANIZER STUDIO MODAL ==================== */}
      <OrganizerStudioModal
        open={studioOpen}
        venue={venue}
        onClose={() => setStudioOpen(false)}
        onLoadVenue={handleLoadVenue}
        onUpdateTheme={handleUpdateTheme}
        onApplyStandBrand={handleApplyStandBrand}
      />
    </div>
  );
};
