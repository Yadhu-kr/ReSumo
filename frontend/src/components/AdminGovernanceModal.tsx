import React, { useState, useEffect } from "react";
import { api, ApiError } from "../api/client";
import type { UserGovernance } from "../api/types";
import { Users, Check, RefreshCw, Key, ShieldCheck, Terminal, Plus } from "lucide-react";

interface AdminGovernanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_SECONDARY_ROLES = [
  { key: "interviewer", label: "Interviewer", icon: Terminal, color: "#4f46e5", bg: "#eef2ff" },
  { key: "approver", label: "Hiring Manager", icon: ShieldCheck, color: "#d97706", bg: "#fffbeb" },
  { key: "hr", label: "Recruiter", icon: Users, color: "#059669", bg: "#ecfdf5" },
];

export const AdminGovernanceModal: React.FC<AdminGovernanceModalProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<UserGovernance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await api.listGovernanceUsers();
      setUsers(list);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to load governance users";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleSecondaryRole = async (user: UserGovernance, roleKey: string) => {
    try {
      setUpdatingId(user.id);
      setError(null);
      setSuccessMessage(null);

      const currentRoles = Array.isArray(user.secondary_roles) ? user.secondary_roles : [];
      const updatedRoles = currentRoles.includes(roleKey)
        ? currentRoles.filter((r) => r !== roleKey)
        : [...currentRoles, roleKey];

      const res = await api.updateUserRolesGovernance(user.id, {
        secondary_roles: updatedRoles,
      });

      setUsers((prev) => prev.map((u) => (u.id === user.id ? res : u)));
      setSuccessMessage(`Updated multi-role permissions for ${user.email}`);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to update user roles";
      setError(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "20px",
      }}
    >
      <div
        className="panel"
        style={{
          width: "100%",
          maxWidth: "920px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--radius-xl)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          backgroundColor: "#ffffff",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            backgroundColor: "#f8fafc",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                backgroundColor: "var(--accent-purple-subtle)",
                color: "var(--accent-purple)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Key size={18} />
            </span>
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Multi-Role Admin Governance & Role Expansion
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
                Assign secondary roles to enable cross-functional hiring flows (e.g. Hiring Manager + Technical Interviewer).
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={loadUsers}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              title="Refresh users"
            >
              <RefreshCw size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "18px",
                cursor: "pointer",
                color: "var(--text-muted)",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Feedback banners */}
        {error && (
          <div style={{ margin: "16px 24px 0", padding: "10px 14px", backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: "6px", fontSize: "13px" }}>
            {error}
          </div>
        )}
        {successMessage && (
          <div style={{ margin: "16px 24px 0", padding: "10px 14px", backgroundColor: "#f0fdf4", color: "#166534", borderRadius: "6px", fontSize: "13px" }}>
            {successMessage}
          </div>
        )}

        {/* Content Table */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
              Loading user governance registry...
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
              No registered users found.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
              <thead>
                <tr style={{ borderBottom: "1.5px solid var(--border-subtle)", textAlign: "left" }}>
                  <th style={{ padding: "10px 12px", color: "var(--text-muted)", fontWeight: 700, fontSize: "11.5px" }}>USER PERSONA</th>
                  <th style={{ padding: "10px 12px", color: "var(--text-muted)", fontWeight: 700, fontSize: "11.5px" }}>PRIMARY ROLE</th>
                  <th style={{ padding: "10px 12px", color: "var(--text-muted)", fontWeight: 700, fontSize: "11.5px" }}>APPROVER TIER</th>
                  <th style={{ padding: "10px 12px", color: "var(--text-muted)", fontWeight: 700, fontSize: "11.5px" }}>SECONDARY ROLES (EXPANSION)</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const secondary = Array.isArray(u.secondary_roles) ? u.secondary_roles : [];
                  const isUpdating = updatingId === u.id;

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        opacity: isUpdating ? 0.6 : 1,
                        transition: "background-color 0.12s ease",
                      }}
                    >
                      <td style={{ padding: "14px 12px" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          {u.name || u.email.split("@")[0]}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {u.email}
                        </div>
                      </td>

                      <td style={{ padding: "14px 12px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: "9999px",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            backgroundColor:
                              u.role === "admin"
                                ? "#fee2e2"
                                : u.role === "interviewer"
                                ? "#e0e7ff"
                                : u.role === "approver"
                                ? "#fef3c7"
                                : "#ecfdf5",
                            color:
                              u.role === "admin"
                                ? "#991b1b"
                                : u.role === "interviewer"
                                ? "#3730a3"
                                : u.role === "approver"
                                ? "#92400e"
                                : "#065f46",
                          }}
                        >
                          {u.role}
                        </span>
                      </td>

                      <td style={{ padding: "14px 12px" }}>
                        {u.approver_role ? (
                          <span className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            {u.approver_role}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: "14px 12px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                          {AVAILABLE_SECONDARY_ROLES.map((sr) => {
                            const isAssigned = secondary.includes(sr.key);
                            const isPrimary = u.role === sr.key;
                            if (isPrimary) return null; // already primary

                            return (
                              <button
                                key={sr.key}
                                type="button"
                                disabled={isUpdating}
                                onClick={() => toggleSecondaryRole(u, sr.key)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  padding: "3px 9px",
                                  borderRadius: "6px",
                                  border: isAssigned ? `1.5px solid ${sr.color}` : "1px solid var(--border-subtle)",
                                  backgroundColor: isAssigned ? sr.bg : "#ffffff",
                                  color: isAssigned ? sr.color : "var(--text-secondary)",
                                  fontSize: "11.5px",
                                  fontWeight: isAssigned ? 700 : 500,
                                  cursor: "pointer",
                                  transition: "all 0.1s ease",
                                }}
                              >
                                {isAssigned ? <Check size={12} /> : <Plus size={12} />}
                                <span>{sr.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-subtle)",
            backgroundColor: "#f8fafc",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
            Changes take effect immediately across all role-gated routes & permissions.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary"
            style={{ height: "36px", padding: "0 18px", fontSize: "13px" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
