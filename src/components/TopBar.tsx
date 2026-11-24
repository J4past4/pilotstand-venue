import React, { useEffect, useRef, useState } from 'react';
import { BrandMark } from './BrandMark';
import {
  BarChart3,
  Box,
  Calculator,
  ChevronDown,
  Eye,
  FolderOpen,
  Grid2x2,
  LayoutTemplate,
  LogOut,
  Magnet,
  Moon,
  Palette,
  Redo2,
  Ruler,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  SunMedium,
  Undo2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import type { CurrencyCode, LightingPreset, StandConfig, ViewMode } from '../types/stand';
import type { BetaUser } from './BetaAuthGate';
import { formatMoney } from '../utils/pricing';
import './header.css';

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
  betaUser?: BetaUser | null;
  publicLaunch?: boolean;
  onSignOut?: () => void;
  onOpenPublicAuth?: () => void;
  onOpenSupplierModal?: () => void;
  onOpenAdminInsights?: () => void;
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
  betaUser,
  publicLaunch,
  onSignOut,
  onOpenPublicAuth,
  onOpenSupplierModal,
  onOpenAdminInsights,
}) => {
  const estimateTotal = formatMoney(estimatedTotalGbp, currency);
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
      <div className="topbar-global">
        <a
          className="brand-lockup"
          href="https://pilotstand.com"
          target="_blank"
          rel="noopener noreferrer"
          title="PilotStand — Free 3D Exhibition Stand Planner (pilotstand.com)"
        >
          <div className="brand-mark" aria-hidden="true">
            <BrandMark size={24} />
          </div>
          <div className="brand-text-group">
            <span className="brand-wordmark">PilotStand</span>
            <span className="brand-submark">3D Exhibition Planner</span>
          </div>
        </a>
        <div className="topbar-right">
          <button
            id="btn-brand-setup"
            className="ghost-btn topbar-collapse-label"
            onClick={onOpenSetupGuide}
            title="Open Brand Kit & Stand Setup Guide"
            aria-label="Brand Setup"
          >
            <Palette size={14} />
            <span>Brand Setup</span>
          </button>
          <button
            id="btn-ai-designer"
            className={`agent-toggle-btn topbar-collapse-label ${agentOpen ? 'active' : ''}`}
            onClick={onToggleAgent}
            title="Open AI Stand Designer (Chat & Voice)"
            aria-label="AI Designer"
            aria-pressed={agentOpen}
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
            aria-label={`Budget estimate: ${estimateTotal}`}
          >
            <Calculator size={14} />
            <span className="mono-num">{estimateTotal}</span>
          </button>
          <button id="btn-export" className="primary-btn" onClick={onOpenExport}>
            <Upload size={14} />
            <span>Export brief</span>
          </button>
          {onOpenSupplierModal && (
            <button
              id="btn-for-suppliers"
              type="button"
              className="topbar-supplier-btn topbar-collapse-label"
              onClick={onOpenSupplierModal}
              title="List your 3D exhibition products in the planner"
            >
              <Store size={13} />
              <span>For Suppliers</span>
            </button>
          )}
          {betaUser?.role === 'admin' && onOpenAdminInsights && (
            <button
              id="btn-launch-insights"
              type="button"
              className="topbar-supplier-btn topbar-collapse-label"
              onClick={onOpenAdminInsights}
              title="View public launch signups, supplier inquiries, and BOM traction"
            >
              <BarChart3 size={13} />
              <span>Insights</span>
            </button>
          )}
          {publicLaunch && !betaUser && onOpenPublicAuth && (
            <button
              id="btn-free-account"
              type="button"
              className="topbar-free-signup-btn"
              onClick={onOpenPublicAuth}
              title="Create a free account or sign in to save & export"
            >
              <UserPlus size={13} />
              <span>Free Account</span>
            </button>
          )}
          {betaUser && onSignOut && (
            <div className="beta-user-pill" title={`Signed in as ${betaUser.email}`}>
              <span className="beta-user-pill-name">{betaUser.name}</span>
              <button
                type="button"
                className="beta-user-signout-btn"
                onClick={onSignOut}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="topbar-workspace">
        <div className="topbar-left">
          {editingName ? (
            <input
              id="project-name-input"
              className="project-name-input"
              aria-label="Project name"
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
              <ChevronDown size={14} aria-hidden="true" />
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
              <span>3D</span>
            </button>
            <button
              id="view-mode-2d"
              role="tab"
              aria-selected={viewMode === '2d'}
              className={`seg-btn ${viewMode === '2d' ? 'active' : ''}`}
              onClick={() => onChangeViewMode('2d')}
            >
              <Grid2x2 size={14} />
              <span>Plan</span>
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
      </div>
    </header>
  );
};
