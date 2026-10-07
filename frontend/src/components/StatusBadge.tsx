import React from "react";
import type { CandidateStatus } from "../api/types";

interface StatusBadgeProps {
  status: CandidateStatus | string;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = "" }) => {
  let badgeClass = "badge-neutral";
  let label = status;

  switch (status) {
    case "approved":
      badgeClass = "badge-approved";
      label = "APPROVED";
      break;
    case "pending_approval":
      badgeClass = "badge-pending";
      label = "PENDING APPROVAL";
      break;
    case "shortlisted":
      badgeClass = "badge-shortlisted";
      label = "SHORTLISTED";
      break;
    case "parsed":
      badgeClass = "badge-neutral";
      label = "PARSED";
      break;
    case "uploaded":
      badgeClass = "badge-neutral";
      label = "UPLOADED";
      break;
    case "rejected":
      badgeClass = "badge-rejected";
      label = "REJECTED";
      break;
    case "extraction_failed":
      badgeClass = "badge-extraction-failed";
      label = "EXTRACTION FAILED";
      break;
  }

  return <span className={`badge ${badgeClass} ${className}`}>{label}</span>;
};
