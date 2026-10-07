import React, { useEffect, useState } from "react";
import { useParams, Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Candidate, Job, Approval, Application, CandidateStatus } from "../../api/types";
import { StatusBadge } from "../../components/StatusBadge";
import { EscalationTracker } from "../../components/EscalationTracker";
import { EmptyState } from "../../components/EmptyState";

interface OutletContextType {
  refreshPendingCount?: () => void;
}

export const CandidateDossierPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { refreshPendingCount } = useOutletContext<OutletContextType>();

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tab: 'extracted' vs 'raw_text'
  const [activeTab, setActiveTab] = useState<"extracted" | "raw">("extracted");

  // Submit for approval state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadCandidateDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const cand = await api.getCandidate(id);
      setCandidate(cand);

      let appsList: Application[] = [];
      try {
        appsList = await api.getCandidateApplications(id);
        setApplications(appsList);
      } catch {
        appsList = cand.applications || [];
        setApplications(appsList);
      }

      const activeApp = appsList[0];
      const targetJobId = activeApp?.job_id || cand.job_id;

      if (targetJobId) {
        try {
          const j = await api.getJob(targetJobId);
          setJob(j);
        } catch {
          // Job might be missing or deleted
        }
      }

      try {
        if (activeApp) {
          const apprs = await api.getApplicationApprovals(activeApp.id);
          setApprovals(apprs);
        } else {
          const apprs = await api.getCandidateApprovals(id);
          setApprovals(apprs);
        }
      } catch {
        // Approvals endpoint fallback
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to load candidate dossier";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidateDetails();
  }, [id]);

  const handleSubmitForApproval = async () => {
    if (!candidate) return;
    try {
      setSubmitting(true);
      setSubmitError(null);
      const activeApp = applications[0];
      if (activeApp) {
        await api.submitApplicationForApproval(activeApp.id);
      } else {
        await api.submitForApproval(candidate.id);
      }
      await loadCandidateDetails();
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to submit for approval";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
        LOADING CANDIDATE DOSSIER...
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <EmptyState
        title="CANDIDATE NOT FOUND"
        description={error || `No candidate record matches ID ${id}`}
        action={
          <Link to="/" className="btn btn-primary">
            ← Return to Pipeline
          </Link>
        }
      />
    );
  }

  const parsed = candidate.parsed_data;
  const effectiveStatus: CandidateStatus = (applications[0]?.status as CandidateStatus) || candidate.status || "uploaded";
  const effectiveJobId = candidate.job_id || applications[0]?.job_id;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ marginBottom: "6px" }}>
            <Link to="/" className="text-secondary" style={{ fontSize: "12px", textDecoration: "none" }}>
              ← Back to Pipeline Dashboard
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.01em" }}>
              {candidate.name || parsed?.current_title || candidate.raw_resume_filename}
            </h1>
            <StatusBadge status={effectiveStatus} />
          </div>

          <div className="mono" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
            ID: {candidate.id} • INGESTED: {new Date(candidate.created_at).toLocaleString()} • FILE: {candidate.raw_resume_filename}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {["shortlisted", "parsed"].includes(effectiveStatus) && effectiveJobId && (
            <button
              className="btn btn-primary"
              disabled={submitting}
              onClick={handleSubmitForApproval}
            >
              {submitting ? "Submitting..." : "Submit for Approval →"}
            </button>
          )}

          {effectiveStatus === "pending_approval" && (
            <Link to="/approvals" className="btn btn-primary">
              Review in Approval Queue →
            </Link>
          )}
        </div>
      </div>

      {submitError && (
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
          {submitError}
        </div>
      )}

      {/* Target Requisition Context Card */}
      <div
        style={{
          padding: "16px 20px",
          backgroundColor: "#ffffff",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 4px 20px rgba(35, 15, 75, 0.03)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "14px",
        }}
      >
        <div>
          <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            LINKED REQUISITION & ROUTING POLICY
          </span>
          <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "2px" }}>
            {job ? (
              <>
                {job.title}{" "}
                <span className="mono" style={{ color: "var(--accent-purple)", fontSize: "12px", fontWeight: 600 }}>
                  [{job.role_tier.toUpperCase()} TIER]
                </span>
              </>
            ) : (
              <span className="text-secondary" style={{ fontStyle: "italic" }}>
                Unlinked Candidate (Not linked to any job requisition)
              </span>
            )}
          </div>
        </div>

        {job && (
          <div>
            <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
              CURRENT ESCALATION STATUS
            </span>
            <EscalationTracker roleTier={job.role_tier} status={effectiveStatus} />
          </div>
        )}
      </div>

      {/* Main Two-Column Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "20px", alignItems: "start" }}>
        {/* Left Column: Extraction Model Output & Raw Text */}
        <div className="panel">
          <div className="panel-header">
            {/* View Switcher Tabs */}
            <div style={{ display: "flex", backgroundColor: "#f0f2f5", padding: "3px", borderRadius: "var(--radius-pill)", gap: "2px" }}>
              <button
                type="button"
                className="btn-sm"
                onClick={() => setActiveTab("extracted")}
                style={{
                  border: "none",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: activeTab === "extracted" ? "#ffffff" : "transparent",
                  color: activeTab === "extracted" ? "var(--accent-purple)" : "var(--text-secondary)",
                  fontWeight: activeTab === "extracted" ? 600 : 500,
                  boxShadow: activeTab === "extracted" ? "0 2px 6px rgba(100, 82, 206, 0.12)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                Model Extraction (15 Contract Fields)
              </button>
              <button
                type="button"
                className="btn-sm"
                onClick={() => setActiveTab("raw")}
                style={{
                  border: "none",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: activeTab === "raw" ? "#ffffff" : "transparent",
                  color: activeTab === "raw" ? "var(--accent-purple)" : "var(--text-secondary)",
                  fontWeight: activeTab === "raw" ? 600 : 500,
                  boxShadow: activeTab === "raw" ? "0 2px 6px rgba(100, 82, 206, 0.12)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                Preprocessed Plaintext ({candidate.raw_text ? `${candidate.raw_text.length} chars` : "None"})
              </button>
            </div>

            <span className="mono text-muted" style={{ fontSize: "10px" }}>
              CONTRACT: sandeeppanem/5k
            </span>
          </div>

          <div className="panel-body">
            {activeTab === "extracted" ? (
              parsed ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {/* Executive Summary */}
                  <div>
                    <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      EXECUTIVE SUMMARY
                    </span>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", marginTop: "4px" }}>
                      {parsed.summary}
                    </p>
                  </div>

                  {/* Primary Profile Metrics */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", padding: "14px 18px", backgroundColor: "#f8fafc", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        CURRENT TITLE
                      </span>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
                        {parsed.current_title}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        CURRENT COMPANY
                      </span>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "2px" }}>
                        {parsed.current_company || "N/A"}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        SENIORITY & EXP
                      </span>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-purple)", marginTop: "2px" }}>
                        {parsed.seniority.toUpperCase()} • {parsed.years_experience}y
                      </div>
                    </div>
                  </div>

                  {/* Domain & Industries */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        PRIMARY DOMAIN
                      </span>
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {parsed.primary_domain || "N/A"}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        INDUSTRIES
                      </span>
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {parsed.industries.join(", ") || "N/A"}
                      </div>
                    </div>
                  </div>

                  {/* Core & Secondary Skills */}
                  <div>
                    <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      CORE TECHNICAL SKILLS
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                      {parsed.core_skills.map((skill, i) => (
                        <span
                          key={i}
                          className="mono"
                          style={{
                            fontSize: "11px",
                            padding: "3px 9px",
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

                  {parsed.secondary_skills && parsed.secondary_skills.length > 0 && (
                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        SECONDARY COMPETENCIES
                      </span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                        {parsed.secondary_skills.map((skill, i) => (
                          <span
                            key={i}
                            className="mono"
                            style={{
                              fontSize: "11px",
                              padding: "3px 8px",
                              backgroundColor: "#f8fafc",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "var(--radius-pill)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tools & Leadership */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        TOOLS & INFRASTRUCTURE
                      </span>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {parsed.tools && parsed.tools.length > 0 ? parsed.tools.join(", ") : "None specified"}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        LEADERSHIP EXPERIENCE
                      </span>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {parsed.leadership_experience ? "Verified leadership track record" : "Individual contributor"}
                      </div>
                    </div>
                  </div>

                  {/* Previous Titles & Companies */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        PREVIOUS TITLES
                      </span>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {parsed.previous_titles.length > 0 ? parsed.previous_titles.join(" → ") : "None listed"}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        PREVIOUS ORGANIZATIONS
                      </span>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {parsed.previous_companies.length > 0 ? parsed.previous_companies.join(", ") : "None listed"}
                      </div>
                    </div>
                  </div>

                  {/* Key Achievements */}
                  {parsed.key_achievements && parsed.key_achievements.length > 0 && (
                    <div>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        KEY VERIFIED ACHIEVEMENTS
                      </span>
                      <ul style={{ paddingLeft: "18px", marginTop: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        {parsed.key_achievements.map((ach, i) => (
                          <li key={i} style={{ marginBottom: "3px" }}>
                            {ach}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  title={candidate.parsed_status === "extraction_failed" ? "EXTRACTION FAILED" : "EXTRACTION PENDING"}
                  description={
                    candidate.parsed_status === "extraction_failed"
                      ? "Extraction failed — raw resume text was indexed for matching instead."
                      : "Structured JSON has not been generated for this candidate yet. Raw text was captured during ingestion pre-processing."
                  }
                />
              )
            ) : (
              /* Raw Plaintext Preprocessor Viewer */
              <div>
                <div className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "6px" }}>
                  PLAINTEXT EXTRACTED BY PYPDF / PYTHON-DOCX PREPROCESSOR (STAGE 1)
                </div>
                <pre
                  className="mono"
                  style={{
                    backgroundColor: "#f8fafc",
                    padding: "16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "11.5px",
                    lineHeight: "1.5",
                    maxHeight: "480px",
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    color: "var(--text-secondary)",
                  }}
                >
                  {candidate.raw_text || "No plaintext captured during ingestion."}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Approval Chain Audit Trail & Timeline */}
        <div className="panel">
          <div className="panel-header">
            <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>
              APPROVAL AUDIT TRAIL ({approvals.length} RECORDS)
            </span>
          </div>

          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {approvals.length === 0 ? (
              <EmptyState
                title="NO APPROVALS INITIATED"
                description={
                  effectiveStatus === "shortlisted" && effectiveJobId
                    ? "Candidate is shortlisted. Click 'Submit for Approval' above to initiate the escalation chain."
                    : "Approval workflow begins once candidate is linked to a requisition and submitted."
                }
              />
            ) : (
              approvals.map((appr, idx) => {
                let badgeClass = "badge-neutral";
                if (appr.action === "approved") badgeClass = "badge-approved";
                if (appr.action === "rejected") badgeClass = "badge-rejected";
                if (appr.action === "pending") badgeClass = "badge-pending";

                return (
                  <div
                    key={appr.id}
                    style={{
                      padding: "14px",
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "0 2px 8px rgba(35, 15, 75, 0.03)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          #{idx + 1}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: "13px" }}>
                          Step {appr.step_order}: {appr.approver_role.toUpperCase()}
                        </span>
                      </div>
                      <span className={`badge ${badgeClass}`}>{appr.action.toUpperCase()}</span>
                    </div>

                    {appr.notes && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          backgroundColor: "#f8fafc",
                          padding: "8px 12px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)",
                          fontStyle: "italic",
                        }}
                      >
                        "{appr.notes}"
                      </div>
                    )}

                    <div className="mono text-muted" style={{ fontSize: "10px", marginTop: "2px" }}>
                      CREATED: {new Date(appr.created_at).toLocaleString()}
                      {appr.acted_at && ` • ACTED: ${new Date(appr.acted_at).toLocaleString()}`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CandidateDossierPage;
