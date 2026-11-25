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
  Building2,
  KeyRound,
} from "lucide-react";

const CAMPUS_BG_PRIMARY = "/22.png";
const CAMPUS_BG_FALLBACK = "/techno.webp";

const LEFT_CAMPUS_PRIMARY = "/3.png";
const LEFT_CAMPUS_FALLBACK = "/techno.webp";

const TECHNO_LOGO_PRIMARY = "/techno-logo.jpeg";
const TECHNO_LOGO_FALLBACK = "/Untitled-design-2.png";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, verifyOtp, resendOtp } = useAuth();

  // Step: "form" | "otp"
  const [step, setStep] = useState(
    location.state?.step === "otp" ? "otp" : "form"
  );

  // Resilient image fallbacks for local public assets
  const [bgSrc, setBgSrc] = useState(CAMPUS_BG_PRIMARY);
  const [leftSrc, setLeftSrc] = useState(LEFT_CAMPUS_PRIMARY);
  const [logoSrc, setLogoSrc] = useState(TECHNO_LOGO_PRIMARY);

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
  const [successMessage, setSuccessMessage] = useState(
    location.state?.message || ""
  );
  const [loading, setLoading] = useState(false);

  // OTP Verification state
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpToken, setOtpToken] = useState(location.state?.otpToken || "");
  const [targetEmail, setTargetEmail] = useState(
    location.state?.email || ""
  );
  const [timeLeft, setTimeLeft] = useState(120);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (location.state?.email) {
      setForm((prev) => ({ ...prev, email: location.state.email }));
      setTargetEmail(location.state.email);
    }
    if (location.state?.otpToken) {
      setOtpToken(location.state.otpToken);
    }
    if (location.state?.step === "otp") {
      setStep("otp");
      setTimeLeft(120);
    }
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
    }
  }, [location.state]);

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

    const cleanName = form.name.trim();
    if (!cleanName || cleanName.length < 2) {
      setError("Please enter your full name (at least 2 characters).");
      return;
    }

    const cleanEmail = form.email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter your email address.");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    const cleanRollNo = form.rollNo
      ? form.rollNo.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
      : "";

    if (!cleanRollNo) {
      setError("Please enter your Roll number / Faculty ID.");
      return;
    }

    if (!form.password) {
      setError("Please enter a password.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (!form.confirmPassword) {
      setError("Please confirm your password.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await register(
        cleanName,
        cleanEmail,
        form.password,
        cleanRollNo,
      );

      setOtpToken(res.otpToken);
      setTargetEmail(res.email || cleanEmail);
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
      setErrorCode(data?.code || err?.code || "");
      setError(
        data?.message ||
          err?.message ||
          "Registration failed. Please check your details.",
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
      setErrorCode(data?.code || err?.code || "");
      setError(
        data?.message || err?.message || "Failed to resend code. Please try again.",
      );
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
              "Email verified! Your account is pending Admin approval before you can log in.",
          },
        });
        return;
      }
      const homeRoute = getHomeRouteForUser(res?.user) || "/dashboard";
      navigate(homeRoute, { replace: true });
    } catch (err) {
      const data = err?.response?.data;
      setErrorCode(data?.code || err?.code || "");
      setError(
        data?.message ||
          err?.message ||
          "Verification failed. Please check the code.",
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
            <Link
              to="/register"
              className="inline-flex shrink-0 items-baseline px-1 py-1 text-lg font-extrabold tracking-tight text-[#141A18] transition-opacity hover:opacity-85 sm:text-xl"
            >
               <a aria-current="page" class="inline-flex shrink-0 items-baseline px-1 py-1 text-lg font-extrabold tracking-tight text-[#141A18] transition-opacity hover:opacity-85 sm:text-xl active" href="/dashboard" data-discover="true"><span>CollabX</span><span class="text-[#1E6B4B]">.</span></a>
  
            </Link>

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
              <a
                href="https://technonjr.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold tracking-tight text-[#202124] hover:underline"
              >
                Techno NJR
              </a>
            </div>
          </nav>
        </header>

        {/* Main Split-Screen Registration Card */}
        <main className="mt-5 grid w-full overflow-hidden rounded-2xl border border-black/12 bg-[#F8F8F6] shadow-[0_24px_60px_-15px_rgba(0,0,0,0.38)] sm:mt-[28px] lg:min-h-[580px] lg:grid-cols-12">
          {/* Left Section: Clean Campus Photo */}
          <aside className="relative flex min-h-[210px] flex-col justify-between overflow-hidden border-b border-black/10 bg-[#1B1D1C] text-white sm:min-h-[250px] lg:col-span-5 lg:min-h-full lg:rounded-l-2xl lg:border-b-0 lg:border-r">
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
                  "linear-gradient(180deg, rgba(18, 20, 19, 0.16) 0%, rgba(18, 20, 19, 0.34) 48%, rgba(15, 17, 16, 0.86) 100%)",
              }}
            />

            <div className="relative z-10 mt-auto p-5 sm:p-7">
              <h2 className="text-xl font-semibold leading-[1.2] tracking-tight text-white sm:text-2xl">
                Your Campus. Your Community. Your Collaboration.
              </h2>

              <p className="mt-2.5 text-xs leading-relaxed text-white/80 sm:text-[13px]">
                Create your CollabX account to join project squads, manage
                milestones, and collaborate with mentors across Techno NJR.
              </p>
            </div>
          </aside>

          {/* Right Section: Warm-White Registration / OTP Form */}
          <section
            aria-label="Registration"
            className="flex flex-col justify-center bg-[#F8F8F6] px-6 py-8 sm:px-10 sm:py-11 lg:col-span-7 lg:px-14 lg:py-12"
          >
            <div className="mx-auto w-full max-w-[430px]">
              {/* STEP 1: REGISTRATION FORM */}
              {step === "form" && (
                <>
                  <div className="mb-6">
                    <h1 className="text-2xl font-semibold tracking-tight text-[#202124] sm:text-[28px]">
                      Create account.
                    </h1>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#5F6368] sm:text-sm">
                      Join CollabX and start collaborating with your squad.
                    </p>
                  </div>

                  {errorCode === "USER_EXISTS" ? (
                    <div
                      role="alert"
                      className="mb-5 rounded-xl border border-amber-300/90 bg-amber-50/90 p-4 text-xs text-amber-950 sm:text-sm"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle
                          size={18}
                          strokeWidth={1.85}
                          className="mt-0.5 shrink-0 text-amber-700"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-amber-950">
                            Account already exists
                          </p>
                          <p className="mt-1 break-all text-xs text-amber-900/90">
                            An account is already registered with{" "}
                            <span className="font-semibold text-[#202124]">
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
                            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#202124] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#323438] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124]"
                          >
                            <span>Login instead</span>
                            <ArrowRight size={13} strokeWidth={1.85} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : error ? (
                    <div
                      role="alert"
                      className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#B91C1C]/25 bg-[#FEF2F2] p-3.5 text-xs font-medium text-[#991B1B] sm:text-sm"
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
                    onSubmit={handleRegisterSubmit}
                    noValidate
                    className="space-y-4"
                  >
                    <div>
                      <label
                        htmlFor="register-name"
                        className="mb-1.5 block text-xs font-medium text-[#202124]"
                      >
                        Full name
                      </label>
                      <div className="relative">
                        <User
                          size={16}
                          strokeWidth={1.85}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6E7278]"
                        />
                        <input
                          id="register-name"
                          required
                          minLength={2}
                          maxLength={50}
                          autoComplete="name"
                          placeholder="Enter your name"
                          value={form.name}
                          onChange={(e) => {
                            if (error) setError("");
                            setForm({ ...form, name: e.target.value });
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-2.5 pl-10 pr-4 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="register-email"
                        className="mb-1.5 block text-xs font-medium text-[#202124]"
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
                          id="register-email"
                          required
                          type="email"
                          autoComplete="email"
                          placeholder="you@technonjr.org"
                          value={form.email}
                          onChange={(e) => {
                            if (error) setError("");
                            setForm({ ...form, email: e.target.value });
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-2.5 pl-10 pr-4 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="register-roll"
                        className="mb-1.5 block text-xs font-medium text-[#202124]"
                      >
                        Roll number / Faculty ID
                      </label>
                      <div className="relative">
                        <GraduationCap
                          size={16}
                          strokeWidth={1.85}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6E7278]"
                        />
                        <input
                          id="register-roll"
                          required
                          maxLength={30}
                          autoCapitalize="characters"
                          placeholder="e.g. 25ETCCS149 or FAC102"
                          value={form.rollNo}
                          onChange={(e) => {
                            if (error) setError("");
                            setForm({
                              ...form,
                              rollNo: e.target.value
                                .replace(/[^a-zA-Z0-9]/g, "")
                                .toUpperCase(),
                            });
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-2.5 pl-10 pr-4 font-mono text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="register-password"
                        className="mb-1.5 block text-xs font-medium text-[#202124]"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <LockKeyhole
                          size={16}
                          strokeWidth={1.85}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6E7278]"
                        />
                        <input
                          id="register-password"
                          required
                          minLength={8}
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Minimum 8 characters"
                          value={form.password}
                          onChange={(e) => {
                            if (error) setError("");
                            setForm({ ...form, password: e.target.value });
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-2.5 pl-10 pr-11 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
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

                    <div>
                      <label
                        htmlFor="register-confirm-password"
                        className="mb-1.5 block text-xs font-medium text-[#202124]"
                      >
                        Confirm password
                      </label>
                      <div className="relative">
                        <LockKeyhole
                          size={16}
                          strokeWidth={1.85}
                          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6E7278]"
                        />
                        <input
                          id="register-confirm-password"
                          required
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Re-enter your password"
                          value={form.confirmPassword}
                          onChange={(e) => {
                            if (error) setError("");
                            setForm({ ...form, confirmPassword: e.target.value });
                          }}
                          className="w-full rounded-xl border border-black/12 bg-white py-2.5 pl-10 pr-4 text-sm text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 placeholder:text-[#9AA0A6] hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#202124] py-3.5 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-[#2F3136] active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>
                        {loading ? "Creating account..." : "Create Account"}
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

                  <p className="mt-6 border-t border-black/8 pt-5 text-center text-xs text-[#5F6368] sm:text-sm">
                    Already have an account?{" "}
                    <Link
                      to="/login"
                      state={{ email: form.email }}
                      className="font-semibold text-[#202124] underline decoration-[#36B56B] decoration-2 underline-offset-4 transition-colors hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124]"
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
                      className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#5F6368] transition-colors hover:text-[#202124] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124]"
                    >
                      <ArrowLeft size={14} strokeWidth={1.85} />
                      <span>Change details / email</span>
                    </button>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-black/10 bg-white text-[#202124] shadow-2xs">
                      <KeyRound size={18} strokeWidth={1.85} />
                    </div>
                    <h1 className="text-xl font-semibold tracking-tight text-[#202124] sm:text-2xl">
                      Verify your email.
                    </h1>
                    <p className="mt-1.5 break-all text-xs text-[#5F6368] sm:text-sm">
                      We sent a 6-digit verification code to{" "}
                      <span className="font-semibold text-[#202124]">
                        {targetEmail}
                      </span>
                    </p>
                    {targetEmail.toLowerCase().endsWith("@technonjr.org") && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#184E2F]">
                        <ShieldCheck
                          size={14}
                          strokeWidth={1.85}
                          className="shrink-0 text-[#269353]"
                        />
                        <span>
                          Official campus account — entering your code grants
                          direct access to your workspace.
                        </span>
                      </p>
                    )}
                  </div>

                  {successMessage && (
                    <div
                      role="status"
                      className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#36B56B]/35 bg-[#36B56B]/10 p-3.5 text-xs font-medium text-[#184E2F] sm:text-sm"
                    >
                      <CheckCircle2
                        size={17}
                        strokeWidth={1.85}
                        className="mt-0.5 shrink-0 text-[#269353]"
                      />
                      <span>{successMessage}</span>
                    </div>
                  )}

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
                      onClick={handleResendOtp}
                      className="inline-flex cursor-pointer items-center gap-1 font-semibold text-[#202124] transition-colors hover:text-[#269353] disabled:opacity-50"
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
                    <div
                      role="alert"
                      className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#B91C1C]/25 bg-[#FEF2F2] p-3.5 text-xs font-medium text-[#991B1B] sm:text-sm"
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
                    onSubmit={handleVerifyOtpSubmit}
                    noValidate
                    className="space-y-6"
                  >
                    <div>
                      <label className="mb-3 block text-center text-xs font-medium text-[#202124]">
                        Enter 6-digit code
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
                            className="h-11 w-10 rounded-xl border border-black/12 bg-white text-center font-mono text-lg font-semibold text-[#202124] shadow-[0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-all duration-150 hover:border-black/25 focus:border-[#202124] focus:ring-3 focus:ring-[#36B56B]/20 sm:h-14 sm:w-12 sm:text-2xl"
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || otpDigits.join("").length !== 6}
                      className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#202124] py-3.5 text-sm font-semibold text-white shadow-xs transition-all duration-150 hover:bg-[#2F3136] active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202124] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>
                        {loading ? "Verifying..." : "Verify & enter workspace"}
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

                  <p className="mt-6 text-center text-xs text-[#5F6368]">
                    Didn&apos;t receive the email? Check your Spam / Junk
                    folder.
                  </p>
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