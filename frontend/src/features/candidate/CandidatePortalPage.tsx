import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Candidate, Application, Offer, OnboardingSummaryOut, OnboardingTaskOut } from "../../api/types";
import { getUserDisplayName } from "../../lib/user";
import { StatusBadge } from "../../components/StatusBadge";
import { EmptyState } from "../../components/EmptyState";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Sparkles,
  ArrowRight,
  Gift,
  Download,
  CheckCircle,
  XCircle,
  X,
  CheckSquare,
  Clock,
  Laptop,
  ShieldCheck,
  FileCheck,
  CreditCard,
  Calendar,
} from "lucide-react";

export const CandidatePortalPage: React.FC = () => {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Onboarding State
  const [onboardingSummary, setOnboardingSummary] = useState<OnboardingSummaryOut | null>(null);
  const [selectedTaskModal, setSelectedTaskModal] = useState<OnboardingTaskOut | null>(null);
  const [taskFormInput, setTaskFormInput] = useState<Record<string, any>>({});
  const [savingTask, setSavingTask] = useState<boolean>(false);
  const [taskSaveError, setTaskSaveError] = useState<string | null>(null);

  // Offer Modal State
  const [selectedOfferModal, setSelectedOfferModal] = useState<Offer | null>(null);
  const [responseNotes, setResponseNotes] = useState<string>("");
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);

  // Upload State
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{ success?: string; error?: string } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCandidateProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const [cands, apps, onbSummary] = await Promise.all([
        api.listCandidates(),
        api.getMyApplications().catch(() => [] as Application[]),
        api.getMyOnboarding().catch(() => null),
      ]);
      setCandidates(cands);
      setApplications(apps);
      setOnboardingSummary(onbSummary);

      if (cands.length > 0) {
        try {
          const candidateOffers = await api.getCandidateOffers(cands[0].id);
          setOffers(candidateOffers);
        } catch {
          // Candidate might not have any offers yet
          setOffers([]);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to load candidate profile";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidateProfile();
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus({ error: "File size exceeds 5MB limit." });
      return;
    }

    try {
      setUploading(true);
      setUploadStatus(null);
      const res = await api.uploadResume(file);
      setUploadStatus({
        success: `Successfully uploaded and processed "${res.filename}". Initial status: ${res.status.toUpperCase()}.`,
      });
      await loadCandidateProfile();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to upload resume";
      setUploadStatus({ error: msg });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRespondToOffer = async (offerId: string, action: "accept" | "decline") => {
    try {
      setRespondingOfferId(offerId);
      setResponseError(null);
      await api.respondToOffer(offerId, {
        action,
        notes: responseNotes || undefined,
      });

      // Refresh applications, offers, and onboarding checklist
      const apps = await api.getMyApplications().catch(() => [] as Application[]);
      setApplications(apps);

      if (candidates.length > 0) {
        const candidateOffers = await api.getCandidateOffers(candidates[0].id).catch(() => []);
        setOffers(candidateOffers);
      }

      if (action === "accept") {
        const onb = await api.getMyOnboarding().catch(() => null);
        setOnboardingSummary(onb);
      }

      setSelectedOfferModal(null);
      setResponseNotes("");
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : `Failed to ${action} offer`;
      setResponseError(msg);
    } finally {
      setRespondingOfferId(null);
    }
  };

  const openTaskModal = (task: OnboardingTaskOut) => {
    setSelectedTaskModal(task);
    setTaskFormInput(task.form_data || {});
    setTaskSaveError(null);
  };

  const handleSaveTask = async (taskId: string) => {
    try {
      setSavingTask(true);
      setTaskSaveError(null);
      await api.updateOnboardingTask(taskId, {
        status: "completed",
        form_data: taskFormInput,
      });
      const refreshed = await api.getMyOnboarding().catch(() => null);
      setOnboardingSummary(refreshed);
      setSelectedTaskModal(null);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to update onboarding task";
      setTaskSaveError(msg);
    } finally {
      setSavingTask(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "compliance":
      case "i9_compliance":
        return <ShieldCheck size={18} style={{ color: "#3b82f6" }} />;
      case "w4_tax":
        return <FileCheck size={18} style={{ color: "#8b5cf6" }} />;
      case "banking":
      case "direct_deposit":
        return <CreditCard size={18} style={{ color: "#10b981" }} />;
      case "agreements":
      case "ip_agreement":
        return <CheckSquare size={18} style={{ color: "#f59e0b" }} />;
      case "it_provisioning":
      case "workstation":
        return <Laptop size={18} style={{ color: "#06b6d4" }} />;
      case "orientation":
        return <Calendar size={18} style={{ color: "#ec4899" }} />;
      default:
        return <Briefcase size={18} style={{ color: "#6452ce" }} />;
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const latestCandidate = candidates.length > 0 ? candidates[0] : null;
  const parsed = latestCandidate?.parsed_data;
  const pendingOffer = offers.find((o) => o.status === "sent");
  const acceptedOffer = offers.find((o) => o.status === "accepted");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Hero Welcome Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #6452ce 0%, #4a38af 100%)",
          borderRadius: "16px",
          padding: "32px 36px",
          color: "#ffffff",
          boxShadow: "0 10px 30px rgba(100, 82, 206, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "20px",
        }}
      >
        <div style={{ maxWidth: "680px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 10px",
                borderRadius: "50px",
                background: "rgba(255, 255, 255, 0.2)",
                fontSize: "11.5px",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              <Sparkles size={13} />
              Candidate Career Portal
            </span>
            <span style={{ opacity: 0.75, fontSize: "12.5px" }}>{user?.email}</span>
          </div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 800,
              margin: "0 0 10px 0",
              letterSpacing: "-0.5px",
              lineHeight: 1.2,
            }}
          >
            {user ? `Welcome back, ${getUserDisplayName(user)}` : "Welcome to Your Career Hub"}
          </h1>
          <p
            style={{
              fontSize: "14px",
              lineHeight: "1.6",
              margin: 0,
              opacity: 0.9,
              color: "#e2ddff",
            }}
          >
            Upload your resume to automatically generate your semantic skill dossier, discover matching
            engineering roles, and track your application status across our hiring pipeline.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <Link
            to="/jobs"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 22px",
              backgroundColor: "#ffffff",
              color: "#6452ce",
              fontWeight: 700,
              fontSize: "13.5px",
              borderRadius: "50px",
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
              transition: "transform 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          >
            <Briefcase size={16} />
            <span>Browse Open Jobs</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            backgroundColor: "var(--status-rejected-bg)",
            border: "1px solid var(--status-rejected-border)",
            borderRadius: "12px",
            color: "var(--status-rejected-text)",
            fontSize: "13.5px",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {uploadStatus?.success && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            backgroundColor: "var(--status-approved-bg)",
            border: "1px solid var(--status-approved-border)",
            borderRadius: "12px",
            color: "var(--status-approved-text)",
            fontSize: "13.5px",
          }}
        >
          <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
          <span>{uploadStatus.success}</span>
        </div>
      )}

      {uploadStatus?.error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            backgroundColor: "var(--status-rejected-bg)",
            border: "1px solid var(--status-rejected-border)",
            borderRadius: "12px",
            color: "var(--status-rejected-text)",
            fontSize: "13.5px",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{uploadStatus.error}</span>
        </div>
      )}

      {/* Main Grid: Upload + Extracted Dossier */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Left Column: Resume Upload & Ingestion */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Resume Ingestion & Parsing
            </h2>
            <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              PDF · DOCX · TXT · MAX 5MB
            </span>
          </div>

          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            Upload or refresh your resume. Our QLoRA fine-tuned extractor parses your domains, seniority,
            and key accomplishments into structured vector embeddings for fast job matching.
          </p>

          {/* Dropzone */}
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
              borderRadius: "14px",
              padding: "36px 20px",
              textAlign: "center",
              cursor: uploading ? "not-allowed" : "pointer",
              backgroundColor: isDragging ? "var(--accent-purple-subtle)" : "var(--bg-canvas)",
              transition: "all 0.2s ease",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
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

            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--accent-purple-subtle)",
                color: "var(--accent-purple)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <UploadCloud size={24} />
            </div>

            <div>
              <p style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)", margin: "0 0 4px 0" }}>
                {uploading ? "Extracting & Embedding Resume..." : "Click to select or drag and drop your resume"}
              </p>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
                Structured profile will be updated immediately upon ingestion
              </p>
            </div>
          </div>

          {latestCandidate && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                backgroundColor: "var(--bg-canvas)",
                borderRadius: "10px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FileText size={18} style={{ color: "var(--accent-purple)" }} />
                <div>
                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                    {latestCandidate.raw_resume_filename}
                  </span>
                  <div className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Uploaded {new Date(latestCandidate.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <StatusBadge status={latestCandidate.status} />
            </div>
          )}
        </div>

        {/* Right Column: AI-Extracted Profile Dossier */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "24px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              Extracted Profile Dossier
            </h2>
            {parsed && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--accent-purple)",
                  backgroundColor: "var(--accent-purple-subtle)",
                  padding: "3px 8px",
                  borderRadius: "50px",
                }}
              >
                <Sparkles size={11} />
                AI Parsed
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              Loading profile details...
            </div>
          ) : !parsed ? (
            <EmptyState
              title="No Resume Dossier Available"
              description="Upload your resume in the upload box on the left to extract your professional background, domain tags, and core skills."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Primary Attributes Bar */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px",
                  padding: "12px",
                  backgroundColor: "var(--bg-canvas)",
                  borderRadius: "10px",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                    Seniority
                  </span>
                  <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", textTransform: "capitalize" }}>
                    {parsed.seniority || "N/A"}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                    Experience
                  </span>
                  <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                    {parsed.years_experience ? `${parsed.years_experience} yrs` : "N/A"}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>
                    Domain
                  </span>
                  <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {parsed.primary_domain || "Software Eng."}
                  </span>
                </div>
              </div>

              {/* Core Skills */}
              <div>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                  Core Competencies & Skills
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {parsed.core_skills?.map((skill, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "50px",
                        backgroundColor: "var(--accent-purple-subtle)",
                        color: "var(--accent-purple)",
                        fontSize: "12px",
                        fontWeight: 600,
                        border: "1px solid var(--accent-purple-border)",
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                  {parsed.secondary_skills?.map((skill, idx) => (
                    <span
                      key={`sec-${idx}`}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "50px",
                        backgroundColor: "var(--bg-canvas)",
                        color: "var(--text-secondary)",
                        fontSize: "12px",
                        fontWeight: 500,
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {parsed.summary && (
                <div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Executive Summary
                  </span>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-primary)",
                      lineHeight: "1.6",
                      margin: 0,
                      backgroundColor: "var(--bg-canvas)",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {parsed.summary}
                  </p>
                </div>
              )}

              {/* Key Achievements */}
              {parsed.key_achievements && parsed.key_achievements.length > 0 && (
                <div>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                    Key Accomplishments
                  </span>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12.5px", color: "var(--text-primary)", lineHeight: 1.5 }}>
                    {parsed.key_achievements.map((item, idx) => (
                      <li key={idx} style={{ marginBottom: "4px" }}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Active Offer Banner */}
      {pendingOffer && (
        <div
          style={{
            borderRadius: "16px",
            background: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
            border: "2px solid #c4b5fd",
            padding: "24px 28px",
            boxShadow: "0 10px 25px -5px rgba(109, 40, 217, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                backgroundColor: "#7c3aed",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(124, 58, 237, 0.35)",
              }}
            >
              <Gift size={24} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    backgroundColor: "#7c3aed",
                    color: "#ffffff",
                    padding: "2px 8px",
                    borderRadius: "50px",
                    letterSpacing: "0.05em",
                  }}
                >
                  Official Offer Extended
                </span>
                <span style={{ fontSize: "12px", color: "#6d28d9", fontWeight: 600 }}>
                  Action Required
                </span>
              </div>
              <h3 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 4px 0", color: "#4c1d95" }}>
                Job Offer: {pendingOffer.role_title}
              </h3>
              <p style={{ margin: 0, fontSize: "13.5px", color: "#5b21b6", lineHeight: 1.4 }}>
                Compensation: <strong>{pendingOffer.currency} {Number(pendingOffer.salary).toLocaleString()} / year</strong>
                {pendingOffer.equity ? ` • Equity: ${pendingOffer.equity}` : ""}
                {pendingOffer.start_date ? ` • Target Start Date: ${pendingOffer.start_date}` : ""}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <a
              href={api.getOfferDownloadUrl(pendingOffer.id)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-subtle btn-sm"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #ddd6fe",
                color: "#6d28d9",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Download size={14} />
              <span>Download (.md)</span>
            </a>
            <button
              type="button"
              onClick={() => {
                setSelectedOfferModal(pendingOffer);
                setResponseNotes("");
                setResponseError(null);
              }}
              className="btn btn-purple"
              style={{
                padding: "9px 20px",
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FileText size={15} />
              <span>Review & Sign Offer Letter</span>
            </button>
          </div>
        </div>
      )}

      {acceptedOffer && !pendingOffer && (
        <div
          style={{
            borderRadius: "16px",
            background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
            border: "1.5px solid #a7f3d0",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                backgroundColor: "#059669",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle size={22} />
            </div>
            <div>
              <h4 style={{ margin: "0 0 2px 0", fontSize: "16px", fontWeight: 700, color: "#065f46" }}>
                Offer Accepted — Welcome to the Team!
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#047857" }}>
                Role: <strong>{acceptedOffer.role_title}</strong> • Start Date: {acceptedOffer.start_date || "To be confirmed"} • Responded on {acceptedOffer.responded_at ? new Date(acceptedOffer.responded_at).toLocaleDateString() : "Recently"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setSelectedOfferModal(acceptedOffer)}
              className="btn btn-sm"
              style={{ backgroundColor: "#ffffff", color: "#065f46", border: "1px solid #a7f3d0" }}
            >
              View Executed Offer
            </button>
            <a
              href={api.getOfferDownloadUrl(acceptedOffer.id)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm btn-success"
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <Download size={13} />
              <span>Download Signed Copy</span>
            </a>
          </div>
        </div>
      )}

      {/* Post-Offer Onboarding Checklist Hub */}
      {onboardingSummary && onboardingSummary.tasks && onboardingSummary.tasks.length > 0 && (
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            padding: "26px",
            border: "1.5px solid rgba(100, 82, 206, 0.2)",
            boxShadow: "0 8px 30px rgba(100, 82, 206, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "22px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span
                  style={{
                    backgroundColor: "rgba(100, 82, 206, 0.12)",
                    color: "var(--accent-purple)",
                    fontSize: "11px",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: "20px",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  New Hire Checklist
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {onboardingSummary.completed_tasks} of {onboardingSummary.total_tasks} Tasks Submitted · {onboardingSummary.verified_tasks} Verified
                </span>
              </div>
              <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
                Post-Offer Onboarding & Compliance Portal
              </h2>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
                Complete these compliance, payroll, and equipment provisioning items before your target start date.
              </p>
            </div>

            <div style={{ minWidth: "220px", backgroundColor: "var(--bg-canvas)", padding: "14px 18px", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Overall Readiness
                </span>
                <span className="mono" style={{ fontSize: "14px", fontWeight: 800, color: onboardingSummary.progress_percentage === 100 ? "#10b981" : "var(--accent-purple)" }}>
                  {Math.round(onboardingSummary.progress_percentage)}%
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  backgroundColor: "var(--border-subtle)",
                  borderRadius: "99px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${onboardingSummary.progress_percentage}%`,
                    backgroundColor: onboardingSummary.progress_percentage === 100 ? "#10b981" : "var(--accent-purple)",
                    borderRadius: "99px",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Task Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
            {onboardingSummary.tasks.map((task: OnboardingTaskOut) => {
              const isVerified = task.status === "verified";
              const isCompleted = task.status === "completed";

              return (
                <div
                  key={task.id}
                  style={{
                    backgroundColor: isVerified ? "#f0fdf4" : isCompleted ? "#f8fafc" : "#ffffff",
                    border: `1.5px solid ${
                      isVerified ? "#86efac" : isCompleted ? "#cbd5e1" : "var(--border-subtle)"
                    }`,
                    borderRadius: "14px",
                    padding: "18px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "14px",
                    transition: "all 0.2s ease",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          backgroundColor: "#f1f5f9",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {getCategoryIcon(task.category)}
                      </div>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          backgroundColor: isVerified
                            ? "var(--status-approved-bg)"
                            : isCompleted
                            ? "#e0e7ff"
                            : "var(--status-pending-bg)",
                          color: isVerified
                            ? "var(--status-approved-text)"
                            : isCompleted
                            ? "#3730a3"
                            : "var(--status-pending-text)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {isVerified ? "✓ VERIFIED BY HR" : isCompleted ? "SUBMITTED · PENDING HR" : "ACTION REQUIRED"}
                      </span>
                    </div>

                    <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {task.title}
                    </h4>
                    <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                      {task.description}
                    </p>

                    {task.form_data && Object.keys(task.form_data).length > 0 && (
                      <div
                        style={{
                          marginTop: "12px",
                          padding: "8px 12px",
                          backgroundColor: "rgba(0,0,0,0.02)",
                          borderRadius: "8px",
                          fontSize: "11.5px",
                          color: "var(--text-muted)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "3px",
                        }}
                      >
                        {Object.entries(task.form_data).slice(0, 2).map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{k.replace(/_/g, " ")}:</span>
                            <span className="mono" style={{ maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: "12px",
                      borderTop: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={12} />
                      Due within {task.due_days} days
                    </span>
                    <button
                      type="button"
                      onClick={() => openTaskModal(task)}
                      className={`btn btn-sm ${isVerified ? "btn-subtle" : isCompleted ? "btn-secondary" : "btn-purple"}`}
                      style={{ fontSize: "12px", padding: "6px 14px", fontWeight: 600 }}
                    >
                      {isVerified ? "Review Details" : isCompleted ? "Edit Submission" : "Complete Task"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Applications & Pipeline Status Section */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          padding: "24px",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
              My Applications & Evaluation Status
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
              Track where your submissions are in the hiring lifecycle.
            </p>
          </div>
          <Link
            to="/jobs"
            style={{
              fontSize: "12.5px",
              fontWeight: 600,
              color: "var(--accent-purple)",
              textDecoration: "none",
            }}
          >
            Find more jobs →
          </Link>
        </div>

        {applications.length === 0 && candidates.length === 0 ? (
          <EmptyState
            title="No Applications Found"
            description="Once you upload a resume or apply for an opening, your review stages will appear here."
          />
        ) : applications.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {applications.map((app) => {
              const appOffer = offers.find((o) => o.application_id === app.id);

              return (
                <div
                  key={app.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    backgroundColor: "var(--bg-canvas)",
                    borderRadius: "12px",
                    border: "1px solid var(--border-subtle)",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "10px",
                        backgroundColor: "var(--accent-purple-subtle)",
                        color: "var(--accent-purple)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Briefcase size={20} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <h3 style={{ fontSize: "14.5px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                          {app.job?.title || "Requisition Application"}
                        </h3>
                        {app.job?.role_tier && (
                          <span
                            className="badge mono"
                            style={{ fontSize: "10.5px", textTransform: "uppercase", backgroundColor: "#f1f5f9", color: "#475569" }}
                          >
                            {app.job.role_tier}
                          </span>
                        )}
                        {app.similarity_score !== undefined && app.similarity_score !== null && (
                          <span
                            className="mono"
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "var(--status-approved-text)",
                              backgroundColor: "var(--status-approved-bg)",
                              padding: "2px 6px",
                              borderRadius: "4px",
                            }}
                          >
                            {(app.similarity_score * 100).toFixed(0)}% MATCH
                          </span>
                        )}
                      </div>
                      <div className="mono" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                        App ID: {app.id.slice(0, 8)} · Submitted {new Date(app.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {appOffer && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOfferModal(appOffer);
                          setResponseNotes("");
                          setResponseError(null);
                        }}
                        className="btn btn-sm"
                        style={{
                          backgroundColor: "#f5f3ff",
                          color: "#6d28d9",
                          borderColor: "#ddd6fe",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Gift size={12} />
                        <span>View Offer</span>
                      </button>
                    )}
                    <StatusBadge status={app.status} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Fallback candidate upload records */
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {candidates.map((cand) => (
              <div
                key={cand.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px",
                  backgroundColor: "var(--bg-canvas)",
                  borderRadius: "12px",
                  border: "1px solid var(--border-subtle)",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      backgroundColor: "var(--accent-purple-subtle)",
                      color: "var(--accent-purple)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Briefcase size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 2px 0", color: "var(--text-primary)" }}>
                      {cand.parsed_data?.current_title || "General Application"}
                    </h3>
                    <div className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Record ID: {cand.id.slice(0, 8)} · Uploaded {new Date(cand.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <StatusBadge status={cand.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offer Review & Acceptance Modal */}
      {selectedOfferModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
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
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "760px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "18px 24px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#fafbfc",
              }}
            >
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  Formal Offer Letter
                </h3>
                <span className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Role: {selectedOfferModal.role_title} • Status: {selectedOfferModal.status.toUpperCase()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOfferModal(null)}
                className="btn btn-subtle"
                style={{ padding: "6px", borderRadius: "50%" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Key Terms Ribbon */}
            <div
              style={{
                padding: "12px 24px",
                backgroundColor: "var(--accent-purple-subtle)",
                borderBottom: "1px solid var(--accent-purple-border)",
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "12px",
              }}
            >
              <div>
                <span style={{ fontSize: "11px", color: "#6d28d9", fontWeight: 600, display: "block" }}>
                  Annual Base Compensation
                </span>
                <span className="mono" style={{ fontSize: "15px", fontWeight: 800, color: "#4c1d95" }}>
                  {selectedOfferModal.currency} {Number(selectedOfferModal.salary).toLocaleString()}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "#6d28d9", fontWeight: 600, display: "block" }}>
                  Target Start Date
                </span>
                <span className="mono" style={{ fontSize: "14px", fontWeight: 700, color: "#4c1d95" }}>
                  {selectedOfferModal.start_date || "Immediate"}
                </span>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "#6d28d9", fontWeight: 600, display: "block" }}>
                  Equity Grant
                </span>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#4c1d95" }}>
                  {selectedOfferModal.equity || "None specified"}
                </span>
              </div>
            </div>

            {/* Offer Letter Document Preview */}
            <div
              style={{
                padding: "24px",
                overflowY: "auto",
                backgroundColor: "#ffffff",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "13.5px",
                  lineHeight: "1.65",
                  color: "#334155",
                  backgroundColor: "#f8fafc",
                  padding: "20px 24px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-subtle)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selectedOfferModal.offer_letter_text || "Offer letter text unavailable."}
              </div>

              {responseError && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    backgroundColor: "var(--status-rejected-bg)",
                    border: "1px solid var(--status-rejected-border)",
                    color: "var(--status-rejected-text)",
                    fontSize: "13px",
                  }}
                >
                  {responseError}
                </div>
              )}

              {/* Action Form for Sent Offers */}
              {selectedOfferModal.status === "sent" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Optional Message to Hiring Team:
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Add any acceptance notes, questions, or comments..."
                    value={responseNotes}
                    onChange={(e) => setResponseNotes(e.target.value)}
                    style={{
                      borderRadius: "8px",
                      width: "100%",
                      fontSize: "13px",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <a
                      href={api.getOfferDownloadUrl(selectedOfferModal.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-subtle"
                      style={{ fontSize: "12.5px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <Download size={14} />
                      <span>Download Markdown</span>
                    </a>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        type="button"
                        disabled={respondingOfferId === selectedOfferModal.id}
                        onClick={() => handleRespondToOffer(selectedOfferModal.id, "decline")}
                        className="btn btn-danger"
                      >
                        <XCircle size={14} />
                        <span>Decline Offer</span>
                      </button>
                      <button
                        type="button"
                        disabled={respondingOfferId === selectedOfferModal.id}
                        onClick={() => handleRespondToOffer(selectedOfferModal.id, "accept")}
                        className="btn btn-purple"
                        style={{ padding: "8px 20px" }}
                      >
                        <CheckCircle size={14} />
                        <span>
                          {respondingOfferId === selectedOfferModal.id ? "Processing..." : "Accept & Confirm Offer"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <span className="mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Decision Recorded: {selectedOfferModal.status.toUpperCase()}{" "}
                    {selectedOfferModal.responded_at
                      ? `on ${new Date(selectedOfferModal.responded_at).toLocaleDateString()}`
                      : ""}
                  </span>
                  <a
                    href={api.getOfferDownloadUrl(selectedOfferModal.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-subtle"
                  >
                    <Download size={14} />
                    <span>Download Copy</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Task Completion & Details Modal */}
      {selectedTaskModal && (
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
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingTask) setSelectedTaskModal(null);
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "640px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.25)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "10px",
                    backgroundColor: "var(--accent-purple-subtle)",
                    color: "var(--accent-purple)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {getCategoryIcon(selectedTaskModal.category)}
                </div>
                <div>
                  <h3 style={{ margin: "0 0 2px 0", fontSize: "17px", fontWeight: 700, color: "var(--text-primary)" }}>
                    {selectedTaskModal.title}
                  </h3>
                  <span className="mono" style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    Category: {selectedTaskModal.category.replace(/_/g, " ")} · Due in {selectedTaskModal.due_days} days
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTaskModal(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: "6px",
                  borderRadius: "8px",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div
              style={{
                padding: "24px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
              }}
            >
              {/* Status Banner */}
              {selectedTaskModal.status === "verified" ? (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    backgroundColor: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#065f46",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <CheckCircle size={18} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Verified by HR Team:</strong> This compliance record has passed HR review and is locked for payroll and provisioning.
                  </span>
                </div>
              ) : selectedTaskModal.status === "completed" ? (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    backgroundColor: "#e0e7ff",
                    border: "1px solid #c7d2fe",
                    color: "#3730a3",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <Clock size={18} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Submitted & Pending Review:</strong> Your details are in the HR queue. You may make modifications below until final verification.
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    backgroundColor: "var(--status-pending-bg)",
                    border: "1px solid var(--status-pending-border)",
                    color: "var(--status-pending-text)",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Action Required:</strong> {selectedTaskModal.description}
                  </span>
                </div>
              )}

              {taskSaveError && (
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
                  {taskSaveError}
                </div>
              )}

              {/* Dynamic Category Forms */}
              {(() => {
                const cat = selectedTaskModal.category as string;
                const titleLower = selectedTaskModal.title.toLowerCase();
                const isWorkstation = cat === "workstation" || cat === "it_provisioning";
                const isBanking = cat === "direct_deposit" || cat === "banking";
                const isW4 = cat === "w4_tax" || (cat === "compliance" && (titleLower.includes("w-4") || titleLower.includes("tax")));
                const isI9 = cat === "i9_compliance" || (cat === "compliance" && !titleLower.includes("w-4") && !titleLower.includes("tax"));
                const isAgreement = cat === "ip_agreement" || cat === "agreements";
                const isOrientation = cat === "orientation";

                if (isWorkstation) {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Workstation Hardware Package
                        </label>
                        <select
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          value={taskFormInput.equipment_choice || "Apple MacBook Pro 16\" (M3 Max, 36GB Unified RAM, 1TB SSD)"}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, equipment_choice: e.target.value })}
                        >
                          <option value="Apple MacBook Pro 16&quot; (M3 Max, 36GB Unified RAM, 1TB SSD)">
                            Apple MacBook Pro 16&quot; (M3 Max, 36GB Unified RAM, 1TB SSD) — Recommended for Engineering
                          </option>
                          <option value="Apple MacBook Pro 14&quot; (M3 Pro, 32GB Unified RAM, 512GB SSD)">
                            Apple MacBook Pro 14&quot; (M3 Pro, 32GB Unified RAM, 512GB SSD) — Compact Ultraportable
                          </option>
                          <option value="Lenovo ThinkPad P1 Gen 6 (Intel Core i9, 32GB RAM, 1TB SSD, Ubuntu Linux)">
                            Lenovo ThinkPad P1 Gen 6 (Intel Core i9, 32GB RAM, 1TB SSD, Ubuntu Linux Certified)
                          </option>
                          <option value="Dell XPS 15 (Intel Core i7, 32GB RAM, RTX 4060, Windows 11 Pro)">
                            Dell XPS 15 (Intel Core i7, 32GB RAM, RTX 4060, Windows 11 Pro)
                          </option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          External Display Setup
                        </label>
                        <select
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          value={taskFormInput.monitor_preference || "Dual 27\" 4K USB-C Hub Displays"}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, monitor_preference: e.target.value })}
                        >
                          <option value="Dual 27&quot; 4K USB-C Hub Displays">Dual 27&quot; 4K USB-C Hub Displays (90W Power Delivery)</option>
                          <option value="Single 34&quot; Curved Ultrawide Display (1440p USB-C)">Single 34&quot; Curved Ultrawide Display (1440p USB-C)</option>
                          <option value="Single 32&quot; 4K Professional Monitor">Single 32&quot; 4K Professional Monitor</option>
                          <option value="No Monitor Needed (Using Existing Home Office Setup)">No Monitor Needed (Using Existing Home Office Setup)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Shipping Delivery Address
                        </label>
                        <textarea
                          rows={3}
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          placeholder="Street Address, Apt / Suite&#10;City, State, Zip Code&#10;Attention: Full Name"
                          value={taskFormInput.delivery_address || ""}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, delivery_address: e.target.value })}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Peripherals & Ergonomic Requests (Optional)
                        </label>
                        <input
                          type="text"
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          placeholder="e.g. Magic Keyboard with Touch ID, MX Master 3S Mouse, USB-C adapter"
                          value={taskFormInput.peripherals || ""}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, peripherals: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                }

                if (isBanking) {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Financial Institution / Bank Name
                        </label>
                        <input
                          type="text"
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          placeholder="e.g. JPMorgan Chase, Wells Fargo, Silicon Valley Bank"
                          value={taskFormInput.bank_name || ""}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, bank_name: e.target.value })}
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Routing Transit Number (9 digits)
                          </label>
                          <input
                            type="text"
                            className="input mono"
                            maxLength={9}
                            disabled={selectedTaskModal.status === "verified"}
                            placeholder="122000496"
                            value={taskFormInput.routing_number || ""}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, routing_number: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Account Number
                          </label>
                          <input
                            type="text"
                            className="input mono"
                            disabled={selectedTaskModal.status === "verified"}
                            placeholder="••••••••4892"
                            value={taskFormInput.account_number || ""}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, account_number: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Account Type
                        </label>
                        <select
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          value={taskFormInput.account_type || "checking"}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, account_type: e.target.value })}
                        >
                          <option value="checking">Checking Account (Primary Payroll)</option>
                          <option value="savings">Savings Account</option>
                        </select>
                      </div>

                      <div style={{ padding: "10px 14px", backgroundColor: "#f8fafc", borderRadius: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
                        🔒 Banking credentials are encrypted at rest with AES-256 and used strictly for automated payroll disbursements.
                      </div>
                    </div>
                  );
                }

                if (isW4) {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Federal Filing Status (Step 1c)
                        </label>
                        <select
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          value={taskFormInput.filing_status || "single"}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, filing_status: e.target.value })}
                        >
                          <option value="single">Single or Married filing separately</option>
                          <option value="married_joint">Married filing jointly</option>
                          <option value="head_of_household">Head of household</option>
                        </select>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Claim Dependents Total ($)
                          </label>
                          <input
                            type="number"
                            className="input mono"
                            disabled={selectedTaskModal.status === "verified"}
                            placeholder="0"
                            value={taskFormInput.claim_dependents ?? 0}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, claim_dependents: Number(e.target.value) })}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Extra Withholding per Period ($)
                          </label>
                          <input
                            type="number"
                            className="input mono"
                            disabled={selectedTaskModal.status === "verified"}
                            placeholder="0"
                            value={taskFormInput.extra_withholding ?? 0}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, extra_withholding: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          State Tax Withholding Jurisdiction
                        </label>
                        <input
                          type="text"
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          placeholder="e.g. California (CA), New York (NY), Washington (WA)"
                          value={taskFormInput.tax_state || ""}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, tax_state: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                }

                if (isI9) {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Citizenship / Immigration Status (Section 1)
                        </label>
                        <select
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          value={taskFormInput.citizenship_status || "citizen"}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, citizenship_status: e.target.value })}
                        >
                          <option value="citizen">A citizen of the United States</option>
                          <option value="noncitizen_national">A noncitizen national of the United States</option>
                          <option value="permanent_resident">A lawful permanent resident</option>
                          <option value="authorized_alien">An alien authorized to work in the United States</option>
                        </select>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Verification Document Type
                          </label>
                          <select
                            className="input"
                            disabled={selectedTaskModal.status === "verified"}
                            value={taskFormInput.document_type || "us_passport"}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, document_type: e.target.value })}
                          >
                            <option value="us_passport">U.S. Passport (List A)</option>
                            <option value="permanent_resident_card">Permanent Resident Card (List A)</option>
                            <option value="driver_license_and_ssn">Driver&apos;s License (List B) + SSN Card (List C)</option>
                            <option value="ead_card">Employment Authorization Document (List A)</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Document Identification Number
                          </label>
                          <input
                            type="text"
                            className="input mono"
                            disabled={selectedTaskModal.status === "verified"}
                            placeholder="e.g. A92837492 or Pass #982312"
                            value={taskFormInput.document_number || ""}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, document_number: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Social Security Number (Last 4 Digits)
                        </label>
                        <input
                          type="password"
                          maxLength={4}
                          className="input mono"
                          disabled={selectedTaskModal.status === "verified"}
                          placeholder="••••"
                          value={taskFormInput.ssn_last_four || ""}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, ssn_last_four: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                }

                if (isAgreement) {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div
                        style={{
                          padding: "16px",
                          backgroundColor: "var(--bg-canvas)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "10px",
                          fontSize: "12.5px",
                          color: "var(--text-secondary)",
                          lineHeight: 1.6,
                          maxHeight: "160px",
                          overflowY: "auto",
                        }}
                      >
                        <strong>PROPRIETARY INFORMATION AND INVENTIONS AGREEMENT:</strong>
                        <br />
                        1. <em>Assignment of Inventions:</em> I hereby assign and agree to assign to the Company all my right, title, and interest in and to any and all inventions, original works of authorship, developments, concepts, and improvements created within the scope of my employment.
                        <br />
                        2. <em>Confidential Information:</em> I agree to hold in strictest confidence and not disclose to any person or entity without express written authorization any proprietary technical data, trade secrets, software code, customer data, or algorithms.
                      </div>

                      <div>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            fontSize: "13px",
                            cursor: selectedTaskModal.status === "verified" ? "default" : "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            disabled={selectedTaskModal.status === "verified"}
                            checked={taskFormInput.agreement_acknowledged === true}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, agreement_acknowledged: e.target.checked })}
                            style={{ marginTop: "3px" }}
                          />
                          <span>
                            I have read, understood, and accept the terms of the Proprietary Information and Inventions Agreement and agree to be legally bound.
                          </span>
                        </label>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Typed Electronic Signature (Full Legal Name)
                          </label>
                          <input
                            type="text"
                            className="input"
                            disabled={selectedTaskModal.status === "verified"}
                            placeholder="Type full legal name"
                            value={taskFormInput.legal_signature || ""}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, legal_signature: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Date of Execution
                          </label>
                          <input
                            type="date"
                            className="input"
                            disabled={selectedTaskModal.status === "verified"}
                            value={taskFormInput.signature_date || new Date().toISOString().split("T")[0]}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, signature_date: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                }

                if (isOrientation) {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Day-1 Orientation Cohort
                        </label>
                        <select
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          value={taskFormInput.cohort_slot || "morning_virtual"}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, cohort_slot: e.target.value })}
                        >
                          <option value="morning_virtual">Monday 9:00 AM – 1:00 PM EST (Virtual Interactive Cohort)</option>
                          <option value="afternoon_virtual">Monday 1:00 PM – 5:00 PM EST (West Coast Cohort)</option>
                          <option value="in_person_hq">Monday 9:00 AM EST (In-Person HQ Executive Orientation)</option>
                        </select>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Emergency Contact Full Name
                          </label>
                          <input
                            type="text"
                            className="input"
                            disabled={selectedTaskModal.status === "verified"}
                            placeholder="e.g. Jane Doe"
                            value={taskFormInput.emergency_contact_name || ""}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, emergency_contact_name: e.target.value })}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                            Emergency Contact Phone
                          </label>
                          <input
                            type="tel"
                            className="input mono"
                            disabled={selectedTaskModal.status === "verified"}
                            placeholder="+1 (555) 000-0000"
                            value={taskFormInput.emergency_contact_phone || ""}
                            onChange={(e) => setTaskFormInput({ ...taskFormInput, emergency_contact_phone: e.target.value })}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                          Relationship to Candidate
                        </label>
                        <input
                          type="text"
                          className="input"
                          disabled={selectedTaskModal.status === "verified"}
                          placeholder="e.g. Spouse, Partner, Parent, Sibling"
                          value={taskFormInput.emergency_contact_relation || ""}
                          onChange={(e) => setTaskFormInput({ ...taskFormInput, emergency_contact_relation: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>
                      Task Notes & Compliance Response
                    </label>
                    <textarea
                      rows={4}
                      className="input"
                      disabled={selectedTaskModal.status === "verified"}
                      placeholder="Enter response details for this task..."
                      value={taskFormInput.notes || ""}
                      onChange={(e) => setTaskFormInput({ ...taskFormInput, notes: e.target.value })}
                    />
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "var(--bg-canvas)",
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedTaskModal(null)}
                className="btn btn-subtle"
                disabled={savingTask}
              >
                Close
              </button>

              {selectedTaskModal.status !== "verified" && (
                <button
                  type="button"
                  disabled={savingTask}
                  onClick={() => handleSaveTask(selectedTaskModal.id)}
                  className="btn btn-purple"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <CheckCircle size={14} />
                  <span>{savingTask ? "Saving Details..." : "Submit for HR Verification"}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidatePortalPage;
