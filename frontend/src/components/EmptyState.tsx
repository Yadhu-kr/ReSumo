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
        className="mono"
        style={{
          fontSize: "12px",
          color: "var(--text-secondary)",
          fontWeight: 600,
          letterSpacing: "0.02em",
          marginBottom: description ? "6px" : "0",
        }}
      >
        {title.toUpperCase()}
      </div>
      {description && (
        <p style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "420px", margin: "0 auto 16px auto" }}>
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
};
