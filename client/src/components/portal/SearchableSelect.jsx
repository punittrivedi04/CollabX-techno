import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/**
 * Reusable searchable select combobox matching CollabX's Mint-Green & Forest-Obsidian aesthetic.
 * options: Array<{ value: string | number, label: string, sublabel?: string, badge?: string, keywords?: string }>
 */
export default function SearchableSelect({
  options = [],
  value = "",
  onChange,
  onOpen,
  placeholder = "Search and select...",
  searchPlaceholder = "Search by name...",
  emptyMessage = "No matching options found",
  allowEmpty = false,
  emptyOptionLabel = "None / Unassigned",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const safeOptions = useMemo(
    () => (Array.isArray(options) ? options.filter((opt) => opt && opt.value !== undefined && opt.value !== null) : []),
    [options],
  );

  const selectedOption = useMemo(
    () => safeOptions.find((opt) => String(opt.value) === String(value ?? "")) || null,
    [safeOptions, value],
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return safeOptions;
    return safeOptions.filter((opt) => {
      const hay = `${opt?.label || ""} ${opt?.sublabel || ""} ${opt?.badge || ""} ${opt?.keywords || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [safeOptions, query]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    const timer = setTimeout(() => searchInputRef.current?.focus(), 20);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (nextValue) => {
    onChange?.(String(nextValue));
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        role="combobox"
        aria-expanded={open}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => {
            const next = !prev;
            if (next && onOpen) onOpen();
            return next;
          });
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => {
              const next = !prev;
              if (next && onOpen) onOpen();
              return next;
            });
          }
        }}
        className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-[#15803D]/60 dark:hover:border-[#22C55E]/60"
        } ${
          open
            ? "border-[#15803D] ring-2 ring-[#22C55E]/20 dark:border-[#22C55E]"
            : "border-[var(--border-subtle)]"
        } bg-[var(--bg-input)] text-[var(--text-primary)]`}
      >
        <div className="min-w-0 flex-1">
          {selectedOption ? (
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="truncate font-semibold text-[var(--text-primary)]">
                {selectedOption.label}
              </span>
              {selectedOption.sublabel && (
                <span className="truncate text-xs text-[var(--text-muted)]">
                  {selectedOption.sublabel}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[var(--text-muted)]">{placeholder}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {allowEmpty && selectedOption && !disabled && (
            <button
              type="button"
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect("");
              }}
              className="rounded-full p-1 text-[var(--text-muted)] transition hover:bg-[var(--bg-surface-subtle)] hover:text-[var(--text-primary)]"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl">
          <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-2.5">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] py-2 pl-9 pr-8 text-xs font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[#15803D] dark:focus:border-[#22C55E]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-1.5 scrollbar-thin">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => handleSelect("")}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition cursor-pointer ${
                  !value
                    ? "bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-elevated)]"
                }`}
              >
                <span>{emptyOptionLabel}</span>
                {!value && <Check size={14} />}
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <p className="px-3 py-5 text-center text-xs text-[var(--text-muted)]">
                {emptyMessage}
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition cursor-pointer ${
                      isSelected
                        ? "bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-surface-elevated)]"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{opt.label}</p>
                      {opt.sublabel && (
                        <p className="truncate text-[11px] text-[var(--text-muted)]">
                          {opt.sublabel}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {opt.badge && (
                        <span className="rounded-full bg-[var(--bg-surface-subtle)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <Check size={14} className="text-[#15803D] dark:text-[#A3E635]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
