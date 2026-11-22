import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "max-w-lg",
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : "Dialog"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={`my-auto flex max-h-[90vh] w-full ${size} flex-col overflow-hidden rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                {description}
              </p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-full bg-[var(--bg-surface-subtle)] p-2 text-[var(--text-secondary)] transition hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)]"
            >
              <X size={17} />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] px-6 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title = "Confirm Action",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  busy = false,
  onConfirm,
  onClose,
}) {
  const confirmClasses =
    tone === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700"
      : "bg-[#141A17] text-[#BEF264] hover:bg-[#1E6B4B] hover:text-white dark:bg-[#A3E635] dark:text-[#090D0B] dark:hover:bg-[#22C55E]";

  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? undefined : onClose}
      size="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold shadow-xs transition disabled:opacity-50 ${confirmClasses}`}
          >
            {busy && <LoaderCircle size={14} className="animate-spin" />}
            <span>{busy ? "Working..." : confirmLabel}</span>
          </button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-[var(--text-secondary)]">
        {message}
      </div>
    </Modal>
  );
}

export function LoadingState({ label = "Loading workspace data..." }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-16 text-[var(--text-muted)] shadow-2xs">
      <LoaderCircle size={22} className="animate-spin text-[#15803D] dark:text-[#A3E635]" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function ErrorAlert({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-medium text-rose-700 dark:text-rose-300"
    >
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="rounded-full p-1 opacity-75 transition hover:opacity-100"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function SuccessAlert({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-800 dark:text-emerald-300"
    >
      <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notice"
          className="rounded-full p-1 opacity-75 transition hover:opacity-100"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="rounded-3xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-6 py-12 text-center">
      {Icon && (
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-text)]">
          <Icon size={22} />
        </div>
      )}
      <h3 className="mt-3.5 text-sm font-bold text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status, className = "" }) {
  const s = String(status || "").toLowerCase();
  let tone =
    "border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]";

  if (["completed", "active", "done", "approved", "student"].includes(s)) {
    tone =
      "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  } else if (["in progress", "mentor", "all", "medium"].includes(s)) {
    tone =
      "border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300";
  } else if (["planning", "in review", "on hold", "pending", "unclassified"].includes(s)) {
    tone =
      "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300";
  } else if (["overdue", "inactive", "deactivated", "high", "at risk"].includes(s)) {
    tone =
      "border-rose-500/30 bg-rose-500/12 text-rose-700 dark:text-rose-300";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize ${tone} ${className}`}
    >
      {status || "—"}
    </span>
  );
}

export function ProgressBar({
  value = 0,
  showLabel = false,
  height = "h-2",
  color,
}) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  const barColor =
    color ||
    (clamped >= 70
      ? "bg-emerald-500 dark:bg-emerald-400"
      : clamped >= 30
        ? "bg-amber-500 dark:bg-amber-400"
        : "bg-rose-500 dark:bg-rose-400");

  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex-1 overflow-hidden rounded-full bg-[var(--bg-surface-subtle)] ${height}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span className="w-10 text-right text-xs font-bold text-[var(--text-primary)]">
          {clamped}%
        </span>
      )}
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, className = "" }) {
  return (
    <section
      className={`rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xs sm:p-6 ${className}`}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const portalInputClass =
  "w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[#15803D] focus:ring-2 focus:ring-[#22C55E]/20 dark:focus:border-[#22C55E]";

export const portalPrimaryBtnClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#141A17] px-5 py-2.5 text-xs font-bold text-[#BEF264] shadow-xs transition hover:bg-[#1E6B4B] hover:text-white dark:bg-[#A3E635] dark:text-[#090D0B] dark:hover:bg-[#22C55E] disabled:opacity-50 cursor-pointer";

export const portalSecondaryBtnClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[#15803D]/50 hover:text-[var(--text-primary)] dark:hover:border-[#22C55E]/50 disabled:opacity-50 cursor-pointer";
