import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError } from "@/api/client";
import { getUserDisplayName } from "@/lib/user";
import {
  User as UserIcon,
  Mail,
  Lock,
  AlertCircle,
  LogOut,
  ArrowRight,
  UserCheck,
  Briefcase,
  Building2,
} from "lucide-react";
import "./auth-switch.css";

export interface AuthSwitchProps {
  initialMode?: "login" | "register";
  className?: string;
  onSuccess?: () => void;
}

export const AuthSwitch: React.FC<AuthSwitchProps> = ({
  initialMode = "login",
  className,
  onSuccess,
}) => {
  const { login, register, logout, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Mode: isSignUp true = Sign Up (left form active)
  //       isSignUp false = Sign In (right form active)
  const [isSignUp, setIsSignUp] = useState<boolean>(initialMode === "register");

  // Role Selection for Sign Up: "candidate" | "hr"
  const [role, setRole] = useState<"candidate" | "hr">("candidate");

  // Form Fields
  const [name, setName] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      if (onSuccess) {
        onSuccess();
      } else {
        const me = await api.getMe();
        if (me.role === "candidate") {
          navigate("/portal", { replace: true });
        } else if (me.role === "approver") {
          navigate("/approvals", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Invalid email or password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    const autoCompanyName = companyName.trim()
      ? companyName.trim()
      : name.trim()
      ? `${name.trim()}'s Organization`
      : `${email.trim().split("@")[0].replace(/[^a-zA-Z0-9]/g, " ")}'s Organization`;

    setLoading(true);
    try {
      await register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        role,
        company_name: role === "hr" ? autoCompanyName : undefined,
      });

      if (onSuccess) {
        onSuccess();
      } else {
        if (role === "candidate") {
          navigate("/portal", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Sign up failed. Please check your details and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("as-page", className)}>
      {/* Top Banner if user is already logged in (allows switching account or going directly to dashboard) */}
      {isAuthenticated && user && (
        <div className="as-active-session-bar">
          <div className="as-session-info">
            <span className="as-session-dot" />
            <span>
              Signed in as <strong>{getUserDisplayName(user)}</strong> ({user.email}) (
              <span style={{ textTransform: "uppercase" }}>{user.role}</span>
              {user.approver_role ? `:${user.approver_role}` : ""})
            </span>
          </div>
          <div className="as-session-actions">
            <button
              type="button"
              className="as-session-btn-primary"
              onClick={() => {
                if (user.role === "candidate") {
                  navigate("/portal");
                } else if (user.role === "approver") {
                  navigate("/approvals");
                } else {
                  navigate("/");
                }
              }}
            >
              <span>Go to {user.role === "candidate" ? "Candidate Portal" : "Dashboard"}</span>
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              className="as-session-btn-outline"
              onClick={() => {
                logout();
                setEmail("");
                setPassword("");
                setError(null);
              }}
            >
              <LogOut size={13} />
              <span>Sign Out to Switch Account</span>
            </button>
          </div>
        </div>
      )}

      <div className={cn("as-card", isSignUp ? "mode-signup" : "mode-signin")}>
        {/* ==================================================================
            1. SIGN UP FORM CONTAINER (Left Half)
           ================================================================== */}
        <div className="as-form-signup-container">
          <div className="as-form-content">
            <h1 className="as-title">Sign up</h1>

            {/* Role Selection: Candidate vs HR */}
            <div className="as-role-selector" role="radiogroup" aria-label="Select Account Type">
              <button
                type="button"
                className={cn("as-role-btn", role === "candidate" && "active")}
                onClick={() => setRole("candidate")}
                role="radio"
                aria-checked={role === "candidate"}
              >
                <UserCheck size={14} />
                <span>Candidate</span>
              </button>
              <button
                type="button"
                className={cn("as-role-btn", role === "hr" && "active")}
                onClick={() => setRole("hr")}
                role="radio"
                aria-checked={role === "hr"}
              >
                <Briefcase size={14} />
                <span>Recruiter</span>
              </button>
            </div>

            {/* Error Notification */}
            {error && isSignUp && (
              <div className="as-error-box">
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSignUp} style={{ width: "100%", marginTop: 4 }}>
              {/* Full Name / Username Input */}
              <div className="as-input-group">
                <span className="as-input-icon">
                  <UserIcon />
                </span>
                <input
                  type="text"
                  className="as-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={role === "candidate" ? "Full Name" : "Your Name"}
                />
              </div>

              {/* Company Name (only shown if HR is selected) */}
              {role === "hr" && (
                <div className="as-input-group">
                  <span className="as-input-icon">
                    <Building2 />
                  </span>
                  <input
                    type="text"
                    className="as-input"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Organization / Company Name"
                  />
                </div>
              )}

              {/* Email Input */}
              <div className="as-input-group">
                <span className="as-input-icon">
                  <Mail />
                </span>
                <input
                  type="email"
                  className="as-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                />
              </div>

              {/* Password Input */}
              <div className="as-input-group">
                <span className="as-input-icon">
                  <Lock />
                </span>
                <input
                  type="password"
                  className="as-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 8 characters)"
                  required
                />
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="as-btn-primary"
              >
                {loading ? "CREATING..." : "SIGN UP"}
              </button>
            </form>
          </div>
        </div>

        {/* ==================================================================
            2. SIGN IN FORM CONTAINER (Right Half)
           ================================================================== */}
        <div className="as-form-signin-container">
          <div className="as-form-content">
            <h1 className="as-title">Sign in</h1>

            {/* Error Notification */}
            {error && !isSignUp && (
              <div className="as-error-box">
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSignIn} style={{ width: "100%", marginTop: 8 }}>
              {/* Email Input */}
              <div className="as-input-group">
                <span className="as-input-icon">
                  <Mail />
                </span>
                <input
                  type="email"
                  className="as-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                />
              </div>

              {/* Password Input */}
              <div className="as-input-group">
                <span className="as-input-icon">
                  <Lock />
                </span>
                <input
                  type="password"
                  className="as-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="as-btn-primary"
              >
                {loading ? "SIGNING IN..." : "SIGN IN"}
              </button>
            </form>

            {/* Demo Helper & Autofill Shortcuts */}
            <div className="as-demo-helper">
              <span className="as-demo-label">Demo credentials autofill:</span>
              <div className="as-demo-links">
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => {
                    setEmail("hr@resumo.ai");
                    setPassword("Password123!");
                    setError(null);
                  }}
                  title="Autofill Recruiter credentials"
                >
                  Recruiter
                </button>
                <span className="as-demo-sep">·</span>
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => {
                    setEmail("approver@resumo.ai");
                    setPassword("Password123!");
                    setError(null);
                  }}
                  title="Autofill Approver (Hiring Manager) credentials"
                >
                  Approver
                </button>
                <span className="as-demo-sep">·</span>
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => {
                    setEmail("admin@resumo.ai");
                    setPassword("Password123!");
                    setError(null);
                  }}
                  title="Autofill System Administrator credentials"
                >
                  Administrator
                </button>
                <span className="as-demo-sep">·</span>
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => {
                    setEmail("candidate@resumo.ai");
                    setPassword("Password123!");
                    setError(null);
                  }}
                  title="Autofill Candidate credentials"
                >
                  Candidate
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ==================================================================
            3. SLIDING RIGHT PURPLE PANEL ("One of us?")
               Visible in Sign Up mode on right, slides out to right in Sign In
           ================================================================== */}
        <div className="as-overlay-right">
          <svg
            className="as-panel-svg"
            viewBox="0 0 960 560"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="purpleGradRight" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6452ce" />
                <stop offset="100%" stopColor="#533eb6" />
              </linearGradient>
            </defs>
            <path
              d="M 510,0 C 400,140 400,380 680,560 L 960,560 L 960,0 Z"
              fill="url(#purpleGradRight)"
            />
          </svg>

          <div className="as-panel-content-right">
            <h2 className="as-overlay-title">One of us?</h2>
            <p className="as-overlay-desc">
              Welcome back! Sign in to continue your journey with us.
            </p>
            <button
              type="button"
              className="as-btn-outline"
              onClick={() => {
                setError(null);
                setIsSignUp(false);
              }}
            >
              SIGN IN
            </button>
          </div>
        </div>

        {/* ==================================================================
            4. SLIDING LEFT PURPLE PANEL ("New here?")
               Visible in Sign In mode on left, slides out to left in Sign Up
           ================================================================== */}
        <div className="as-overlay-left">
          <svg
            className="as-panel-svg"
            viewBox="0 0 960 560"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="purpleGradLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6452ce" />
                <stop offset="100%" stopColor="#533eb6" />
              </linearGradient>
            </defs>
            <path
              d="M 0,0 L 450,0 C 560,140 560,380 280,560 L 0,560 Z"
              fill="url(#purpleGradLeft)"
            />
          </svg>

          <div className="as-panel-content-left">
            <h2 className="as-overlay-title">New here?</h2>
            <p className="as-overlay-desc">
              Sign up and discover a world of opportunities with ReSumo.
            </p>
            <button
              type="button"
              className="as-btn-outline"
              onClick={() => {
                setError(null);
                setIsSignUp(true);
              }}
            >
              SIGN UP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Component = AuthSwitch;
export default AuthSwitch;
