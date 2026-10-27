import React, { useState, useEffect } from "react";
import { api, ApiError } from "../api/client";
import type { UserGovernance, AccountLog, ApproverRole } from "../api/types";
import { useAuth } from "../context/AuthContext";
import {
  Shield,
  UserPlus,
  Users,
  FileText,
  Key,
  Copy,
  Check,
  RefreshCw,
  Search,
  AlertCircle,
  Terminal,
  ShieldCheck,
  Briefcase,
  Lock,
  Mail,
  User,
  Sparkles,
  Filter,
} from "lucide-react";

const ROLE_OPTIONS = [
  { value: "hr", label: "Recruiter / Talent Ops", desc: "Manages talent pipelines, requisitions, and candidate workflows", icon: Briefcase, color: "#10b981", bg: "#ecfdf5" },
  { value: "interviewer", label: "Technical Interviewer", desc: "Conducts evaluations, fills scorecards, and asks interview questions", icon: Terminal, color: "#6366f1", bg: "#eef2ff" },
  { value: "approver", label: "Approver / Executive", desc: "Signs off on offers, approves requisitions, and governs hires", icon: ShieldCheck, color: "#f59e0b", bg: "#fffbeb" },
  { value: "admin", label: "System Administrator", desc: "Provisions accounts, manages security, and oversees audit logs", icon: Shield, color: "#8b5cf6", bg: "#f5f3ff" },
];

const APPROVER_TIERS: { value: ApproverRole; label: string }[] = [
  { value: "hiring_manager", label: "Hiring Manager (Tier 1)" },
  { value: "director", label: "Director (Tier 2)" },
  { value: "vp", label: "Vice President (Tier 3)" },
  { value: "ceo", label: "Chief Executive Officer (Tier 4)" },
];

const AVAILABLE_SECONDARY_ROLES = [
  { key: "interviewer", label: "Technical Interviewer", icon: Terminal, color: "#4f46e5" },
  { key: "approver", label: "Hiring Manager", icon: ShieldCheck, color: "#d97706" },
  { key: "hr", label: "Recruiter", icon: Briefcase, color: "#059669" },
];

function generateSecurePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  let pass = "";
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass + "1A!";
}

