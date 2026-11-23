import React, { useState } from 'react';
import {
  Box,
  Calculator,
  Download,
  Eye,
  FolderOpen,
  Grid2x2,
  LayoutTemplate,
  Magnet,
  Moon,
  Redo2,
  Ruler,
  Sparkles,
  Sun,
  SunMedium,
  Undo2,
  Users,
} from 'lucide-react';
import type { CurrencyCode, LightingPreset, StandConfig, ViewMode } from '../types/stand';
import { formatMoney } from '../utils/pricing';

interface TopBarProps {
  projectName: string;
  onChangeProjectName: (name: string) => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  config: StandConfig;
  onUpdateConfig: (patch: Partial<StandConfig>) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  estimatedTotalGbp: number;
  currency: CurrencyCode;
  agentOpen: boolean;
  onToggleAgent: () => void;
  onOpenProjects: () => void;
  onOpenTemplates: () => void;
  onOpenEstimate: () => void;
  onOpenExport: () => void;
}

const LIGHTING_ORDER: LightingPreset[] = ['expo-hall', 'daylight', 'dramatic'];

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  onChangeProjectName,
  viewMode,
  onChangeViewMode,
  config,
  onUpdateConfig,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  estimatedTotalGbp,
  currency,
  agentOpen,
  onToggleAgent,
  onOpenProjects,
  onOpenTemplates,
  onOpenEstimate,
  onOpenExport,
}) => {
  const [editingName, setEditingName] = useState(false);

  const cycleLighting = () => {
    const idx = LIGHTING_ORDER.indexOf(config.lightingPreset);
    const next = LIGHTING_ORDER[(idx + 1) % LIGHTING_ORDER.length];
    onUpdateConfig({ lightingPreset: next });
  };

  const lightingLabel =
    config.lightingPreset === 'expo-hall'
      ? 'Expo Hall'
      : config.lightingPreset === 'daylight'
        ? 'Daylight'
        : 'Keynote Spot';

  return (
    <header className="studio-topbar" id="studio-topbar">
      <div className="topbar-left">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
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
          <span className="brand-wordmark">StandCraft</span>
        </div>

        <div className="topbar-divider" />

        {editingName ? (
          <input
            id="project-name-input"
            className="project-name-input"
            value={projectName}
            autoFocus
            onChange={(e) => onChangeProjectName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false);
            }}
          />
        ) : (
          <button
            id="project-name-btn"
            className="project-name-btn"
            onClick={() => setEditingName(true)}
            title="Click to rename stand project"
          >
            <span className="project-name-text">{projectName}</span>
          </button>
        )}

        <div className="topbar-icon-group">
          <button
            id="btn-undo"
            className="icon-btn"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={15} />
          </button>
          <button
            id="btn-redo"
            className="icon-btn"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            <Redo2 size={15} />
          </button>
        </div>
      </div>

      <div className="topbar-center">
        <div className="segmented-control" role="tablist" aria-label="Viewport mode">
          <button
            id="view-mode-3d"
            role="tab"
            aria-selected={viewMode === '3d'}
            className={`seg-btn ${viewMode === '3d' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('3d')}
          >
            <Box size={14} />
            <span>3D Studio</span>
          </button>
          <button
            id="view-mode-2d"
            role="tab"
            aria-selected={viewMode === '2d'}
            className={`seg-btn ${viewMode === '2d' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('2d')}
          >
            <Grid2x2 size={14} />
            <span>2D Plan</span>
          </button>
          <button
            id="view-mode-eye"
            role="tab"
            aria-selected={viewMode === 'eye-level'}
            className={`seg-btn ${viewMode === 'eye-level' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('eye-level')}
          >
            <Eye size={14} />
            <span>Visitor View</span>
          </button>
        </div>

        <div className="topbar-toggles">
          <button
            id="toggle-snap"
            className={`tool-chip ${config.snapToGrid ? 'active' : ''}`}
            onClick={() => onUpdateConfig({ snapToGrid: !config.snapToGrid })}
            title="Snap movement to grid"
          >
            <Magnet size={13} />
            <span>Snap</span>
          </button>
          <button
            id="toggle-dimensions"
            className={`tool-chip ${config.showDimensions ? 'active' : ''}`}
            onClick={() => onUpdateConfig({ showDimensions: !config.showDimensions })}
            title="Show booth dimensions & aisle markers"
          >
            <Ruler size={13} />
            <span>Dims</span>
          </button>
          <button
            id="toggle-figures"
            className={`tool-chip ${config.showScaleFigures ? 'active' : ''}`}
            onClick={() => onUpdateConfig({ showScaleFigures: !config.showScaleFigures })}
            title="Toggle 1.75m human scale visitors"
          >
            <Users size={13} />
            <span>Scale</span>
          </button>
          <button
            id="toggle-lighting"
            className="tool-chip"
            onClick={cycleLighting}
            title="Switch exhibition hall lighting atmosphere"
          >
            {config.lightingPreset === 'dramatic' ? (
              <Moon size={13} />
            ) : config.lightingPreset === 'daylight' ? (
              <Sun size={13} />
            ) : (
              <SunMedium size={13} />
            )}
            <span>{lightingLabel}</span>
          </button>
        </div>
      </div>

      <div className="topbar-right">
        <button
          id="btn-ai-designer"
          className={`agent-toggle-btn ${agentOpen ? 'active' : ''}`}
          onClick={onToggleAgent}
          title="Open AI Stand Designer (Chat & Voice)"
        >
          <Sparkles size={14} />
          <span>AI Designer</span>
        </button>
        <button id="btn-projects" className="ghost-btn" onClick={onOpenProjects}>
          <FolderOpen size={14} />
          <span>Projects</span>
        </button>
        <button id="btn-templates" className="ghost-btn" onClick={onOpenTemplates}>
          <LayoutTemplate size={14} />
          <span>Templates</span>
        </button>
        <button id="btn-estimate" className="estimate-pill-btn" onClick={onOpenEstimate}>
          <Calculator size={14} />
          <span className="mono-num">{formatMoney(estimatedTotalGbp, currency)}</span>
        </button>
        <button id="btn-export" className="primary-btn" onClick={onOpenExport}>
          <Download size={14} />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
