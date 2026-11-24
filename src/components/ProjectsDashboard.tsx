import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Box,
  Copy,
  Download,
  FileImage,
  FolderOpen,
  Layers,
  LayoutTemplate,
  LogOut,
  Palette,
  Pencil,
  Play,
  Plus,
  Search,
  Store,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import type { CurrencyCode, SavedProject, StandTemplate } from '../types/stand';
import type { BetaUser } from './BetaAuthGate';
import { STAND_TEMPLATES } from '../data/templates';
import { calculateEstimate, formatMoney } from '../utils/pricing';
import './dashboard.css';

interface ProjectsDashboardProps {
  projects: SavedProject[];
  activeProjectId: string;
  currency: CurrencyCode;
  canReturnToEditor: boolean;
  customAssetCount: number;
  betaUser?: BetaUser | null;
  publicLaunch?: boolean;
  onSignOut?: () => void;
  onOpenPublicAuth?: () => void;
  onOpenSupplierModal?: () => void;
  onOpenAdminInsights?: () => void;
  onReturnToEditor: () => void;
  onOpenProject: (project: SavedProject) => void;
  onCreateBlankProject: () => void;
  onCreateFromTemplate: (template: StandTemplate) => void;
  onDuplicateProject: (project: SavedProject) => void;
  onRenameProject: (projectId: string, newName: string) => void;
  onDeleteProject: (projectId: string) => void;
  onExportProjectJson: (project: SavedProject) => void;
  onImportJson: (file: File) => void;
  onOpenSetupGuide: () => void;
  onStartWalkthrough: () => void;
  onOpenAssetLibrary: () => void;
  onOpenAssetCreator: (mode: 'shapes' | 'schematic') => void;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Updated just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `Updated ${diffDays}d ago`;
  return `Updated ${new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

function openSidesLabel(openSides: number): string {
  if (openSides === 1) return 'Inline';
  if (openSides === 2) return 'Corner';
  if (openSides === 3) return 'Peninsula';
  return 'Island';
}

/**
 * Lightweight 2D top-down architectural floorplan preview rendered directly from a project's real geometry.
 */
const ProjectFloorplanPreview: React.FC<{ project: SavedProject }> = ({ project }) => {
  const { config, items } = project;
  const w = Math.max(2, config.width || 4);
  const d = Math.max(2, config.depth || 3);
  const pad = 0.8;
  const vbW = w + pad * 2;
  const vbH = d + pad * 2;

  const floorFill =
    config.floorMaterial === 'oak-timber'
      ? '#d8be98'
      : config.floorMaterial === 'charcoal-carpet'
        ? '#3b424d'
        : config.floorMaterial === 'navy-carpet'
          ? '#243c5a'
          : config.floorMaterial === 'slate-tile'
            ? '#474e57'
            : '#e2ded6';

  return (
    <svg
      viewBox={`${-vbW / 2} ${-vbH / 2} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {/* Booth floor */}
      <rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        rx={0.12}
        fill={floorFill}
        stroke="#64748b"
        strokeWidth={0.06}
      />

      {/* Shell back/side walls if enabled */}
      {config.showShellWalls && config.openSides < 4 && (
        <line
          x1={-w / 2}
          y1={-d / 2}
          x2={w / 2}
          y2={-d / 2}
          stroke="#0f172a"
          strokeWidth={0.14}
          strokeLinecap="round"
        />
      )}
      {config.showShellWalls && config.openSides <= 2 && (
        <line
          x1={-w / 2}
          y1={-d / 2}
          x2={-w / 2}
          y2={d / 2}
          stroke="#0f172a"
          strokeWidth={0.14}
          strokeLinecap="round"
        />
      )}
      {config.showShellWalls && config.openSides === 1 && (
        <line
          x1={w / 2}
          y1={-d / 2}
          x2={w / 2}
          y2={d / 2}
          stroke="#0f172a"
          strokeWidth={0.14}
          strokeLinecap="round"
        />
      )}

