import React, { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Job, JobCreate, JobMatchesResponse, CandidateMatchOut, RoleTier } from "../../api/types";
import { StatusBadge } from "../../components/StatusBadge";
import { RationaleSourceBadge } from "../../components/RationaleSourceBadge";
import { EmptyState } from "../../components/EmptyState";
import { Plus, Sparkles } from "lucide-react";

interface OutletContextType {
  refreshPendingCount?: () => void;
}

export const RecruiterJobsPage: React.FC = () => {
  const { refreshPendingCount } = useOutletContext<OutletContextType>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Job creation modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newRoleTier, setNewRoleTier] = useState<RoleTier>("junior");
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // RAG Matching
  const [matchLoading, setMatchLoading] = useState<boolean>(false);
  const [matchResult, setMatchResult] = useState<JobMatchesResponse | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [topK, setTopK] = useState<number>(5);
  const [minScore, setMinScore] = useState<number>(0.0);

  // Submit candidate for approval state
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listJobs();
      setJobs(data);
      if (data.length > 0 && !selectedJob) {
        setSelectedJob(data[0]);
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to load job requisitions";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) return;

    try {
      setCreateLoading(true);
      setCreateError(null);
      const payload: JobCreate = {
        title: newTitle.trim(),
        description: newDescription.trim(),
        role_tier: newRoleTier,
      };
      const created = await api.createJob(payload);
      setShowCreateModal(false);
      setNewTitle("");
      setNewDescription("");
      setNewRoleTier("junior");
      await loadJobs();
      setSelectedJob(created);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to create job";
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRunMatch = async (jobId: string) => {
    try {
      setMatchLoading(true);
      setMatchError(null);
      const res = await api.matchCandidates(jobId, { top_k: topK, min_score: minScore });
      setMatchResult(res);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Semantic vector search failed";
      setMatchError(msg);
    } finally {
      setMatchLoading(false);
    }
  };

  const handleSubmitForApproval = async (candidateId: string) => {
    try {
      setSubmittingId(candidateId);
      await api.submitForApproval(candidateId);
      if (selectedJob) {
        await handleRunMatch(selectedJob.id);
      }
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to submit for approval";
      alert(`Approval submission error: ${msg}`);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--accent-purple)",
                backgroundColor: "var(--accent-purple-subtle)",
                padding: "2px 8px",
                borderRadius: "50px",
                textTransform: "uppercase",
              }}
            >
              Requisitions & Matching
            </span>
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Job Requisitions & Semantic Matching
          </h1>
          <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Define role requisitions, compute vector embeddings in Chroma, and evaluate candidate similarity with LLM rationales.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "50px" }}
        >
          <Plus size={15} />
          <span>New Job Opening</span>
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--status-rejected-bg)",
            border: "1px solid var(--status-rejected-border)",
            borderRadius: "10px",
            color: "var(--status-rejected-text)",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {/* Main Split Layout: Left Requisitions List, Right Matching Console */}
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "22px", alignItems: "start" }}>
        {/* Left Panel: Job List */}
        <div className="panel" style={{ borderRadius: "16px" }}>
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>
              ACTIVE REQUISITIONS ({jobs.length})
            </span>
          </div>

          <div style={{ maxHeight: "calc(100vh - 260px)", overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                Loading requisitions...
              </div>
            ) : jobs.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No job openings created. Click "+ New Job Opening" to define your first requisition.
              </div>
            ) : (
              jobs.map((job) => {
                const isSelected = selectedJob?.id === job.id;

                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      setSelectedJob(job);
                      setMatchResult(null);
                      setMatchError(null);
                    }}
                    style={{
                      padding: "14px 18px",
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--accent-purple-subtle)" : "transparent",
                      borderLeft: isSelected ? "3px solid var(--accent-purple)" : "3px solid transparent",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span className="badge mono" style={{ fontSize: "10px", textTransform: "uppercase" }}>
                        {job.role_tier}
                      </span>
                      <span className="mono text-muted" style={{ fontSize: "10.5px" }}>
                        {new Date(job.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div style={{ fontSize: "14px", fontWeight: isSelected ? 700 : 600, color: "var(--text-primary)" }}>
                      {job.title}
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        marginTop: "4px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {job.description}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Job Details & Matching Console */}
        {selectedJob ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Specification Panel */}
            <div className="panel" style={{ borderRadius: "16px" }}>
              <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    REQUISITION SPECIFICATION
                  </span>
                  <div style={{ fontSize: "17px", fontWeight: 700, marginTop: "2px" }}>
                    {selectedJob.title}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="badge badge-neutral mono" style={{ fontSize: "11px" }}>
                    TIER: {selectedJob.role_tier.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <div className="mono" style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>
                    JOB DESCRIPTION & EMBEDDING SOURCE
                  </div>
                  <div
                    style={{
                      fontSize: "13.5px",
                      color: "var(--text-secondary)",
                      backgroundColor: "var(--bg-canvas)",
                      padding: "14px 18px",
                      borderRadius: "12px",
                      border: "1px solid var(--border-subtle)",
                      whiteSpace: "pre-wrap",
                      lineHeight: "1.55",
                    }}
                  >
                    {selectedJob.description}
                  </div>
                </div>

                {/* Match Trigger Controls */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "14px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        TOP_K:
                      </span>
                      <select
                        value={topK}
                        onChange={(e) => setTopK(Number(e.target.value))}
                        style={{ padding: "4px 22px 4px 8px", fontSize: "12px", borderRadius: "8px" }}
                      >
                        <option value={3}>3 matches</option>
                        <option value={5}>5 matches</option>
                        <option value={10}>10 matches</option>
                      </select>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        MIN_SIMILARITY:
                      </span>
                      <select
                        value={minScore}
                        onChange={(e) => setMinScore(Number(e.target.value))}
                        style={{ padding: "4px 22px 4px 8px", fontSize: "12px", borderRadius: "8px" }}
                      >
                        <option value={0.0}>0.00 (No floor)</option>
                        <option value={0.5}>0.50 (Moderate)</option>
                        <option value={0.6}>0.60 (Shortlist Bar)</option>
                        <option value={0.7}>0.70 (High Match)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    className="btn btn-primary"
                    disabled={matchLoading}
                    onClick={() => handleRunMatch(selectedJob.id)}
                    style={{ borderRadius: "50px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <Sparkles size={14} />
                    <span>{matchLoading ? "Running Vector Search & LLM..." : "Run Semantic Match →"}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Error in Matching */}
            {matchError && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "10px",
                  backgroundColor: "var(--status-rejected-bg)",
                  border: "1px solid var(--status-rejected-border)",
                  color: "var(--status-rejected-text)",
                  fontSize: "13px",
                }}
              >
                RAG Search Error: {matchError}
              </div>
            )}

            {/* Match Results List */}
            {matchResult && (
              <div className="panel" style={{ borderRadius: "16px" }}>
                <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>
                    SEMANTIC MATCH RESULTS ({matchResult.count} CANDIDATES EVALUATED)
                  </span>
                  <span className="mono text-muted" style={{ fontSize: "11px" }}>
                    CHROMADB COSINE SIMILARITY
                  </span>
                </div>

                <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  {matchResult.matches.length === 0 ? (
                    <EmptyState
                      title="NO MATCHING CANDIDATES FOUND"
                      description="No parsed candidates meet the semantic similarity threshold. Ensure resumes are uploaded and parsed in the dashboard."
                    />
                  ) : (
                    matchResult.matches.map((match: CandidateMatchOut, idx: number) => {
                      const cand = match.candidate;
                      const parsed = cand.parsed_data;

                      return (
                        <div
                          key={cand.id}
                          style={{
                            padding: "16px 18px",
                            backgroundColor: "#ffffff",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "12px",
                            boxShadow: "0 2px 10px rgba(35, 15, 75, 0.04)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "12px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span
                                className="mono"
                                style={{
                                  fontSize: "14px",
                                  fontWeight: 700,
                                  color: "var(--accent-purple)",
                                  width: "24px",
                                }}
                              >
                                #{idx + 1}
                              </span>

                              <div>
                                <Link
                                  to={`/candidates/${cand.id}`}
                                  style={{
                                    fontSize: "14.5px",
                                    fontWeight: 700,
                                    color: "var(--text-primary)",
                                    textDecoration: "none",
                                  }}
                                >
                                  {cand.name || parsed?.current_title || cand.raw_resume_filename}
                                </Link>
                                <div className="mono" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                                  ID: {cand.id.slice(0, 8)} • File: {cand.raw_resume_filename}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span
                                className="mono"
                                style={{
                                  fontSize: "15px",
                                  fontWeight: 800,
                                  color: match.similarity_percentage >= 60 ? "var(--status-approved-text)" : "var(--text-primary)",
                                }}
                              >
                                {match.similarity_percentage}%
                              </span>
                              <StatusBadge status={cand.status} />
                            </div>
                          </div>

                          {/* Rationale Quote */}
                          <div
                            style={{
                              backgroundColor: "var(--bg-canvas)",
                              padding: "12px 16px",
                              borderRadius: "10px",
                              borderLeft: "3px solid var(--accent-purple)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                              <span className="mono" style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-muted)" }}>
                                LLM MATCH RATIONALE
                              </span>
                              <RationaleSourceBadge source={match.rationale_source} />
                            </div>

                            <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: "1.5", margin: 0 }}>
                              {match.rationale}
                            </p>
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px" }}>
                            {cand.status === "shortlisted" && (
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={submittingId === cand.id}
                                onClick={() => handleSubmitForApproval(cand.id)}
                                style={{ borderRadius: "50px", fontSize: "11.5px" }}
                              >
                                {submittingId === cand.id ? "Routing..." : "Submit for Approval →"}
                              </button>
                            )}

                            <Link to={`/candidates/${cand.id}`} className="btn btn-sm" style={{ borderRadius: "50px", fontSize: "11.5px" }}>
                              Inspect Full Candidate
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            title="NO REQUISITION SELECTED"
            description="Select an active requisition from the left panel to inspect specifications or trigger RAG candidate matching."
          />
        )}
      </div>

      {/* New Job Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "560px" }}>
            <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>Define New Job Opening</span>
              <button
                className="btn btn-subtle btn-sm"
                onClick={() => setShowCreateModal(false)}
                style={{ border: "none", background: "transparent", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateJob} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {createError && (
                <div style={{ padding: "10px 14px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", borderRadius: "8px", fontSize: "12.5px" }}>
                  {createError}
                </div>
              )}

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                  Role Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lead Backend Distributed Systems Architect"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", fontSize: "13px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                  Seniority / Governance Role Tier *
                </label>
                <select
                  value={newRoleTier}
                  onChange={(e) => setNewRoleTier(e.target.value as RoleTier)}
                  style={{ width: "100%", padding: "10px 14px", fontSize: "13px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}
                >
                  <option value="junior">Junior (Direct evaluation by Hiring Manager)</option>
                  <option value="mid">Mid-Level (Evaluation by Hiring Manager)</option>
                  <option value="senior">Senior (2-Stage Approval: Director + VP)</option>
                  <option value="exec">Executive (Final Authorization by CEO)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                  Job Description & Core Requirements *
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Describe technical expectations, core skills (Python, Rust, Distributed DBs), and domain responsibilities..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", fontSize: "13px", borderRadius: "8px", border: "1px solid var(--border-subtle)", fontFamily: "inherit", lineHeight: "1.5" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowCreateModal(false)}
                  style={{ borderRadius: "50px", padding: "8px 18px", fontSize: "13px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="btn btn-primary"
                  style={{ borderRadius: "50px", padding: "8px 20px", fontSize: "13px" }}
                >
                  {createLoading ? "Creating & Embedding..." : "Create Opening"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecruiterJobsPage;
