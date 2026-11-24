import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Calculator,
  ChevronDown,
  Download,
  Eye,
  FolderOpen,
  Grid2x2,
  LayoutTemplate,
  Magnet,
  Moon,
  Palette,
  Redo2,
  Ruler,
  SlidersHorizontal,
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
  onOpenSetupGuide: () => void;
  onOpenProjects: () => void;
  onOpenTemplates: () => void;
  onOpenEstimate: () => void;
  onOpenExport: () => void;
}

const LIGHTING_OPTIONS: { id: LightingPreset; label: string; icon: React.ReactNode }[] = [
  { id: 'expo-hall', label: 'Expo Hall', icon: <SunMedium size={13} /> },
  { id: 'daylight', label: 'Daylight', icon: <Sun size={13} /> },
  { id: 'dramatic', label: 'Keynote', icon: <Moon size={13} /> },
];

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
  onOpenSetupGuide,
  onOpenProjects,
  onOpenTemplates,
  onOpenEstimate,
  onOpenExport,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewMenuOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [viewMenuOpen]);

  return (
    <header className="studio-topbar" id="studio-topbar">
      <div className="topbar-left">
        <a
          className="brand-lockup"
          href="https://zukistudio.co.uk"
          target="_blank"
          rel="noopener noreferrer"
          title="Zuki — Exhibition Planner by Zuki Studio (zukistudio.co.uk)"
        >
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M6.5 7H17.5L7.5 17H17.5"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="17.5" cy="7" r="2" fill="#D95D39" />
            </svg>
          </div>
          <div className="brand-text-group">
            <span className="brand-wordmark">Zuki</span>
            <span className="brand-submark">Exhibition Planner</span>
          </div>
        </a>

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
            title={`Rename project: ${projectName}`}
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
            <span>Visitor</span>
          </button>
        </div>

        <div className="topbar-view-menu-wrap" ref={viewMenuRef}>
          <button
            id="btn-view-options"
            type="button"
            className={`tool-chip ${viewMenuOpen ? 'active' : ''}`}
            onClick={() => setViewMenuOpen((v) => !v)}
            aria-expanded={viewMenuOpen}
            aria-haspopup="menu"
            title="Display, snap & lighting options"
          >
            <SlidersHorizontal size={13} />
            <span>View</span>
            <ChevronDown size={12} />
          </button>

          {viewMenuOpen && (
            <div className="view-options-popover" role="menu" id="view-options-popover">
              <div className="view-popover-section">
                <span className="view-popover-label">Canvas Helpers</span>
                <label className="view-popover-toggle">
                  <span className="view-popover-toggle-left">
                    <Magnet size={13} />
                    <span>Snap to Grid</span>
                  </span>
                  <input
                    id="toggle-snap"
                    type="checkbox"
                    className="studio-switch"
                    checked={config.snapToGrid}
                    onChange={(e) => onUpdateConfig({ snapToGrid: e.target.checked })}
                  />
                </label>
                <label className="view-popover-toggle">
                  <span className="view-popover-toggle-left">
                    <Ruler size={13} />
                    <span>Dimensions & Aisles</span>
                  </span>
                  <input
                    id="toggle-dimensions"
                    type="checkbox"
                    className="studio-switch"
                    checked={config.showDimensions}
                    onChange={(e) => onUpdateConfig({ showDimensions: e.target.checked })}
                  />
                </label>
                <label className="view-popover-toggle">
                  <span className="view-popover-toggle-left">
                    <Users size={13} />
                    <span>Scale Visitors</span>
                  </span>
                  <input
                    id="toggle-figures"
                    type="checkbox"
                    className="studio-switch"
                    checked={config.showScaleFigures}
                    onChange={(e) => onUpdateConfig({ showScaleFigures: e.target.checked })}
                  />
                </label>
              </div>

              <div className="view-popover-divider" />

              <div className="view-popover-section">
                <span className="view-popover-label">Hall Lighting</span>
                <div className="view-lighting-grid">
                  {LIGHTING_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`view-lighting-btn ${config.lightingPreset === opt.id ? 'active' : ''}`}
                      onClick={() => onUpdateConfig({ lightingPreset: opt.id })}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="topbar-right">
        <button
          id="btn-brand-setup"
          className="ghost-btn"
          onClick={onOpenSetupGuide}
          title="Open Brand Kit & Stand Setup Guide"
        >
          <Palette size={14} />
          <span>Brand Setup</span>
        </button>
        <button
          id="btn-ai-designer"
          className={`agent-toggle-btn ${agentOpen ? 'active' : ''}`}
          onClick={onToggleAgent}
          title="Open AI Stand Designer (Chat & Voice)"
        >
          <Sparkles size={14} />
          <span>AI Designer</span>
        </button>
        <button
          id="btn-projects"
          className="ghost-btn topbar-collapse-label"
          onClick={onOpenProjects}
          title="Saved Projects"
        >
          <FolderOpen size={14} />
          <span>Projects</span>
        </button>
        <button
          id="btn-templates"
          className="ghost-btn topbar-collapse-label"
          onClick={onOpenTemplates}
          title="Stand Templates"
        >
          <LayoutTemplate size={14} />
          <span>Templates</span>
        </button>
        <button
          id="btn-estimate"
          className="estimate-pill-btn"
          onClick={onOpenEstimate}
          title="Live Budget Estimate & BOM"
        >
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
