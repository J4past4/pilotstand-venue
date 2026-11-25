import React from 'react';
import { Gauge, X, Zap } from 'lucide-react';
import {
  PERFORMANCE_PROFILES,
  type PerformanceMode,
  type SlowPerformanceAlert,
} from '../utils/performanceMode';

interface PerformanceAlertPopupProps {
  alert: SlowPerformanceAlert | null;
  onApplyMode: (mode: PerformanceMode) => void;
  onDismiss: () => void;
}

export const PerformanceAlertPopup: React.FC<PerformanceAlertPopupProps> = ({
  alert,
  onApplyMode,
  onDismiss,
}) => {
  if (!alert) return null;

  const targetProfile = PERFORMANCE_PROFILES[alert.recommendedMode];
  const showDirectEcoOption = alert.recommendedMode === 'balanced';

  return (
    <div
      id="performance-slow-popup"
      className="perf-alert-popup"
      role="alert"
      aria-live="polite"
    >
      <div className="perf-alert-icon" aria-hidden="true">
        {alert.recommendedMode === 'eco' ? <Zap size={18} /> : <Gauge size={18} />}
      </div>

      <div className="perf-alert-body">
        <div className="perf-alert-head">
          <strong className="perf-alert-title">3D viewport is running slowly</strong>
          <button
            type="button"
            className="perf-alert-close"
            onClick={onDismiss}
            aria-label="Dismiss performance suggestion"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>

        <p className="perf-alert-desc">
          {alert.reason}. Lowering graphics settings will make orbiting and editing smoother on this device.
        </p>

        <div className="perf-alert-actions">
          <button
            id="btn-perf-alert-action"
            type="button"
            className="perf-alert-primary-btn"
            onClick={() => onApplyMode(alert.recommendedMode)}
          >
            <Zap size={13} />
            <span>Switch to {targetProfile.shortLabel} Mode</span>
          </button>

          {showDirectEcoOption && (
            <button
              id="btn-perf-alert-eco"
              type="button"
              className="perf-alert-secondary-btn"
              onClick={() => onApplyMode('eco')}
            >
              Use Eco Mode
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
