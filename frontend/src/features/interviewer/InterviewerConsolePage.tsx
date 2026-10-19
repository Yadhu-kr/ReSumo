import React, { useState, useEffect } from "react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type {
  Candidate,
  CandidateScorecardSummary,
  DimensionScoreIn,
  InterviewQuestionItem,
  InterviewRecommendation,
  InterviewRoundType,
  InterviewSchedule,
} from "../../api/types";
import { getUserDisplayName } from "../../lib/user";
import {
  Calendar,
  Clock,
  Video,
  Sparkles,
  CheckCircle2,
  Award,
  ChevronRight,
  Plus,
  Trash2,
  Terminal,
  FileCheck,
  RefreshCw,
} from "lucide-react";

const STANDARD_TECH_DIMENSIONS = [
  { key: "technical_depth", label: "Technical Depth & Core Foundations", desc: "Data structures, algorithms, runtime complexity, deep language knowledge" },
  { key: "system_design", label: "System Architecture & Scalability", desc: "High-scale trade-offs, caching, distributed consistency, fault tolerance" },
  { key: "problem_solving", label: "Problem Solving & Live Coding", desc: "Edge-case handling, speed of execution, algorithmic structuring" },
  { key: "code_quality", label: "Code Cleanliness & Patterns", desc: "Maintainability, testability, idiomatic code, error handling" },
  { key: "debugging_resilience", label: "Operational Resilience & Debugging", desc: "Root cause analysis, observability, profiling, recovery patterns" },
];

