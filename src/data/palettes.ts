import type { BrandAsset, ColorPalettePreset } from '../types/stand';

export const COLOR_PALETTES: ColorPalettePreset[] = [
  {
    id: 'nordic-slate',
    name: 'Architectural Slate',
    description: 'Deep marine slate with warm terracotta accents and oak timber flooring',
    primaryColor: '#1B365D',
    accentColor: '#D95D39',
    wallColor: '#F4F3EF',
    floorMaterial: 'oak-timber',
    floorColor: '#B8956A',
    trimColor: '#C5C9CE',
  },
  {
    id: 'obsidian-amber',
    name: 'Obsidian & Brass',
    description: 'Executive matte charcoal backdrop with warm amber gold highlights',
    primaryColor: '#1E2229',
    accentColor: '#D99B26',
    wallColor: '#272C35',
    floorMaterial: 'charcoal-carpet',
    floorColor: '#2B2F36',
    trimColor: '#A8A29E',
  },
  {
    id: 'botanical-sage',
    name: 'Botanical Sage',
    description: 'Organic forest green & warm stone for sustainability and wellness brands',
    primaryColor: '#1F4E46',
    accentColor: '#E07A5F',
    wallColor: '#F6F4EE',
    floorMaterial: 'light-concrete',
    floorColor: '#D8D5CE',
    trimColor: '#BFC4BE',
  },
  {
    id: 'oceanic-tech',
    name: 'Oceanic Precision',
    description: 'Clean cobalt-blue engineering palette with crisp alabaster walls',
    primaryColor: '#0F4C81',
    accentColor: '#00A6A6',
    wallColor: '#F8FAFC',
    floorMaterial: 'navy-carpet',
    floorColor: '#1E334D',
    trimColor: '#CBD5E1',
  },
  {
    id: 'crimson-studio',
    name: 'Swiss Signal',
    description: 'High-impact architectural vermilion red on crisp monochrome gallery surfaces',
    primaryColor: '#C82829',
    accentColor: '#1C1E21',
    wallColor: '#FFFFFF',
    floorMaterial: 'slate-tile',
    floorColor: '#3A3E44',
    trimColor: '#D1D5DB',
  },
  {
    id: 'sandstone-minimal',
    name: 'Warm Sandstone',
    description: 'Quiet luxury limestone tones with espresso wood and bronze trim',
    primaryColor: '#4A3F35',
    accentColor: '#C08552',
    wallColor: '#F5EFE6',
    floorMaterial: 'oak-timber',
    floorColor: '#C4A47C',
    trimColor: '#B8A898',
  },
];

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

