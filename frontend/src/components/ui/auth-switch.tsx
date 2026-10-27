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
  Shield,
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

  // Form Fields (Candidate registration)
  const [name, setName] = useState<string>("");
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
        } else if (me.role === "admin") {
          navigate("/admin", { replace: true });
        } else if (me.role === "approver") {
          navigate("/approvals", { replace: true });
        } else if (me.role === "interviewer") {
          navigate("/interviewer", { replace: true });
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

  const handleQuickLogin = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setLoading(true);
    try {
      await login({ email: demoEmail, password: demoPass });
      if (onSuccess) {
        onSuccess();
      } else {
        const me = await api.getMe();
        if (me.role === "candidate") {
          navigate("/portal", { replace: true });
        } else if (me.role === "admin") {
          navigate("/admin", { replace: true });
        } else if (me.role === "approver") {
          navigate("/approvals", { replace: true });
        } else if (me.role === "interviewer") {
          navigate("/interviewer", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError("Demo login failed. Please try again.");
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

    setLoading(true);
    try {
      await register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        role: "candidate",
      });

      if (onSuccess) {
        onSuccess();
      } else {
        navigate("/portal", { replace: true });
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
                } else if (user.role === "admin") {
                  navigate("/admin");
                } else if (user.role === "approver") {
                  navigate("/approvals");
                } else if (user.role === "interviewer") {
                  navigate("/interviewer");
                } else {
                  navigate("/");
                }
              }}
            >
              <span>
                Go to{" "}
                {user.role === "candidate"
                  ? "Candidate Portal"
                  : user.role === "admin"
                  ? "Admin Console"
                  : user.role === "interviewer"
                  ? "Interview Console"
                  : user.role === "approver"
                  ? "Approvals Queue"
                  : "Dashboard"}
              </span>
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
            1. CANDIDATE SIGN UP FORM CONTAINER (Left Half)
           ================================================================== */}
        <div className="as-form-signup-container">
          <div className="as-form-content">
            <h1 className="as-title">Candidate Sign up</h1>
            <p className="as-subtitle">
              Create your profile to apply, track application status, and schedule interviews.
            </p>

            {/* Error Notification */}
            {error && isSignUp && (
              <div className="as-error-box">
                <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSignUp} style={{ width: "100%", marginTop: 8 }}>
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
                  placeholder="Full Name"
                />
              </div>

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

              <div className="as-company-notice">
                <Shield size={12} className="as-notice-icon" />
                <span>
                  Company member or recruiter? Accounts are provisioned by your System Administrator. Use <strong>Sign In</strong> to access your portal.
                </span>
              </div>
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

            {/* Demo Helper & 1-Click Login Shortcuts */}
            <div className="as-demo-helper">
              <span className="as-demo-label">1-Click Demo Login Shortcuts:</span>
              <div className="as-demo-links">
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => handleQuickLogin("hr@resumo.ai", "Password123!")}
                  title="1-Click Login as Recruiter / Talent Ops"
                >
                  Recruiter
                </button>
                <span className="as-demo-sep">·</span>
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => handleQuickLogin("interviewer@resumo.ai", "Password123!")}
                  title="1-Click Login as Technical Interviewer"
                >
                  Interviewer
                </button>
                <span className="as-demo-sep">·</span>
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => handleQuickLogin("approver@resumo.ai", "Password123!")}
                  title="1-Click Login as Hiring Manager (Approver)"
                >
                  Hiring Manager
                </button>
                <span className="as-demo-sep">·</span>
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => handleQuickLogin("admin@resumo.ai", "Password123!")}
                  title="1-Click Login as System Administrator"
                >
                  Administrator
                </button>
                <span className="as-demo-sep">·</span>
                <button
                  type="button"
                  className="as-demo-fill-btn"
                  onClick={() => handleQuickLogin("candidate@resumo.ai", "Password123!")}
                  title="1-Click Login as Candidate (Alex Rivera)"
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
