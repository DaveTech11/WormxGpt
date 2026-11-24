import { lazy, Suspense } from 'react';
import { Toaster } from "./components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import Chat from './pages/Chat';
const SharedChat = lazy(() => import('./pages/SharedChat'));
const Settings = lazy(() => import('./pages/Settings'));
const Premium = lazy(() => import('./pages/Premium'));
const Codex = lazy(() => import('./pages/Code'));
const Artifacts = lazy(() => import('./pages/Artifacts'));
const Images = lazy(() => import('./pages/Images'));
const MusicPage = lazy(() => import('./pages/Music'));
import { MusicProvider } from '@/lib/MusicContext';
import MiniPlayer from './components/xyron/music/MiniPlayer';
const Admin = lazy(() => import('./pages/Admin'));
import Login from './pages/Login';
const Register = lazy(() => import('./pages/Register'));
const TwoFactor = lazy(() => import('./pages/TwoFactor'));
import ChatLockGate from './components/xyron/ChatLockGate';
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const XyronStudio = lazy(() => import('./pages/XyronStudio'));
const XyronOS = lazy(() => import('./pages/XyronOS'));
const XyronIntelligence = lazy(() => import('./pages/XyronIntelligence'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
import BroadcastNotifier from './components/BroadcastNotifier';
import XyronLabsHost from './components/xyron/XyronLabsModal';
const MyProjects = lazy(() => import('./pages/MyProjects'));
const Deactivated = lazy(() => import('./pages/Deactivated'));
import InstallAppPrompt from './components/InstallAppPrompt';

const PageFallback = () => (
  <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', opacity: 0.6 }}>Loading…</div>
);

const AuthenticatedApp = () => (
  <Suspense fallback={<PageFallback />}>
  <Routes>
    <Route path="/deactivated" element={<Deactivated />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/two-factor" element={<TwoFactor />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/" element={<Chat />} />
    <Route path="/s/:token" element={<SharedChat />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/premium" element={<Premium />} />
    <Route path="/legacy-studio" element={<XyronStudio />} />
    <Route path="/os" element={<XyronOS />} />
    <Route path="/intelligence" element={<XyronIntelligence />} />
    <Route path="/share" element={<XyronStudio />} />
    <Route path="/codex" element={<Codex />} />
    <Route path="/my-projects" element={<MyProjects />} />
    <Route path="/artifacts" element={<Artifacts />} />
    <Route path="/images" element={<Images />} />
    <Route path="/anime" element={<Navigate to="/images" replace />} />
    <Route path="/music" element={<MusicPage />} />
    <Route path="/admin" element={<Admin />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/terms" element={<Terms />} />
    <Route path="*" element={<PageNotFound />} />
  </Routes>
  </Suspense>
);

function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <MusicProvider>
            <ChatLockGate>
              <AuthenticatedApp />
              <MiniPlayer />
            </ChatLockGate>
          </MusicProvider>
          <BroadcastNotifier />
          <InstallAppPrompt />
          <XyronLabsHost />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
