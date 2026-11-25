import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  ExhibitionVenue,
  StandAnalytics,
  VenueLayerVisibility,
  VenueStand,
} from '../types/venue';
import { VENUE_STATUS_COLORS } from '../data/packagingInnovationsVenue';
import { formatGbp, getOpenSidesLabel } from '../utils/venueAnalytics';

interface VenueMap2DProps {
  venue: ExhibitionVenue;
  matchingStandIds: Set<string>;
  analyticsMap: Map<string, StandAnalytics>;
  selectedStandId: string | null;
  hoveredStandId: string | null;
  competitorStandIds: Set<string>;
  shortlistIds: Set<string>;
  layers: VenueLayerVisibility;
  onSelectStand: (standId: string) => void;
  onHoverStand: (standId: string | null) => void;
  focusTrigger?: { standId: string; seq: number } | null;
}

const SCALE = 7; // SVG pixels per metre
const PAD = 32;

export const VenueMap2D: React.FC<VenueMap2DProps> = ({
  venue,
  matchingStandIds,
  analyticsMap,
  selectedStandId,
  hoveredStandId,
  competitorStandIds,
  shortlistIds,
  layers,
  onSelectStand,
  onHoverStand,
  focusTrigger,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState({ x: 40, y: 20, k: 0.72 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const didDragRef = useRef(false);
  const [cursorTooltip, setCursorTooltip] = useState<{ x: number; y: number } | null>(null);

  const svgWidth = venue.widthM * SCALE + PAD * 2 + 120;
  const svgHeight = venue.depthM * SCALE + PAD * 2;

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const scaleX = (rect.width - 40) / svgWidth;
    const scaleY = (rect.height - 40) / svgHeight;
    const k = Math.max(0.28, Math.min(1.2, Math.min(scaleX, scaleY) * 1.05));
    const tx = (rect.width - svgWidth * k) / 2;
    const ty = Math.max(14, (rect.height - svgHeight * k) / 2);
    setTransform({ x: tx, y: ty, k });
  }, [svgWidth, svgHeight]);

  useEffect(() => {
    fitToView();
    const onResize = () => fitToView();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitToView]);

  // Focus on a stand when triggered from sidebar/search
  useEffect(() => {
    if (!focusTrigger) return;
    const stand = venue.stands.find((s) => s.id === focusTrigger.standId);
    const el = containerRef.current;
    if (!stand || !el) return;
    const rect = el.getBoundingClientRect();
    const targetK = 1.45;
    const cx = PAD + (stand.x + stand.width / 2) * SCALE;
    const cz = PAD + (stand.z + stand.depth / 2) * SCALE;
    setTransform({
      x: rect.width / 2 - cx * targetK,
      y: rect.height / 2 - cz * targetK,
      k: targetK,
    });
  }, [focusTrigger, venue.stands]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setTransform((prev) => {
      const nextK = Math.max(0.22, Math.min(3.4, prev.k * zoomFactor));
      const ratio = nextK / prev.k;
      return {
        k: nextK,
        x: mx - (mx - prev.x) * ratio,
        y: my - (my - prev.y) * ratio,
      };
    });
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      didDragRef.current = false;
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transform.x,
        ty: transform.y,
      };
    },
    [transform.x, transform.y]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setCursorTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (!panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    if (Math.hypot(dx, dy) > 4) {
      didDragRef.current = true;
    }
    setTransform((prev) => ({
      ...prev,
      x: panStartRef.current!.tx + dx,
      y: panStartRef.current!.ty + dy,
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  const zoomStep = useCallback((mult: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setTransform((prev) => {
      const nextK = Math.max(0.22, Math.min(3.4, prev.k * mult));
      const ratio = nextK / prev.k;
      return {
        k: nextK,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
  }, []);

  const hoveredStand: VenueStand | null = useMemo(() => {
    if (!hoveredStandId) return null;
    return venue.stands.find((s) => s.id === hoveredStandId) || null;
  }, [hoveredStandId, venue.stands]);

  const hoveredAnalytics = hoveredStand ? analyticsMap.get(hoveredStand.id) : null;

  return (
    <div
      ref={containerRef}
      className={`venue-map2d-root ${isPanning ? 'is-panning' : ''}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        handlePointerUp();
        onHoverStand(null);
      }}
    >
      <svg
        width="100%"
        height="100%"
        className="venue-map2d-svg"
        role="img"
        aria-label={`${venue.name} interactive 2D floorplan`}
      >
        <defs>
          <pattern
            id="pillar-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="#1f2937" strokeWidth="2.2" />
          </pattern>
          <radialGradient id="heat-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff4d2e" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Zone Carpet Regions */}
          {venue.zones.map((zone) => (
            <g key={zone.id}>
              {zone.regions.map((r, idx) => (
                <rect
                  key={`${zone.id}-${idx}`}
                  x={PAD + r.x * SCALE}
                  y={PAD + r.z * SCALE}
                  width={r.width * SCALE}
                  height={r.depth * SCALE}
                  fill={zone.carpetColor}
                  stroke={zone.borderColor}
                  strokeWidth={1.5}
                  strokeDasharray={zone.id === 'smart-packaging' || zone.id === 'contract-pack' || zone.id === 'start-up' ? '6 4' : undefined}
                  rx={2}
                />
              ))}
              <text
                x={PAD + zone.labelPos.x * SCALE}
                y={PAD + zone.labelPos.z * SCALE}
                textAnchor="middle"
                fill={zone.id === 'empack' ? 'rgba(255,255,255,0.88)' : 'rgba(17,19,21,0.72)'}
                fontSize={zone.id === 'start-up' ? 11 : 14}
                fontWeight={800}
                letterSpacing="0.08em"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {zone.name.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Footfall Heatmap Layer */}
          {layers.footfallHeatmap && (
            <g style={{ pointerEvents: 'none' }}>
              {venue.entrances.map((ent) => (
                <circle
                  key={`heat-${ent.id}`}
                  cx={PAD + (ent.x - 10) * SCALE}
                  cy={PAD + ent.z * SCALE}
                  r={28 * SCALE}
                  fill="url(#heat-glow)"
                />
              ))}
              {venue.stands
                .filter((s) => s.status === 'feature')
                .map((feat) => (
                  <circle
                    key={`heat-feat-${feat.id}`}
                    cx={PAD + (feat.x + feat.width / 2) * SCALE}
                    cy={PAD + (feat.z + feat.depth / 2) * SCALE}
                    r={18 * SCALE}
                    fill="url(#heat-glow)"
                  />
                ))}
            </g>
          )}

          {/* Aisle Width Callouts */}
          {layers.aisleWidths &&
            venue.aisleLabels.map((al) => (
              <g key={al.id} style={{ pointerEvents: 'none' }}>
                <rect
                  x={PAD + al.x * SCALE - 13}
                  y={PAD + al.z * SCALE - 7}
                  width={26}
                  height={14}
                  rx={4}
                  fill="rgba(17,19,21,0.72)"
                />
                <text
                  x={PAD + al.x * SCALE}
                  y={PAD + al.z * SCALE + 3.5}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={8.5}
                  fontWeight={700}
                >
                  {al.widthM}m
                </text>
              </g>
            ))}

          {/* Stands */}
          {venue.stands.map((stand) => {
            const sx = PAD + stand.x * SCALE;
            const sy = PAD + stand.z * SCALE;
            const sw = stand.width * SCALE;
            const sh = stand.depth * SCALE;
            const style = VENUE_STATUS_COLORS[stand.status] || VENUE_STATUS_COLORS.available;
            const isSelected = selectedStandId === stand.id;
            const isHovered = hoveredStandId === stand.id;
            const isMatching = matchingStandIds.has(stand.id);
            const isCompetitor = layers.competitors && competitorStandIds.has(stand.id);
            const isShortlisted = shortlistIds.has(stand.id);
            const analytics = analyticsMap.get(stand.id);
            const hasPillar = (analytics?.obstructingPillars.length ?? 0) > 0;

            const dimmed =
              !isSelected &&
              !isCompetitor &&
              !isMatching &&
              stand.status !== 'feature';

            const fill =
              isCompetitor
                ? '#fee2e2'
                : stand.status === 'available' && isSelected
                ? '#dcfce7'
                : style.fill;

            const stroke = isSelected
              ? '#ff4d2e'
              : isCompetitor
              ? '#dc2626'
              : isHovered
              ? '#111315'
              : style.stroke;

            const strokeWidth = isSelected ? 2.8 : isCompetitor ? 2.4 : isHovered ? 2 : 0.9;

            const showCompany = sw >= 22 && sh >= 18 && stand.exhibitorName;
            const showDims = layers.dimensions && sw >= 24 && sh >= 24;

            return (
              <g
                key={stand.id}
                className="venue-map2d-stand"
                opacity={dimmed ? 0.34 : 1}
                onMouseEnter={() => onHoverStand(stand.id)}
                onMouseLeave={() => onHoverStand(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!didDragRef.current) {
                    onSelectStand(stand.id);
                  }
                }}
              >
                <rect
                  x={sx}
                  y={sy}
                  width={sw}
                  height={sh}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  rx={1.5}
                />

                {/* Available stand subtle emerald highlight dot */}
                {stand.status === 'available' && !dimmed && (
                  <circle
                    cx={sx + sw - 5}
                    cy={sy + 5}
                    r={2.5}
                    fill={hasPillar ? '#d97706' : '#16a34a'}
                  />
                )}

                {/* Stand ID */}
                <text
                  x={sx + 3.5}
                  y={sy + 9}
                  fill={isCompetitor ? '#991b1b' : style.textColor}
                  fontSize={Math.min(8.5, Math.max(6.2, sw / 4.2))}
                  fontWeight={800}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {stand.id}
                </text>

                {/* Company / Feature Name */}
                {showCompany && (
                  <text
                    x={sx + sw / 2}
                    y={sy + sh / 2 + (stand.status === 'feature' ? 2 : 3)}
                    textAnchor="middle"
                    fill={isCompetitor ? '#7f1d1d' : style.textColor}
                    fontSize={
                      stand.status === 'feature'
                        ? Math.min(11.5, Math.max(7.5, sw / 10))
                        : Math.min(8, Math.max(5.6, sw / 6.5))
                    }
                    fontWeight={stand.status === 'feature' ? 800 : 600}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {stand.exhibitorName!.length > Math.floor(sw / 3.8)
                      ? `${stand.exhibitorName!.slice(0, Math.max(4, Math.floor(sw / 4.2)))}…`
                      : stand.exhibitorName}
                  </text>
                )}

                {/* Area / Dimensions label */}
                {showDims && (
                  <text
                    x={sx + sw - 3}
                    y={sy + sh - 3}
                    textAnchor="end"
                    fill={stand.status === 'reserved' ? 'rgba(255,255,255,0.85)' : 'rgba(17,24,39,0.58)'}
                    fontSize={6.2}
                    fontWeight={600}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {stand.width}×{stand.depth}m
                  </text>
                )}

                {/* Shortlist star */}
                {isShortlisted && (
                  <circle
                    cx={sx + 5}
                    cy={sy + sh - 5}
                    r={3.5}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                )}

                {/* Competitor pulsing badge */}
                {isCompetitor && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={sx + sw / 2 - 22}
                      y={sy - 11}
                      width={44}
                      height={11}
                      rx={3}
                      fill="#dc2626"
                    />
                    <text
                      x={sx + sw / 2}
                      y={sy - 3}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={6.5}
                      fontWeight={800}
                    >
                      COMPETITOR
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Structural Pillars / Void Obstructions */}
          {layers.pillars &&
            venue.pillars.map((pillar) => {
              const px = PAD + pillar.x * SCALE;
              const py = PAD + pillar.z * SCALE;
              const pw = pillar.width * SCALE;
              const ph = pillar.depth * SCALE;
              return (
                <g key={pillar.id} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={px}
                    y={py}
                    width={pw}
                    height={ph}
                    fill="#4b5563"
                    stroke="#111827"
                    strokeWidth={1.2}
                  />
                  <rect
                    x={px}
                    y={py}
                    width={pw}
                    height={ph}
                    fill="url(#pillar-hatch)"
                    opacity={0.55}
                  />
                </g>
              );
            })}

          {/* Amenities (Toilets, Catering, Info, First Aid) */}
          {layers.amenities &&
            venue.amenities.map((am) => {
              const ax = PAD + am.x * SCALE;
              const ay = PAD + am.z * SCALE;
              const aw = am.width * SCALE;
              const ah = am.depth * SCALE;
              const bg =
                am.kind === 'toilets'
                  ? '#0f766e'
                  : am.kind === 'catering'
                  ? '#0284c7'
                  : am.kind === 'first-aid'
                  ? '#dc2626'
                  : '#4f46e5';
              const tag =
                am.kind === 'toilets'
                  ? 'WC'
                  : am.kind === 'catering'
                  ? 'CAFE'
                  : am.kind === 'first-aid'
                  ? 'AID'
                  : 'INFO';
              return (
                <g key={am.id} style={{ pointerEvents: 'none' }}>
                  <rect
                    x={ax}
                    y={ay}
                    width={aw}
                    height={ah}
                    rx={3}
                    fill={bg}
                    stroke="#ffffff"
                    strokeWidth={1.2}
                  />
                  <text
                    x={ax + aw / 2}
                    y={ay + ah / 2 + 3}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={7.5}
                    fontWeight={800}
                  >
                    {tag}
                  </text>
                </g>
              );
            })}

          {/* Visitors Entrances */}
          {venue.entrances.map((ent) => {
            const ex = PAD + ent.x * SCALE + 14;
            const ey = PAD + ent.z * SCALE;
            return (
              <g key={ent.id} style={{ pointerEvents: 'none' }}>
                <polygon
                  points={`${ex},${ey} ${ex + 22},${ey - 12} ${ex + 22},${ey - 5} ${ex + 40},${ey - 5} ${ex + 40},${ey + 5} ${ex + 22},${ey + 5} ${ex + 22},${ey + 12}`}
                  fill="#111315"
                />
                <text
                  x={ex + 46}
                  y={ey - 2}
                  fill="#111315"
                  fontSize={10}
                  fontWeight={800}
                >
                  VISITORS
                </text>
                <text
                  x={ex + 46}
                  y={ey + 10}
                  fill="#111315"
                  fontSize={10}
                  fontWeight={800}
                >
                  ENTRANCE
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Floating Legend */}
      <div className="venue-map-legend" aria-label="Floorplan Legend">
        <span className="legend-chip"><i style={{ background: '#ffffff', border: '1px solid #111827' }} /> Available</span>
        <span className="legend-chip"><i style={{ background: '#fef08a', border: '1px solid #854d0e' }} /> Sold</span>
        <span className="legend-chip"><i style={{ background: '#0ea5e9', border: '1px solid #0369a1' }} /> Reserved</span>
        <span className="legend-chip"><i style={{ background: '#c4b5fd', border: '1px solid #5b21b6' }} /> Feature</span>
        <span className="legend-chip"><i style={{ background: '#4b5563', border: '1px solid #111827' }} /> Pillar / Void</span>
        <span className="legend-chip"><i style={{ background: '#0f766e' }} /> Toilets (WC)</span>
      </div>

      {/* Floating Zoom Controls */}
      <div className="venue-map-controls">
        <button type="button" onClick={() => zoomStep(1.25)} title="Zoom In">
          <ZoomIn size={15} />
        </button>
        <button type="button" onClick={() => zoomStep(0.8)} title="Zoom Out">
          <ZoomOut size={15} />
        </button>
        <button type="button" onClick={fitToView} title="Fit Whole Hall">
          <Maximize2 size={15} />
        </button>
        {selectedStandId && (
          <button
            type="button"
            onClick={() => {
              const stand = venue.stands.find((s) => s.id === selectedStandId);
              const el = containerRef.current;
              if (!stand || !el) return;
              const rect = el.getBoundingClientRect();
              const k = 1.5;
              setTransform({
                x: rect.width / 2 - (PAD + (stand.x + stand.width / 2) * SCALE) * k,
                y: rect.height / 2 - (PAD + (stand.z + stand.depth / 2) * SCALE) * k,
                k,
              });
            }}
            title="Center on Selected Stand"
          >
            <Crosshair size={15} />
          </button>
        )}
      </div>

      {/* Hover Tooltip */}
      {hoveredStand && hoveredAnalytics && cursorTooltip && !isPanning && (
        <div
          className="venue-hover-tooltip"
          style={{
            left: Math.min(
              (containerRef.current?.clientWidth || 600) - 245,
              cursorTooltip.x + 16
            ),
            top: Math.max(12, cursorTooltip.y - 10),
          }}
        >
          <div className="tooltip-top">
            <strong>Stand {hoveredStand.id}</strong>
            <span className={`status-pill status-${hoveredStand.status}`}>
              {VENUE_STATUS_COLORS[hoveredStand.status]?.label || hoveredStand.status}
            </span>
          </div>
          {hoveredStand.exhibitorName && (
            <div className="tooltip-company">{hoveredStand.exhibitorName}</div>
          )}
          <div className="tooltip-meta">
            <span>
              {hoveredStand.width}m × {hoveredStand.depth}m ({hoveredAnalytics.areaM2}m²)
            </span>
            <span>• {getOpenSidesLabel(hoveredStand.openSides)}</span>
          </div>
          {hoveredStand.status === 'available' && (
            <div className="tooltip-price">
              Est. Space Only: <strong>{formatGbp(hoveredAnalytics.spaceOnlyPriceGbp)}</strong>
            </div>
          )}
          {hoveredAnalytics.obstructingPillars.length > 0 && (
            <div className="tooltip-warn">⚠ Structural pillar obstruction</div>
          )}
        </div>
      )}
    </div>
  );
};
