export interface ExhibitorBrandProfile {
  company: string;
  primaryColor: string;
  accentColor: string;
  floorColor?: string;
  tagline: string;
  website: string;
  buildStyle: 'flagship-island' | 'modern-seg' | 'machinery-showcase' | 'eco-timber' | 'shell-pro';
  highlights?: string;
}

/**
 * Researched real-world brand identities for confirmed Packaging Innovations & Empack exhibitors.
 * Used to render authentic branded 3D booths, fascia signage, backlit SEG walls, and exhibitor cards.
 */
const BRAND_PROFILES: ExhibitorBrandProfile[] = [
  {
    company: 'Elopak',
    primaryColor: '#005EB8',
    accentColor: '#78BE20',
    floorColor: '#e8e4dc',
    tagline: 'Pure-Pak® Fibre-Based Liquid Cartons',
    website: 'https://www.elopak.com',
    buildStyle: 'eco-timber',
    highlights: 'Low-carbon circular economy cartons & aseptic filling systems',
  },
  {
    company: 'Amcor',
    primaryColor: '#003B71',
    accentColor: '#00A859',
    floorColor: '#252b36',
    tagline: 'Global Leader in Responsible Packaging',
    website: 'https://www.amcor.com',
    buildStyle: 'flagship-island',
    highlights: 'AmPrima® recycle-ready flexible films & rigid dispensing solutions',
  },
  {
    company: 'Coveris',
    primaryColor: '#002E5D',
    accentColor: '#00A651',
    floorColor: '#282e38',
    tagline: 'No Waste — Sustainable Flexible & Paper Packaging',
    website: 'https://www.coveris.com',
    buildStyle: 'flagship-island',
    highlights: 'High-barrier recyclable films, paper trays & food packaging',
  },
  {
    company: 'Kite Packaging Ltd',
    primaryColor: '#003865',
    accentColor: '#E31837',
    floorColor: '#d1c2aa',
    tagline: "UK's Most Trusted Packaging Supplier",
    website: 'https://www.kitepackaging.co.uk',
    buildStyle: 'flagship-island',
    highlights: 'Custom corrugated boxes, e-commerce transit & sustainable void fill',
  },
  {
    company: 'Combilift',
    primaryColor: '#006837',
    accentColor: '#F7941D',
    floorColor: '#242930',
    tagline: 'Innovation, Flexibility & Service — Multidirectional Handling',
    website: 'https://combilift.com',
    buildStyle: 'machinery-showcase',
    highlights: 'Multidirectional forklifts, articulated narrow-aisle & warehouse handling',
  },
  {
    company: 'Zeus Packaging Group',
    primaryColor: '#004A8F',
    accentColor: '#00B2A9',
    floorColor: '#2a313c',
    tagline: 'Innovative, Sustainable Packaging — Net Zero by 2050',
    website: 'https://global.zeuspackaging.com',
    buildStyle: 'flagship-island',
    highlights: 'Industrial transit, foodservice & retail packaging across Europe',
  },
  {
    company: 'SPECTRA PACKAGING',
    primaryColor: '#1E293B',
    accentColor: '#0EA5E9',
    floorColor: '#29303b',
    tagline: 'Prevented Ocean Plastic™ & PCR Rigid Bottles',
    website: 'https://www.spectra-packaging.co.uk',
    buildStyle: 'modern-seg',
    highlights: '100% PCR HDPE/PET bottles, bioplastics & custom closures',
  },
  {
    company: 'Berlin Packaging UK',
    primaryColor: '#111827',
    accentColor: '#E11D48',
    floorColor: '#262930',
    tagline: 'Hybrid Packaging Supplier — Glass, Rigid & Closures',
    website: 'https://www.berlinpackaging.eu',
    buildStyle: 'modern-seg',
    highlights: 'Bespoke glass, plastic & metal containers with Studio One Eleven design',
  },
  {
    company: 'Thrace Group',
    primaryColor: '#0B3D91',
    accentColor: '#38BDF8',
    floorColor: '#252c38',
    tagline: 'Technical Fabrics & In-Mould Labelled Rigid Packaging',
    website: 'https://www.thracegroup.com',
    buildStyle: 'flagship-island',
    highlights: 'IML food containers, buckets & circular mono-material thermoforming',
  },
  {
    company: 'Orkka',
    primaryColor: '#0F172A',
    accentColor: '#F97316',
    floorColor: '#232830',
    tagline: 'End-of-Line Packaging Automation & Robotics',
    website: 'https://www.orkka.co.uk',
    buildStyle: 'machinery-showcase',
    highlights: 'Automated case erecting, robotic palletising & conveyor integration',
  },
  {
    company: 'Audion Elektro',
    primaryColor: '#004B87',
    accentColor: '#F59E0B',
    floorColor: '#272c34',
    tagline: 'Dutch Engineering in Industrial Heat Sealing',
    website: 'https://www.audion.com',
    buildStyle: 'machinery-showcase',
    highlights: 'Impulse sealers, vacuum chambers, band sealers & medical validatable systems',
  },
  {
    company: 'PFM Machinery',
    primaryColor: '#003366',
    accentColor: '#E63946',
    floorColor: '#262b34',
    tagline: 'High-Speed Flow Wrapping & Vertical Form-Fill-Seal',
    website: 'https://www.pfm.it',
    buildStyle: 'machinery-showcase',
    highlights: 'Horizontal flowpack, VFFS & multi-head weighing lines',
  },
  {
    company: 'Adpak Machinery Systems',
    primaryColor: '#1D4ED8',
    accentColor: '#FACC15',
    floorColor: '#262b33',
    tagline: 'Shrink Wrapping, Sleeve Sealing & Automation Systems',
    website: 'https://www.adpak.co.uk',
    buildStyle: 'machinery-showcase',
    highlights: 'L-sealers, shrink tunnels, paper-wrap & automated end-of-line machinery',
  },
  {
    company: 'Trioworld UK LTD',
    primaryColor: '#005A32',
    accentColor: '#84CC16',
    floorColor: '#2b332e',
    tagline: 'Loop® Circular High-Performance Stretch & Industrial Films',
    website: 'https://www.trioworld.com',
    buildStyle: 'eco-timber',
    highlights: 'PCR industrial stretch film, hood films & food-grade flexible packaging',
  },
  {
    company: 'Marden Edwards',
    primaryColor: '#1E3A8A',
    accentColor: '#EF4444',
    floorColor: '#262b34',
    tagline: 'World Leaders in Overwrapping & Shrink Wrapping',
    website: 'https://www.mardenedwards.com',
    buildStyle: 'machinery-showcase',
    highlights: 'Precision carton overwrappers for cosmetics, tea, pharma & confectionery',
  },
  {
    company: 'Kurz UK',
    primaryColor: '#18181B',
    accentColor: '#D4AF37',
    floorColor: '#27272A',
    tagline: 'Thin-Film Foil Finishing, Security & Luxury Decoration',
    website: 'https://www.kurz-world.com',
    buildStyle: 'modern-seg',
    highlights: 'Hot & cold stamping foils, digital metallization & recyclable decoration',
  },
  {
    company: 'Wipak UK',
    primaryColor: '#005596',
    accentColor: '#00B4D8',
    floorColor: '#28303b',
    tagline: 'Carbon-Neutral High-Barrier Food & Medical Films',
    website: 'https://www.wipak.com',
    buildStyle: 'modern-seg',
    highlights: 'Recyclable barrier laminates, paper-based pouches & sterile healthcare films',
  },
  {
    company: 'Sudpack',
    primaryColor: '#B91C1C',
    accentColor: '#F8FAFC',
    floorColor: '#2c292b',
    tagline: 'High-Performance Mono-Material Barrier Films',
    website: 'https://www.suedpack.com',
    buildStyle: 'modern-seg',
    highlights: 'CarbonLite® recyclable thermoforming films & chemical recycling',
  },
  {
    company: 'Greiner Packaging',
    primaryColor: '#004B93',
    accentColor: '#38BDF8',
    floorColor: '#29313d',
    tagline: 'K3® Cardboard-Plastic Combinations & Circular Cups',
    website: 'https://www.greiner-gpi.com',
    buildStyle: 'modern-seg',
    highlights: 'Self-separating K3® r100 cups, thermoformed tubs & rPET dairy packaging',
  },
  {
    company: 'Fuji Seal',
    primaryColor: '#003F87',
    accentColor: '#E60012',
    floorColor: '#282d36',
    tagline: 'Shrink Sleeve Labels, Spouted Pouches & Applicators',
    website: 'https://www.fujiseal.com',
    buildStyle: 'modern-seg',
    highlights: '360° shrink sleeves, self-adhesive labels & high-speed sleeving machinery',
  },
  {
    company: 'Bericap',
    primaryColor: '#004A99',
    accentColor: '#F59E0B',
    floorColor: '#28303a',
    tagline: 'Tethered Caps & Innovative Plastic Closures Worldwide',
    website: 'https://www.bericap.com',
    buildStyle: 'modern-seg',
    highlights: 'EU-compliant tethered beverage caps, sports closures & industrial drums',
  },
  {
    company: 'Autajon - Simply Cartons',
    primaryColor: '#1C1917',
    accentColor: '#D97706',
    floorColor: '#c9bba4',
    tagline: 'Luxury Folding Cartons & Rigid Presentation Boxes',
    website: 'https://www.autajon.com',
    buildStyle: 'modern-seg',
    highlights: 'Bespoke beauty, spirits, confectionery & fragrance carton engineering',
  },
  {
    company: 'ePac Flexible Packaging',
    primaryColor: '#0D9488',
    accentColor: '#F97316',
    floorColor: '#263030',
    tagline: 'Digital Flexible Pouches — Fast Turnaround, Low MOQ',
    website: 'https://epacflexibles.com',
    buildStyle: 'modern-seg',
    highlights: 'HP Indigo digitally printed stand-up pouches & connected QR packaging',
  },
  {
    company: 'Solidus',
    primaryColor: '#14532D',
    accentColor: '#A3E635',
    floorColor: '#cbbba3',
    tagline: 'Circular Fibre-Based Solid Board Packaging',
    website: 'https://solidus.com',
    buildStyle: 'eco-timber',
    highlights: 'Moisture-resistant solid board trays, MAP skin-pack & retail-ready boxes',
  },
  {
    company: 'Jokey UK',
    primaryColor: '#003A70',
    accentColor: '#84CC16',
    floorColor: '#29313a',
    tagline: 'Eco-Concept Recycled Rigid Buckets & Containers',
    website: 'https://www.jokey.com',
    buildStyle: 'modern-seg',
    highlights: 'PCR injection-moulded pails, IML food containers & circular buckets',
  },
  {
    company: 'Protega Global',
    primaryColor: '#1B4332',
    accentColor: '#52B788',
    floorColor: '#d0c2aa',
    tagline: '100% Paper Void Fill & Automated Protective Systems',
    website: 'https://www.protega-global.com',
    buildStyle: 'eco-timber',
    highlights: 'HexcelWrap, paper cushioning machines & plastic-free e-commerce transit',
  },
  {
    company: 'Robinson PLC',
    primaryColor: '#0F3D5E',
    accentColor: '#38BDF8',
    floorColor: '#2a323c',
    tagline: 'Custom Plastic & Paperboard Packaging Since 1839',
    website: 'https://www.robinsonpackaging.com',
    buildStyle: 'modern-seg',
    highlights: 'Recycled PET bottles, luxury rigid boxes & UK blow-moulding',
  },
  {
    company: 'Reflex Group',
    primaryColor: '#1E1B4B',
    accentColor: '#EC4899',
    floorColor: '#2a2938',
    tagline: 'Labels, Flexible Packaging & Linerless Solutions',
    website: 'https://www.reflexlabels.co.uk',
    buildStyle: 'modern-seg',
    highlights: 'Self-adhesive labels, Ravenwood linerless, artwork & print innovation',
  },
  {
    company: 'Cullen Packaging',
    primaryColor: '#365314',
    accentColor: '#84CC16',
    floorColor: '#d2c4ab',
    tagline: 'Fibre Bottle™ & Moulded Pulp Packaging Manufacturer',
    website: 'https://www.cullen.co.uk',
    buildStyle: 'eco-timber',
    highlights: 'UK-manufactured moulded fibre bottles, trays & corrugated transit',
  },
  {
    company: 'National Flexible Ltd',
    primaryColor: '#0369A1',
    accentColor: '#F59E0B',
    floorColor: '#28313a',
    tagline: "UK's Largest Distributor of Polypropylene & Sustainable Films",
    website: 'https://www.nationalflexible.co.uk',
    buildStyle: 'modern-seg',
    highlights: 'Compostable films, recyclable mono-web & flow-wrap laminates',
  },
  {
    company: 'Ecosurety',
    primaryColor: '#065F46',
    accentColor: '#10B981',
    floorColor: '#d3c9b8',
    tagline: 'UK Packaging EPR Compliance & Circular Recycling',
    website: 'https://www.ecosurety.com',
    buildStyle: 'eco-timber',
    highlights: 'Extended Producer Responsibility (pEPR) data, PRNs & recycling investment',
  },
  {
    company: 'OPRL',
    primaryColor: '#047857',
    accentColor: '#34D399',
    floorColor: '#d4cab9',
    tagline: 'On-Pack Recycling Label — Trusted UK Recyclability',
    website: 'https://oprl.org.uk',
    buildStyle: 'eco-timber',
    highlights: 'Certified recyclability assessment & consumer recycling labels',
  },
  {
    company: 'Greyparrot',
    primaryColor: '#111827',
    accentColor: '#22C55E',
    floorColor: '#252930',
    tagline: 'AI Waste Intelligence for Circular Packaging',
    website: 'https://www.greyparrot.ai',
    buildStyle: 'modern-seg',
    highlights: 'Computer-vision Analyzer units tracking billions of packaging items in MRFs',
  },
  {
    company: 'TIPA',
    primaryColor: '#166534',
    accentColor: '#A3E635',
    floorColor: '#d2c8b6',
    tagline: 'Compostable Packaging Engineered Like Conventional Plastic',
    website: 'https://tipa-corp.com',
    buildStyle: 'eco-timber',
    highlights: 'Home & industrial compostable pouches, films & apparel mailers',
  },
  {
    company: 'Sun Branding Ltd',
    primaryColor: '#7C2D12',
    accentColor: '#F59E0B',
    floorColor: '#2d2826',
    tagline: 'Brand Strategy, Structural Design & Artwork Management',
    website: 'https://www.sunbranding.com',
    buildStyle: 'modern-seg',
    highlights: 'Packaging design agency, legal compliance & global pre-media',
  },
  {
    company: 'SCODIX',
    primaryColor: '#1E1B4B',
    accentColor: '#C084FC',
    floorColor: '#272636',
    tagline: 'Digital Enhancement Presses — Foil, Emboss & Spot UV',
    website: 'https://scodix.com',
    buildStyle: 'machinery-showcase',
    highlights: 'Ultra-high-impact tactile print embellishment for luxury folding cartons',
  },
  {
    company: 'Allpack Packaging Ltd',
    primaryColor: '#0F172A',
    accentColor: '#38BDF8',
    floorColor: '#293038',
    tagline: 'E-Commerce Fulfilment & Sustainable Transit Packaging',
    website: 'https://www.allpack.uk.com',
    buildStyle: 'flagship-island',
    highlights: 'Automated packing stations, corrugated mailers & carbon-neutral delivery',
  },
  {
    company: 'Schur Star Systems',
    primaryColor: '#1E3A5F',
    accentColor: '#F97316',
    floorColor: '#272d36',
    tagline: 'Flexible Premade Bag Filling & Packaging Machines',
    website: 'https://www.schur.com',
    buildStyle: 'machinery-showcase',
    highlights: 'Schur®Star Concept automated bagging lines for food, pet & industrial',
  },
  {
    company: 'GS1 UK',
    primaryColor: '#002C6C',
    accentColor: '#F26334',
    floorColor: '#2a303c',
    tagline: 'Next-Generation 2D QR Barcodes & Digital Link Standards',
    website: 'https://www.gs1uk.org',
    buildStyle: 'modern-seg',
    highlights: 'Sunrise 2027 2D barcodes, supply chain traceability & DPP compliance',
  },
  {
    company: 'Boplan',
    primaryColor: '#18181B',
    accentColor: '#FACC15',
    floorColor: '#29292e',
    tagline: 'FLEX IMPACT® Polymer Industrial Safety Barriers',
    website: 'https://www.boplan.com',
    buildStyle: 'machinery-showcase',
    highlights: 'Shock-absorbing warehouse bollards, rack protectors & pedestrian gates',
  },
  {
    company: 'Rajapack',
    primaryColor: '#004A99',
    accentColor: '#F59E0B',
    floorColor: '#29313b',
    tagline: "Europe's No.1 Packaging & Warehouse Supplies",
    website: 'https://www.rajapack.co.uk',
    buildStyle: 'modern-seg',
    highlights: '5,000+ in-stock boxes, tapes, eco mailers & dispatch equipment',
  },
  {
    company: 'FormLabs',
    primaryColor: '#111827',
    accentColor: '#3B82F6',
    floorColor: '#282c34',
    tagline: 'Industrial 3D Printing for Rapid Packaging Prototyping',
    website: 'https://formlabs.com',
    buildStyle: 'machinery-showcase',
    highlights: 'SLA & SLS 3D printers for functional bottle, cap & thermoform tooling',
  },
  {
    company: 'Carton Packaging',
    primaryColor: '#3F2E21',
    accentColor: '#D97706',
    floorColor: '#d0c2ab',
    tagline: 'Bespoke Printed Corrugated & Folding Carton Solutions',
    website: 'https://www.packagingbirmingham.com',
    buildStyle: 'eco-timber',
    highlights: 'Retail-ready corrugated displays, SRP & FSC-certified cartons',
  },
];

