import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type { Job } from "../../api/types";
import { EmptyState } from "../../components/EmptyState";
import {
  Briefcase,
  Search,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Calendar,
} from "lucide-react";

export const CandidateJobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<Record<string, boolean>>({});

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
      const msg = err instanceof ApiError ? err.detail : "Failed to load active job openings";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  const filteredJobs = jobs.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = selectedTier === "all" || j.role_tier === selectedTier;
    return matchesSearch && matchesTier;
  });

  const handleApplyClick = (jobId: string) => {
    setAppliedJobs((prev) => ({ ...prev, [jobId]: true }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--accent-purple)",
                backgroundColor: "var(--accent-purple-subtle)",
                padding: "2px 8px",
                borderRadius: "50px",
                textTransform: "uppercase",
              }}
            >
              <Briefcase size={12} />
              Career Openings
            </span>
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
            Explore Open Opportunities
          </h1>
          <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Discover active engineering requisitions matching your expertise and skills.
          </p>
        </div>

        {/* Search & Filter Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              backgroundColor: "#ffffff",
              border: "1px solid var(--border-subtle)",
              borderRadius: "50px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            }}
          >
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search by title or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: "13px",
                backgroundColor: "transparent",
                width: "180px",
              }}
            />
          </div>

          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            style={{
              padding: "6px 14px",
              fontSize: "12.5px",
              fontWeight: 600,
              borderRadius: "50px",
              border: "1px solid var(--border-subtle)",
              backgroundColor: "#ffffff",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <option value="all">All Seniority Tiers</option>
            <option value="junior">Junior</option>
            <option value="mid">Mid-Level</option>
            <option value="senior">Senior</option>
            <option value="exec">Executive</option>
          </select>
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

      {/* Split Grid: Jobs List (Left) and Requisition Details (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "24px", alignItems: "start" }}>
        {/* Left: Requisitions List */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "var(--bg-canvas)",
            }}
          >
            <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)" }}>
              AVAILABLE OPENINGS ({filteredJobs.length})
            </span>
          </div>

          <div style={{ maxHeight: "calc(100vh - 280px)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {loading ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                Loading opportunities...
              </div>
            ) : filteredJobs.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No requisitions match your criteria.
              </div>
            ) : (
              filteredJobs.map((job) => {
                const isSelected = selectedJob?.id === job.id;
                const isApplied = appliedJobs[job.id];

                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    style={{
                      padding: "16px 18px",
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--accent-purple-subtle)" : "#ffffff",
                      borderLeft: isSelected ? "3px solid var(--accent-purple)" : "3px solid transparent",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span
                        className="badge mono"
                        style={{
                          fontSize: "10.5px",
                          textTransform: "uppercase",
                          backgroundColor: "#f1f5f9",
                          color: "#475569",
                        }}
                      >
                        {job.role_tier} tier
                      </span>
                      {isApplied && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: "var(--status-approved-text)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          <CheckCircle2 size={12} /> Applied
                        </span>
                      )}
                    </div>

                    <h3
                      style={{
                        fontSize: "14.5px",
                        fontWeight: 700,
                        margin: "0 0 6px 0",
                        color: isSelected ? "var(--accent-purple)" : "var(--text-primary)",
                      }}
                    >
                      {job.title}
                    </h3>

                    <p
                      style={{
                        fontSize: "12.5px",
                        color: "var(--text-secondary)",
                        margin: 0,
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {job.description}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Selected Job Specification */}
        {selectedJob ? (
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {/* Top Bar */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "14px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span
                    className="badge badge-neutral mono"
                    style={{ fontSize: "11px", textTransform: "uppercase" }}
                  >
                    Seniority: {selectedJob.role_tier}
                  </span>
                  <span className="mono" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    <Calendar size={12} style={{ display: "inline", marginRight: "4px" }} />
                    Posted {new Date(selectedJob.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h2 style={{ fontSize: "22px", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                  {selectedJob.title}
                </h2>
              </div>

              {/* Direct Apply Action */}
              <div>
                {appliedJobs[selectedJob.id] ? (
                  <div
                    style={{
                      padding: "8px 18px",
                      borderRadius: "50px",
                      backgroundColor: "var(--status-approved-bg)",
                      color: "var(--status-approved-text)",
                      fontWeight: 700,
                      fontSize: "13px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      border: "1px solid var(--status-approved-border)",
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Application Submitted</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleApplyClick(selectedJob.id)}
                    className="btn btn-primary"
                    style={{
                      padding: "10px 22px",
                      fontSize: "13px",
                      borderRadius: "50px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Sparkles size={15} />
                    <span>Apply with My Profile</span>
                  </button>
                )}
              </div>
            </div>

            {/* Requisition Description */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
              <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "8px" }}>
                ROLE SPECIFICATION & RESPONSIBILITIES
              </span>
              <div
                style={{
                  fontSize: "14px",
                  lineHeight: "1.65",
                  color: "var(--text-primary)",
                  backgroundColor: "var(--bg-canvas)",
                  padding: "18px 20px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-subtle)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {selectedJob.description}
              </div>
            </div>

            {/* Profile Synergy & Next Steps Callout */}
            <div
              style={{
                padding: "18px 22px",
                borderRadius: "14px",
                backgroundColor: "var(--accent-purple-subtle)",
                border: "1px solid var(--accent-purple-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "14px",
              }}
            >
              <div>
                <h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: 700, color: "var(--accent-purple)" }}>
                  Need to update your resume or skills?
                </h4>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  Ensure your candidate dossier reflects your latest projects, skills, and accomplishments.
                </p>
              </div>

              <Link
                to="/portal"
                className="btn btn-primary"
                style={{
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12.5px",
                }}
              >
                <span>Go to Candidate Portal</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No Position Selected"
            description="Select an opening from the list to view requirements and submit your application."
          />
        )}
      </div>
    </div>
  );
};

export default CandidateJobsPage;
