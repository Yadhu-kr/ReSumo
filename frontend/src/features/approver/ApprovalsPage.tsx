import React, { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Approval, ApproverRole, Candidate, Job, ApprovalPolicy } from "../../api/types";
import { EscalationTracker } from "../../components/EscalationTracker";
import { EmptyState } from "../../components/EmptyState";

interface OutletContextType {
  refreshPendingCount?: () => void;
}

const ROLES: { key: ApproverRole; label: string; desc: string }[] = [
  { key: "hiring_manager", label: "Hiring Manager", desc: "Junior & Mid tier direct evaluation" },
  { key: "director", label: "Director", desc: "Senior tier Stage 1 technical evaluation" },
  { key: "vp", label: "VP of Engineering", desc: "Senior tier Stage 2 executive & budget signoff" },
  { key: "ceo", label: "Chief Executive Officer", desc: "Executive tier final authorization" },
];

export const ApprovalsPage: React.FC = () => {
  const { refreshPendingCount } = useOutletContext<OutletContextType>();
  const [activeRole, setActiveRole] = useState<ApproverRole>("hiring_manager");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [candidatesMap, setCandidatesMap] = useState<Record<string, Candidate>>({});
  const [jobsMap, setJobsMap] = useState<Record<string, Job>>({});
  const [roleCounts, setRoleCounts] = useState<Record<ApproverRole, number>>({
    hiring_manager: 0,
    director: 0,
    vp: 0,
    ceo: 0,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Action dialog state
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [actionNotes, setActionNotes] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Policy inspection tab for Viva demonstration
  const [showPolicyDemo, setShowPolicyDemo] = useState<boolean>(false);
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState<boolean>(false);

  const loadApprovalsAndContext = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch pending for all roles in parallel to populate counters
      const [allPending, currentRolePending, candidatesList, jobsList] = await Promise.all([
        api.listPendingApprovals(),
        api.listPendingApprovals(activeRole),
        api.listCandidates(),
        api.listJobs(),
      ]);

      // Calculate counts per role
      const counts: Record<ApproverRole, number> = {
        hiring_manager: 0,
        director: 0,
        vp: 0,
        ceo: 0,
      };
      allPending.forEach((a) => {
        if (a.approver_role in counts) {
          counts[a.approver_role as ApproverRole] += 1;
        }
      });
      setRoleCounts(counts);

      // Current view approvals
      setApprovals(currentRolePending);

      // Index maps
      const cMap: Record<string, Candidate> = {};
      candidatesList.forEach((c) => {
        cMap[c.id] = c;
      });
      setCandidatesMap(cMap);

      const jMap: Record<string, Job> = {};
      jobsList.forEach((j) => {
        jMap[j.id] = j;
      });
      setJobsMap(jMap);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to load pending approvals";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApprovalsAndContext();
  }, [activeRole]);

  const loadPolicies = async () => {
    try {
      setPoliciesLoading(true);
      const data = await api.listApprovalPolicies();
      setPolicies(data);
    } catch {
      // Ignored
    } finally {
      setPoliciesLoading(false);
    }
  };

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApproval) return;

    try {
      setActionLoading(true);
      setActionError(null);
      await api.actionApproval(selectedApproval.id, {
        action: actionType,
        notes: actionNotes.trim() || undefined,
      });

      setSelectedApproval(null);
      setActionNotes("");
      await loadApprovalsAndContext();
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to record approval decision";
      setActionError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.01em" }}>
            HITL Tiered Approval Queue
          </h1>
          <p className="text-secondary" style={{ fontSize: "13px" }}>
            Data-driven human-in-the-loop review. Submissions escalate sequentially according to the requisition's role tier policy.
          </p>
        </div>

        <button
          className="btn btn-subtle btn-sm mono"
          onClick={() => {
            setShowPolicyDemo(!showPolicyDemo);
            if (!showPolicyDemo) loadPolicies();
          }}
        >
          {showPolicyDemo ? "Hide Routing Matrix" : "Inspect Routing Matrix (Viva)"}
        </button>
      </div>

      {/* Configurable Policy Demonstration Panel (Viva Architecture Differentiator) */}
      {showPolicyDemo && (
        <div className="panel" style={{ borderColor: "var(--accent-ops-border)" }}>
          <div className="panel-header" style={{ backgroundColor: "var(--accent-ops-subtle)" }}>
            <div>
              <span className="mono" style={{ fontSize: "11px", color: "var(--accent-ops)", fontWeight: 700 }}>
                PERSISTENT APPROVAL POLICY ROUTING MATRIX (POSTGRES TABLE: approval_policies)
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                Notice: Escalation chains are fully data-driven records, not hardcoded dicts. Configurable per role tier.
              </p>
            </div>
          </div>

          <div className="panel-body" style={{ padding: "0" }}>
            {policiesLoading ? (
              <div style={{ padding: "16px", color: "var(--text-muted)", fontSize: "12px" }}>Loading policy table...</div>
            ) : (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>ROLE TIER</th>
                    <th>STEP SEQUENCE</th>
                    <th>DESIGNATED APPROVER ROLE</th>
                    <th>ESCALATION BEHAVIOR</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => (
                    <tr key={p.id}>
                      <td className="mono" style={{ fontWeight: 600 }}>{p.role_tier.toUpperCase()}</td>
                      <td className="mono">Step {p.step_order}</td>
                      <td>
                        <span className="mono" style={{ color: "var(--accent-ops)" }}>
                          {p.approver_role}
                        </span>
                      </td>
                      <td className="text-secondary" style={{ fontSize: "12px" }}>
                        {p.role_tier === "senior" && p.step_order === 1
                          ? "Passes to VP upon signoff; Rejection halts chain immediately"
                          : p.role_tier === "senior" && p.step_order === 2
                          ? "Terminal step; transitions candidate to APPROVED"
                          : "Single-hop signoff; transitions candidate to APPROVED"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Approver Role Selector Tabs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "8px",
          backgroundColor: "#f0f2f5",
          padding: "6px",
          borderRadius: "var(--radius-lg)",
        }}
      >
        {ROLES.map((r) => {
          const isSelected = activeRole === r.key;
          const count = roleCounts[r.key] || 0;

          return (
            <button
              key={r.key}
              onClick={() => setActiveRole(r.key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                border: isSelected ? "1px solid rgba(100, 82, 206, 0.25)" : "1px solid transparent",
                backgroundColor: isSelected ? "#ffffff" : "transparent",
                color: isSelected ? "var(--accent-purple)" : "var(--text-secondary)",
                boxShadow: isSelected ? "0 4px 14px rgba(100, 82, 206, 0.08)" : "none",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span style={{ fontSize: "13px", fontWeight: isSelected ? 700 : 600 }}>
                  {r.label}
                </span>
                <span
                  className={`badge ${count > 0 ? "badge-pending" : "badge-neutral"}`}
                  style={{ fontSize: "10px", padding: "1px 8px" }}
                >
                  {count} PENDING
                </span>
              </div>
              <span style={{ fontSize: "11px", color: isSelected ? "var(--text-secondary)" : "var(--text-muted)", marginTop: "4px" }}>
                {r.desc}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--status-rejected-bg)",
            border: "1px solid var(--status-rejected-border)",
            color: "var(--status-rejected-text)",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {/* Approvals List for Selected Role */}
      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
          LOADING APPROVAL QUEUE...
        </div>
      ) : approvals.length === 0 ? (
        <EmptyState
          title={`NO PENDING APPROVALS FOR ${activeRole.toUpperCase()}`}
          description={`All candidate approval requests assigned to the ${activeRole} role have been processed. Switch roles above to inspect other queues.`}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {approvals.map((appr) => {
            const cand = candidatesMap[appr.candidate_id];
            const job = cand?.job_id ? jobsMap[cand.job_id] : undefined;
            const parsed = cand?.parsed_data;

            return (
              <div
                key={appr.id}
                className="panel"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0",
                  borderLeft: "3px solid var(--status-pending-text)",
                }}
              >
                {/* Header */}
                <div className="panel-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span className="mono" style={{ fontSize: "11px", color: "var(--status-pending-text)", fontWeight: 700 }}>
                      TASK #{appr.id.slice(0, 8)}
                    </span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {cand?.name || parsed?.current_title || cand?.raw_resume_filename || "Candidate"}
                    </span>
                    {cand && <span className="mono text-muted" style={{ fontSize: "11px" }}>({cand.raw_resume_filename})</span>}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="mono text-muted" style={{ fontSize: "11px" }}>
                      QUEUED: {new Date(appr.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Requisition & Escalation Chain Progress */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "12px",
                      backgroundColor: "#f8fafc",
                      padding: "12px 16px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div>
                      <div className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        TARGET REQUISITION & TIER
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
                        {job ? job.title : "Unassigned Job"}{" "}
                        {job && (
                          <span className="mono" style={{ color: "var(--accent-purple)", fontSize: "11px", fontWeight: 600 }}>
                            ({job.role_tier.toUpperCase()})
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "4px" }}>
                        MULTI-TIER ESCALATION PROGRESS
                      </div>
                      {job ? (
                        <EscalationTracker
                          roleTier={job.role_tier}
                          currentStepOrder={appr.step_order}
                          status="pending_approval"
                          activeApproverRole={appr.approver_role}
                        />
                      ) : (
                        <span className="mono text-muted" style={{ fontSize: "11px" }}>—</span>
                      )}
                    </div>
                  </div>

                  {/* Candidate Extracted Qualifications Snapshot */}
                  {parsed && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "12px" }}>
                      <div>
                        <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          EXPERIENCE & SENIORITY
                        </span>
                        <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>
                          <strong style={{ color: "var(--text-primary)" }}>{parsed.current_title}</strong> at{" "}
                          {parsed.current_company || "Company N/A"} •{" "}
                          <span className="mono" style={{ fontWeight: 600 }}>{parsed.seniority}</span> ({parsed.years_experience}y exp)
                        </div>
                        {parsed.summary && (
                          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px", lineHeight: "1.4" }}>
                            {parsed.summary}
                          </p>
                        )}
                      </div>

                      <div>
                        <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          VERIFIED CORE COMPETENCIES
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                          {parsed.core_skills.map((skill, i) => (
                            <span
                              key={i}
                              className="mono"
                              style={{
                                fontSize: "10px",
                                padding: "2px 7px",
                                backgroundColor: "#f5f3ff",
                                border: "1px solid rgba(100, 82, 206, 0.12)",
                                borderRadius: "var(--radius-pill)",
                                color: "var(--accent-purple)",
                                fontWeight: 600,
                              }}
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "10px",
                      borderTop: "1px solid var(--border-subtle)",
                    }}
                  >
                    <Link to={`/candidates/${appr.candidate_id}`} className="btn btn-subtle btn-sm">
                      Inspect Full Dossier & Plaintext →
                    </Link>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          setSelectedApproval(appr);
                          setActionType("reject");
                          setActionNotes("");
                          setActionError(null);
                        }}
                      >
                        Reject (Halt Chain)
                      </button>

                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => {
                          setSelectedApproval(appr);
                          setActionType("approve");
                          setActionNotes("");
                          setActionError(null);
                        }}
                      >
                        Approve Candidate →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Decision Action Modal */}
      {selectedApproval && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="panel-header">
              <span style={{ fontSize: "14px", fontWeight: 700 }}>
                {actionType === "approve" ? "Confirm Candidate Approval" : "Confirm Candidate Rejection"}
              </span>
              <button className="btn btn-subtle btn-sm" onClick={() => setSelectedApproval(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAction} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {actionError && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--status-rejected-bg)",
                    border: "1px solid var(--status-rejected-border)",
                    color: "var(--status-rejected-text)",
                    fontSize: "12px",
                  }}
                >
                  {actionError}
                </div>
              )}

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: actionType === "approve" ? "var(--status-approved-bg)" : "var(--status-rejected-bg)",
                  border: `1px solid ${actionType === "approve" ? "var(--status-approved-border)" : "var(--status-rejected-border)"}`,
                  color: actionType === "approve" ? "var(--status-approved-text)" : "var(--status-rejected-text)",
                  fontSize: "12px",
                }}
              >
                {actionType === "approve"
                  ? `Approving as ${activeRole.toUpperCase()} (Step ${selectedApproval.step_order}). If subsequent approval steps exist, candidate will advance to the next tier; otherwise status becomes APPROVED.`
                  : `Rejecting as ${activeRole.toUpperCase()} (Step ${selectedApproval.step_order}). This immediately HALTS the escalation chain and transitions candidate status to REJECTED.`}
              </div>

              <div>
                <label className="mono" style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                  DECISION AUDIT NOTES (SAVED TO AUDIT TRAIL)
                </label>
                <textarea
                  rows={4}
                  placeholder={
                    actionType === "approve"
                      ? "e.g. Demonstrated strong system design acumen, team fit verified, authorizing for next tier."
                      : "e.g. Lacks required distributed systems depth for staff level requisition."
                  }
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={() => setSelectedApproval(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={actionType === "approve" ? "btn btn-success" : "btn btn-danger"}
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? "Recording Decision..."
                    : actionType === "approve"
                    ? "Confirm Approval"
                    : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalsPage;
