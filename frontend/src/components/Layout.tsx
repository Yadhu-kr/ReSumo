import React, { useEffect, useState, useRef } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getUserDisplayName, getUserInitials, getRoleBadgeLabel, getAvatarGradient } from "../lib/user";
import { ChevronDown, User as UserIcon, LogOut, Sparkles, Layers, Bell, CheckCheck, Calendar, Gift, ShieldCheck, Inbox, Briefcase, FileText, Compass, Terminal, Shield } from "lucide-react";
import type { AppNotification } from "../api/types";
import { AdminGovernanceModal } from "./AdminGovernanceModal";

export const Layout: React.FC = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifMenuOpen, setNotifMenuOpen] = useState<boolean>(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [adminGovernanceOpen, setAdminGovernanceOpen] = useState<boolean>(false);
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
    if (isAuthenticated && (user?.role === "approver" || user?.role === "admin" || user?.role === "hr")) {
      try {
        const approvals = await api.listPendingApprovals();
        setPendingCount(approvals.length);
      } catch {
        // Ignored if user lacks permission or network issue
      }
    }

    // 3. Refresh unread notifications count
    if (isAuthenticated) {
      try {
        const countRes = await api.getUnreadNotificationCount();
        setUnreadNotifications(countRes.unread_count);
      } catch {
        // Ignored
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
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifMenuOpen(false);
      }
    };
    if (profileMenuOpen || notifMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileMenuOpen, notifMenuOpen]);

  useEffect(() => {
    setProfileMenuOpen(false);
    setNotifMenuOpen(false);
  }, [location.pathname]);

  const handleToggleNotifications = async () => {
    if (!notifMenuOpen) {
      try {
        const list = await api.getMyNotifications();
        setNotifications(list);
      } catch (err) {
        console.error("Failed to load notifications", err);
      }
    }
    setNotifMenuOpen(!notifMenuOpen);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadNotifications(0);
    } catch (err) {
      console.error("Failed to mark all notifications read", err);
    }
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    try {
      if (!notif.is_read) {
        await api.markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        setUnreadNotifications((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // Ignored
    }
    setNotifMenuOpen(false);
    if (user?.role === "candidate") {
      navigate("/portal");
    } else if (notif.notification_type && notif.notification_type.includes("approval")) {
      navigate("/approvals");
    } else {
      navigate("/");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isCandidate = user?.role === "candidate";
  const isApprover = user?.role === "approver";
  const isInterviewer = user?.role === "interviewer";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", backgroundColor: "var(--bg-canvas)" }}>
      {/* Top Operational Navigation Bar */}
      <header
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(12px)",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "64px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "36px" }}>
          {/* Brand Logo */}
          <Link
            to={isCandidate ? "/portal" : isApprover ? "/approvals" : isInterviewer ? "/interviewer" : "/"}
            style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)",
                boxShadow: "0 2px 6px rgba(30, 27, 75, 0.25)",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "2px",
                  backgroundColor: "#ffffff",
                }}
              />
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: "17px",
                  letterSpacing: "-0.02em",
                  color: "var(--text-primary)",
                }}
              >
                ReSumo
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  padding: "2px 7px",
                  borderRadius: "6px",
                  backgroundColor: "var(--bg-surface-elevated)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {isCandidate ? "CANDIDATE PORTAL" : isApprover ? "GOVERNANCE" : isInterviewer ? "INTERVIEW CONSOLE" : "TALENT OPS"}
              </span>
            </div>
          </Link>

          {/* Navigation Tabs (Role Scoped) */}
          <nav className="nav-pill-container">
            {isCandidate ? (
              // Candidate Navigation
              <>
                <NavLink
                  to="/portal"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <FileText size={15} />
                  <span>My Career Profile</span>
                </NavLink>

                <NavLink
                  to="/jobs"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Compass size={15} />
                  <span>Browse Open Requisitions</span>
                </NavLink>
              </>
            ) : isApprover ? (
              // Approver Navigation
              <>
                <NavLink
                  to="/approvals"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <ShieldCheck size={15} />
                  <span>Executive Approval Queue</span>
                  {pendingCount > 0 && (
                    <span
                      className="badge badge-pending"
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        fontWeight: 700,
                      }}
                    >
                      {pendingCount}
                    </span>
                  )}
                </NavLink>

                <NavLink
                  to="/jobs"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Briefcase size={15} />
                  <span>Job Requisitions</span>
                </NavLink>
              </>
            ) : isInterviewer ? (
              // Interviewer Navigation
              <>
                <NavLink
                  to="/interviewer"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Terminal size={15} />
                  <span>Technical Interview Console</span>
                </NavLink>

                <NavLink
                  to="/jobs"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Briefcase size={15} />
                  <span>Job Requisitions</span>
                </NavLink>
              </>
            ) : user?.role === "admin" ? (
              // Admin Governance Navigation
              <>
                <NavLink
                  to="/admin"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Shield size={15} />
                  <span>Admin Console</span>
                </NavLink>

                <NavLink
                  to="/jobs"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Briefcase size={15} />
                  <span>Job Requisitions</span>
                </NavLink>
              </>
            ) : (
              // HR & Recruiter Operational Navigation
              <>
                <NavLink
                  to="/"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Layers size={15} />
                  <span>Talent Pipeline</span>
                </NavLink>

                <NavLink
                  to="/jobs"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Briefcase size={15} />
                  <span>Requisitions & Matching</span>
                </NavLink>

                <NavLink
                  to="/interviewer"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <Terminal size={15} />
                  <span>Interview Console</span>
                </NavLink>

                <NavLink
                  to="/approvals"
                  className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
                >
                  <ShieldCheck size={15} />
                  <span>Approvals Tracking</span>
                  {pendingCount > 0 && (
                    <span
                      className="badge badge-pending"
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        fontWeight: 700,
                      }}
                    >
                      {pendingCount}
                    </span>
                  )}
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {/* Status & User Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Admin Dedicated Console Shortcut */}
          {user?.role === "admin" && (
            <Link
              to="/admin"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: "var(--accent-purple-subtle)",
                border: "1px solid var(--accent-purple-border)",
                color: "var(--accent-purple)",
                fontSize: "12px",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Shield size={13} />
              <span>Admin Console</span>
            </Link>
          )}

          {/* Global Notification Bell & Dropdown */}
          {user && (
            <div ref={notifRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="btn-icon"
                onClick={handleToggleNotifications}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  padding: 0,
                  boxSizing: "border-box",
                  borderRadius: "50%",
                  border: notifMenuOpen ? "1.5px solid var(--accent-purple)" : "1px solid var(--border-subtle)",
                  backgroundColor: notifMenuOpen ? "#ffffff" : "var(--bg-surface-elevated)",
                  color: notifMenuOpen ? "var(--accent-purple)" : "var(--text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!notifMenuOpen) {
                    e.currentTarget.style.borderColor = "var(--border-strong)";
                    e.currentTarget.style.backgroundColor = "#ffffff";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!notifMenuOpen) {
                    e.currentTarget.style.borderColor = "var(--border-subtle)";
                    e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell size={18} strokeWidth={2.2} style={{ display: "block", flexShrink: 0 }} />
                {unreadNotifications > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-3px",
                      right: "-3px",
                      minWidth: "17px",
                      height: "17px",
                      borderRadius: "10px",
                      backgroundColor: "#ef4444",
                      color: "#ffffff",
                      fontSize: "9.5px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 3px",
                      boxShadow: "0 1px 4px rgba(239, 68, 68, 0.4)",
                      border: "2px solid #ffffff",
                    }}
                  >
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </button>

              {/* Notification Popover Drawer */}
              {notifMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 10px)",
                    right: 0,
                    width: "390px",
                    maxHeight: "480px",
                    backgroundColor: "#ffffff",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-xl)",
                    border: "1px solid var(--border-subtle)",
                    zIndex: 100,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Popover Header */}
                  <div
                    style={{
                      padding: "14px 18px",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: "var(--bg-canvas)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                        Notifications
                      </span>
                      {unreadNotifications > 0 && (
                        <span
                          className="mono"
                          style={{
                            fontSize: "11px",
                            backgroundColor: "var(--accent-purple-subtle)",
                            color: "var(--accent-purple)",
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            fontWeight: 700,
                            border: "1px solid var(--accent-purple-border)",
                          }}
                        >
                          {unreadNotifications} new
                        </span>
                      )}
                    </div>

                    {unreadNotifications > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        style={{
                          fontSize: "12px",
                          color: "var(--accent-purple)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        <CheckCheck size={14} />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>

                  {/* Popover Body / Feed */}
                  <div style={{ overflowY: "auto", flex: 1, maxHeight: "400px" }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
                        <Inbox size={32} style={{ margin: "0 auto 10px auto", opacity: 0.4 }} />
                        <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)" }}>No notifications yet</div>
                        <div style={{ fontSize: "12px", marginTop: "4px", color: "var(--text-secondary)" }}>
                          You'll receive alerts here when candidate actions or stage updates happen.
                        </div>
                      </div>
                    ) : (
                      notifications.slice(0, 15).map((notif) => {
                        const isUnread = !notif.is_read;
                        const icon = notif.notification_type.includes("offer") ? (
                          <Gift size={15} color="#4f46e5" />
                        ) : notif.notification_type.includes("interview") ? (
                          <Calendar size={15} color="#2563eb" />
                        ) : notif.notification_type.includes("onboarding") ? (
                          <ShieldCheck size={15} color="#059669" />
                        ) : (
                          <Bell size={15} color="#d97706" />
                        );

                        return (
                          <div
                            key={notif.id}
                            onClick={() => handleNotificationClick(notif)}
                            style={{
                              padding: "12px 16px",
                              borderBottom: "1px solid var(--border-subtle)",
                              backgroundColor: isUnread ? "rgba(79, 70, 229, 0.04)" : "#ffffff",
                              cursor: "pointer",
                              display: "flex",
                              gap: "12px",
                              alignItems: "flex-start",
                              transition: "background 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "rgba(79, 70, 229, 0.07)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = isUnread ? "rgba(79, 70, 229, 0.04)" : "#ffffff";
                            }}
                          >
                            <div
                              style={{
                                marginTop: "2px",
                                width: "30px",
                                height: "30px",
                                borderRadius: "8px",
                                backgroundColor: isUnread ? "rgba(79, 70, 229, 0.12)" : "var(--bg-canvas)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {icon}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                                <span
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: isUnread ? 700 : 600,
                                    color: "var(--text-primary)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {notif.subject}
                                </span>
                                {isUnread && (
                                  <span
                                    style={{
                                      width: "7px",
                                      height: "7px",
                                      borderRadius: "50%",
                                      backgroundColor: "var(--accent-purple)",
                                      flexShrink: 0,
                                    }}
                                  />
                                )}
                              </div>

                              <p
                                style={{
                                  fontSize: "12.5px",
                                  color: "var(--text-secondary)",
                                  margin: "4px 0 6px 0",
                                  lineHeight: "1.45",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                }}
                              >
                                {notif.body_text}
                              </p>

                              <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                {new Date(notif.created_at).toLocaleString([], {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Profile Dropdown Menu */}
          {user ? (
            <div style={{ display: "flex", alignItems: "center" }}>
              <div ref={menuRef} style={{ position: "relative" }}>
                {/* Rightmost corner trigger: Avatar + Name + chevron */}
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    padding: "5px 14px 5px 6px",
                    borderRadius: "var(--radius-pill)",
                    backgroundColor: profileMenuOpen ? "#ffffff" : "var(--bg-surface-elevated)",
                    border: profileMenuOpen ? "1px solid var(--accent-purple-border)" : "1px solid var(--border-subtle)",
                    boxShadow: profileMenuOpen ? "var(--shadow-sm)" : "var(--shadow-xs)",
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
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      background: getAvatarGradient(getUserDisplayName(user)),
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.2px",
                      flexShrink: 0,
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.15)",
                    }}
                  >
                    {getUserInitials(user)}
                  </div>

                  {/* ONLY THE NAME */}
                  <span
                    style={{
                      fontSize: "13.5px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      maxWidth: "160px",
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

                {/* Dropdown Menu */}
                {profileMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      width: "270px",
                      backgroundColor: "#ffffff",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "var(--shadow-xl)",
                      padding: "10px",
                      zIndex: 1000,
                    }}
                  >
                    {/* User Profile Card with Role Badges */}
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "var(--bg-canvas)",
                        border: "1px solid var(--border-subtle)",
                        marginBottom: "8px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "50%",
                            background: getAvatarGradient(getUserDisplayName(user)),
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "14px",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {getUserInitials(user)}
                        </div>
                        <div style={{ overflow: "hidden" }}>
                          <div
                            style={{
                              fontSize: "14px",
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
                              fontSize: "12px",
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

                      {/* Role Badge */}
                      <div style={{ marginTop: "10px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            padding: "3px 10px",
                            borderRadius: "9999px",
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
                        padding: "10px 14px",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-primary)",
                        fontSize: "13.5px",
                        fontWeight: 500,
                        textDecoration: "none",
                        transition: "background-color 0.12s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <UserIcon size={16} style={{ color: "var(--text-secondary)" }} />
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
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-primary)",
                          fontSize: "13.5px",
                          fontWeight: 500,
                          textDecoration: "none",
                          transition: "background-color 0.12s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <Sparkles size={16} style={{ color: "var(--accent-purple)" }} />
                        <span>Candidate Career Hub</span>
                      </Link>
                    ) : user.role === "admin" ? (
                      <Link
                        to="/admin"
                        onClick={() => setProfileMenuOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-primary)",
                          fontSize: "13.5px",
                          fontWeight: 500,
                          textDecoration: "none",
                          transition: "background-color 0.12s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <Shield size={16} style={{ color: "var(--accent-purple)" }} />
                        <span>Administrator Console</span>
                      </Link>
                    ) : (
                      <Link
                        to="/"
                        onClick={() => setProfileMenuOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-primary)",
                          fontSize: "13.5px",
                          fontWeight: 500,
                          textDecoration: "none",
                          transition: "background-color 0.12s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <Layers size={16} style={{ color: "var(--accent-purple)" }} />
                        <span>Talent Pipeline</span>
                      </Link>
                    )}

                    {(user.role === "interviewer" || user.role === "hr" || user.secondary_roles?.includes("interviewer")) && (
                      <Link
                        to="/interviewer"
                        onClick={() => setProfileMenuOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-primary)",
                          fontSize: "13.5px",
                          fontWeight: 500,
                          textDecoration: "none",
                          transition: "background-color 0.12s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface-elevated)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <Terminal size={16} style={{ color: "var(--accent-purple)" }} />
                        <span>Technical Interview Console</span>
                      </Link>
                    )}

                    <div style={{ height: "1px", backgroundColor: "var(--border-subtle)", margin: "6px 0" }} />

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
                        padding: "10px 14px",
                        borderRadius: "var(--radius-sm)",
                        border: "none",
                        backgroundColor: "transparent",
                        color: "var(--status-rejected-text)",
                        fontSize: "13.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background-color 0.12s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--status-rejected-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <NavLink
              to="/login"
              className="btn btn-primary"
              style={{
                padding: "8px 20px",
                fontSize: "13.5px",
                fontWeight: 600,
                borderRadius: "var(--radius-pill)",
                textDecoration: "none",
              }}
            >
              Sign In
            </NavLink>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: "32px 36px", maxWidth: "1560px", margin: "0 auto", width: "100%" }}>
        <Outlet context={{ refreshPendingCount: checkStatus }} />
      </main>

      {/* Enterprise Multi-Role Admin Governance Modal */}
      <AdminGovernanceModal
        isOpen={adminGovernanceOpen}
        onClose={() => setAdminGovernanceOpen(false)}
      />
    </div>
  );
};
