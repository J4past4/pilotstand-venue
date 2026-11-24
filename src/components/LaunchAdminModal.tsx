import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, RefreshCw, X } from 'lucide-react';
import './launchModals.css';

interface LaunchAdminData {
  accessMode: string;
  durableStorageConnected: boolean;
  summary: {
    totalRegisteredUsers: number;
    publicLaunchSignups: number;
    marketingOptIns: number;
    supplierInquiriesCount: number;
    quoteRequestsCount: number;
    standsCreated: number;
    briefsExported: number;
    pngsExported: number;
    totalEstimatedBomGbp: number;
    totalStandAreaM2: number;
    topCategories: Array<{ category: string; count: number }>;
  };
  users: Array<{
    email: string;
    name: string;
    company?: string;
    userType?: string;
    upcomingEvent?: string;
    standSize?: string;
    marketingOptIn?: boolean;
    source?: string;
    createdAt?: number;
  }>;
  supplierInquiries: Array<{
    id: string;
    contactName: string;
    email: string;
    companyName: string;
    categories: string[];
    region: string;
    skuCount: string;
    planInterest: string;
    createdAt: number;
  }>;
  quoteRequests: Array<{
    id: string;
    contactName: string;
    email: string;
    company?: string;
    eventName?: string;
    standWidthM: number;
    standDepthM: number;
    itemCount: number;
    estimatedTotalGbp: number;
    createdAt: number;
  }>;
}

