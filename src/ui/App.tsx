import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { HashRouter, NavLink, Outlet, Route, Routes } from 'react-router';
import { db, classifyDbError, DB_ERROR_MESSAGE, getDataMode, requestPersistentStorage } from '../data/db';
import { ensureSeeded } from '../data/seed';
import { updateSet } from '../data/repo/sessions';
import { restTimer } from '../services/timer';
import { beep, showNotification, vibrate } from '../services/feedback';
import { logger } from '../services/logger';
import { ToastProvider } from './toast';
import { AutoSync } from './components/AutoSync';
import { useApplyTheme, useSettings } from './hooks';
import { IconCalendar, IconChart, IconHistory, IconHome, IconList } from './icons';
import { HomePage } from './pages/HomePage';
import { WorkoutPage } from './pages/WorkoutPage';
import { CalendarPage } from './pages/CalendarPage';
import { HistoryPage } from './pages/HistoryPage';
import { SessionDetailPage } from './pages/SessionDetailPage';
import { ProgramsPage } from './pages/ProgramsPage';
import { ProgramEditorPage } from './pages/ProgramEditorPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { ExercisesPage } from './pages/ExercisesPage';
import { ExerciseEditorPage } from './pages/ExerciseEditorPage';

const ProgressPage = lazy(() => import('./pages/ProgressPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function TabsLayout() {
  const tabs = [
    { to: '/', label: 'Home', icon: IconHome, end: true },
    { to: '/calendar', label: 'Calendario', icon: IconCalendar },
    { to: '/progress', label: 'Progressi', icon: IconChart },
    { to: '/history', label: 'Storico', icon: IconHistory },
    { to: '/programs', label: 'Programmi', icon: IconList },
  ];
  return (
    <>
      <Suspense fallback={<div className="page muted">Caricamento…</div>}>
        <Outlet />
      </Suspense>
      <nav className="bottom-nav" aria-label="Navigazione principale">
        <ul>
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <t.icon />
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** Effetti globali del timer: registra il recupero effettivo e avvisa alla scadenza. */
function TimerEffects() {
  const settings = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const offEnded = restTimer.onRestEnded(({ setId, elapsedSec }) => {
      if (!setId) return;
      updateSet(setId, { restSec: elapsedSec }).catch((err) => logger.warn('timer', 'Recupero non registrato', err));
    });
    const offFinish = restTimer.onFinish(() => {
      const s = settingsRef.current;
      if (s.timerVibration) vibrate();
      if (s.timerSound) beep(s.timerVolume);
      if (s.timerNotification && document.visibilityState !== 'visible') {
        void showNotification('Recupero terminato', 'È il momento della prossima serie.');
      }
    });
    restTimer.hydrate();
    const onVisible = () => document.visibilityState === 'visible' && restTimer.tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offEnded();
      offFinish();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}

function ThemeEffect() {
  const settings = useSettings();
  useApplyTheme(settings.theme);
  return null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    logger.error('ui', 'Errore di rendering', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot">
        <h1>Qualcosa è andato storto</h1>
        <p className="muted">I dati salvati sono al sicuro nel database locale. Ricarica l’app per continuare.</p>
        <p className="tiny faint">{this.state.error.message}</p>
        <button type="button" className="btn primary lg" onClick={() => window.location.reload()}>Ricarica</button>
      </div>
    );
  }
}

type BootState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

function Boot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof indexedDB === 'undefined') throw Object.assign(new Error('IndexedDB assente'), { name: 'MissingAPIError' });
      await db.open();
      await ensureSeeded(db);
      void requestPersistentStorage();
    })()
      .then(() => !cancelled && setState({ status: 'ready' }))
      .catch((err) => {
        logger.error('boot', 'Apertura database fallita', err);
        if (!cancelled) setState({ status: 'error', message: DB_ERROR_MESSAGE[classifyDbError(err)] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <div className="boot muted" aria-busy="true">Caricamento…</div>;
  if (state.status === 'error') {
    return (
      <div className="boot">
        <h1>Database non disponibile</h1>
        <p className="muted">{state.message}</p>
        <button type="button" className="btn primary lg" onClick={() => window.location.reload()}>Riprova</button>
      </div>
    );
  }
  return <>{children}</>;
}

export function App({ extras }: { extras?: ReactNode }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Boot>
          <ThemeEffect />
          <TimerEffects />
          <AutoSync />
          <div className="app">
            {getDataMode() === 'demo' && <div className="demo-ribbon" role="note">MODALITÀ DEMO · dati di prova separati</div>}
            <HashRouter>
              <Routes>
                <Route element={<TabsLayout />}>
                  <Route index element={<HomePage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="progress" element={<ProgressPage />} />
                  <Route path="progress/analysis" element={<AnalysisPage />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="history/:sessionId" element={<SessionDetailPage />} />
                  <Route path="programs" element={<ProgramsPage />} />
                  <Route path="programs/:programId" element={<ProgramEditorPage />} />
                  <Route path="programs/:programId/templates/:templateId" element={<TemplateEditorPage />} />
                  <Route path="exercises" element={<ExercisesPage />} />
                  <Route path="exercises/:exerciseId" element={<ExerciseEditorPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<HomePage />} />
                </Route>
                <Route path="workout/:sessionId" element={<WorkoutPage />} />
              </Routes>
            </HashRouter>
            {extras}
          </div>
        </Boot>
      </ToastProvider>
    </ErrorBoundary>
  );
}
