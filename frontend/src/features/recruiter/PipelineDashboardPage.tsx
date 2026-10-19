import React, { useEffect, useState, useRef } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Candidate, Job, CandidateStatus } from "../../api/types";
import { StatusBadge } from "../../components/StatusBadge";
import {
  Users,
  Clock,
  CheckCircle2,
  FileText,
  UploadCloud,
  X,
  Filter,
  Sparkles,
  GripVertical,
  Gift,
  Briefcase,
  Star,
  CheckSquare,
} from "lucide-react";

interface OutletContextType {
  refreshPendingCount?: () => void;
}

const LIFECYCLE_STAGES: {
  key: string;
  label: string;
  targetStatus: CandidateStatus;
  statuses: CandidateStatus[];
}[] = [
  { key: "sourced", label: "SOURCED / PARSED", targetStatus: "parsed", statuses: ["uploaded", "parsed", "extraction_failed"] },
  { key: "shortlisted", label: "SHORTLISTED", targetStatus: "shortlisted", statuses: ["shortlisted"] },
  { key: "pending_approval", label: "PENDING APPROVAL", targetStatus: "pending_approval", statuses: ["pending_approval"] },
  { key: "approved", label: "APPROVED", targetStatus: "approved", statuses: ["approved"] },
  { key: "offered", label: "OFFER EXTENDED", targetStatus: "offered", statuses: ["offered"] },
  { key: "hired", label: "HIRED", targetStatus: "hired", statuses: ["hired"] },
  { key: "rejected", label: "REJECTED", targetStatus: "rejected", statuses: ["rejected"] },
];

