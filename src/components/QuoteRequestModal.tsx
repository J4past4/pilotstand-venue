import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileCheck2, Send, X } from 'lucide-react';
import type { CurrencyCode, StandConfig, StandItem } from '../types/stand';
import { calculateEstimate, formatMoney } from '../utils/pricing';
import { trackLaunchMetric } from '../utils/launchMetrics';
import './launchModals.css';

interface QuoteRequestModalProps {
  open: boolean;
  onClose: () => void;
  config: StandConfig;
  items: StandItem[];
  currency: CurrencyCode;
  pricingMode: 'hire' | 'buy';
  defaultName?: string;
  defaultEmail?: string;
  defaultCompany?: string;
}

export const QuoteRequestModal: React.FC<QuoteRequestModalProps> = ({
  open,
  onClose,
  config,
  items,
  currency,
  pricingMode,
  defaultName = '',
  defaultEmail = '',
  defaultCompany = '',
}) => {
  const [contactName, setContactName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [company, setCompany] = useState(defaultCompany || config.brandName || '');
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
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

  const estimate = calculateEstimate(config, items, pricingMode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (contactName.trim().length < 2) {
      setErrorMsg('Please enter your name.');
      return;
    }
    if (!email.trim().includes('@')) {
      setErrorMsg('Please enter a valid work email address.');
      return;
    }
    if (!consent) {
      setErrorMsg('Please tick the consent box so we can match your stand brief with suppliers.');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/quote-request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: contactName.trim(),
          email: email.trim(),
          company: company.trim() || undefined,
          eventName: eventName.trim() || undefined,
          eventDate: eventDate.trim() || undefined,
          eventLocation: eventLocation.trim() || undefined,
          pricingMode,
          currency,
          standWidthM: config.width,
          standDepthM: config.depth,
          openSides: config.openSides,
          itemCount: items.length,
          totalPrintAreaM2: Number(estimate.totalPrintAreaM2.toFixed(1)),
          estimatedTotalGbp: Math.round(estimate.grandTotalGbp),
          itemsSummary: estimate.lines.map((l) => ({
            label: l.label,
            qty: l.qty,
            totalGbp: Math.round(l.totalGbp),
          })),
          notes: notes.trim() || undefined,
          consentToShareWithSuppliers: true,
        }),
      });

      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!resp.ok || !data.ok) {
        setErrorMsg(data.error || 'Unable to submit your quote request right now.');
        return;
      }

      trackLaunchMetric({
        event: 'quote_requested',
        estimatedTotalGbp: Math.round(estimate.grandTotalGbp),
        standAreaM2: Math.round(config.width * config.depth),
      });
      setSubmitted(true);
    } catch {
      setErrorMsg('Network error while submitting your quote request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="launch-modal-backdrop" onClick={onClose}>
      <div
        className="launch-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-request-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="launch-modal-head">
          <div>
            <span className="launch-modal-kicker">
              <FileCheck2 size={11} />
              <span>Supplier Quote Handoff</span>
            </span>
            <h2 id="quote-request-modal-title" className="launch-modal-title">
              Request quotes for this stand
            </h2>
            <p className="launch-modal-sub">
              Send your exact stand dimensions, itemised BOM, and print area to vetted exhibition
              suppliers for real pricing.
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

        <div className="launch-summary-strip">
          <div className="launch-summary-cell">
            <span>Footprint</span>
            <strong>
              {config.width}×{config.depth}m
            </strong>
          </div>
          <div className="launch-summary-cell">
            <span>Items</span>
            <strong>{items.length}</strong>
          </div>
          <div className="launch-summary-cell">
            <span>Print Area</span>
            <strong>{estimate.totalPrintAreaM2.toFixed(1)} m²</strong>
          </div>
          <div className="launch-summary-cell">
            <span>Est. ({pricingMode === 'hire' ? 'Hire' : 'Buy'})</span>
            <strong>{formatMoney(estimate.grandTotalGbp, currency)}</strong>
          </div>
        </div>

        {submitted ? (
          <div className="launch-success-box" role="status">
            <CheckCircle2 size={32} color="#16a34a" />
            <h3>Stand Brief Sent for Quotes</h3>
            <p>
              We’ve received your {config.width}×{config.depth}m stand specification (
              {items.length} items) and will connect you with relevant suppliers at{' '}
              <strong>{email}</strong>.
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
              Back to Studio
            </button>
          </div>
        ) : (
          <form className="launch-form" onSubmit={handleSubmit} noValidate>
            <div className="launch-form-grid">
              <label className="launch-field">
                <span>Your Name</span>
                <input
                  type="text"
                  required
                  placeholder="Alex Taylor"
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
                  placeholder="alex@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="launch-form-grid">
              <label className="launch-field">
                <span>
                  Company <span className="optional-tag">(optional)</span>
                </span>
                <input
                  type="text"
                  placeholder="Company name"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="launch-field">
                <span>
                  Event / Venue <span className="optional-tag">(optional)</span>
                </span>
                <input
                  type="text"
                  placeholder="e.g. NEC Birmingham"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  disabled={submitting}
                />
              </label>
            </div>

            <div className="launch-form-grid">
              <label className="launch-field">
                <span>
                  Trade Show Name <span className="optional-tag">(optional)</span>
                </span>
                <input
                  type="text"
                  placeholder="e.g. Manufacturing Expo"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="launch-field">
                <span>
                  Show Date <span className="optional-tag">(optional)</span>
                </span>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  disabled={submitting}
                />
              </label>
            </div>

            <label className="launch-field">
              <span>
                Additional Requirements <span className="optional-tag">(optional)</span>
              </span>
              <textarea
                placeholder="Power drop requirements, delivery deadlines, installation help, or budget range…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
              />
            </label>

            <label className="launch-checkbox">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={submitting}
              />
              <span>
                I consent to share this stand specification and my contact email with vetted
                exhibition suppliers so they can send quotes.
              </span>
            </label>

            {errorMsg && (
              <div className="launch-error" role="alert">
                {errorMsg}
              </div>
            )}

            <button type="submit" className="launch-submit-btn" disabled={submitting}>
              <Send size={15} />
              <span>{submitting ? 'Sending brief…' : 'Send Stand Spec for Quotes'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
