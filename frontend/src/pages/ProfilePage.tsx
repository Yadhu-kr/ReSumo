import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getUserDisplayName,
  getUserInitials,
  getRoleBadgeLabel,
  getAvatarGradient,
} from "../lib/user";
import {
  User as UserIcon,
  Mail,
  Shield,
  Building2,
  Calendar,
  CheckCircle2,
  ArrowRight,
  LogOut,
  Sparkles,
  Key,
  Briefcase,
  Layers,
} from "lucide-react";

export const ProfilePage: React.FC = () => {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [nameInput, setNameInput] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setNameInput(user.name || getUserDisplayName(user));
    }
  }, [user]);

  if (!user) {
    return (
      <div style={{ padding: "80px", textAlign: "center", color: "var(--text-muted)" }}>
        Loading profile...
      </div>
    );
  }

  const displayName = getUserDisplayName(user);
  const initials = getUserInitials(user);
  const roleLabel = getRoleBadgeLabel(user.role, user.approver_role);
  const avatarBg = getAvatarGradient(displayName);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    const trimmed = nameInput.trim();
    if (!trimmed) {
      setErrorMsg("Display name cannot be empty.");
      return;
    }

    try {
      setSaving(true);
      await updateUser({ name: trimmed });
      setSuccessMsg("Profile updated successfully.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update profile";
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Breadcrumb / Navigation helper */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link
          to={user.role === "candidate" ? "/portal" : user.role === "approver" ? "/approvals" : "/"}
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontWeight: 500,
          }}
        >
          <span>← Back to {user.role === "candidate" ? "Candidate Portal" : "Dashboard"}</span>
        </Link>
        <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          USER ID: {user.id.slice(0, 8)}...
        </span>
      </div>

      {/* Hero Profile Identity Card */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          border: "1px solid var(--border-subtle)",
          padding: "28px 32px",
          boxShadow: "0 4px 24px rgba(35, 15, 75, 0.04)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle decorative background gradient glow */}
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: "240px",
            height: "240px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(100, 82, 206, 0.12) 0%, rgba(255,255,255,0) 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
            {/* Large Avatar */}
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: avatarBg,
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "26px",
                fontWeight: 800,
                letterSpacing: "0.5px",
                boxShadow: "0 8px 24px rgba(100, 82, 206, 0.25)",
                border: "3px solid #ffffff",
                flexShrink: 0,
              }}
            >
              {initials}
            </div>

            {/* Identity Details */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  {displayName}
                </h1>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    padding: "3px 10px",
                    borderRadius: "50px",
                    backgroundColor: "var(--accent-purple-subtle)",
                    color: "var(--accent-purple)",
                    border: "1px solid var(--accent-purple-border)",
                  }}
                >
                  {roleLabel}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", fontSize: "13px" }}>
                  <Mail size={14} style={{ color: "var(--text-muted)" }} />
                  <span>{user.email}</span>
                </div>

                {user.role !== "candidate" && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-secondary)", fontSize: "13px" }}>
                    <Building2 size={14} style={{ color: "var(--text-muted)" }} />
                    <span>ReSumo Technologies</span>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-muted)", fontSize: "12px" }}>
                  <Calendar size={13} />
                  <span>Joined {new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 18px",
              borderRadius: "50px",
              backgroundColor: "#ffffff",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-secondary)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--status-rejected-text)";
              e.currentTarget.style.borderColor = "var(--status-rejected-border)";
              e.currentTarget.style.backgroundColor = "var(--status-rejected-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
              e.currentTarget.style.borderColor = "var(--border-subtle)";
              e.currentTarget.style.backgroundColor = "#ffffff";
            }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "12px",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#15803d",
            fontSize: "13.5px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "12px",
            backgroundColor: "var(--status-rejected-bg)",
            border: "1px solid var(--status-rejected-border)",
            color: "var(--status-rejected-text)",
            fontSize: "13.5px",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Main Two-Column Settings & Info Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", alignItems: "start" }}>
        {/* Left Column: Personal Information Form */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            border: "1px solid var(--border-subtle)",
            padding: "24px 26px",
            boxShadow: "0 2px 12px rgba(35, 15, 75, 0.02)",
          }}
        >
          <div style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              Personal Details
            </h2>
            <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "3px" }}>
              Update your display name across the platform. This name is visible to colleagues and recruiters.
            </p>
          </div>

          <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                FULL NAME
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 38px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "13.5px",
                    backgroundColor: "#fbfcfd",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--accent-purple)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--border-subtle)")}
                />
                <UserIcon
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                EMAIL ADDRESS (PRIMARY IDENTITY)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 38px",
                    borderRadius: "10px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "13.5px",
                    backgroundColor: "#f8fafc",
                    color: "var(--text-muted)",
                    cursor: "not-allowed",
                  }}
                />
                <Mail
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                Email authentication credentials are encrypted and verified.
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{
                  padding: "10px 22px",
                  fontSize: "13px",
                  borderRadius: "50px",
                }}
              >
                {saving ? "Saving Changes..." : "Save Profile Changes"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Role Privileges & Quick Jump */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Role Status Card */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              border: "1px solid var(--border-subtle)",
              padding: "24px",
              boxShadow: "0 2px 12px rgba(35, 15, 75, 0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <Shield size={18} style={{ color: "var(--accent-purple)" }} />
              <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                Role & Access Level
              </h2>
            </div>

            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                backgroundColor: "#f8fafc",
                border: "1px solid var(--border-subtle)",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  CURRENT ASSIGNMENT
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--accent-purple)",
                    textTransform: "uppercase",
                  }}
                >
                  {roleLabel}
                </span>
              </div>
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.4" }}>
                {user.role === "candidate"
                  ? "Self-service candidate account. Authorized to submit resumes, view personal application status, and apply to open requisitions."
                  : user.role === "hr"
                  ? "Recruiter operations account. Authorized to view pipeline Kanban, vector match candidates, and submit for executive approvals."
                  : user.role === "approver"
                  ? `Designated HITL Approver (${user.approver_role?.toUpperCase() || "DIRECT"}). Authorized to evaluate escalated requisitions and sign off on candidates.`
                  : "Platform Administrator. Full administrative permissions across the recruitment workflow."}
              </p>
            </div>

            {/* Quick Actions based on Role */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {user.role === "candidate" ? (
                <>
                  <Link
                    to="/portal"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      textDecoration: "none",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-purple)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Sparkles size={15} style={{ color: "var(--accent-purple)" }} />
                      <span>My Resume & Skill Dossier</span>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </Link>

                  <Link
                    to="/jobs"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      textDecoration: "none",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-purple)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Briefcase size={15} style={{ color: "var(--accent-purple)" }} />
                      <span>Browse Open Jobs</span>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      textDecoration: "none",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-purple)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Layers size={15} style={{ color: "var(--accent-purple)" }} />
                      <span>Pipeline Kanban Board</span>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </Link>

                  <Link
                    to="/jobs"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      textDecoration: "none",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-purple)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Briefcase size={15} style={{ color: "var(--accent-purple)" }} />
                      <span>Requisitions & RAG Matcher</span>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Security & Authentication Notice */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              border: "1px solid var(--border-subtle)",
              padding: "20px 24px",
              boxShadow: "0 2px 12px rgba(35, 15, 75, 0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Key size={16} style={{ color: "var(--accent-purple)" }} />
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                Security & Session
              </h3>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
              Your session is authenticated via JWT Bearer tokens with automated role-based guard authorization.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
