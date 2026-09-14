import React from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { UserRole } from "../api/types";

export interface RoleRouteProps {
  children?: React.ReactNode;
  allowedRoles: UserRole[];
  fallbackPath?: string;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({
  children,
  allowedRoles,
  fallbackPath,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--bg-canvas)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
        }}
      >
        <span style={{ marginRight: "8px" }}>●</span> Authenticating session...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // Redirect to default home for their specific role
    if (fallbackPath) {
      return <Navigate to={fallbackPath} replace />;
    }

    if (user.role === "candidate") {
      return <Navigate to="/portal" replace />;
    }
    if (user.role === "approver") {
      return <Navigate to="/approvals" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};

export default RoleRoute;
