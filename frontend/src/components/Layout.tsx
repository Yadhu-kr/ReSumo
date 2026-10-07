import React, { useEffect, useState, useRef } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getUserDisplayName, getUserInitials, getRoleBadgeLabel, getAvatarGradient } from "../lib/user";
import { ChevronDown, User as UserIcon, LogOut, Sparkles, Layers } from "lucide-react";

export const Layout: React.FC = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuth();

  const checkStatus = async () => {
    // 1. Check health
    try {
      await api.checkHealth();
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }

    // 2. Refresh pending approvals if authenticated (only for roles with approval access)
    if (isAuthenticated && (user?.role === "approver" || user?.role === "admin")) {
      try {
        const approvals = await api.listPendingApprovals();
        setPendingCount(approvals.length);
      } catch {
        // Ignored if user lacks permission or network issue
      }
    }
  };

  useEffect(() => {
    checkStatus();
    const timer = setInterval(checkStatus, 10000);
    return () => clearInterval(timer);
  }, [location.pathname, isAuthenticated, user?.role]);

  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isCandidate = user?.role === "candidate";
  const isApprover = user?.role === "approver";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "var(--bg-canvas)" }}>
      {/* Top Operational Navigation Bar */}
      <header
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          backgroundColor: "#ffffff",
          padding: "0 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "56px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          {/* Brand Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "22px",
                height: "22px",
                borderRadius: "6px",
                background: "linear-gradient(135deg, #6452ce 0%, #533eb6 100%)",
                boxShadow: "0 2px 6px rgba(100, 82, 206, 0.35)",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "2px",
                  backgroundColor: "#ffffff",
                }}
              />
            </span>
            <span
              className="mono"
              style={{
                fontWeight: 800,
                fontSize: "15px",
                letterSpacing: "0.04em",
                color: "var(--text-primary)",
              }}
            >
              RESUMO
              <span style={{ color: "var(--accent-purple)", fontWeight: 500 }}>
                {isCandidate ? "::PORTAL" : "::OPS"}
              </span>
            </span>
          </div>

          {/* Navigation Tabs (Role Scoped) */}
          <nav style={{ display: "flex", gap: "6px" }}>
            {isCandidate ? (
              // Candidate Navigation
              <>
                <NavLink
                  to="/portal"
                  style={({ isActive }) => ({
                    padding: "7px 16px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                    backgroundColor: isActive ? "var(--accent-purple-subtle)" : "transparent",
                    border: isActive ? "1px solid var(--accent-purple-border)" : "1px solid transparent",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                  })}
                >
                  My Resume & Status
                </NavLink>

                <NavLink
                  to="/jobs"
                  style={({ isActive }) => ({
                    padding: "7px 16px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                    backgroundColor: isActive ? "var(--accent-purple-subtle)" : "transparent",
                    border: isActive ? "1px solid var(--accent-purple-border)" : "1px solid transparent",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                  })}
                >
                  Browse Open Jobs
                </NavLink>
              </>
            ) : isApprover ? (
              // Approver Navigation
              <>
                <NavLink
                  to="/approvals"
                  style={({ isActive }) => ({
                    padding: "7px 16px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                    backgroundColor: isActive ? "var(--accent-purple-subtle)" : "transparent",
                    border: isActive ? "1px solid var(--accent-purple-border)" : "1px solid transparent",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  })}
                >
                  <span>Approval Queue</span>
                  {pendingCount > 0 && (
                    <span
                      className="badge badge-pending"
                      style={{
                        fontSize: "10.5px",
                        padding: "2px 7px",
                        borderRadius: "50px",
                      }}
                    >
                      {pendingCount}
                    </span>
                  )}
                </NavLink>

                <NavLink
                  to="/jobs"
                  style={({ isActive }) => ({
                    padding: "7px 16px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                    backgroundColor: isActive ? "var(--accent-purple-subtle)" : "transparent",
                    border: isActive ? "1px solid var(--accent-purple-border)" : "1px solid transparent",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                  })}
                >
                  Requisitions
                </NavLink>
              </>
            ) : (
              // HR & Admin Navigation
              <>
                <NavLink
                  to="/"
                  style={({ isActive }) => ({
                    padding: "7px 16px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                    backgroundColor: isActive ? "var(--accent-purple-subtle)" : "transparent",
                    border: isActive ? "1px solid var(--accent-purple-border)" : "1px solid transparent",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                  })}
                >
                  Pipeline Dashboard
                </NavLink>

                <NavLink
                  to="/jobs"
                  style={({ isActive }) => ({
                    padding: "7px 16px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "13px",
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                    backgroundColor: isActive ? "var(--accent-purple-subtle)" : "transparent",
                    border: isActive ? "1px solid var(--accent-purple-border)" : "1px solid transparent",
                    textDecoration: "none",
                    transition: "all 0.15s ease",
                  })}
                >
                  Jobs & RAG Matching
                </NavLink>

                {user?.role === "admin" && (
                  <NavLink
                    to="/approvals"
                    style={({ isActive }) => ({
                      padding: "7px 16px",
                      borderRadius: "var(--radius-pill)",
                      fontSize: "13px",
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                      backgroundColor: isActive ? "var(--accent-purple-subtle)" : "transparent",
                      border: isActive ? "1px solid var(--accent-purple-border)" : "1px solid transparent",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.15s ease",
                    })}
                  >
                    <span>Approval Queue</span>
                    {pendingCount > 0 && (
                      <span
                        className="badge badge-pending"
                        style={{
                          fontSize: "10.5px",
                          padding: "2px 7px",
                          borderRadius: "50px",
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                  </NavLink>
                )}
              </>
            )}
          </nav>
        </div>

        {/* Status & User Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          {/* API Health */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "50px",
              backgroundColor: "var(--bg-surface-elevated)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor:
                  backendOnline === true
                    ? "var(--status-approved-text)"
                    : backendOnline === false
                    ? "var(--status-rejected-text)"
                    : "var(--text-muted)",
              }}
            />
            <span className="mono" style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>
              API: {backendOnline === true ? "ONLINE" : backendOnline === false ? "UNREACHABLE" : "CONNECTING"}
            </span>
          </div>

          {/* User Profile Dropdown Menu */}
          {user ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <div ref={menuRef} style={{ position: "relative" }}>
                {/* Rightmost corner trigger: ONLY Avatar + Name + chevron */}
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "4px 12px 4px 6px",
                    borderRadius: "50px",
                    backgroundColor: profileMenuOpen ? "#ffffff" : "var(--bg-surface-elevated)",
                    border: profileMenuOpen ? "1px solid var(--accent-purple-border)" : "1px solid var(--border-subtle)",
                    boxShadow: profileMenuOpen
                      ? "0 3px 12px rgba(100, 82, 206, 0.12)"
                      : "0 1px 3px rgba(0, 0, 0, 0.04)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-purple-border)";
                    e.currentTarget.style.backgroundColor = "#ffffff";
                  }}
                  onMouseLeave={(e) => {
                    if (!profileMenuOpen) {
                      e.currentTarget.style.borderColor = "var(--border-subtle)";
                      e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
                    }
                  }}
                  title="Account menu"
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="true"
                >
                  {/* Profile Avatar */}
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      background: getAvatarGradient(getUserDisplayName(user)),
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.2px",
                      flexShrink: 0,
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
                    }}
                  >
                    {getUserInitials(user)}
                  </div>

                  {/* ONLY THE NAME */}
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      maxWidth: "150px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {getUserDisplayName(user)}
                  </span>

                  <ChevronDown
                    size={14}
                    style={{
                      color: "var(--text-muted)",
                      transform: profileMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s ease",
                    }}
                  />
                </button>

                {/* Dropdown Menu: Revealed on click containing badges, view profile, and sign-off */}
                {profileMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      width: "250px",
                      backgroundColor: "#ffffff",
                      borderRadius: "16px",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "0 10px 30px rgba(35, 15, 75, 0.12)",
                      padding: "8px",
                      zIndex: 1000,
                    }}
                  >
                    {/* User Profile Card with Role Badges */}
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "12px",
                        backgroundColor: "#f8fafc",
                        border: "1px solid var(--border-subtle)",
                        marginBottom: "6px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "50%",
                            background: getAvatarGradient(getUserDisplayName(user)),
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "13px",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {getUserInitials(user)}
                        </div>
                        <div style={{ overflow: "hidden" }}>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 700,
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {getUserDisplayName(user)}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {user.email}
                          </div>
                        </div>
                      </div>

                      {/* Role Badge (Candidate, Recruiter, Administrator) */}
                      <div style={{ marginTop: "10px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "10px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.03em",
                            padding: "2px 9px",
                            borderRadius: "50px",
                            backgroundColor: "var(--accent-purple-subtle)",
                            color: "var(--accent-purple)",
                            border: "1px solid var(--accent-purple-border)",
                          }}
                        >
                          {getRoleBadgeLabel(user.role, user.approver_role)}
                        </span>
                      </div>
                    </div>

                    {/* Navigation Options */}
                    <Link
                      to="/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "9px 12px",
                        borderRadius: "8px",
                        color: "var(--text-primary)",
                        fontSize: "13px",
                        fontWeight: 500,
                        textDecoration: "none",
                        transition: "background-color 0.12s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <UserIcon size={15} style={{ color: "var(--text-secondary)" }} />
                      <span>Profile & Settings</span>
                    </Link>

                    {user.role === "candidate" ? (
                      <Link
                        to="/portal"
                        onClick={() => setProfileMenuOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "9px 12px",
                          borderRadius: "8px",
                          color: "var(--text-primary)",
                          fontSize: "13px",
                          fontWeight: 500,
                          textDecoration: "none",
                          transition: "background-color 0.12s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <Sparkles size={15} style={{ color: "var(--accent-purple)" }} />
                        <span>Candidate Career Hub</span>
                      </Link>
                    ) : (
                      <Link
                        to="/"
                        onClick={() => setProfileMenuOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "9px 12px",
                          borderRadius: "8px",
                          color: "var(--text-primary)",
                          fontSize: "13px",
                          fontWeight: 500,
                          textDecoration: "none",
                          transition: "background-color 0.12s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <Layers size={15} style={{ color: "var(--accent-purple)" }} />
                        <span>Pipeline Dashboard</span>
                      </Link>
                    )}

                    <div style={{ height: "1px", backgroundColor: "var(--border-subtle)", margin: "4px 0" }} />

                    {/* Sign Out Action */}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        handleLogout();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: "transparent",
                        color: "var(--status-rejected-text)",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background-color 0.12s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--status-rejected-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <LogOut size={15} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <NavLink
              to="/login"
              style={{
                padding: "6px 16px",
                fontSize: "12.5px",
                fontWeight: 600,
                backgroundColor: "var(--accent-ops)",
                color: "#ffffff",
                borderRadius: "50px",
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(89, 149, 253, 0.35)",
              }}
            >
              Sign In
            </NavLink>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: "28px", maxWidth: "1440px", margin: "0 auto", width: "100%" }}>
        <Outlet context={{ refreshPendingCount: checkStatus }} />
      </main>
    </div>
  );
};
