import type { BetaUser } from '../components/BetaAuthGate';
import type {
  CustomAssetCategory,
  CustomModelAsset,
  CustomModelFormat,
  Dimensions3D,
} from '../types/stand';

export interface ExclusiveModelPreset {
  id: string;
  name: string;
  shortName: string;
  description: string;
  url: string;
  format: CustomModelFormat;
  fileSizeBytes: number;
  defaultDims: Dimensions3D;
  category: CustomAssetCategory;
  /** Case-insensitive user name/email-prefix aliases granted access to this model */
  allowedUsers: readonly string[];
  /** Whether the model supports toggling branded decals/graphics on or off */
  supportsBrandingToggle: boolean;
  /** Default branding state when placed */
  defaultBranded: boolean;
  /** Node/mesh names in the GLB hierarchy that carry branding graphics */
  brandingNodeNames: readonly string[];
}

export const EXCLUSIVE_MODEL_PRESETS: readonly ExclusiveModelPreset[] = [
  {
    id: 'paperwrap-semiautomatic-standalone',
    name: 'PaperWrap Semiautomatic (Stand Alone)',
    shortName: 'PaperWrap Stand Alone',
    description:
      'Semiautomatic paper pallet wrapper with Ø1980mm turntable, 2400mm mast, and loading ramp (4.31 × 1.98 × 2.40m).',
    url: '/models/paperwrap-semiautomatic-standalone.glb',
    format: 'glb',
    fileSizeBytes: 136028,
    defaultDims: { w: 4.31, h: 2.4, d: 1.98 },
    category: 'machine',
    allowedUsers: ['jae', 'dario'],
    supportsBrandingToggle: true,
    defaultBranded: true,
    brandingNodeNames: ['Mast_Branding_Front', 'Mast_Branding_Rear'],
  },
  {
    id: 'paperwrap-semiautomatic-noramp',
    name: 'PaperWrap Semiautomatic (No Ramp)',
    shortName: 'PaperWrap No Ramp',
    description:
      'Compact semiautomatic paper pallet wrapper without loading ramp (3.05 × 1.98 × 2.40m).',
    url: '/models/paperwrap-semiautomatic-noramp.glb',
    format: 'glb',
    fileSizeBytes: 133088,
    defaultDims: { w: 3.05, h: 2.4, d: 1.98 },
    category: 'machine',
    allowedUsers: ['jae', 'dario'],
    supportsBrandingToggle: true,
    defaultBranded: true,
    brandingNodeNames: ['Mast_Branding_Front', 'Mast_Branding_Rear'],
  },
];

function extractIdentityTokens(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Checks whether a signed-in user matches any of the allowed user aliases
 * by matching whole tokens in their display name or email local-part.
 */
export function userMatchesAllowedAliases(
  user: Pick<BetaUser, 'name' | 'email'> | null | undefined,
  allowedUsers: readonly string[]
): boolean {
  if (!user || allowedUsers.length === 0) return false;

  const allowedSet = new Set(allowedUsers.map((a) => a.trim().toLowerCase()).filter(Boolean));
  if (allowedSet.size === 0) return false;

  const nameTokens = extractIdentityTokens(user.name || '');
  if (nameTokens.some((tok) => allowedSet.has(tok))) return true;

  const emailLocal = (user.email || '').split('@')[0] || '';
  const emailTokens = extractIdentityTokens(emailLocal);
  return emailTokens.some((tok) => allowedSet.has(tok));
}

export function getExclusiveModelsForUser(
  user: Pick<BetaUser, 'name' | 'email'> | null | undefined
): ExclusiveModelPreset[] {
  return EXCLUSIVE_MODEL_PRESETS.filter((preset) =>
    userMatchesAllowedAliases(user, preset.allowedUsers)
  );
}

export function getExclusiveModelById(id: string | undefined): ExclusiveModelPreset | undefined {
  if (!id) return undefined;
  return EXCLUSIVE_MODEL_PRESETS.find((preset) => preset.id === id);
}

export function presetToCustomModelAsset(preset: ExclusiveModelPreset): CustomModelAsset {
  return {
    id: preset.id,
    name: preset.name,
    format: preset.format,
    fileSizeBytes: preset.fileSizeBytes,
    originalDims: { ...preset.defaultDims },
    blobUrl: preset.url,
    category: preset.category,
    zUpFix: false,
    supportsBrandingToggle: preset.supportsBrandingToggle,
    defaultBranded: preset.defaultBranded,
    brandingNodeNames: [...preset.brandingNodeNames],
    isExclusive: true,
  };
}