interface LaunchAdminModalProps {
  open: boolean;
  onClose: () => void;
}

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const csv = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((r) => r.map(escapeCsvCell).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const LaunchAdminModal: React.FC<LaunchAdminModalProps> = ({ open, onClose }) => {
  const [tab, setTab] = useState<'users' | 'suppliers' | 'quotes'>('users');
  const [data, setData] = useState<LaunchAdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchAdminData = useCallback(async () => {
    const resp = await fetch('/api/admin/launch-data', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const json = (await resp.json().catch(() => ({}))) as LaunchAdminData & {
      ok?: boolean;
      error?: string;
    };
    if (!resp.ok || !json.ok) {
      throw new Error(json.error || 'Could not load launch insights.');
    }
    return json;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await fetchAdminData();
      setData(json);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error loading launch insights.');
    } finally {
      setLoading(false);
    }
  }, [fetchAdminData]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchAdminData()
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setErrorMsg(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Network error loading launch insights.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchAdminData]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleExportCsv = () => {
    if (!data) return;
    if (tab === 'users') {
      downloadCsv(
        'zuki-launch-signups.csv',
        ['Name', 'Email', 'Company', 'Role', 'Stand Size', 'Upcoming Event', 'Marketing Opt-In', 'Source', 'Created'],
        data.users.map((u) => [
          u.name,
          u.email,
          u.company || '',
          u.userType || '',
          u.standSize || '',
          u.upcomingEvent || '',
          u.marketingOptIn ? 'Yes' : 'No',
          u.source || '',
          u.createdAt ? new Date(u.createdAt).toISOString() : '',
        ])
      );
    } else if (tab === 'suppliers') {
      downloadCsv(
        'zuki-supplier-inquiries.csv',
        ['Company', 'Contact', 'Email', 'Plan', 'Region', 'SKUs', 'Categories', 'Created'],
        data.supplierInquiries.map((s) => [
          s.companyName,
          s.contactName,
          s.email,
          s.planInterest,
          s.region,
          s.skuCount,
          s.categories.join('; '),
          new Date(s.createdAt).toISOString(),
        ])
      );
    } else {
      downloadCsv(
        'zuki-quote-requests.csv',
        ['Contact', 'Email', 'Company', 'Event', 'Stand (m)', 'Items', 'Est GBP', 'Created'],
        data.quoteRequests.map((q) => [
          q.contactName,
          q.email,
          q.company || '',
          q.eventName || '',
          `${q.standWidthM}x${q.standDepthM}`,
          q.itemCount,
          q.estimatedTotalGbp,
          new Date(q.createdAt).toISOString(),
        ])
      );
    }
  };

  return (
    <div className="launch-modal-backdrop" onClick={onClose}>
      <div
        className="launch-modal-card xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-admin-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="launch-modal-head">
          <div>
            <span className="launch-modal-kicker">
              <BarChart3 size={11} />
              <span>Founder Launch Insights</span>
            </span>
            <h2 id="launch-admin-title" className="launch-modal-title">
              Public Launch Traction &amp; Monetisation Pipeline
            </h2>
            <p className="launch-modal-sub">
              Live signups, supplier catalog applications, BOM quote requests, and specified stand
              volume to pitch suppliers.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="launch-close-btn"
              onClick={() => void loadData()}
              aria-label="Refresh"
              title="Refresh data"
            >
              <RefreshCw size={15} />
            </button>
            <button type="button" className="launch-close-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="launch-error" role="alert" style={{ marginBottom: 14 }}>
            {errorMsg}
          </div>
        )}

        {loading && !data ? (
          <p className="launch-modal-sub">Loading launch metrics…</p>
        ) : data ? (
          <>
            <div className="admin-kpi-grid">
              <div className="admin-kpi-card">
                <div className="admin-kpi-label">Registered Users</div>
                <div className="admin-kpi-value">{data.summary.totalRegisteredUsers}</div>
              </div>
              <div className="admin-kpi-card">
                <div className="admin-kpi-label">Supplier Inquiries</div>
                <div className="admin-kpi-value">{data.summary.supplierInquiriesCount}</div>
              </div>
              <div className="admin-kpi-card">
                <div className="admin-kpi-label">Quote Requests</div>
                <div className="admin-kpi-value">{data.summary.quoteRequestsCount}</div>
              </div>
              <div className="admin-kpi-card">
                <div className="admin-kpi-label">BOM Specified</div>
                <div className="admin-kpi-value">
                  £{data.summary.totalEstimatedBomGbp.toLocaleString('en-GB')}
                </div>
              </div>
            </div>

            <div className="launch-footer-bar" style={{ marginTop: 0, marginBottom: 12, paddingTop: 0, borderTop: 'none' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`launch-chip ${tab === 'users' ? 'active' : ''}`}
                  onClick={() => setTab('users')}
                >
                  Users ({data.users.length})
                </button>
                <button
                  type="button"
                  className={`launch-chip ${tab === 'suppliers' ? 'active' : ''}`}
                  onClick={() => setTab('suppliers')}
                >
                  Suppliers ({data.supplierInquiries.length})
                </button>
                <button
                  type="button"
                  className={`launch-chip ${tab === 'quotes' ? 'active' : ''}`}
                  onClick={() => setTab('quotes')}
                >
                  Quote Requests ({data.quoteRequests.length})
                </button>
              </div>

              <button type="button" className="launch-link-btn" onClick={handleExportCsv}>
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>

            <div className="admin-table-wrap">
              {tab === 'users' && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Company</th>
                      <th>Type</th>
                      <th>Stand Size</th>
                      <th>Next Event</th>
                      <th>Opt-In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No registered users yet.</td>
                      </tr>
                    ) : (
                      data.users.map((u) => (
                        <tr key={u.email}>
                          <td>{u.name}</td>
                          <td>{u.email}</td>
                          <td>{u.company || '—'}</td>
                          <td>{u.userType || '—'}</td>
                          <td>{u.standSize || '—'}</td>
                          <td>{u.upcomingEvent || '—'}</td>
                          <td>{u.marketingOptIn ? 'Yes' : 'No'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {tab === 'suppliers' && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Plan</th>
                      <th>Region</th>
                      <th>SKUs</th>
                      <th>Categories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.supplierInquiries.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No supplier applications yet.</td>
                      </tr>
                    ) : (
                      data.supplierInquiries.map((s) => (
                        <tr key={s.id}>
                          <td>{s.companyName}</td>
                          <td>{s.contactName}</td>
                          <td>{s.email}</td>
                          <td>{s.planInterest}</td>
                          <td>{s.region}</td>
                          <td>{s.skuCount}</td>
                          <td>{s.categories.join(', ')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {tab === 'quotes' && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Email</th>
                      <th>Company</th>
                      <th>Event</th>
                      <th>Stand</th>
                      <th>Items</th>
                      <th>Est. GBP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.quoteRequests.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No quote requests yet.</td>
                      </tr>
                    ) : (
                      data.quoteRequests.map((q) => (
                        <tr key={q.id}>
                          <td>{q.contactName}</td>
                          <td>{q.email}</td>
                          <td>{q.company || '—'}</td>
                          <td>{q.eventName || '—'}</td>
                          <td>
                            {q.standWidthM}×{q.standDepthM}m
                          </td>
                          <td>{q.itemCount}</td>
                          <td>£{q.estimatedTotalGbp.toLocaleString('en-GB')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