export const AdminConsolePage: React.FC = () => {
  const { user: currentAdmin } = useAuth();

  // Active Workspace Tab: "provision" | "directory" | "logs"
  const [activeTab, setActiveTab] = useState<"provision" | "directory" | "logs">("provision");

  // State: Directory
  const [users, setUsers] = useState<UserGovernance[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [userSearch, setUserSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // State: Account Logs
  const [logs, setLogs] = useState<AccountLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // State: Provisioning Form
  const [provName, setProvName] = useState<string>("");
  const [provEmail, setProvEmail] = useState<string>("");
  const [provPassword, setProvPassword] = useState<string>(generateSecurePassword());
  const [provRole, setProvRole] = useState<"hr" | "interviewer" | "approver" | "admin">("hr");
  const [provApproverTier, setProvApproverTier] = useState<ApproverRole>("hiring_manager");
  const [provSecondaryRoles, setProvSecondaryRoles] = useState<string[]>([]);
  const [provisioning, setProvisioning] = useState<boolean>(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Credential Handoff Card State
  const [handoffCard, setHandoffCard] = useState<{
    name: string;
    email: string;
    password: string;
    role: string;
    secondary_roles: string[];
    approver_role?: string | null;
  } | null>(null);
  const [copiedHandoff, setCopiedHandoff] = useState<boolean>(false);

  // Password Reset Modal State
  const [resetModalUser, setResetModalUser] = useState<UserGovernance | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState<string>("");
  const [resetting, setResetting] = useState<boolean>(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [copiedReset, setCopiedReset] = useState<boolean>(false);

  // Global Alerts
  const [bannerAlert, setBannerAlert] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadUsers();
    loadLogs();
  }, []);

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const data = await api.listGovernanceUsers();
      setUsers(data);
    } catch (err: unknown) {
      console.error("Failed to load users", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadLogs = async () => {
    try {
      setLoadingLogs(true);
      const data = await api.getAccountLogs();
      setLogs(data);
    } catch (err: unknown) {
      console.error("Failed to load account logs", err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisionError(null);

    if (!provEmail.trim() || !provPassword.trim()) {
      setProvisionError("Email and initial password are required.");
      return;
    }

    setProvisioning(true);
    try {
      const created = await api.adminCreateUser({
        name: provName.trim() || undefined,
        email: provEmail.trim(),
        password: provPassword.trim(),
        role: provRole,
        approver_role: provRole === "approver" ? provApproverTier : undefined,
        secondary_roles: provSecondaryRoles,
      });

      // Show handoff card
      setHandoffCard({
        name: provName.trim() || "Team Member",
        email: provEmail.trim(),
        password: provPassword.trim(),
        role: provRole,
        secondary_roles: provSecondaryRoles,
        approver_role: provRole === "approver" ? provApproverTier : null,
      });

      setBannerAlert({
        type: "success",
        text: `Account for ${created.email} provisioned successfully! Credentials ready for handoff below.`,
      });

      // Reset form fields with new password
      setProvName("");
      setProvEmail("");
      setProvPassword(generateSecurePassword());
      setProvSecondaryRoles([]);

      // Reload directory & logs
      loadUsers();
      loadLogs();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to provision employee account.";
      setProvisionError(msg);
    } finally {
      setProvisioning(false);
    }
  };

  const copyCredentials = (email: string, pass: string, roleTitle: string) => {
    const text = `Welcome to ReSumo!\n\nYour employee account has been provisioned by the Administrator:\nPortal: ${window.location.origin}/login\nEmail: ${email}\nInitial Password: ${pass}\nAssigned Role: ${roleTitle.toUpperCase()}\n\nPlease sign in and update your security settings upon your first login.`;
    navigator.clipboard.writeText(text);
    setCopiedHandoff(true);
    setTimeout(() => setCopiedHandoff(false), 2500);
  };

  const copyResetCredentials = (email: string, pass: string) => {
    const text = `Your ReSumo account password has been updated by the Administrator:\nPortal: ${window.location.origin}/login\nEmail: ${email}\nNew Password: ${pass}\n\nPlease sign in with these credentials.`;
    navigator.clipboard.writeText(text);
    setCopiedReset(true);
    setTimeout(() => setCopiedReset(false), 2500);
  };

  const toggleSecondaryRole = async (targetUser: UserGovernance, roleKey: string) => {
    try {
      setUpdatingUserId(targetUser.id);
      const current = Array.isArray(targetUser.secondary_roles) ? targetUser.secondary_roles : [];
      const updated = current.includes(roleKey)
        ? current.filter((r) => r !== roleKey)
        : [...current, roleKey];

      const res = await api.updateUserRolesGovernance(targetUser.id, {
        secondary_roles: updated,
      });

      setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? res : u)));
      setBannerAlert({
        type: "success",
        text: `Updated permissions for ${targetUser.email}`,
      });
      loadLogs();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to update role permissions.";
      setBannerAlert({ type: "error", text: msg });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleOpenResetModal = (u: UserGovernance) => {
    setResetModalUser(u);
    setResetPasswordVal(generateSecurePassword());
    setResetSuccessMessage(null);
    setCopiedReset(false);
  };

  const handleExecuteResetPassword = async () => {
    if (!resetModalUser || !resetPasswordVal.trim()) return;
    setResetting(true);
    try {
      await api.adminResetPassword(resetModalUser.id, {
        new_password: resetPasswordVal.trim(),
      });
      setResetSuccessMessage(`Password updated successfully for ${resetModalUser.email}. Copy credentials below.`);
      loadLogs();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to reset password.";
      setBannerAlert({ type: "error", text: msg });
    } finally {
      setResetting(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div style={{ padding: "32px 40px", maxWidth: "1280px", margin: "0 auto", minHeight: "calc(100vh - 72px)" }}>
      {/* Top Banner Alert */}
      {bannerAlert && (
        <div
          style={{
            marginBottom: "24px",
            padding: "12px 20px",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: bannerAlert.type === "success" ? "#ecfdf5" : "#fef2f2",
            border: bannerAlert.type === "success" ? "1px solid #a7f3d0" : "1px solid #fecaca",
            color: bannerAlert.type === "success" ? "#065f46" : "#991b1b",
            fontSize: "13.5px",
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {bannerAlert.type === "success" ? <Check size={18} /> : <AlertCircle size={18} />}
            <span>{bannerAlert.text}</span>
          </div>
          <button
            onClick={() => setBannerAlert(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header Section */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "32px",
          gap: "24px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)",
              }}
            >
              <Shield size={20} />
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.5px" }}>
              Administrator Console
            </h1>
          </div>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "14px", lineHeight: "1.5" }}>
            Provision company accounts, assign roles, hand off credentials, and inspect security audit logs.
          </p>
        </div>

        {/* Admin Badge */}
        <div
          style={{
            padding: "8px 16px",
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "var(--radius-pill)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "#10b981",
              boxShadow: "0 0 6px #10b981",
            }}
          />
          <span style={{ fontSize: "12.5px", color: "#475569", fontWeight: 600 }}>
            Logged in as Administrator ({currentAdmin?.email})
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid var(--border-color)",
          marginBottom: "28px",
          paddingBottom: "2px",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("provision")}
          style={{
            padding: "10px 20px",
            border: "none",
            background: "none",
            fontSize: "14px",
            fontWeight: activeTab === "provision" ? 700 : 500,
            color: activeTab === "provision" ? "#7c3aed" : "var(--text-secondary)",
            borderBottom: activeTab === "provision" ? "2px solid #7c3aed" : "2px solid transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <UserPlus size={16} />
          <span>Provision Employee Account</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("directory")}
          style={{
            padding: "10px 20px",
            border: "none",
            background: "none",
            fontSize: "14px",
            fontWeight: activeTab === "directory" ? 700 : 500,
            color: activeTab === "directory" ? "#7c3aed" : "var(--text-secondary)",
            borderBottom: activeTab === "directory" ? "2px solid #7c3aed" : "2px solid transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <Users size={16} />
          <span>Employee Directory & Roles ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          style={{
            padding: "10px 20px",
            border: "none",
            background: "none",
            fontSize: "14px",
            fontWeight: activeTab === "logs" ? 700 : 500,
            color: activeTab === "logs" ? "#7c3aed" : "var(--text-secondary)",
            borderBottom: activeTab === "logs" ? "2px solid #7c3aed" : "2px solid transparent",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            transition: "all 0.15s ease",
          }}
        >
          <FileText size={16} />
          <span>Account & Security Logs</span>
        </button>
      </div>

      {/* =====================================================================
          WORKSPACE 1: PROVISION EMPLOYEE ACCOUNT
         ===================================================================== */}
      {activeTab === "provision" && (
        <div style={{ display: "grid", gridTemplateColumns: handoffCard ? "1fr 1fr" : "1fr", gap: "32px", alignItems: "start" }}>
          {/* Provision Form */}
          <div
            className="panel"
            style={{
              padding: "28px",
              borderRadius: "var(--radius-lg)",
              backgroundColor: "#ffffff",
              border: "1px solid var(--border-color)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04)",
            }}
          >
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
                Create New Company Account
              </h2>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                Employees never register publicly. As the Administrator, configure their identity, roles, and initial credentials below.
              </p>
            </div>

            {provisionError && (
              <div
                style={{
                  marginBottom: "20px",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <AlertCircle size={16} />
                <span>{provisionError}</span>
              </div>
            )}

            <form onSubmit={handleProvisionSubmit}>
              {/* Full Name */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                  Employee Full Name
                </label>
                <div style={{ position: "relative" }}>
                  <User size={16} style={{ position: "absolute", left: "12px", top: "11px", color: "#94a3b8" }} />
                  <input
                    type="text"
                    value={provName}
                    onChange={(e) => setProvName(e.target.value)}
                    placeholder="e.g. Rachel Adams"
                    style={{
                      width: "100%",
                      padding: "9px 12px 9px 38px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #cbd5e1",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Corporate Email */}
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                  Corporate Email Address <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div style={{ position: "relative" }}>
                  <Mail size={16} style={{ position: "absolute", left: "12px", top: "11px", color: "#94a3b8" }} />
                  <input
                    type="email"
                    required
                    value={provEmail}
                    onChange={(e) => setProvEmail(e.target.value)}
                    placeholder="e.g. rachel.adams@resumo.ai"
                    style={{
                      width: "100%",
                      padding: "9px 12px 9px 38px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #cbd5e1",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Primary Role Selector */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                  Select Primary Role
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {ROLE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = provRole === opt.value;
                    return (
                      <div
                        key={opt.value}
                        onClick={() => setProvRole(opt.value as any)}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "var(--radius-md)",
                          border: isSelected ? `2px solid ${opt.color}` : "1px solid #e2e8f0",
                          backgroundColor: isSelected ? opt.bg : "#ffffff",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <Icon size={16} color={opt.color} />
                          <span style={{ fontSize: "13px", fontWeight: 700, color: isSelected ? opt.color : "var(--text-primary)" }}>
                            {opt.label.split(" / ")[0]}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: "11px", color: "#64748b", lineHeight: "1.35" }}>
                          {opt.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Approver Tier (Conditional) */}
              {provRole === "approver" && (
                <div style={{ marginBottom: "18px", padding: "14px", backgroundColor: "#fffbeb", borderRadius: "var(--radius-md)", border: "1px solid #fde68a" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#92400e", marginBottom: "6px" }}>
                    Executive Approver Tier (Signing Authority)
                  </label>
                  <select
                    value={provApproverTier}
                    onChange={(e) => setProvApproverTier(e.target.value as ApproverRole)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #f59e0b",
                      backgroundColor: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 600,
                      outline: "none",
                    }}
                  >
                    {APPROVER_TIERS.map((tier) => (
                      <option key={tier.value} value={tier.value}>
                        {tier.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cross-Functional Secondary Roles */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                  Cross-Functional Secondary Roles
                </label>
                <p style={{ fontSize: "11.5px", color: "#64748b", margin: "0 0 10px 0" }}>
                  Enable multi-role capabilities (e.g. allowing this employee to conduct interviews or sign off in secondary approvals).
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {AVAILABLE_SECONDARY_ROLES.map((sec) => {
                    const isChecked = provSecondaryRoles.includes(sec.key);
                    const Icon = sec.icon;
                    return (
                      <button
                        type="button"
                        key={sec.key}
                        onClick={() => {
                          setProvSecondaryRoles((prev) =>
                            prev.includes(sec.key) ? prev.filter((r) => r !== sec.key) : [...prev, sec.key]
                          );
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "var(--radius-pill)",
                          border: isChecked ? `1.5px solid ${sec.color}` : "1px solid #cbd5e1",
                          backgroundColor: isChecked ? `${sec.color}15` : "#f8fafc",
                          color: isChecked ? sec.color : "#475569",
                          fontSize: "12px",
                          fontWeight: isChecked ? 700 : 500,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Icon size={13} />
                        <span>{sec.label}</span>
                        {isChecked && <Check size={13} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Initial Password Generator */}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                    Initial Password <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setProvPassword(generateSecurePassword())}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#7c3aed",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Regenerate Secure Password</span>
                  </button>
                </div>
                <div style={{ position: "relative" }}>
                  <Lock size={16} style={{ position: "absolute", left: "12px", top: "11px", color: "#94a3b8" }} />
                  <input
                    type="text"
                    required
                    value={provPassword}
                    onChange={(e) => setProvPassword(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px 9px 38px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #cbd5e1",
                      fontFamily: "monospace",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                      outline: "none",
                      backgroundColor: "#f8fafc",
                    }}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={provisioning}
                className="btn btn-primary"
                style={{
                  width: "100%",
                  padding: "11px 20px",
                  fontSize: "14px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  backgroundColor: "#7c3aed",
                  borderColor: "#7c3aed",
                  cursor: provisioning ? "not-allowed" : "pointer",
                }}
              >
                {provisioning ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Provisioning Account & Generating Log...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    <span>Provision & Save Employee Account</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Credential Handoff Card */}
          {handoffCard && (
            <div
              style={{
                padding: "28px",
                borderRadius: "var(--radius-lg)",
                background: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)",
                border: "1px solid #312e81",
                boxShadow: "0 10px 25px -5px rgba(30, 27, 75, 0.4)",
                color: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      backgroundColor: "#38bdf820",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#38bdf8",
                    }}
                  >
                    <Key size={16} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#f8fafc" }}>
                    Credential Handoff Card
                  </h3>
                </div>
                <span
                  style={{
                    fontSize: "11.5px",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    backgroundColor: "#10b98125",
                    color: "#34d399",
                    border: "1px solid #10b98140",
                  }}
                >
                  Ready to Provide
                </span>
              </div>

              <p style={{ fontSize: "13px", color: "#94a3b8", lineHeight: "1.5", margin: "0 0 20px 0" }}>
                This account is created and registered with your company. Copy these credentials to send to <strong>{handoffCard.name}</strong>.
              </p>

              <div
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "var(--radius-md)",
                  padding: "16px",
                  marginBottom: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.5px" }}>
                    Sign-in URL
                  </span>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#38bdf8", marginTop: "2px" }}>
                    {window.location.origin}/login
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.5px" }}>
                    Corporate Email
                  </span>
                  <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#f8fafc", marginTop: "2px" }}>
                    {handoffCard.email}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.5px" }}>
                    Initial Password
                  </span>
                  <div style={{ fontSize: "14px", fontFamily: "monospace", fontWeight: 700, color: "#a5b4fc", marginTop: "2px" }}>
                    {handoffCard.password}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.5px" }}>
                    Assigned Role & Permissions
                  </span>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", backgroundColor: "#4f46e5", color: "#ffffff" }}>
                      PRIMARY: {handoffCard.role.toUpperCase()}
                      {handoffCard.approver_role ? ` (${handoffCard.approver_role})` : ""}
                    </span>
                    {handoffCard.secondary_roles.map((sr) => (
                      <span key={sr} style={{ fontSize: "11.5px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", backgroundColor: "#334155", color: "#cbd5e1" }}>
                        + {sr}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => copyCredentials(handoffCard.email, handoffCard.password, handoffCard.role)}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: copiedHandoff ? "#10b981" : "#38bdf8",
                  color: "#0f172a",
                  fontSize: "13.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "all 0.15s ease",
                }}
              >
                {copiedHandoff ? (
                  <>
                    <Check size={16} />
                    <span>Credentials Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    <span>1-Click Copy Account Credentials</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          WORKSPACE 2: EMPLOYEE DIRECTORY & ROLES
         ===================================================================== */}
      {activeTab === "directory" && (
        <div>
          {/* Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "20px",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {/* Search */}
            <div style={{ position: "relative", width: "320px" }}>
              <Search size={15} style={{ position: "absolute", left: "12px", top: "10px", color: "#94a3b8" }} />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 36px",
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Role Filter & Refresh */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
                <Filter size={14} />
                <span>Filter Role:</span>
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: "7px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid #cbd5e1",
                  fontSize: "12.5px",
                  outline: "none",
                }}
              >
                <option value="all">All Roles ({users.length})</option>
                <option value="hr">Recruiter / HR</option>
                <option value="interviewer">Interviewer</option>
                <option value="approver">Approver</option>
                <option value="admin">Administrator</option>
                <option value="candidate">Candidate</option>
              </select>

              <button
                type="button"
                onClick={loadUsers}
                className="btn btn-outline"
                style={{ padding: "7px 12px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <RefreshCw size={13} className={loadingUsers ? "animate-spin" : ""} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Directory Table */}
          <div
            className="panel"
            style={{
              padding: 0,
              borderRadius: "var(--radius-lg)",
              backgroundColor: "#ffffff",
              border: "1px solid var(--border-color)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Employee</th>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Primary Role</th>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Multi-Role Permissions</th>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Member Since</th>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: "0 auto 8px auto" }} />
                      <div>Loading company accounts...</div>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                      No accounts found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const secRoles = Array.isArray(u.secondary_roles) ? u.secondary_roles : [];
                    const isUpdating = updatingUserId === u.id;
                    return (
                      <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        {/* Employee Name & Email */}
                        <td style={{ padding: "14px 20px" }}>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.name || "—"}</div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>{u.email}</div>
                        </td>

                        {/* Primary Role */}
                        <td style={{ padding: "14px 20px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 10px",
                              borderRadius: "var(--radius-pill)",
                              fontSize: "11.5px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.3px",
                              backgroundColor:
                                u.role === "admin"
                                  ? "#f5f3ff"
                                  : u.role === "approver"
                                  ? "#fffbeb"
                                  : u.role === "interviewer"
                                  ? "#eef2ff"
                                  : u.role === "hr"
                                  ? "#ecfdf5"
                                  : "#f1f5f9",
                              color:
                                u.role === "admin"
                                  ? "#7c3aed"
                                  : u.role === "approver"
                                  ? "#d97706"
                                  : u.role === "interviewer"
                                  ? "#4f46e5"
                                  : u.role === "hr"
                                  ? "#059669"
                                  : "#475569",
                              border: "1px solid rgba(0,0,0,0.06)",
                            }}
                          >
                            {u.role}
                            {u.approver_role ? ` (${u.approver_role})` : ""}
                          </span>
                        </td>

                        {/* Secondary Roles Toggle */}
                        <td style={{ padding: "14px 20px" }}>
                          {u.role === "candidate" ? (
                            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Candidate profile</span>
                          ) : (
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                              {AVAILABLE_SECONDARY_ROLES.map((sec) => {
                                const hasRole = secRoles.includes(sec.key);
                                const isSelf = u.role === sec.key;
                                if (isSelf) return null; // Don't show secondary toggle for primary role

                                return (
                                  <button
                                    type="button"
                                    key={sec.key}
                                    disabled={isUpdating}
                                    onClick={() => toggleSecondaryRole(u, sec.key)}
                                    title={hasRole ? `Click to revoke ${sec.label}` : `Click to grant ${sec.label}`}
                                    style={{
                                      padding: "3px 8px",
                                      borderRadius: "12px",
                                      border: hasRole ? `1px solid ${sec.color}` : "1px dashed #cbd5e1",
                                      backgroundColor: hasRole ? `${sec.color}15` : "transparent",
                                      color: hasRole ? sec.color : "#94a3b8",
                                      fontSize: "11px",
                                      fontWeight: hasRole ? 700 : 500,
                                      cursor: isUpdating ? "not-allowed" : "pointer",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    <span>{sec.label}</span>
                                    {hasRole && <Check size={11} />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        {/* Member Since */}
                        <td style={{ padding: "14px 20px", color: "#64748b", fontSize: "12.5px" }}>
                          {new Date(u.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "14px 20px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => handleOpenResetModal(u)}
                            className="btn btn-outline"
                            style={{
                              padding: "4px 10px",
                              fontSize: "11.5px",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Key size={12} />
                            <span>Reset Password</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          WORKSPACE 3: ACCOUNT & SECURITY AUDIT LOGS ("Account logs and stuff")
         ===================================================================== */}
      {activeTab === "logs" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
                Account Activity & Security Audit Trail
              </h2>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                Immutable audit logs documenting account provisioning, role changes, and credential updates.
              </p>
            </div>
            <button
              type="button"
              onClick={loadLogs}
              className="btn btn-outline"
              style={{ padding: "7px 14px", fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <RefreshCw size={13} className={loadingLogs ? "animate-spin" : ""} />
              <span>Refresh Logs</span>
            </button>
          </div>

          <div
            className="panel"
            style={{
              padding: 0,
              borderRadius: "var(--radius-lg)",
              backgroundColor: "#ffffff",
              border: "1px solid var(--border-color)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Timestamp</th>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Action</th>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Admin Responsible</th>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Target Account</th>
                  <th style={{ padding: "14px 20px", fontWeight: 700, color: "#475569" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {loadingLogs ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: "0 auto 8px auto" }} />
                      <div>Loading audit logs...</div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
                      No account events logged yet. Provision an account or update a role to begin logging.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const actionBadge =
                      log.action === "account_created"
                        ? { text: "ACCOUNT CREATED", color: "#059669", bg: "#ecfdf5" }
                        : log.action === "roles_updated"
                        ? { text: "ROLES UPDATED", color: "#7c3aed", bg: "#f5f3ff" }
                        : log.action === "password_reset"
                        ? { text: "PASSWORD RESET", color: "#d97706", bg: "#fffbeb" }
                        : { text: log.action.toUpperCase(), color: "#475569", bg: "#f1f5f9" };

                    return (
                      <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        {/* Timestamp */}
                        <td style={{ padding: "14px 20px", color: "#64748b", fontSize: "12.5px", whiteSpace: "nowrap" }}>
                          {new Date(log.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>

                        {/* Action Badge */}
                        <td style={{ padding: "14px 20px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "3px 8px",
                              borderRadius: "var(--radius-pill)",
                              fontSize: "11px",
                              fontWeight: 700,
                              backgroundColor: actionBadge.bg,
                              color: actionBadge.color,
                              border: `1px solid ${actionBadge.color}30`,
                            }}
                          >
                            {actionBadge.text}
                          </span>
                        </td>

                        {/* Admin */}
                        <td style={{ padding: "14px 20px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {log.admin_name || "System Admin"}
                        </td>

                        {/* Target Account */}
                        <td style={{ padding: "14px 20px", color: "var(--text-primary)", fontWeight: 500 }}>
                          {log.target_user_email || log.details?.email || "—"}
                        </td>

                        {/* Details */}
                        <td style={{ padding: "14px 20px", color: "#475569", fontSize: "12px" }}>
                          {log.action === "account_created" && (
                            <span>
                              Role: <strong>{log.details?.role}</strong>
                              {log.details?.approver_role ? ` (${log.details?.approver_role})` : ""}
                              {log.details?.secondary_roles?.length ? ` · Multi-roles: [${log.details.secondary_roles.join(", ")}]` : ""}
                            </span>
                          )}
                          {log.action === "roles_updated" && (
                            <span>
                              Updated roles: <strong>{log.details?.role}</strong>
                              {log.details?.secondary_roles?.length ? ` · Multi-roles: [${log.details.secondary_roles.join(", ")}]` : ""}
                            </span>
                          )}
                          {log.action === "password_reset" && (
                            <span>
                              Password updated by <em>{log.details?.reset_by || "Administrator"}</em>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          PASSWORD RESET MODAL
         ===================================================================== */}
      {resetModalUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "480px",
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-lg)",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  backgroundColor: "#fffbeb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#d97706",
                }}
              >
                <Key size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Reset Employee Password
                </h3>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                  {resetModalUser.email}
                </p>
              </div>
            </div>

            {resetSuccessMessage ? (
              <div>
                <div
                  style={{
                    padding: "12px 14px",
                    backgroundColor: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    borderRadius: "var(--radius-md)",
                    color: "#065f46",
                    fontSize: "13px",
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Check size={16} />
                  <span>{resetSuccessMessage}</span>
                </div>

                <div
                  style={{
                    padding: "14px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "var(--radius-md)",
                    marginBottom: "20px",
                  }}
                >
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b", marginBottom: "4px" }}>
                    New Generated Password
                  </div>
                  <div style={{ fontSize: "15px", fontFamily: "monospace", fontWeight: 700, color: "#1e293b" }}>
                    {resetPasswordVal}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => copyResetCredentials(resetModalUser.email, resetPasswordVal)}
                    className="btn btn-primary"
                    style={{
                      flex: 1,
                      padding: "9px 16px",
                      fontSize: "13px",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    {copiedReset ? <Check size={15} /> : <Copy size={15} />}
                    <span>{copiedReset ? "Copied!" : "Copy New Credentials"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="btn btn-outline"
                    style={{ padding: "9px 16px", fontSize: "13px" }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", marginBottom: "16px" }}>
                  Enter or generate a new temporary password for this user. The reset event will be recorded in the security audit logs.
                </p>

                <div style={{ marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                      New Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setResetPasswordVal(generateSecurePassword())}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#7c3aed",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Regenerate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={resetPasswordVal}
                    onChange={(e) => setResetPasswordVal(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid #cbd5e1",
                      fontFamily: "monospace",
                      fontSize: "13.5px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="btn btn-outline"
                    style={{ padding: "8px 16px", fontSize: "13px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={resetting || !resetPasswordVal.trim()}
                    onClick={handleExecuteResetPassword}
                    className="btn btn-primary"
                    style={{
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: 600,
                      backgroundColor: "#7c3aed",
                      borderColor: "#7c3aed",
                    }}
                  >
                    {resetting ? "Updating..." : "Confirm Password Reset"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminConsolePage;
