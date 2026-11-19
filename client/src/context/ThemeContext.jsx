import { createContext, useContext, useEffect, useState } from "react";

const THEME_STORAGE_KEY = "collabx_theme";

export const THEMES = [
  {
    id: "light",
    name: "Mint Light",
    badge: "Default",
    description: "Soft Mint Grid & Crisp White",
    dotColor: "#15803D",
    surfaceColor: "#FFFFFF",
    textColor: "#0F172A",
    icon: "sun",
  },
  {
    id: "dark",
    name: "Forest Obsidian",
    badge: "Dark",
    description: "Deep Forest Obsidian & Lime Emerald",
    dotColor: "#A3E635",
    surfaceColor: "#111714",
    textColor: "#F1F5F9",
    icon: "moon",
  },
];

const ThemeContext = createContext({
  theme: "light",
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "obsidian") {
        return "dark";
      }
      if (stored === "light") {
        return "light";
      }
    } catch (e) {
      console.warn("Unable to read theme from localStorage:", e);
    }
    return "light";
  });

  const setTheme = (newTheme) => {
    const valid = newTheme === "dark" ? "dark" : "light";
    setThemeState(valid);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, valid);
    } catch (e) {
      console.warn("Unable to persist theme to localStorage:", e);
    }
  };

  const toggleTheme = () => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch (e) {
        console.warn("Unable to persist theme to localStorage:", e);
      }
      return next;
    });
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme === "dark" ? "dark" : "light";

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {
      console.warn("Unable to persist theme to localStorage:", e);
    }
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        setTheme,
        toggleTheme,
        themes: THEMES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