export const BUILTIN_BRAND_ASSETS: BrandAsset[] = [
  {
    id: 'preset-hero-mural',
    name: 'Hero Campaign Mural',
    kind: 'preset',
    category: 'banner',
    width: 1600,
    height: 1000,
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#13294B"/>
            <stop offset="55%" stop-color="#1B3A63"/>
            <stop offset="100%" stop-color="#0E1E38"/>
          </linearGradient>
          <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#E86A42"/>
            <stop offset="100%" stop-color="#F29E4C"/>
          </linearGradient>
        </defs>
        <rect width="1600" height="1000" fill="url(#bg)"/>
        <circle cx="1320" cy="240" r="420" fill="#254E80" opacity="0.45"/>
        <circle cx="1380" cy="760" r="290" fill="#D95D39" opacity="0.24"/>
        <path d="M 960 0 L 1600 0 L 1600 1000 L 1180 1000 Z" fill="#FFFFFF" opacity="0.04"/>
        <rect x="110" y="130" width="96" height="10" rx="5" fill="url(#accent)"/>
        <text x="110" y="210" font-family="Plus Jakarta Sans, Inter, sans-serif" font-size="34" font-weight="700" letter-spacing="8" fill="#F29E4C">NEXUS ARCHITECTURE</text>
        <text x="110" y="385" font-family="Plus Jakarta Sans, Inter, sans-serif" font-size="112" font-weight="800" fill="#FFFFFF">Built for</text>
        <text x="110" y="510" font-family="Plus Jakarta Sans, Inter, sans-serif" font-size="112" font-weight="800" fill="#FFFFFF">Tomorrow's</text>
        <text x="110" y="635" font-family="Plus Jakarta Sans, Inter, sans-serif" font-size="112" font-weight="800" fill="#F29E4C">Spaces.</text>
        <text x="110" y="740" font-family="Inter, sans-serif" font-size="36" font-weight="400" fill="#CBD5E1">Modular precision systems · Carbon-neutral engineering · Live Demo</text>
        <g transform="translate(110, 815)">
          <rect width="310" height="68" rx="34" fill="#D95D39"/>
          <text x="155" y="44" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="26" font-weight="700" fill="#FFFFFF">HALL 4 · STAND B18</text>
        </g>
        <g transform="translate(1130, 310)" opacity="0.9">
          <rect x="0" y="0" width="330" height="390" rx="22" fill="#FFFFFF" fill-opacity="0.08" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="2"/>
          <rect x="34" y="42" width="120" height="120" rx="16" fill="#D95D39"/>
          <rect x="176" y="42" width="120" height="120" rx="16" fill="#FFFFFF" fill-opacity="0.16"/>
          <rect x="34" y="184" width="262" height="164" rx="16" fill="#FFFFFF" fill-opacity="0.12"/>
          <path d="M 64 295 L 122 238 L 178 268 L 260 208" fill="none" stroke="#F29E4C" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </svg>
    `),
  },
  {
    id: 'preset-company-logo',
    name: 'Brand Emblem Logo',
    kind: 'preset',
    category: 'logo',
    width: 1200,
    height: 500,
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 500">
        <g transform="translate(120, 125)">
          <rect x="0" y="0" width="220" height="220" rx="44" fill="#D95D39"/>
          <path d="M 55 162 L 55 58 L 110 112 L 165 58 L 165 162" fill="none" stroke="#FFFFFF" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="110" cy="158" r="14" fill="#FFFFFF"/>
        </g>
        <text x="390" y="238" font-family="Plus Jakarta Sans, Inter, sans-serif" font-size="118" font-weight="800" letter-spacing="4" fill="#FFFFFF">NEXUS</text>
        <text x="394" y="318" font-family="Inter, sans-serif" font-size="38" font-weight="500" letter-spacing="11" fill="#CBD5E1">INDUSTRIAL LABS</text>
      </svg>
    `),
  },
  {
    id: 'preset-product-screen',
    name: '4K Product Showcase Screen',
    kind: 'preset',
    category: 'screen',
    width: 1600,
    height: 900,
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
        <rect width="1600" height="900" fill="#0F172A"/>
        <rect x="48" y="44" width="1504" height="76" rx="14" fill="#1E293B"/>
        <circle cx="96" cy="82" r="12" fill="#EF4444"/>
        <circle cx="132" cy="82" r="12" fill="#F59E0B"/>
        <circle cx="168" cy="82" r="12" fill="#10B981"/>
        <text x="230" y="92" font-family="JetBrains Mono, monospace" font-size="24" fill="#94A3B8">NEXUS OS · LIVE TELEMETRY SHOWCASE</text>
        <rect x="1320" y="62" width="196" height="40" rx="20" fill="#D95D39"/>
        <text x="1418" y="89" text-anchor="middle" font-family="Inter, sans-serif" font-size="19" font-weight="700" fill="#FFFFFF">LIVE DEMO</text>
        <rect x="48" y="152" width="465" height="280" rx="20" fill="#1E293B"/>
        <text x="84" y="210" font-family="Inter, sans-serif" font-size="24" fill="#94A3B8">ENERGY EFFICIENCY</text>
        <text x="84" y="310" font-family="Plus Jakarta Sans, sans-serif" font-size="96" font-weight="800" fill="#FFFFFF">98.4%</text>
        <text x="84" y="380" font-family="Inter, sans-serif" font-size="24" fill="#34D399">+14.2% vs industry baseline</text>
        <rect x="545" y="152" width="465" height="280" rx="20" fill="#1E293B"/>
        <text x="581" y="210" font-family="Inter, sans-serif" font-size="24" fill="#94A3B8">DEPLOYMENT SPEED</text>
        <text x="581" y="310" font-family="Plus Jakarta Sans, sans-serif" font-size="96" font-weight="800" fill="#F29E4C">3.2x</text>
        <text x="581" y="380" font-family="Inter, sans-serif" font-size="24" fill="#CBD5E1">Tool-free modular assembly</text>
        <rect x="1042" y="152" width="510" height="280" rx="20" fill="#1E293B"/>
        <text x="1078" y="210" font-family="Inter, sans-serif" font-size="24" fill="#94A3B8">GLOBAL INSTALLATIONS</text>
        <text x="1078" y="310" font-family="Plus Jakarta Sans, sans-serif" font-size="96" font-weight="800" fill="#38BDF8">14,200+</text>
        <text x="1078" y="380" font-family="Inter, sans-serif" font-size="24" fill="#CBD5E1">Across 42 exhibition venues</text>
        <rect x="48" y="464" width="1504" height="388" rx="20" fill="#1E293B"/>
        <text x="88" y="528" font-family="Plus Jakarta Sans, sans-serif" font-size="30" font-weight="700" fill="#FFFFFF">Real-Time Performance Curve</text>
        <path d="M 96 770 C 280 755, 420 640, 620 660 C 820 680, 980 570, 1210 580 C 1340 585, 1440 535, 1500 520" fill="none" stroke="#D95D39" stroke-width="10" stroke-linecap="round"/>
        <path d="M 96 800 C 310 790, 520 715, 740 725 C 960 735, 1140 655, 1500 620" fill="none" stroke="#38BDF8" stroke-width="7" stroke-linecap="round" opacity="0.8"/>
      </svg>
    `),
  },
  {
    id: 'preset-rollup-vertical',
    name: 'Vertical Roll-Up Poster',
    kind: 'preset',
    category: 'banner',
    width: 850,
    height: 2000,
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 2000">
        <defs>
          <linearGradient id="vbg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#F7F7F5"/>
            <stop offset="68%" stop-color="#ECEBE6"/>
            <stop offset="68%" stop-color="#1B365D"/>
            <stop offset="100%" stop-color="#112440"/>
          </linearGradient>
        </defs>
        <rect width="850" height="2000" fill="url(#vbg)"/>
        <rect x="75" y="110" width="90" height="12" rx="6" fill="#D95D39"/>
        <text x="75" y="210" font-family="Plus Jakarta Sans, sans-serif" font-size="52" font-weight="800" fill="#1B365D">NEXUS</text>
        <text x="75" y="370" font-family="Plus Jakarta Sans, sans-serif" font-size="94" font-weight="800" fill="#18191B">Smart</text>
        <text x="75" y="476" font-family="Plus Jakarta Sans, sans-serif" font-size="94" font-weight="800" fill="#18191B">Design.</text>
        <text x="75" y="582" font-family="Plus Jakarta Sans, sans-serif" font-size="94" font-weight="800" fill="#D95D39">Zero</text>
        <text x="75" y="688" font-family="Plus Jakarta Sans, sans-serif" font-size="94" font-weight="800" fill="#D95D39">Waste.</text>
        <rect x="75" y="790" width="700" height="440" rx="30" fill="#1B365D"/>
        <circle cx="585" cy="940" r="130" fill="#D95D39" opacity="0.9"/>
        <circle cx="310" cy="1060" r="95" fill="#FFFFFF" opacity="0.16"/>
        <text x="125" y="920" font-family="Plus Jakarta Sans, sans-serif" font-size="42" font-weight="700" fill="#FFFFFF">NEW 2026</text>
        <text x="125" y="982" font-family="Plus Jakarta Sans, sans-serif" font-size="42" font-weight="700" fill="#FFFFFF">SERIES</text>
        <text x="125" y="1060" font-family="Inter, sans-serif" font-size="28" fill="#CBD5E1">Ask our team for</text>
        <text x="125" y="1100" font-family="Inter, sans-serif" font-size="28" fill="#CBD5E1">a 5-minute walkthrough</text>
        <text x="75" y="1510" font-family="Plus Jakarta Sans, sans-serif" font-size="46" font-weight="700" fill="#FFFFFF">Why Exhibitors</text>
        <text x="75" y="1572" font-family="Plus Jakarta Sans, sans-serif" font-size="46" font-weight="700" fill="#FFFFFF">Choose Nexus</text>
        <text x="75" y="1665" font-family="Inter, sans-serif" font-size="30" fill="#CBD5E1">• 10-minute tool-free assembly</text>
        <text x="75" y="1725" font-family="Inter, sans-serif" font-size="30" fill="#CBD5E1">• Washable recycled SEG fabrics</text>
        <text x="75" y="1785" font-family="Inter, sans-serif" font-size="30" fill="#CBD5E1">• Integrated LED illumination</text>
        <text x="75" y="1910" font-family="JetBrains Mono, monospace" font-size="30" font-weight="600" fill="#F29E4C">nexuslabs.example</text>
      </svg>
    `),
  },
  {
    id: 'preset-architectural-pattern',
    name: 'Geometric Accent Pattern',
    kind: 'preset',
    category: 'pattern',
    width: 1200,
    height: 1200,
    dataUrl: svgToDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">
        <rect width="1200" height="1200" fill="#1B365D"/>
        <g stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="3" fill="none">
          <path d="M 0 200 L 1200 200 M 0 400 L 1200 400 M 0 600 L 1200 600 M 0 800 L 1200 800 M 0 1000 L 1200 1000"/>
          <path d="M 200 0 L 200 1200 M 400 0 L 400 1200 M 600 0 L 600 1200 M 800 0 L 800 1200 M 1000 0 L 1000 1200"/>
        </g>
        <circle cx="600" cy="600" r="360" fill="none" stroke="#D95D39" stroke-width="28"/>
        <circle cx="600" cy="600" r="240" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="6"/>
        <rect x="520" y="520" width="160" height="160" rx="28" fill="#D95D39" transform="rotate(45 600 600)"/>
      </svg>
    `),
  },
];
