import React, { useEffect, useState } from "react";
import { useParams, Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import type {
  Candidate,
  Job,
  Approval,
  Application,
  CandidateStatus,
  Offer,
  CandidateScorecardSummary,
  InterviewScorecardCreate,
  OnboardingSummary,
  InterviewSchedule,
  InterviewScheduleCreate,
  CandidateNote,
  TimelineEvent,
  InterviewRoundType,
  InterviewQuestionItem,
  GenerateInterviewQuestionsResponse,
} from "../../api/types";
import { StatusBadge } from "../../components/StatusBadge";
import { EscalationTracker } from "../../components/EscalationTracker";
import { EmptyState } from "../../components/EmptyState";
import { ConsensusReportView } from "../../components/ConsensusReportView";
import { useAuth } from "../../context/AuthContext";
import {
  Gift,
  Send,
  Download,
  CheckCircle,
  Clock,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Star,
  ClipboardList,
  ShieldCheck,
  Calendar,
  Video,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  History,
  MessageSquarePlus,
  FileText,
  Copy,
  Check,
  Trash2,
  BookOpen,
  PlusCircle,
} from "lucide-react";

interface OutletContextType {
  refreshPendingCount?: () => void;
}

export const CandidateDossierPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { refreshPendingCount } = useOutletContext<OutletContextType>();
  const { user } = useAuth();
  const isHRorAdmin = user?.role === "hr" || user?.role === "admin";

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [activeOffer, setActiveOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tab: 'extracted' vs 'raw_text' vs 'scorecard' vs 'calendar' vs 'offer' vs 'onboarding' vs 'timeline'
  const [activeTab, setActiveTab] = useState<"extracted" | "raw" | "scorecard" | "calendar" | "offer" | "onboarding" | "timeline">("extracted");

  // Timeline & Collaboration Notes state
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState<string>("");
  const [postingNote, setPostingNote] = useState<boolean>(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Executive Hiring Packet state
  const [hiringPacketModalOpen, setHiringPacketModalOpen] = useState<boolean>(false);
  const [hiringPacketMarkdown, setHiringPacketMarkdown] = useState<string>("");
  const [loadingPacket, setLoadingPacket] = useState<boolean>(false);
  const [copiedPacket, setCopiedPacket] = useState<boolean>(false);

  // Interview Calendar state
  const [schedules, setSchedules] = useState<InterviewSchedule[]>([]);
  const [scheduling, setScheduling] = useState<boolean>(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<{
    title: string;
    round_type: string;
    start_time: string;
    duration_minutes: number;
    interviewer_name: string;
    meeting_link: string;
    notes: string;
  }>({
    title: "Technical Architecture & Coding Interview",
    round_type: "technical",
    start_time: "",
    duration_minutes: 45,
    interviewer_name: "",
    meeting_link: "https://meet.google.com/resumo-interview",
    notes: "Focus on system design fundamentals, algorithms, and microservice resilience.",
  });

  // Scorecard state
  const [scorecard, setScorecard] = useState<CandidateScorecardSummary | null>(null);
  const [submittingScorecard, setSubmittingScorecard] = useState<boolean>(false);
  const [scorecardError, setScorecardError] = useState<string | null>(null);
  const [scorecardSuccess, setScorecardSuccess] = useState<string | null>(null);
  const [scorecardForm, setScorecardForm] = useState<{
    interviewer_name: string;
    interview_type: "hr" | "technical";
    recommendation: "strong_hire" | "hire" | "lean_hire" | "lean_no_hire" | "no_hire";
    overall_notes: string;
    technical_depth: number;
    system_design: number;
    communication: number;
    cultural_alignment: number;
    role_fit: number;
  }>({
    interviewer_name: "",
    interview_type: "hr",
    recommendation: "hire",
    overall_notes: "",
    technical_depth: 4.0,
    system_design: 4.0,
    communication: 4.0,
    cultural_alignment: 4.0,
    role_fit: 4.0,
  });

  // Dynamic AI Interview Questions State
  const [questionRoundType, setQuestionRoundType] = useState<InterviewRoundType>("technical");
  const [customFocus, setCustomFocus] = useState<string>("");
  const [generatingQuestions, setGeneratingQuestions] = useState<boolean>(false);
  const [questionsResult, setQuestionsResult] = useState<GenerateInterviewQuestionsResponse | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const [insertedQuestionId, setInsertedQuestionId] = useState<string | null>(null);

  // Onboarding state
  const [onboarding, setOnboarding] = useState<OnboardingSummary | null>(null);
  const [verifyingTaskId, setVerifyingTaskId] = useState<string | null>(null);

  // Offer Generation Form
  const [offerForm, setOfferForm] = useState<{
    role_title: string;
    salary: number;
    currency: string;
    start_date: string;
    equity: string;
    notes: string;
  }>({
    role_title: "",
    salary: 145000,
    currency: "USD",
    start_date: "",
    equity: "0.25% equity options (4-year vesting, 1-year cliff)",
    notes: "Includes comprehensive health, dental, vision, 401(k) matching, and annual learning stipend.",
  });
  const [generatingOffer, setGeneratingOffer] = useState<boolean>(false);
  const [sendingOffer, setSendingOffer] = useState<boolean>(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [offerSuccess, setOfferSuccess] = useState<string | null>(null);

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
          setOfferForm((prev) => ({
            ...prev,
            role_title: prev.role_title || j.title,
          }));
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

      // Load offers
      try {
        const candOffers = await api.getCandidateOffers(id);
        setOffers(candOffers);
        if (candOffers.length > 0) {
          setActiveOffer(candOffers[0]);
          setOfferForm({
            role_title: candOffers[0].role_title || "",
            salary: candOffers[0].salary || 145000,
            currency: candOffers[0].currency || "USD",
            start_date: candOffers[0].start_date || "",
            equity: candOffers[0].equity || "",
            notes: "",
          });
        }
      } catch {
        // Offers endpoint fallback
      }

      // Load interview scorecard
      try {
        const sc = await api.getCandidateScorecard(id);
        setScorecard(sc);
      } catch {
        // Scorecard fallback
      }

      // Load interview schedules
      try {
        const candScheds = await api.getCandidateSchedules(id);
        setSchedules(candScheds);
      } catch {
        // Calendar fallback
      }

      // Load onboarding tasks
      try {
        const onb = await api.getCandidateOnboarding(id);
        setOnboarding(onb);
      } catch {
        // Onboarding fallback
      }

      // Load timeline & collaboration notes
      try {
        const tl = await api.getCandidateTimeline(id);
        setTimelineEvents(tl.events);
        setNotes(tl.notes);
      } catch {
        // Timeline fallback
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to load candidate dossier";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !newNoteContent.trim()) return;
    try {
      setPostingNote(true);
      setNoteError(null);
      const created = await api.addCandidateNote(id, newNoteContent.trim());
      setNotes((prev) => [created, ...prev]);
      setNewNoteContent("");
      // Refresh timeline events
      const tl = await api.getCandidateTimeline(id);
      setTimelineEvents(tl.events);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to post note";
      setNoteError(msg);
    } finally {
      setPostingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!id) return;
    try {
      await api.deleteCandidateNote(id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setTimelineEvents((prev) => prev.filter((e) => e.metadata?.note_id !== noteId));
    } catch (err: unknown) {
      console.error("Failed to delete note", err);
    }
  };

  const handleOpenHiringPacket = async () => {
    if (!id) return;
    try {
      setLoadingPacket(true);
      setCopiedPacket(false);
      const packet = await api.getHiringPacket(id);
      setHiringPacketMarkdown(packet.markdown);
      setHiringPacketModalOpen(true);
    } catch (err: unknown) {
      console.error("Failed to fetch hiring packet", err);
    } finally {
      setLoadingPacket(false);
    }
  };

  const handleCopyHiringPacket = () => {
    if (hiringPacketMarkdown) {
      navigator.clipboard.writeText(hiringPacketMarkdown);
      setCopiedPacket(true);
      setTimeout(() => setCopiedPacket(false), 2500);
    }
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      setScheduling(true);
      setScheduleError(null);
      setScheduleSuccess(null);
      const activeApp = applications[0];
      const payload: InterviewScheduleCreate = {
        candidate_id: id,
        application_id: activeApp?.id,
        title: scheduleForm.title,
        round_type: scheduleForm.round_type,
        start_time: scheduleForm.start_time || new Date(Date.now() + 86400000 * 2).toISOString(),
        duration_minutes: Number(scheduleForm.duration_minutes) || 45,
        interviewer_name: scheduleForm.interviewer_name || undefined,
        meeting_link: scheduleForm.meeting_link || undefined,
        notes: scheduleForm.notes || undefined,
      };
      await api.scheduleInterview(payload);
      setScheduleSuccess("Interview scheduled successfully! Universal .ics calendar invites and email notifications dispatched.");
      const updatedScheds = await api.getCandidateSchedules(id);
      setSchedules(updatedScheds);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to schedule interview";
      setScheduleError(msg);
    } finally {
      setScheduling(false);
    }
  };

  const handleUpdateScheduleStatus = async (schedId: string, status: "completed" | "cancelled") => {
    try {
      await api.updateSchedule(schedId, { status });
      if (id) {
        const updatedScheds = await api.getCandidateSchedules(id);
        setSchedules(updatedScheds);
      }
    } catch (err: unknown) {
      console.error("Failed to update interview schedule status:", err);
    }
  };

  useEffect(() => {
    loadCandidateDetails();
  }, [id]);

  const handleSubmitScorecard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    try {
      setSubmittingScorecard(true);
      setScorecardError(null);
      setScorecardSuccess(null);
      const activeApp = applications.length > 0 ? applications[0] : undefined;
      const payload: InterviewScorecardCreate = {
        candidate_id: id,
        application_id: activeApp?.id,
        interviewer_name: scorecardForm.interviewer_name || undefined,
        interview_type: scorecardForm.interview_type,
        recommendation: scorecardForm.recommendation,
        overall_notes: scorecardForm.overall_notes || undefined,
        dimensions: [
          { dimension: "technical_depth", score: Number(scorecardForm.technical_depth), interview_type: scorecardForm.interview_type },
          { dimension: "system_design", score: Number(scorecardForm.system_design), interview_type: scorecardForm.interview_type },
          { dimension: "communication", score: Number(scorecardForm.communication), interview_type: scorecardForm.interview_type },
          { dimension: "cultural_alignment", score: Number(scorecardForm.cultural_alignment), interview_type: scorecardForm.interview_type },
          { dimension: "role_fit", score: Number(scorecardForm.role_fit), interview_type: scorecardForm.interview_type },
        ],
      };
      const updated = await api.submitInterviewScorecard(payload);
      setScorecard(updated);
      setScorecardSuccess("Interview rubric scorecard recorded successfully!");
    } catch (err: unknown) {
      setScorecardError(err instanceof ApiError ? err.detail : "Failed to record interview scorecard");
    } finally {
      setSubmittingScorecard(false);
    }
  };

  const handleGenerateQuestions = async (round?: InterviewRoundType) => {
    if (!id) return;
    const roundToUse = round || questionRoundType;
    if (round) {
      setQuestionRoundType(round);
    }
    try {
      setGeneratingQuestions(true);
      setQuestionError(null);
      const res = await api.generateInterviewQuestions({
        candidate_id: id,
        job_id: job?.id || candidate?.job_id || undefined,
        round_type: roundToUse,
        custom_focus: customFocus.trim() || undefined,
      });
      setQuestionsResult(res);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to generate interview questions. Please try again.";
      setQuestionError(msg);
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleCopyQuestion = (q: InterviewQuestionItem) => {
    const text = `${q.question}\n\n[What to Look For in Candidate Answers]:\n${q.what_to_look_for}`;
    navigator.clipboard.writeText(text);
    setCopiedQuestionId(q.id);
    setTimeout(() => setCopiedQuestionId(null), 2000);
  };

  const handleInsertQuestionIntoNotes = (q: InterviewQuestionItem) => {
    const rubricLabel = q.suggested_dimension.replace("_", " ").toUpperCase();
    const formatted = `[${q.category.toUpperCase()} • RUBRIC: ${rubricLabel}]\nQ: ${q.question}\nRubric Evaluation Guide: ${q.what_to_look_for}\n\nCandidate Response & Observations:\n- `;
    setScorecardForm((prev) => ({
      ...prev,
      overall_notes: prev.overall_notes ? `${prev.overall_notes.trim()}\n\n${formatted}` : formatted,
    }));
    setInsertedQuestionId(q.id);
    setTimeout(() => setInsertedQuestionId(null), 2500);
  };

  const handleVerifyOnboardingTask = async (taskId: string) => {
    try {
      setVerifyingTaskId(taskId);
      const updatedTask = await api.verifyOnboardingTask(taskId);
      if (onboarding) {
        const nextTasks = onboarding.tasks.map((t) => (t.id === taskId ? updatedTask : t));
        const comp = nextTasks.filter((t) => t.status === "completed" || t.status === "verified").length;
        const ver = nextTasks.filter((t) => t.status === "verified").length;
        setOnboarding({
          ...onboarding,
          tasks: nextTasks,
          completed_tasks: comp,
          verified_tasks: ver,
          progress_percentage: nextTasks.length > 0 ? Math.round((comp / nextTasks.length) * 100) : 0,
          is_complete: nextTasks.length > 0 && comp === nextTasks.length,
        });
      }
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.detail : "Failed to verify onboarding task");
    } finally {
      setVerifyingTaskId(null);
    }
  };

  const handleGenerateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeApp = applications[0];
    if (!activeApp) {
      setOfferError("Candidate must have an active job application before generating an offer.");
      return;
    }
    if (!offerForm.role_title.trim()) {
      setOfferError("Role title is required.");
      return;
    }
    if (!offerForm.salary || offerForm.salary <= 0) {
      setOfferError("Valid salary amount is required.");
      return;
    }

    try {
      setGeneratingOffer(true);
      setOfferError(null);
      setOfferSuccess(null);
      const targetStartDate = offerForm.start_date || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
      const generated = await api.generateOffer({
        application_id: activeApp.id,
        role_title: offerForm.role_title,
        salary: Number(offerForm.salary),
        currency: offerForm.currency,
        start_date: targetStartDate,
        equity: offerForm.equity || undefined,
        notes: offerForm.notes || undefined,
      });
      setActiveOffer(generated);
      setOffers((prev) => [generated, ...prev.filter((o) => o.id !== generated.id)]);
      setOfferSuccess("Draft offer letter generated! Review the formal letter below and send when ready.");
      setActiveTab("offer");
      await loadCandidateDetails();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to generate offer letter";
      setOfferError(msg);
    } finally {
      setGeneratingOffer(false);
    }
  };

  const handleSendOffer = async (offerId: string) => {
    try {
      setSendingOffer(true);
      setOfferError(null);
      setOfferSuccess(null);
      const sent = await api.sendOffer(offerId);
      setActiveOffer(sent);
      setOffers((prev) => prev.map((o) => (o.id === offerId ? sent : o)));
      setOfferSuccess("Offer successfully sent to candidate! They can now review and accept it in their portal.");
      await loadCandidateDetails();
      if (refreshPendingCount) refreshPendingCount();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : "Failed to send offer";
      setOfferError(msg);
    } finally {
      setSendingOffer(false);
    }
  };

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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ marginBottom: "8px" }}>
            <Link to="/" className="text-secondary" style={{ fontSize: "13px", fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              ← Back to Pipeline Dashboard
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "26px", fontWeight: 800, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              {candidate.name || parsed?.current_title || candidate.raw_resume_filename}
            </h1>
            <StatusBadge status={effectiveStatus} />
          </div>

          <div className="mono" style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
            ID: {candidate.id.slice(0, 8)}... • Ingested: {new Date(candidate.created_at).toLocaleDateString()} • File: {candidate.raw_resume_filename}
          </div>

          {/* Candidate Extracted Contact Info */}
          <div style={{ display: "flex", alignItems: "center", gap: "20px", marginTop: "10px", flexWrap: "wrap" }}>
            {candidate.email && (
              <span style={{ fontSize: "13px", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Mail size={15} color="var(--accent-purple)" />
                <a href={`mailto:${candidate.email}`} style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: 600 }}>
                  {candidate.email}
                </a>
              </span>
            )}
            {candidate.phone && (
              <span style={{ fontSize: "13px", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Phone size={15} color="#059669" />
                <a href={`tel:${candidate.phone}`} style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: 600 }}>
                  {candidate.phone}
                </a>
              </span>
            )}
            {candidate.parsed_data?.location && (
              <span style={{ fontSize: "13px", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <MapPin size={15} color="#d97706" />
                <span style={{ fontWeight: 500 }}>{candidate.parsed_data.location}</span>
              </span>
            )}
          </div>
        </div>

        {/* Quick Actions (Primary & Secondary) */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {isHRorAdmin && ["shortlisted", "parsed"].includes(effectiveStatus) && effectiveJobId && (
            <button
              className="btn btn-primary"
              disabled={submitting}
              onClick={handleSubmitForApproval}
              style={{ padding: "9px 20px", fontSize: "13.5px" }}
            >
              {submitting ? "Submitting..." : "Submit for Approval →"}
            </button>
          )}

          {effectiveStatus === "pending_approval" && (
            <Link to="/approvals" className="btn btn-primary" style={{ padding: "9px 20px", fontSize: "13.5px", textDecoration: "none" }}>
              Review in Approval Queue →
            </Link>
          )}

          <button
            type="button"
            onClick={handleOpenHiringPacket}
            disabled={loadingPacket}
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 18px", fontSize: "13.5px" }}
            title="Generate and export comprehensive executive hiring packet"
          >
            <FileText size={15} color="var(--accent-purple)" />
            <span>{loadingPacket ? "Compiling..." : "Export Hiring Packet (.md)"}</span>
          </button>
        </div>
      </div>

      {submitError && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--status-rejected-bg)",
            border: "1px solid var(--status-rejected-border)",
            color: "var(--status-rejected-text)",
            fontSize: "13.5px",
          }}
        >
          {submitError}
        </div>
      )}

      {/* Target Requisition Context Card */}
      <div
        style={{
          padding: "18px 24px",
          backgroundColor: "#ffffff",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xs)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "18px",
        }}
      >
        <div>
          <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            LINKED REQUISITION & ROUTING POLICY
          </span>
          <div style={{ fontSize: "15px", fontWeight: 700, marginTop: "4px", color: "var(--text-primary)" }}>
            {job ? (
              <>
                {job.title}{" "}
                <span style={{ color: "var(--accent-purple)", fontSize: "12.5px", fontWeight: 700, backgroundColor: "var(--accent-purple-subtle)", padding: "2px 8px", borderRadius: "var(--radius-pill)", border: "1px solid var(--accent-purple-border)", marginLeft: "6px" }}>
                  {job.role_tier.toUpperCase()} TIER
                </span>
              </>
            ) : (
              <span className="text-secondary" style={{ fontStyle: "italic", fontWeight: 500 }}>
                Unlinked Candidate (Not linked to any job requisition)
              </span>
            )}
          </div>
        </div>

        {job && (
          <div>
            <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: "6px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              CURRENT ESCALATION STATUS
            </span>
            <EscalationTracker roleTier={job.role_tier} status={effectiveStatus} />
          </div>
        )}
      </div>

      {/* Dedicated Section Navigation Tab Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px",
          backgroundColor: "#f1f5f9",
          borderRadius: "var(--radius-lg)",
          overflowX: "auto",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("extracted")}
          style={{
            padding: "8px 18px",
            fontSize: "13px",
            fontWeight: activeTab === "extracted" ? 700 : 500,
            borderRadius: "var(--radius-sm)",
            border: activeTab === "extracted" ? "1px solid var(--border-subtle)" : "1px solid transparent",
            backgroundColor: activeTab === "extracted" ? "#ffffff" : "transparent",
            color: activeTab === "extracted" ? "var(--text-primary)" : "var(--text-secondary)",
            boxShadow: activeTab === "extracted" ? "var(--shadow-xs)" : "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <FileText size={15} color={activeTab === "extracted" ? "var(--accent-purple)" : "currentColor"} />
          <span>Model Extraction</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("raw")}
          style={{
            padding: "8px 18px",
            fontSize: "13px",
            fontWeight: activeTab === "raw" ? 700 : 500,
            borderRadius: "var(--radius-sm)",
            border: activeTab === "raw" ? "1px solid var(--border-subtle)" : "1px solid transparent",
            backgroundColor: activeTab === "raw" ? "#ffffff" : "transparent",
            color: activeTab === "raw" ? "var(--text-primary)" : "var(--text-secondary)",
            boxShadow: activeTab === "raw" ? "var(--shadow-xs)" : "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <span>Raw Text & OCR</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("scorecard")}
          style={{
            padding: "8px 18px",
            fontSize: "13px",
            fontWeight: activeTab === "scorecard" ? 700 : 500,
            borderRadius: "var(--radius-sm)",
            border: activeTab === "scorecard" ? "1px solid var(--border-subtle)" : "1px solid transparent",
            backgroundColor: activeTab === "scorecard" ? "#ffffff" : "transparent",
            color: activeTab === "scorecard" ? "var(--text-primary)" : "var(--text-secondary)",
            boxShadow: activeTab === "scorecard" ? "var(--shadow-xs)" : "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <Star size={15} fill={scorecard && scorecard.total_evaluations > 0 ? "#f59e0b" : "none"} color={scorecard && scorecard.total_evaluations > 0 ? "#f59e0b" : "currentColor"} />
          <span>Interview Scorecard</span>
          {scorecard && scorecard.total_evaluations > 0 && (
            <span
              style={{
                fontSize: "11px",
                padding: "2px 7px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: "#fef3c7",
                color: "#92400e",
                fontWeight: 700,
                border: "1px solid #fde68a",
              }}
            >
              {scorecard.average_score}★
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          style={{
            padding: "8px 18px",
            fontSize: "13px",
            fontWeight: activeTab === "calendar" ? 700 : 500,
            borderRadius: "var(--radius-sm)",
            border: activeTab === "calendar" ? "1px solid var(--border-subtle)" : "1px solid transparent",
            backgroundColor: activeTab === "calendar" ? "#ffffff" : "transparent",
            color: activeTab === "calendar" ? "var(--text-primary)" : "var(--text-secondary)",
            boxShadow: activeTab === "calendar" ? "var(--shadow-xs)" : "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <Calendar size={15} color={activeTab === "calendar" ? "var(--accent-purple)" : "currentColor"} />
          <span>Interview Calendar</span>
          {schedules.length > 0 && (
            <span
              style={{
                fontSize: "11px",
                padding: "2px 7px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: activeTab === "calendar" ? "var(--accent-purple-subtle)" : "#e2e8f0",
                color: activeTab === "calendar" ? "var(--accent-purple)" : "var(--text-secondary)",
                fontWeight: 700,
              }}
            >
              {schedules.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("offer")}
          style={{
            padding: "8px 18px",
            fontSize: "13px",
            fontWeight: activeTab === "offer" ? 700 : 500,
            borderRadius: "var(--radius-sm)",
            border: activeTab === "offer" ? "1px solid var(--border-subtle)" : "1px solid transparent",
            backgroundColor: activeTab === "offer" ? "#ffffff" : "transparent",
            color: activeTab === "offer" ? "var(--text-primary)" : "var(--text-secondary)",
            boxShadow: activeTab === "offer" ? "var(--shadow-xs)" : "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <Gift size={15} color={activeTab === "offer" ? "var(--accent-purple)" : "currentColor"} />
          <span>Offer Studio</span>
          {offers.length > 0 && (
            <span
              style={{
                fontSize: "11px",
                padding: "2px 7px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: activeTab === "offer" ? "var(--accent-purple-subtle)" : "#e2e8f0",
                color: activeTab === "offer" ? "var(--accent-purple)" : "var(--text-secondary)",
                fontWeight: 700,
              }}
            >
              {offers.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("onboarding")}
          style={{
            padding: "8px 18px",
            fontSize: "13px",
            fontWeight: activeTab === "onboarding" ? 700 : 500,
            borderRadius: "var(--radius-sm)",
            border: activeTab === "onboarding" ? "1px solid var(--border-subtle)" : "1px solid transparent",
            backgroundColor: activeTab === "onboarding" ? "#ffffff" : "transparent",
            color: activeTab === "onboarding" ? "var(--text-primary)" : "var(--text-secondary)",
            boxShadow: activeTab === "onboarding" ? "var(--shadow-xs)" : "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <ClipboardList size={15} color={activeTab === "onboarding" ? "var(--accent-purple)" : "currentColor"} />
          <span>Onboarding</span>
          {onboarding && onboarding.total_tasks > 0 && (
            <span
              style={{
                fontSize: "11px",
                padding: "2px 7px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: onboarding.is_complete ? "#ecfdf5" : "#e2e8f0",
                color: onboarding.is_complete ? "#047857" : "var(--text-secondary)",
                fontWeight: 700,
                border: onboarding.is_complete ? "1px solid #a7f3d0" : "none",
              }}
            >
              {onboarding.completed_tasks}/{onboarding.total_tasks}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("timeline")}
          style={{
            padding: "8px 18px",
            fontSize: "13px",
            fontWeight: activeTab === "timeline" ? 700 : 500,
            borderRadius: "var(--radius-sm)",
            border: activeTab === "timeline" ? "1px solid var(--border-subtle)" : "1px solid transparent",
            backgroundColor: activeTab === "timeline" ? "#ffffff" : "transparent",
            color: activeTab === "timeline" ? "var(--text-primary)" : "var(--text-secondary)",
            boxShadow: activeTab === "timeline" ? "var(--shadow-xs)" : "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          <History size={15} color={activeTab === "timeline" ? "var(--accent-purple)" : "currentColor"} />
          <span>Activity Timeline</span>
          {timelineEvents.length > 0 && (
            <span
              style={{
                fontSize: "11px",
                padding: "2px 7px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: activeTab === "timeline" ? "var(--accent-purple-subtle)" : "#e2e8f0",
                color: activeTab === "timeline" ? "var(--accent-purple)" : "var(--text-secondary)",
                fontWeight: 700,
              }}
            >
              {timelineEvents.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Two-Column Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", alignItems: "start" }}>
        {/* Left Column: Extraction Model Output & Raw Text */}
        <div className="panel">
          <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.01em" }}>
              {activeTab === "extracted" && "Extracted Dossier Profile"}
              {activeTab === "raw" && "Preprocessed Plaintext & OCR Metadata"}
              {activeTab === "scorecard" && "Interview Scorecard Evaluation"}
              {activeTab === "calendar" && "Interview Scheduling & Cal Integration"}
              {activeTab === "offer" && "Offer Letter Studio"}
              {activeTab === "onboarding" && "Post-Offer Onboarding Checklist"}
              {activeTab === "timeline" && "Candidate Activity Trail & Notes"}
            </span>

            <span className="mono" style={{ fontSize: "11.5px", color: "var(--text-muted)", fontWeight: 500 }}>
              DOC SCHEMA: ISO-HR-2024
            </span>
          </div>

          <div className="panel-body">
            {activeTab === "extracted" && (
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
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                        {parsed.current_title}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        CURRENT COMPANY
                      </span>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                        {parsed.current_company || "N/A"}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        SENIORITY & EXP
                      </span>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent-purple)", marginTop: "4px" }}>
                        {parsed.seniority.toUpperCase()} • {parsed.years_experience}y
                      </div>
                    </div>
                  </div>

                  {/* Domain & Industries */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        PRIMARY DOMAIN
                      </span>
                      <div style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px", fontWeight: 500 }}>
                        {parsed.primary_domain || "N/A"}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        INDUSTRIES
                      </span>
                      <div style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px", fontWeight: 500 }}>
                        {parsed.industries.join(", ") || "N/A"}
                      </div>
                    </div>
                  </div>

                  {/* Core & Secondary Skills */}
                  <div>
                    <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                      CORE TECHNICAL SKILLS
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                      {parsed.core_skills.map((skill, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            backgroundColor: "var(--accent-purple-subtle)",
                            border: "1px solid var(--accent-purple-border)",
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
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        SECONDARY COMPETENCIES
                      </span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
                        {parsed.secondary_skills.map((skill, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: "12px",
                              padding: "4px 10px",
                              backgroundColor: "#f8fafc",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "var(--radius-pill)",
                              color: "var(--text-secondary)",
                              fontWeight: 500,
                            }}
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tools & Leadership */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        TOOLS & INFRASTRUCTURE
                      </span>
                      <div style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {parsed.tools && parsed.tools.length > 0 ? parsed.tools.join(", ") : "None specified"}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        LEADERSHIP EXPERIENCE
                      </span>
                      <div style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {parsed.leadership_experience ? "Verified leadership track record" : "Individual contributor"}
                      </div>
                    </div>
                  </div>

                  {/* Previous Titles & Companies */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        PREVIOUS TITLES
                      </span>
                      <div style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {parsed.previous_titles.length > 0 ? parsed.previous_titles.join(" → ") : "None listed"}
                      </div>
                    </div>

                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        PREVIOUS ORGANIZATIONS
                      </span>
                      <div style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "4px" }}>
                        {parsed.previous_companies.length > 0 ? parsed.previous_companies.join(", ") : "None listed"}
                      </div>
                    </div>
                  </div>

                  {/* Key Achievements */}
                  {parsed.key_achievements && parsed.key_achievements.length > 0 && (
                    <div>
                      <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
                        KEY VERIFIED ACHIEVEMENTS
                      </span>
                      <ul style={{ paddingLeft: "20px", marginTop: "6px", fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {parsed.key_achievements.map((ach, i) => (
                          <li key={i} style={{ marginBottom: "6px" }}>
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
            )}

            {activeTab === "raw" && (
              /* Raw Plaintext Preprocessor Viewer */
              <div style={{ padding: "4px" }}>
                <div className="mono" style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", letterSpacing: "0.04em" }}>
                  PLAINTEXT EXTRACTED BY PYPDF / PYTHON-DOCX PREPROCESSOR (STAGE 1)
                </div>
                <pre
                  className="mono"
                  style={{
                    backgroundColor: "#f8fafc",
                    padding: "18px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "12.5px",
                    lineHeight: "1.6",
                    maxHeight: "520px",
                    overflowY: "auto",
                    whiteSpace: "pre-wrap",
                    color: "var(--text-secondary)",
                  }}
                >
                  {candidate.raw_text || "No plaintext captured during ingestion."}
                </pre>
              </div>
            )}

            {activeTab === "offer" && (
              /* Offer Studio Tab */
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {offerSuccess && (
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "var(--status-approved-bg)",
                      border: "1px solid var(--status-approved-border)",
                      borderRadius: "10px",
                      color: "var(--status-approved-text)",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>{offerSuccess}</span>
                  </div>
                )}

                {offerError && (
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "var(--status-rejected-bg)",
                      border: "1px solid var(--status-rejected-border)",
                      borderRadius: "10px",
                      color: "var(--status-rejected-text)",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>{offerError}</span>
                  </div>
                )}

                {/* If an offer exists, render the formal offer card */}
                {activeOffer && (
                  <div
                    style={{
                      backgroundColor: "#fbfcfe",
                      border: "1.5px solid var(--accent-purple-border)",
                      borderRadius: "14px",
                      padding: "20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    {/* Top Offer Bar */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            className="badge mono"
                            style={{
                              backgroundColor:
                                activeOffer.status === "accepted"
                                  ? "var(--status-approved-bg)"
                                  : activeOffer.status === "declined"
                                  ? "var(--status-rejected-bg)"
                                  : activeOffer.status === "sent"
                                  ? "var(--accent-purple-subtle)"
                                  : "#fef3c7",
                              color:
                                activeOffer.status === "accepted"
                                  ? "var(--status-approved-text)"
                                  : activeOffer.status === "declined"
                                  ? "var(--status-rejected-text)"
                                  : activeOffer.status === "sent"
                                  ? "var(--accent-purple)"
                                  : "#d97706",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "4px 10px",
                            }}
                          >
                            Status: {activeOffer.status.toUpperCase()}
                          </span>
                          <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Generated: {new Date(activeOffer.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <h3 style={{ fontSize: "17px", fontWeight: 800, margin: "6px 0 0 0", color: "var(--text-primary)" }}>
                          {activeOffer.role_title}
                        </h3>
                      </div>

                      {/* Offer Action Buttons */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <a
                          href={api.getOfferDownloadUrl(activeOffer.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-subtle btn-sm"
                          style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                        >
                          <Download size={13} />
                          <span>Download Letter (.md)</span>
                        </a>

                        {isHRorAdmin && activeOffer.status === "draft" && (
                          <button
                            type="button"
                            disabled={sendingOffer}
                            onClick={() => handleSendOffer(activeOffer.id)}
                            className="btn btn-purple btn-sm"
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px" }}
                          >
                            <Send size={13} />
                            <span>{sendingOffer ? "Sending Offer..." : "Send Offer to Candidate"}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Key Metrics Chips */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "10px",
                        backgroundColor: "#ffffff",
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block" }}>Annual Salary</span>
                        <span className="mono" style={{ fontSize: "14px", fontWeight: 800, color: "var(--text-primary)" }}>
                          {activeOffer.currency} {Number(activeOffer.salary).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block" }}>Target Start Date</span>
                        <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {activeOffer.start_date || "Immediate"}
                        </span>
                      </div>
                      <div>
                        <span style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block" }}>Equity Grant</span>
                        <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {activeOffer.equity || "None"}
                        </span>
                      </div>
                    </div>

                    {/* Notice states */}
                    {activeOffer.status === "sent" && (
                      <div
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          backgroundColor: "var(--accent-purple-subtle)",
                          border: "1px solid var(--accent-purple-border)",
                          color: "var(--accent-purple)",
                          fontSize: "12.5px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <Clock size={15} />
                        <span>Dispatched to candidate. Awaiting formal acceptance/decision in Candidate Portal.</span>
                      </div>
                    )}

                    {activeOffer.status === "accepted" && (
                      <div
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          backgroundColor: "var(--status-approved-bg)",
                          border: "1px solid var(--status-approved-border)",
                          color: "var(--status-approved-text)",
                          fontSize: "12.5px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <CheckCircle size={15} />
                        <span>
                          Accepted by candidate on{" "}
                          {activeOffer.responded_at ? new Date(activeOffer.responded_at).toLocaleDateString() : "recently"}.
                          {activeOffer.notes ? ` Message: "${activeOffer.notes}"` : ""}
                        </span>
                      </div>
                    )}

                    {activeOffer.status === "declined" && (
                      <div
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          backgroundColor: "var(--status-rejected-bg)",
                          border: "1px solid var(--status-rejected-border)",
                          color: "var(--status-rejected-text)",
                          fontSize: "12.5px",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <XCircle size={15} />
                        <span>
                          Declined by candidate.
                          {activeOffer.notes ? ` Feedback: "${activeOffer.notes}"` : ""}
                        </span>
                      </div>
                    )}

                    {/* Generated Letter Preview */}
                    <div>
                      <span className="mono" style={{ fontSize: "10.5px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                        FORMAL OFFER LETTER PREVIEW
                      </span>
                      <pre
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "10px",
                          padding: "18px 20px",
                          fontSize: "13px",
                          lineHeight: "1.65",
                          color: "#334155",
                          fontFamily: "var(--font-sans)",
                          whiteSpace: "pre-wrap",
                          maxHeight: "360px",
                          overflowY: "auto",
                        }}
                      >
                        {activeOffer.offer_letter_text}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Offer Letter Generator / Editor Form */}
                {isHRorAdmin ? (
                  <form
                    onSubmit={handleGenerateOffer}
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: "14px",
                      border: "1px solid var(--border-subtle)",
                      padding: "20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {activeOffer ? "Revise / Re-generate Offer Terms" : "Generate Formal Offer Letter"}
                      </h4>
                      <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        ATS AUTOMATION STUDIO
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                          Official Role Title
                        </label>
                        <input
                          type="text"
                          value={offerForm.role_title}
                          onChange={(e) => setOfferForm({ ...offerForm, role_title: e.target.value })}
                          placeholder="e.g. Senior Machine Learning Engineer"
                          required
                          style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "8px" }}>
                        <div>
                          <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                            Annual Base Salary
                          </label>
                          <input
                            type="number"
                            value={offerForm.salary}
                            onChange={(e) => setOfferForm({ ...offerForm, salary: Number(e.target.value) })}
                            required
                            min={1}
                            style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                            Currency
                          </label>
                          <select
                            value={offerForm.currency}
                            onChange={(e) => setOfferForm({ ...offerForm, currency: e.target.value })}
                            style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                          >
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="CAD">CAD ($)</option>
                            <option value="AUD">AUD ($)</option>
                            <option value="INR">INR (₹)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                          Target Start Date
                        </label>
                        <input
                          type="date"
                          value={offerForm.start_date}
                          onChange={(e) => setOfferForm({ ...offerForm, start_date: e.target.value })}
                          style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                          Equity & Incentives
                        </label>
                        <input
                          type="text"
                          value={offerForm.equity}
                          onChange={(e) => setOfferForm({ ...offerForm, equity: e.target.value })}
                          placeholder="e.g. 0.25% equity options (4-yr vesting)"
                          style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                        Benefits & Notes (Appended to formal letter)
                      </label>
                      <textarea
                        rows={3}
                        value={offerForm.notes}
                        onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })}
                        placeholder="Outline healthcare, 401(k), relocation assistance, or signing bonus..."
                        style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="submit"
                        disabled={generatingOffer}
                        className="btn btn-purple"
                        style={{ padding: "9px 22px", fontSize: "13px" }}
                      >
                        <Sparkles size={14} />
                        <span>{generatingOffer ? "Generating Offer Draft..." : "Generate Offer Letter Draft"}</span>
                      </button>
                    </div>
                  </form>
                ) : !activeOffer ? (
                  <div
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: "14px",
                      border: "1px solid var(--border-subtle)",
                      padding: "36px 24px",
                      textAlign: "center",
                    }}
                  >
                    <Gift size={32} color="#a855f7" style={{ margin: "0 auto 12px", display: "block" }} />
                    <h4 style={{ margin: "0 0 6px 0", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                      No Formal Offer Drafted
                    </h4>
                    <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", maxWidth: "440px", marginLeft: "auto", marginRight: "auto" }}>
                      Formal offer compensation terms and letter generation are authored by HR recruiters following multi-tier stage approval.
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {activeTab === "scorecard" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Consensual Circular Indicator & Side-by-Side Evaluation Reports */}
                <ConsensusReportView
                  scorecard={scorecard}
                  candidateName={candidate?.name}
                  compact={false}
                />

                {/* AI Interview Question Generator */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: "14px",
                    border: "1px solid var(--border-subtle)",
                    padding: "22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "18px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "3px",
                      background: "linear-gradient(90deg, #6366f1, #a855f7, #ec4899)",
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "10px",
                            backgroundColor: "#f5f3ff",
                            color: "#7c3aed",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Sparkles size={18} />
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                            AI Dynamic Interview Question Generator
                          </h4>
                          <p style={{ margin: "2px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
                            Generate tailored coding, system design, and behavioral questions tuned to {candidate?.name || "the candidate"}'s resume claims and target role requirements.
                          </p>
                        </div>
                      </div>
                    </div>

                    {questionsResult && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          className="mono"
                          style={{
                            fontSize: "11px",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            backgroundColor: "#f1f5f9",
                            color: "#475569",
                            fontWeight: 600,
                          }}
                        >
                          {questionsResult.total_questions} Questions Generated
                        </span>
                        <button
                          type="button"
                          onClick={() => handleGenerateQuestions()}
                          disabled={generatingQuestions}
                          className="btn btn-secondary"
                          style={{ padding: "6px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                        >
                          <Sparkles size={13} />
                          <span>Regenerate</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Controls: Round Pills & Custom Focus Input */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      padding: "16px",
                      backgroundColor: "#f8fafc",
                      borderRadius: "10px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px" }} className="mono">
                        INTERVIEW ROUND TYPE
                      </label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {[
                          { id: "technical", label: "Technical Coding" },
                          { id: "system_design", label: "System Design & Architecture" },
                          { id: "behavioral", label: "Behavioral & Leadership" },
                          { id: "screening", label: "Initial Screening" },
                          { id: "executive", label: "Executive Consensus" },
                        ].map((r) => {
                          const isSelected = questionRoundType === r.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setQuestionRoundType(r.id as InterviewRoundType)}
                              style={{
                                padding: "7px 13px",
                                borderRadius: "8px",
                                border: isSelected ? "1.5px solid #6366f1" : "1px solid var(--border-subtle)",
                                backgroundColor: isSelected ? "#eef2ff" : "#ffffff",
                                color: isSelected ? "#4338ca" : "var(--text-secondary)",
                                fontWeight: isSelected ? 700 : 500,
                                fontSize: "12.5px",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <span>{r.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "flex-end" }}>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.5px", display: "block", marginBottom: "4px" }} className="mono">
                          CUSTOM TOPIC / RESUME CLAIM FOCUS (OPTIONAL)
                        </label>
                        <input
                          type="text"
                          value={customFocus}
                          onChange={(e) => setCustomFocus(e.target.value)}
                          placeholder="e.g. Distributed consensus, Kafka partitioning, Kubernetes zero-downtime, Team conflict..."
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            fontSize: "13px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            backgroundColor: "#ffffff",
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleGenerateQuestions();
                            }
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleGenerateQuestions()}
                        disabled={generatingQuestions}
                        className="btn btn-primary"
                        style={{
                          padding: "9px 20px",
                          fontSize: "13px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          whiteSpace: "nowrap",
                          backgroundColor: "#4f46e5",
                          borderColor: "#4338ca",
                        }}
                      >
                        <Sparkles size={15} />
                        <span>{generatingQuestions ? "Generating Questions..." : "Generate AI Questions"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Error State */}
                  {questionError && (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        backgroundColor: "var(--status-rejected-bg)",
                        color: "var(--status-rejected-text)",
                        fontSize: "12.5px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <AlertCircle size={16} />
                      <span>{questionError}</span>
                    </div>
                  )}

                  {/* Loading State Skeleton */}
                  {generatingQuestions && (
                    <div style={{ textAlign: "center", padding: "30px 0" }}>
                      <Sparkles size={28} color="#6366f1" style={{ margin: "0 auto 10px", display: "block" }} />
                      <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Synthesizing candidate background, verified skills, and role criteria...
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                        Generating probing questions and evaluation rubric guidelines tailored to {candidate?.name || "candidate"}.
                      </p>
                    </div>
                  )}

                  {/* Generated Questions List */}
                  {!generatingQuestions && questionsResult && questionsResult.questions.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      {questionsResult.questions.map((q, idx) => {
                        const isCopied = copiedQuestionId === q.id;
                        const isInserted = insertedQuestionId === q.id;
                        const diffLower = q.difficulty.toLowerCase();
                        const diffColor =
                          diffLower === "advanced"
                            ? { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" }
                            : diffLower === "intermediate"
                            ? { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" }
                            : { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" };

                        return (
                          <div
                            key={q.id || idx}
                            style={{
                              padding: "16px 18px",
                              borderRadius: "10px",
                              border: "1px solid var(--border-subtle)",
                              backgroundColor: "#ffffff",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                            }}
                          >
                            {/* Header info bar */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                <span
                                  className="mono"
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    backgroundColor: "#f1f5f9",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  Q{idx + 1} • {q.category.toUpperCase()}
                                </span>
                                <span
                                  className="mono"
                                  style={{
                                    fontSize: "10.5px",
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: "6px",
                                    backgroundColor: diffColor.bg,
                                    color: diffColor.text,
                                    border: `1px solid ${diffColor.border}`,
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {q.difficulty}
                                </span>
                                <span
                                  className="mono"
                                  style={{
                                    fontSize: "10.5px",
                                    fontWeight: 600,
                                    padding: "2px 8px",
                                    borderRadius: "6px",
                                    backgroundColor: "#faf5ff",
                                    color: "#7e22ce",
                                    border: "1px solid #e9d5ff",
                                  }}
                                >
                                  Rubric: {q.suggested_dimension.replace("_", " ")}
                                </span>
                              </div>

                              {/* Action Buttons */}
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <button
                                  type="button"
                                  onClick={() => handleCopyQuestion(q)}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: "5px 10px",
                                    fontSize: "11.5px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                  }}
                                  title="Copy question and rubric to clipboard"
                                >
                                  {isCopied ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                                  <span>{isCopied ? "Copied!" : "Copy"}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInsertQuestionIntoNotes(q)}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: "5px 12px",
                                    fontSize: "11.5px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    backgroundColor: isInserted ? "var(--status-approved-bg)" : "#ffffff",
                                    borderColor: isInserted ? "var(--status-approved-border)" : "var(--border-subtle)",
                                    color: isInserted ? "var(--status-approved-text)" : "var(--text-primary)",
                                  }}
                                  title="Insert question and evaluation notes into Scorecard Form below"
                                >
                                  {isInserted ? <CheckCircle2 size={13} color="#16a34a" /> : <PlusCircle size={13} color="#6366f1" />}
                                  <span>{isInserted ? "Inserted into Scorecard!" : "Insert into Scorecard"}</span>
                                </button>
                              </div>
                            </div>

                            {/* Question Text */}
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.5 }}>
                              {q.question}
                            </div>

                            {/* What to look for */}
                            <div
                              style={{
                                padding: "10px 14px",
                                borderRadius: "8px",
                                backgroundColor: "#f0fdf4",
                                border: "1px solid #bbf7d0",
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 700, color: "#166534" }}>
                                <CheckCircle2 size={13} color="#16a34a" />
                                <span>WHAT TO LOOK FOR IN CANDIDATE ANSWERS:</span>
                              </div>
                              <p style={{ margin: 0, fontSize: "12px", color: "#14532d", lineHeight: 1.45 }}>
                                {q.what_to_look_for}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Empty State / Not Generated Yet */}
                  {!generatingQuestions && !questionsResult && (
                    <div
                      style={{
                        padding: "24px",
                        borderRadius: "10px",
                        backgroundColor: "#f8fafc",
                        border: "1px dashed var(--border-subtle)",
                        textAlign: "center",
                      }}
                    >
                      <BookOpen size={28} color="#6366f1" style={{ margin: "0 auto 8px", display: "block" }} />
                      <h5 style={{ margin: "0 0 4px", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                        Prepare Tailored Interview Questions
                      </h5>
                      <p style={{ margin: "0 0 14px", fontSize: "12.5px", color: "var(--text-secondary)", maxWidth: "520px", marginLeft: "auto", marginRight: "auto" }}>
                        ReSumo analyzes candidate experience, GitHub/resume claims, and target position specs to draft high-signal interview questions with evaluation criteria.
                      </p>
                      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleGenerateQuestions("technical")}
                          className="btn btn-secondary"
                          style={{ padding: "6px 14px", fontSize: "12px" }}
                        >
                          ⚡ Technical Coding
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateQuestions("system_design")}
                          className="btn btn-secondary"
                          style={{ padding: "6px 14px", fontSize: "12px" }}
                        >
                          🏗️ System Design
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateQuestions("behavioral")}
                          className="btn btn-secondary"
                          style={{ padding: "6px 14px", fontSize: "12px" }}
                        >
                          🤝 Behavioral & Leadership
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scorecard Rubric Submission Form */}
                <form
                  onSubmit={handleSubmitScorecard}
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: "14px",
                    border: "1px solid var(--border-subtle)",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                      Submit Interview Scorecard & Rubric
                    </h4>
                    <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      STANDARDIZED HIRING RUBRIC
                    </span>
                  </div>

                  {scorecardError && (
                    <div style={{ padding: "8px 12px", borderRadius: "6px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", fontSize: "12px" }}>
                      {scorecardError}
                    </div>
                  )}
                  {scorecardSuccess && (
                    <div style={{ padding: "8px 12px", borderRadius: "6px", backgroundColor: "var(--status-approved-bg)", color: "var(--status-approved-text)", fontSize: "12px" }}>
                      {scorecardSuccess}
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                        Evaluation Track
                      </label>
                      <select
                        value={scorecardForm.interview_type}
                        onChange={(e) => setScorecardForm({ ...scorecardForm, interview_type: e.target.value as "hr" | "technical" })}
                        style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                      >
                        <option value="hr">👥 HR & People Evaluation</option>
                        <option value="technical">🛠️ Technical Interview Track</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                        Interviewer Name / Title
                      </label>
                      <input
                        type="text"
                        value={scorecardForm.interviewer_name}
                        onChange={(e) => setScorecardForm({ ...scorecardForm, interviewer_name: e.target.value })}
                        placeholder="e.g. Alex Rivera, Senior Engineering Manager"
                        style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                        Hiring Recommendation
                      </label>
                      <select
                        value={scorecardForm.recommendation}
                        onChange={(e) => setScorecardForm({ ...scorecardForm, recommendation: e.target.value as any })}
                        style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px" }}
                      >
                        <option value="strong_hire">Strong Hire (Top 5% Candidate)</option>
                        <option value="hire">Hire (Meets All Bar Standards)</option>
                        <option value="lean_hire">Lean Hire (Promising, Minor Gaps)</option>
                        <option value="lean_no_hire">Lean No Hire (Does Not Meet Bar)</option>
                        <option value="no_hire">Strong No Hire (Major Red Flags)</option>
                      </select>
                    </div>
                  </div>

                  {/* Rubric Dimension Sliders */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <span className="mono" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                      RUBRIC DIMENSION EVALUATION (1.0 - 5.0)
                    </span>

                    {[
                      { key: "technical_depth", label: "Technical Depth & Mastery", desc: "Core algorithms, data structures, and engineering rigor" },
                      { key: "system_design", label: "System Design & Architecture", desc: "Scalability, fault tolerance, API design, and trade-offs" },
                      { key: "communication", label: "Communication & Articulation", desc: "Clarity, active listening, and technical storytelling" },
                      { key: "cultural_alignment", label: "Cultural & Values Alignment", desc: "Ownership, collaboration, humility, and velocity" },
                      { key: "role_fit", label: "Role & Experience Alignment", desc: "Relevance of past domain work to target job requisition" },
                    ].map(({ key, label, desc }) => (
                      <div
                        key={key}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          backgroundColor: "#f8fafc",
                          border: "1px solid var(--border-subtle)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "14px",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                            {label}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {desc}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="range"
                            min="1.0"
                            max="5.0"
                            step="0.5"
                            value={(scorecardForm as any)[key]}
                            onChange={(e) => setScorecardForm({ ...scorecardForm, [key]: Number(e.target.value) })}
                            style={{ width: "110px", accentColor: "#f59e0b" }}
                          />
                          <span className="mono" style={{ fontSize: "13px", fontWeight: 700, color: "#b45309", width: "40px", textAlign: "right" }}>
                            {(scorecardForm as any)[key]}★
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Interviewer Synthesis & Feedback Notes
                    </label>
                    <textarea
                      rows={3}
                      value={scorecardForm.overall_notes}
                      onChange={(e) => setScorecardForm({ ...scorecardForm, overall_notes: e.target.value })}
                      placeholder="Specific architectural observations, strengths demonstrated, and potential areas of coaching..."
                      style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "8px", resize: "vertical" }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="submit"
                      disabled={submittingScorecard}
                      className="btn btn-primary"
                      style={{ padding: "9px 22px", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <Star size={14} />
                      <span>{submittingScorecard ? "Saving Scorecard..." : "Submit Scorecard & Rubric"}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === "calendar" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Calendar Header Card */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: "14px",
                    border: "1px solid var(--border-subtle)",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <Calendar size={18} color="var(--accent-purple)" />
                        <span>Interview Scheduling & Calendar Hub</span>
                      </h4>
                      <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>
                        Schedule interview rounds with automatic RFC 5545 universal <code className="mono">.ics</code> calendar invitations (Google Calendar, Apple, Outlook) and instant email notifications.
                      </p>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>
                        TOTAL ROUNDS
                      </span>
                      <span style={{ fontSize: "18px", fontWeight: 800, color: "var(--accent-purple)" }}>
                        {schedules.length} Scheduled
                      </span>
                    </div>
                  </div>

                  {scheduleSuccess && (
                    <div
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "var(--status-approved-bg)",
                        border: "1px solid var(--status-approved-border)",
                        borderRadius: "8px",
                        color: "var(--status-approved-text)",
                        fontSize: "12.5px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <CheckCircle2 size={15} />
                      <span>{scheduleSuccess}</span>
                    </div>
                  )}

                  {scheduleError && (
                    <div
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "var(--status-rejected-bg)",
                        border: "1px solid var(--status-rejected-border)",
                        borderRadius: "8px",
                        color: "var(--status-rejected-text)",
                        fontSize: "12.5px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <AlertCircle size={15} />
                      <span>{scheduleError}</span>
                    </div>
                  )}

                  {/* Schedule New Session Form */}
                  <form onSubmit={handleScheduleInterview} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "6px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          Round Title *
                        </label>
                        <input
                          type="text"
                          required
                          value={scheduleForm.title}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                          placeholder="e.g. Senior Backend Architecture & Live Coding"
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            fontSize: "13px",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          Round Type
                        </label>
                        <select
                          value={scheduleForm.round_type}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, round_type: e.target.value })}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            fontSize: "13px",
                            backgroundColor: "#ffffff",
                          }}
                        >
                          <option value="screening">Initial Screening Call</option>
                          <option value="technical">Technical Coding & Mastery</option>
                          <option value="system_design">System Architecture & Scalability</option>
                          <option value="cultural_fit">Cultural Alignment & Leadership</option>
                          <option value="executive">Executive & Final Fit</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          Date & Time (UTC / Local) *
                        </label>
                        <input
                          type="datetime-local"
                          required
                          value={scheduleForm.start_time}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            fontSize: "13px",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          Duration
                        </label>
                        <select
                          value={scheduleForm.duration_minutes}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, duration_minutes: Number(e.target.value) })}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            fontSize: "13px",
                            backgroundColor: "#ffffff",
                          }}
                        >
                          <option value={30}>30 Minutes</option>
                          <option value={45}>45 Minutes (Standard)</option>
                          <option value={60}>60 Minutes (Deep Dive)</option>
                          <option value={90}>90 Minutes (Architecture)</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          Interviewer Name / Team
                        </label>
                        <input
                          type="text"
                          value={scheduleForm.interviewer_name}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, interviewer_name: e.target.value })}
                          placeholder="e.g. Lead Engineer / Hiring Manager"
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            fontSize: "13px",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          Video Call Link
                        </label>
                        <input
                          type="url"
                          value={scheduleForm.meeting_link}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, meeting_link: e.target.value })}
                          placeholder="https://meet.google.com/xyz or Zoom URL"
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-subtle)",
                            fontSize: "13px",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                        Preparation Notes & Focus Rubric
                      </label>
                      <textarea
                        rows={2}
                        value={scheduleForm.notes}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                        placeholder="Topics to prepare, agenda, instructions for the candidate..."
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px solid var(--border-subtle)",
                          fontSize: "13px",
                          resize: "vertical",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                      <button
                        type="submit"
                        disabled={scheduling}
                        className="btn btn-primary"
                        style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                      >
                        <Calendar size={14} />
                        <span>{scheduling ? "Booking Session..." : "Schedule Session & Dispatch .ics Invites"}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Scheduled Sessions List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Booked Interview Rounds ({schedules.length})
                  </h4>

                  {schedules.length === 0 ? (
                    <EmptyState
                      title="No Interview Rounds Scheduled Yet"
                      description="Use the scheduling studio above to book an interview slot for this candidate. Both candidate and interviewer will immediately receive calendar invites."
                    />
                  ) : (
                    schedules.map((sched) => (
                      <div
                        key={sched.id}
                        style={{
                          backgroundColor: "#ffffff",
                          borderRadius: "12px",
                          border: "1px solid var(--border-subtle)",
                          padding: "16px 20px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                          boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <h5 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                                {sched.title}
                              </h5>
                              <span
                                className="mono"
                                style={{
                                  fontSize: "10.5px",
                                  padding: "2px 8px",
                                  borderRadius: "12px",
                                  backgroundColor: "var(--accent-purple-subtle)",
                                  color: "var(--accent-purple)",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                }}
                              >
                                {sched.round_type}
                              </span>
                              <span
                                className="mono"
                                style={{
                                  fontSize: "10.5px",
                                  padding: "2px 8px",
                                  borderRadius: "12px",
                                  fontWeight: 700,
                                  textTransform: "uppercase",
                                  backgroundColor:
                                    sched.status === "completed"
                                      ? "var(--status-approved-bg)"
                                      : sched.status === "cancelled"
                                      ? "var(--status-rejected-bg)"
                                      : "#eff6ff",
                                  color:
                                    sched.status === "completed"
                                      ? "var(--status-approved-text)"
                                      : sched.status === "cancelled"
                                      ? "var(--status-rejected-text)"
                                      : "#1d4ed8",
                                }}
                              >
                                {sched.status}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "6px", fontSize: "12px", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Clock size={13} color="var(--accent-purple)" />
                                <strong>{new Date(sched.start_time).toLocaleString()}</strong> ({sched.duration_minutes} min)
                              </span>
                              <span>
                                Interviewer: <strong>{sched.interviewer_name || "Hiring Team"}</strong>
                              </span>
                              {sched.meeting_link && (
                                <a
                                  href={sched.meeting_link}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    color: "var(--accent-purple)",
                                    fontWeight: 600,
                                    textDecoration: "none",
                                  }}
                                >
                                  <Video size={13} />
                                  <span>Join Call</span>
                                  <ExternalLink size={11} />
                                </a>
                              )}
                            </div>

                            {sched.notes && (
                              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--text-muted)", backgroundColor: "#f8fafc", padding: "8px 12px", borderRadius: "6px" }}>
                                <strong>Notes:</strong> {sched.notes}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <a
                              href={api.getScheduleIcsUrl(sched.id)}
                              download={`interview-${sched.id}.ics`}
                              className="btn btn-sm btn-secondary"
                              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                            >
                              <Download size={13} />
                              <span>Add to Calendar (.ics)</span>
                            </a>

                            {sched.status === "scheduled" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateScheduleStatus(sched.id, "completed")}
                                  className="btn btn-sm btn-subtle"
                                  style={{ color: "#10b981", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                >
                                  <CheckCircle2 size={13} />
                                  <span>Mark Completed</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleUpdateScheduleStatus(sched.id, "cancelled")}
                                  className="btn btn-sm btn-subtle"
                                  style={{ color: "#ef4444", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                >
                                  <XCircle size={13} />
                                  <span>Cancel</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === "onboarding" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                {/* Onboarding Header Summary Card */}
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: "14px",
                    border: "1px solid var(--border-subtle)",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <ClipboardList size={18} color="var(--accent-purple)" />
                        <span>Post-Offer New Hire Onboarding Tracker</span>
                      </h4>
                      <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>
                        Automated compliance, IT provisioning, and first-day orientation milestones.
                      </p>
                    </div>

                    {onboarding && (
                      <div style={{ textAlign: "right" }}>
                        <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", display: "block" }}>
                          ONBOARDING PROGRESS
                        </span>
                        <span style={{ fontSize: "18px", fontWeight: 800, color: onboarding.is_complete ? "var(--accent-green)" : "var(--accent-purple)" }}>
                          {onboarding.completed_tasks} of {onboarding.total_tasks} Tasks ({onboarding.progress_percentage}%)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  {onboarding && (
                    <div style={{ height: "8px", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${onboarding.progress_percentage}%`,
                          backgroundColor: onboarding.is_complete ? "var(--accent-green)" : "var(--accent-purple)",
                          borderRadius: "4px",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Onboarding Tasks List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {!onboarding || onboarding.tasks.length === 0 ? (
                    <EmptyState
                      title="ONBOARDING NOT YET INITIALIZED"
                      description="Onboarding milestones automatically activate when the candidate accepts their formal employment offer."
                    />
                  ) : (
                    onboarding.tasks.map((task) => {
                      const isComplete = task.status === "completed" || task.status === "verified";
                      const isVerified = task.status === "verified";

                      return (
                        <div
                          key={task.id}
                          style={{
                            padding: "16px 20px",
                            borderRadius: "12px",
                            backgroundColor: "#ffffff",
                            border: `1px solid ${isVerified ? "rgba(16, 185, 129, 0.3)" : "var(--border-subtle)"}`,
                            boxShadow: "0 2px 8px rgba(35, 15, 75, 0.02)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                              <div
                                style={{
                                  marginTop: "2px",
                                  width: "22px",
                                  height: "22px",
                                  borderRadius: "50%",
                                  backgroundColor: isVerified
                                    ? "#dcfce7"
                                    : isComplete
                                    ? "rgba(100, 82, 206, 0.12)"
                                    : "#f1f5f9",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: isVerified
                                    ? "var(--accent-green)"
                                    : isComplete
                                    ? "var(--accent-purple)"
                                    : "var(--text-muted)",
                                }}
                              >
                                {isVerified ? <ShieldCheck size={14} /> : isComplete ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                              </div>
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                                    {task.title}
                                  </span>
                                  <span
                                    className="mono"
                                    style={{
                                      fontSize: "10px",
                                      padding: "2px 7px",
                                      borderRadius: "var(--radius-pill)",
                                      backgroundColor: "#f8fafc",
                                      color: "var(--text-secondary)",
                                      textTransform: "uppercase",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {task.category.replace("_", " ")}
                                  </span>
                                </div>
                                <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: "1.45" }}>
                                  {task.description}
                                </p>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {task.status === "verified" ? (
                                <span className="badge badge-approved" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <ShieldCheck size={11} /> VERIFIED
                                </span>
                              ) : task.status === "completed" ? (
                                <span className="badge badge-pending">COMPLETED</span>
                              ) : (
                                <span className="badge badge-neutral">PENDING</span>
                              )}

                              {task.status === "completed" && isHRorAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleVerifyOnboardingTask(task.id)}
                                  disabled={verifyingTaskId === task.id}
                                  className="btn btn-sm btn-primary"
                                  style={{ fontSize: "11px", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                >
                                  <ShieldCheck size={12} />
                                  <span>{verifyingTaskId === task.id ? "Verifying..." : "Verify (Sign-off)"}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Form data preview if submitted */}
                          {task.form_data && Object.keys(task.form_data).length > 0 && (
                            <div
                              style={{
                                marginTop: "6px",
                                padding: "10px 14px",
                                borderRadius: "8px",
                                backgroundColor: "#f8fafc",
                                border: "1px solid var(--border-subtle)",
                                fontSize: "12px",
                              }}
                            >
                              <span className="mono" style={{ fontSize: "10px", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>
                                SUBMITTED CANDIDATE DETAILS
                              </span>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                                {Object.entries(task.form_data).map(([k, v]) => (
                                  <div key={k}>
                                    <span style={{ color: "var(--text-muted)", textTransform: "capitalize" }}>
                                      {k.replace(/_/g, " ")}:
                                    </span>{" "}
                                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                      {String(v)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Tab: Timeline & Collaboration Notes */}
            {activeTab === "timeline" && (
              <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Section Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                      Candidate Activity & Audit Timeline
                    </h3>
                    <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                      Chronological audit log tracking resume parsing, job matches, approval sign-offs, interviews, and offers.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenHiringPacket}
                    disabled={loadingPacket}
                    className="btn btn-primary btn-sm"
                    style={{ borderRadius: "50px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <FileText size={13} />
                    <span>{loadingPacket ? "Loading..." : "Export Full Packet (.md)"}</span>
                  </button>
                </div>

                {/* Team Notes Composer (HR, Approver, Admin) */}
                <div
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    padding: "16px 20px",
                    borderRadius: "14px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <MessageSquarePlus size={15} color="var(--accent-purple)" />
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                      Add Internal Collaboration Note {notes.length > 0 && `(${notes.length})`}
                    </span>
                  </div>

                  <form onSubmit={handleAddNote} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {noteError && (
                      <div style={{ padding: "8px 12px", borderRadius: "6px", backgroundColor: "var(--status-rejected-bg)", color: "var(--status-rejected-text)", fontSize: "12px" }}>
                        {noteError}
                      </div>
                    )}
                    <textarea
                      rows={2}
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      placeholder="Add interview takeaways, salary flexibility notes, or recruiter observations..."
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        fontSize: "13px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "#ffffff",
                        resize: "vertical",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="submit"
                        disabled={postingNote || !newNoteContent.trim()}
                        className="btn btn-purple btn-sm"
                        style={{ borderRadius: "50px", padding: "6px 18px", fontSize: "12px" }}
                      >
                        {postingNote ? "Saving Note..." : "Post Note"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Chronological Timeline Stream */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="mono" style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>
                    LIFECYCLE EVENTS ({timelineEvents.length})
                  </div>

                  {timelineEvents.length === 0 ? (
                    <EmptyState
                      title="NO EVENTS RECORDED"
                      description="Activity events will appear automatically as the candidate progresses through stages."
                    />
                  ) : (
                    <div style={{ position: "relative", paddingLeft: "28px" }}>
                      {/* Vertical line connecting nodes */}
                      <div
                        style={{
                          position: "absolute",
                          left: "11px",
                          top: "8px",
                          bottom: "8px",
                          width: "2px",
                          backgroundColor: "#e2e8f0",
                        }}
                      />

                      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                        {timelineEvents.map((evt) => {
                          const isNote = evt.event_type === "note_added";
                          const isApproval = evt.event_type.startsWith("approval");
                          const isOffer = evt.event_type.startsWith("offer");
                          const isInterview = evt.event_type.startsWith("interview") || evt.event_type.startsWith("scorecard");

                          const icon = isNote ? (
                            <MessageSquarePlus size={13} color="#8b5cf6" />
                          ) : isOffer ? (
                            <Gift size={13} color="#a855f7" />
                          ) : isInterview ? (
                            <Calendar size={13} color="#0284c7" />
                          ) : isApproval ? (
                            <ShieldCheck size={13} color="#10b981" />
                          ) : (
                            <CheckCircle2 size={13} color="#64748b" />
                          );

                          return (
                            <div key={evt.id} style={{ position: "relative" }}>
                              {/* Node Circle */}
                              <div
                                style={{
                                  position: "absolute",
                                  left: "-28px",
                                  top: "2px",
                                  width: "24px",
                                  height: "24px",
                                  borderRadius: "50%",
                                  backgroundColor: "#ffffff",
                                  border: "2px solid #cbd5e1",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                                }}
                              >
                                {icon}
                              </div>

                              {/* Event Card */}
                              <div
                                style={{
                                  padding: "12px 16px",
                                  borderRadius: "10px",
                                  backgroundColor: isNote ? "#fbfbfe" : "#ffffff",
                                  border: `1px solid ${isNote ? "rgba(139, 92, 246, 0.25)" : "var(--border-subtle)"}`,
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                                      {evt.title}
                                    </span>
                                    {evt.actor_role && (
                                      <span
                                        className="badge mono"
                                        style={{ fontSize: "9.5px", textTransform: "uppercase" }}
                                      >
                                        {evt.actor_role}
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <span className="mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                      {new Date(evt.timestamp).toLocaleString([], {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                    {isNote && evt.metadata?.note_id && (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteNote(evt.metadata?.note_id)}
                                        style={{
                                          background: "transparent",
                                          border: "none",
                                          cursor: "pointer",
                                          color: "var(--text-muted)",
                                          padding: "2px",
                                        }}
                                        title="Delete note"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: "6px 0 0 0", lineHeight: "1.45" }}>
                                  {evt.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Approval Chain Audit Trail & Timeline */}
        <div className="panel">
          <div className="panel-header" style={{ padding: "16px 20px" }}>
            <span className="mono" style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
              APPROVAL AUDIT TRAIL ({approvals.length} RECORDS)
            </span>
          </div>

          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px 20px" }}>
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
                      padding: "16px 18px",
                      backgroundColor: "#ffffff",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "var(--shadow-xs)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="mono" style={{ fontSize: "11.5px", color: "var(--text-muted)", fontWeight: 700 }}>
                          #{idx + 1}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>
                          Step {appr.step_order}: {appr.approver_role.toUpperCase()}
                        </span>
                      </div>
                      <span className={`badge ${badgeClass}`} style={{ fontSize: "12px", padding: "3px 10px" }}>{appr.action.toUpperCase()}</span>
                    </div>

                    {appr.notes && (
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--text-secondary)",
                          backgroundColor: "#f8fafc",
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)",
                          fontStyle: "italic",
                          lineHeight: 1.5,
                        }}
                      >
                        "{appr.notes}"
                      </div>
                    )}

                    <div className="mono text-muted" style={{ fontSize: "11.5px", marginTop: "2px" }}>
                      Created: {new Date(appr.created_at).toLocaleDateString()} {new Date(appr.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {appr.acted_at && ` • Acted: ${new Date(appr.acted_at).toLocaleDateString()} ${new Date(appr.acted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Executive Hiring Packet Modal */}
      {hiringPacketModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: "760px", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
            <div className="panel-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FileText size={16} color="var(--accent-purple)" />
                <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Executive Hiring Dossier: {candidate.name || "Candidate"}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                onClick={() => setHiringPacketModalOpen(false)}
                style={{ border: "none", background: "transparent", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", backgroundColor: "#fafbfc" }}>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Consolidated debrief packet containing candidate qualifications, RAG match rationale, scorecard evaluations, approval signatures, and compensation terms.
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleCopyHiringPacket}
                  className="btn btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  {copiedPacket ? <Check size={13} color="var(--accent-green)" /> : <Copy size={13} />}
                  <span>{copiedPacket ? "Copied Markdown!" : "Copy Markdown"}</span>
                </button>
                <a
                  href={api.getHiringPacketDownloadUrl(candidate.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none" }}
                >
                  <Download size={13} />
                  <span>Download .md File</span>
                </a>
              </div>
            </div>

            <div style={{ padding: "20px", overflowY: "auto", flex: 1, backgroundColor: "#f8fafc" }}>
              <pre
                style={{
                  fontFamily: "monospace",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  color: "#1e293b",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  backgroundColor: "#ffffff",
                  padding: "18px 20px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {hiringPacketMarkdown}
              </pre>
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setHiringPacketModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateDossierPage;
