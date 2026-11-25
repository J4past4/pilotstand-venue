import { describe, expect, it } from 'vitest';
import { computePrimitivesBounds } from '../../src/engine/customAssetMesh';
import { analyzeSchematicImageData } from '../../src/utils/schematicAnalyzer';
import { compute3DVoxelIoU, getAllSchematicEvalCases } from './helpers/schematicFixtures';

describe('2D Schematic -> 3D Reconstruction Eval Suite (Known Machine Schematics)', () => {
  const cases = getAllSchematicEvalCases();

  for (const tc of cases) {
    it(`reconstructs ${tc.name} accurately`, () => {
      const result = analyzeSchematicImageData(tc.image, {
        mmPerPx: tc.machineWidthMm / tc.image.width,
        viewPlane: tc.requestedViewPlane,
        defaultHeightMm: tc.defaultHeightMm,
        defaultDepthMm: tc.defaultDepthMm,
        machineWidthMm: tc.machineWidthMm,
      });

      const bounds = computePrimitivesBounds(result.primitives);
      const voxel = compute3DVoxelIoU(result.primitives, tc.groundTruth.primitives);

      const widthErrPct = Math.abs(bounds.widthMm - tc.groundTruth.widthMm) / tc.groundTruth.widthMm;
      const depthErrPct = Math.abs(bounds.depthMm - tc.groundTruth.depthMm) / tc.groundTruth.depthMm;
      const heightErrPct =
        Math.abs(bounds.heightMm - tc.groundTruth.heightMm) / tc.groundTruth.heightMm;

      console.log(
        `[EVAL] ${tc.id}: mode=${result.layout?.mode} | parts=${result.primitives.length} | ` +
          `pred=${bounds.widthMm}x${bounds.depthMm}x${bounds.heightMm}mm vs gt=${tc.groundTruth.widthMm}x${tc.groundTruth.depthMm}x${tc.groundTruth.heightMm}mm | ` +
          `err=(W:${(widthErrPct * 100).toFixed(1)}%, D:${(depthErrPct * 100).toFixed(1)}%, H:${(heightErrPct * 100).toFixed(1)}%) | ` +
          `3D_IoU=${(voxel.iou * 100).toFixed(1)}%`
      );

      // 1. Correct view layout mode
      expect(result.layout?.mode).toBe(tc.expectedMode);

      // 2. Clean primitive count (no dimension-line clutter or excessive fragmentation)
      expect(result.primitives.length).toBeGreaterThanOrEqual(tc.groundTruth.minParts);
      expect(result.primitives.length).toBeLessThanOrEqual(tc.groundTruth.maxParts);

      // 3. Overall 3D bounding dimensions within tight tolerance
      expect(widthErrPct).toBeLessThanOrEqual(0.15);
      expect(depthErrPct).toBeLessThanOrEqual(0.18);
      expect(heightErrPct).toBeLessThanOrEqual(0.15);

      // 4. Cylindrical feature accuracy (if machine has turntable / drum / pedestal)
      if (tc.groundTruth.expectCylinder) {
        const cyl = result.primitives.find((p) => p.kind === 'cylinder');
        expect(cyl, `Expected a detected cylinder in ${tc.id}`).toBeDefined();
        if (cyl) {
          expect(cyl.w).toBeGreaterThanOrEqual(tc.groundTruth.expectCylinder.minDiameterMm);
          expect(cyl.w).toBeLessThanOrEqual(tc.groundTruth.expectCylinder.maxDiameterMm);
          expect(cyl.h).toBeGreaterThanOrEqual(tc.groundTruth.expectCylinder.minHeightMm);
          expect(cyl.h).toBeLessThanOrEqual(tc.groundTruth.expectCylinder.maxHeightMm);
        }
      }

      // 5. High 3D volumetric IoU against ground-truth 3D machine geometry
      expect(voxel.iou).toBeGreaterThanOrEqual(0.55);
    });
  }
});
