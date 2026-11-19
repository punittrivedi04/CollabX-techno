import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeSwitcher() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to Mint Light mode" : "Switch to Forest Dark mode"}
      title={
        isDark
          ? "Currently Dark Mode. Click to switch to Light Mode."
          : "Currently Light Mode. Click to switch to Dark Mode."
      }
      className={`group relative inline-flex shrink-0 items-center gap-0.5 rounded-full border p-1 text-xs font-semibold shadow-2xs transition cursor-pointer ${
        isDark
          ? "border-[#1F2C26] bg-[#111815] text-slate-100 hover:border-[#A3E635]/50"
          : "border-[#D4DFD7] bg-[#FFFFFF] text-[#141A18] hover:border-[#2E8B63]/60"
      }`}
    >
      <span
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all duration-200 ${
          !isDark
            ? "bg-[#1E2422] text-[#BEF264] shadow-xs font-bold"
            : "text-[#94A89D] group-hover:text-slate-100"
        }`}
      >
        <Sun size={13} className={!isDark ? "text-[#BEF264]" : "opacity-80"} />
        <span className="hidden sm:inline text-[11px]">Light</span>
      </span>

      <span
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all duration-200 ${
          isDark
            ? "bg-[#A3E635] text-[#090D0B] shadow-xs font-bold"
            : "text-[#5C6B66] group-hover:text-[#141A18]"
        }`}
      >
        <Moon size={13} className={isDark ? "text-[#090D0B]" : "opacity-80"} />
        <span className="hidden sm:inline text-[11px]">Dark</span>
      </span>
    </button>
  );
}
