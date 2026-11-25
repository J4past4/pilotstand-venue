import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Lightbulb, Shuffle, X } from 'lucide-react';
import {
  getNextTipIndex,
  getRandomTipIndex,
  getTipsForContext,
  MASCOT_STORAGE_KEY,
  type MascotContext,
} from '../data/mascotTips';
import './mascotTips.css';

interface MascotTipsProps {
  context: MascotContext;
  autoOpenDelayMs?: number;
}

function readInitialCollapsed(): boolean {
  try {
    return window.localStorage.getItem(MASCOT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(MASCOT_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

export const MascotTips: React.FC<MascotTipsProps> = ({
  context,
  autoOpenDelayMs = 1400,
}) => {
  const tips = useMemo(() => getTipsForContext(context), [context]);
  const [tipIndex, setTipIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [bouncing, setBouncing] = useState(false);

  const safeIndex = tipIndex % Math.max(tips.length, 1);
  const currentTip = tips[safeIndex] ?? tips[0];

  useEffect(() => {
    if (readInitialCollapsed()) return;
    const timer = window.setTimeout(() => {
      setOpen(true);
      setBouncing(true);
    }, autoOpenDelayMs);
    return () => window.clearTimeout(timer);
  }, [autoOpenDelayMs]);

  useEffect(() => {
    if (!bouncing) return;
    const timer = window.setTimeout(() => setBouncing(false), 460);
    return () => window.clearTimeout(timer);
  }, [bouncing]);

  const handleNext = () => {
    setTipIndex((idx) => getNextTipIndex(idx, tips.length));
    setBouncing(true);
  };

  const handleShuffle = () => {
    setTipIndex((idx) => getRandomTipIndex(idx, tips.length));
    setBouncing(true);
  };

  const handleClose = () => {
    setOpen(false);
    writeCollapsed(true);
  };

  const handleToggle = () => {
    if (open) {
      handleClose();
      return;
    }
    writeCollapsed(false);
    setTipIndex((idx) => getNextTipIndex(idx, tips.length));
    setOpen(true);
    setBouncing(true);
  };

  if (!currentTip) return null;

  return (
    <aside
      className="mascot-widget"
      aria-label="Booth Buddy tips"
      data-testid="mascot-widget"
    >
      {open && (
        <div
          className="mascot-bubble"
          role="region"
          aria-label="Quick hint from Booth Buddy"
          data-testid="mascot-bubble"
        >
          <div className="mascot-bubble-header">
            <div className="mascot-bubble-meta">
              <span className="mascot-name">Booth Buddy</span>
              <span className="mascot-tag">{currentTip.tag}</span>
            </div>
            <button
              type="button"
              className="mascot-close-btn"
              onClick={handleClose}
              aria-label="Hide Booth Buddy tip"
              title="Hide tip"
              data-testid="mascot-close"
            >
              <X size={14} />
            </button>
          </div>

          <p className="mascot-tip-text" data-testid="mascot-tip-text">
            {currentTip.text}
          </p>

          <div className="mascot-bubble-footer">
            <span className="mascot-counter" data-testid="mascot-counter">
              {safeIndex + 1}/{tips.length}
            </span>
            <div className="mascot-actions">
              <button
                type="button"
                className="mascot-action-btn"
                onClick={handleShuffle}
                title="Random tip"
                aria-label="Random tip"
                data-testid="mascot-shuffle"
              >
                <Shuffle size={12} />
              </button>
              <button
                type="button"
                className="mascot-action-btn primary"
                onClick={handleNext}
                data-testid="mascot-next"
              >
                <span>Next tip</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`mascot-trigger ${bouncing ? 'is-bouncing' : ''}`}
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={open ? 'Hide Booth Buddy tips' : 'Show a quick tip from Booth Buddy'}
        title={open ? 'Hide tip' : 'Need a quick tip?'}
        data-testid="mascot-trigger"
      >
        <img
          src="/mascot.png"
          alt="Booth Buddy mascot"
          className="mascot-avatar-img"
          draggable={false}
        />
        <span className="mascot-badge" aria-hidden="true">
          <Lightbulb size={12} />
        </span>
      </button>
      {!open && <span className="mascot-peek-pill">Need a tip?</span>}
    </aside>
  );
};
