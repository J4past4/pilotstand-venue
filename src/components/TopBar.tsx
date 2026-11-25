import React, { useEffect, useRef, useState } from 'react';
import { BrandMark } from './BrandMark';
import {
  BarChart3,
  Box,
  Calculator,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  FolderOpen,
  Gauge,
  Grid2x2,
  LayoutTemplate,
  LogOut,
  Magnet,
  MessageSquarePlus,
  Monitor,
  Moon,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Redo2,
  Ruler,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Store,
  Sun,
  SunMedium,
  Undo2,
  Upload,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import type { CurrencyCode, LightingPreset, SavedProject, StandConfig, ViewMode } from '../types/stand';
import type { BetaUser } from './BetaAuthGate';
import { formatMoney } from '../utils/pricing';
import {
  PERFORMANCE_MODE_ORDER,
  PERFORMANCE_PROFILES,
  type PerformanceMode,
  type ViewportPerformanceMetrics,
} from '../utils/performanceMode';
import './header.css';

interface TopBarProps {
  projectName: string;
  onChangeProjectName: (name: string) => void;
  projects?: SavedProject[];
  activeProjectId?: string;
  onSelectProject?: (project: SavedProject) => void;
  onNewProject?: () => void;
  onOpenLoadModal?: () => void;
  onGoToDashboard?: () => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  config: StandConfig;
  onUpdateConfig: (patch: Partial<StandConfig>) => void;
  performanceMode: PerformanceMode;
  onChangePerformanceMode: (mode: PerformanceMode) => void;
  performanceMetrics?: ViewportPerformanceMetrics | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canCopy?: boolean;
  canPaste?: boolean;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
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
  onOpenFeedbackBoard?: () => void;
}

const LIGHTING_OPTIONS: { id: LightingPreset; label: string; icon: React.ReactNode }[] = [
  { id: 'expo-hall', label: 'Expo Hall', icon: <SunMedium size={13} /> },
  { id: 'daylight', label: 'Daylight', icon: <Sun size={13} /> },
  { id: 'dramatic', label: 'Keynote', icon: <Moon size={13} /> },
];

function getPerformanceIcon(mode: PerformanceMode, size = 13): React.ReactNode {
  if (mode === 'eco') return <Zap size={size} />;
  if (mode === 'balanced') return <Gauge size={size} />;
  return <Monitor size={size} />;
}

export const TopBar: React.FC<TopBarProps> = React.memo(({
  projectName,
  onChangeProjectName,
  projects = [],
  activeProjectId,
  onSelectProject,
  onNewProject,
  onOpenLoadModal,
  onGoToDashboard,
  viewMode,
  onChangeViewMode,
  config,
  onUpdateConfig,
  performanceMode,
  onChangePerformanceMode,
  performanceMetrics,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canCopy = false,
  canPaste = false,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
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
  onOpenFeedbackBoard,
}) => {
  const estimateTotal = formatMoney(estimatedTotalGbp, currency);
  const activePerfProfile = PERFORMANCE_PROFILES[performanceMode];
  const [editingName, setEditingName] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [perfMenuOpen, setPerfMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const perfMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!viewMenuOpen && !perfMenuOpen && !moreMenuOpen && !projectMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (projectMenuOpen && projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false);
      }
      if (viewMenuOpen && viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
      if (perfMenuOpen && perfMenuRef.current && !perfMenuRef.current.contains(e.target as Node)) {
        setPerfMenuOpen(false);
      }
      if (moreMenuOpen && moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProjectMenuOpen(false);
        setViewMenuOpen(false);
        setPerfMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [viewMenuOpen, perfMenuOpen, moreMenuOpen, projectMenuOpen]);

  const handleLogoClick = onGoToDashboard || onOpenProjects;
  const recentProjects = [...projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);

  return (
    <header className="studio-topbar" id="studio-topbar">
      <div className="topbar-global">
        <button
          type="button"
          className="brand-lockup"
          onClick={handleLogoClick}
          title="PilotStand — Back to main dashboard"
          aria-label="PilotStand — Back to main dashboard"
        >
          <div className="brand-mark" aria-hidden="true">
            <BrandMark size={24} />
          </div>
          <div className="brand-text-group">
            <span className="brand-wordmark">PilotStand</span>
            <span className="brand-submark">3D Exhibition Planner</span>
          </div>
        </button>
        <div className="topbar-right">
          <button
            id="btn-brand-setup"
            className="ghost-btn topbar-collapse-label topbar-secondary-desktop"
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
            className="ghost-btn topbar-collapse-label topbar-secondary-desktop"
            onClick={onOpenProjects}
            title="Saved Projects"
          >
            <FolderOpen size={14} />
            <span>Projects</span>
          </button>
          <button
            id="btn-templates"
            className="ghost-btn topbar-collapse-label topbar-secondary-desktop"
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
          {onOpenFeedbackBoard && (
            <button
              id="btn-feedback-board"
              type="button"
              className="topbar-supplier-btn topbar-collapse-label topbar-secondary-desktop"
              onClick={onOpenFeedbackBoard}
              title="Report an issue or suggest an improvement"
            >
              <MessageSquarePlus size={13} />
              <span>Feedback</span>
            </button>
          )}
          {onOpenSupplierModal && (
            <button
              id="btn-for-suppliers"
              type="button"
              className="topbar-supplier-btn topbar-collapse-label topbar-secondary-desktop"
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
              className="topbar-supplier-btn topbar-collapse-label topbar-secondary-desktop"
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
              className="topbar-free-signup-btn topbar-secondary-desktop"
              onClick={onOpenPublicAuth}
              title="Create a free account or sign in to save & export"
            >
              <UserPlus size={13} />
              <span>Free Account</span>
            </button>
          )}
          {betaUser && onSignOut && (
            <div className="beta-user-pill topbar-secondary-desktop" title={`Signed in as ${betaUser.email}`}>
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

          {/* Responsive overflow menu for compact laptops, tablets & mobile */}
          <div className="topbar-more-wrap" ref={moreMenuRef}>
            <button
              id="btn-topbar-more"
              type="button"
              className={`ghost-btn topbar-more-btn ${moreMenuOpen ? 'active' : ''}`}
              onClick={() => setMoreMenuOpen((v) => !v)}
              aria-expanded={moreMenuOpen}
              aria-haspopup="menu"
              aria-label="More studio actions"
              title="More studio actions"
            >
              <MoreHorizontal size={16} />
            </button>
            {moreMenuOpen && (
              <div className="topbar-more-popover" role="menu" aria-label="More studio actions">
                {onNewProject && (
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item highlight"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onNewProject();
                    }}
                  >
                    <Plus size={14} />
                    <span>New Project</span>
                  </button>
                )}
                {onOpenLoadModal && (
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenLoadModal();
                    }}
                  >
                    <FolderOpen size={14} />
                    <span>Load Project</span>
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="topbar-more-item"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onOpenProjects();
                  }}
                >
                  <FolderOpen size={14} />
                  <span>All Projects</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="topbar-more-item"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onOpenTemplates();
                  }}
                >
                  <LayoutTemplate size={14} />
                  <span>Templates</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="topbar-more-item"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onOpenSetupGuide();
                  }}
                >
                  <Palette size={14} />
                  <span>Brand Setup</span>
                </button>
                {onOpenFeedbackBoard && (
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenFeedbackBoard();
                    }}
                  >
                    <MessageSquarePlus size={14} />
                    <span>Report Issue / Suggest Improvement</span>
                  </button>
                )}
                {onOpenSupplierModal && (
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenSupplierModal();
                    }}
                  >
                    <Store size={14} />
                    <span>For Suppliers</span>
                  </button>
                )}
                {betaUser?.role === 'admin' && onOpenAdminInsights && (
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenAdminInsights();
                    }}
                  >
                    <BarChart3 size={14} />
                    <span>Insights</span>
                  </button>
                )}
                {publicLaunch && !betaUser && onOpenPublicAuth && (
                  <>
                    <div className="topbar-more-divider" />
                    <button
                      type="button"
                      role="menuitem"
                      className="topbar-more-item highlight"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        onOpenPublicAuth();
                      }}
                    >
                      <UserPlus size={14} />
                      <span>Free Account</span>
                    </button>
                  </>
                )}
                {betaUser && onSignOut && (
                  <>
                    <div className="topbar-more-divider" />
                    <div className="topbar-more-user">
                      <span>{betaUser.name}</span>
                      <button
                        type="button"
                        role="menuitem"
                        className="topbar-more-signout"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          onSignOut();
                        }}
                      >
                        <LogOut size={13} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
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
            <div className="project-switcher-wrap" ref={projectMenuRef}>
              <button
                id="project-name-btn"
                type="button"
                className={`project-name-btn ${projectMenuOpen ? 'active' : ''}`}
                onClick={() => setProjectMenuOpen((v) => !v)}
                onDoubleClick={() => {
                  setProjectMenuOpen(false);
                  setEditingName(true);
                }}
                aria-expanded={projectMenuOpen}
                aria-haspopup="menu"
                title={`${projectName} — Click for project menu, double-click to rename`}
              >
                <span className="project-name-text">{projectName}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>

              {projectMenuOpen && (
                <div className="project-menu-popover" role="menu" aria-label="Project actions">
                  {onNewProject && (
                    <button
                      type="button"
                      role="menuitem"
                      className="topbar-more-item highlight"
                      onClick={() => {
                        setProjectMenuOpen(false);
                        onNewProject();
                      }}
                    >
                      <Plus size={14} />
                      <span>New Blank Project</span>
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      onOpenTemplates();
                    }}
                  >
                    <LayoutTemplate size={14} />
                    <span>New from Template…</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      if (onOpenLoadModal) {
                        onOpenLoadModal();
                      } else {
                        onOpenProjects();
                      }
                    }}
                  >
                    <FolderOpen size={14} />
                    <span>Load / Import Project…</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      setEditingName(true);
                    }}
                  >
                    <Pencil size={14} />
                    <span>Rename Current Project</span>
                  </button>

                  {recentProjects.length > 0 && onSelectProject && (
                    <>
                      <div className="topbar-more-divider" />
                      <div className="project-menu-section-label">Switch Project</div>
                      {recentProjects.map((proj) => {
                        const isActive = proj.id === activeProjectId;
                        return (
                          <button
                            key={proj.id}
                            type="button"
                            role="menuitem"
                            className={`topbar-more-item ${isActive ? 'active-project' : ''}`}
                            onClick={() => {
                              setProjectMenuOpen(false);
                              if (!isActive) onSelectProject(proj);
                            }}
                          >
                            <span className="project-menu-item-check">
                              {isActive ? <Check size={13} /> : null}
                            </span>
                            <span className="project-menu-item-name">{proj.name}</span>
                          </button>
                        );
                      })}
                    </>
                  )}

                  <div className="topbar-more-divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="topbar-more-item"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      onOpenProjects();
                    }}
                  >
                    <FolderOpen size={14} />
                    <span>All Projects Dashboard</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {(onNewProject || onOpenLoadModal) && (
            <div className="topbar-project-actions" role="group" aria-label="Project actions">
              {onNewProject && (
                <button
                  id="btn-new-project"
                  type="button"
                  className="topbar-project-btn primary"
                  onClick={onNewProject}
                  title="Start a new blank exhibition stand project"
                >
                  <Plus size={13} />
                  <span>New Project</span>
                </button>
              )}
              {onOpenLoadModal && (
                <button
                  id="btn-load-project"
                  type="button"
                  className="topbar-project-btn"
                  onClick={onOpenLoadModal}
                  title="Load a saved project or import .JSON"
                >
                  <FolderOpen size={13} />
                  <span>Load</span>
                </button>
              )}
            </div>
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
              title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
              aria-label="Redo"
            >
              <Redo2 size={15} />
            </button>
            {onCopy && onCut && onPaste && onDuplicate && (
              <span className="topbar-clipboard-group">
                <span className="topbar-icon-sep" aria-hidden="true" />
                <button
                  id="btn-copy"
                  className="icon-btn"
                  disabled={!canCopy}
                  onClick={onCopy}
                  title="Copy selected item (Ctrl+C)"
                  aria-label="Copy"
                >
                  <Copy size={14} />
                </button>
                <button
                  id="btn-cut"
                  className="icon-btn"
                  disabled={!canCopy}
                  onClick={onCut}
                  title="Cut selected item (Ctrl+X)"
                  aria-label="Cut"
                >
                  <Scissors size={14} />
                </button>
                <button
                  id="btn-paste"
                  className="icon-btn"
                  disabled={!canPaste}
                  onClick={onPaste}
                  title="Paste item (Ctrl+V)"
                  aria-label="Paste"
                >
                  <ClipboardPaste size={14} />
                </button>
                <button
                  id="btn-duplicate"
                  className="icon-btn"
                  disabled={!canCopy}
                  onClick={onDuplicate}
                  title="Duplicate selected item (Ctrl+D)"
                  aria-label="Duplicate"
                >
                  <CopyPlus size={14} />
                </button>
              </span>
            )}
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

          <div className="topbar-view-menu-wrap" ref={perfMenuRef}>
            <button
              id="btn-performance-mode"
              type="button"
              className={`tool-chip perf-mode-chip perf-mode-${performanceMode} ${perfMenuOpen ? 'active' : ''}`}
              onClick={() => {
                setViewMenuOpen(false);
                setPerfMenuOpen((v) => !v);
              }}
              aria-expanded={perfMenuOpen}
              aria-haspopup="menu"
              title={`Graphics & Performance: ${activePerfProfile.label} (${activePerfProfile.deviceHint})`}
              aria-label={`Performance mode: ${activePerfProfile.label}`}
            >
              {getPerformanceIcon(performanceMode, 13)}
              <span>{activePerfProfile.shortLabel}</span>
              <ChevronDown size={12} />
            </button>

            {perfMenuOpen && (
              <div
                className="view-options-popover perf-mode-popover"
                role="menu"
                id="performance-mode-popover"
                aria-label="Device performance modes"
              >
                <div className="perf-popover-head">
                  <span className="view-popover-label">Device Performance</span>
                  {performanceMetrics && (
                    <span className="perf-metrics-pill">
                      {performanceMetrics.isSoftwareWebGL
                        ? 'CPU WebGL'
                        : performanceMetrics.isIdle
                          ? 'Idle · GPU sleeping'
                          : performanceMetrics.avgFps !== null
                            ? `${performanceMetrics.avgFps} FPS`
                            : 'Measuring…'}
                    </span>
                  )}
                </div>

                <div className="perf-mode-list">
                  {PERFORMANCE_MODE_ORDER.map((modeId) => {
                    const profile = PERFORMANCE_PROFILES[modeId];
                    const isSelected = performanceMode === modeId;
                    return (
                      <button
                        key={modeId}
                        id={`perf-mode-opt-${modeId}`}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isSelected}
                        className={`perf-mode-option ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          onChangePerformanceMode(modeId);
                          setPerfMenuOpen(false);
                        }}
                      >
                        <div className="perf-mode-opt-icon" aria-hidden="true">
                          {getPerformanceIcon(modeId, 15)}
                        </div>
                        <div className="perf-mode-opt-text">
                          <div className="perf-mode-opt-title">
                            <span>{profile.label}</span>
                            {isSelected && <Check size={13} aria-hidden="true" />}
                          </div>
                          <span className="perf-mode-opt-tagline">{profile.tagline}</span>
                          <span className="perf-mode-opt-hint">{profile.deviceHint}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="perf-popover-foot">
                  Saved for this device · PNG exports always render crisp
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});
