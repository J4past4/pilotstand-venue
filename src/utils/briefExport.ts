import { CATALOG_MAP } from '../data/catalog';
import type { BrandAsset, CurrencyCode, StandConfig, StandItem } from '../types/stand';
import { calculateEstimate, evaluateCompliance, formatArea, formatLength, formatMoney } from './pricing';

export function exportProductionBriefHtml(
  projectName: string,
  config: StandConfig,
  items: StandItem[],
  assetsMap: Map<string, BrandAsset>,
  snapshotDataUrl: string | null,
  currency: CurrencyCode,
  pricingMode: 'hire' | 'buy'
) {
  const compliance = evaluateCompliance(config, items);
  const estimate = calculateEstimate(config, items, pricingMode);

  const openSidesText =
    config.openSides === 1
      ? 'Inline (1 Open Side)'
      : config.openSides === 2
        ? 'Corner (2 Open Sides)'
        : config.openSides === 3
          ? 'Peninsula (3 Open Sides)'
          : 'Island (4 Open Sides)';

  // Collect every artwork print specification in exact millimetres
  const artworkSpecs: {
    itemName: string;
    surfaceLabel: string;
    dimensionsMm: string;
    assignedAsset: string;
    fit: string;
  }[] = [];

  if (config.showShellWalls) {
    (['back', 'left', 'right'] as const).forEach((side) => {
      const art = config.shellArtwork[side];
      if (art?.assetId) {
        const lenM = side === 'back' ? config.width : config.depth;
        artworkSpecs.push({
          itemName: `Perimeter Shell Wall (${side.toUpperCase()})`,
          surfaceLabel: 'Full Wall Mural',
          dimensionsMm: `${Math.round(lenM * 1000)} × ${Math.round(config.shellWallHeight * 1000)} mm`,
          assignedAsset: assetsMap.get(art.assetId)?.name || 'Custom Graphic',
          fit: art.fit,
        });
      }
    });
  }

  items.forEach((item) => {
    if (item.visible === false) return;
    const def = CATALOG_MAP[item.catalogId];
    if (!def || def.surfaces.length === 0) return;
    def.surfaces.forEach((surface) => {
      const art = item.artwork[surface.id];
      const scaleW = item.dims.w / def.defaultDims.w;
      const scaleH = item.dims.h / def.defaultDims.h;
      const wMm = Math.round(surface.widthMm * scaleW);
      const hMm = Math.round(surface.heightMm * scaleH);
      artworkSpecs.push({
        itemName: item.name,
        surfaceLabel: surface.label,
        dimensionsMm: `${wMm} × ${hMm} mm`,
        assignedAsset: art?.assetId
          ? assetsMap.get(art.assetId)?.name || 'Uploaded Artwork'
          : `Auto-Branded (${config.brandName})`,
        fit: art?.fit || 'cover',
      });
    });
  });

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(projectName)} — Exhibition Stand Production Brief</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    color: #18191B;
    background: #FFFFFF;
    margin: 0;
    padding: 36px 42px;
    line-height: 1.5;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #1B365D;
    padding-bottom: 18px;
    margin-bottom: 26px;
  }
  .brand-kicker {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #D95D39;
    font-weight: 700;
    margin-bottom: 4px;
  }
  h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
  .meta { font-size: 13px; color: #64676F; text-align: right; }
  .hero-img {
    width: 100%;
    border-radius: 10px;
    border: 1px solid #E5E7EB;
    margin-bottom: 24px;
    display: block;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 26px;
  }
  .stat {
    background: #F7F7F5;
    border: 1px solid #E6E5E0;
    border-radius: 8px;
    padding: 12px 14px;
  }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64676F; }
  .stat-val { font-size: 18px; font-weight: 700; margin-top: 3px; }
  h2 {
    font-size: 16px;
    margin: 26px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #E6E5E0;
    color: #1B365D;
  }
  .swatches { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  .swatch { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .swatch-dot { width: 22px; height: 22px; border-radius: 5px; border: 1px solid rgba(0,0,0,0.15); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 9px 10px; background: #F7F7F5; border-bottom: 1px solid #D8D6D0; font-weight: 600; }
  td { padding: 8px 10px; border-bottom: 1px solid #EEEDE8; }
  .num { text-align: right; font-family: ui-monospace, SFMono-Regular, monospace; }
  .totals {
    margin-top: 14px;
    margin-left: auto;
    width: 340px;
    font-size: 14px;
  }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #EEEDE8; }
  .totals-grand { font-size: 18px; font-weight: 800; color: #1B365D; border-bottom: none; padding-top: 10px; }
  .print-btn {
    position: fixed; top: 18px; right: 18px;
    background: #1B365D; color: #FFF; border: none; border-radius: 8px;
    padding: 10px 18px; font-weight: 600; cursor: pointer;
  }
  @media print {
    .print-btn { display: none; }
    body { padding: 14px; }
  }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
  <div class="header">
    <div>
      <div class="brand-kicker">StandCraft Studio · Exhibition Production Brief</div>
      <h1>${escapeHtml(projectName)}</h1>
    </div>
    <div class="meta">
      <div>Brand: <strong>${escapeHtml(config.brandName)}</strong></div>
      <div>Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
      <div>Compliance: <strong>${compliance.isCompliant ? 'Verified Within Bounds' : 'Check Footprint Warnings'}</strong></div>
    </div>
  </div>

  ${snapshotDataUrl ? `<img class="hero-img" src="${snapshotDataUrl}" alt="3D Exhibition Stand Render" />` : ''}

  <div class="grid">
    <div class="stat">
      <div class="stat-label">Footprint</div>
      <div class="stat-val">${formatLength(config.width, config.unit)} × ${formatLength(config.depth, config.unit)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Floor Area</div>
      <div class="stat-val">${formatArea(compliance.areaM2, config.unit)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Configuration</div>
      <div class="stat-val">${openSidesText}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Height Limit / Print Area</div>
      <div class="stat-val">${formatLength(config.heightLimit, config.unit)} · ${compliance.totalPrintAreaM2.toFixed(1)} m²</div>
    </div>
  </div>

  <h2>Brand Colour Scheme &amp; Finishes</h2>
  <div class="swatches">
    <div class="swatch"><span class="swatch-dot" style="background:${config.primaryColor}"></span>Primary: <code>${config.primaryColor}</code></div>
    <div class="swatch"><span class="swatch-dot" style="background:${config.accentColor}"></span>Accent: <code>${config.accentColor}</code></div>
    <div class="swatch"><span class="swatch-dot" style="background:${config.wallColor}"></span>Walls: <code>${config.wallColor}</code></div>
    <div class="swatch"><span class="swatch-dot" style="background:${config.floorColor}"></span>Flooring: <strong>${config.floorMaterial}</strong></div>
  </div>

  <h2>Print &amp; Artwork Production Schedule</h2>
  <table>
    <thead>
      <tr>
        <th>Equipment / Structure</th>
        <th>Artwork Zone</th>
        <th>Print Size (W × H)</th>
        <th>Assigned Graphic</th>
        <th>Fit Mode</th>
      </tr>
    </thead>
    <tbody>
      ${
        artworkSpecs.length > 0
          ? artworkSpecs
              .map(
                (s) => `<tr>
          <td><strong>${escapeHtml(s.itemName)}</strong></td>
          <td>${escapeHtml(s.surfaceLabel)}</td>
          <td class="num">${escapeHtml(s.dimensionsMm)}</td>
          <td>${escapeHtml(s.assignedAsset)}</td>
          <td>${escapeHtml(s.fit)}</td>
        </tr>`
              )
              .join('')
          : '<tr><td colspan="5">No branded surfaces configured.</td></tr>'
      }
    </tbody>
  </table>

  <h2>Equipment Bill of Materials &amp; Budget Estimate (${pricingMode === 'hire' ? 'Event Hire' : 'Outright Purchase'})</h2>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>Category</th>
        <th class="num">Qty</th>
        <th class="num">Unit Rate</th>
        <th class="num">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${estimate.lines
        .map(
          (l) => `<tr>
        <td>${escapeHtml(l.label)}</td>
        <td style="text-transform:capitalize">${escapeHtml(l.category)}</td>
        <td class="num">${l.qty}</td>
        <td class="num">${formatMoney(l.unitPriceGbp, currency)}</td>
        <td class="num"><strong>${formatMoney(l.totalGbp, currency)}</strong></td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Equipment &amp; Structure Subtotal</span><span class="num">${formatMoney(estimate.subtotalGbp, currency)}</span></div>
    <div class="totals-row"><span>Custom Graphic Printing (${estimate.totalPrintAreaM2.toFixed(1)} m²)</span><span class="num">${formatMoney(estimate.printGraphicsGbp, currency)}</span></div>
    <div class="totals-row"><span>Install, Power &amp; Breakdown</span><span class="num">${formatMoney(estimate.installAndPowerGbp, currency)}</span></div>
    <div class="totals-row totals-grand"><span>Estimated Total</span><span class="num">${formatMoney(estimate.grandTotalGbp, currency)}</span></div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Fallback download if popup blocked
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-production-brief.html`;
    a.click();
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
