import React, { useState } from 'react';
import {
  Building2,
  Check,
  Code2,
  Copy,
  Download,
  Globe,
  Loader2,
  Palette,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { ExhibitionVenue, OrganizerBrandTheme, StandCustomBrand } from '../types/venue';
import { PACKAGING_INNOVATIONS_VENUE } from '../data/packagingInnovationsVenue';
import {
  EXCEL_LONDON_CLEANTECH_VENUE,
  SAMPLE_CSV_TEMPLATE,
  enrichExhibitorFromWebsite,
  parseVenueCsv,
  parseVenueJson,
} from '../utils/venueImporter';

type StudioTab = 'shows' | 'import' | 'enrich' | 'whitelabel';

interface OrganizerStudioModalProps {
  open: boolean;
  venue: ExhibitionVenue;
  onClose: () => void;
  onLoadVenue: (venue: ExhibitionVenue) => void;
  onUpdateTheme: (theme: OrganizerBrandTheme, showName?: string, venueLocation?: string) => void;
  onApplyStandBrand: (standId: string, exhibitorName: string, brand: StandCustomBrand) => void;
}

export const OrganizerStudioModal: React.FC<OrganizerStudioModalProps> = ({
  open,
  venue,
  onClose,
  onLoadVenue,
  onUpdateTheme,
  onApplyStandBrand,
}) => {
  const [tab, setTab] = useState<StudioTab>('shows');

  // Import CSV/JSON state
  const [importMeta, setImportMeta] = useState({
    name: 'My Exhibition 2026',
    edition: '2026',
    organizer: 'Event Organiser Ltd',
    venueLocation: 'London, UK',
    hallName: 'Main Hall 1',
  });
  const [csvText, setCsvText] = useState(SAMPLE_CSV_TEMPLATE);
  const [importError, setImportError] = useState<string | null>(null);

  // Live Brand Auto-Scraper state
  const bookedOrAllStands = venue.stands.filter((s) => s.status !== 'feature');
  const [targetStandId, setTargetStandId] = useState<string>(
    bookedOrAllStands.find((s) => s.status === 'sold')?.id || bookedOrAllStands[0]?.id || ''
  );
  const [scrapeUrl, setScrapeUrl] = useState('https://www.amcor.com');
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{
    company: string;
    tagline: string;
    primaryColor: string;
    accentColor: string;
    website: string;
    source: string;
  } | null>(null);
  const [scrapeNotice, setScrapeNotice] = useState<string | null>(null);

  // White-label theme state
  const [themeForm, setThemeForm] = useState<OrganizerBrandTheme>({
    organizerName: venue.brandTheme?.organizerName || venue.organizer,
    primaryColor: venue.brandTheme?.primaryColor || '#111315',
    accentColor: venue.brandTheme?.accentColor || '#ff4d2e',
    badgeText: venue.brandTheme?.badgeText || 'VENUE',
  });
  const [showNameInput, setShowNameInput] = useState(venue.name);
  const [locationInput, setLocationInput] = useState(venue.venueLocation);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  if (!open) return null;

  const handleImportCsv = () => {
    setImportError(null);
    try {
      const nextVenue = parseVenueCsv(csvText, {
        ...importMeta,
        primaryColor: themeForm.primaryColor,
        accentColor: themeForm.accentColor,
      });
      onLoadVenue(nextVenue);
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse CSV');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (file.name.toLowerCase().endsWith('.json')) {
        try {
          const parsed = parseVenueJson(text);
          onLoadVenue(parsed);
          onClose();
        } catch (err) {
          setImportError(err instanceof Error ? err.message : 'Invalid JSON file');
        }
      } else {
        setCsvText(text);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadCsvTemplate = () => {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pilotstand-venue-floorplan-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportVenueJson = () => {
    const blob = new Blob([JSON.stringify(venue, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${venue.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleScrapeBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeUrl.trim()) return;
    setScraping(true);
    setScrapeNotice(null);
    try {
      const stand = venue.stands.find((s) => s.id === targetStandId);
      const res = await enrichExhibitorFromWebsite(scrapeUrl, stand?.exhibitorName);
      setScrapeResult(res);
    } finally {
      setScraping(false);
    }
  };

  const handleApplyScrapedBrand = () => {
    if (!scrapeResult || !targetStandId) return;
    onApplyStandBrand(targetStandId, scrapeResult.company, {
      primaryColor: scrapeResult.primaryColor,
      accentColor: scrapeResult.accentColor,
      tagline: scrapeResult.tagline,
      website: scrapeResult.website,
    });
    setScrapeNotice(`Applied ${scrapeResult.company}'s live branding to Stand ${targetStandId} in 3D!`);
  };

  const embedSnippet = `<iframe\n  src="${typeof window !== 'undefined' ? window.location.origin : 'https://venue.pilotstand.com'}/?show=${encodeURIComponent(venue.id)}"\n  title="${venue.name} Interactive 3D Floorplan"\n  width="100%"\n  height="760"\n  style="border:0;border-radius:12px;"\n  allow="fullscreen"\n></iframe>`;

  const handleCopyEmbed = () => {
    navigator.clipboard?.writeText(embedSnippet).catch(() => {});
    setCopiedEmbed(true);
    window.setTimeout(() => setCopiedEmbed(false), 2000);
  };

  return (
    <div className="venue-modal-backdrop" onClick={onClose}>
      <div
        className="venue-compare-modal"
        style={{ width: 'min(820px, 96vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="venue-compare-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={18} color="var(--brand-accent)" />
            <h3>Organizer Studio — Multi-Show, Importer & White-Label</h3>
          </div>
          <button type="button" className="venue-btn" onClick={onClose}>
            <X size={14} /> Close
          </button>
        </div>

        {/* Studio Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '10px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-1)',
            flexWrap: 'wrap',
          }}
        >
          {[
            { id: 'shows' as const, label: 'Demo Shows', icon: <Building2 size={13} /> },
            { id: 'import' as const, label: 'Import Floorplan CSV/JSON', icon: <Upload size={13} /> },
            { id: 'enrich' as const, label: 'Live Brand Auto-Scraper', icon: <Globe size={13} /> },
            { id: 'whitelabel' as const, label: 'White-Label & Embed', icon: <Palette size={13} /> },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`venue-chip ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="venue-compare-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* TAB 1: SWITCH SHOWS */}
          {tab === 'shows' && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-secondary)' }}>
                Switch between pre-digitized UK exhibition venues or export your active hall as JSON.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {[PACKAGING_INNOVATIONS_VENUE, EXCEL_LONDON_CLEANTECH_VENUE].map((v) => {
                  const isCurrent = venue.id === v.id;
                  const avail = v.stands.filter((s) => s.status === 'available').length;
                  return (
                    <div
                      key={v.id}
                      style={{
                        border: isCurrent ? '2px solid var(--brand-accent)' : '1px solid var(--border-subtle)',
                        borderRadius: 11,
                        padding: 14,
                        background: isCurrent ? 'var(--brand-accent-soft)' : 'var(--surface-0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 14 }}>{v.name} {v.edition}</strong>
                        {isCurrent && <span className="status-pill status-available">Active</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                        {v.venueLocation} • {v.hallName}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                        {v.stands.length} stands ({avail} available) • {v.zones.length} zones • {v.organizer}
                      </div>
                      <button
                        type="button"
                        className={`venue-btn ${isCurrent ? '' : 'primary'}`}
                        onClick={() => {
                          onLoadVenue(v);
                          onClose();
                        }}
                      >
                        {isCurrent ? 'Reload This Show' : 'Load Interactive 2D/3D Hall'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="venue-btn" onClick={handleExportVenueJson}>
                  <Download size={13} /> Export Active Hall JSON
                </button>
              </div>
            </>
          )}

          {/* TAB 2: CSV / JSON FLOORPLAN IMPORTER */}
          {tab === 'import' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  Import any exhibition stand inventory CSV (from GES, Expocad, or Excel) to generate a live 2D & 3D hall.
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="venue-btn" onClick={handleDownloadCsvTemplate}>
                    <Download size={13} /> CSV Template
                  </button>
                  <label className="venue-btn" style={{ cursor: 'pointer' }}>
                    <Upload size={13} /> Upload CSV / JSON
                    <input
                      type="file"
                      accept=".csv,.json"
                      onChange={handleFileUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                <input
                  className="venue-select"
                  value={importMeta.name}
                  onChange={(e) => setImportMeta((m) => ({ ...m, name: e.target.value }))}
                  placeholder="Show Name"
                />
                <input
                  className="venue-select"
                  value={importMeta.organizer}
                  onChange={(e) => setImportMeta((m) => ({ ...m, organizer: e.target.value }))}
                  placeholder="Organiser"
                />
                <input
                  className="venue-select"
                  value={importMeta.venueLocation}
                  onChange={(e) => setImportMeta((m) => ({ ...m, venueLocation: e.target.value }))}
                  placeholder="Venue Location"
                />
                <input
                  className="venue-select"
                  value={importMeta.hallName}
                  onChange={(e) => setImportMeta((m) => ({ ...m, hallName: e.target.value }))}
                  placeholder="Hall Name"
                />
              </div>

              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={9}
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-1)',
                }}
              />
              {importError && (
                <div className="venue-alert-card warn">{importError}</div>
              )}
              <button type="button" className="venue-btn primary full" onClick={handleImportCsv}>
                <Sparkles size={14} /> Generate Live 2D & 3D Exhibition Hall
              </button>
            </>
          )}

          {/* TAB 3: LIVE EXHIBITOR BRAND AUTO-SCRAPER */}
          {tab === 'enrich' && (
            <>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                Paste any booked exhibitor&apos;s website URL to automatically pull their company name,
                tagline, and brand color directly onto their 3D exhibition stand.
              </p>
              <form
                onSubmit={handleScrapeBrand}
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr auto', gap: 8 }}>
                  <select
                    className="venue-select"
                    value={targetStandId}
                    onChange={(e) => setTargetStandId(e.target.value)}
                  >
                    {bookedOrAllStands.slice(0, 80).map((s) => (
                      <option key={s.id} value={s.id}>
                        Stand {s.id} {s.exhibitorName ? `(${s.exhibitorName})` : '(Available)'}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="venue-select"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    placeholder="https://www.companywebsite.com"
                  />
                  <button type="submit" className="venue-btn dark" disabled={scraping}>
                    {scraping ? <Loader2 size={14} className="spin" /> : <Globe size={14} />}
                    <span>{scraping ? 'Fetching…' : 'Auto-Fetch'}</span>
                  </button>
                </div>
              </form>

              {scrapeResult && (
                <div
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 10,
                    padding: 12,
                    background: 'var(--surface-1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: `linear-gradient(90deg, ${scrapeResult.primaryColor}, ${scrapeResult.accentColor})`,
                    }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      className="venue-select"
                      value={scrapeResult.company}
                      onChange={(e) =>
                        setScrapeResult((r) => (r ? { ...r, company: e.target.value } : r))
                      }
                      placeholder="Company Name"
                    />
                    <input
                      className="venue-select"
                      value={scrapeResult.tagline}
                      onChange={(e) =>
                        setScrapeResult((r) => (r ? { ...r, tagline: e.target.value } : r))
                      }
                      placeholder="Tagline"
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>
                      Primary:
                      <input
                        type="color"
                        value={scrapeResult.primaryColor}
                        onChange={(e) =>
                          setScrapeResult((r) =>
                            r ? { ...r, primaryColor: e.target.value } : r
                          )
                        }
                        style={{ marginLeft: 6 }}
                      />
                    </label>
                    <label style={{ fontSize: 12, fontWeight: 600 }}>
                      Accent:
                      <input
                        type="color"
                        value={scrapeResult.accentColor}
                        onChange={(e) =>
                          setScrapeResult((r) =>
                            r ? { ...r, accentColor: e.target.value } : r
                          )
                        }
                        style={{ marginLeft: 6 }}
                      />
                    </label>
                    <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                      Source: {scrapeResult.source === 'live-scrape' ? 'Live Website Scrape' : 'Brand Registry Match'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="venue-btn primary full"
                    onClick={handleApplyScrapedBrand}
                  >
                    <Sparkles size={14} /> Apply Live Brand to Stand {targetStandId} in 3D
                  </button>
                </div>
              )}

              {scrapeNotice && <div className="venue-alert-card ok">{scrapeNotice}</div>}
            </>
          )}

          {/* TAB 4: WHITE-LABEL BRANDING & EMBED */}
          {tab === 'whitelabel' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Show Title
                  <input
                    className="venue-select"
                    value={showNameInput}
                    onChange={(e) => setShowNameInput(e.target.value)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Venue Location
                  <input
                    className="venue-select"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Organiser Brand Name
                  <input
                    className="venue-select"
                    value={themeForm.organizerName}
                    onChange={(e) =>
                      setThemeForm((t) => ({ ...t, organizerName: e.target.value }))
                    }
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Header Badge Label
                  <input
                    className="venue-select"
                    value={themeForm.badgeText || ''}
                    onChange={(e) => setThemeForm((t) => ({ ...t, badgeText: e.target.value }))}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Primary Button Color:
                  <input
                    type="color"
                    value={themeForm.primaryColor}
                    onChange={(e) =>
                      setThemeForm((t) => ({ ...t, primaryColor: e.target.value }))
                    }
                    style={{ marginLeft: 6 }}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  Accent Highlight Color:
                  <input
                    type="color"
                    value={themeForm.accentColor}
                    onChange={(e) =>
                      setThemeForm((t) => ({ ...t, accentColor: e.target.value }))
                    }
                    style={{ marginLeft: 6 }}
                  />
                </label>
                <button
                  type="button"
                  className="venue-btn primary"
                  onClick={() => {
                    onUpdateTheme(themeForm, showNameInput, locationInput);
                    onClose();
                  }}
                >
                  Apply White-Label Theme
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Code2 size={13} /> Host on Your Exhibition Website (Embed Snippet)
                  </span>
                  <button type="button" className="venue-btn" onClick={handleCopyEmbed}>
                    {copiedEmbed ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedEmbed ? 'Copied!' : 'Copy Embed'}</span>
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 10,
                    borderRadius: 8,
                    background: '#111315',
                    color: '#e5e7eb',
                    fontSize: 11.5,
                    overflowX: 'auto',
                  }}
                >
                  {embedSnippet}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
