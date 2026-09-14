import React, { useEffect, useState, useRef } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Candidate, Job, CandidateStatus } from "../../api/types";
import { StatusBadge } from "../../components/StatusBadge";
import {
  Users,
  Clock,
  CheckCircle2,
  FileText,
  UploadCloud,
  X,
  Plus,
  Filter,
  Sparkles,
} from "lucide-react";

interface OutletContextType {
  refreshPendingCount?: () => void;
}

const LIFECYCLE_STAGES: { key: string; label: string; statuses: CandidateStatus[] }[] = [
  { key: "uploaded", label: "UPLOADED", statuses: ["uploaded"] },
  { key: "parsed", label: "PARSED", statuses: ["parsed"] },
  { key: "shortlisted", label: "SHORTLISTED", statuses: ["shortlisted"] },
  { key: "pending_approval", label: "PENDING APPROVAL", statuses: ["pending_approval"] },
  { key: "decisioned", label: "DECISIONED", statuses: ["approved", "rejected"] },
];

export const PipelineDashboardPage: React.FC = () => {
  const { refreshPendingCount } = useOutletContext<OutletContextType>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode: board vs table
  const [viewMode, setViewMode] = useState<"board" | "table">("board");

  // Ingest Modal for manually sourcing candidates (keeps board completely uncluttered)
  const [showIngestModal, setShowIngestModal] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadJobId, setUploadJobId] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<{ success?: string; error?: string } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submitting for approval state
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [candList, jobList] = await Promise.all([
        api.listCandidates(selectedJobId || undefined),
        api.listJobs(),
      ]);
      setCandidates(candList);
      setJobs(jobList);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to load pipeline data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedJobId]);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    try {
      setUploading(true);
      setUploadStatus(null);
      const res = await api.uploadResume(file, uploadJobId || undefined);
      setUploadStatus({
        success: `Successfully ingested ${res.filename} (ID: ${res.candidate_id.slice(0, 8)}). Initial status: ${res.status}.`,
      });
      await loadData();
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Upload failed";
      setUploadStatus({ error: msg });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleSubmitForApproval = async (candidateId: string) => {
    try {
      setSubmittingId(candidateId);
      await api.submitForApproval(candidateId);
      await loadData();
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Submission failed";
      alert(`Approval submission error: ${msg}`);
    } finally {
      setSubmittingId(null);
    }
  };

  const getJobForCandidate = (jobId?: string | null): Job | undefined => {
    if (!jobId) return undefined;
    return jobs.find((j) => j.id === jobId);
  };

  // Metric aggregates
  const totalCount = candidates.length;
  const parsedCount = candidates.filter((c) => c.status === "parsed" || c.status === "uploaded").length;
  const shortlistedCount = candidates.filter((c) => c.status === "shortlisted").length;
  const pendingCount = candidates.filter((c) => c.status === "pending_approval").length;
  const decisionedCount = candidates.filter((c) => c.status === "approved" || c.status === "rejected").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* Top Header & Executive Stats */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
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
              Talent Acquisition Ops
            </span>
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Recruitment Pipeline
          </h1>
          <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Real-time candidate workflow, verification dossier inspection, and multi-tier approval routing.
          </p>
        </div>

        {/* Action Controls: Filter, Mode & Ingest */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Requisition Filter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 12px",
              backgroundColor: "#ffffff",
              borderRadius: "50px",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
            }}
          >
            <Filter size={13} style={{ color: "var(--text-muted)" }} />
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: "12.5px",
                fontWeight: 500,
                color: "var(--text-primary)",
                backgroundColor: "transparent",
                cursor: "pointer",
              }}
            >
              <option value="">All Requisitions ({candidates.length})</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} ({job.role_tier})
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Switcher */}
          <div
            style={{
              display: "flex",
              backgroundColor: "#f1f5f9",
              padding: "3px",
              borderRadius: "50px",
              gap: "2px",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("board")}
              style={{
                padding: "5px 14px",
                fontSize: "12px",
                fontWeight: viewMode === "board" ? 700 : 500,
                borderRadius: "50px",
                border: "none",
                cursor: "pointer",
                backgroundColor: viewMode === "board" ? "#ffffff" : "transparent",
                color: viewMode === "board" ? "var(--accent-purple)" : "var(--text-secondary)",
                boxShadow: viewMode === "board" ? "0 2px 6px rgba(0, 0, 0, 0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Kanban Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              style={{
                padding: "5px 14px",
                fontSize: "12px",
                fontWeight: viewMode === "table" ? 700 : 500,
                borderRadius: "50px",
                border: "none",
                cursor: "pointer",
                backgroundColor: viewMode === "table" ? "#ffffff" : "transparent",
                color: viewMode === "table" ? "var(--accent-purple)" : "var(--text-secondary)",
                boxShadow: viewMode === "table" ? "0 2px 6px rgba(0, 0, 0, 0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Dense Table
            </button>
          </div>

          {/* Optional Source Candidate Modal Button */}
          <button
            type="button"
            onClick={() => {
              setUploadStatus(null);
              setShowIngestModal(true);
            }}
            className="btn btn-primary"
            style={{
              padding: "8px 16px",
              fontSize: "12.5px",
              borderRadius: "50px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Plus size={15} />
            <span>Source Resume</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Bar (Compact, high-density, professional) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "14px",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Total Candidates</span>
            <Users size={14} style={{ color: "var(--accent-purple)" }} />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>{totalCount}</div>
        </div>

        <div
          style={{
            padding: "14px 18px",
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Parsed / Ingestion</span>
            <FileText size={14} style={{ color: "#64748b" }} />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>{parsedCount}</div>
        </div>

        <div
          style={{
            padding: "14px 18px",
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Shortlisted</span>
            <Sparkles size={14} style={{ color: "var(--accent-purple)" }} />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--accent-purple)" }}>{shortlistedCount}</div>
        </div>

        <div
          style={{
            padding: "14px 18px",
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>In Approvals</span>
            <Clock size={14} style={{ color: "#f59e0b" }} />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#d97706" }}>{pendingCount}</div>
        </div>

        <div
          style={{
            padding: "14px 18px",
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)" }}>Decisioned</span>
            <CheckCircle2 size={14} style={{ color: "#10b981" }} />
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>{decisionedCount}</div>
        </div>
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

      {/* Main Kanban Pipeline View */}
      {loading ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
          Loading candidate pipeline...
        </div>
      ) : viewMode === "board" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "16px",
            alignItems: "start",
          }}
        >
          {LIFECYCLE_STAGES.map((stage) => {
            const stageCandidates = candidates.filter((c) => stage.statuses.includes(c.status));

            return (
              <div
                key={stage.key}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "14px",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
                  display: "flex",
                  flexDirection: "column",
                  maxHeight: "calc(100vh - 240px)",
                }}
              >
                {/* Stage Header */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "var(--bg-canvas)",
                    borderRadius: "14px 14px 0 0",
                  }}
                >
                  <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>
                    {stage.label}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: "50px",
                      backgroundColor: stageCandidates.length > 0 ? "var(--accent-purple-subtle)" : "#f1f5f9",
                      color: stageCandidates.length > 0 ? "var(--accent-purple)" : "var(--text-muted)",
                    }}
                  >
                    {stageCandidates.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div
                  style={{
                    padding: "12px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {stageCandidates.length === 0 ? (
                    <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                      No candidates in {stage.label.toLowerCase()}
                    </div>
                  ) : (
                    stageCandidates.map((cand) => {
                      const parsed = cand.parsed_data;
                      const candJob = getJobForCandidate(cand.job_id);

                      return (
                        <div
                          key={cand.id}
                          style={{
                            padding: "14px",
                            backgroundColor: "#ffffff",
                            borderRadius: "10px",
                            border: "1px solid var(--border-subtle)",
                            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <StatusBadge status={cand.status} />
                            <span className="mono" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                              ID: {cand.id.slice(0, 6)}
                            </span>
                          </div>

                          <div>
                            <Link
                              to={`/candidates/${cand.id}`}
                              style={{
                                fontSize: "13.5px",
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                textDecoration: "none",
                              }}
                            >
                              {cand.name || parsed?.current_title || cand.raw_resume_filename}
                            </Link>
                            {candJob && (
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                                Target: {candJob.title}
                              </div>
                            )}
                          </div>

                          {parsed && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {parsed.core_skills?.slice(0, 3).map((skill, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    fontSize: "10.5px",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    backgroundColor: "#f1f5f9",
                                    color: "#475569",
                                  }}
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}

                          {cand.status === "shortlisted" && (
                            <button
                              type="button"
                              onClick={() => handleSubmitForApproval(cand.id)}
                              disabled={submittingId === cand.id}
                              className="btn btn-primary btn-sm"
                              style={{ marginTop: "4px", width: "100%", justifyContent: "center", fontSize: "11px" }}
                            >
                              {submittingId === cand.id ? "Routing..." : "Route for Approval →"}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Dense Table View */
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "14px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--bg-canvas)", borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Candidate</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Current Title / Domain</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Experience</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Status</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text-secondary)" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                    No candidates found.
                  </td>
                </tr>
              ) : (
                candidates.map((cand) => (
                  <tr key={cand.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <Link to={`/candidates/${cand.id}`} style={{ fontWeight: 600, color: "var(--text-primary)", textDecoration: "none" }}>
                        {cand.name || cand.raw_resume_filename}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--text-secondary)" }}>
                      {cand.parsed_data?.current_title || "General Candidate"}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--text-secondary)" }}>
                      {cand.parsed_data?.years_experience ? `${cand.parsed_data.years_experience} yrs` : "N/A"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <StatusBadge status={cand.status} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <Link to={`/candidates/${cand.id}`} style={{ fontSize: "12px", color: "var(--accent-purple)", fontWeight: 600, textDecoration: "none" }}>
                        View Dossier →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Sourcing Modal (Uncluttered & Clean) */}
      {showIngestModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "520px" }}>
            <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                Source & Ingest External Resume
              </span>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setShowIngestModal(false)}
                style={{ border: "none", background: "transparent", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                Directly upload a sourced candidate resume (.pdf, .docx, .txt) to parse their experience and add them to the ATS pipeline.
              </p>

              {uploadStatus?.success && (
                <div style={{ padding: "10px 14px", backgroundColor: "var(--status-approved-bg)", color: "var(--status-approved-text)", borderRadius: "8px", fontSize: "12.5px" }}>
                  {uploadStatus.success}
                </div>
              )}

              {uploadStatus?.error && (
                <div style={{ padding: "10px 14px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", borderRadius: "8px", fontSize: "12.5px" }}>
                  {uploadStatus.error}
                </div>
              )}

              {/* Target Job Selector */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                  Associate with Target Requisition (Optional)
                </label>
                <select
                  value={uploadJobId}
                  onChange={(e) => setUploadJobId(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}
                >
                  <option value="">General Talent Pool (No Job Assigned)</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.role_tier})
                    </option>
                  ))}
                </select>
              </div>

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? "var(--accent-purple)" : "var(--border-subtle)"}`,
                  borderRadius: "12px",
                  padding: "28px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  backgroundColor: isDragging ? "var(--accent-purple-subtle)" : "var(--bg-canvas)",
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                  disabled={uploading}
                />
                <UploadCloud size={28} style={{ color: "var(--accent-purple)", margin: "0 auto 8px auto" }} />
                <div style={{ fontSize: "13px", fontWeight: 600 }}>
                  {uploading ? "Extracting & Embedding..." : "Click to select or drag resume here"}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                  PDF, DOCX, TXT up to 5MB
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: "50px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "#ffffff",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineDashboardPage;
