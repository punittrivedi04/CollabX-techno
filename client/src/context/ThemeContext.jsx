import { createContext, useContext, useEffect } from "react";

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
];

const ThemeContext = createContext({
  theme: "light",
  isDark: false,
  setTheme: () => {},
  toggleTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }) {
  const theme = "light";
  const isDark = false;

  const setTheme = () => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
    } catch (e) {
      console.warn("Unable to persist theme to localStorage:", e);
    }
  };

  const toggleTheme = () => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
    } catch (e) {
      console.warn("Unable to persist theme to localStorage:", e);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";

    try {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
    } catch (e) {
      console.warn("Unable to persist theme to localStorage:", e);
    }
  }, []);

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
