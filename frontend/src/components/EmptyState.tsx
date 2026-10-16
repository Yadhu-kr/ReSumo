import React from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        border: "1.5px dashed var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        backgroundColor: "var(--bg-surface)",
        boxShadow: "0 4px 20px rgba(35, 15, 75, 0.03)",
        margin: "16px 0",
      }}
    >
      <div
        style={{
          fontSize: "14.5px",
          color: "var(--text-primary)",
          fontWeight: 700,
          letterSpacing: "-0.01em",
          marginBottom: description ? "8px" : "0",
        }}
      >
        {title}
      </div>
      {description && (
        <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", maxWidth: "460px", margin: "0 auto 18px auto", lineHeight: "1.5" }}>
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
};
