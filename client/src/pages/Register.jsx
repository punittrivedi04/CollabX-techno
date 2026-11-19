import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useTheme } from "../context/ThemeContext";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, verifyOtp, resendOtp } = useAuth();
  const { isDark } = useTheme();

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

  // Sync email from location.state if passed
  useEffect(() => {
    if (location.state?.email) {
      setForm((prev) => ({ ...prev, email: location.state.email }));
    }
  }, [location.state?.email]);

  // Live 2:00 countdown timer for signup OTP
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

      // Transition to OTP verification step
      setOtpToken(res.otpToken);
      setTargetEmail(res.email || form.email.trim().toLowerCase());
      setTimeLeft(120);
      setOtpDigits(["", "", "", "", "", ""]);
      setStep("otp");
      setSuccessMessage(
        res.message ||
          "A 6-digit verification code has been sent to your email.",
      );
      // Focus first digit box after transition
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    } catch (err) {
      const data = err.response?.data;
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
      const data = err.response?.data;
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
      // Immediately redirect to dashboard on successful verification when active
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const data = err.response?.data;
      setErrorCode(data?.code || "");
      setError(
        data?.message || "Verification failed. Please check the code.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#EBF1EC] px-4 py-10 text-[#141A18] transition-colors duration-200 dark:bg-[#080C0A] dark:text-slate-100 sm:px-6">
      {/* Rich Sage-Lime Architectural Grid & Soft Ambient Glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: isDark
            ? "linear-gradient(to right, rgba(163, 230, 53, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(163, 230, 53, 0.05) 1px, transparent 1px)"
            : "linear-gradient(to right, rgba(20, 26, 24, 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 26, 24, 0.045) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage:
            "radial-gradient(ellipse 85% 80% at 50% 50%, #000 50%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 80% at 50% 50%, #000 50%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
        style={{
          background: isDark
            ? "linear-gradient(180deg, rgba(34, 197, 94, 0.16) 0%, rgba(163, 230, 53, 0.06) 50%, rgba(8, 12, 10, 0) 100%)"
            : "linear-gradient(180deg, rgba(188, 231, 132, 0.36) 0%, rgba(93, 211, 158, 0.14) 50%, rgba(235, 241, 236, 0) 100%)",
        }}
      />
      <div className="pointer-events-none absolute -bottom-36 left-1/2 h-[340px] w-[720px] -translate-x-1/2 rounded-full bg-[#5dd39e]/20 blur-3xl dark:bg-[#22C55E]/12" />

      {/* Centered Proportional Bento Container */}
      <div className="relative z-10 w-full max-w-[540px]">
        {/* Sleek Top Floating Bar */}
        <header className="mb-4 flex w-full items-center justify-between rounded-full border border-[#D4DFD7] bg-[#FAFBF9]/95 px-3.5 py-2.5 shadow-xs backdrop-blur-md dark:border-[#1F2C26] dark:bg-[#111815]/90">
          <Link
            to="/register"
            className="inline-flex items-center gap-2.5 rounded-full bg-[#BEF264] px-4 py-1.5 text-sm font-bold tracking-tight text-[#141A18] transition hover:brightness-95 dark:bg-[#A3E635]"
          >
            <img
              src="/collabx-logo.jpeg"
              alt="CollabX"
              className="h-6 w-6 rounded-full object-cover"
            />
            <span>CollabX</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E2E8E3] bg-[#EFF4F0] px-3.5 py-1.5 dark:border-[#24322B] dark:bg-[#0C120F]">
              <img
                src="/techno-logo.jpeg"
                alt="Techno NJR"
                className="h-5 w-5 rounded-full object-cover"
              />
              <span className="text-xs font-semibold text-[#2C3A35] dark:text-slate-200">
                Techno NJR
              </span>
            </div>
            <ThemeSwitcher />
          </div>
        </header>

        {/* Main Sign-Up Bento Card */}
        <main className="rounded-[36px] border border-[#D4DFD7] bg-[#FAFBF9] p-8 shadow-xl shadow-[#141A18]/6 dark:border-[#1F2C26] dark:bg-[#111815] dark:shadow-black/40 sm:p-11">
          {/* ============================================================== */}
          {/* STEP 1: REGISTRATION FORM                                      */}
          {/* ============================================================== */}
          {step === "form" && (
            <>
              <div className="mb-7">
                <span className="inline-block rounded-full bg-[#BEF264]/65 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#141A18] dark:border dark:border-[#A3E635]/30 dark:bg-[#1D2B14] dark:text-[#A3E635]">
                  Get Started
                </span>
                <h1 className="mt-3.5 text-4xl font-bold tracking-tight text-[#141A18] dark:text-slate-100">
                  Create account
                </h1>
                <p className="mt-2 text-base text-[#5C6B66] dark:text-[#94A89D]">
                  Join CollabX and start collaborating with your squad.
                </p>
              </div>

              {/* Smart Hint: USER_EXISTS Alert */}
              {errorCode === "USER_EXISTS" ? (
                <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      size={20}
                      className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                    />
                    <div className="flex-1">
                      <p className="font-bold text-amber-950 dark:text-amber-100">
                        Account already exists
                      </p>
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">
                        An account is already registered with{" "}
                        <span className="font-semibold text-[#141A18] dark:text-white">
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
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#1E2422] px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#15803D] dark:bg-[#A3E635] dark:text-[#090D0B] dark:hover:bg-[#BEF264]"
                      >
                        Login Instead
                        <ArrowRight size={14} className="text-[#BEF264] dark:text-[#090D0B]" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : error ? (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-medium text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    Full Name
                  </label>
                  <div className="relative">
                    <User
                      size={19}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#7F9489]"
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
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3.5 pl-12 pr-4 text-base font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:placeholder:text-[#687E73] dark:focus:border-[#22C55E] dark:focus:bg-[#131C18]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      size={19}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#7F9489]"
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
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3.5 pl-12 pr-4 text-base font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:placeholder:text-[#687E73] dark:focus:border-[#22C55E] dark:focus:bg-[#131C18]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    Roll Number / Faculty ID
                  </label>
                  <div className="relative">
                    <GraduationCap
                      size={19}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#7F9489]"
                    />
                    <input
                      maxLength={30}
                      autoCapitalize="characters"
                      placeholder="e.g. 25ETCCS149 or FAC102"
                      value={form.rollNo}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rollNo: e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
                        })
                      }
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3.5 pl-12 pr-4 text-base font-mono font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:placeholder:text-[#687E73] dark:focus:border-[#22C55E] dark:focus:bg-[#131C18]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      size={19}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#7F9489]"
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
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3.5 pl-12 pr-12 text-base font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:placeholder:text-[#687E73] dark:focus:border-[#22C55E] dark:focus:bg-[#131C18]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6B7B75] transition hover:text-[#141A18] dark:text-[#7F9489] dark:hover:text-[#A3E635]"
                    >
                      {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#42504B] dark:text-slate-300">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <LockKeyhole
                      size={19}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6B7B75] dark:text-[#7F9489]"
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
                      className="w-full rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] py-3.5 pl-12 pr-4 text-base font-medium text-[#141A18] outline-none transition placeholder:text-[#8E9E97] focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:placeholder:text-[#687E73] dark:focus:border-[#22C55E] dark:focus:bg-[#131C18]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-full bg-[#1E2422] py-4 text-base font-bold text-white shadow-md shadow-[#1E2422]/20 transition hover:bg-[#15803D] dark:bg-[#A3E635] dark:text-[#090D0B] dark:shadow-[#A3E635]/15 dark:hover:bg-[#BEF264] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Creating account..." : "Create Account"}
                  {!loading && (
                    <ArrowRight size={19} className="text-[#BEF264] dark:text-[#090D0B]" />
                  )}
                </button>
              </form>

              <p className="mt-7 text-center text-sm text-[#5C6B66] dark:text-[#94A89D]">
                Already have an account?{" "}
                <Link
                  to="/login"
                  state={{ email: form.email }}
                  className="font-bold text-[#141A18] underline decoration-[#22C55E] decoration-2 underline-offset-4 hover:text-[#15803D] dark:text-slate-100 dark:decoration-[#A3E635] dark:hover:text-[#A3E635]"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}

          {/* ============================================================== */}
          {/* STEP 2: 6-DIGIT OTP VERIFICATION VIEW                           */}
          {/* ============================================================== */}
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
                  className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#5C6B66] transition hover:text-[#141A18] dark:text-[#94A89D] dark:hover:text-slate-100"
                >
                  <ArrowLeft size={14} />
                  Change Details / Email
                </button>
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFF4F0] text-[#141A18] dark:bg-[#0C120F] dark:text-[#A3E635]">
                  <ShieldCheck size={26} />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-[#141A18] dark:text-slate-100">
                  Verify Your Email
                </h1>
                <p className="mt-1.5 text-sm text-[#5C6B66] dark:text-[#94A89D]">
                  We sent a 6-digit verification code to{" "}
                  <span className="font-bold text-[#141A18] dark:text-slate-100">
                    {targetEmail}
                  </span>
                </p>
              </div>

              {/* Success Notification */}
              {successMessage && (
                <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[#2E8B63]/30 bg-[#E3F3EB] p-3.5 text-sm font-semibold text-[#1E6B4B] dark:border-[#22C55E]/35 dark:bg-[#13291E] dark:text-[#6EE7B7]">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#1E6B4B] dark:text-[#4ADE80]" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Countdown & Resend Bar */}
              <div className="mb-6 flex items-center justify-between rounded-2xl border border-[#D4DFD7] bg-[#EFF4F0] px-4 py-2.5 text-xs dark:border-[#24322B] dark:bg-[#0C120F]">
                <div className="flex items-center gap-1.5 text-[#42504B] dark:text-slate-300">
                  <Clock
                    size={15}
                    className={
                      timeLeft <= 30
                        ? "text-amber-500 animate-pulse"
                        : "text-[#6B7B75] dark:text-[#94A89D]"
                    }
                  />
                  <span>
                    {timeLeft > 0 ? (
                      <>
                        Expires in{" "}
                        <span className="font-mono font-bold text-[#141A18] dark:text-slate-100">
                          {formatTimer(timeLeft)}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-amber-600 dark:text-amber-400">
                        Code expired
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={resending}
                  onClick={handleResendOtp}
                  className="inline-flex items-center gap-1 font-bold text-[#15803D] transition hover:underline dark:text-[#A3E635] disabled:opacity-50"
                >
                  <RotateCw
                    size={13}
                    className={resending ? "animate-spin" : ""}
                  />
                  {resending ? "Sending..." : "Resend OTP"}
                </button>
              </div>

              {error && (
                <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm font-medium text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <AlertCircle size={18} className="shrink-0 text-red-500 dark:text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtpSubmit} className="space-y-6">
                <div>
                  <label className="mb-3 block text-center text-xs font-bold uppercase tracking-wider text-[#5C6B66] dark:text-[#94A89D]">
                    Enter 6-Digit Code
                  </label>

                  {/* 6 Individual Digit Inputs */}
                  <div
                    className="flex items-center justify-center gap-2 sm:gap-2.5"
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
                        className="h-12 w-11 sm:h-14 sm:w-12 rounded-2xl border border-[#D5E0D8] bg-[#EFF4F0] text-center font-mono text-xl sm:text-2xl font-extrabold text-[#141A18] outline-none transition focus:border-[#15803D] focus:bg-white focus:ring-2 focus:ring-[#22C55E]/25 shadow-2xs dark:border-[#24322B] dark:bg-[#0C120F] dark:text-slate-100 dark:focus:border-[#22C55E] dark:focus:bg-[#131C18]"
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otpDigits.join("").length !== 6}
                  className="flex w-full items-center justify-center gap-2.5 rounded-full bg-[#1E2422] py-4 text-base font-bold text-white shadow-md shadow-[#1E2422]/20 transition hover:bg-[#15803D] dark:bg-[#A3E635] dark:text-[#090D0B] dark:hover:bg-[#BEF264] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Verifying..." : "Verify & Enter Workspace"}
                  {!loading && (
                    <ArrowRight size={19} className="text-[#BEF264] dark:text-[#090D0B]" />
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-[#5C6B66] dark:text-[#94A89D]">
                Didn't receive the email? Check your Spam / Junk folder.
              </p>
            </>
          )}
        </main>

        {/* Clean Footer */}
        <footer className="mt-6 text-center text-xs font-medium text-[#4E5C56] dark:text-[#7F9489]">
          © 2026 CollabX · Techno NJR Institute of Technology.
        </footer>
      </div>
    </div>
  );
}
