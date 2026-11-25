import { describe, expect, it } from 'vitest';
import type { BrandAsset, StandConfig, StandItem } from '../../src/types/stand';
import {
  buildDesignerBriefHtml,
  buildDesignerPlainTextSummary,
  buildDesignerSpecCsv,
  buildDesignerSpecPack,
  hexToPrintColorSpec,
} from '../../src/utils/designerExport';

function makeBaseConfig(overrides: Partial<StandConfig> = {}): StandConfig {
  return {
    width: 6,
    depth: 3,
    heightLimit: 3.5,
    openSides: 2,
    showShellWalls: true,
    shellWallHeight: 2.5,
    floorMaterial: 'charcoal-carpet',
    floorColor: '#2E3136',
    wallColor: '#F5F4F0',
    trimColor: '#1E293B',
    brandName: 'Acme Robotics',
    brandTagline: 'Autonomous Exhibition Tech',
    primaryColor: '#FF4D2E',
    accentColor: '#0EA5E9',
    displayFont: 'Space Grotesk',
    bodyFont: 'Inter',
    eventName: 'EuroExpo 2026',
    standNumber: 'B-14',
    lightingPreset: 'expo-hall',
    showScaleFigures: true,
    showDimensions: true,
    showGrid: true,
    snapToGrid: true,
    gridStep: 0.25,
    unit: 'm',
    shellArtwork: {},
    ...overrides,
  };
}