      {/* Placed stand items */}
      {items.map((item) => {
        const iw = Math.max(0.22, item.dims?.w || 0.8);
        const id = Math.max(0.18, item.dims?.d || 0.5);
        const isOverhead = item.y > 2.0;
        const fill = isOverhead
          ? 'none'
          : item.catalogId === 'led-video-wall' || item.catalogId === 'seg-lightbox'
            ? config.primaryColor || '#1B365D'
            : item.catalogId === 'reception-desk' || item.catalogId === 'front-arch'
              ? config.accentColor || '#D95D39'
              : '#ffffff';

        return (
          <g
            key={item.id}
            transform={`translate(${item.x}, ${item.z}) rotate(${-(item.rotationY || 0)})`}
          >
            {item.catalogId === 'hanging-ring' ? (
              <circle
                cx={0}
                cy={0}
                r={iw * 0.45}
                fill="none"
                stroke={config.primaryColor || '#1B365D'}
                strokeWidth={0.14}
                strokeDasharray="0.22 0.12"
                opacity={0.75}
              />
            ) : (
              <rect
                x={-iw / 2}
                y={-id / 2}
                width={iw}
                height={id}
                rx={0.06}
                fill={fill}
                stroke={isOverhead ? '#475569' : '#0f172a'}
                strokeWidth={0.045}
                strokeDasharray={isOverhead ? '0.18 0.1' : undefined}
                opacity={isOverhead ? 0.65 : 0.94}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({
  projects,
  activeProjectId,
  currency,
  canReturnToEditor,
  customAssetCount,
  betaUser,
  publicLaunch,
  onSignOut,
  onOpenPublicAuth,
  onOpenSupplierModal,
  onOpenAdminInsights,
  onReturnToEditor,
  onOpenProject,
  onCreateBlankProject,
  onCreateFromTemplate,
  onDuplicateProject,
  onRenameProject,
  onDeleteProject,
  onExportProjectJson,
  onImportJson,
  onOpenSetupGuide,
  onStartWalkthrough,
  onOpenAssetLibrary,
  onOpenAssetCreator,
}) => {
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.config.brandName || '').toLowerCase().includes(q)
    );
  }, [projects, search]);

  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenameProject(id, trimmed);
    }
    setRenamingId(null);
  };

  return (
    <div className="dash-shell">
      {/* Top Navigation Bar */}
      <header className="dash-header">
        <div className="dash-brand">
          <div className="dash-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M2 2h11l8 10h-11L2 2Z" />
              <path d="M10 12h11l-8 10H2l8-10Z" opacity=".8" />
            </svg>
          </div>
          <span className="dash-brand-name">Zuki</span>
          <span className="dash-brand-sub">Exhibition Stand Planner</span>
        </div>

        <div className="dash-header-actions">
          {canReturnToEditor && (
            <button type="button" className="dash-ghost-btn" onClick={onReturnToEditor}>
              <ArrowLeft size={14} />
              <span>Back to Editor</span>
            </button>
          )}
          <button type="button" className="dash-ghost-btn" onClick={onStartWalkthrough}>
            <Play size={13} />
            <span>Walkthrough</span>
          </button>
          <button type="button" className="dash-ghost-btn" onClick={onOpenAssetLibrary}>
            <Layers size={14} />
            <span>Asset Library</span>
            {customAssetCount > 0 && (
              <span className="dash-header-badge mono-num">{customAssetCount}</span>
            )}
          </button>
          <button type="button" className="dash-ghost-btn" onClick={onOpenSetupGuide}>
            <Palette size={14} />
            <span>Brand Setup</span>
          </button>
          {onOpenSupplierModal && (
            <button
              type="button"
              className="dash-ghost-btn"
              onClick={onOpenSupplierModal}
              title="List your 3D exhibition products in the planner"
            >
              <Store size={14} />
              <span>For Suppliers</span>
            </button>
          )}
          {betaUser?.role === 'admin' && onOpenAdminInsights && (
            <button
              type="button"
              className="dash-ghost-btn"
              onClick={onOpenAdminInsights}
              title="View public launch signups, supplier inquiries, and BOM traction"
            >
              <BarChart3 size={14} />
              <span>Insights</span>
            </button>
          )}
          <button type="button" className="dash-primary-btn" onClick={onCreateBlankProject}>
            <Plus size={15} />
            <span>New Project</span>
          </button>
          {publicLaunch && !betaUser && onOpenPublicAuth && (
            <button
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
      </header>

      {/* Main Dashboard Content */}
      <main className="dash-main">
        <div className="dash-container">
          {/* Welcome & Actions Bar */}
          <div className="dash-hero-bar">
            <div>
              <h1 className="dash-hero-title">Your Stand Projects</h1>
              <p className="dash-hero-sub">
                Create a new stand, resume a saved design, build reusable custom assets, or start
                from a template.
              </p>
            </div>

            <div className="dash-toolbar">
              <div className="dash-search-wrap">
                <Search size={14} className="dash-search-icon" />
                <input
                  type="text"
                  className="dash-search-input"
                  placeholder="Search projects…"
                  aria-label="Search projects"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="dash-secondary-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                <span>Import .JSON</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportJson(file);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {/* Quick Asset Library & Asset Creator Options */}
          <section className="dash-quick-tools" aria-label="Asset tools">
            <button
              type="button"
              id="dash-open-asset-library"
              className="dash-quick-card"
              onClick={onOpenAssetLibrary}
            >
              <div className="dash-quick-icon">
                <Layers size={20} />
              </div>
              <div className="dash-quick-text">
                <div className="dash-quick-title-row">
                  <strong>Asset Library</strong>
                  <span className="dash-count-badge mono-num">{customAssetCount}</span>
                </div>
                <span>Browse, upload, name &amp; configure reusable 3D models and graphics</span>
              </div>
              <ArrowRight size={15} color="#94a3b8" />
            </button>

            <button
              type="button"
              id="dash-open-asset-creator"
              className="dash-quick-card"
              onClick={() => onOpenAssetCreator('shapes')}
            >
              <div className="dash-quick-icon accent">
                <Box size={20} />
              </div>
              <div className="dash-quick-text">
                <div className="dash-quick-title-row">
                  <strong>Asset Creator (Shapes)</strong>
                </div>
                <span>Build custom products, furniture, structures or machines with mm sizing</span>
              </div>
              <ArrowRight size={15} color="#94a3b8" />
            </button>

            <button
              type="button"
              id="dash-open-schematic-creator"
              className="dash-quick-card"
              onClick={() => onOpenAssetCreator('schematic')}
            >
              <div className="dash-quick-icon">
                <FileImage size={20} />
              </div>
              <div className="dash-quick-text">
                <div className="dash-quick-title-row">
                  <strong>2D Schematic to 3D</strong>
                </div>
                <span>Upload a 2D drawing to auto-generate or trace a scaled 3D asset</span>
              </div>
              <ArrowRight size={15} color="#94a3b8" />
            </button>
          </section>

          {/* Saved Projects Grid */}
          <section aria-label="Saved projects">
            <div className="dash-section-head">
              <h2 className="dash-section-title">
                <FolderOpen size={15} />
                <span>All Projects</span>
                <span className="dash-count-badge mono-num">{projects.length}</span>
              </h2>
            </div>

            {filteredProjects.length === 0 && search.trim() ? (
              <div className="dash-empty">
                <h3>No matching projects</h3>
                <p>No saved stands matched &ldquo;{search.trim()}&rdquo;.</p>
                <button
                  type="button"
                  className="dash-secondary-btn"
                  onClick={() => setSearch('')}
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="dash-grid">
                {/* Quick New Blank Stand Card */}
                <button
                  type="button"
                  className="dash-new-card"
                  onClick={onCreateBlankProject}
                >
                  <div className="dash-new-icon">
                    <Plus size={22} />
                  </div>
                  <strong>Create New Stand</strong>
                  <span>Start fresh with a clean 4m × 3m floor grid</span>
                </button>

                {filteredProjects.map((proj) => {
                  const isActive = proj.id === activeProjectId && canReturnToEditor;
                  const est = calculateEstimate(proj.config, proj.items, 'hire');
                  const isRenaming = renamingId === proj.id;
                  const isConfirmingDel = confirmDeleteId === proj.id;

                  return (
                    <article
                      key={proj.id}
                      className={`dash-card ${isActive ? 'active' : ''}`}
                    >
                      <div
                        className="dash-card-preview"
                        onClick={() => onOpenProject(proj)}
                        title={`Open ${proj.name}`}
                      >
                        <ProjectFloorplanPreview project={proj} />
                        {isActive && <span className="dash-active-pill">OPEN</span>}
                        <span className="dash-swatch-chip" aria-hidden="true">
                          <span style={{ background: proj.config.primaryColor || '#1B365D' }} />
                          <span style={{ background: proj.config.accentColor || '#D95D39' }} />
                        </span>
                      </div>

                      <div className="dash-card-body">
                        <div className="dash-card-title-row">
                          {isRenaming ? (
                            <input
                              type="text"
                              className="dash-rename-input"
                              value={renameDraft}
                              autoFocus
                              aria-label="Rename project"
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onBlur={() => commitRename(proj.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename(proj.id);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                            />
                          ) : (
                            <h3
                              className="dash-card-title"
                              onClick={() => onOpenProject(proj)}
                              title={proj.name}
                            >
                              {proj.name}
                            </h3>
                          )}
                          {!isRenaming && (
                            <button
                              type="button"
                              className="dash-icon-btn"
                              title="Rename project"
                              aria-label={`Rename ${proj.name}`}
                              onClick={() => {
                                setRenamingId(proj.id);
                                setRenameDraft(proj.name);
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                        </div>

                        <div className="dash-meta-row mono-num">
                          <span className="dash-meta-pill">
                            {proj.config.width}m × {proj.config.depth}m
                          </span>
                          <span className="dash-meta-pill">
                            {openSidesLabel(proj.config.openSides)}
                          </span>
                          <span className="dash-meta-pill">{proj.items.length} items</span>
                          <span className="dash-meta-pill">
                            {formatMoney(est.grandTotalGbp, currency)}
                          </span>
                        </div>

                        <div className="dash-meta-time">{formatRelativeTime(proj.updatedAt)}</div>
                      </div>

                      <div className="dash-card-footer">
                        <button
                          type="button"
                          className="dash-open-btn"
                          onClick={() => onOpenProject(proj)}
                        >
                          <span>{isActive ? 'Resume' : 'Open'}</span>
                          <ArrowRight size={13} />
                        </button>

                        <div className="dash-icon-actions">
                          <button
                            type="button"
                            className="dash-icon-btn"
                            title="Duplicate project"
                            aria-label={`Duplicate ${proj.name}`}
                            onClick={() => {
                              setConfirmDeleteId(null);
                              onDuplicateProject(proj);
                            }}
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            className="dash-icon-btn"
                            title="Export .JSON backup"
                            aria-label={`Export ${proj.name}`}
                            onClick={() => onExportProjectJson(proj)}
                          >
                            <Download size={14} />
                          </button>
                          {isConfirmingDel ? (
                            <button
                              type="button"
                              className="dash-confirm-del"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                onDeleteProject(proj.id);
                              }}
                              onMouseLeave={() => setConfirmDeleteId(null)}
                            >
                              Delete?
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="dash-icon-btn danger"
                              title="Delete project"
                              aria-label={`Delete ${proj.name}`}
                              onClick={() => setConfirmDeleteId(proj.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Start From a Template Section */}
          <section aria-label="Starter templates">
            <div className="dash-section-head">
              <h2 className="dash-section-title">
                <LayoutTemplate size={15} />
                <span>Start from a Template</span>
              </h2>
            </div>

            <div className="dash-templates-grid">
              {STAND_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="dash-tpl-card"
                  onClick={() => onCreateFromTemplate(tpl)}
                >
                  <div className="dash-tpl-top">
                    <span className="dash-tpl-dim mono-num">{tpl.dimensionsLabel}</span>
                    <ArrowRight size={13} color="#94a3b8" />
                  </div>
                  <h3 className="dash-tpl-name">{tpl.name}</h3>
                  <p className="dash-tpl-desc">{tpl.subtitle}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
