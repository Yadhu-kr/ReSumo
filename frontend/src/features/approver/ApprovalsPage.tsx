import React, { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Approval, ApproverRole, Candidate, Job, ApprovalPolicy, CandidateScorecardSummary } from "../../api/types";
import { EscalationTracker } from "../../components/EscalationTracker";
import { EmptyState } from "../../components/EmptyState";
import { ConsensusReportView } from "../../components/ConsensusReportView";

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
  const { user } = useAuth();
  const initialRole: ApproverRole =
    user?.role === "approver" && (user.approver_role as ApproverRole)
      ? (user.approver_role as ApproverRole)
      : "hiring_manager";
  const [activeRole, setActiveRole] = useState<ApproverRole>(initialRole);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [candidatesMap, setCandidatesMap] = useState<Record<string, Candidate>>({});
  const [jobsMap, setJobsMap] = useState<Record<string, Job>>({});
  const [roleCounts, setRoleCounts] = useState<Record<ApproverRole, number>>({
    hiring_manager: 0,
    director: 0,
    vp: 0,
    ceo: 0,
  });
  const [scorecardsMap, setScorecardsMap] = useState<Record<string, CandidateScorecardSummary>>({});

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

      // Load candidate scorecards for dual consensus analysis
      const candIds = Array.from(
        new Set(
          currentRolePending
            .map((a) => a.application?.candidate_id || a.candidate_id)
            .filter(Boolean) as string[]
        )
      );
      const scMap: Record<string, CandidateScorecardSummary> = {};
      await Promise.allSettled(
        candIds.map(async (cid) => {
          try {
            const sc = await api.getCandidateScorecard(cid);
            scMap[cid] = sc;
          } catch {
            // Ignore if scorecard not found or error
          }
        })
      );
      setScorecardsMap(scMap);
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

  // User authority check: Only approvers matching the tier or admins can approve/reject
  const canActOnApproval = (appr: Approval): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (user.role === "approver") {
      return !user.approver_role || user.approver_role === appr.approver_role;
    }
    return false;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.025em" }}>
            HITL Tiered Approval Queue
          </h1>
          <p style={{ fontSize: "14.5px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Data-driven human-in-the-loop review. Submissions escalate sequentially according to the requisition's role tier policy.
          </p>
        </div>

        <button
          className="btn btn-secondary"
          onClick={() => {
            setShowPolicyDemo(!showPolicyDemo);
            if (!showPolicyDemo) loadPolicies();
          }}
          style={{ fontSize: "13px", padding: "8px 16px" }}
        >
          {showPolicyDemo ? "Hide Routing Matrix" : "Inspect Routing Matrix (Viva)"}
        </button>
      </div>

      {/* Role Notice Banner for HR or Non-Approver Roles */}
      {user?.role === "hr" && (
        <div
          style={{
            padding: "14px 18px",
            backgroundColor: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "13.5px",
            color: "#6b21a8",
          }}
        >
          <span style={{ fontWeight: 700 }}>HR Tracking Mode:</span>
          <span>
            You are viewing the company approval queue for pipeline monitoring. Decision actions (Approve / Reject)
            are restricted to designated Approvers at each evaluation tier.
          </span>
        </div>
      )}

      {/* Configurable Policy Demonstration Panel */}
      {showPolicyDemo && (
        <div className="panel" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="panel-header" style={{ backgroundColor: "#f8fafc", padding: "16px 20px" }}>
            <div>
              <span className="mono" style={{ fontSize: "12px", color: "var(--accent-purple)", fontWeight: 700, letterSpacing: "0.04em" }}>
                PERSISTENT APPROVAL POLICY ROUTING MATRIX (POSTGRES TABLE: approval_policies)
              </span>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px", margin: 0 }}>
                Notice: Escalation chains are fully data-driven records, not hardcoded dicts. Configurable per role tier.
              </p>
            </div>
          </div>

          <div className="panel-body" style={{ padding: "0" }}>
            {policiesLoading ? (
              <div style={{ padding: "24px", color: "var(--text-muted)", fontSize: "13.5px" }}>Loading policy table...</div>
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
                      <td className="mono" style={{ fontWeight: 700 }}>{p.role_tier.toUpperCase()}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>Step {p.step_order}</td>
                      <td>
                        <span className="mono" style={{ color: "var(--accent-purple)", fontWeight: 600 }}>
                          {p.approver_role}
                        </span>
                      </td>
                      <td className="text-secondary" style={{ fontSize: "13px" }}>
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
          gap: "12px",
          backgroundColor: "#f1f5f9",
          padding: "8px",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)",
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
                padding: "16px 18px",
                borderRadius: "var(--radius-md)",
                border: isSelected ? "1px solid rgba(79, 70, 229, 0.3)" : "1px solid transparent",
                backgroundColor: isSelected ? "#ffffff" : "transparent",
                color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: isSelected ? "var(--shadow-sm)" : "none",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                <span style={{ fontSize: "14.5px", fontWeight: isSelected ? 800 : 600, color: isSelected ? "var(--accent-purple)" : "var(--text-primary)" }}>
                  {r.label}
                </span>
                <span
                  className={`badge ${count > 0 ? "badge-pending" : "badge-neutral"}`}
                  style={{ fontSize: "11.5px", padding: "3px 9px", borderRadius: "var(--radius-pill)" }}
                >
                  {count} PENDING
                </span>
              </div>
              <span style={{ fontSize: "12.5px", color: isSelected ? "var(--text-secondary)" : "var(--text-muted)", marginTop: "6px", lineHeight: 1.4 }}>
                {r.desc}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--status-rejected-bg)",
            border: "1px solid var(--status-rejected-border)",
            color: "var(--status-rejected-text)",
            fontSize: "13.5px",
          }}
        >
          {error}
        </div>
      )}

      {/* Approvals List for Selected Role */}
      {loading ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
          Loading approval queue...
        </div>
      ) : approvals.length === 0 ? (
        <EmptyState
          title={`NO PENDING APPROVALS FOR ${activeRole.toUpperCase()}`}
          description={`All candidate approval requests assigned to the ${activeRole} role have been processed. Switch roles above to inspect other queues.`}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {approvals.map((appr) => {
            const candId = appr.application?.candidate_id || appr.candidate_id;
            const cand = candId ? candidatesMap[candId] : undefined;
            const jobId = appr.application?.job_id || cand?.job_id || cand?.applications?.[0]?.job_id;
            const job = jobId ? jobsMap[jobId] : undefined;
            const parsed = cand?.parsed_data;

            return (
              <div
                key={appr.id}
                className="panel"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0",
                  borderLeft: "4px solid #f59e0b",
                  boxShadow: "var(--shadow-xs)",
                }}
              >
                {/* Header */}
                <div className="panel-header" style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: "12px", color: "#b45309", backgroundColor: "#fffbeb", padding: "2px 8px", borderRadius: "4px", fontWeight: 700 }}>
                      TASK #{appr.id.slice(0, 8)}
                    </span>
                    <span style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}>
                      {cand?.name || parsed?.current_title || cand?.raw_resume_filename || "Candidate"}
                    </span>
                    {cand && <span className="mono text-muted" style={{ fontSize: "12px" }}>({cand.raw_resume_filename})</span>}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="mono text-muted" style={{ fontSize: "12px" }}>
                      Queued: {new Date(appr.created_at).toLocaleDateString()} {new Date(appr.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "18px 20px" }}>
                  {/* Requisition & Escalation Chain Progress */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "16px",
                      backgroundColor: "#f8fafc",
                      padding: "16px 20px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div>
                      <div className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        TARGET REQUISITION & TIER
                      </div>
                      <div style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                        {job ? job.title : "Unassigned Job"}{" "}
                        {job && (
                          <span style={{ color: "var(--accent-purple)", fontSize: "12px", fontWeight: 700, backgroundColor: "var(--accent-purple-subtle)", padding: "2px 8px", borderRadius: "var(--radius-pill)", border: "1px solid var(--accent-purple-border)", marginLeft: "6px" }}>
                            {job.role_tier.toUpperCase()} TIER
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px", letterSpacing: "0.04em" }}>
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
                        <span className="mono text-muted" style={{ fontSize: "12px" }}>—</span>
                      )}
                    </div>
                  </div>

                  {/* Candidate Extracted Qualifications Snapshot */}
                  {parsed && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", fontSize: "13.5px" }}>
                      <div>
                        <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                          EXPERIENCE & SENIORITY
                        </span>
                        <div style={{ color: "var(--text-secondary)", marginTop: "4px", lineHeight: 1.5 }}>
                          <strong style={{ color: "var(--text-primary)" }}>{parsed.current_title || "Role not specified"}</strong>
                          {parsed.current_company ? ` at ${parsed.current_company}` : ""} •{" "}
                          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{parsed.seniority || "seniority not specified"}</span>
                          {parsed.years_experience != null ? ` (${parsed.years_experience}y exp)` : ""}
                        </div>
                        {parsed.summary && (
                          <p style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "6px", lineHeight: "1.5" }}>
                            {parsed.summary}
                          </p>
                        )}
                      </div>

                      <div>
                        <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                          VERIFIED CORE COMPETENCIES
                        </span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                          {parsed.core_skills?.map((skill, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: "11.5px",
                                padding: "3px 9px",
                                backgroundColor: "var(--accent-purple-subtle)",
                                border: "1px solid var(--accent-purple-border)",
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

                  {/* Hiring Manager Consensual Evaluation Report */}
                  {(() => {
                    const targetCandId = (candId || appr.candidate_id || "") as string;
                    const targetScorecard = targetCandId ? scorecardsMap[targetCandId] : null;

                    return (
                      <div style={{ marginTop: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                          <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                            INTERVIEW CONSENSUS & EVALUATION DOSSIER
                          </span>
                          {targetScorecard?.total_evaluations ? (
                            <span style={{ fontSize: "12px", color: "var(--accent-purple)", fontWeight: 600 }}>
                              {targetScorecard.total_evaluations} Rubric Records
                            </span>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                              Awaiting Rubric Submissions
                            </span>
                          )}
                        </div>

                        <ConsensusReportView
                          scorecard={targetScorecard || null}
                          candidateName={cand?.name}
                          compact={false}
                        />
                      </div>
                    );
                  })()}

                  {/* Action Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "14px",
                      borderTop: "1px solid var(--border-subtle)",
                    }}
                  >
                    <Link to={`/candidates/${candId || appr.candidate_id}`} style={{ fontSize: "13.5px", color: "var(--accent-purple)", fontWeight: 600, textDecoration: "none" }}>
                      Inspect Full Dossier & Plaintext →
                    </Link>

                    {canActOnApproval(appr) ? (
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: "13px", padding: "7px 16px" }}
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
                          style={{ fontSize: "13px", padding: "7px 16px" }}
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
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span
                          className="badge badge-neutral"
                          style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            borderRadius: "var(--radius-pill)",
                            fontWeight: 600,
                          }}
                        >
                          {user?.role === "hr"
                            ? `Awaiting ${ROLES.find((r) => r.key === appr.approver_role)?.label || appr.approver_role} Sign-off`
                            : `Requires ${ROLES.find((r) => r.key === appr.approver_role)?.label || appr.approver_role} Authority`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Decision Action Modal */}
      {selectedApproval && canActOnApproval(selectedApproval) && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "540px" }}>
            <div className="panel-header" style={{ padding: "18px 24px" }}>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {actionType === "approve" ? "Confirm Candidate Approval" : "Confirm Candidate Rejection"}
              </span>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setSelectedApproval(null)}
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "16px", padding: "4px" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAction} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
              {actionError && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--status-rejected-bg)",
                    border: "1px solid var(--status-rejected-border)",
                    color: "var(--status-rejected-text)",
                    fontSize: "13px",
                  }}
                >
                  {actionError}
                </div>
              )}

              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: actionType === "approve" ? "var(--status-approved-bg)" : "var(--status-rejected-bg)",
                  border: `1px solid ${actionType === "approve" ? "var(--status-approved-border)" : "var(--status-rejected-border)"}`,
                  color: actionType === "approve" ? "var(--status-approved-text)" : "var(--status-rejected-text)",
                  fontSize: "13.5px",
                  lineHeight: 1.5,
                }}
              >
                {actionType === "approve"
                  ? `Approving as ${activeRole.toUpperCase()} (Step ${selectedApproval.step_order}). If subsequent approval steps exist, candidate will advance to the next tier; otherwise status becomes APPROVED.`
                  : `Rejecting as ${activeRole.toUpperCase()} (Step ${selectedApproval.step_order}). This immediately HALTS the escalation chain and transitions candidate status to REJECTED.`}
              </div>

              {/* Candidate Consensus Report Snapshot in Modal */}
              {(() => {
                const selCandId = selectedApproval.application?.candidate_id || selectedApproval.candidate_id;
                const sc = selCandId ? scorecardsMap[selCandId] : null;
                const cand = selCandId ? candidatesMap[selCandId] : null;
                if (!sc || sc.total_evaluations === 0) return null;
                return (
                  <div>
                    <label className="mono" style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px" }}>
                      EVALUATIVE CONSENSUS RECORD
                    </label>
                    <ConsensusReportView
                      scorecard={sc}
                      candidateName={cand?.name}
                      compact={true}
                    />
                  </div>
                );
              })()}

              <div>
                <label className="mono" style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}>
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
                  style={{ width: "100%", resize: "vertical", padding: "10px 14px", fontSize: "13.5px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", paddingTop: "6px" }}>
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={() => setSelectedApproval(null)}
                  style={{ padding: "8px 18px", fontSize: "13.5px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={actionType === "approve" ? "btn btn-success" : "btn btn-danger"}
                  disabled={actionLoading}
                  style={{ padding: "8px 20px", fontSize: "13.5px" }}
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
