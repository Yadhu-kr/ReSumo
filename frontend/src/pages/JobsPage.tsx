import React from "react";
import { useAuth } from "../context/AuthContext";
import { CandidateJobsPage } from "../features/candidate/CandidateJobsPage";
import { RecruiterJobsPage } from "../features/recruiter/RecruiterJobsPage";

/**
 * Role-adaptive Jobs Page:
 * - Candidates see the sleek, uncluttered CandidateJobsPage with 1-click apply and role requirements.
 * - Recruiters, Administrators, and Approvers see the operational RecruiterJobsPage with ChromaDB RAG matching,
 *   vector similarity thresholds, and requisitions management.
 */
export const JobsPage: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === "candidate") {
    return <CandidateJobsPage />;
  }
  return <RecruiterJobsPage />;
};

export default JobsPage;
