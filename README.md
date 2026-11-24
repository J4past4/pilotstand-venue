# Zuki — Exhibition Planner

> Built by **[Zuki Studio](https://zukistudio.co.uk)** for the exhibition and trade show market.

A browser-based 3D & 2D exhibition stand planner for exhibitors and event teams to design, customize, brand, and visualize exhibition stands in real time.

## Key Features

- **Real-Time 3D & 2D Dual Viewport (`Three.js`)**:
  - Interactive PBR 3D studio with soft shadows, studio environment reflections, and 3 venue lighting atmospheres (*Expo Hall*, *Daylight*, *Keynote Spot*).
  - Top-down orthographic **2D Floor Plan** view and **1.65m Visitor Eye-Level** walkthrough view.
  - Direct floor-plane drag-and-drop placement with toggleable grid snapping, keyboard shortcuts (`Ctrl+Z` / `Ctrl+Y`, `Ctrl+D`, `R`, `Del`), and optional 1.75m human scale figures.
- **Drag-and-Drop Custom 3D Models (`.GLB`, `.GLTF`, `.STL`, `.OBJ`)**:
  - Drag and drop your own CAD showcase machines, industrial equipment, or product prototypes directly onto the 3D/2D stand floor (or upload from the Kit panel).
  - Automatic CAD millimetre-to-metre unit normalization, floor grounding, proportional real-world dimension sliders, 1-click **CAD Z-Up → Y-Up** axis fix, CAD mesh tinting, and a 1-click sample CNC showcase machine.
- **26 Exhibition Equipment & Structure Models**:
  - **Quick-Fold & Modular Walls**: Straight & curved quick-fold pop-up walls (with rear aluminum scissor lattice & arm lights), SEG backlit LED lightboxes, modular partition walls, architectural brand arches, and lockable storage cabins.
  - **Signage & AV**: Retractable roll-up banners, 360° suspended overhead cubes & circular halos, backlit brand totems, 55" 4K display stands, seamless LED video walls, and feather flags.
  - **Counters, Desks & Tables**: Branded reception desks, quick-fold promo counters, interactive demo kiosks, illuminated showcase plinths, high bistro tables, and conference meeting tables.
  - **Seating & Extras**: Swivel bar stools, meeting chairs, lounge sofas, coffee tables, literature racks, architectural planters, and overhead truss spotlight rigs.
- **Custom Branding & Artwork Studio**:
  - Upload **PNG, JPG, SVG, or WebP** logos and graphics directly into your Brand Asset Library or onto any individual stand zone.
  - **Click-to-Assign Paint Mode**: Select any uploaded graphic and click walls, counters, banners, arches, screens, or perimeter shell walls in 3D to apply it immediately.
  - Fine-tune framing per surface (**Fill**, **Fit Logo**, **Stretch**, **Scale**, **Offset X/Y**, **Surface Backdrop Colour**, **Backlit LED Glow**) with live print dimensions in millimetres.
  - 6 curated architectural colour palettes + live company name & tagline auto-branding.
- **Stand Space Confirmation, Live Estimate & Production Handoff**:
  - Real-time footprint boundary & venue height-limit compliance checking, floor area utilization meter, and open-aisle indicators (`1` Inline / `2` Corner / `3` Peninsula / `4` Island).
  - Instant itemized Bill of Materials (`GBP` / `USD` / `EUR`, Event Hire vs. Outright Purchase) with automatic printed graphic area (`m²`) calculation.
  - One-click **High-Res PNG Snapshot**, **Print/PDF Production Brief** (including exact mm print schedule), and `.JSON` project backup/import.

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Public Launch & Supplier Monetisation Mode

Set `APP_ACCESS_MODE=public` + Upstash Redis (via Vercel Storage) + `AUTH_SESSION_SECRET` in Vercel Environment Variables (see `.env.example`) to run as a free-to-use public exhibition planner:

- **Open 3D Sandbox + Free Public Account Form**: Visitors can immediately build stands in 3D/2D, and create a free account (capturing name, work email, company, role, upcoming event, stand size, and optional updates opt-in) when saving/exporting production briefs, PNG renders, or JSON backups.
- **Supplier Catalog Hosting Intake (`For Suppliers`)**: Built-in application form (`/api/supplier-inquiry`) for exhibition equipment, AV, furniture, and print suppliers to apply for the Founding Supplier Pilot, Verified 3D Catalog Hosting, or White-Label Website Embed.
- **GDPR-Consented BOM Quote Requests**: Exhibitors can click **Request Supplier Quotes** on their Estimate/BOM modal (`/api/quote-request`) to submit their dimensioned stand spec for supplier pricing.
- **Founder Launch Insights**: Sign in with an admin account (`BETA_USERS` with `"role":"admin"`) to view live registered users, supplier applications, quote requests, total specified BOM volume, and 1-click CSV exports.

## Private Beta Access (Invite-Only Mode)

Omit `APP_ACCESS_MODE=public` (or set `APP_ACCESS_MODE=beta`) and configure `BETA_INVITE_CODE` / `BETA_USERS` + Upstash Redis to require invite-only login before entering the workspace.

## QA & Verification

```bash
npm run qa          # Lint + Strict TypeScript Build + Vitest unit tests + Client bundle secret scan
npm run test:e2e    # Playwright headless browser & WebGL smoke suite
npm run check:dead-code  # Knip unused files/exports audit
```
