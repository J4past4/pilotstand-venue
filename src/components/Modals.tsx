import React, { useRef } from 'react';
import {
  Camera,
  Check,
  FileJson,
  FileText,
  FolderPlus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { STAND_TEMPLATES } from '../data/templates';
import type {
  CurrencyCode,
  SavedProject,
  StandConfig,
  StandItem,
  StandTemplate,
} from '../types/stand';
import { calculateEstimate, formatMoney } from '../utils/pricing';

/* ===================== TEMPLATES GALLERY MODAL ===================== */
interface TemplatesModalProps {
  open: boolean;
  onClose: () => void;
  onApplyTemplate: (template: StandTemplate) => void;
  onStartBlank: (w: number, d: number, openSides: 1 | 2 | 3 | 4) => void;
}

export const TemplatesModal: React.FC<TemplatesModalProps> = ({
  open,
  onClose,
  onApplyTemplate,
  onStartBlank,
}) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Exhibition Stand Templates</span>
            <h2>Start From a Production-Ready Layout</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="templates-modal-grid">
          {STAND_TEMPLATES.map((tpl) => (
            <div key={tpl.id} className="tpl-gallery-card">
              <div className="tpl-gallery-badges">
                <span className="tpl-size-pill">{tpl.dimensionsLabel}</span>
                <span className="tpl-open-pill">{tpl.openSidesLabel}</span>
              </div>
              <h3>{tpl.name}</h3>
              <p>{tpl.subtitle}</p>
              <ul className="tpl-highlights">
                {tpl.highlights.map((h) => (
                  <li key={h}>
                    <Check size={13} /> {h}
                  </li>
                ))}
              </ul>
              <button
                className="primary-btn full-width"
                onClick={() => {
                  onApplyTemplate(tpl);
                  onClose();
                }}
              >
                Use This Template
              </button>
            </div>
          ))}

          <div className="tpl-gallery-card blank-card">
            <div className="tpl-gallery-badges">
              <span className="tpl-size-pill">Custom Size</span>
              <span className="tpl-open-pill">2m – 12m</span>
            </div>
            <h3>Blank Exhibition Space</h3>
            <p>Start with a clean empty booth footprint and build from scratch with our 26-item kit.</p>
            <div className="blank-quick-grid">
              <button
                className="secondary-btn"
                onClick={() => {
                  onStartBlank(3, 3, 1);
                  onClose();
                }}
              >
                3×3m Inline
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  onStartBlank(4, 3, 2);
                  onClose();
                }}
              >
                4×3m Corner
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  onStartBlank(6, 3, 3);
                  onClose();
                }}
              >
                6×3m Peninsula
              </button>
              <button
                className="secondary-btn"
                onClick={() => {
                  onStartBlank(6, 6, 4);
                  onClose();
                }}
              >
                6×6m Island
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ===================== LIVE ESTIMATE & BOM MODAL ===================== */
interface EstimateModalProps {
  open: boolean;
  onClose: () => void;
  config: StandConfig;
  items: StandItem[];
  currency: CurrencyCode;
  onChangeCurrency: (c: CurrencyCode) => void;
  pricingMode: 'hire' | 'buy';
  onChangePricingMode: (m: 'hire' | 'buy') => void;
  onExportBrief: () => void;
}

