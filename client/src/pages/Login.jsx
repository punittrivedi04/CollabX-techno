import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCw,
  KeyRound,
} from "lucide-react";
import { getHomeRouteForUser } from "../utils/roles";

const CAMPUS_BG_PRIMARY = "/22.png";
const CAMPUS_BG_FALLBACK = "/techno.webp";

const LEFT_CAMPUS_PRIMARY = "/3.png";
const LEFT_CAMPUS_FALLBACK = "/techno.webp";

const TECHNO_LOGO_PRIMARY = "/techno-logo.jpeg";
const TECHNO_LOGO_FALLBACK = "/Untitled-design-2.png";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, forgotPassword, resetPassword, resendOtp } = useAuth();

  // View modes: "login" | "forgot_email" | "forgot_reset"
  const [mode, setMode] = useState("login");

  // Resilient image fallbacks for local public assets
  const [bgSrc, setBgSrc] = useState(CAMPUS_BG_PRIMARY);
  const [leftSrc, setLeftSrc] = useState(LEFT_CAMPUS_PRIMARY);
  const [logoSrc, setLogoSrc] = useState(TECHNO_LOGO_PRIMARY);

  // Sign-in form state
  const [form, setForm] = useState({
    email: location.state?.email || "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [successMessage, setSuccessMessage] = useState(
    location.state?.message || "",
  );
  const [loading, setLoading] = useState(false);

  // Forgot-password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotToken, setForgotToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (location.state?.email) {
      setForm((prev) => ({ ...prev, email: location.state.email }));
      setForgotEmail(location.state.email);
    }
  }, [location.state?.email]);

  useEffect(() => {
    if (mode !== "forgot_reset" || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [mode, timeLeft]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const cleanEmail = form.email.trim();
    if (!cleanEmail) {
      setError("Please enter your registered email address.");
      return;
    }
    if (!form.password) {
      setError("Please enter your password.");
      return;
    }

    setError("");
    setErrorCode("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const authData = await login(cleanEmail, form.password);
      navigate(getHomeRouteForUser(authData?.user), { replace: true });
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || err?.code || "");

      // Handle unverified accounts: redirect to OTP verification screen
      if (data?.code === "ACCOUNT_NOT_VERIFIED" || data?.requiresOtp) {
        navigate("/register", {
          state: {
            email: cleanEmail,
            step: "otp",
            otpToken: data.otpToken,
            message:
              data?.message ||
              "Your email has not been verified. A 6-digit verification code has been sent to your email.",
          },
        });
        return;
      }

      setError(
        data?.message ||
          err?.message ||
          "Unable to sign in. Please verify your email and password.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotEmailSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const emailToUse = (forgotEmail || form.email).trim();
    if (!emailToUse) {
      setError("Please enter your registered email address.");
      return;
    }

    setError("");
    setErrorCode("");
    setLoading(true);

    try {
      const res = await forgotPassword(emailToUse);
      setForgotToken(res.otpToken);
      setForgotEmail(emailToUse);
      setTimeLeft(120);
      setForgotOtp("");
      setMode("forgot_reset");
      setSuccessMessage(
        res.message ||
          "A 6-digit verification code has been sent to your email.",
      );
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || err?.code || "");
      setError(
        data?.message ||
          err?.message ||
          "Failed to send verification code. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendResetOtp = async () => {
    if (resending || !forgotEmail) return;
    setResending(true);
    setError("");
    setErrorCode("");
    try {
      const res = await resendOtp(forgotEmail, "reset_password");
      setForgotToken(res.otpToken);
      setTimeLeft(120);
      setSuccessMessage("A fresh 6-digit code has been sent to your email.");
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || err?.code || "");
      setError(
        data?.message ||
          err?.message ||
          "Failed to resend verification code. Please try again.",
      );
    } finally {
      setResending(false);
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setError("");
    setErrorCode("");

    if (!forgotOtp.trim() || forgotOtp.trim().length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await resetPassword(
        forgotEmail,
        forgotOtp.trim(),
        forgotToken,
        newPassword,
      );
      setMode("login");
      setForm((prev) => ({ ...prev, email: forgotEmail, password: "" }));
      setSuccessMessage(
        res.message ||
          "Password updated. Please sign in with your new credentials.",
      );
      setError("");
      setErrorCode("");
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || err?.code || "");
      setError(
        data?.message ||
          err?.message ||
          "Failed to reset password. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        fontFamily:
          '"Inter", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-x-hidden bg-[#161817] px-4 py-5 text-[#202124] antialiased selection:bg-[#36B56B]/20 selection:text-[#202124] sm:px-6 sm:py-7"
    >
      {/* Full-Screen Techno NJR Campus Background */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <img
          src={bgSrc}
          alt=""
          aria-hidden="true"
          onError={() => {
            if (bgSrc !== CAMPUS_BG_FALLBACK) {
              setBgSrc(CAMPUS_BG_FALLBACK);
            }
          }}
          className="h-full w-full scale-[1.015] object-cover object-center brightness-[0.86] contrast-[1.03] blur-[2px]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(20, 22, 21, 0.44) 0%, rgba(20, 22, 21, 0.34) 48%, rgba(16, 18, 17, 0.56) 100%)",
          }}
        />
      </div>

      {/* Single Unified Parent Wrapper */}
      <div className="relative z-10 w-full max-w-[1040px]">
        {/* CollabX Branding Bar with Techno NJR Logo on Right */}
        <header className="w-full">
          <nav
            aria-label="Primary"
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[#F8F8F6]/96 px-4 py-2.5 shadow-sm backdrop-blur-md sm:px-5"
          >
         <a aria-current="page" className="inline-flex shrink-0 items-baseline px-1 py-1 text-lg font-extrabold tracking-tight text-[#141A18] transition-opacity hover:opacity-85 sm:text-xl active" href="/dashboard" data-discover="true"><span>CollabX</span><span className="text-[#1E6B4B]">.</span></a>

            <div className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-2.5 py-1">
              <img
                src={logoSrc}
                alt="Techno NJR"
                onError={() => {
                  if (logoSrc !== TECHNO_LOGO_FALLBACK) {
                    setLogoSrc(TECHNO_LOGO_FALLBACK);
                  }
                }}
                className="h-4 w-4 rounded-full object-cover"
              />
              <a href="https://technonjr.org/" target="_blank" rel="noopener noreferrer">
              <span className="text-[11px] font-semibold tracking-tight text-[#202124]">
                Techno NJR
              </span>
              </a>
            </div>
          </nav>
        </header>

        {/* Main Split-Screen Authentication Card */}
        <main className="mt-5 grid w-full overflow-hidden rounded-2xl border border-black/12 bg-[#F8F8F6] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.38)] sm:mt-[28px] lg:min-h-[540px] lg:grid-cols-12">
          {/* Left Section: Clean Campus Photo */}
          <aside className="relative flex min-h-[210px] flex-col justify-end overflow-hidden border-b border-black/10 bg-[#1B1D1C] text-white sm:min-h-[250px] lg:col-span-5 lg:min-h-full lg:rounded-l-2xl lg:border-b-0 lg:border-r">
            <img
              src={leftSrc}
              alt="Techno NJR Institute of Technology Campus"
              onError={() => {
                if (leftSrc !== LEFT_CAMPUS_FALLBACK) {
                  setLeftSrc(LEFT_CAMPUS_FALLBACK);
                }
              }}
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(18, 20, 19, 0.08) 0%, rgba(18, 20, 19, 0.28) 48%, rgba(15, 17, 16, 0.86) 100%)",
              }}
            />

            <div className="relative z-10 p-5 sm:p-7">
              <h2 className="text-xl font-semibold leading-[1.2] tracking-tight text-white sm:text-2xl">
                Your Campus. Your Community. Your Collaboration.
              </h2>

              <p className="mt-2.5 text-xs leading-relaxed text-white/80 sm:text-[13px]">
                CollabX connects students, faculty mentors, and academic teams
                to plan projects, track deliverables, and showcase campus work
                in one workspace.
              </p>
            </div>
          </aside>

          {/* Right Section: Spacious Warm-White Form */}
          <section
            aria-label="Authentication"
            className="flex flex-col justify-center bg-[#F8F8F6] px-6 py-8 sm:px-10 sm:py-11 lg:col-span-7 lg:px-14 lg:py-12"
          >
            <div className="mx-auto w-full max-w-[430px]">
              {/* VIEW 1: SIGN IN */}
              {mode === "login" && (
                <>
                  <div className="mb-7">
                    <h1 className="text-2xl font-semibold tracking-tight text-[#202124] sm:text-[28px]">
                      Welcome back.
                    </h1>
                    <p className="mt-2 text-xs leading-relaxed text-[#5F6368] sm:text-sm">
                      Sign in to continue your campus journey.
                    </p>
                  </div>

                  {successMessage && (
                    <div
                      role="status"
                      className="mb-6 flex items-start gap-2.5 rounded-xl border border-[#36B56B]/35 bg-[#36B56B]/10 p-3.5 text-xs font-medium text-[#184E2F] sm:text-sm"
                    >
                      <CheckCircle2
                        size={17}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-[#269353]"
                      />
                      <span>{successMessage}</span>
                    </div>
                  )}

                  {errorCode === "USER_NOT_FOUND" ? (
                    <div
                      role="alert"
                      className="mb-6 rounded-xl border border-amber-300/90 bg-amber-50/90 p-4 text-xs text-amber-950 sm:text-sm"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle
                          size={18}
                          strokeWidth={1.85}
                          className="mt-0.5 shrink-0 text-amber-700"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-amber-950">
                            Account not found
                          </p>
                          <p className="mt-1 break-all text-xs text-amber-900/90">
                            We couldn&apos;t find a CollabX account for{" "}
                            <span className="font-semibold text-[#202124]">
                              {form.email}
                            </span>
                            .
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              navigate("/register", {
                                state: { email: form.email },
                              })
                            }
                            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#202124] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#323438] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124]"
                          >
                            <span>Create account</span>
                            <ArrowRight size={13} strokeWidth={1.85} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : error ? (
                    <div
                      role="alert"
                      className="mb-6 flex items-start gap-2.5 rounded-xl border border-[#B91C1C]/25 bg-[#FEF2F2] p-3.5 text-xs font-medium text-[#991B1B] sm:text-sm"
                    >
                      <AlertCircle
                        size={17}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-[#B91C1C]"
                      />
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <form
                    onSubmit={handleLoginSubmit}
                    noValidate
                    className="space-y-5"
                  >
                    <div>
                      <label
                        htmlFor="login-email"
                        className="mb-2 block text-xs font-medium text-[#202124]"
                      >
                        Email address
                      </label>
                      <div className="relative">
                        <Mail
                          size={16}
                          strokeWidth={1.85}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6E7278]"
                        />
                        <input
                          id="login-email"
                          required
                          type="email"
                          autoComplete="email"
                          placeholder="you@technonjr.org"
                          value={form.email}
                          onChange={(e) => {
                            if (error) setError("");
                            setForm({ ...form, email: e.target.value });
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-3 pl-10 pr-4 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label
                          htmlFor="login-password"
                          className="block text-xs font-medium text-[#202124]"
                        >
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setForgotEmail(form.email);
                            setError("");
                            setErrorCode("");
                            setSuccessMessage("");
                            setMode("forgot_email");
                          }}
                          className="cursor-pointer text-xs font-medium text-[#5F6368] transition-colors hover:text-[#202124] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124]"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <LockKeyhole
                          size={16}
                          strokeWidth={1.85}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6E7278]"
                        />
                        <input
                          id="login-password"
                          required
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="Enter your password"
                          value={form.password}
                          onChange={(e) => {
                            if (error) setError("");
                            setForm({ ...form, password: e.target.value });
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-3 pl-10 pr-11 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          aria-pressed={showPassword}
                          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-[#6E7278] transition-colors hover:text-[#202124] focus-visible:outline-2 focus-visible:outline-[#202124]"
                        >
                          {showPassword ? (
                            <EyeOff size={16} strokeWidth={1.85} />
                          ) : (
                            <Eye size={16} strokeWidth={1.85} />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#202124] py-3.5 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-[#2F3136] active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>{loading ? "Signing in..." : "Sign In"}</span>
                      {!loading && (
                        <ArrowRight
                          size={16}
                          strokeWidth={1.85}
                          className="text-[#36B56B] transition-transform duration-150 group-hover:translate-x-0.5"
                        />
                      )}
                    </button>
                  </form>

                  <p className="mt-7 border-t border-black/8 pt-5 text-center text-xs text-[#5F6368] sm:text-sm">
                    Don&apos;t have an account?{" "}
                    <Link
                      to="/register"
                      state={{ email: form.email }}
                      className="font-semibold text-[#202124] underline decoration-[#36B56B] decoration-2 underline-offset-4 transition-colors hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124]"
                    >
                      Create account
                    </Link>
                  </p>
                </>
              )}

              {/* VIEW 2: FORGOT PASSWORD - STEP 1 (ENTER EMAIL) */}
              {mode === "forgot_email" && (
                <>
                  <div className="mb-7">
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setErrorCode("");
                        setMode("login");
                      }}
                      className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#5F6368] transition-colors hover:text-[#202124] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124]"
                    >
                      <ArrowLeft size={14} strokeWidth={1.85} />
                      <span>Back to sign in</span>
                    </button>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white text-[#202124] shadow-2xs">
                      <KeyRound size={18} strokeWidth={1.85} />
                    </div>
                    <h1 className="text-xl font-semibold tracking-tight text-[#202124] sm:text-2xl">
                      Reset password.
                    </h1>
                    <p className="mt-2 text-xs leading-relaxed text-[#5F6368] sm:text-sm">
                      Enter your registered email to receive a 6-digit
                      verification code.
                    </p>
                  </div>

                  {errorCode === "USER_NOT_FOUND" ? (
                    <div
                      role="alert"
                      className="mb-6 rounded-xl border border-amber-300/90 bg-amber-50/90 p-4 text-xs text-amber-950 sm:text-sm"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle
                          size={18}
                          strokeWidth={1.85}
                          className="mt-0.5 shrink-0 text-amber-700"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-amber-950">
                            Account not found
                          </p>
                          <p className="mt-1 break-all text-xs text-amber-900/90">
                            No registered account found for{" "}
                            <span className="font-semibold text-[#202124]">
                              {forgotEmail}
                            </span>
                            .
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              navigate("/register", {
                                state: { email: forgotEmail },
                              })
                            }
                            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#202124] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#323438]"
                          >
                            <span>Create account</span>
                            <ArrowRight size={13} strokeWidth={1.85} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : error ? (
                    <div
                      role="alert"
                      className="mb-6 flex items-start gap-2.5 rounded-xl border border-[#B91C1C]/25 bg-[#FEF2F2] p-3.5 text-xs font-medium text-[#991B1B] sm:text-sm"
                    >
                      <AlertCircle
                        size={17}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-[#B91C1C]"
                      />
                      <span>{error}</span>
                    </div>
                  ) : null}

                  <form
                    onSubmit={handleForgotEmailSubmit}
                    noValidate
                    className="space-y-5"
                  >
                    <div>
                      <label
                        htmlFor="forgot-email"
                        className="mb-2 block text-xs font-medium text-[#202124]"
                      >
                        Email address
                      </label>
                      <div className="relative">
                        <Mail
                          size={16}
                          strokeWidth={1.85}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6E7278]"
                        />
                        <input
                          id="forgot-email"
                          required
                          type="email"
                          autoComplete="email"
                          placeholder="you@technonjr.org"
                          value={forgotEmail}
                          onChange={(e) => {
                            if (error) setError("");
                            setForgotEmail(e.target.value);
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-3 pl-10 pr-4 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#202124] py-3.5 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-[#2F3136] active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>
                        {loading ? "Sending code..." : "Send verification code"}
                      </span>
                      {!loading && (
                        <ArrowRight
                          size={16}
                          strokeWidth={1.85}
                          className="text-[#36B56B] transition-transform duration-150 group-hover:translate-x-0.5"
                        />
                      )}
                    </button>
                  </form>
                </>
              )}

              {/* VIEW 3: FORGOT PASSWORD - STEP 2 (OTP + NEW PASSWORD) */}
              {mode === "forgot_reset" && (
                <>
                  <div className="mb-6">
                    <button
                      type="button"
                      onClick={() => {
                        setError("");
                        setErrorCode("");
                        setMode("forgot_email");
                      }}
                      className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#5F6368] transition-colors hover:text-[#202124] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124]"
                    >
                      <ArrowLeft size={14} strokeWidth={1.85} />
                      <span>Change email</span>
                    </button>
                    <h1 className="text-xl font-semibold tracking-tight text-[#202124] sm:text-2xl">
                      Verify &amp; reset password.
                    </h1>
                    <p className="mt-1.5 break-all text-xs text-[#5F6368] sm:text-sm">
                      Code sent to{" "}
                      <span className="font-semibold text-[#202124]">
                        {forgotEmail}
                      </span>
                    </p>
                  </div>

                  <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-xs">
                    <div className="flex items-center gap-1.5 text-[#5F6368]">
                      <Clock size={14} strokeWidth={1.85} />
                      <span>
                        {timeLeft > 0 ? (
                          <>
                            Expires in{" "}
                            <span className="font-mono font-semibold tabular-nums text-[#202124]">
                              {formatTimer(timeLeft)}
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold text-[#B91C1C]">
                            Code expired
                          </span>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={resending}
                      onClick={handleResendResetOtp}
                      className="inline-flex cursor-pointer items-center gap-1 font-semibold text-[#202124] transition-colors hover:text-[#269353] disabled:opacity-50"
                    >
                      <RotateCw
                        size={13}
                        strokeWidth={1.85}
                        className={resending ? "animate-spin" : ""}
                      />
                      <span>{resending ? "Sending..." : "Resend code"}</span>
                    </button>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#B91C1C]/25 bg-[#FEF2F2] p-3 text-xs font-medium text-[#991B1B] sm:text-sm"
                    >
                      <AlertCircle
                        size={17}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-[#B91C1C]"
                      />
                      <span>{error}</span>
                    </div>
                  )}

                  <form
                    onSubmit={handleResetPasswordSubmit}
                    noValidate
                    className="space-y-4"
                  >
                    <div>
                      <label
                        htmlFor="forgot-otp"
                        className="mb-2 block text-xs font-medium text-[#202124]"
                      >
                        6-digit verification code
                      </label>
                      <input
                        id="forgot-otp"
                        required
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        autoComplete="one-time-code"
                        placeholder="123456"
                        value={forgotOtp}
                        onChange={(e) => {
                          if (error) setError("");
                          setForgotOtp(
                            e.target.value.replace(/\D/g, "").slice(0, 6),
                          );
                        }}
                        className="w-full rounded-xl border border-black/12 bg-white px-3 py-3 text-center font-mono text-xl font-semibold tracking-[0.28em] text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20 sm:text-2xl sm:tracking-[0.35em]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="new-password"
                        className="mb-2 block text-xs font-medium text-[#202124]"
                      >
                        New password
                      </label>
                      <div className="relative">
                        <LockKeyhole
                          size={16}
                          strokeWidth={1.85}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6E7278]"
                        />
                        <input
                          id="new-password"
                          required
                          minLength={8}
                          type={showNewPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Minimum 8 characters"
                          value={newPassword}
                          onChange={(e) => {
                            if (error) setError("");
                            setNewPassword(e.target.value);
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-3 pl-10 pr-11 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((prev) => !prev)}
                          aria-label={
                            showNewPassword ? "Hide password" : "Show password"
                          }
                          aria-pressed={showNewPassword}
                          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-md p-1 text-[#6E7278] transition-colors hover:text-[#202124]"
                        >
                          {showNewPassword ? (
                            <EyeOff size={16} strokeWidth={1.85} />
                          ) : (
                            <Eye size={16} strokeWidth={1.85} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="confirm-new-password"
                        className="mb-2 block text-xs font-medium text-[#202124]"
                      >
                        Confirm new password
                      </label>
                      <input
                        id="confirm-new-password"
                        required
                        minLength={8}
                        type={showNewPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Re-enter your new password"
                        value={confirmNewPassword}
                        onChange={(e) => {
                          if (error) setError("");
                          setConfirmNewPassword(e.target.value);
                        }}
                        className="w-full rounded-xl border border-black/12 bg-white px-4 py-3 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#202124] py-3.5 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-[#2F3136] active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>
                        {loading
                          ? "Resetting password..."
                          : "Reset password & sign in"}
                      </span>
                      {!loading && (
                        <ArrowRight
                          size={16}
                          strokeWidth={1.85}
                          className="text-[#36B56B] transition-transform duration-150 group-hover:translate-x-0.5"
                        />
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>
          </section>
        </main>

        {/* Minimal Institutional Footer */}
        <footer className="mt-4 text-center text-xs font-medium text-white/85">
          © 2026 CollabX · Techno NJR Institute of Technology
        </footer>
      </div>
    </div>
  );
}