export const InterviewerConsolePage: React.FC = () => {
  const { user } = useAuth();

  // Candidates & Selection
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(true);

  // Tab State: "questions" | "scoreboard" | "calendar"
  const [activeTab, setActiveTab] = useState<"questions" | "scoreboard" | "calendar">("questions");

  // Schedules
  const [schedules, setSchedules] = useState<InterviewSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState<boolean>(false);
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [schedTitle, setSchedTitle] = useState<string>("Technical Architecture & Live Coding");
  const [schedRoundType, setSchedRoundType] = useState<string>("technical");
  const [schedDate, setSchedDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(14, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [schedDuration, setSchedDuration] = useState<number>(60);
  const [schedLink, setSchedLink] = useState<string>("https://meet.google.com/resumo-tech-eval");
  const [schedNotes, setSchedNotes] = useState<string>("");
  const [schedulingLoading, setSchedulingLoading] = useState<boolean>(false);
  const [schedMessage, setSchedMessage] = useState<string | null>(null);

  // AI Questions State
  const [roundType, setRoundType] = useState<InterviewRoundType>("technical");
  const [customFocus, setCustomFocus] = useState<string>("Distributed consensus, caching invalidation, and concurrency");
  const [questions, setQuestions] = useState<InterviewQuestionItem[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState<boolean>(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [askedQuestions, setAskedQuestions] = useState<Record<string, boolean>>({});
  const [newQuestionText, setNewQuestionText] = useState<string>("");
  const [newQuestionCategory, setNewQuestionCategory] = useState<string>("Architecture");

  // Scorecard Evaluation State
  const [scores, setScores] = useState<Record<string, number>>({
    technical_depth: 4.0,
    system_design: 4.0,
    problem_solving: 4.0,
    code_quality: 4.0,
    debugging_resilience: 4.0,
  });
  const [dimensionNotes, setDimensionNotes] = useState<Record<string, string>>({});
  const [overallRecommendation, setOverallRecommendation] = useState<InterviewRecommendation>("hire");
  const [overallNotes, setOverallNotes] = useState<string>("");
  const [submittingScorecard, setSubmittingScorecard] = useState<boolean>(false);
  const [scorecardSuccess, setScorecardSuccess] = useState<string | null>(null);
  const [scorecardError, setScorecardError] = useState<string | null>(null);
  const [scorecardSummary, setScorecardSummary] = useState<CandidateScorecardSummary | null>(null);

  // Load Candidates on Mount
  useEffect(() => {
    loadCandidates();
    loadMySchedules();
  }, []);

  // When candidate changes, load their scorecard and candidate-specific schedules
  useEffect(() => {
    if (selectedCandidateId) {
      loadCandidateDetail(selectedCandidateId);
      loadCandidateScorecard(selectedCandidateId);
    }
  }, [selectedCandidateId]);

  const loadCandidates = async () => {
    try {
      setLoadingCandidates(true);
      const list = await api.listCandidates();
      setCandidates(list);
      if (list.length > 0 && !selectedCandidateId) {
        setSelectedCandidateId(list[0].id);
      }
    } catch (err) {
      console.error("Failed to load candidates", err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const loadCandidateDetail = async (cid: string) => {
    try {
      const c = await api.getCandidate(cid);
      setCandidate(c);
    } catch (err) {
      console.error("Failed to fetch candidate details", err);
    }
  };

  const loadCandidateScorecard = async (cid: string) => {
    try {
      const summary = await api.getCandidateScorecard(cid);
      setScorecardSummary(summary);
    } catch {
      // Not evaluated yet
      setScorecardSummary(null);
    }
  };

  const loadMySchedules = async () => {
    try {
      setLoadingSchedules(true);
      const data = await api.getMySchedules();
      setSchedules(data);
    } catch (err) {
      console.error("Failed to load schedules", err);
    } finally {
      setLoadingSchedules(false);
    }
  };

  const handleGenerateQuestions = async (overrideRound?: InterviewRoundType) => {
    if (!selectedCandidateId) return;
    const roundToUse = overrideRound || roundType;
    if (overrideRound) {
      setRoundType(overrideRound);
    }
    try {
      setLoadingQuestions(true);
      setQuestionError(null);
      const res = await api.generateInterviewQuestions({
        candidate_id: selectedCandidateId,
        round_type: roundToUse,
        custom_focus: customFocus.trim() || undefined,
      });
      setQuestions(res.questions);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to generate AI questions";
      setQuestionError(msg);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleAddCustomQuestion = () => {
    if (!newQuestionText.trim()) return;
    const customItem: InterviewQuestionItem = {
      id: `custom-${Date.now()}`,
      category: newQuestionCategory,
      question: newQuestionText.trim(),
      what_to_look_for: "Candidate clarity, depth of explanation, handling edge cases.",
      suggested_dimension: "technical_depth",
      difficulty: "Advanced",
      rationale: "Interviewer custom focus question",
    };
    setQuestions((prev) => [customItem, ...prev]);
    setNewQuestionText("");
  };

  const handleDeleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const toggleAsked = (id: string) => {
    setAskedQuestions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId) return;

    try {
      setSchedulingLoading(true);
      setSchedMessage(null);
      await api.scheduleInterview({
        candidate_id: selectedCandidateId,
        title: schedTitle,
        round_type: schedRoundType,
        start_time: new Date(schedDate).toISOString(),
        duration_minutes: Number(schedDuration),
        meeting_link: schedLink.trim() || undefined,
        notes: schedNotes.trim() || undefined,
      });
      setSchedMessage("Interview schedule created! Calendar notification dispatched.");
      setShowScheduleModal(false);
      loadMySchedules();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to schedule interview round";
      setSchedMessage(`Error: ${msg}`);
    } finally {
      setSchedulingLoading(false);
    }
  };

  const handleSubmitScorecard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId) return;

    try {
      setSubmittingScorecard(true);
      setScorecardSuccess(null);
      setScorecardError(null);

      const dimensionsPayload: DimensionScoreIn[] = STANDARD_TECH_DIMENSIONS.map((dim) => ({
        dimension: dim.key,
        score: scores[dim.key] || 3.0,
        notes: dimensionNotes[dim.key] || undefined,
        interview_type: "technical",
      }));

      const summary = await api.submitInterviewScorecard({
        candidate_id: selectedCandidateId,
        interviewer_name: getUserDisplayName(user),
        interview_type: "technical",
        recommendation: overallRecommendation,
        overall_notes: overallNotes.trim() || undefined,
        dimensions: dimensionsPayload,
      });

      setScorecardSummary(summary);
      setScorecardSuccess("Technical scorecard successfully submitted and linked to Candidate Dossier!");
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to submit technical scorecard";
      setScorecardError(msg);
    } finally {
      setSubmittingScorecard(false);
    }
  };

  const parsed = candidate?.parsed_data;

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)",
          borderRadius: "var(--radius-lg)",
          padding: "24px 28px",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 10px 25px -5px rgba(30, 27, 75, 0.4)",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.15)",
                padding: "3px 10px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              <Terminal size={13} />
              Technical Interview Console
            </span>
            <span style={{ fontSize: "12px", opacity: 0.8 }}>
              Active Session: <strong>{getUserDisplayName(user)}</strong>
            </span>
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "8px 0 4px", letterSpacing: "-0.02em" }}>
            Real-Time Candidate Engineering Evaluation
          </h1>
          <p style={{ margin: 0, opacity: 0.85, fontSize: "14px", maxWidth: "600px", lineHeight: 1.5 }}>
            Synthesize candidate achievements, run AI-assisted architectural questioning, manage calendar schedule slots, and submit technical rubric scores directly into the hiring pipeline.
          </p>
        </div>

        {/* Quick Actions */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setShowScheduleModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "#ffffff",
              color: "#312e81",
              border: "none",
              borderRadius: "var(--radius-md)",
              padding: "10px 18px",
              fontWeight: 700,
              fontSize: "13.5px",
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              transition: "transform 0.1s ease",
            }}
          >
            <Calendar size={16} />
            <span>Schedule Technical Round</span>
          </button>
        </div>
      </div>

      {schedMessage && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "var(--radius-md)",
            backgroundColor: schedMessage.startsWith("Error") ? "#fef2f2" : "#f0fdf4",
            border: `1px solid ${schedMessage.startsWith("Error") ? "#fecaca" : "#bbf7d0"}`,
            color: schedMessage.startsWith("Error") ? "#991b1b" : "#166534",
            fontSize: "13.5px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} />
          <span>{schedMessage}</span>
        </div>
      )}

      {/* Main 2-Column Split: Left Candidate Selector & Schedules, Right Interactive Console */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "24px", alignItems: "start" }}>
        {/* Left Column: Candidates & Schedules */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Candidate Selection Card */}
          <div className="panel" style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                ASSIGNED CANDIDATES ({candidates.length})
              </span>
              <button
                type="button"
                onClick={loadCandidates}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                title="Refresh candidate list"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingCandidates ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                Loading candidates...
              </div>
            ) : candidates.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                No candidates available in talent pipeline.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
                {candidates.map((c) => {
                  const isSelected = c.id === selectedCandidateId;
                  const p = c.parsed_data;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCandidateId(c.id)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        padding: "12px 14px",
                        borderRadius: "var(--radius-md)",
                        border: isSelected ? "1.5px solid var(--accent-purple)" : "1px solid var(--border-subtle)",
                        backgroundColor: isSelected ? "var(--accent-purple-subtle)" : "var(--bg-surface)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "9999px",
                          background: isSelected ? "linear-gradient(135deg, #4338ca, #6366f1)" : "#f1f5f9",
                          color: isSelected ? "#ffffff" : "var(--text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "13px",
                          flexShrink: 0,
                        }}
                      >
                        {c.name ? c.name.slice(0, 2).toUpperCase() : "CD"}
                      </div>
                      <div style={{ overflow: "hidden", width: "100%" }}>
                        <div style={{ fontSize: "14px", fontWeight: isSelected ? 700 : 600, color: "var(--text-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c.name || p?.current_title || c.raw_resume_filename}
                          </span>
                          {isSelected && <ChevronRight size={14} color="var(--accent-purple)" />}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                          {p?.current_title || "Software Engineer"}
                        </div>
                        {p?.years_experience != null && (
                          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                            {p.years_experience}y exp • {p.seniority || "Senior"}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Calendar & Interview Schedule Sidebar */}
          <div className="panel" style={{ padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Calendar size={14} color="var(--accent-purple)" />
                <span className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                  INTERVIEW SCHEDULES ({schedules.length})
                </span>
              </div>
              <button
                type="button"
                onClick={loadMySchedules}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                title="Refresh calendar schedules"
              >
                <RefreshCw size={13} />
              </button>
            </div>

            {loadingSchedules ? (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                Loading schedule slots...
              </div>
            ) : schedules.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.4 }}>
                No active interview slots scheduled yet.
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(true)}
                  style={{
                    display: "block",
                    margin: "8px auto 0",
                    background: "none",
                    border: "none",
                    color: "var(--accent-purple)",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "12.5px",
                  }}
                >
                  + Add schedule slot
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "380px", overflowY: "auto" }}>
                {schedules.map((s) => {
                  const sDate = new Date(s.start_time);
                  const isCompleted = s.status === "completed";
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: "12px",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: "#f8fafc",
                        border: "1px solid var(--border-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {s.title}
                        </span>
                        <span
                          className={`badge ${isCompleted ? "badge-approved" : "badge-pending"}`}
                          style={{ fontSize: "10px", padding: "2px 6px", textTransform: "uppercase" }}
                        >
                          {s.status}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        <Clock size={12} />
                        <span>
                          {sDate.toLocaleDateString([], { month: "short", day: "numeric" })} at{" "}
                          {sDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ({s.duration_minutes}m)
                        </span>
                      </div>
                      {s.interviewer_name && (
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                          Interviewer: <strong>{s.interviewer_name}</strong>
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                        {s.meeting_link && (
                          <a
                            href={s.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: "11.5px",
                              color: "var(--accent-purple)",
                              textDecoration: "none",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Video size={12} />
                            Launch Video Link
                          </a>
                        )}
                        <a
                          href={api.getIcsDownloadUrl(s.id)}
                          style={{
                            fontSize: "11.5px",
                            color: "var(--text-secondary)",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          title="Download universal .ics calendar invite"
                        >
                          <Calendar size={12} />
                          .ics
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Candidate Dossier Snippet & Tabs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Active Candidate Header Card */}
          {candidate && (
            <div className="panel" style={{ padding: "18px 22px", borderLeft: "4px solid var(--accent-purple)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h2 style={{ fontSize: "18px", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                      {candidate.name || parsed?.current_title || candidate.raw_resume_filename}
                    </h2>
                    {parsed?.seniority && (
                      <span
                        style={{
                          backgroundColor: "var(--accent-purple-subtle)",
                          color: "var(--accent-purple)",
                          border: "1px solid var(--accent-purple-border)",
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        {parsed.seniority.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {parsed?.current_title || "Engineer"}{parsed?.current_company ? ` at ${parsed.current_company}` : ""}{parsed?.years_experience != null ? ` • ${parsed.years_experience} years experience` : ""}
                  </div>
                </div>

                {/* Scorecard Quick Metric Badge */}
                {scorecardSummary && (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono" style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>
                        TECHNICAL RATING
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)" }}>
                        {scorecardSummary.technical_score ? `${scorecardSummary.technical_score} / 5.0` : `${scorecardSummary.average_score} / 5.0`}
                      </div>
                    </div>
                    <span
                      className={`badge ${scorecardSummary.recommendation_consensus.includes("hire") ? "badge-approved" : "badge-neutral"}`}
                      style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "var(--radius-pill)" }}
                    >
                      {scorecardSummary.consensus_badge || scorecardSummary.recommendation_consensus.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Skills Tags */}
              {parsed?.core_skills && parsed.core_skills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "12px" }}>
                  {parsed.core_skills.map((skill, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: "11.5px",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        backgroundColor: "#f1f5f9",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Navigation Tabs */}
          <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "2px" }}>
            <button
              type="button"
              onClick={() => setActiveTab("questions")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: activeTab === "questions" ? 700 : 500,
                color: activeTab === "questions" ? "var(--accent-purple)" : "var(--text-secondary)",
                borderBottom: activeTab === "questions" ? "2px solid var(--accent-purple)" : "2px solid transparent",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Sparkles size={16} />
              <span>AI Dynamic Questions & Rubric</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("scoreboard")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: activeTab === "scoreboard" ? 700 : 500,
                color: activeTab === "scoreboard" ? "var(--accent-purple)" : "var(--text-secondary)",
                borderBottom: activeTab === "scoreboard" ? "2px solid var(--accent-purple)" : "2px solid transparent",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Award size={16} />
              <span>Technical Scoreboard & Submission</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("calendar")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: activeTab === "calendar" ? 700 : 500,
                color: activeTab === "calendar" ? "var(--accent-purple)" : "var(--text-secondary)",
                borderBottom: activeTab === "calendar" ? "2px solid var(--accent-purple)" : "2px solid transparent",
                background: "none",
                borderTop: "none",
                borderLeft: "none",
                borderRight: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <Calendar size={16} />
              <span>Interview Calendar & Slots</span>
            </button>
          </div>

          {/* Tab 1: AI Questions & Dynamic Rubric */}
          {activeTab === "questions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              {/* Question Generator Controls Panel */}
              <div className="panel" style={{ padding: "18px 20px" }}>
                <div style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                  AI Tailored Interview Question Generator
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.5 }}>
                  Synthesizes candidate experience with targeted architectural challenges. Specify your custom technical domain focus below.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: "10px", alignItems: "end" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }} className="mono">
                      ROUND TYPE
                    </label>
                    <select
                      value={roundType}
                      onChange={(e) => setRoundType(e.target.value as InterviewRoundType)}
                      style={{
                        height: "36px",
                        fontSize: "13px",
                        padding: "0 10px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "#ffffff",
                        width: "100%",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="technical">Technical Depth & Coding</option>
                      <option value="system_design">System Architecture & Scaling</option>
                      <option value="behavioral">Behavioral & Culture</option>
                      <option value="screening">Initial Screening</option>
                      <option value="executive">Executive & Leadership</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }} className="mono">
                      CUSTOM TECHNICAL FOCUS
                    </label>
                    <input
                      type="text"
                      style={{
                        height: "36px",
                        fontSize: "13px",
                        padding: "0 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "#ffffff",
                        width: "100%",
                        color: "var(--text-primary)",
                      }}
                      value={customFocus}
                      onChange={(e) => setCustomFocus(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleGenerateQuestions();
                        }
                      }}
                      placeholder="e.g. Distributed caching, Raft consensus, Go concurrency..."
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleGenerateQuestions()}
                    disabled={loadingQuestions || !selectedCandidateId}
                    className="btn btn-purple"
                    style={{
                      height: "36px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "0 14px",
                      fontSize: "12.5px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Sparkles size={14} />
                    <span>{loadingQuestions ? "Generating..." : "Generate Questions"}</span>
                  </button>
                </div>

                {questionError && (
                  <div style={{ marginTop: "12px", padding: "10px", borderRadius: "var(--radius-sm)", backgroundColor: "#fef2f2", color: "#b91c1c", fontSize: "13px" }}>
                    {questionError}
                  </div>
                )}
              </div>

              {/* Add Custom Question Form */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  backgroundColor: "#ffffff",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  border: "1px dashed var(--border-subtle)",
                }}
              >
                <input
                  type="text"
                  placeholder="Have a custom technical problem to evaluate? Type here..."
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddCustomQuestion();
                  }}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    fontSize: "13.5px",
                    color: "var(--text-primary)",
                  }}
                />
                <select
                  value={newQuestionCategory}
                  onChange={(e) => setNewQuestionCategory(e.target.value)}
                  style={{ fontSize: "12.5px", padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border-subtle)" }}
                >
                  <option value="Coding">Coding</option>
                  <option value="Architecture">Architecture</option>
                  <option value="Concurrency">Concurrency</option>
                  <option value="Databases">Databases</option>
                  <option value="System Resilience">System Resilience</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddCustomQuestion}
                  disabled={!newQuestionText.trim()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor: "var(--accent-purple)",
                    color: "#ffffff",
                    border: "none",
                    padding: "6px 14px",
                    borderRadius: "4px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: newQuestionText.trim() ? "pointer" : "not-allowed",
                    opacity: newQuestionText.trim() ? 1 : 0.6,
                  }}
                >
                  <Plus size={14} />
                  <span>Add</span>
                </button>
              </div>

              {/* Generated Questions List */}
              {loadingQuestions ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                  Generating personalized interview questions using candidate accomplishments...
                </div>
              ) : questions.length === 0 ? (
                <div className="panel" style={{ padding: "36px", textAlign: "center", color: "var(--text-muted)" }}>
                  <Sparkles size={28} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                    No Questions Generated Yet
                  </div>
                  <div style={{ fontSize: "13px", maxWidth: "440px", margin: "0 auto 16px" }}>
                    Click &quot;Generate Questions&quot; above to produce AI-tailored questions and evaluation rubrics based on this candidate&apos;s background.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => handleGenerateQuestions()}
                      disabled={loadingQuestions || !selectedCandidateId}
                      className="btn btn-purple"
                      style={{
                        height: "36px",
                        padding: "0 16px",
                        fontSize: "12.5px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        margin: "0 auto",
                      }}
                    >
                      <Sparkles size={14} />
                      <span>{loadingQuestions ? "Generating..." : "Generate AI Questions"}</span>
                    </button>

                    <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                      <button
                        type="button"
                        onClick={() => handleGenerateQuestions("technical")}
                        disabled={loadingQuestions || !selectedCandidateId}
                        className="btn btn-secondary btn-sm"
                        style={{ height: "30px", padding: "0 10px", fontSize: "11.5px" }}
                      >
                        ⚡ Technical Depth
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenerateQuestions("system_design")}
                        disabled={loadingQuestions || !selectedCandidateId}
                        className="btn btn-secondary btn-sm"
                        style={{ height: "30px", padding: "0 10px", fontSize: "11.5px" }}
                      >
                        🏗️ System Design
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenerateQuestions("behavioral")}
                        disabled={loadingQuestions || !selectedCandidateId}
                        className="btn btn-secondary btn-sm"
                        style={{ height: "30px", padding: "0 10px", fontSize: "11.5px" }}
                      >
                        🤝 Behavioral & Culture
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {questions.map((q, idx) => {
                    const isAsked = !!askedQuestions[q.id];
                    return (
                      <div
                        key={q.id || idx}
                        className="panel"
                        style={{
                          padding: "16px 20px",
                          borderLeft: `4px solid ${isAsked ? "#10b981" : "var(--accent-purple)"}`,
                          opacity: isAsked ? 0.75 : 1,
                          transition: "opacity 0.2s ease",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                backgroundColor: "var(--accent-purple-subtle)",
                                color: "var(--accent-purple)",
                                textTransform: "uppercase",
                              }}
                            >
                              {q.category}
                            </span>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: "4px",
                                backgroundColor: q.difficulty === "Advanced" ? "#fef3c7" : "#ecfdf5",
                                color: q.difficulty === "Advanced" ? "#b45309" : "#047857",
                              }}
                            >
                              {q.difficulty}
                            </span>
                            <span className="mono text-muted" style={{ fontSize: "11px" }}>
                              Suggested: {q.suggested_dimension.replace("_", " ")}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() => toggleAsked(q.id)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "4px 10px",
                                borderRadius: "4px",
                                border: isAsked ? "1px solid #10b981" : "1px solid var(--border-subtle)",
                                backgroundColor: isAsked ? "#ecfdf5" : "transparent",
                                color: isAsked ? "#047857" : "var(--text-secondary)",
                                fontSize: "11.5px",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              <CheckCircle2 size={13} />
                              <span>{isAsked ? "Asked" : "Mark Asked"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q.id)}
                              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                              title="Remove Question"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Question Text */}
                        <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", margin: "10px 0 8px", lineHeight: 1.5 }}>
                          {q.question}
                        </div>

                        {/* Rubric: What to Look For */}
                        <div
                          style={{
                            backgroundColor: "#f8fafc",
                            padding: "10px 14px",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "12.5px",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <strong style={{ color: "var(--text-primary)" }}>What to Look For: </strong>
                          {q.what_to_look_for}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Technical Scoreboard & Submission Form */}
          {activeTab === "scoreboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <form onSubmit={handleSubmitScorecard} className="panel" style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 4px", color: "var(--text-primary)" }}>
                    Submit Technical Evaluation Scorecard
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
                    Evaluate candidate engineering competencies. Each rating is saved under the <strong>Technical Interview</strong> stream for side-by-side consensus analysis.
                  </p>
                </div>

                {scorecardSuccess && (
                  <div style={{ padding: "12px", borderRadius: "var(--radius-sm)", backgroundColor: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", fontSize: "13.5px" }}>
                    {scorecardSuccess}
                  </div>
                )}
                {scorecardError && (
                  <div style={{ padding: "12px", borderRadius: "var(--radius-sm)", backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontSize: "13.5px" }}>
                    {scorecardError}
                  </div>
                )}

                {/* Rubric Dimensions Grid */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {STANDARD_TECH_DIMENSIONS.map((dim) => {
                    const currentScore = scores[dim.key] || 3.0;
                    return (
                      <div
                        key={dim.key}
                        style={{
                          backgroundColor: "#f8fafc",
                          padding: "16px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-subtle)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                              {dim.label}
                            </span>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                              {dim.desc}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {[1, 2, 3, 4, 5].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setScores((prev) => ({ ...prev, [dim.key]: val }))}
                                style={{
                                  width: "34px",
                                  height: "34px",
                                  borderRadius: "6px",
                                  border: currentScore === val ? "2px solid var(--accent-purple)" : "1px solid var(--border-subtle)",
                                  backgroundColor: currentScore === val ? "var(--accent-purple)" : "#ffffff",
                                  color: currentScore === val ? "#ffffff" : "var(--text-primary)",
                                  fontWeight: 700,
                                  fontSize: "13px",
                                  cursor: "pointer",
                                  transition: "all 0.1s ease",
                                }}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>

                        <input
                          type="text"
                          placeholder={`Dimension notes: Specific code observations or architectural trade-offs...`}
                          value={dimensionNotes[dim.key] || ""}
                          onChange={(e) => setDimensionNotes({ ...dimensionNotes, [dim.key]: e.target.value })}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-subtle)",
                            fontSize: "12.5px",
                            backgroundColor: "#ffffff",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Overall Recommendation Selector */}
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                    Overall Technical Recommendation
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                    {[
                      { key: "strong_hire", label: "Strong Hire", color: "#047857", bg: "#ecfdf5" },
                      { key: "hire", label: "Hire", color: "#059669", bg: "#f0fdf4" },
                      { key: "lean_hire", label: "Lean Hire", color: "#d97706", bg: "#fffbeb" },
                      { key: "lean_no_hire", label: "Lean No Hire", color: "#ea580c", bg: "#fff7ed" },
                      { key: "no_hire", label: "No Hire", color: "#dc2626", bg: "#fef2f2" },
                    ].map((opt) => {
                      const isSelected = overallRecommendation === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setOverallRecommendation(opt.key as InterviewRecommendation)}
                          style={{
                            padding: "10px",
                            borderRadius: "var(--radius-md)",
                            border: isSelected ? `2px solid ${opt.color}` : "1px solid var(--border-subtle)",
                            backgroundColor: isSelected ? opt.bg : "#ffffff",
                            color: isSelected ? opt.color : "var(--text-secondary)",
                            fontWeight: isSelected ? 800 : 600,
                            fontSize: "13px",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Overall Evaluation Notes */}
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
                    Detailed Technical Synthesis & Feedback
                  </label>
                  <textarea
                    rows={4}
                    value={overallNotes}
                    onChange={(e) => setOverallNotes(e.target.value)}
                    placeholder="Provide a technical summary of the candidate's coding demonstration, architectural justifications, depth of reasoning, and areas of growth..."
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "13px",
                      lineHeight: 1.5,
                      fontFamily: "inherit",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    disabled={submittingScorecard}
                    className="btn btn-primary"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "38px", padding: "0 18px", fontSize: "13px" }}
                  >
                    <FileCheck size={16} />
                    <span>{submittingScorecard ? "Submitting Evaluation..." : "Submit Technical Scorecard"}</span>
                  </button>
                </div>
              </form>

              {/* Scoreboard Breakdown Card */}
              {scorecardSummary && (
                <div className="panel" style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h4 style={{ fontSize: "15px", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                      Live Candidate Scoreboard
                    </h4>
                    <span className="mono" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Evaluations: {scorecardSummary.total_evaluations}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                    {Object.entries(scorecardSummary.dimension_averages).map(([dim, avg]) => (
                      <div key={dim} style={{ backgroundColor: "#f8fafc", padding: "12px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", textTransform: "capitalize" }}>
                          {dim.replace("_", " ")}
                        </div>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>
                          {avg.toFixed(1)} <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)" }}>/ 5.0</span>
                        </div>
                        <div style={{ width: "100%", height: "4px", backgroundColor: "#e2e8f0", borderRadius: "9999px", marginTop: "6px", overflow: "hidden" }}>
                          <div style={{ width: `${(avg / 5.0) * 100}%`, height: "100%", backgroundColor: "var(--accent-purple)", borderRadius: "9999px" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Calendar & Schedule Slots */}
          {activeTab === "calendar" && (
            <div className="panel" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 4px", color: "var(--text-primary)" }}>
                    Integrated Technical Interview Calendar
                  </h3>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
                    Coordinate slots with candidates, launch virtual meeting rooms, and dispatch calendar invites.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(true)}
                  className="btn btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", fontSize: "12.5px" }}
                >
                  <Plus size={14} />
                  <span>Schedule Slot</span>
                </button>
              </div>

              {schedules.length === 0 ? (
                <div style={{ padding: "36px", textAlign: "center", color: "var(--text-muted)", fontSize: "13.5px" }}>
                  No interview sessions currently scheduled. Click &quot;Schedule Slot&quot; to coordinate an interview.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {schedules.map((s) => {
                    const sDate = new Date(s.start_time);
                    return (
                      <div
                        key={s.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "16px 18px",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-subtle)",
                          backgroundColor: "#f8fafc",
                          flexWrap: "wrap",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                            {s.title}
                          </div>
                          <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                            {sDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })} at{" "}
                            {sDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ({s.duration_minutes} mins)
                          </div>
                          {s.notes && (
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                              Note: {s.notes}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {s.meeting_link && (
                            <a
                              href={s.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", fontSize: "12px", textDecoration: "none" }}
                            >
                              <Video size={13} />
                              <span>Join Call</span>
                            </a>
                          )}
                          <a
                            href={api.getIcsDownloadUrl(s.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", fontSize: "12px", textDecoration: "none" }}
                          >
                            <Calendar size={13} />
                            <span>Download .ics</span>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Schedule Technical Interview */}
      {showScheduleModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            className="panel"
            style={{
              width: "100%",
              maxWidth: "520px",
              padding: "24px 28px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--text-primary)" }}>
                Schedule Technical Interview Round
              </h3>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Round Title
                </label>
                <input
                  type="text"
                  required
                  className="as-input"
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Round Type
                  </label>
                  <select
                    value={schedRoundType}
                    onChange={(e) => setSchedRoundType(e.target.value)}
                    className="as-input"
                  >
                    <option value="technical">Technical Architecture & Coding</option>
                    <option value="system_design">System Design</option>
                    <option value="behavioral">Culture Alignment</option>
                    <option value="screening">Screening</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={180}
                    step={15}
                    className="as-input"
                    value={schedDuration}
                    onChange={(e) => setSchedDuration(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Start Date & Time
                </label>
                <input
                  type="datetime-local"
                  required
                  className="as-input"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Virtual Video Meeting Link
                </label>
                <input
                  type="url"
                  className="as-input"
                  value={schedLink}
                  onChange={(e) => setSchedLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px" }}>
                  Notes for Candidate & Team
                </label>
                <textarea
                  rows={2}
                  className="as-input"
                  style={{ height: "auto", padding: "8px 12px" }}
                  value={schedNotes}
                  onChange={(e) => setSchedNotes(e.target.value)}
                  placeholder="Focus areas: data pipelines, distributed transactions..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="btn btn-secondary"
                  style={{ height: "36px", padding: "0 14px", fontSize: "13px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedulingLoading}
                  className="btn btn-primary"
                  style={{ height: "36px", padding: "0 16px", fontSize: "13px" }}
                >
                  {schedulingLoading ? "Scheduling..." : "Confirm & Send Invites"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewerConsolePage;
