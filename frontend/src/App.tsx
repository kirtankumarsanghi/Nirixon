import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { onUnauthorized } from "./api/client";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppLayout } from "./components/AppLayout";
import { ConsentScreen } from "./components/ConsentScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoginScreen } from "./components/LoginScreen";
import {
  ClinicianSandbox,
  GrowthPage,
  JointFamilyInvite,
  LiveElicitationTask,
  SandboxPage,
  SharePage,
  TouchMicroTask,
  VelocityTracker,
  WhatIfSimulator,
} from "./pages/DeferredPages";
import { ScreeningPage } from "./pages/ScreeningPage";
import { FindHelpPage } from "./pages/FindHelpPage";
import { CHWReferralPage } from "./pages/CHWReferralPage";
import { JointRespondentPage } from "./pages/JointRespondentPage";
import { LandingPage } from "./landing";
import { RequireAuth, RequireConsent } from "./routes/guards";
import { defaultAuthenticatedPath } from "./auth/roles";
import { ToastProvider, ToastViewport } from "./toast/Toast";

function UnauthorizedBridge() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    onUnauthorized(() => {
      logout();
      navigate("/login", { replace: true });
    });
  }, [logout, navigate]);

  return null;
}

function RoleHomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={defaultAuthenticatedPath(role)} replace />;
}

function AppRoutes() {
  return (
    <>
      <UnauthorizedBridge />
      <Routes>
        {/* Public landing page with live interactive screening demo */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/joint-response/:token" element={<JointRespondentPage />} />
        <Route path="/joint-invite/:token" element={<JointRespondentPage />} />

        <Route element={<AppLayout />}>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/joint-respond/:token" element={<JointRespondentPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/consent" element={<ConsentScreen />} />

            <Route element={<RequireConsent />}>
              <Route path="/screen" element={<ScreeningPage />} />
            </Route>

            <Route path="/growth" element={<GrowthPage />} />
            <Route path="/share" element={<SharePage />} />
            <Route path="/sandbox" element={<SandboxPage />} />
            <Route path="/help" element={<FindHelpPage />} />
            <Route path="/referrals" element={<CHWReferralPage />} />
            <Route path="/chw" element={<CHWReferralPage />} />

            {/* Deferred feature entry points — honest coming-soon states */}
            <Route path="/deferred/clinician-sandbox" element={<ClinicianSandbox />} />
            <Route path="/deferred/what-if" element={<WhatIfSimulator />} />
            <Route path="/deferred/joint-family" element={<JointFamilyInvite />} />
            <Route path="/deferred/velocity" element={<VelocityTracker />} />
            <Route path="/deferred/live-elicitation" element={<LiveElicitationTask />} />
            <Route path="/deferred/touch-micro" element={<TouchMicroTask />} />

            {/* Authenticated unknown → role home (not always screening) */}
            <Route path="*" element={<RoleHomeRedirect />} />
          </Route>

          {/* Unauthenticated unknown → login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
      <ToastViewport />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