const BRAND_MAP = new Map<string, ExhibitorBrandProfile>(
  BRAND_PROFILES.map((p) => [p.company.toLowerCase(), p])
);

const FALLBACK_BRAND_THEMES: Array<{
  primary: string;
  accent: string;
  floor: string;
  style: ExhibitorBrandProfile['buildStyle'];
}> = [
  { primary: '#1e3a5f', accent: '#38bdf8', floor: '#2a303a', style: 'modern-seg' },
  { primary: '#14532d', accent: '#4ade80', floor: '#cec0a8', style: 'eco-timber' },
  { primary: '#312e81', accent: '#a78bfa', floor: '#292c38', style: 'modern-seg' },
  { primary: '#0f172a', accent: '#f97316', floor: '#262b33', style: 'machinery-showcase' },
  { primary: '#7c2d12', accent: '#f59e0b', floor: '#cfc1aa', style: 'shell-pro' },
  { primary: '#134e4a', accent: '#2dd4bf', floor: '#293236', style: 'modern-seg' },
  { primary: '#3f3f46', accent: '#e11d48', floor: '#2b2d34', style: 'shell-pro' },
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Returns the researched real brand profile for a booked exhibitor, or a consistent
 * sector-appropriate architectural brand profile if not explicitly in the curated map.
 */
export function getExhibitorBrandProfile(
  exhibitorName?: string,
  sector?: string
): ExhibitorBrandProfile {
  const clean = (exhibitorName || 'Exhibitor').trim();
  const exact = BRAND_MAP.get(clean.toLowerCase());
  if (exact) return exact;

  // Partial match for slightly abbreviated floorplan labels
  for (const [key, profile] of BRAND_MAP.entries()) {
    if (clean.toLowerCase().includes(key) || key.includes(clean.toLowerCase())) {
      return profile;
    }
  }

  const theme = FALLBACK_BRAND_THEMES[hashString(clean) % FALLBACK_BRAND_THEMES.length];
  const isMachinery = /machinery|automation|robotics|safety/i.test(sector || '');
  const isEco = /sustainab|fibre|paper|carton|board/i.test(sector || '');

  return {
    company: clean,
    primaryColor: theme.primary,
    accentColor: theme.accent,
    floorColor: isEco ? '#d1c3ac' : theme.floor,
    tagline: sector ? `${sector} Solutions` : 'Packaging Innovation Partner',
    website: `https://www.google.com/search?q=${encodeURIComponent(`${clean} packaging`)}`,
    buildStyle: isMachinery ? 'machinery-showcase' : isEco ? 'eco-timber' : theme.style,
  };
}
