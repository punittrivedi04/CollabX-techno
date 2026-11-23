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

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, forgotPassword, resetPassword, resendOtp } = useAuth();

  // Mode: "login" | "forgot_email" | "forgot_reset"
  const [mode, setMode] = useState("login");

  // Login form state
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

  // Forgot password state
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
    setError("");
    setErrorCode("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const authData = await login(form.email.trim(), form.password);
      navigate(getHomeRouteForUser(authData?.user), { replace: true });
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || "");
      setError(data?.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotEmailSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setErrorCode("");
    setLoading(true);

    const emailToUse = (forgotEmail || form.email).trim();
    if (!emailToUse) {
      setError("Please enter your registered email address.");
      setLoading(false);
      return;
    }

    try {
      const res = await forgotPassword(emailToUse);
      setForgotToken(res.otpToken);
      setForgotEmail(emailToUse);
      setTimeLeft(120);
      setForgotOtp("");
      setMode("forgot_reset");
      setSuccessMessage(
        res.message || "A 6-digit reset code has been sent to your email.",
      );
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || "");
      setError(data?.message || "Failed to send reset code. Please try again.");
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
      setError(data?.message || "Failed to resend code. Please try again.");
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
        "Password reset successful! Please sign in with your new password.",
      );
      setError("");
      setErrorCode("");
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || "");
      setError(data?.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#EBF1EC] px-3.5 py-6 text-[#141A18] sm:px-6 sm:py-8">
      {/* Subtle Sage-Lime Grid & Top Ambient Glow wrapped with overflow-hidden to prevent horizontal spill */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(20, 26, 24, 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 26, 24, 0.045) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage:
              "radial-gradient(ellipse 85% 80% at 50% 50%, #000 50%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 85% 80% at 50% 50%, #000 50%, transparent 100%)",
          }}
        />
        <div
          className="absolute inset-x-0 top-0 h-[420px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(188, 231, 132, 0.34) 0%, rgba(93, 211, 158, 0.14) 50%, rgba(235, 241, 236, 0) 100%)",
          }}
        />
        <div className="absolute -bottom-36 left-1/2 h-[320px] w-[620px] -translate-x-1/2 rounded-full bg-[#5dd39e]/18 blur-3xl" />
      </div>

      {/* Centered Single-Card Bento Container */}
      <div className="relative z-10 w-full max-w-[440px]">
        {/* Top Floating Bar */}
        <header className="mb-4 flex w-full items-center justify-between gap-2 rounded-full border border-[#D4DFD7] bg-[#FAFBF9]/95 px-3.5 py-2 shadow-xs backdrop-blur-md">
          <Link
            to="/login"
            className="inline-flex shrink-0 items-baseline py-1 text-base font-extrabold tracking-tight text-[#141A18] transition-opacity hover:opacity-80 sm:text-lg"
          >
            <span>CollabX</span>
            <span className="text-[#1E6B4B]">.</span>
          </Link>

          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E2E8E3] bg-[#EFF4F0] px-2.5 py-1.5 sm:gap-2 sm:px-3">
            <img
              src="/techno-logo.jpeg"
              alt="Techno NJR"
              className="h-4 w-4 rounded-full object-cover"
            />
            <span className="text-[11px] font-semibold text-[#2C3A35]">
              Techno NJR
            </span>
          </div>
        </header>

        {/* Main Card */}
        <main className="rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] p-5 shadow-xl shadow-[#141A18]/5 sm:rounded-[32px] sm:p-9">
          {/* VIEW 1: SIGN IN */}
          {mode === "login" && (
            <>
              <div className="mb-6 sm:mb-7">
                <span className="inline-block rounded-full bg-[#BEF264]/65 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#141A18]">
                  Welcome Back
                </span>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#141A18] sm:text-3xl">
                  Sign in
                </h1>
                <p className="mt-1.5 text-xs text-[#5C6B66] sm:text-sm">
                  Enter your credentials to access your workspace.
                </p>
              </div>

              {successMessage && (
                <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[#2E8B63]/30 bg-[#E3F3EB] p-3.5 text-xs font-semibold text-[#1E6B4B] sm:text-sm">
                  <CheckCircle2
                    size={18}
                    strokeWidth={1.85}
                    className="mt-0.5 shrink-0 text-[#1E6B4B]"
                  />
                  <span>{successMessage}</span>
                </div>
              )}

              {errorCode === "USER_NOT_FOUND" ? (
                <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 sm:text-sm">
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      size={20}
                      strokeWidth={1.85}
                      className="mt-0.5 shrink-0 text-amber-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-amber-950">
                        Account not found
                      </p>
                      <p className="mt-1 break-all text-xs text-amber-800">
                        We couldn&apos;t find an account for{" "}
                        <span className="font-semibold text-[#141A18]">
                          {form.email}
                        </span>
                        . Please create an account to get started.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          navigate("/register", {
                            state: { email: form.email },
                          })
                        }
                        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#1E2422] px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#15803D]"
                      >
                        <span>Create Account</span>
                        <ArrowRight
                          size={14}
                          strokeWidth={1.85}
                          className="text-[#BEF264]"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ) : error ? (
                <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-600 sm:text-sm">
                  <AlertCircle
                    size={18}
                    strokeWidth={1.85}
                    className="shrink-0 text-red-500"
                  />
                  <span>{error}</span>
                </div>
              ) : null}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#42504B]">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      size={17}
                      strokeWidth={1.85}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75]"
                    />
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="you@technonjr.org"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-4 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-[#42504B]">
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
                      className="cursor-pointer text-xs font-bold text-[#15803D] transition hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <LockKeyhole
                      size={17}
                      strokeWidth={1.85}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75]"
                    />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-12 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-[#6B7B75] transition hover:text-[#141A18]"
                    >
                      {showPassword ? (
                        <EyeOff size={17} strokeWidth={1.85} />
                      ) : (
                        <Eye size={17} strokeWidth={1.85} />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#1E2422] py-3.5 text-sm font-bold text-white shadow-md shadow-[#1E2422]/20 transition hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{loading ? "Signing in..." : "Sign In"}</span>
                  {!loading && (
                    <ArrowRight
                      size={17}
                      strokeWidth={1.85}
                      className="text-[#BEF264]"
                    />
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-[#5C6B66] sm:mt-7 sm:text-sm">
                Don&apos;t have an account?{" "}
                <Link
                  to="/register"
                  state={{ email: form.email }}
                  className="font-bold text-[#141A18] underline decoration-[#22C55E] decoration-2 underline-offset-4 hover:text-[#15803D]"
                >
                  Create account
                </Link>
              </p>
            </>
          )}

          {/* VIEW 2: FORGOT PASSWORD - STEP 1 (ENTER EMAIL) */}
          {mode === "forgot_email" && (
            <>
              <div className="mb-6 sm:mb-7">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setErrorCode("");
                    setMode("login");
                  }}
                  className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#5C6B66] transition hover:text-[#141A18]"
                >
                  <ArrowLeft size={14} strokeWidth={1.85} />
                  <span>Back to Sign In</span>
                </button>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF4F0] text-[#141A18]">
                  <KeyRound size={22} strokeWidth={1.85} />
                </div>
                <h1 className="text-xl font-extrabold tracking-tight text-[#141A18] sm:text-2xl">
                  Reset Password
                </h1>
                <p className="mt-1.5 text-xs text-[#5C6B66] sm:text-sm">
                  Enter your registered email and we&apos;ll send you a 6-digit
                  verification code.
                </p>
              </div>

              {errorCode === "USER_NOT_FOUND" ? (
                <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 sm:text-sm">
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      size={20}
                      strokeWidth={1.85}
                      className="mt-0.5 shrink-0 text-amber-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-amber-950">
                        Account not found
                      </p>
                      <p className="mt-1 break-all text-xs text-amber-800">
                        No registered account found for{" "}
                        <span className="font-semibold text-[#141A18]">
                          {forgotEmail}
                        </span>
                        . Would you like to create one instead?
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          navigate("/register", {
                            state: { email: forgotEmail },
                          })
                        }
                        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#1E2422] px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#15803D]"
                      >
                        <span>Create Account</span>
                        <ArrowRight
                          size={14}
                          strokeWidth={1.85}
                          className="text-[#BEF264]"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ) : error ? (
                <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-600 sm:text-sm">
                  <AlertCircle
                    size={18}
                    strokeWidth={1.85}
                    className="shrink-0 text-red-500"
                  />
                  <span>{error}</span>
                </div>
              ) : null}

              <form onSubmit={handleForgotEmailSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#42504B]">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      size={17}
                      strokeWidth={1.85}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75]"
                    />
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      placeholder="you@technonjr.org"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-4 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#1E2422] py-3.5 text-sm font-bold text-white shadow-md shadow-[#1E2422]/20 transition hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    {loading ? "Sending Code..." : "Send Verification Code"}
                  </span>
                  {!loading && (
                    <ArrowRight
                      size={17}
                      strokeWidth={1.85}
                      className="text-[#BEF264]"
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
                  className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#5C6B66] transition hover:text-[#141A18]"
                >
                  <ArrowLeft size={14} strokeWidth={1.85} />
                  <span>Change Email</span>
                </button>
                <h1 className="text-xl font-extrabold tracking-tight text-[#141A18] sm:text-2xl">
                  Verify &amp; Reset Password
                </h1>
                <p className="mt-1.5 break-all text-xs text-[#5C6B66] sm:text-sm">
                  We sent a 6-digit verification code to{" "}
                  <span className="font-bold text-[#141A18]">
                    {forgotEmail}
                  </span>
                </p>
              </div>

              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D4DFD7] bg-[#EFF4F0] px-3.5 py-2.5 text-xs sm:px-4">
                <div className="flex items-center gap-1.5 text-[#42504B]">
                  <Clock
                    size={15}
                    strokeWidth={1.85}
                    className={
                      timeLeft <= 30
                        ? "animate-pulse text-amber-500"
                        : "text-[#6B7B75]"
                    }
                  />
                  <span>
                    {timeLeft > 0 ? (
                      <>
                        Expires in{" "}
                        <span className="font-mono font-bold tabular-nums text-[#141A18]">
                          {formatTimer(timeLeft)}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-amber-600">
                        Code expired
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={resending}
                  onClick={handleResendResetOtp}
                  className="inline-flex cursor-pointer items-center gap-1 font-bold text-[#15803D] transition hover:underline disabled:opacity-50"
                >
                  <RotateCw
                    size={13}
                    strokeWidth={1.85}
                    className={resending ? "animate-spin" : ""}
                  />
                  <span>{resending ? "Sending..." : "Resend Code"}</span>
                </button>
              </div>

              {error && (
                <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-600 sm:text-sm">
                  <AlertCircle
                    size={18}
                    strokeWidth={1.85}
                    className="shrink-0 text-red-500"
                  />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#42504B]">
                    6-Digit Verification Code
                  </label>
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={forgotOtp}
                    onChange={(e) =>
                      setForgotOtp(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] px-3 py-3 text-center font-mono text-xl font-extrabold tracking-[0.25em] text-[#141A18] outline-none transition focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:px-4 sm:text-2xl sm:tracking-[0.4em]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#42504B]">
                    New Password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      size={17}
                      strokeWidth={1.85}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75]"
                    />
                    <input
                      required
                      minLength={8}
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-12 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label={
                        showNewPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-[#6B7B75] hover:text-[#141A18]"
                    >
                      {showNewPassword ? (
                        <EyeOff size={17} strokeWidth={1.85} />
                      ) : (
                        <Eye size={17} strokeWidth={1.85} />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#42504B]">
                    Confirm New Password
                  </label>
                  <input
                    required
                    minLength={8}
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] px-4 py-3 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#1E2422] py-3.5 text-sm font-bold text-white shadow-md shadow-[#1E2422]/20 transition hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    {loading
                      ? "Resetting Password..."
                      : "Reset Password & Sign In"}
                  </span>
                  {!loading && (
                    <ArrowRight
                      size={17}
                      strokeWidth={1.85}
                      className="text-[#BEF264]"
                    />
                  )}
                </button>
              </form>
            </>
          )}
        </main>

        {/* Clean Footer */}
        <footer className="mt-5 text-center text-xs font-medium text-[#4E5C56]">
          © 2026 CollabX · Techno NJR Institute of Technology.
        </footer>
      </div>
    </div>
  );
}