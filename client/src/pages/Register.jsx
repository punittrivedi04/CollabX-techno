import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getHomeRouteForUser } from "../utils/roles";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  User,
  GraduationCap,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCw,
  ShieldCheck,
} from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, verifyOtp, resendOtp } = useAuth();

  // Step: "form" | "otp"
  const [step, setStep] = useState("form");

  // Registration form state
  const [form, setForm] = useState({
    name: "",
    email: location.state?.email || "",
    rollNo: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // OTP Verification state
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpToken, setOtpToken] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [timeLeft, setTimeLeft] = useState(120);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (location.state?.email) {
      setForm((prev) => ({ ...prev, email: location.state.email }));
    }
  }, [location.state?.email]);

  useEffect(() => {
    if (step !== "otp" || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, timeLeft]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Handle Register Form Submit (Step 1)
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setErrorCode("");
    setSuccessMessage("");

    if (form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const cleanRollNo = form.rollNo
      ? form.rollNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
      : null;

    try {
      const res = await register(
        form.name.trim(),
        form.email.trim(),
        form.password,
        cleanRollNo,
      );

      setOtpToken(res.otpToken);
      setTargetEmail(res.email || form.email.trim().toLowerCase());
      setTimeLeft(120);
      setOtpDigits(["", "", "", "", "", ""]);
      setStep("otp");
      setSuccessMessage(
        res.message ||
        "A 6-digit verification code has been sent to your email.",
      );
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || "");
      setError(
        data?.message || "Registration failed. Please check your details.",
      );
    } finally {
      setLoading(false);
    }
  };

  // OTP Input Handlers
  const handleOtpDigitChange = (index, value) => {
    const char = value.replace(/\D/g, "").slice(-1);
    const updated = [...otpDigits];
    updated[index] = char;
    setOtpDigits(updated);
    setError("");

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;

    const nextDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      nextDigits[i] = pasted[i];
    }
    setOtpDigits(nextDigits);
    setError("");

    const targetIdx = Math.min(pasted.length, 5);
    inputRefs.current[targetIdx]?.focus();
  };

  // Resend OTP Handler
  const handleResendOtp = async () => {
    if (resending || !targetEmail) return;
    setResending(true);
    setError("");
    setErrorCode("");
    try {
      const res = await resendOtp(targetEmail, "signup");
      setOtpToken(res.otpToken);
      setTimeLeft(120);
      setOtpDigits(["", "", "", "", "", ""]);
      setSuccessMessage("A fresh 6-digit code has been sent to your email.");
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      const data = err?.response?.data;
      setError(data?.message || "Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  // Verify OTP Submit (Step 2)
  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setErrorCode("");

    const fullCode = otpDigits.join("").trim();
    if (fullCode.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const res = await verifyOtp(targetEmail, fullCode, otpToken);
      if (res?.pendingApproval || !res?.token) {
        navigate("/login", {
          replace: true,
          state: {
            email: targetEmail,
            message:
              res?.message ||
              "Email verified! Your account is awaiting Admin approval and role classification.",
          },
        });
        return;
      }
      const homeRoute = getHomeRouteForUser(res?.user) || "/dashboard";
      navigate(homeRoute, { replace: true });
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || "");
      setError(
        data?.message || "Verification failed. Please check the code.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#EBF1EC] px-3.5 py-6 text-[#141A18] sm:px-6 sm:py-10">
      {/* Subtle Sage-Lime Architectural Grid & Soft Ambient Glow wrapped with overflow-hidden */}
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
          className="absolute inset-x-0 top-0 h-[460px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(188, 231, 132, 0.36) 0%, rgba(93, 211, 158, 0.14) 50%, rgba(235, 241, 236, 0) 100%)",
          }}
        />
        <div className="absolute -bottom-36 left-1/2 h-[340px] w-[720px] -translate-x-1/2 rounded-full bg-[#5dd39e]/20 blur-3xl" />
      </div>

      {/* Centered Proportional Bento Container */}
      <div className="relative z-10 w-full max-w-[540px]">
        {/* Top Floating Bar */}
        <header className="mb-4 flex w-full items-center justify-between gap-2 rounded-full border border-[#D4DFD7] bg-[#FAFBF9]/95 px-3.5 py-2 shadow-xs backdrop-blur-md sm:py-2.5">
          <Link
            to="/register"
            className="inline-flex shrink-0 items-baseline py-1 text-base font-extrabold tracking-tight text-[#141A18] transition-opacity hover:opacity-80 sm:text-lg"
          >
            <span>CollabX</span>
            <span className="text-[#1E6B4B]">.</span>
          </Link>

          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E2E8E3] bg-[#EFF4F0] px-2.5 py-1.5 sm:gap-2 sm:px-3.5">
            <img
              src="/techno-logo.jpeg"
              alt="Techno NJR"
              className="h-4 w-4 rounded-full object-cover sm:h-5 sm:w-5"
            />
            <span className="text-[11px] font-semibold text-[#2C3A35] sm:text-xs">
              Techno NJR
            </span>
          </div>
        </header>

        {/* Main Sign-Up Bento Card */}
        <main className="rounded-[28px] border border-[#D4DFD7] bg-[#FAFBF9] p-5 shadow-xl shadow-[#141A18]/6 sm:rounded-[36px] sm:p-11">
          {/* STEP 1: REGISTRATION FORM */}
          {step === "form" && (
            <>
              <div className="mb-6 sm:mb-7">
                <span className="inline-block rounded-full bg-[#BEF264]/65 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#141A18] sm:px-4 sm:py-1.5 sm:text-xs">
                  Get Started
                </span>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#141A18] sm:mt-3.5 sm:text-4xl">
                  Create account
                </h1>
                <p className="mt-1.5 text-xs text-[#5C6B66] sm:mt-2 sm:text-base">
                  Join CollabX and start collaborating with your squad.
                </p>
              </div>

              {errorCode === "USER_EXISTS" ? (
                <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 sm:text-sm">
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      size={20}
                      strokeWidth={1.85}
                      className="mt-0.5 shrink-0 text-amber-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-amber-950">
                        Account already exists
                      </p>
                      <p className="mt-1 break-all text-xs text-amber-800">
                        An account is already registered with{" "}
                        <span className="font-semibold text-[#141A18]">
                          {form.email}
                        </span>
                        . Please sign in to your existing account.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          navigate("/login", {
                            state: { email: form.email },
                          })
                        }
                        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-[#1E2422] px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#15803D]"
                      >
                        <span>Login Instead</span>
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
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-xs font-medium text-red-600 sm:text-sm">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] sm:mb-2">
                    Full Name
                  </label>
                  <div className="relative">
                    <User
                      size={18}
                      strokeWidth={1.85}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75]"
                    />
                    <input
                      required
                      minLength={2}
                      maxLength={50}
                      autoComplete="name"
                      placeholder="Enter your name"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-4 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5 sm:pl-12 sm:text-base"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] sm:mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      size={18}
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
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-4 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5 sm:pl-12 sm:text-base"
                    />
                  </div>
                  {form.email.trim().toLowerCase().endsWith("@technonjr.org") && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[#1E6B4B]">
                      <ShieldCheck size={14} className="shrink-0 text-[#22C55E]" />
                      <span>Techno NJR campus account — instant workspace access upon email verification (no admin approval required).</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] sm:mb-2">
                    Roll Number / Faculty ID
                  </label>
                  <div className="relative">
                    <GraduationCap
                      size={18}
                      strokeWidth={1.85}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75]"
                    />
                    <input
                      maxLength={30}
                      autoCapitalize="characters"
                      placeholder="e.g. 25ETCCS149 or FAC102"
                      value={form.rollNo}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rollNo: e.target.value
                            .replace(/[^a-zA-Z0-9]/g, "")
                            .toUpperCase(),
                        })
                      }
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-4 font-mono text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5 sm:pl-12 sm:text-base"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] sm:mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      size={18}
                      strokeWidth={1.85}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75]"
                    />
                    <input
                      required
                      minLength={8}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Minimum 8 characters"
                      value={form.password}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-12 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5 sm:pl-12 sm:text-base"
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
                        <EyeOff size={18} strokeWidth={1.85} />
                      ) : (
                        <Eye size={18} strokeWidth={1.85} />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#42504B] sm:mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      size={18}
                      strokeWidth={1.85}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75]"
                    />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      value={form.confirmPassword}
                      onChange={(e) =>
                        setForm({ ...form, confirmPassword: e.target.value })
                      }
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3 pl-11 pr-4 text-sm font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:py-3.5 sm:pl-12 sm:text-base"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#1E2422] py-3.5 text-sm font-bold text-white shadow-md shadow-[#1E2422]/20 transition hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2.5 sm:py-4 sm:text-base"
                >
                  <span>
                    {loading ? "Creating account..." : "Create Account"}
                  </span>
                  {!loading && (
                    <ArrowRight
                      size={18}
                      strokeWidth={1.85}
                      className="text-[#BEF264]"
                    />
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-[#5C6B66] sm:mt-7 sm:text-sm">
                Already have an account?{" "}
                <Link
                  to="/login"
                  state={{ email: form.email }}
                  className="font-bold text-[#141A18] underline decoration-[#22C55E] decoration-2 underline-offset-4 hover:text-[#15803D]"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}

          {/* STEP 2: 6-DIGIT OTP VERIFICATION VIEW */}
          {step === "otp" && (
            <>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setErrorCode("");
                    setStep("form");
                  }}
                  className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#5C6B66] transition hover:text-[#141A18]"
                >
                  <ArrowLeft size={14} strokeWidth={1.85} />
                  <span>Change Details / Email</span>
                </button>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF4F0] text-[#141A18]">
                  <ShieldCheck size={24} strokeWidth={1.85} />
                </div>
                <h1 className="text-xl font-extrabold tracking-tight text-[#141A18] sm:text-2xl">
                  Verify Your Email
                </h1>
                <p className="mt-1.5 break-all text-xs text-[#5C6B66] sm:text-sm">
                  We sent a 6-digit verification code to{" "}
                  <span className="font-bold text-[#141A18]">
                    {targetEmail}
                  </span>
                </p>
                {targetEmail.toLowerCase().endsWith("@technonjr.org") && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#1E6B4B]">
                    <ShieldCheck size={14} className="shrink-0 text-[#22C55E]" />
                    <span>Official campus account — entering your code grants direct access to your workspace.</span>
                  </p>
                )}
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

              <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#D4DFD7] bg-[#EFF4F0] px-3.5 py-2.5 text-xs sm:px-4">
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
                  onClick={handleResendOtp}
                  className="inline-flex cursor-pointer items-center gap-1 font-bold text-[#15803D] transition hover:underline disabled:opacity-50"
                >
                  <RotateCw
                    size={13}
                    strokeWidth={1.85}
                    className={resending ? "animate-spin" : ""}
                  />
                  <span>{resending ? "Sending..." : "Resend OTP"}</span>
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

              <form onSubmit={handleVerifyOtpSubmit} className="space-y-6">
                <div>
                  <label className="mb-3 block text-center text-xs font-bold uppercase tracking-wider text-[#5C6B66]">
                    Enter 6-Digit Code
                  </label>

                  <div
                    className="flex items-center justify-center gap-1.5 sm:gap-2.5"
                    onPaste={handleOtpPaste}
                  >
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) =>
                          handleOtpDigitChange(index, e.target.value)
                        }
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className="h-11 w-10 rounded-xl border border-[#D5E0D8] bg-[#EFF4F0] text-center font-mono text-lg font-extrabold text-[#141A18] shadow-2xs outline-none transition focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 sm:h-14 sm:w-12 sm:rounded-2xl sm:text-2xl"
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otpDigits.join("").length !== 6}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#1E2422] py-3.5 text-sm font-bold text-white shadow-md shadow-[#1E2422]/20 transition hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-60 sm:gap-2.5 sm:py-4 sm:text-base"
                >
                  <span>
                    {loading ? "Verifying..." : "Verify & Enter Workspace"}
                  </span>
                  {!loading && (
                    <ArrowRight
                      size={18}
                      strokeWidth={1.85}
                      className="text-[#BEF264]"
                    />
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-[#5C6B66]">
                Didn&apos;t receive the email? Check your Spam / Junk folder.
              </p>
            </>
          )}
        </main>

        {/* Clean Footer */}
        <footer className="mt-6 text-center text-xs font-medium text-[#4E5C56]">
          © 2026 CollabX · Techno NJR Institute of Technology.
        </footer>
      </div>
    </div>
  );
}