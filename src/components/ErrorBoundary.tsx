import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Zuki ErrorBoundary]', error, errorInfo.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f7f7f5',
          color: '#17191d',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            background: '#ffffff',
            border: '1px solid #e5e4de',
            borderRadius: 14,
            padding: 28,
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              margin: '0 auto 14px',
              borderRadius: 12,
              background: '#fef2f2',
              color: '#b91c1c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={24} />
          </div>

          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
            {this.props.fallbackTitle || 'PilotStand hit a snag'}
          </h2>
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 13.5,
              lineHeight: 1.5,
              color: '#585c66',
            }}
          >
            Your saved stand projects are safely stored in your browser. Reset the view or reload
            to recover the 3D studio cleanly.
          </p>

          {this.state.errorMessage && (
            <div
              className="mono-num"
              style={{
                fontSize: 11.5,
                padding: '8px 10px',
                borderRadius: 8,
                background: '#f6f5f1',
                border: '1px solid #e5e4de',
                color: '#585c66',
                marginBottom: 18,
                wordBreak: 'break-word',
              }}
            >
              {this.state.errorMessage}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                border: '1px solid #d3d1c9',
                background: '#ffffff',
                color: '#111315',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#111315',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} />
              Reload Planner
            </button>
          </div>
        </div>
      </div>
    );
  }
}
