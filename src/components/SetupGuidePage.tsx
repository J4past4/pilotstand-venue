import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  Compass,
  FileImage,
  Globe,
  Image as ImageIcon,
  Layers,
  Palette,
  Play,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { COLOR_PALETTES } from '../data/palettes';
import type {
  BrandAsset,
  BrandKitSetupResult,
  FloorMaterial,
  LightingPreset,
  StandConfig,
} from '../types/stand';
import {
  BRAND_FONT_PAIRINGS,
  ensureGoogleFontPairingLoaded,
  readBrandImageFile,
  registerCustomFontFile,
} from '../utils/brandKit';
import { isSupportedModelFile } from '../engine/modelLoader';

interface SetupGuidePageProps {
  initialConfig: StandConfig;
  initialAssets: BrandAsset[];
  onComplete: (result: BrandKitSetupResult) => void;
  onSkipDemo: () => void;
}

const FLOOR_OPTIONS: { id: FloorMaterial; label: string; color: string }[] = [
  { id: 'oak-timber', label: 'Oak Timber', color: '#B8956A' },
  { id: 'charcoal-carpet', label: 'Charcoal Carpet', color: '#2B2F36' },
  { id: 'light-concrete', label: 'Polished Concrete', color: '#D8D5CE' },
  { id: 'navy-carpet', label: 'Navy Carpet', color: '#1E334D' },
  { id: 'slate-tile', label: 'Slate Tile', color: '#3A3E44' },
  { id: 'brand-carpet', label: 'Brand-Matched Carpet', color: '#1B365D' },
];

const LIGHTING_OPTIONS: { id: LightingPreset; label: string; desc: string }[] = [
  { id: 'expo-hall', label: 'Expo Hall', desc: 'Crisp overhead exhibition hall wash' },
  { id: 'daylight', label: 'Architectural Daylight', desc: 'Bright skylight gallery ambience' },
  { id: 'dramatic', label: 'Keynote Spotlight', desc: 'High-contrast theatrical spotlighting' },
];

const STEPS = [
  { num: '01', title: 'Identity & Fonts', icon: Type },
  { num: '02', title: 'Colours & Finish', icon: Palette },
  { num: '03', title: 'Brand Assets', icon: Upload },
  { num: '04', title: 'Launch Pavilion', icon: Play },
] as const;

