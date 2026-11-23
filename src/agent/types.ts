import type {
  CameraPreset,
  Dimensions3D,
  FloorMaterial,
  LightingPreset,
  OpenSides,
} from '../types/stand.ts';

export type ItemFinish = 'matte' | 'gloss' | 'oak' | 'metal';

export type StandAgentAction =
  | {
      type: 'apply_template';
      templateId: string;
      preserveBrand?: boolean;
    }
  | {
      type: 'start_blank';
      width: number;
      depth: number;
      openSides: OpenSides;
    }
  | {
      type: 'update_config';
      patch: {
        width?: number;
        depth?: number;
        heightLimit?: number;
        openSides?: OpenSides;
        showShellWalls?: boolean;
        shellWallHeight?: number;
        floorMaterial?: FloorMaterial;
        floorColor?: string;
        wallColor?: string;
        trimColor?: string;
        brandName?: string;
        brandTagline?: string;
        primaryColor?: string;
        accentColor?: string;
        lightingPreset?: LightingPreset;
      };
    }
  | {
      type: 'apply_palette';
      paletteId: string;
    }
  | {
      type: 'add_item';
      catalogId: string;
      x: number;
      z: number;
      y?: number;
      rotationY?: number;
      dims?: Partial<Dimensions3D>;
      name?: string;
      finish?: ItemFinish;
      backlit?: boolean;
      primaryColor?: string;
      accentColor?: string;
    }
  | {
      type: 'update_item';
      itemId: string;
      patch: {
        x?: number;
        y?: number;
        z?: number;
        rotationY?: number;
        dims?: Partial<Dimensions3D>;
        name?: string;
        finish?: ItemFinish;
        backlit?: boolean;
        primaryColor?: string;
        accentColor?: string;
        visible?: boolean;
      };
    }
  | {
      type: 'remove_item';
      itemId: string;
    }
  | {
      type: 'clear_items';
    }
  | {
      type: 'set_camera';
      preset: CameraPreset;
    };

export interface CompactStandItem {
  id: string;
  catalogId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  dims: Dimensions3D;
  finish?: ItemFinish;
  backlit?: boolean;
}

/**
 * Token-safe representation of the current stand.
 * Intentionally strips base64 dataUrls, custom 3D blobUrls, and UI-only flags.
 */
export interface CompactStandState {
  config: {
    width: number;
    depth: number;
    heightLimit: number;
    openSides: OpenSides;
    showShellWalls: boolean;
    shellWallHeight: number;
    floorMaterial: FloorMaterial;
    lightingPreset: LightingPreset;
    brandName: string;
    brandTagline: string;
    primaryColor: string;
    accentColor: string;
  };
  items: CompactStandItem[];
}

export interface CatalogSummaryEntry {
  id: string;
  name: string;
  category: string;
  dims: Dimensions3D;
  resizable: boolean;
  elevatedY?: number;
  supportsBacklit?: boolean;
}

export interface TemplateSummaryEntry {
  id: string;
  name: string;
  dims: string;
  openSides: string;
}

export interface PaletteSummaryEntry {
  id: string;
  name: string;
  description: string;
}

export interface AgentCatalogManifest {
  catalog: CatalogSummaryEntry[];
  templates: TemplateSummaryEntry[];
  palettes: PaletteSummaryEntry[];
}

export interface AgentHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentAudioPayload {
  /** Base64 encoded audio (no data: prefix) */
  base64: string;
  mimeType: string;
  durationSec: number;
}

export interface AgentRequestPayload {
  message?: string;
  audio?: AgentAudioPayload;
  history: AgentHistoryTurn[];
  state: CompactStandState;
  manifest: AgentCatalogManifest;
  turnstileToken?: string;
}

export interface AgentResponseMeta {
  provider: 'gemini' | 'anthropic' | 'openai' | 'local-preview';
  model: string;
  estimatedCostUsd?: number;
  remainingHourly?: number;
  remainingDaily?: number;
}

export interface AgentResponsePayload {
  reply: string;
  actions: StandAgentAction[];
  transcript?: string;
  meta: AgentResponseMeta;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  viaVoice?: boolean;
  appliedSummaries?: string[];
  warnings?: string[];
  meta?: AgentResponseMeta;
  canUndo?: boolean;
}
