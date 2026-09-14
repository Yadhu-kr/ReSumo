import type { User, UserRole, ApproverRole } from "../api/types";

/**
 * Derives the human-friendly display name for a user.
 * Prioritizes:
 * 1. user.name (if set by the user)
 * 2. Standard demo account personas (e.g. hr@resumo.ai -> Sarah Jenkins)
 * 3. Title-cased name derived from email prefix (e.g. john.doe@company.com -> John Doe)
 */
export function getUserDisplayName(
  user?: Partial<User> | { name?: string | null; email?: string } | null
): string {
  if (!user) return "Guest";
  if (user.name && user.name.trim()) {
    return user.name.trim();
  }

  const email = (user.email || "").toLowerCase().trim();
  if (!email) return "Anonymous User";

  // Demo accounts standard persona mapping
  switch (email) {
    case "hr@resumo.ai":
      return "Sarah Jenkins";
    case "admin@resumo.ai":
      return "System Administrator";
    case "candidate@resumo.ai":
      return "Alex Rivera";
    case "approver@resumo.ai":
      return "David Chen";
    case "director@resumo.ai":
      return "Elena Rostova";
    case "vp@resumo.ai":
      return "Marcus Vance";
    default:
      break;
  }

  // Fallback: format email prefix into a friendly capitalized name
  const prefix = email.split("@")[0] || "";
  const cleaned = prefix
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return cleaned || email;
}

/**
 * Derives two-letter initials for user avatar displays.
 */
export function getUserInitials(
  user?: Partial<User> | { name?: string | null; email?: string } | null
): string {
  const name = getUserDisplayName(user);
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Returns human-readable role labels matching the new design language:
 * - "hr" -> "Recruiter"
 * - "admin" -> "Administrator"
 * - "candidate" -> "Candidate"
 * - "approver" -> "Administrator ({tier})"
 */
export function getRoleBadgeLabel(
  role?: UserRole | string,
  approverRole?: ApproverRole | string | null
): string {
  if (role === "candidate") return "Candidate";
  if (role === "hr") return "Recruiter";
  if (role === "admin") return "Administrator";
  if (role === "approver") {
    switch (approverRole) {
      case "hiring_manager":
        return "Administrator (Hiring Mgr)";
      case "director":
        return "Administrator (Director)";
      case "vp":
        return "Administrator (VP)";
      case "ceo":
        return "Administrator (CEO)";
      default:
        return "Administrator";
    }
  }
  return "Member";
}

/**
 * Deterministic pleasant gradient colors for avatars.
 */
export function getAvatarGradient(name: string): string {
  const gradients = [
    "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
    "linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%)",
    "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
    "linear-gradient(135deg, #10b981 0%, #06b6d4 100%)",
    "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}
