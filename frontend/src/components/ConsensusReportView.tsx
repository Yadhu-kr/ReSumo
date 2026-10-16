import React from "react";
import type { CandidateScorecardSummary } from "../api/types";
import { Terminal, Users, Clock, Star } from "lucide-react";

interface ConsensusReportViewProps {
  scorecard: CandidateScorecardSummary | null;
  candidateName?: string | null;
  compact?: boolean;
}

export const ConsensusReportView: React.FC<ConsensusReportViewProps> = ({
  scorecard,
  candidateName,
  compact = false,
}) => {
  const totalEvals = scorecard?.total_evaluations || 0;
  const techScores = scorecard?.technical_scores || [];
  const hrScores = scorecard?.hr_scores || [];
  const techScore = scorecard?.technical_score ?? null;
  const hrScore = scorecard?.hr_score ?? null;

  const consensusPct = scorecard?.consensus_percentage ?? (
    totalEvals > 0 && scorecard?.average_score
      ? Math.round((scorecard.average_score / 5.0) * 100)
      : 0
  );

  const consensusBadge = scorecard?.consensus_badge || (
    totalEvals > 0 ? "EVALUATED" : "PENDING EVALUATION"
  );

  // SVG Circular Meter Calculations
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, consensusPct)) / 100) * circumference;

  const getMeterColor = (pct: number) => {
    if (pct >= 80) return "#10b981"; // emerald
    if (pct >= 65) return "#6366f1"; // indigo
    if (pct >= 40) return "#f59e0b"; // amber
    if (pct > 0) return "#ef4444";  // red
    return "#cbd5e1"; // slate
  };

  const getBadgeStyle = (badge: string) => {
    const b = badge.toLowerCase();
    if (b.includes("strong") || b.includes("unanimous") || b.includes("approved")) {
      return {
        bg: "rgba(16, 185, 129, 0.12)",
        text: "#065f46",
        border: "rgba(16, 185, 129, 0.3)",
      };
    }
    if (b.includes("consensus") || b.includes("aligned") || b.includes("hire")) {
      return {
        bg: "rgba(99, 102, 241, 0.12)",
        text: "#3730a3",
        border: "rgba(99, 102, 241, 0.3)",
      };
    }
    if (b.includes("only") || b.includes("partial")) {
      return {
        bg: "rgba(245, 158, 11, 0.12)",
        text: "#92400e",
        border: "rgba(245, 158, 11, 0.3)",
      };
    }
    return {
      bg: "rgba(148, 163, 184, 0.12)",
      text: "#475569",
      border: "rgba(148, 163, 184, 0.3)",
    };
  };

  const badgeStyle = getBadgeStyle(consensusBadge);

  const formatDimensionName = (dim: string) => {
    return dim
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? "16px" : "20px",
        backgroundColor: "#ffffff",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-subtle)",
        padding: compact ? "16px" : "22px",
        boxShadow: "var(--shadow-xs)",
      }}
    >
      {/* 1. Circular Consensual Report Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "18px",
          paddingBottom: "18px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          {/* Radial SVG Score Meter */}
          <div style={{ position: "relative", width: "94px", height: "94px", flexShrink: 0 }}>
            <svg width="94" height="94" viewBox="0 0 94 94" style={{ transform: "rotate(-90deg)" }}>
              {/* Background Track */}
              <circle
                cx="47"
                cy="47"
                r={radius}
                fill="transparent"
                stroke="#f1f5f9"
                strokeWidth="7"
              />
              {/* Animated Progress Arc */}
              <circle
                cx="47"
                cy="47"
                r={radius}
                fill="transparent"
                stroke={getMeterColor(consensusPct)}
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{
                  transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </svg>
            {/* Center Label */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  fontSize: totalEvals > 0 ? "18px" : "14px",
                  fontWeight: 800,
                  color: getMeterColor(consensusPct),
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {totalEvals > 0 ? `${consensusPct}%` : "—"}
              </span>
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.06em",
                  marginTop: "2px",
                }}
              >
                CONSENSUS
              </span>
            </div>
          </div>

          {/* Consensus Narrative & Status */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: "9999px",
                  backgroundColor: badgeStyle.bg,
                  color: badgeStyle.text,
                  border: `1px solid ${badgeStyle.border}`,
                }}
              >
                {consensusBadge}
              </span>
              {scorecard?.average_score && (
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Star size={14} color="#f59e0b" fill="#f59e0b" />
                  <span>{scorecard.average_score.toFixed(1)} / 5.0</span>
                </span>
              )}
            </div>

            <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
              {candidateName ? `${candidateName}'s Evaluative Consensus` : "Multi-Role Consensus Report"}
            </h4>

            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              {totalEvals === 0
                ? "No interview rubric submissions recorded yet. Awaiting Technical & HR evaluations."
                : techScore !== null && hrScore !== null
                ? `Dual consensus established across Technical (${techScore.toFixed(1)}/5) and HR (${hrScore.toFixed(1)}/5) panels.`
                : techScore !== null
                ? `Technical interview recorded (${techScore.toFixed(1)}/5). Awaiting HR interview sign-off.`
                : `HR interview recorded (${hrScore?.toFixed(1)}/5). Awaiting Technical interviewer rubric.`}
            </p>
          </div>
        </div>

        {/* Quick Metrics Badges */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "#f8fafc",
              border: "1px solid var(--border-subtle)",
              textAlign: "center",
              minWidth: "100px",
            }}
          >
            <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>
              TECHNICAL
            </span>
            <span style={{ fontSize: "14.5px", fontWeight: 700, color: techScore ? "var(--text-primary)" : "var(--text-muted)" }}>
              {techScore !== null ? `${techScore.toFixed(1)}★` : "Pending"}
            </span>
          </div>

          <div
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "#f8fafc",
              border: "1px solid var(--border-subtle)",
              textAlign: "center",
              minWidth: "100px",
            }}
          >
            <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>
              HR & CULTURE
            </span>
            <span style={{ fontSize: "14.5px", fontWeight: 700, color: hrScore ? "var(--text-primary)" : "var(--text-muted)" }}>
              {hrScore !== null ? `${hrScore.toFixed(1)}★` : "Pending"}
            </span>
          </div>

          <div
            style={{
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "#f8fafc",
              border: "1px solid var(--border-subtle)",
              textAlign: "center",
              minWidth: "100px",
            }}
          >
            <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>
              TOTAL SUBMISSIONS
            </span>
            <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--accent-purple)" }}>
              {totalEvals}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Side-by-Side Evaluation Reports */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "16px",
        }}
      >
        {/* Left Column: Technical Interview Report */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            borderRadius: "var(--radius-md)",
            border: techScore !== null ? "1.5px solid #c7d2fe" : "1px solid var(--border-subtle)",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(99, 102, 241, 0.12)",
                  color: "var(--accent-purple)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Terminal size={15} />
              </div>
              <div>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>
                  Technical Interview Dossier
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {techScores[0]?.interviewer_name
                    ? `Evaluated by ${techScores[0].interviewer_name}`
                    : "Technical Interviewer"}
                </span>
              </div>
            </div>

            {scorecard?.technical_consensus ? (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: scorecard.technical_consensus.includes("hire")
                    ? "var(--status-approved-bg)"
                    : "var(--status-rejected-bg)",
                  color: scorecard.technical_consensus.includes("hire")
                    ? "var(--status-approved-text)"
                    : "var(--status-rejected-text)",
                  textTransform: "uppercase",
                }}
              >
                {scorecard.technical_consensus.replace("_", " ")}
              </span>
            ) : (
              <span className="badge badge-neutral" style={{ fontSize: "10.5px" }}>PENDING</span>
            )}
          </div>

          {/* Technical Dimension Bars */}
          {scorecard?.technical_dimension_averages && Object.keys(scorecard.technical_dimension_averages).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(scorecard.technical_dimension_averages).map(([dim, score]) => (
                <div key={dim} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                      {formatDimensionName(dim)}
                    </span>
                    <span className="mono" style={{ fontWeight: 700, color: "#4f46e5" }}>
                      {score.toFixed(1)} / 5.0
                    </span>
                  </div>
                  <div style={{ height: "5px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${(score / 5.0) * 100}%`,
                        backgroundColor: "#6366f1",
                        borderRadius: "3px",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
              <Clock size={16} style={{ margin: "0 auto 6px", display: "block", color: "#94a3b8" }} />
              No technical rubric submitted yet. Run a session via Technical Interview Console.
            </div>
          )}

          {/* Technical Evaluator Observation Note */}
          {techScores.some((s) => s.notes) && (
            <div
              style={{
                marginTop: "auto",
                padding: "10px 12px",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                border: "1px solid var(--border-subtle)",
                fontSize: "12px",
                color: "var(--text-secondary)",
                fontStyle: "italic",
                lineHeight: 1.4,
              }}
            >
              "{techScores.find((s) => s.notes)?.notes}"
            </div>
          )}
        </div>

        {/* Right Column: HR & Behavioral Report */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            borderRadius: "var(--radius-md)",
            border: hrScore !== null ? "1.5px solid #a7f3d0" : "1px solid var(--border-subtle)",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  color: "#059669",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Users size={15} />
              </div>
              <div>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>
                  HR & People Evaluation
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {hrScores[0]?.interviewer_name
                    ? `Evaluated by ${hrScores[0].interviewer_name}`
                    : "HR Lead"}
                </span>
              </div>
            </div>

            {scorecard?.hr_consensus ? (
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: scorecard.hr_consensus.includes("hire")
                    ? "var(--status-approved-bg)"
                    : "var(--status-rejected-bg)",
                  color: scorecard.hr_consensus.includes("hire")
                    ? "var(--status-approved-text)"
                    : "var(--status-rejected-text)",
                  textTransform: "uppercase",
                }}
              >
                {scorecard.hr_consensus.replace("_", " ")}
              </span>
            ) : (
              <span className="badge badge-neutral" style={{ fontSize: "10.5px" }}>PENDING</span>
            )}
          </div>

          {/* HR Dimension Bars */}
          {scorecard?.hr_dimension_averages && Object.keys(scorecard.hr_dimension_averages).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(scorecard.hr_dimension_averages).map(([dim, score]) => (
                <div key={dim} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px" }}>
                    <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                      {formatDimensionName(dim)}
                    </span>
                    <span className="mono" style={{ fontWeight: 700, color: "#059669" }}>
                      {score.toFixed(1)} / 5.0
                    </span>
                  </div>
                  <div style={{ height: "5px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${(score / 5.0) * 100}%`,
                        backgroundColor: "#10b981",
                        borderRadius: "3px",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
              <Clock size={16} style={{ margin: "0 auto 6px", display: "block", color: "#94a3b8" }} />
              No HR behavioral rubric submitted yet. Conduct interview via Talent Pipeline.
            </div>
          )}

          {/* HR Evaluator Observation Note */}
          {hrScores.some((s) => s.notes) && (
            <div
              style={{
                marginTop: "auto",
                padding: "10px 12px",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                border: "1px solid var(--border-subtle)",
                fontSize: "12px",
                color: "var(--text-secondary)",
                fontStyle: "italic",
                lineHeight: 1.4,
              }}
            >
              "{hrScores.find((s) => s.notes)?.notes}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