export const EstimateModal: React.FC<EstimateModalProps> = ({
  open,
  onClose,
  config,
  items,
  currency,
  onChangeCurrency,
  pricingMode,
  onChangePricingMode,
  onExportBrief,
}) => {
  if (!open) return null;
  const estimate = calculateEstimate(config, items, pricingMode);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet modal-medium" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Instant Budget &amp; Bill of Materials</span>
            <h2>Stand Specification &amp; Estimate</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="estimate-controls-bar">
          <div className="segmented-control">
            <button
              className={`seg-btn ${pricingMode === 'hire' ? 'active' : ''}`}
              onClick={() => onChangePricingMode('hire')}
            >
              Event Hire
            </button>
            <button
              className={`seg-btn ${pricingMode === 'buy' ? 'active' : ''}`}
              onClick={() => onChangePricingMode('buy')}
            >
              Outright Purchase
            </button>
          </div>

          <div className="mini-toggle">
            {(['GBP', 'USD', 'EUR'] as CurrencyCode[]).map((c) => (
              <button
                key={c}
                className={currency === c ? 'active' : ''}
                onClick={() => onChangeCurrency(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="bom-table-wrap">
          <table className="bom-table">
            <thead>
              <tr>
                <th>Item / Structure</th>
                <th className="num">Qty</th>
                <th className="num">Unit</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.label}</td>
                  <td className="num mono-num">{line.qty}</td>
                  <td className="num mono-num">{formatMoney(line.unitPriceGbp, currency)}</td>
                  <td className="num mono-num">
                    <strong>{formatMoney(line.totalGbp, currency)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="estimate-summary-box">
          <div className="est-row">
            <span>Equipment &amp; Structure Subtotal</span>
            <span className="mono-num">{formatMoney(estimate.subtotalGbp, currency)}</span>
          </div>
          <div className="est-row">
            <span>Custom Printed Graphics ({estimate.totalPrintAreaM2.toFixed(1)} m²)</span>
            <span className="mono-num">{formatMoney(estimate.printGraphicsGbp, currency)}</span>
          </div>
          <div className="est-row">
            <span>Delivery, Installation &amp; Power Package</span>
            <span className="mono-num">{formatMoney(estimate.installAndPowerGbp, currency)}</span>
          </div>
          <div className="est-row grand">
            <span>Estimated Total ({pricingMode === 'hire' ? 'Hire' : 'Purchase'})</span>
            <span className="mono-num">{formatMoney(estimate.grandTotalGbp, currency)}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="secondary-btn" onClick={onClose}>
            Back to Studio
          </button>
          <button className="primary-btn" onClick={onExportBrief}>
            <FileText size={14} />
            <span>Generate Production Brief &amp; PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ===================== PROJECTS MANAGER MODAL ===================== */
interface ProjectsModalProps {
  open: boolean;
  onClose: () => void;
  projects: SavedProject[];
  activeProjectId: string;
  onSaveNewCopy: () => void;
  onLoadProject: (proj: SavedProject) => void;
  onDeleteProject: (id: string) => void;
  onImportJson: (file: File) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({
  open,
  onClose,
  projects,
  activeProjectId,
  onSaveNewCopy,
  onLoadProject,
  onDeleteProject,
  onImportJson,
}) => {
  const importRef = useRef<HTMLInputElement | null>(null);
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet modal-medium" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Workspace Projects</span>
            <h2>Saved Exhibition Stands</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="projects-toolbar">
          <button className="primary-btn" onClick={onSaveNewCopy}>
            <FolderPlus size={14} />
            <span>Save Copy as New Version</span>
          </button>
          <button className="secondary-btn" onClick={() => importRef.current?.click()}>
            <Upload size={14} />
            <span>Import .JSON Project</span>
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onImportJson(f);
                onClose();
              }
              e.target.value = '';
            }}
          />
        </div>

        <div className="projects-list">
          {projects.map((p) => {
            const isCurrent = p.id === activeProjectId;
            return (
              <div key={p.id} className={`project-row ${isCurrent ? 'current' : ''}`}>
                <div>
                  <div className="project-row-title">
                    {p.name} {isCurrent && <span className="active-tag">Active</span>}
                  </div>
                  <div className="project-row-meta mono-num">
                    {p.config.width}×{p.config.depth}m · {p.items.length} items · Updated{' '}
                    {new Date(p.updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="project-row-actions">
                  {!isCurrent && (
                    <button
                      className="secondary-btn"
                      onClick={() => {
                        onLoadProject(p);
                        onClose();
                      }}
                    >
                      Open
                    </button>
                  )}
                  {projects.length > 1 && (
                    <button
                      className="tiny-icon-btn danger"
                      onClick={() => onDeleteProject(p.id)}
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ===================== EXPORT & SHARE MODAL ===================== */
interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  onDownloadPng: () => void;
  onExportBrief: () => void;
  onDownloadJson: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  onClose,
  onDownloadPng,
  onExportBrief,
  onDownloadJson,
}) => {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet modal-small" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Share &amp; Production Handoff</span>
            <h2>Export Stand Concept</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="export-options-stack">
          <button
            id="export-brief-btn"
            className="export-option-card"
            onClick={() => {
              onExportBrief();
              onClose();
            }}
          >
            <div className="export-icon primary">
              <FileText size={20} />
            </div>
            <div>
              <div className="export-title">Production Brief &amp; Print Schedule (PDF / Print)</div>
              <div className="export-desc">
                Includes 3D render, exact mm print artwork sizes for every wall/counter, color hex
                codes, and full equipment BOM.
              </div>
            </div>
          </button>

          <button
            id="export-png-btn"
            className="export-option-card"
            onClick={() => {
              onDownloadPng();
              onClose();
            }}
          >
            <div className="export-icon accent">
              <Camera size={20} />
            </div>
            <div>
              <div className="export-title">High-Resolution 3D Snapshot (PNG)</div>
              <div className="export-desc">
                Clean 1600×1000 studio render from your current camera angle — ideal for leadership
                sign-off slides.
              </div>
            </div>
          </button>

          <button
            id="export-json-btn"
            className="export-option-card"
            onClick={() => {
              onDownloadJson();
              onClose();
            }}
          >
            <div className="export-icon">
              <FileJson size={20} />
            </div>
            <div>
              <div className="export-title">Project Backup File (.JSON)</div>
              <div className="export-desc">
                Download full stand configuration &amp; uploaded branding assets to share with team
                members or reload later.
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
