import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { useBackupStore } from './stores/useBackupStore';
import { Landing } from './routes/Landing';
import { Progress } from './routes/Progress';
import { SessionList } from './routes/SessionList';
import { SessionDetail } from './routes/SessionDetail';
import { Insights } from './routes/Insights';
import { DepthDivePlayer } from './routes/DepthDivePlayer';
import { PoolDivePlayer } from './routes/PoolDivePlayer';
import { DrySessionPlayer } from './routes/DrySessionPlayer';
import { CompareSeasons } from './routes/CompareSeasons';
import { CompareDives } from './routes/CompareDives';
import { Playground } from './routes/Playground';
import { ThemeToggle } from './components/ThemeToggle';
import { AskPanel } from './components/AskPanel';
import { AppFooter } from './components/AppFooter';
import { AuthProvider } from './lib/supabase/AuthProvider';
import { LanguageSwitcher } from './i18n/LanguageSwitcher';

/** Restore an opted-in persisted backup before the first route paints, so a
 *  refresh mid-analysis lands back where you were instead of on the landing
 *  page. Renders nothing until the (fast) IndexedDB read resolves. */
function PersistGate({ children }: { children: React.ReactNode }) {
  const hydrated = useBackupStore((s) => s.hydrated);
  const hydrate = useBackupStore((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  if (!hydrated) return null;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
    <ThemeToggle />
    <LanguageSwitcher />
    <BrowserRouter>
      <PersistGate>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/sessions" element={<SessionList />} />
        <Route path="/session/:id" element={<SessionDetail />} />
        <Route path="/session/:sessionId/dive/:diveIdx" element={<DepthDivePlayer />} />
        <Route path="/session/:sessionId/pool/:diveIdx" element={<PoolDivePlayer />} />
        <Route path="/session/:sessionId/dry" element={<DrySessionPlayer />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/compare" element={<Navigate to="/compare/seasons" replace />} />
        <Route path="/compare/seasons" element={<CompareSeasons />} />
        <Route path="/compare/dives" element={<CompareDives />} />
        <Route path="/playground" element={<Playground />} />
      </Routes>
      <AskPanel />
      <AppFooter />
      </PersistGate>
    </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
