import React from "react";
import type { RoleTier } from "../api/types";

interface StepConfig {
  step_order: number;
  role: string;
}

const DEFAULT_TIER_CHAINS: Record<RoleTier, StepConfig[]> = {
  junior: [{ step_order: 1, role: "Hiring Manager" }],
  mid: [{ step_order: 1, role: "Hiring Manager" }],
  senior: [
    { step_order: 1, role: "Director" },
    { step_order: 2, role: "VP" },
  ],
  exec: [{ step_order: 1, role: "CEO" }],
};

interface EscalationTrackerProps {
  roleTier: RoleTier | string;
  currentStepOrder?: number;
  status: string; // 'uploaded', 'parsed', 'shortlisted', 'pending_approval', 'approved', 'rejected'
  activeApproverRole?: string;
}

export const EscalationTracker: React.FC<EscalationTrackerProps> = ({
  roleTier,
  currentStepOrder = 1,
  status,
  activeApproverRole,
}) => {
  const tierKey = (roleTier || "junior").toLowerCase() as RoleTier;
  const steps = DEFAULT_TIER_CHAINS[tierKey] || DEFAULT_TIER_CHAINS.junior;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      {steps.map((step, idx) => {
        const isCurrent =
          status === "pending_approval" &&
          (activeApproverRole
            ? step.role.toLowerCase().replace(/\s+/g, "_") === activeApproverRole.toLowerCase()
            : step.step_order === currentStepOrder);

        const isPast =
          status === "approved" ||
          (status === "pending_approval" && step.step_order < currentStepOrder);

        const isRejected = status === "rejected" && step.step_order === currentStepOrder;

        let pillColor = "var(--bg-surface-elevated)";
        let textColor = "var(--text-secondary)";
        let borderColor = "var(--border-subtle)";
        let statusTag = "QUEUED";

        if (isCurrent) {
          pillColor = "var(--status-pending-bg)";
          textColor = "var(--status-pending-text)";
          borderColor = "var(--status-pending-border)";
          statusTag = "PENDING REVIEW";
        } else if (isPast) {
          pillColor = "var(--status-approved-bg)";
          textColor = "var(--status-approved-text)";
          borderColor = "var(--status-approved-border)";
          statusTag = "PASSED";
        } else if (isRejected) {
          pillColor = "var(--status-rejected-bg)";
          textColor = "var(--status-rejected-text)";
          borderColor = "var(--status-rejected-border)";
          statusTag = "REJECTED";
        }

        return (
          <React.Fragment key={step.step_order}>
            {idx > 0 && <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>&rarr;</span>}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: pillColor,
                border: `1px solid ${borderColor}`,
                fontSize: "11px",
              }}
            >
              <span className="mono" style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                T{step.step_order}
              </span>
              <span style={{ fontWeight: 600, color: textColor }}>{step.role}</span>
              <span
                className="mono"
                style={{
                  fontSize: "9.5px",
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: "rgba(255, 255, 255, 0.8)",
                  color: textColor,
                }}
              >
                {statusTag}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
