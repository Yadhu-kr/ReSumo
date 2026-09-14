import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
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

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