export const PipelineDashboardPage: React.FC = () => {
  const { refreshPendingCount } = useOutletContext<OutletContextType>();
  const { user } = useAuth();
  const canManagePipeline = user?.role === "hr" || user?.role === "admin";

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode: board vs table
  const [viewMode, setViewMode] = useState<"board" | "table">("board");

  // Ingest Modal for manually sourcing candidates
  const [showIngestModal, setShowIngestModal] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadJobId, setUploadJobId] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<{ success?: string; error?: string } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and Drop State
  const [draggedCandidate, setDraggedCandidate] = useState<Candidate | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [updatingCandidateId, setUpdatingCandidateId] = useState<string | null>(null);

  // Assign to Job Modal State
  const [assignModalCandidate, setAssignModalCandidate] = useState<Candidate | null>(null);
  const [assignTargetJobId, setAssignTargetJobId] = useState<string>("");
  const [assigning, setAssigning] = useState<boolean>(false);
  const [assignError, setAssignError] = useState<string | null>(null);

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

  const getCandidateEffectiveStatus = (c: Candidate): CandidateStatus => {
    return (c.applications?.[0]?.status as CandidateStatus) || (c.parsed_status as CandidateStatus) || c.status || "uploaded";
  };

  const getJobForCandidate = (cand: Candidate): Job | undefined => {
    const jobId = cand.job_id || cand.applications?.[0]?.job_id;
    if (!jobId) return undefined;
    return jobs.find((j) => j.id === jobId);
  };

  const handleSubmitForApproval = async (candidateId: string) => {
    try {
      setSubmittingId(candidateId);
      const cand = candidates.find((c) => c.id === candidateId);
      const appId = cand?.applications?.[0]?.id;
      if (appId) {
        await api.submitApplicationForApproval(appId);
      } else {
        await api.submitForApproval(candidateId);
      }
      await loadData();
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Submission failed";
      alert(`Approval submission error: ${msg}`);
    } finally {
      setSubmittingId(null);
    }
  };

  // Manual Status Transition
  const handleUpdateStatus = async (cand: Candidate, targetStatus: CandidateStatus) => {
    const appId = cand.applications?.[0]?.id;
    const candJob = getJobForCandidate(cand);

    if (!appId || !candJob) {
      // Must link candidate to job before pipeline state transitions
      setAssignModalCandidate(cand);
      setAssignTargetJobId(jobs[0]?.id || "");
      return;
    }

    try {
      setUpdatingCandidateId(cand.id);
      if (targetStatus === "pending_approval") {
        await api.submitApplicationForApproval(appId);
      } else {
        await api.updateApplicationStatus(appId, targetStatus);
      }
      await loadData();
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to update status";
      alert(`Status transition error: ${msg}`);
    } finally {
      setUpdatingCandidateId(null);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, cand: Candidate) => {
    setDraggedCandidate(cand);
    e.dataTransfer.setData("text/plain", cand.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleStageDragOver = (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stageKey) {
      setDragOverStage(stageKey);
    }
  };

  const handleStageDragLeave = () => {
    setDragOverStage(null);
  };

  const handleStageDrop = async (e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedCandidate) return;

    const cand = draggedCandidate;
    setDraggedCandidate(null);

    const targetStage = LIFECYCLE_STAGES.find((s) => s.key === stageKey);
    if (!targetStage) return;

    const currentStatus = getCandidateEffectiveStatus(cand);
    if (targetStage.statuses.includes(currentStatus)) {
      return; // No status change needed
    }

    await handleUpdateStatus(cand, targetStage.targetStatus);
  };

  // Assign to Job Handler
  const handleAssignCandidate = async () => {
    if (!assignModalCandidate || !assignTargetJobId) return;
    try {
      setAssigning(true);
      setAssignError(null);
      await api.assignCandidateToJob(assignModalCandidate.id, assignTargetJobId);
      setAssignModalCandidate(null);
      await loadData();
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to assign candidate to requisition";
      setAssignError(msg);
    } finally {
      setAssigning(false);
    }
  };

  // Metric aggregates
  const totalCount = candidates.length;
  const parsedCount = candidates.filter((c) => ["parsed", "uploaded"].includes(getCandidateEffectiveStatus(c))).length;
  const shortlistedCount = candidates.filter((c) => getCandidateEffectiveStatus(c) === "shortlisted").length;
  const pendingCount = candidates.filter((c) => getCandidateEffectiveStatus(c) === "pending_approval").length;
  const approvedCount = candidates.filter((c) => getCandidateEffectiveStatus(c) === "approved").length;
  const offeredCount = candidates.filter((c) => getCandidateEffectiveStatus(c) === "offered").length;
  const hiredCount = candidates.filter((c) => getCandidateEffectiveStatus(c) === "hired").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
      {/* Top Header & Executive Stats */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "20px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span
              style={{
                fontSize: "11.5px",
                fontWeight: 700,
                color: "var(--accent-purple)",
                backgroundColor: "var(--accent-purple-subtle)",
                padding: "3px 10px",
                borderRadius: "var(--radius-pill)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                border: "1px solid var(--accent-purple-border)",
              }}
            >
              Talent Operations
            </span>
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.025em" }}>
            Candidate Pipeline
          </h1>
          <p style={{ fontSize: "14.5px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Manage lifecycle progression, trigger automated verification, and track multi-tier approvals.
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
              padding: "7px 14px",
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-xs)",
              height: "40px",
            }}
          >
            <Filter size={15} style={{ color: "var(--text-muted)" }} />
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: "13.5px",
                fontWeight: 500,
                color: "var(--text-primary)",
                backgroundColor: "transparent",
                cursor: "pointer",
                padding: 0,
                boxShadow: "none",
              }}
            >
              <option value="">All Requisitions ({jobs.length})</option>
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
              backgroundColor: "var(--bg-surface-elevated)",
              padding: "3px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-subtle)",
              gap: "3px",
              height: "40px",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode("board")}
              style={{
                padding: "6px 16px",
                fontSize: "13px",
                fontWeight: viewMode === "board" ? 700 : 500,
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                backgroundColor: viewMode === "board" ? "#ffffff" : "transparent",
                color: viewMode === "board" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: viewMode === "board" ? "var(--shadow-xs)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Kanban Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              style={{
                padding: "6px 16px",
                fontSize: "13px",
                fontWeight: viewMode === "table" ? 700 : 500,
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                backgroundColor: viewMode === "table" ? "#ffffff" : "transparent",
                color: viewMode === "table" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: viewMode === "table" ? "var(--shadow-xs)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Table View
            </button>
          </div>

          {/* Source Candidate Modal Button */}
          {canManagePipeline && (
            <button
              type="button"
              onClick={() => {
                setUploadStatus(null);
                setShowIngestModal(true);
              }}
              className="btn btn-primary"
              style={{
                height: "40px",
                padding: "0 18px",
                fontSize: "13.5px",
                borderRadius: "var(--radius-sm)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <UploadCloud size={16} />
              <span>Source Resume</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Notice Banner if read-only observer */}
      {!canManagePipeline && (
        <div
          style={{
            padding: "12px 18px",
            backgroundColor: "#f0f9ff",
            border: "1px solid #bae6fd",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            fontSize: "13.5px",
            color: "#0369a1",
          }}
        >
          <span style={{ fontWeight: 700 }}>Observer Mode:</span>
          <span>
            You are viewing the recruitment pipeline in read-only mode. Candidate stage transitions and job assignments are managed by HR recruiters.
          </span>
        </div>
      )}

      {/* KPI Metric Summary Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "16px",
        }}
      >
        {/* Total Pool */}
        <div
          style={{
            padding: "18px 20px",
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-xs)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Total Pool</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={16} style={{ color: "#2563eb" }} />
            </div>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{totalCount}</div>
        </div>

        {/* Sourced */}
        <div
          style={{
            padding: "18px 20px",
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-xs)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Sourced / Parsed</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileText size={16} style={{ color: "#475569" }} />
            </div>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{parsedCount}</div>
        </div>

        {/* Shortlisted */}
        <div
          style={{
            padding: "18px 20px",
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-xs)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Shortlisted</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "var(--accent-purple-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={16} style={{ color: "var(--accent-purple)" }} />
            </div>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--accent-purple)", letterSpacing: "-0.02em" }}>{shortlistedCount}</div>
        </div>

        {/* In Approvals */}
        <div
          style={{
            padding: "18px 20px",
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-xs)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>In Governance</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Clock size={16} style={{ color: "#d97706" }} />
            </div>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#b45309", letterSpacing: "-0.02em" }}>{pendingCount}</div>
        </div>

        {/* Approved */}
        <div
          style={{
            padding: "18px 20px",
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-xs)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Approved</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 size={16} style={{ color: "#059669" }} />
            </div>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#047857", letterSpacing: "-0.02em" }}>{approvedCount}</div>
        </div>

        {/* Offered / Hired */}
        <div
          style={{
            padding: "18px 20px",
            backgroundColor: "#ffffff",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-xs)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Offered / Hired</span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Gift size={16} style={{ color: "#7c3aed" }} />
            </div>
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "#6d28d9", letterSpacing: "-0.02em" }}>
            {offeredCount} <span style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-muted)" }}>/ {hiredCount}</span>
          </div>
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

      {/* Main Interactive Kanban Pipeline View */}
      {loading ? (
        <div style={{ padding: "80px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
          Loading candidate pipeline...
        </div>
      ) : viewMode === "board" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(285px, 1fr))",
            gap: "18px",
            alignItems: "start",
            overflowX: "auto",
            paddingBottom: "24px",
          }}
        >
          {LIFECYCLE_STAGES.map((stage) => {
            const stageCandidates = candidates.filter((c) => stage.statuses.includes(getCandidateEffectiveStatus(c)));
            const isHovered = dragOverStage === stage.key;

            return (
              <div
                key={stage.key}
                onDragOver={(e) => handleStageDragOver(e, stage.key)}
                onDragLeave={handleStageDragLeave}
                onDrop={(e) => handleStageDrop(e, stage.key)}
                style={{
                  backgroundColor: isHovered ? "var(--accent-purple-subtle)" : "#f8fafc",
                  borderRadius: "var(--radius-lg)",
                  border: isHovered ? "2px dashed var(--accent-purple)" : "1px solid var(--border-subtle)",
                  boxShadow: isHovered ? "0 4px 20px rgba(79, 70, 229, 0.15)" : "var(--shadow-xs)",
                  display: "flex",
                  flexDirection: "column",
                  maxHeight: "calc(100vh - 220px)",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Stage Header */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: isHovered ? "rgba(79, 70, 229, 0.08)" : "#ffffff",
                    borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
                  }}
                >
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
                    {stage.label}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "3px 9px",
                      borderRadius: "var(--radius-pill)",
                      backgroundColor: stageCandidates.length > 0 ? "var(--accent-purple-subtle)" : "#f1f5f9",
                      color: stageCandidates.length > 0 ? "var(--accent-purple)" : "var(--text-muted)",
                      border: stageCandidates.length > 0 ? "1px solid var(--accent-purple-border)" : "1px solid transparent",
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
                    gap: "12px",
                    minHeight: "140px",
                  }}
                >
                  {stageCandidates.length === 0 ? (
                    <div style={{ padding: "36px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "12.5px", lineHeight: 1.5 }}>
                      Drop candidate here to move to {stage.label.toLowerCase()}
                    </div>
                  ) : (
                    stageCandidates.map((cand) => {
                      const parsed = cand.parsed_data;
                      const candJob = getJobForCandidate(cand);
                      const candStatus = getCandidateEffectiveStatus(cand);
                      const isUpdating = updatingCandidateId === cand.id || submittingId === cand.id;

                      return (
                        <div
                          key={cand.id}
                          draggable={canManagePipeline && !isUpdating}
                          onDragStart={(e) => canManagePipeline && handleDragStart(e, cand)}
                          style={{
                            padding: "14px 16px",
                            backgroundColor: "#ffffff",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-subtle)",
                            boxShadow: "var(--shadow-xs)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            cursor: canManagePipeline ? "grab" : "default",
                            opacity: isUpdating ? 0.6 : 1,
                            transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                          }}
                        >
                          {/* Card Top: Drag Handle + Status + ID */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {canManagePipeline && (
                                <GripVertical size={14} style={{ color: "var(--text-muted)", cursor: "grab" }} />
                              )}
                              <StatusBadge status={candStatus} />
                            </div>
                            <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
                              #{cand.id.slice(0, 6)}
                            </span>
                          </div>

                          {/* Candidate Name & Job Target */}
                          <div>
                            <Link
                              to={`/candidates/${cand.id}`}
                              style={{
                                fontSize: "14.5px",
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                textDecoration: "none",
                                display: "block",
                                lineHeight: 1.4,
                              }}
                            >
                              {cand.name || parsed?.current_title || cand.raw_resume_filename}
                            </Link>
                            {candJob ? (
                              <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "3px", fontWeight: 500 }}>
                                Target: {candJob.title}
                              </div>
                            ) : (
                              <span
                                style={{
                                  fontSize: "11.5px",
                                  color: "#b45309",
                                  backgroundColor: "#fffbeb",
                                  border: "1px solid #fde68a",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  fontWeight: 600,
                                  display: "inline-block",
                                  marginTop: "4px",
                                }}
                              >
                                ⚠️ No Requisition Assigned
                              </span>
                            )}
                          </div>

                          {/* Skills Preview */}
                          {parsed?.core_skills && parsed.core_skills.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {parsed.core_skills.slice(0, 3).map((skill, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    fontSize: "11.5px",
                                    padding: "2px 8px",
                                    borderRadius: "var(--radius-pill)",
                                    backgroundColor: "#f1f5f9",
                                    color: "#334155",
                                    fontWeight: 500,
                                    border: "1px solid #e2e8f0",
                                  }}
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Quick Interactive Actions Ribbon (Only rendered for HR & Admin) */}
                          {canManagePipeline && (
                            <div
                              style={{
                                borderTop: "1px solid var(--border-subtle)",
                                paddingTop: "10px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              {/* Unassigned Candidate Action */}
                              {!candJob && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAssignModalCandidate(cand);
                                    setAssignTargetJobId(jobs[0]?.id || "");
                                  }}
                                  className="btn btn-purple btn-sm"
                                  style={{ width: "100%", justifyContent: "center", fontSize: "12px", padding: "6px 12px" }}
                                >
                                  <Briefcase size={14} />
                                  <span>Assign Requisition</span>
                                </button>
                              )}

                              {/* Stage-Specific Contextual Actions */}
                              {["uploaded", "parsed", "extraction_failed"].includes(candStatus) && candJob && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(cand, "shortlisted")}
                                    className="btn btn-sm btn-primary"
                                    style={{ fontSize: "12px", padding: "6px 12px", justifyContent: "center" }}
                                  >
                                    Shortlist
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(cand, "rejected")}
                                    className="btn btn-sm btn-danger"
                                    style={{ fontSize: "12px", padding: "6px 12px", justifyContent: "center" }}
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}

                              {candStatus === "shortlisted" && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleSubmitForApproval(cand.id)}
                                    disabled={submittingId === cand.id}
                                    className="btn btn-primary btn-sm"
                                    style={{ width: "100%", justifyContent: "center", fontSize: "12.5px", padding: "6px 12px" }}
                                  >
                                    {submittingId === cand.id ? "Routing..." : "Route for Approval →"}
                                  </button>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "2px" }}>
                                    <Link
                                      to={`/candidates/${cand.id}`}
                                      style={{
                                        fontSize: "12px",
                                        color: "var(--accent-purple)",
                                        textDecoration: "none",
                                        fontWeight: 600,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                    >
                                      <Star size={13} />
                                      <span>Score Interview</span>
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateStatus(cand, "rejected")}
                                      className="btn btn-danger btn-sm"
                                      style={{ fontSize: "11px", padding: "3px 8px" }}
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              )}

                              {candStatus === "approved" && (
                                <Link
                                  to={`/candidates/${cand.id}`}
                                  className="btn btn-purple btn-sm"
                                  style={{ width: "100%", justifyContent: "center", fontSize: "12.5px", padding: "6px 12px", textDecoration: "none" }}
                                >
                                  <Gift size={14} />
                                  <span>Generate Offer Letter →</span>
                                </Link>
                              )}

                              {candStatus === "offered" && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(cand, "hired")}
                                  className="btn btn-success btn-sm"
                                  style={{ width: "100%", justifyContent: "center", fontSize: "12.5px", padding: "6px 12px" }}
                                >
                                  <CheckCircle2 size={14} />
                                  <span>Mark as Hired</span>
                                </button>
                              )}

                              {candStatus === "hired" && (
                                <Link
                                  to={`/candidates/${cand.id}`}
                                  className="btn btn-secondary btn-sm"
                                  style={{ width: "100%", justifyContent: "center", fontSize: "12.5px", padding: "6px 12px", textDecoration: "none", gap: "6px" }}
                                >
                                  <CheckSquare size={14} style={{ color: "#059669" }} />
                                  <span>Track Onboarding Hub →</span>
                                </Link>
                              )}

                              {/* Manual Move Dropdown */}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                                <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontWeight: 500 }}>Stage:</span>
                                <select
                                  value={candStatus}
                                  onChange={(e) => handleUpdateStatus(cand, e.target.value as CandidateStatus)}
                                  style={{
                                    fontSize: "12px",
                                    padding: "4px 8px",
                                    borderRadius: "var(--radius-sm)",
                                    backgroundColor: "#f8fafc",
                                    border: "1px solid var(--border-subtle)",
                                    width: "100%",
                                    cursor: "pointer",
                                    color: "var(--text-primary)",
                                    fontWeight: 500,
                                  }}
                                >
                                  <option value="parsed">Sourced / Parsed</option>
                                  <option value="shortlisted">Shortlisted</option>
                                  <option value="pending_approval">Pending Approval</option>
                                  <option value="approved">Approved</option>
                                  <option value="offered">Offer Extended</option>
                                  <option value="hired">Hired</option>
                                  <option value="rejected">Rejected</option>
                                </select>
                              </div>
                            </div>
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
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-xs)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "12.5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Candidate</th>
                <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "12.5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Assigned Requisition</th>
                <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "12.5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Current Title / Domain</th>
                <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "12.5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Experience</th>
                <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "12.5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Status</th>
                <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "12.5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Quick Transition</th>
                <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "12.5px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    No candidates found.
                  </td>
                </tr>
              ) : (
                candidates.map((cand) => {
                  const candJob = getJobForCandidate(cand);
                  const candStatus = getCandidateEffectiveStatus(cand);

                  return (
                    <tr key={cand.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "14px 18px" }}>
                        <Link to={`/candidates/${cand.id}`} style={{ fontWeight: 700, color: "var(--text-primary)", textDecoration: "none" }}>
                          {cand.name || cand.raw_resume_filename}
                        </Link>
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-secondary)" }}>
                        {candJob ? (
                          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{candJob.title}</span>
                        ) : canManagePipeline ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAssignModalCandidate(cand);
                              setAssignTargetJobId(jobs[0]?.id || "");
                            }}
                            className="btn btn-sm btn-purple"
                            style={{ fontSize: "12px", padding: "4px 12px" }}
                          >
                            + Assign Requisition
                          </button>
                        ) : (
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-secondary)" }}>
                        {cand.parsed_data?.current_title || "General Candidate"}
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-secondary)" }}>
                        {cand.parsed_data?.years_experience != null ? `${cand.parsed_data.years_experience} yrs` : "Not specified"}
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <StatusBadge status={candStatus} />
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        {canManagePipeline ? (
                          <select
                            value={candStatus}
                            onChange={(e) => handleUpdateStatus(cand, e.target.value as CandidateStatus)}
                            style={{
                              fontSize: "12.5px",
                              padding: "5px 10px",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "#f8fafc",
                              border: "1px solid var(--border-subtle)",
                              cursor: "pointer",
                            }}
                          >
                            <option value="parsed">Sourced / Parsed</option>
                            <option value="shortlisted">Shortlisted</option>
                            <option value="pending_approval">Pending Approval</option>
                            <option value="approved">Approved</option>
                            <option value="offered">Offer Extended</option>
                            <option value="hired">Hired</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        ) : (
                          <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", fontWeight: 500 }}>
                            {LIFECYCLE_STAGES.find((s) => s.statuses.includes(candStatus))?.label || candStatus}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <Link to={`/candidates/${cand.id}`} style={{ fontSize: "13px", color: "var(--accent-purple)", fontWeight: 600, textDecoration: "none" }}>
                          View Dossier →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Candidate to Requisition Modal */}
      {assignModalCandidate && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "520px" }}>
            <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                Assign Candidate to Requisition
              </span>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setAssignModalCandidate(null)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                Link candidate <strong>{assignModalCandidate.name || assignModalCandidate.raw_resume_filename}</strong> to an active requisition to calculate vector matching and enable pipeline progression.
              </p>

              {assignError && (
                <div style={{ padding: "12px 16px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}>
                  {assignError}
                </div>
              )}

              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
                  Target Job Opening
                </label>
                <select
                  value={assignTargetJobId}
                  onChange={(e) => setAssignTargetJobId(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", fontSize: "13.5px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.role_tier})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setAssignModalCandidate(null)}
                  className="btn btn-subtle"
                  style={{ padding: "8px 18px", fontSize: "13.5px" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={assigning || !assignTargetJobId}
                  onClick={handleAssignCandidate}
                  className="btn btn-purple"
                  style={{ padding: "8px 20px", fontSize: "13.5px" }}
                >
                  {assigning ? "Assigning..." : "Confirm & Assign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Sourcing Modal */}
      {showIngestModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "540px" }}>
            <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                Source & Ingest External Resume
              </span>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setShowIngestModal(false)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                Directly upload a sourced candidate resume (.pdf, .docx, .txt) to parse their experience and add them to the ATS pipeline.
              </p>

              {uploadStatus?.success && (
                <div style={{ padding: "12px 16px", backgroundColor: "var(--status-approved-bg)", color: "var(--status-approved-text)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}>
                  {uploadStatus.success}
                </div>
              )}

              {uploadStatus?.error && (
                <div style={{ padding: "12px 16px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}>
                  {uploadStatus.error}
                </div>
              )}

              {/* Target Job Selector */}
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
                  Associate with Target Requisition (Optional)
                </label>
                <select
                  value={uploadJobId}
                  onChange={(e) => setUploadJobId(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", fontSize: "13.5px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
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
                  borderRadius: "var(--radius-lg)",
                  padding: "32px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  backgroundColor: isDragging ? "var(--accent-purple-subtle)" : "var(--bg-canvas)",
                  transition: "all 0.15s ease",
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
                <UploadCloud size={32} style={{ color: "var(--accent-purple)", margin: "0 auto 10px auto" }} />
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {uploading ? "Extracting & Embedding..." : "Click to select or drag resume here"}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
                  PDF, DOCX, TXT up to 5MB
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setShowIngestModal(false)}
                  className="btn btn-subtle"
                  style={{ padding: "8px 18px", fontSize: "13.5px" }}
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
