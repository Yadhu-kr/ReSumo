import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { Candidate } from "../../api/types";
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
} from "lucide-react";

export const CandidatePortalPage: React.FC = () => {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Upload State
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{ success?: string; error?: string } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCandidateProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      // api.listCandidates() for role=candidate automatically filters to user's candidate records
      const cands = await api.listCandidates();
      setCandidates(cands);
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const latestCandidate = candidates.length > 0 ? candidates[0] : null;
  const parsed = latestCandidate?.parsed_data;

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

        {candidates.length === 0 ? (
          <EmptyState
            title="No Applications Found"
            description="Once you upload a resume or apply for an opening, your review stages will appear here."
          />
        ) : (
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
                      Application ID: {cand.id.slice(0, 8)} · Submitted {new Date(cand.created_at).toLocaleDateString()}
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
    </div>
  );
};

export default CandidatePortalPage;
