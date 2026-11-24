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
        {({ user, authEnabled, publicLaunch, onSignOut, onOpenPublicAuth, onOpenSupplierModal }) => (
          <App
            key={publicLaunch ? 'public-studio' : user?.email || 'anon'}
            betaUser={user}
            publicLaunch={publicLaunch}
            onSignOut={authEnabled ? onSignOut : undefined}
            onOpenPublicAuth={onOpenPublicAuth}
            onOpenSupplierModal={onOpenSupplierModal}
          />
        )}
      </BetaAuthGate>
    </ErrorBoundary>
  </StrictMode>
);
