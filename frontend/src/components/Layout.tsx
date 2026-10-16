import React, { useEffect, useState, useRef } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getUserDisplayName, getUserInitials, getRoleBadgeLabel, getAvatarGradient } from "../lib/user";
import { ChevronDown, User as UserIcon, LogOut, Sparkles, Layers, Bell, CheckCheck, Calendar, Gift, ShieldCheck, Inbox } from "lucide-react";
import type { AppNotification } from "../api/types";

export const Layout: React.FC = () => {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifMenuOpen, setNotifMenuOpen] = useState<boolean>(false);
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

                {(user?.role === "admin" || user?.role === "hr") && (
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
                    <span>{user?.role === "hr" ? "Approvals Track" : "Approval Queue"}</span>
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

          {/* Global Notification Bell & Dropdown */}
          {user && (
            <div ref={notifRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={handleToggleNotifications}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "34px",
                  height: "34px",
                  borderRadius: "50%",
                  border: notifMenuOpen ? "1px solid var(--accent-purple-border)" : "1px solid var(--border-subtle)",
                  backgroundColor: notifMenuOpen ? "#ffffff" : "var(--bg-surface-elevated)",
                  color: notifMenuOpen ? "var(--accent-purple)" : "var(--text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell size={16} />
                {unreadNotifications > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-2px",
                      right: "-2px",
                      minWidth: "16px",
                      height: "16px",
                      borderRadius: "10px",
                      backgroundColor: "#ef4444",
                      color: "#ffffff",
                      fontSize: "9.5px",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 3px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
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
                    width: "360px",
                    maxHeight: "440px",
                    backgroundColor: "#ffffff",
                    borderRadius: "14px",
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)",
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
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: "#fafbfc",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                        Notifications
                      </span>
                      {unreadNotifications > 0 && (
                        <span
                          className="mono"
                          style={{
                            fontSize: "10px",
                            backgroundColor: "var(--accent-purple-subtle)",
                            color: "var(--accent-purple)",
                            padding: "2px 6px",
                            borderRadius: "10px",
                            fontWeight: 700,
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
                          fontSize: "11px",
                          color: "var(--accent-purple)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <CheckCheck size={12} />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>

                  {/* Popover Body / Feed */}
                  <div style={{ overflowY: "auto", flex: 1, maxHeight: "380px" }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-muted)" }}>
                        <Inbox size={28} style={{ margin: "0 auto 8px auto", opacity: 0.5 }} />
                        <div style={{ fontSize: "12.5px", fontWeight: 600 }}>No notifications yet</div>
                        <div style={{ fontSize: "11px", marginTop: "4px" }}>
                          You'll receive alerts here when candidate actions or stage updates happen.
                        </div>
                      </div>
                    ) : (
                      notifications.slice(0, 15).map((notif) => {
                        const isUnread = !notif.is_read;
                        const icon = notif.notification_type.includes("offer") ? (
                          <Gift size={14} color="#a855f7" />
                        ) : notif.notification_type.includes("interview") ? (
                          <Calendar size={14} color="#6366f1" />
                        ) : notif.notification_type.includes("onboarding") ? (
                          <ShieldCheck size={14} color="#10b981" />
                        ) : (
                          <Bell size={14} color="#f59e0b" />
                        );

                        return (
                          <div
                            key={notif.id}
                            onClick={() => handleNotificationClick(notif)}
                            style={{
                              padding: "10px 14px",
                              borderBottom: "1px solid var(--border-subtle)",
                              backgroundColor: isUnread ? "rgba(100, 82, 206, 0.04)" : "#ffffff",
                              cursor: "pointer",
                              display: "flex",
                              gap: "10px",
                              alignItems: "flex-start",
                              transition: "background 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "rgba(100, 82, 206, 0.08)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = isUnread ? "rgba(100, 82, 206, 0.04)" : "#ffffff";
                            }}
                          >
                            <div
                              style={{
                                marginTop: "2px",
                                width: "26px",
                                height: "26px",
                                borderRadius: "8px",
                                backgroundColor: isUnread ? "rgba(100, 82, 206, 0.12)" : "var(--bg-canvas)",
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
                                    fontSize: "12px",
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
                                      width: "6px",
                                      height: "6px",
                                      borderRadius: "50%",
                                      backgroundColor: "var(--accent-purple)",
                                      flexShrink: 0,
                                    }}
                                  />
                                )}
                              </div>

                              <p
                                style={{
                                  fontSize: "11.5px",
                                  color: "var(--text-secondary)",
                                  margin: "2px 0 4px 0",
                                  lineHeight: "1.4",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                }}
                              >
                                {notif.body_text}
                              </p>

                              <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
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
