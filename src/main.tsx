import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { BetaAuthGate } from './components/BetaAuthGate.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BetaAuthGate>
        {({ user, authEnabled, onSignOut }) => (
          <App
            key={user?.email || 'anon'}
            betaUser={user}
            onSignOut={authEnabled ? onSignOut : undefined}
          />
        )}
      </BetaAuthGate>
    </ErrorBoundary>
  </StrictMode>
);
