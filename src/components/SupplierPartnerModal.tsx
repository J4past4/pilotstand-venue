import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Send, Store, X } from 'lucide-react';
import './launchModals.css';

interface SupplierPartnerModalProps {
  open: boolean;
  onClose: () => void;
  defaultEmail?: string;
  defaultName?: string;
  defaultCompany?: string;
}

type PlanId = 'founding-pilot' | 'verified-catalog' | 'white-label-embed';

const SUPPLIER_CATEGORIES = [
  'Modular Walls & SEG',
  'AV & LED Displays',
  'Furniture Hire',
  'Counters & Kiosks',
  'Lighting & Truss',
  'Print & Graphics',
  'Full Turnkey Builds',
] as const;

const PLANS: Array<{ id: PlanId; badge: string; title: string; desc: string }> = [
  {
    id: 'founding-pilot',
    badge: 'Limited Free Pilot',
    title: 'Founding Supplier (90 Days)',
    desc: 'Host up to 25 real 3D SKUs free during public launch in exchange for feedback & case-study data.',
  },
  {
    id: 'verified-catalog',
    badge: 'Monthly Listing',
    title: 'Verified 3D Catalog + RFQs',
    desc: 'Your branded 3D kit inside the planner with live pricing and direct dimensioned BOM quote requests.',
  },
  {
    id: 'white-label-embed',
    badge: 'Enterprise SaaS',
    title: 'White-Label Website Embed',
    desc: 'Embed the 3D stand planner on your own domain pre-loaded exclusively with your inventory.',
  },
];