describe('designerExport', () => {
  it('converts hex colors to RGB and approximate CMYK print values', () => {
    const black = hexToPrintColorSpec('Black', '#000000');
    expect(black.rgb).toBe('rgb(0, 0, 0)');
    expect(black.cmyk).toBe('C0 M0 Y0 K100');

    const red = hexToPrintColorSpec('Red', '#ff0000');
    expect(red.hex).toBe('#FF0000');
    expect(red.rgb).toBe('rgb(255, 0, 0)');
    expect(red.cmyk).toBe('C0 M100 Y100 K0');
  });

  it('collects active branded shell walls and scaled item surfaces with bleed, safe zone, and DPI warnings', () => {
    const lowResHero: BrandAsset = {
      id: 'asset-hero',
      name: 'hero-draft.png',
      dataUrl: 'data:image/png;base64,AAAA',
      width: 800,
      height: 600,
      kind: 'uploaded',
      category: 'banner',
    };

    const config = makeBaseConfig({
      openSides: 2, // back + left exist; right is open and must be excluded
      shellArtwork: {
        back: {
          assetId: lowResHero.id,
          fit: 'cover',
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          bgColor: '#111111',
        },
        right: {
          assetId: lowResHero.id,
          fit: 'cover',
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          bgColor: '#111111',
        },
      },
    });

    const items: StandItem[] = [
      {
        id: 'item-lightbox',
        catalogId: 'seg-lightbox',
        name: 'Main Backlit Wall',
        x: 0,
        y: 0,
        z: -1,
        rotationY: 0,
        // Scaled to 1.5x width and 1.25x height of default (2.6 x 2.4)
        dims: { w: 3.9, h: 3.0, d: 0.16 },
        backlit: true,
        artwork: {
          front: {
            assetId: lowResHero.id,
            fit: 'cover',
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            bgColor: '#FF4D2E',
          },
        },
      },
      {
        id: 'item-screen',
        catalogId: 'tv-stand',
        name: 'Demo TV',
        x: 1.5,
        y: 0,
        z: 0,
        rotationY: 0,
        dims: { w: 1.35, h: 2.05, d: 0.55 },
        artwork: {},
      },
      {
        id: 'item-rollup',
        catalogId: 'rollup-banner',
        name: 'Entrance Roll-Up',
        x: -2,
        y: 0,
        z: 0.5,
        rotationY: 0,
        dims: { w: 0.85, h: 2.05, d: 0.35 },
        artwork: {},
      },
      {
        id: 'item-hidden',
        catalogId: 'reception-desk',
        name: 'Hidden Desk',
        x: 0,
        y: 0,
        z: 1,
        rotationY: 0,
        dims: { w: 1.6, h: 1.05, d: 0.65 },
        visible: false,
        artwork: {},
      },
      {
        id: 'item-chair',
        catalogId: 'meeting-chair',
        name: 'Chair (Unbranded)',
        x: 0,
        y: 0,
        z: 0,
        rotationY: 0,
        dims: { w: 0.55, h: 0.82, d: 0.55 },
        artwork: {},
      },
    ];

    const assetsMap = new Map<string, BrandAsset>([[lowResHero.id, lowResHero]]);
    const pack = buildDesignerSpecPack('Acme <Expo> Stand', config, items, assetsMap);

    // Expect: back shell wall + lightbox + tv screen + rollup = 4 (right wall open, hidden desk skipped, chair has no surfaces)
    expect(pack.specs).toHaveLength(4);
    expect(pack.standSummary.totalBrandedSurfaces).toBe(4);
    expect(pack.standSummary.printSurfaceCount).toBe(3);
    expect(pack.standSummary.digitalScreenCount).toBe(1);
    expect(pack.standSummary.backlitCount).toBe(1);

    const shellSpec = pack.specs[0];
    expect(shellSpec.refCode).toBe('G-01');
    expect(shellSpec.widthMm).toBe(6000);
    expect(shellSpec.heightMm).toBe(2500);
    expect(shellSpec.bleedMm).toBe(10);
    expect(shellSpec.totalWithBleedWidthMm).toBe(6020);

    const lightboxSpec = pack.specs[1];
    expect(lightboxSpec.refCode).toBe('G-02');
    expect(lightboxSpec.widthMm).toBe(3900);
    expect(lightboxSpec.heightMm).toBe(3000);
    expect(lightboxSpec.isBacklit).toBe(true);
    expect(lightboxSpec.bleedMm).toBe(15);
    expect(lightboxSpec.totalWithBleedWidthMm).toBe(3930);
    expect(lightboxSpec.totalWithBleedHeightMm).toBe(3030);
    expect(lightboxSpec.assignedAsset?.lowResWarning).toBe(true);

    const screenSpec = pack.specs[2];
    expect(screenSpec.isDigitalScreen).toBe(true);
    expect(screenSpec.bleedMm).toBe(0);
    expect(screenSpec.colorSpace).toBe('sRGB (Digital)');

    const rollupSpec = pack.specs[3];
    expect(rollupSpec.productionNotes.some((n) => n.includes('100 mm'))).toBe(true);
  });

  it('generates valid CSV, plain-text summary, and XSS-escaped HTML pack with SVG diagrams', () => {
    const config = makeBaseConfig({ brandName: 'Brand "Quote" <Test>' });
    const items: StandItem[] = [
      {
        id: 'i1',
        catalogId: 'reception-desk',
        name: 'Front Desk, Main',
        x: 0,
        y: 0,
        z: 0,
        rotationY: 0,
        dims: { w: 1.6, h: 1.05, d: 0.65 },
        artwork: {},
      },
    ];

    const pack = buildDesignerSpecPack('Test <Script> Project', config, items, new Map());
    const csv = buildDesignerSpecCsv(pack);
    expect(csv).toContain('Ref Code,Equipment / Structure');
    expect(csv).toContain('"Front Desk, Main"');
    expect(csv).toContain('G-01');

    const summary = buildDesignerPlainTextSummary(pack);
    expect(summary).toContain('G-01');
    expect(summary).toContain('Front Desk, Main');

    const html = buildDesignerBriefHtml(pack, null);
    expect(html).toContain('Graphic Designer Artwork Specification Pack');
    expect(html).toContain('&lt;Script&gt;');
    expect(html).not.toContain('Test <Script> Project');
    expect(html).toContain('<svg viewBox="0 0 280 190"');
    expect(html).toContain('btn-dl-csv');
  });
});
