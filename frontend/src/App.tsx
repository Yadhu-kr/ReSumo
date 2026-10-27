import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RoleRoute } from "./components/RoleRoute";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { JobsPage } from "./pages/JobsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { CandidateDetailPage } from "./pages/CandidateDetailPage";
import { CandidatePortalPage } from "./pages/CandidatePortalPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AuthPage } from "./pages/AuthPage";
import { InterviewerConsolePage } from "./pages/InterviewerConsolePage";
import { AdminConsolePage } from "./pages/AdminConsolePage";

/**
 * Smart index router that delivers the correct role landing view:
 * - Candidate -> CandidatePortalPage
 * - Admin -> Redirects to /admin (Dedicated Admin Console)
 * - Approver -> Redirects to /approvals
 * - Interviewer -> Redirects to /interviewer
 * - HR -> DashboardPage (Pipeline Kanban)
 */
const HomeIndexRoute: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === "candidate") {
    return <CandidatePortalPage />;
  }
  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }
  if (user?.role === "approver") {
    return <Navigate to="/approvals" replace />;
  }
  if (user?.role === "interviewer") {
    return <Navigate to="/interviewer" replace />;
  }
  return <DashboardPage />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />

          {/* Protected Application Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Dynamic Role Home */}
            <Route index element={<HomeIndexRoute />} />

            {/* Dedicated Administrator Console */}
            <Route
              path="admin"
              element={
                <RoleRoute allowedRoles={["admin"]}>
                  <AdminConsolePage />
                </RoleRoute>
              }
            />

            {/* Candidate Portal */}
            <Route
              path="portal"
              element={
                <RoleRoute allowedRoles={["candidate", "admin"]}>
                  <CandidatePortalPage />
                </RoleRoute>
              }
            />

            {/* Jobs View (Role-adaptive: candidates see listings; recruiters see RAG matcher) */}
            <Route path="jobs" element={<JobsPage />} />

            {/* Recruiter / Approver Operational Routes */}
            <Route
              path="approvals"
              element={
                <RoleRoute allowedRoles={["approver", "hr", "admin"]}>
                  <ApprovalsPage />
                </RoleRoute>
              }
            />
            <Route
              path="interviewer"
              element={
                <RoleRoute allowedRoles={["interviewer", "hr", "approver", "admin"]}>
                  <InterviewerConsolePage />
                </RoleRoute>
              }
            />
            <Route
              path="candidates/:id"
              element={
                <RoleRoute allowedRoles={["hr", "approver", "interviewer", "admin"]}>
                  <CandidateDetailPage />
                </RoleRoute>
              }
            />

            <Route path="profile" element={<ProfilePage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