export const SupplierPartnerModal: React.FC<SupplierPartnerModalProps> = ({
  open,
  onClose,
  defaultEmail = '',
  defaultName = '',
  defaultCompany = '',
}) => {
  const [planInterest, setPlanInterest] = useState<PlanId>('founding-pilot');
  const [contactName, setContactName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [companyName, setCompanyName] = useState(defaultCompany);
  const [website, setWebsite] = useState('');
  const [categories, setCategories] = useState<string[]>(['Modular Walls & SEG']);
  const [region, setRegion] = useState('UK');
  const [skuCount, setSkuCount] = useState('26–100');
  const [cadReadiness, setCadReadiness] = useState('partial');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (contactName.trim().length < 2) {
      setErrorMsg('Please enter your contact name.');
      return;
    }
    if (!email.trim().includes('@')) {
      setErrorMsg('Please enter a valid work email address.');
      return;
    }
    if (companyName.trim().length < 2) {
      setErrorMsg('Please enter your company name.');
      return;
    }
    if (categories.length === 0) {
      setErrorMsg('Please select at least one product category you supply.');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/supplier-inquiry', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: contactName.trim(),
          email: email.trim(),
          companyName: companyName.trim(),
          website: website.trim() || undefined,
          categories,
          region,
          skuCount,
          cadReadiness,
          planInterest,
          notes: notes.trim() || undefined,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        setErrorMsg(data.error || 'Could not submit your inquiry right now. Please try again.');
        return;
      }

      setSubmitted(true);
    } catch {
      setErrorMsg('Network error while submitting your inquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="launch-modal-backdrop" onClick={onClose}>
      <div
        className="launch-modal-card wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-partner-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="launch-modal-head">
          <div>
            <span className="launch-modal-kicker">
              <Store size={11} />
              <span>For Exhibition Suppliers</span>
            </span>
            <h2 id="supplier-partner-modal-title" className="launch-modal-title">
              Host your 3D exhibition products in the planner
            </h2>
            <p className="launch-modal-sub">
              Put your modular walls, AV, furniture, or print systems directly inside exhibitors’
              3D stand specifications and receive pre-dimensioned Bill of Materials quote requests.
            </p>
          </div>
          <button
            type="button"
            className="launch-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {submitted ? (
          <div className="launch-success-box" role="status">
            <CheckCircle2 size={32} color="#16a34a" />
            <h3>Supplier Application Received</h3>
            <p>
              Thanks, <strong>{contactName}</strong>. We’ve logged{' '}
              <strong>{companyName}</strong> for our{' '}
              <strong>{PLANS.find((p) => p.id === planInterest)?.title}</strong> track and will
              follow up at <strong>{email}</strong> with onboarding details and live demand stats.
            </p>
            <button
              type="button"
              className="launch-submit-btn"
              style={{ padding: '0 20px' }}
              onClick={() => {
                setSubmitted(false);
                onClose();
              }}
            >
              Return to Planner
            </button>
          </div>
        ) : (
          <>
            <div className="launch-plan-grid" role="radiogroup" aria-label="Supplier partnership tier">
              {PLANS.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={planInterest === plan.id}
                  className={`launch-plan-card ${planInterest === plan.id ? 'active' : ''}`}
                  onClick={() => setPlanInterest(plan.id)}
                >
                  <span className="launch-plan-badge">{plan.badge}</span>
                  <h4>{plan.title}</h4>
                  <p>{plan.desc}</p>
                </button>
              ))}
            </div>

            <form className="launch-form" onSubmit={handleSubmit} noValidate>
              <div className="launch-form-grid">
                <label className="launch-field">
                  <span>Your Name</span>
                  <input
                    type="text"
                    required
                    placeholder="Jordan Reid"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    disabled={submitting}
                  />
                </label>

                <label className="launch-field">
                  <span>Work Email</span>
                  <input
                    type="email"
                    required
                    placeholder="jordan@supplier.co.uk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                  />
                </label>
              </div>

              <div className="launch-form-grid">
                <label className="launch-field">
                  <span>Company Name</span>
                  <input
                    type="text"
                    required
                    placeholder="ExpoKit Hire Ltd"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={submitting}
                  />
                </label>

                <label className="launch-field">
                  <span>
                    Website <span className="optional-tag">(optional)</span>
                  </span>
                  <input
                    type="url"
                    placeholder="https://expokit.co.uk"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    disabled={submitting}
                  />
                </label>
              </div>

              <div className="launch-field">
                <span>Product Categories You Supply</span>
                <div className="launch-chip-group">
                  {SUPPLIER_CATEGORIES.map((cat) => {
                    const active = categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        className={`launch-chip ${active ? 'active' : ''}`}
                        onClick={() => toggleCategory(cat)}
                        aria-pressed={active}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="launch-form-grid">
                <label className="launch-field">
                  <span>Primary Region Served</span>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="UK">United Kingdom</option>
                    <option value="Europe">Europe (EU / UK)</option>
                    <option value="North America">North America</option>
                    <option value="Global">Global</option>
                  </select>
                </label>

                <label className="launch-field">
                  <span>Approximate Product / SKU Count</span>
                  <select
                    value={skuCount}
                    onChange={(e) => setSkuCount(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="1–25">1 – 25 SKUs</option>
                    <option value="26–100">26 – 100 SKUs</option>
                    <option value="100–500">100 – 500 SKUs</option>
                    <option value="500+">500+ SKUs</option>
                  </select>
                </label>
              </div>

              <label className="launch-field">
                <span>3D / CAD File Readiness</span>
                <select
                  value={cadReadiness}
                  onChange={(e) => setCadReadiness(e.target.value)}
                  disabled={submitting}
                >
                  <option value="ready">Yes — we have 3D CAD (.GLB / .STEP / .DWG / .OBJ)</option>
                  <option value="partial">Partial — we have 2D spec sheets &amp; product photos</option>
                  <option value="need-help">We need help converting our catalog to 3D</option>
                </select>
              </label>

              <label className="launch-field">
                <span>
                  Notes / Key Product Lines <span className="optional-tag">(optional)</span>
                </span>
                <textarea
                  placeholder="Tell us about your flagship systems (e.g., beMatrix frames, SEG lightboxes, LED walls, lounge hire)…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                />
              </label>

              {errorMsg && (
                <div className="launch-error" role="alert">
                  {errorMsg}
                </div>
              )}

              <button type="submit" className="launch-submit-btn" disabled={submitting}>
                {submitting ? <Building2 size={15} /> : <Send size={15} />}
                <span>{submitting ? 'Submitting inquiry…' : 'Apply to Host Your Products'}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
