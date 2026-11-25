import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXCLUSIVE_MODEL_PRESETS,
  getExclusiveModelById,
  getExclusiveModelsForUser,
  presetToCustomModelAsset,
  userMatchesAllowedAliases,
} from '../../src/data/userModels';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function readGlbJson(filePath: string): {
  nodes?: Array<{ name?: string }>;
  meshes?: Array<{ name?: string }>;
} {
  const buf = readFileSync(filePath);
  expect(buf.toString('utf8', 0, 4)).toBe('glTF');
  const chunkLen = buf.readUInt32LE(12);
  const jsonText = buf.toString('utf8', 20, 20 + chunkLen);
  return JSON.parse(jsonText);
}

describe('Exclusive User 3D Models (PaperWrap for Jae & Dario)', () => {
  it('grants access to Jae and Dario by display name or email prefix', () => {
    const allowedUsers = [
      { name: 'Jae', email: 'admin@zukistudio.co.uk' },
      { name: 'Jae Pasta', email: 'team@company.com' },
      { name: 'Admin', email: 'jae@company.com' },
      { name: 'Admin', email: 'jae.smith@company.com' },
      { name: 'Dario', email: 'user@company.com' },
      { name: 'Dario Rossi', email: 'sales@paperwrap.io' },
      { name: 'Sales Rep', email: 'dario@paperwrap.io' },
      { name: 'Sales Rep', email: 'dario_r@paperwrap.io' },
    ];

    for (const user of allowedUsers) {
      const models = getExclusiveModelsForUser(user);
      expect(models.length).toBe(2);
      expect(models.map((m) => m.id)).toEqual([
        'paperwrap-semiautomatic-standalone',
        'paperwrap-semiautomatic-noramp',
      ]);
    }
  });

  it('denies access to anonymous visitors and other users (no substring false positives)', () => {
    const deniedUsers = [
      null,
      undefined,
      { name: 'James', email: 'james@company.com' },
      { name: 'Alex', email: 'alex@company.com' },
      { name: 'Beta Access', email: 'beta-access@zukistudio.co.uk' },
      { name: 'Darios', email: 'darios@company.com' },
      { name: 'Jaelen', email: 'jaelen@company.com' },
    ];

    for (const user of deniedUsers) {
      expect(getExclusiveModelsForUser(user)).toEqual([]);
    }
    expect(userMatchesAllowedAliases({ name: 'Jae', email: 'jae@x.com' }, [])).toBe(false);
  });

  it('maps presets to CustomModelAsset with branding toggle enabled', () => {
    const preset = getExclusiveModelById('paperwrap-semiautomatic-standalone');
    expect(preset).toBeDefined();
    const asset = presetToCustomModelAsset(preset!);
    expect(asset.supportsBrandingToggle).toBe(true);
    expect(asset.defaultBranded).toBe(true);
    expect(asset.isExclusive).toBe(true);
    expect(asset.brandingNodeNames).toEqual(['Mast_Branding_Front', 'Mast_Branding_Rear']);
    expect(asset.originalDims).toEqual({ w: 4.31, h: 2.4, d: 1.98 });
  });

  it('ships valid GLB files in public/models with expected branding nodes', () => {
    for (const preset of EXCLUSIVE_MODEL_PRESETS) {
      const diskPath = path.join(PUBLIC_DIR, preset.url.replace(/^\//, ''));
      expect(existsSync(diskPath)).toBe(true);

      const gltf = readGlbJson(diskPath);
      const nodeNames = new Set((gltf.nodes || []).map((n) => n.name));
      for (const brandNode of preset.brandingNodeNames) {
        expect(nodeNames.has(brandNode)).toBe(true);
      }
      expect(nodeNames.has('Mast_Column')).toBe(true);
      expect(nodeNames.has('Turntable_Base')).toBe(true);
    }
  });
});