export const SetupGuidePage: React.FC<SetupGuidePageProps> = ({
  initialConfig,
  initialAssets,
  onComplete,
  onSkipDemo,
}) => {
  const [step, setStep] = useState<number>(0);

  // Step 1: Identity & Typography
  const [brandName, setBrandName] = useState(
    initialConfig.brandName && initialConfig.brandName !== 'NEXUS' ? initialConfig.brandName : ''
  );
  const [brandTagline, setBrandTagline] = useState(
    initialConfig.brandTagline && initialConfig.brandTagline !== 'Modular Architecture & Precision Systems'
      ? initialConfig.brandTagline
      : ''
  );
  const [websiteUrl, setWebsiteUrl] = useState(initialConfig.websiteUrl || '');
  const [eventName, setEventName] = useState(initialConfig.eventName || '');
  const [standNumber, setStandNumber] = useState(initialConfig.standNumber || '');
  const [displayFont, setDisplayFont] = useState(initialConfig.displayFont || 'Plus Jakarta Sans');
  const [bodyFont, setBodyFont] = useState(initialConfig.bodyFont || 'Inter');
  const [customFontLoaded, setCustomFontLoaded] = useState<string | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);

  // Step 2: Colours & Atmosphere
  const [primaryColor, setPrimaryColor] = useState(initialConfig.primaryColor || '#1B365D');
  const [accentColor, setAccentColor] = useState(initialConfig.accentColor || '#D95D39');
  const [wallColor, setWallColor] = useState(initialConfig.wallColor || '#F4F3EF');
  const [floorMaterial, setFloorMaterial] = useState<FloorMaterial>(
    initialConfig.floorMaterial || 'oak-timber'
  );
  const [floorColor, setFloorColor] = useState(initialConfig.floorColor || '#B8956A');
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>(
    initialConfig.lightingPreset || 'expo-hall'
  );

  // Step 3: Existing Brand Assets
  const [logoAsset, setLogoAsset] = useState<BrandAsset | null>(
    () => initialAssets.find((a) => a.kind === 'uploaded' && a.category === 'logo') || null
  );
  const [faviconDataUrl, setFaviconDataUrl] = useState<string | null>(
    initialConfig.faviconDataUrl || null
  );
  const [faviconName, setFaviconName] = useState<string>('');
  const [heroAsset, setHeroAsset] = useState<BrandAsset | null>(
    () => initialAssets.find((a) => a.kind === 'uploaded' && a.category === 'banner') || null
  );
  const [screenAsset, setScreenAsset] = useState<BrandAsset | null>(
    () => initialAssets.find((a) => a.kind === 'uploaded' && a.category === 'screen') || null
  );
  const [extraAssets, setExtraAssets] = useState<BrandAsset[]>(() =>
    initialAssets.filter((a) => a.kind === 'uploaded')
  );
  const [customModelFiles, setCustomModelFiles] = useState<File[]>([]);
  const [brandNotes, setBrandNotes] = useState(initialConfig.brandNotes || '');

  const fontInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);
  const heroInputRef = useRef<HTMLInputElement | null>(null);
  const screenInputRef = useRef<HTMLInputElement | null>(null);
  const extraInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  // Load Google Fonts dynamically as user previews pairings
  useEffect(() => {
    ensureGoogleFontPairingLoaded(displayFont, bodyFont);
  }, [displayFont, bodyFont]);

  const effectiveBrand = brandName.trim() || 'YOUR BRAND';
  const effectiveTagline = brandTagline.trim() || 'Flagship Exhibition Showcase';
  const effectiveStandBadge = [eventName.trim(), standNumber.trim()].filter(Boolean).join(' · ');

  const handleUploadCustomFont = async (file: File) => {
    setFontError(null);
    try {
      const family = await registerCustomFontFile(file);
      setDisplayFont(family);
      setCustomFontLoaded(family);
    } catch {
      setFontError('Could not load font file. Please use .TTF, .OTF, .WOFF, or .WOFF2.');
    }
  };

  const handleUploadSingleImage = async (
    file: File,
    slot: 'logo' | 'hero' | 'screen'
  ) => {
    if (!file.type.startsWith('image/')) return;
    const category = slot === 'logo' ? 'logo' : slot === 'screen' ? 'screen' : 'banner';
    const asset = await readBrandImageFile(file, category);
    if (slot === 'logo') setLogoAsset(asset);
    else if (slot === 'hero') setHeroAsset(asset);
    else setScreenAsset(asset);
  };

  const handleUploadFavicon = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setFaviconDataUrl(String(reader.result || ''));
      setFaviconName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadExtraImages = async (files: FileList) => {
    const loaded: BrandAsset[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        loaded.push(await readBrandImageFile(file, 'banner'));
      } catch {
        // skip invalid
      }
    }
    if (loaded.length > 0) {
      setExtraAssets((prev) => [...loaded, ...prev]);
    }
  };

  const handleUploadModelFiles = (files: FileList) => {
    const valid = Array.from(files).filter(isSupportedModelFile);
    if (valid.length > 0) {
      setCustomModelFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleLaunch = (startTour: boolean) => {
    onComplete({
      brandName: brandName.trim() || 'AURELIA STUDIO',
      brandTagline: brandTagline.trim() || 'Architectural Systems & Live Demonstrations',
      websiteUrl: websiteUrl.trim(),
      eventName: eventName.trim(),
      standNumber: standNumber.trim(),
      brandNotes: brandNotes.trim(),
      displayFont,
      bodyFont,
      primaryColor,
      accentColor,
      wallColor,
      floorMaterial,
      floorColor: floorMaterial === 'brand-carpet' ? primaryColor : floorColor,
      lightingPreset,
      faviconDataUrl,
      logoAsset,
      heroAsset,
      screenAsset,
      extraAssets,
      customModelFiles,
      startTour,
    });
  };

  const totalAssetCount =
    (logoAsset ? 1 : 0) +
    (faviconDataUrl ? 1 : 0) +
    (heroAsset ? 1 : 0) +
    (screenAsset ? 1 : 0) +
    extraAssets.length +
    customModelFiles.length;

  return (
    <div className="setup-page" id="setup-guide-page">
      {/* Top Editorial Navigation Rail */}
      <header className="setup-header">
        <div className="setup-brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none">
              <path
                d="M4 17.5V7.5L12 3.5L20 7.5V17.5L12 21L4 17.5Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M12 11.5L20 7.5M12 11.5L4 7.5M12 11.5V21"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <span className="setup-brand-name">StandCraft Studio</span>
            <span className="setup-brand-sub">Exhibition Setup Guide</span>
          </div>
        </div>

        <nav className="setup-stepper" aria-label="Setup steps">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const active = idx === step;
            const done = idx < step;
            return (
              <button
                key={s.num}
                id={`setup-step-btn-${idx}`}
                className={`setup-step-pill ${active ? 'active' : ''} ${done ? 'done' : ''}`}
                onClick={() => setStep(idx)}
              >
                <span className="setup-step-num mono-num">
                  {done ? <Check size={12} /> : s.num}
                </span>
                <Icon size={13} />
                <span>{s.title}</span>
              </button>
            );
          })}
        </nav>

        <button id="btn-skip-setup" className="setup-skip-btn" onClick={onSkipDemo}>
          <span>Skip &amp; Explore Demo</span>
          <ArrowRight size={14} />
        </button>
      </header>

      {/* Main Split Editorial Workspace */}
      <div className="setup-body">
        {/* Left: Guided Form */}
        <section className="setup-form-pane">
          <div className="setup-form-scroll">
            {step === 0 && (
              <div className="setup-step-panel" key="step-0">
                <div className="setup-eyebrow mono-num">STEP 01 / 04 · BRAND IDENTITY</div>
                <h1 className="setup-title">Set up your company brand kit</h1>
                <p className="setup-subtitle">
                  Tell us who you are and choose your typography. We will dress your flagship 8m × 6m
                  exhibition pavilion with your identity automatically before your 30-second studio tour.
                </p>

                <div className="setup-field-grid">
                  <label className="setup-field setup-field-full">
                    <span className="setup-label">Company / Brand Name</span>
                    <input
                      id="setup-brand-name"
                      type="text"
                      placeholder="e.g. Aurelia Robotics, Northstar Bio, Studio Kova"
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      autoFocus
                    />
                  </label>

                  <label className="setup-field setup-field-full">
                    <span className="setup-label">Headline / Exhibition Tagline</span>
                    <input
                      id="setup-brand-tagline"
                      type="text"
                      placeholder="e.g. Precision Modular Systems for Modern Industry"
                      value={brandTagline}
                      onChange={(e) => setBrandTagline(e.target.value)}
                    />
                  </label>

                  <label className="setup-field">
                    <span className="setup-label">Event / Trade Show (Optional)</span>
                    <input
                      id="setup-event-name"
                      type="text"
                      placeholder="e.g. EuroShop 2026"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                    />
                  </label>

                  <label className="setup-field">
                    <span className="setup-label">Hall &amp; Stand Number (Optional)</span>
                    <input
                      id="setup-stand-number"
                      type="text"
                      placeholder="e.g. Hall 4 · Stand B18"
                      value={standNumber}
                      onChange={(e) => setStandNumber(e.target.value)}
                    />
                  </label>

                  <label className="setup-field setup-field-full">
                    <span className="setup-label">Company Website (Optional)</span>
                    <div className="setup-input-icon-wrap">
                      <Globe size={15} />
                      <input
                        id="setup-website-url"
                        type="url"
                        placeholder="https://yourcompany.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                      />
                    </div>
                  </label>
                </div>

                <div className="setup-section-divider" />

                <div className="setup-section-head">
                  <div>
                    <h2 className="setup-h2">Brand Typography</h2>
                    <p className="setup-hint">
                      Select a curated display &amp; body pairing, or upload your own brand font file.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="setup-upload-chip"
                    onClick={() => fontInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    <span>Upload .TTF / .WOFF2</span>
                  </button>
                  <input
                    ref={fontInputRef}
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadCustomFont(f);
                      e.target.value = '';
                    }}
                  />
                </div>

                {customFontLoaded && (
                  <div className="setup-inline-notice ok">
                    <CheckCircle2 size={14} />
                    <span>
                      Custom font <strong>{customFontLoaded}</strong> loaded and applied to 3D signage.
                    </span>
                  </div>
                )}
                {fontError && <div className="setup-inline-notice warn">{fontError}</div>}

                <div className="setup-font-grid">
                  {BRAND_FONT_PAIRINGS.map((pair) => {
                    const selected = displayFont === pair.displayFont && bodyFont === pair.bodyFont;
                    return (
                      <button
                        key={pair.id}
                        type="button"
                        className={`setup-font-card ${selected ? 'selected' : ''}`}
                        onClick={() => {
                          setDisplayFont(pair.displayFont);
                          setBodyFont(pair.bodyFont);
                          setCustomFontLoaded(null);
                        }}
                      >
                        <div className="setup-font-card-top">
                          <span className="setup-font-tag">{pair.styleTag}</span>
                          {selected && <Check size={14} className="setup-font-check" />}
                        </div>
                        <div
                          className="setup-font-specimen"
                          style={{ fontFamily: `"${pair.displayFont}", sans-serif` }}
                        >
                          {effectiveBrand.slice(0, 14)}
                        </div>
                        <div
                          className="setup-font-meta"
                          style={{ fontFamily: `"${pair.bodyFont}", sans-serif` }}
                        >
                          {pair.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="setup-step-panel" key="step-1">
                <div className="setup-eyebrow mono-num">STEP 02 / 04 · COLOUR SYSTEM &amp; FINISH</div>
                <h1 className="setup-title">Define your brand colours &amp; hall mood</h1>
                <p className="setup-subtitle">
                  Enter your exact hex codes or start from an architectural studio palette. These drive
                  your overhead halo, arch fascia, backlit walls, and flooring materials.
                </p>

                <div className="setup-color-pickers">
                  <div className="setup-color-card">
                    <span className="setup-label">Primary Brand Colour</span>
                    <div className="setup-color-row">
                      <input
                        id="setup-primary-color"
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                      <input
                        type="text"
                        className="mono-num"
                        value={primaryColor.toUpperCase()}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                      />
                    </div>
                    <span className="setup-micro">Fascia, counters, signage &amp; backlit graphics</span>
                  </div>

                  <div className="setup-color-card">
                    <span className="setup-label">Secondary / Accent</span>
                    <div className="setup-color-row">
                      <input
                        id="setup-accent-color"
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                      />
                      <input
                        type="text"
                        className="mono-num"
                        value={accentColor.toUpperCase()}
                        onChange={(e) => setAccentColor(e.target.value)}
                      />
                    </div>
                    <span className="setup-micro">Highlight strips, callouts &amp; LED trims</span>
                  </div>

                  <div className="setup-color-card">
                    <span className="setup-label">Architectural Wall Tone</span>
                    <div className="setup-color-row">
                      <input
                        id="setup-wall-color"
                        type="color"
                        value={wallColor}
                        onChange={(e) => setWallColor(e.target.value)}
                      />
                      <input
                        type="text"
                        className="mono-num"
                        value={wallColor.toUpperCase()}
                        onChange={(e) => setWallColor(e.target.value)}
                      />
                    </div>
                    <span className="setup-micro">Structural cabins, frames &amp; counter bodies</span>
                  </div>
                </div>

                <div className="setup-section-head" style={{ marginTop: 22 }}>
                  <h2 className="setup-h2">Quick Architectural Palettes</h2>
                </div>
                <div className="setup-palette-grid">
                  {COLOR_PALETTES.map((pal) => {
                    const active =
                      pal.primaryColor.toLowerCase() === primaryColor.toLowerCase() &&
                      pal.accentColor.toLowerCase() === accentColor.toLowerCase();
                    return (
                      <button
                        key={pal.id}
                        type="button"
                        className={`setup-palette-card ${active ? 'selected' : ''}`}
                        onClick={() => {
                          setPrimaryColor(pal.primaryColor);
                          setAccentColor(pal.accentColor);
                          setWallColor(pal.wallColor);
                          setFloorMaterial(pal.floorMaterial);
                          setFloorColor(pal.floorColor);
                        }}
                      >
                        <div className="setup-palette-swatches">
                          <span style={{ background: pal.primaryColor }} />
                          <span style={{ background: pal.accentColor }} />
                          <span style={{ background: pal.wallColor }} />
                          <span style={{ background: pal.floorColor }} />
                        </div>
                        <div className="setup-palette-name">{pal.name}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="setup-section-divider" />

                <div className="setup-two-col">
                  <div>
                    <h2 className="setup-h2">Pavilion Flooring</h2>
                    <div className="setup-floor-grid">
                      {FLOOR_OPTIONS.map((fl) => (
                        <button
                          key={fl.id}
                          type="button"
                          className={`setup-floor-chip ${floorMaterial === fl.id ? 'selected' : ''}`}
                          onClick={() => {
                            setFloorMaterial(fl.id);
                            setFloorColor(fl.id === 'brand-carpet' ? primaryColor : fl.color);
                          }}
                        >
                          <span
                            className="setup-floor-dot"
                            style={{
                              background: fl.id === 'brand-carpet' ? primaryColor : fl.color,
                            }}
                          />
                          <span>{fl.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h2 className="setup-h2">Hall Lighting</h2>
                    <div className="setup-lighting-stack">
                      {LIGHTING_OPTIONS.map((li) => (
                        <button
                          key={li.id}
                          type="button"
                          className={`setup-lighting-card ${lightingPreset === li.id ? 'selected' : ''}`}
                          onClick={() => setLightingPreset(li.id)}
                        >
                          <div className="setup-lighting-title">{li.label}</div>
                          <div className="setup-lighting-desc">{li.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="setup-step-panel" key="step-2">
                <div className="setup-eyebrow mono-num">STEP 03 / 04 · EXISTING ASSETS &amp; MEDIA</div>
                <h1 className="setup-title">Drop in any assets you already have</h1>
                <p className="setup-subtitle">
                  Everything here is optional — upload your logo, favicon, campaign visuals, product
                  shots, or 3D models. We map them onto your pavilion automatically and store extras in
                  your Brand Library.
                </p>

                <div className="setup-drop-grid">
                  {/* Primary Logo */}
                  <div
                    className={`setup-dropzone ${logoAsset ? 'filled' : ''}`}
                    onClick={() => logoInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleUploadSingleImage(f, 'logo');
                    }}
                  >
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/svg+xml,image/png,image/webp,image/jpeg"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadSingleImage(f, 'logo');
                        e.target.value = '';
                      }}
                    />
                    {logoAsset ? (
                      <div className="setup-drop-preview">
                        <img src={logoAsset.dataUrl} alt="Primary logo preview" />
                        <div className="setup-drop-meta">
                          <strong>Primary Logo</strong>
                          <span>{logoAsset.name}</span>
                        </div>
                        <button
                          type="button"
                          className="setup-drop-clear"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLogoAsset(null);
                          }}
                          title="Remove logo"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="setup-drop-empty">
                        <Sparkles size={18} />
                        <strong>Primary Logo</strong>
                        <span>SVG, transparent PNG · Mapped to Halo, Arch &amp; Counter</span>
                      </div>
                    )}
                  </div>

                  {/* Favicon */}
                  <div
                    className={`setup-dropzone ${faviconDataUrl ? 'filled' : ''}`}
                    onClick={() => faviconInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleUploadFavicon(f);
                    }}
                  >
                    <input
                      ref={faviconInputRef}
                      type="file"
                      accept=".ico,image/png,image/svg+xml,image/x-icon"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadFavicon(f);
                        e.target.value = '';
                      }}
                    />
                    {faviconDataUrl ? (
                      <div className="setup-drop-preview">
                        <img
                          src={faviconDataUrl}
                          alt="Favicon preview"
                          className="setup-favicon-thumb"
                        />
                        <div className="setup-drop-meta">
                          <strong>Favicon / Mark</strong>
                          <span>{faviconName || 'Active in browser tab'}</span>
                        </div>
                        <button
                          type="button"
                          className="setup-drop-clear"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFaviconDataUrl(null);
                            setFaviconName('');
                          }}
                          title="Remove favicon"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="setup-drop-empty">
                        <Globe size={18} />
                        <strong>Favicon / Icon Mark</strong>
                        <span>ICO, PNG, SVG · Applied to workspace tab &amp; brand kit</span>
                      </div>
                    )}
                  </div>

                  {/* Hero Campaign Image */}
                  <div
                    className={`setup-dropzone ${heroAsset ? 'filled' : ''}`}
                    onClick={() => heroInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleUploadSingleImage(f, 'hero');
                    }}
                  >
                    <input
                      ref={heroInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadSingleImage(f, 'hero');
                        e.target.value = '';
                      }}
                    />
                    {heroAsset ? (
                      <div className="setup-drop-preview">
                        <img src={heroAsset.dataUrl} alt="Hero mural preview" />
                        <div className="setup-drop-meta">
                          <strong>Hero Campaign Mural</strong>
                          <span>{heroAsset.name}</span>
                        </div>
                        <button
                          type="button"
                          className="setup-drop-clear"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHeroAsset(null);
                          }}
                          title="Remove hero mural"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="setup-drop-empty">
                        <ImageIcon size={18} />
                        <strong>Hero Wall / Banner Artwork</strong>
                        <span>JPG, PNG, WebP · Mapped to SEG Lightboxes &amp; Totems</span>
                      </div>
                    )}
                  </div>

                  {/* LED Screen / Product Visual */}
                  <div
                    className={`setup-dropzone ${screenAsset ? 'filled' : ''}`}
                    onClick={() => screenInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleUploadSingleImage(f, 'screen');
                    }}
                  >
                    <input
                      ref={screenInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadSingleImage(f, 'screen');
                        e.target.value = '';
                      }}
                    />
                    {screenAsset ? (
                      <div className="setup-drop-preview">
                        <img src={screenAsset.dataUrl} alt="LED screen visual preview" />
                        <div className="setup-drop-meta">
                          <strong>LED Video Wall Visual</strong>
                          <span>{screenAsset.name}</span>
                        </div>
                        <button
                          type="button"
                          className="setup-drop-clear"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScreenAsset(null);
                          }}
                          title="Remove screen visual"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="setup-drop-empty">
                        <FileImage size={18} />
                        <strong>LED Screen / Product UI</strong>
                        <span>16:9 image · Mapped to 3.8m LED Video Wall &amp; 55" Display</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Extra Media & 3D Models */}
                <div className="setup-extra-row">
                  <button
                    type="button"
                    className="setup-extra-btn"
                    onClick={() => extraInputRef.current?.click()}
                  >
                    <Layers size={15} />
                    <div>
                      <strong>Additional Brand Images ({extraAssets.length})</strong>
                      <span>Product photos, textures, patterns for 1-click surface painting</span>
                    </div>
                    <Upload size={14} />
                  </button>
                  <input
                    ref={extraInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files) void handleUploadExtraImages(e.target.files);
                      e.target.value = '';
                    }}
                  />

                  <button
                    type="button"
                    className="setup-extra-btn"
                    onClick={() => modelInputRef.current?.click()}
                  >
                    <Box size={15} />
                    <div>
                      <strong>Existing 3D Models ({customModelFiles.length})</strong>
                      <span>.GLB, .GLTF, .STL, .OBJ — loaded straight into your stand</span>
                    </div>
                    <Upload size={14} />
                  </button>
                  <input
                    ref={modelInputRef}
                    type="file"
                    accept=".glb,.gltf,.stl,.obj"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files) handleUploadModelFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </div>

                {extraAssets.length > 0 && (
                  <div className="setup-thumb-strip">
                    {extraAssets.map((a) => (
                      <div key={a.id} className="setup-mini-thumb">
                        <img src={a.dataUrl} alt={a.name} />
                        <button
                          type="button"
                          onClick={() =>
                            setExtraAssets((prev) => prev.filter((x) => x.id !== a.id))
                          }
                          title={`Remove ${a.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <label className="setup-field setup-field-full" style={{ marginTop: 16 }}>
                  <span className="setup-label">Brand Guidelines or Stand Brief Notes (Optional)</span>
                  <textarea
                    id="setup-brand-notes"
                    rows={2}
                    placeholder="e.g. Prioritize open hospitality lounge, showcase 2 hardware prototypes, keep warm oak aesthetic..."
                    value={brandNotes}
                    onChange={(e) => setBrandNotes(e.target.value)}
                  />
                </label>
              </div>
            )}

            {step === 3 && (
              <div className="setup-step-panel" key="step-3">
                <div className="setup-eyebrow mono-num">STEP 04 / 04 · READY FOR STUDIO</div>
                <h1 className="setup-title">Your flagship pavilion is ready</h1>
                <p className="setup-subtitle">
                  We have prepared your extravagant 8m × 6m Grand Flagship Pavilion branded with your
                  colours, typography, and assets. Launch now for a guided 30-second animated tour of
                  the environment and studio tools.
                </p>

                <div className="setup-summary-grid">
                  <div className="setup-summary-card">
                    <span className="setup-summary-k mono-num">IDENTITY</span>
                    <strong style={{ fontFamily: `"${displayFont}", sans-serif` }}>
                      {effectiveBrand}
                    </strong>
                    <span>{effectiveTagline}</span>
                    {effectiveStandBadge && (
                      <span className="setup-summary-badge mono-num">{effectiveStandBadge}</span>
                    )}
                  </div>

                  <div className="setup-summary-card">
                    <span className="setup-summary-k mono-num">TYPOGRAPHY &amp; PALETTE</span>
                    <strong>
                      {displayFont} / {bodyFont}
                    </strong>
                    <div className="setup-summary-swatches">
                      <span style={{ background: primaryColor }} title={primaryColor} />
                      <span style={{ background: accentColor }} title={accentColor} />
                      <span style={{ background: wallColor }} title={wallColor} />
                      <span style={{ background: floorColor }} title={floorMaterial} />
                    </div>
                  </div>

                  <div className="setup-summary-card">
                    <span className="setup-summary-k mono-num">ASSETS LOADED</span>
                    <strong>
                      {totalAssetCount === 0
                        ? 'Procedural Brand Graphics'
                        : `${totalAssetCount} Brand Asset${totalAssetCount === 1 ? '' : 's'}`}
                    </strong>
                    <span>
                      {[
                        logoAsset && 'Logo',
                        faviconDataUrl && 'Favicon',
                        heroAsset && 'Hero Mural',
                        screenAsset && 'LED Visual',
                        extraAssets.length > 0 && `+${extraAssets.length} Media`,
                        customModelFiles.length > 0 && `+${customModelFiles.length} 3D`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Dynamic typography & colour surfaces ready'}
                    </span>
                  </div>

                  <div className="setup-summary-card">
                    <span className="setup-summary-k mono-num">STARTER PAVILION</span>
                    <strong>Grand Flagship Pavilion</strong>
                    <span>8m × 6m (48 m²) · 4 Open Sides · 30 Architectural Elements</span>
                  </div>
                </div>

                <div className="setup-launch-box">
                  <div className="setup-launch-info">
                    <Compass size={18} />
                    <div>
                      <strong>2:30 Guided Walkthrough Video Included</strong>
                      <span>
                        A step-by-step popup walkthrough shows building a stand from scratch—uploading
                        branding, placing &amp; moving assets, switching 3D/2D/Visitor views, and
                        exporting briefs.
                      </span>
                    </div>
                  </div>

                  <div className="setup-launch-actions">
                    <button
                      id="btn-launch-with-tour"
                      type="button"
                      className="setup-btn-primary"
                      onClick={() => handleLaunch(true)}
                    >
                      <Play size={15} />
                      <span>Launch Pavilion &amp; 2:30 Walkthrough</span>
                    </button>
                    <button
                      id="btn-launch-direct"
                      type="button"
                      className="setup-btn-secondary"
                      onClick={() => handleLaunch(false)}
                    >
                      <span>Enter Studio Directly</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Step Navigation Footer */}
          <footer className="setup-form-footer">
            <button
              type="button"
              className="setup-nav-back"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>

            <span className="setup-step-counter mono-num">
              {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
            </span>

            {step < STEPS.length - 1 ? (
              <button
                id="btn-setup-next"
                type="button"
                className="setup-nav-next"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              >
                <span>Continue</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="setup-nav-next"
                onClick={() => handleLaunch(true)}
              >
                <Play size={14} />
                <span>Launch &amp; Tour</span>
              </button>
            )}
          </footer>
        </section>

        {/* Right: Live Architectural Brand Board Preview */}
        <aside className="setup-preview-pane" aria-label="Live brand kit preview">
          <div className="setup-preview-inner">
            <div className="setup-preview-top">
              <span className="setup-preview-label mono-num">LIVE BRAND BOARD</span>
              <span className="setup-preview-spec mono-num">8m × 6m · 48 m² ISLAND</span>
            </div>

            {/* Simulated Browser Tab with Favicon */}
            <div className="setup-browser-chrome">
              <div className="setup-browser-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="setup-browser-tab">
                {faviconDataUrl ? (
                  <img src={faviconDataUrl} alt="" className="setup-browser-favicon" />
                ) : (
                  <span
                    className="setup-browser-favicon-fallback"
                    style={{ background: primaryColor }}
                  />
                )}
                <span>{effectiveBrand} — StandCraft Studio</span>
              </div>
            </div>

            {/* Hero Pavilion Fascia & Wall Composition */}
            <div
              className="setup-board-hero"
              style={{
                background: primaryColor,
              }}
            >
              {heroAsset && (
                <img
                  src={heroAsset.dataUrl}
                  alt=""
                  className="setup-board-hero-bg"
                />
              )}
              <div
                className="setup-board-hero-scrim"
                style={{
                  background: heroAsset
                    ? `linear-gradient(120deg, ${primaryColor}E6 0%, ${primaryColor}99 55%, ${primaryColor}44 100%)`
                    : `linear-gradient(135deg, ${primaryColor} 0%, #0F172A 130%)`,
                }}
              />
              <div className="setup-board-hero-content">
                <div className="setup-board-accent-bar" style={{ background: accentColor }} />
                {logoAsset ? (
                  <img
                    src={logoAsset.dataUrl}
                    alt={effectiveBrand}
                    className="setup-board-logo-img"
                  />
                ) : (
                  <div
                    className="setup-board-wordmark"
                    style={{ fontFamily: `"${displayFont}", sans-serif` }}
                  >
                    {effectiveBrand}
                  </div>
                )}
                <div
                  className="setup-board-tagline"
                  style={{ fontFamily: `"${bodyFont}", sans-serif` }}
                >
                  {effectiveTagline}
                </div>
                {effectiveStandBadge && (
                  <div
                    className="setup-board-badge mono-num"
                    style={{ background: accentColor }}
                  >
                    {effectiveStandBadge}
                  </div>
                )}
              </div>
            </div>

            {/* Live Colour Swatch Strip */}
            <div className="setup-board-swatches">
              <div className="setup-swatch-item">
                <div className="setup-swatch-chip" style={{ background: primaryColor }} />
                <span className="setup-swatch-role">Primary</span>
                <span className="setup-swatch-hex mono-num">{primaryColor.toUpperCase()}</span>
              </div>
              <div className="setup-swatch-item">
                <div className="setup-swatch-chip" style={{ background: accentColor }} />
                <span className="setup-swatch-role">Accent</span>
                <span className="setup-swatch-hex mono-num">{accentColor.toUpperCase()}</span>
              </div>
              <div className="setup-swatch-item">
                <div className="setup-swatch-chip" style={{ background: wallColor }} />
                <span className="setup-swatch-role">Surface</span>
                <span className="setup-swatch-hex mono-num">{wallColor.toUpperCase()}</span>
              </div>
              <div className="setup-swatch-item">
                <div
                  className="setup-swatch-chip"
                  style={{
                    background: floorMaterial === 'brand-carpet' ? primaryColor : floorColor,
                  }}
                />
                <span className="setup-swatch-role">Floor</span>
                <span className="setup-swatch-hex mono-num">
                  {FLOOR_OPTIONS.find((f) => f.id === floorMaterial)?.label.split(' ')[0]}
                </span>
              </div>
            </div>

            {/* Asset Readiness Checklist */}
            <div className="setup-board-checklist">
              <div className="setup-checklist-title mono-num">BRAND KIT INVENTORY</div>
              <div className="setup-checklist-grid">
                <div className={`setup-check-item ${brandName.trim() ? 'ready' : ''}`}>
                  <CheckCircle2 size={13} />
                  <span>Company Identity</span>
                </div>
                <div className="setup-check-item ready">
                  <CheckCircle2 size={13} />
                  <span>{displayFont}</span>
                </div>
                <div className={`setup-check-item ${logoAsset ? 'ready' : ''}`}>
                  <CheckCircle2 size={13} />
                  <span>Primary Logo</span>
                </div>
                <div className={`setup-check-item ${faviconDataUrl ? 'ready' : ''}`}>
                  <CheckCircle2 size={13} />
                  <span>Favicon Mark</span>
                </div>
                <div className={`setup-check-item ${heroAsset ? 'ready' : ''}`}>
                  <CheckCircle2 size={13} />
                  <span>Hero Artwork</span>
                </div>
                <div className={`setup-check-item ${screenAsset ? 'ready' : ''}`}>
                  <CheckCircle2 size={13} />
                  <span>LED Screen Media</span>
                </div>
              </div>
            </div>

            {/* Pavilion Architecture Footnote */}
            <div className="setup-board-footnote">
              <div>
                <strong>Grand Flagship Pavilion</strong>
                <span>
                  4.2m Suspended Halo · Brand Arch · 3.8m LED Video Wall · Twin Lightboxes · VIP
                  Lounge &amp; Executive Suite
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
