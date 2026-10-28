import React, { useEffect, useState, useRef } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type {
  Candidate,
  Job,
  CandidateStatus,
  BulkResumeUploadResponse,
  OutreachResponse,
} from "../../api/types";
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
  Send,
  UserPlus,
  FolderUp,
  Archive,
  UserCheck,
  ExternalLink,
  Layers,
  Copy,
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
  { key: "sourced", label: "SOURCED / PARSED", targetStatus: "parsed", statuses: ["uploaded", "parsed", "extraction_failed", "sourced"] },
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

  // Dual Funnel Segmentation
  const [funnelTab, setFunnelTab] = useState<"active" | "crm">("active");
  const [sourcingStatusFilter, setSourcingStatusFilter] = useState<string>("all");
  const [sourcingChannelFilter, setSourcingChannelFilter] = useState<string>("all");

  // Bulk Resume Dropzone Modal
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkJobId, setBulkJobId] = useState<string>("");
  const [bulkUploading, setBulkUploading] = useState<boolean>(false);
  const [bulkResult, setBulkResult] = useState<BulkResumeUploadResponse | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Quick Clip Modal
  const [showClipModal, setShowClipModal] = useState<boolean>(false);
  const [clipName, setClipName] = useState<string>("");
  const [clipEmail, setClipEmail] = useState<string>("");
  const [clipPhone, setClipPhone] = useState<string>("");
  const [clipTitle, setClipTitle] = useState<string>("");
  const [clipCompany, setClipCompany] = useState<string>("");
  const [clipSkills, setClipSkills] = useState<string>("");
  const [clipYearsExp, setClipYearsExp] = useState<string>("");
  const [clipSummary, setClipSummary] = useState<string>("");
  const [clipUrl, setClipUrl] = useState<string>("");
  const [clipJobId, setClipJobId] = useState<string>("");
  const [clipNotes, setClipNotes] = useState<string>("");
  const [clipping, setClipping] = useState<boolean>(false);
  const [clipError, setClipError] = useState<string | null>(null);

  // Outreach Modal
  const [outreachCandidate, setOutreachCandidate] = useState<Candidate | null>(null);
  const [outreachMessage, setOutreachMessage] = useState<string>("");
  const [outreachSending, setOutreachSending] = useState<boolean>(false);
  const [outreachResult, setOutreachResult] = useState<OutreachResponse | null>(null);
  const [outreachError, setOutreachError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Manual convert prospect
  const [convertingId, setConvertingId] = useState<string | null>(null);

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

  // CRM Handlers
  const handleConvertProspect = async (candidateId: string) => {
    try {
      setConvertingId(candidateId);
      await api.convertProspect(candidateId);
      await loadData();
    } catch (err: any) {
      alert(`Conversion error: ${err.message || "Failed to convert prospect"}`);
    } finally {
      setConvertingId(null);
    }
  };

  const handleUpdateSourcingStatus = async (candidateId: string, newStatus: string) => {
    try {
      await api.updateSourcingStatus(candidateId, newStatus);
      await loadData();
    } catch (err: any) {
      alert(`Update error: ${err.message || "Failed to update sourcing status"}`);
    }
  };

  const openOutreachModal = (candidate: Candidate) => {
    const job = getJobForCandidate(candidate);
    const company = user?.company_name || "our team";
    const title = job?.title || candidate.parsed_data?.current_title || "this role";
    const candidateName = candidate.name || "there";
    setOutreachCandidate(candidate);
    setOutreachResult(null);
    setOutreachError(null);
    setCopiedLink(false);
    setOutreachMessage(
      `Hi ${candidateName},\n\nWe came across your background and were really impressed by your experience. We think you'd be a great fit for our ${title} requisition at ${company}.\n\nWe've prepared a pre-parsed profile for you to review and claim with one click. Let's connect!`
    );
  };

  const handleSendOutreach = async () => {
    if (!outreachCandidate) return;
    try {
      setOutreachSending(true);
      setOutreachError(null);
      const res = await api.sendOutreach(outreachCandidate.id, {
        message: outreachMessage,
        job_id: outreachCandidate.job_id || outreachCandidate.applications?.[0]?.job_id || undefined,
      });
      setOutreachResult(res);
      await loadData();
    } catch (err: any) {
      setOutreachError(err.message || "Failed to dispatch outreach email");
    } finally {
      setOutreachSending(false);
    }
  };

  const handleQuickClipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClipError(null);
    setClipping(true);
    try {
      const skillsArray = clipSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await api.clipCandidate({
        name: clipName.trim() || undefined,
        email: clipEmail.trim() || undefined,
        phone: clipPhone.trim() || undefined,
        title: clipTitle.trim() || undefined,
        company: clipCompany.trim() || undefined,
        skills: skillsArray,
        years_experience: clipYearsExp ? parseFloat(clipYearsExp) : undefined,
        summary: clipSummary.trim() || undefined,
        sourcing_url: clipUrl.trim() || undefined,
        job_id: clipJobId || undefined,
        notes: clipNotes.trim() || undefined,
      });
      setShowClipModal(false);
      // Reset form
      setClipName("");
      setClipEmail("");
      setClipPhone("");
      setClipTitle("");
      setClipCompany("");
      setClipSkills("");
      setClipYearsExp("");
      setClipSummary("");
      setClipUrl("");
      setClipJobId("");
      setClipNotes("");
      await loadData();
      setFunnelTab("crm");
    } catch (err: any) {
      setClipError(err.message || "Failed to clip profile");
    } finally {
      setClipping(false);
    }
  };

  const handleBulkUploadSubmit = async () => {
    if (bulkFiles.length === 0) return;
    setBulkUploading(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const res = await api.bulkUploadResumes(bulkFiles, bulkJobId || undefined);
      setBulkResult(res);
      await loadData();
      setFunnelTab("crm");
    } catch (err: any) {
      setBulkError(err.message || "Bulk upload failed");
    } finally {
      setBulkUploading(false);
    }
  };

  // Funnel segregation
  const activeCandidates = candidates.filter((c) => !c.is_passive_lead);
  const passiveCandidates = candidates.filter((c) => !!c.is_passive_lead);

  // Filtered passive candidates for CRM view
  const filteredProspects = passiveCandidates.filter((p) => {
    if (selectedJobId && p.job_id !== selectedJobId && p.applications?.[0]?.job_id !== selectedJobId) {
      return false;
    }
    if (sourcingStatusFilter !== "all" && (p.sourcing_status || "sourced") !== sourcingStatusFilter) {
      return false;
    }
    if (sourcingChannelFilter !== "all" && p.sourcing_channel !== sourcingChannelFilter) {
      return false;
    }
    return true;
  });

  // Metric aggregates (Active ATS Pipeline)
  const totalCount = activeCandidates.length;
  const parsedCount = activeCandidates.filter((c) => ["parsed", "uploaded"].includes(getCandidateEffectiveStatus(c))).length;
  const shortlistedCount = activeCandidates.filter((c) => getCandidateEffectiveStatus(c) === "shortlisted").length;
  const pendingCount = activeCandidates.filter((c) => getCandidateEffectiveStatus(c) === "pending_approval").length;
  const approvedCount = activeCandidates.filter((c) => getCandidateEffectiveStatus(c) === "approved").length;
  const offeredCount = activeCandidates.filter((c) => getCandidateEffectiveStatus(c) === "offered").length;
  const hiredCount = activeCandidates.filter((c) => getCandidateEffectiveStatus(c) === "hired").length;

  // Metric aggregates (CRM Talent Pool)
  const crmTotal = passiveCandidates.length;
  const crmSourced = passiveCandidates.filter((c) => (c.sourcing_status || "sourced") === "sourced").length;
  const crmContacted = passiveCandidates.filter((c) => c.sourcing_status === "contacted").length;
  const crmEngaged = passiveCandidates.filter((c) => c.sourcing_status === "engaged" || c.sourcing_status === "follow_up").length;
  const crmArchived = passiveCandidates.filter((c) => c.sourcing_status === "archived").length;

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

          {/* Dual-Funnel Segmenter: Active ATS vs Talent Pool CRM */}
          <div
            style={{
              display: "flex",
              backgroundColor: "#f1f5f9",
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
              onClick={() => setFunnelTab("active")}
              style={{
                padding: "6px 14px",
                fontSize: "13px",
                fontWeight: funnelTab === "active" ? 700 : 500,
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                backgroundColor: funnelTab === "active" ? "#ffffff" : "transparent",
                color: funnelTab === "active" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: funnelTab === "active" ? "var(--shadow-xs)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <Layers size={14} style={{ color: funnelTab === "active" ? "var(--accent-purple)" : "inherit" }} />
              <span>Active ATS</span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: funnelTab === "active" ? "var(--accent-purple-subtle)" : "#e2e8f0",
                  color: funnelTab === "active" ? "var(--accent-purple)" : "#64748b",
                  fontWeight: 700,
                }}
              >
                {activeCandidates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFunnelTab("crm")}
              style={{
                padding: "6px 14px",
                fontSize: "13px",
                fontWeight: funnelTab === "crm" ? 700 : 500,
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
                backgroundColor: funnelTab === "crm" ? "#ffffff" : "transparent",
                color: funnelTab === "crm" ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: funnelTab === "crm" ? "var(--shadow-xs)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease",
              }}
            >
              <Sparkles size={14} style={{ color: funnelTab === "crm" ? "#0284c7" : "inherit" }} />
              <span>Talent Pool CRM</span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: funnelTab === "crm" ? "#e0f2fe" : "#e2e8f0",
                  color: funnelTab === "crm" ? "#0369a1" : "#64748b",
                  fontWeight: 700,
                }}
              >
                {passiveCandidates.length}
              </span>
            </button>
          </div>

          {/* View Mode Switcher (only for active ATS pipeline) */}
          {funnelTab === "active" && (
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
                  padding: "6px 14px",
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
                Kanban
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                style={{
                  padding: "6px 14px",
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
                Table
              </button>
            </div>
          )}

          {/* Sourcing Action Buttons */}
          {canManagePipeline && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Bulk Resume Upload */}
              <button
                type="button"
                onClick={() => {
                  setBulkFiles([]);
                  setBulkResult(null);
                  setBulkError(null);
                  setBulkJobId(selectedJobId);
                  setShowBulkModal(true);
                }}
                className="btn btn-secondary"
                style={{
                  height: "40px",
                  padding: "0 14px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-sm)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#eff6ff",
                  color: "#1d4ed8",
                  borderColor: "#bfdbfe",
                }}
                title="Batch upload up to 30 resumes"
              >
                <FolderUp size={15} />
                <span>Bulk Upload</span>
              </button>

              {/* Recruiter Quick-Clip */}
              <button
                type="button"
                onClick={() => {
                  setClipError(null);
                  setClipJobId(selectedJobId);
                  setShowClipModal(true);
                }}
                className="btn btn-secondary"
                style={{
                  height: "40px",
                  padding: "0 14px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-sm)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#faf5ff",
                  color: "#7e22ce",
                  borderColor: "#e9d5ff",
                }}
                title="Clip profile from LinkedIn or GitHub"
              >
                <UserPlus size={15} />
                <span>Quick-Clip</span>
              </button>

              {/* Single Resume Upload */}
              <button
                type="button"
                onClick={() => {
                  setUploadStatus(null);
                  setShowIngestModal(true);
                }}
                className="btn btn-primary"
                style={{
                  height: "40px",
                  padding: "0 16px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-sm)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <UploadCloud size={15} />
                <span>Add Single</span>
              </button>
            </div>
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
      {funnelTab === "active" ? (
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
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Active Pool</span>
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
      ) : (
        /* CRM Metrics Bar */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "16px",
          }}
        >
          {/* CRM Total */}
          <div style={{ padding: "18px 20px", backgroundColor: "#ffffff", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-xs)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Total Prospects</span>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={16} style={{ color: "#2563eb" }} />
              </div>
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{crmTotal}</div>
          </div>

          {/* CRM Sourced (New) */}
          <div style={{ padding: "18px 20px", backgroundColor: "#ffffff", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-xs)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Sourced (New)</span>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#faf5ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={16} style={{ color: "#9333ea" }} />
              </div>
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#9333ea", letterSpacing: "-0.02em" }}>{crmSourced}</div>
          </div>

          {/* CRM Outreach Sent */}
          <div style={{ padding: "18px 20px", backgroundColor: "#ffffff", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-xs)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Outreach Sent</span>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Send size={16} style={{ color: "#0284c7" }} />
              </div>
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#0284c7", letterSpacing: "-0.02em" }}>{crmContacted}</div>
          </div>

          {/* CRM Engaged */}
          <div style={{ padding: "18px 20px", backgroundColor: "#ffffff", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-xs)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Engaged</span>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={16} style={{ color: "#059669" }} />
              </div>
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#059669", letterSpacing: "-0.02em" }}>{crmEngaged}</div>
          </div>

          {/* CRM Archived */}
          <div style={{ padding: "18px 20px", backgroundColor: "#ffffff", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-xs)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Archived</span>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", backgroundColor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Archive size={16} style={{ color: "#64748b" }} />
              </div>
            </div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#64748b", letterSpacing: "-0.02em" }}>{crmArchived}</div>
          </div>
        </div>
      )}

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

      {/* Main Interactive Funnel View */}
      {loading ? (
        <div style={{ padding: "80px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
          Loading candidate pipeline...
        </div>
      ) : funnelTab === "crm" ? (
        /* Talent Pool CRM View */
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* CRM Filters & Sub-bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              padding: "12px 18px",
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)", marginRight: "4px" }}>
                CRM STAGE:
              </span>
              {[
                { key: "all", label: `All (${passiveCandidates.length})` },
                { key: "sourced", label: `Sourced (${crmSourced})` },
                { key: "contacted", label: `Contacted (${crmContacted})` },
                { key: "engaged", label: `Engaged (${crmEngaged})` },
                { key: "archived", label: `Archived (${crmArchived})` },
              ].map((filterTab) => (
                <button
                  key={filterTab.key}
                  type="button"
                  onClick={() => setSourcingStatusFilter(filterTab.key)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "var(--radius-pill)",
                    fontSize: "12.5px",
                    fontWeight: sourcingStatusFilter === filterTab.key ? 700 : 500,
                    border: sourcingStatusFilter === filterTab.key ? "1px solid #0284c7" : "1px solid var(--border-subtle)",
                    backgroundColor: sourcingStatusFilter === filterTab.key ? "#f0f9ff" : "#ffffff",
                    color: sourcingStatusFilter === filterTab.key ? "#0369a1" : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {filterTab.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Channel:</span>
              <select
                value={sourcingChannelFilter}
                onChange={(e) => setSourcingChannelFilter(e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  backgroundColor: "#ffffff",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                <option value="all">All Sourcing Channels</option>
                <option value="clipper">LinkedIn / Recruiter Clipper</option>
                <option value="bulk_upload">Bulk Resume Dropzone</option>
                <option value="inbound">Inbound Direct</option>
              </select>
            </div>
          </div>

          {/* Prospects Grid / Cards */}
          {filteredProspects.length === 0 ? (
            <div
              style={{
                padding: "60px 20px",
                textAlign: "center",
                backgroundColor: "#ffffff",
                borderRadius: "var(--radius-lg)",
                border: "1px dashed var(--border-subtle)",
              }}
            >
              <Users size={36} style={{ color: "var(--text-muted)", margin: "0 auto 12px auto" }} />
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                No prospects found
              </div>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", maxWidth: "450px", margin: "6px auto 16px auto" }}>
                {passiveCandidates.length === 0
                  ? "Your outbound talent CRM pool is currently empty. Use Bulk Upload to ingest batch resumes or Quick-Clip to save LinkedIn/GitHub candidate profiles."
                  : "No passive candidates match the selected filters. Try changing or clearing your filters above."}
              </p>
              {canManagePipeline && (
                <div style={{ display: "flex", justifyContent: "center", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkFiles([]);
                      setBulkResult(null);
                      setBulkError(null);
                      setShowBulkModal(true);
                    }}
                    className="btn btn-secondary"
                    style={{ fontSize: "13px" }}
                  >
                    <FolderUp size={14} />
                    <span>Bulk Upload Resumes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setClipError(null);
                      setShowClipModal(true);
                    }}
                    className="btn btn-primary"
                    style={{ fontSize: "13px" }}
                  >
                    <UserPlus size={14} />
                    <span>Quick-Clip Profile</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: "18px",
              }}
            >
              {filteredProspects.map((prospect) => {
                const prospectJob = getJobForCandidate(prospect);
                const title = prospect.parsed_data?.current_title || "Candidate Prospect";
                const company = prospect.parsed_data?.current_company;
                const skills = prospect.parsed_data?.core_skills || (prospect.parsed_data as any)?.skills || [];
                const yearsExp = prospect.parsed_data?.years_experience;
                const status = prospect.sourcing_status || "sourced";

                return (
                  <div
                    key={prospect.id}
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "var(--shadow-xs)",
                      padding: "18px 20px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "14px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {/* Top Row: Sourcing Channel & Status */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {prospect.sourcing_channel === "clipper" ? (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                padding: "2px 8px",
                                borderRadius: "var(--radius-pill)",
                                backgroundColor: "#faf5ff",
                                color: "#7e22ce",
                                border: "1px solid #e9d5ff",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Sparkles size={11} />
                              CLIPPER
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                padding: "2px 8px",
                                borderRadius: "var(--radius-pill)",
                                backgroundColor: "#eff6ff",
                                color: "#1d4ed8",
                                border: "1px solid #bfdbfe",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <FolderUp size={11} />
                              BULK UPLOAD
                            </span>
                          )}

                          {prospect.sourcing_url && (
                            <a
                              href={prospect.sourcing_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: "var(--text-muted)",
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                              title="View Sourced URL"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>

                        {/* Status Badge */}
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            padding: "2px 8px",
                            borderRadius: "var(--radius-pill)",
                            backgroundColor:
                              status === "contacted"
                                ? "#e0f2fe"
                                : status === "engaged"
                                ? "#ecfdf5"
                                : status === "archived"
                                ? "#f1f5f9"
                                : "#fef3c7",
                            color:
                              status === "contacted"
                                ? "#0369a1"
                                : status === "engaged"
                                ? "#047857"
                                : status === "archived"
                                ? "#64748b"
                                : "#b45309",
                            border:
                              status === "contacted"
                                ? "1px solid #bae6fd"
                                : status === "engaged"
                                ? "1px solid #a7f3d0"
                                : status === "archived"
                                ? "1px solid #e2e8f0"
                                : "1px solid #fde68a",
                          }}
                        >
                          {status}
                        </span>
                      </div>

                      {/* Candidate Name & Title */}
                      <Link
                        to={`/candidates/${prospect.id}`}
                        style={{
                          fontSize: "16px",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          textDecoration: "none",
                          display: "block",
                          marginBottom: "4px",
                        }}
                      >
                        {prospect.name || prospect.raw_resume_filename}
                      </Link>

                      <div style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500 }}>
                        {title}
                        {company && <span style={{ color: "var(--text-muted)" }}> at {company}</span>}
                        {yearsExp !== null && yearsExp !== undefined && (
                          <span style={{ color: "var(--text-muted)" }}> • {yearsExp}y exp</span>
                        )}
                      </div>

                      {/* Associated Requisition */}
                      <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-muted)" }}>
                        <Briefcase size={13} style={{ color: "var(--accent-purple)" }} />
                        <span>Requisition:</span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {prospectJob ? prospectJob.title : "Unassigned"}
                        </span>
                      </div>

                      {/* Contact Info */}
                      {(prospect.email || prospect.phone) && (
                        <div style={{ marginTop: "6px", display: "flex", gap: "10px", fontSize: "12px", color: "var(--text-muted)" }}>
                          {prospect.email && <span>{prospect.email}</span>}
                          {prospect.phone && <span>{prospect.phone}</span>}
                        </div>
                      )}

                      {/* Skills Tags */}
                      {skills && skills.length > 0 && (
                        <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "5px" }}>
                          {skills.slice(0, 5).map((skill: string, i: number) => (
                            <span
                              key={i}
                              style={{
                                fontSize: "11px",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                backgroundColor: "#f8fafc",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {skill}
                            </span>
                          ))}
                          {skills.length > 5 && (
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", alignSelf: "center" }}>
                              +{skills.length - 5}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div
                      style={{
                        paddingTop: "12px",
                        borderTop: "1px solid var(--border-subtle)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      {/* Sourcing Stage Selector */}
                      <select
                        value={status}
                        onChange={(e) => handleUpdateSourcingStatus(prospect.id, e.target.value)}
                        style={{
                          fontSize: "12px",
                          padding: "4px 8px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)",
                          backgroundColor: "#f8fafc",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        <option value="sourced">Mark Sourced</option>
                        <option value="contacted">Mark Contacted</option>
                        <option value="engaged">Mark Engaged</option>
                        <option value="archived">Archive Prospect</option>
                      </select>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {/* Outreach Button */}
                        <button
                          type="button"
                          onClick={() => openOutreachModal(prospect)}
                          className="btn btn-sm btn-secondary"
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            backgroundColor: "#eff6ff",
                            color: "#1d4ed8",
                            borderColor: "#bfdbfe",
                          }}
                        >
                          <Send size={12} />
                          <span>{status === "contacted" ? "Resend Invite" : "Send Outreach"}</span>
                        </button>

                        {/* Convert Manually to Applicant */}
                        <button
                          type="button"
                          onClick={() => handleConvertProspect(prospect.id)}
                          disabled={convertingId === prospect.id}
                          className="btn btn-sm btn-purple"
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                          title="Convert passive lead directly into active ATS applicant"
                        >
                          <UserCheck size={12} />
                          <span>{convertingId === prospect.id ? "Converting..." : "Convert"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
            const stageCandidates = activeCandidates.filter((c) => stage.statuses.includes(getCandidateEffectiveStatus(c)));
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
              {activeCandidates.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    No active candidates found.
                  </td>
                </tr>
              ) : (
                activeCandidates.map((cand) => {
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

      {/* Bulk Resume Dropzone Modal */}
      {showBulkModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "620px" }}>
            <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FolderUp size={18} style={{ color: "#1d4ed8" }} />
                <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Bulk Resume Dropzone (Talent Pool CRM)
                </span>
              </div>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setShowBulkModal(false)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                Batch ingest up to 30 resumes (.pdf, .docx, .txt). Each resume is parsed and stored as a passive lead in the Talent CRM pool without notifying the candidate.
              </p>

              {bulkError && (
                <div style={{ padding: "12px 16px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", borderRadius: "var(--radius-sm)", fontSize: "13px" }}>
                  {bulkError}
                </div>
              )}

              {/* Target Requisition Selector */}
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
                  Link All to Target Requisition (Optional)
                </label>
                <select
                  value={bulkJobId}
                  onChange={(e) => setBulkJobId(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px", fontSize: "13.5px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                >
                  <option value="">General Talent CRM Pool (No Job Pre-assigned)</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.role_tier})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dropzone */}
              {!bulkResult && (
                <div
                  onClick={() => bulkFileInputRef.current?.click()}
                  style={{
                    border: "2px dashed #3b82f6",
                    borderRadius: "var(--radius-lg)",
                    padding: "32px 20px",
                    textAlign: "center",
                    cursor: "pointer",
                    backgroundColor: "#eff6ff",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input
                    type="file"
                    ref={bulkFileInputRef}
                    style={{ display: "none" }}
                    multiple
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={(e) => {
                      if (e.target.files) {
                        const newFiles = Array.from(e.target.files);
                        if (newFiles.length + bulkFiles.length > 30) {
                          alert("Maximum 30 resumes per batch upload.");
                          return;
                        }
                        setBulkFiles((prev) => [...prev, ...newFiles]);
                      }
                    }}
                    disabled={bulkUploading}
                  />
                  <FolderUp size={36} style={{ color: "#2563eb", margin: "0 auto 10px auto" }} />
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Click to select multiple resumes or drop files here
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
                    Select up to 30 PDF, DOCX, or TXT files
                  </div>
                </div>
              )}

              {/* Selected Files List */}
              {bulkFiles.length > 0 && !bulkResult && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)" }}>
                      Selected Resumes ({bulkFiles.length} of 30)
                    </span>
                    <button
                      type="button"
                      onClick={() => setBulkFiles([])}
                      style={{ fontSize: "12px", color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Clear all
                    </button>
                  </div>
                  <div style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", padding: "8px" }}>
                    {bulkFiles.map((file, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 10px",
                          fontSize: "12.5px",
                          borderBottom: idx < bulkFiles.length - 1 ? "1px solid #f1f5f9" : "none",
                        }}
                      >
                        <span style={{ fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {file.name}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {(file.size / 1024).toFixed(0)} KB
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBulkFiles((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "2px" }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bulk Results Summary */}
              {bulkResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div
                    style={{
                      padding: "14px 18px",
                      backgroundColor: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                      borderRadius: "var(--radius-md)",
                      color: "#065f46",
                      fontSize: "13.5px",
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>Batch Ingestion Complete: </span>
                    Successfully ingested <strong>{bulkResult.succeeded}</strong> of <strong>{bulkResult.total}</strong> resumes into the Talent CRM pool.
                  </div>

                  <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                      <thead>
                        <tr style={{ backgroundColor: "#f8fafc", textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>
                          <th style={{ padding: "8px 12px" }}>Filename</th>
                          <th style={{ padding: "8px 12px" }}>Extracted Candidate</th>
                          <th style={{ padding: "8px 12px" }}>Status</th>
                          <th style={{ padding: "8px 12px" }}>AI Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkResult.results.map((res, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{res.filename}</td>
                            <td style={{ padding: "8px 12px", fontWeight: 600, color: "var(--text-primary)" }}>{res.name || "Parsed Candidate"}</td>
                            <td style={{ padding: "8px 12px" }}>
                              <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, backgroundColor: res.status === "failed" ? "#fee2e2" : "#dcfce7", color: res.status === "failed" ? "#991b1b" : "#166534" }}>
                                {res.status.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px" }}>
                              {res.match_score !== null && res.match_score !== undefined
                                ? `${Math.round(res.match_score * 100)}%`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="btn btn-subtle"
                  style={{ padding: "8px 18px", fontSize: "13.5px" }}
                >
                  {bulkResult ? "Done" : "Cancel"}
                </button>

                {!bulkResult && (
                  <button
                    type="button"
                    disabled={bulkUploading || bulkFiles.length === 0}
                    onClick={handleBulkUploadSubmit}
                    className="btn btn-primary"
                    style={{ padding: "8px 22px", fontSize: "13.5px", backgroundColor: "#1d4ed8" }}
                  >
                    {bulkUploading ? "Ingesting & Parsing..." : `Upload & Ingest ${bulkFiles.length} Resumes`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recruiter Quick-Clip Modal */}
      {showClipModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "560px" }}>
            <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <UserPlus size={18} style={{ color: "#7e22ce" }} />
                <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Recruiter Quick-Clip (LinkedIn / GitHub)
                </span>
              </div>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setShowClipModal(false)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleQuickClipSubmit} style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: 0 }}>
                Directly clip candidate profile details into your passive Talent CRM pool. No candidate notification is triggered until you choose to dispatch outreach.
              </p>

              {clipError && (
                <div style={{ padding: "10px 14px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", borderRadius: "var(--radius-sm)", fontSize: "12.5px" }}>
                  {clipError}
                </div>
              )}

              {/* Source Profile URL */}
              <div>
                <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Profile URL (LinkedIn / GitHub)
                </label>
                <input
                  type="url"
                  value={clipUrl}
                  onChange={(e) => setClipUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/username or https://github.com/username"
                  style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                />
              </div>

              {/* Name & Title */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={clipName}
                    onChange={(e) => setClipName(e.target.value)}
                    placeholder="e.g. Maya Patel"
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Current Title
                  </label>
                  <input
                    type="text"
                    value={clipTitle}
                    onChange={(e) => setClipTitle(e.target.value)}
                    placeholder="e.g. Staff Backend Architect"
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                  />
                </div>
              </div>

              {/* Company & Years Exp */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Current Company
                  </label>
                  <input
                    type="text"
                    value={clipCompany}
                    onChange={(e) => setClipCompany(e.target.value)}
                    placeholder="e.g. Stripe"
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Years of Experience
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={clipYearsExp}
                    onChange={(e) => setClipYearsExp(e.target.value)}
                    placeholder="e.g. 7"
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                  />
                </div>
              </div>

              {/* Email & Phone */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={clipEmail}
                    onChange={(e) => setClipEmail(e.target.value)}
                    placeholder="maya@example.com"
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    value={clipPhone}
                    onChange={(e) => setClipPhone(e.target.value)}
                    placeholder="+1 (555) 012-3456"
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                  />
                </div>
              </div>

              {/* Skills */}
              <div>
                <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Core Skills (comma-separated)
                </label>
                <input
                  type="text"
                  value={clipSkills}
                  onChange={(e) => setClipSkills(e.target.value)}
                  placeholder="Python, FastAPI, Distributed Systems, Kafka, PostgreSQL"
                  style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                />
              </div>

              {/* Target Requisition */}
              <div>
                <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Associate with Target Requisition (Optional)
                </label>
                <select
                  value={clipJobId}
                  onChange={(e) => setClipJobId(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
                >
                  <option value="">General Talent CRM Pool (No Job Assigned)</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.role_tier})
                    </option>
                  ))}
                </select>
              </div>

              {/* Recruiter Notes */}
              <div>
                <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Recruiter Internal Notes
                </label>
                <textarea
                  rows={2}
                  value={clipNotes}
                  onChange={(e) => setClipNotes(e.target.value)}
                  placeholder="Found via LinkedIn search; strong open source portfolio..."
                  style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setShowClipModal(false)}
                  className="btn btn-subtle"
                  style={{ padding: "8px 18px", fontSize: "13.5px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clipping || !clipName.trim()}
                  className="btn btn-purple"
                  style={{ padding: "8px 22px", fontSize: "13.5px" }}
                >
                  {clipping ? "Saving..." : "Save to Talent Pool"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Candidate Outreach & Magic Profile Claim Modal */}
      {outreachCandidate && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "580px" }}>
            <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Send size={18} style={{ color: "#0284c7" }} />
                <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Dispatch Outreach & Magic Claim Link
                </span>
              </div>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setOutreachCandidate(null)}
                style={{ border: "none", background: "transparent", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Recipient Details Banner */}
              <div style={{ padding: "12px 16px", backgroundColor: "#f8fafc", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", fontSize: "13px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Candidate:</span>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{outreachCandidate.name || "Prospect"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Email:</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {outreachCandidate.email || "No email on record (will generate claim link)"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Target Requisition:</span>
                  <span style={{ fontWeight: 600, color: "var(--accent-purple)" }}>
                    {getJobForCandidate(outreachCandidate)?.title || "General Talent Pool"}
                  </span>
                </div>
              </div>

              {outreachError && (
                <div style={{ padding: "10px 14px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", borderRadius: "var(--radius-sm)", fontSize: "12.5px" }}>
                  {outreachError}
                </div>
              )}

              {/* Outreach Success Card */}
              {outreachResult && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                      borderRadius: "var(--radius-md)",
                      color: "#065f46",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Outreach dispatched! Prospect status updated to <strong>CONTACTED</strong>.</span>
                  </div>

                  {outreachResult.claim_url_preview && (
                    <div style={{ padding: "14px 16px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "var(--radius-md)" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e40af", display: "block", marginBottom: "6px" }}>
                        Magic Profile Claim Link (Demo Preview):
                      </span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="text"
                          readOnly
                          value={outreachResult.claim_url_preview}
                          style={{ flex: 1, padding: "6px 10px", fontSize: "12px", borderRadius: "var(--radius-sm)", border: "1px solid #93c5fd", backgroundColor: "#ffffff", color: "#1e3a8a" }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (outreachResult.claim_url_preview) {
                              navigator.clipboard.writeText(outreachResult.claim_url_preview);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                            }
                          }}
                          className="btn btn-sm btn-primary"
                          style={{ fontSize: "12px", padding: "6px 12px", backgroundColor: "#2563eb", whiteSpace: "nowrap" }}
                        >
                          <Copy size={12} />
                          <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
                        </button>
                      </div>
                      <p style={{ fontSize: "11.5px", color: "#3b82f6", margin: "8px 0 0 0" }}>
                        When the candidate clicks this magic link, they will see their pre-parsed profile, set a password to activate their account, and land directly in the Candidate Portal.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Message Editor */}
              {!outreachResult && (
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                    Personalized Outreach Message
                  </label>
                  <textarea
                    rows={6}
                    value={outreachMessage}
                    onChange={(e) => setOutreachMessage(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      fontSize: "13px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border-subtle)",
                      resize: "vertical",
                      lineHeight: 1.5,
                      fontFamily: "inherit",
                    }}
                  />
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                    A secure 14-day magic profile claim link will be appended to this email.
                  </span>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => setOutreachCandidate(null)}
                  className="btn btn-subtle"
                  style={{ padding: "8px 18px", fontSize: "13.5px" }}
                >
                  {outreachResult ? "Done" : "Cancel"}
                </button>

                {!outreachResult && (
                  <button
                    type="button"
                    disabled={outreachSending}
                    onClick={handleSendOutreach}
                    className="btn btn-primary"
                    style={{
                      padding: "8px 22px",
                      fontSize: "13.5px",
                      backgroundColor: "#0284c7",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Send size={14} />
                    <span>{outreachSending ? "Dispatching..." : "Send Outreach Invite"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PipelineDashboardPage;
