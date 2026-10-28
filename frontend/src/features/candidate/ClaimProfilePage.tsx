import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  Sparkles,
  CheckCircle,
  AlertCircle,
  Lock,
  User,
  Briefcase,
  Phone,
  ArrowRight,
  ShieldCheck,
  Building,
} from "lucide-react";
import { api, setStoredToken } from "../../api/client";
import type { ClaimProfileVerificationResponse } from "../../api/types";
import { useAuth } from "../../context/AuthContext";

export const ClaimProfilePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const token = searchParams.get("token") || "";

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ClaimProfileVerificationResponse | null>(null);

  // Form fields
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setError("No claim token provided. Please use the exact link sent to your email.");
      setIsLoading(false);
      return;
    }

    const verify = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.verifyClaimToken(token);
        if (res.is_expired) {
          setError("This invitation link has expired. Please contact the hiring team for a fresh invite.");
        } else {
          setProfileData(res);
          setName(res.name || "");
        }
      } catch (err: any) {
        setError(err.message || "Invalid or unrecognized invitation token.");
      } finally {
        setIsLoading(false);
      }
    };

    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!password) {
      setSubmitError("Please choose a secure password.");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.activateClaimedProfile({
        token,
        password,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });

      // Save token and refresh authenticated context
      setStoredToken(response.access_token);
      await refreshUser();

      // Navigate to candidate home / portal
      navigate("/", { replace: true });
    } catch (err: any) {
      setSubmitError(err.message || "Failed to activate profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            ReSumo
          </span>
          <span className="text-xs uppercase px-2.5 py-0.5 rounded-full font-semibold bg-indigo-900/40 text-indigo-300 border border-indigo-700/50">
            Talent Sourcing
          </span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-xl text-center backdrop-blur-md">
            <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-200">Verifying your invitation...</h3>
            <p className="text-sm text-slate-400 mt-1">Retrieving requisition details and parsing profile</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="bg-slate-900/80 border border-rose-900/50 rounded-2xl p-8 shadow-xl text-center backdrop-blur-md">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold text-slate-100">Unable to Verify Invitation</h3>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">{error}</p>
            <div className="mt-6 flex justify-center gap-4">
              <Link
                to="/login"
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        )}

        {/* Profile Claim Card */}
        {!isLoading && !error && profileData && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md">
            {/* Header Banner */}
            <div className="p-6 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border-b border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
                <Building className="w-3.5 h-3.5" />
                {profileData.company_name || "Hiring Team"}
              </div>
              <h2 className="text-2xl font-bold text-white">
                You've been invited for {profileData.job_title || "an Open Requisition"}
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                A recruiter identified your background as a high-potential match for this position. Claim your pre-parsed profile below to activate your account and review your status.
              </p>
            </div>

            {/* Candidate Pre-parsed Profile Summary */}
            <div className="p-6 border-b border-slate-800/80 bg-slate-950/30">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Pre-Parsed Candidate Snapshot
                </span>
                {profileData.match_score !== null && profileData.match_score !== undefined && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Match: {Math.round(profileData.match_score * 100)}%
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-xs text-slate-400 block mb-1">Target Requisition</span>
                  <div className="font-medium text-slate-200 flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <span className="truncate">{profileData.job_title || "General Candidate Pool"}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-xs text-slate-400 block mb-1">Identified Role Tier</span>
                  <div className="font-medium text-slate-200 uppercase tracking-wider text-xs flex items-center gap-1.5 mt-0.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>{profileData.role_tier || "Standard"}</span>
                    {profileData.years_experience !== null && profileData.years_experience !== undefined && (
                      <span className="text-slate-400 normal-case font-normal ml-1">
                        ({profileData.years_experience} yrs exp)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {profileData.core_skills && profileData.core_skills.length > 0 && (
                <div className="mt-3">
                  <span className="text-xs text-slate-400 block mb-1.5">Identified Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {profileData.core_skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Activation Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-400" />
                  Set Your Password to Claim Profile
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Your profile and application history will be immediately accessible in the Candidate Portal.
                </p>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Phone Number (Optional)</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">New Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      <span>Activating Profile...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Claim Profile & Enter Candidate Portal</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              </div>

              <div className="text-center text-xs text-slate-500 pt-2">
                Already claimed this profile?{" "}
                <Link to="/login" className="text-indigo-400 hover:text-indigo-300 underline">
                  Sign in here
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClaimProfilePage;
