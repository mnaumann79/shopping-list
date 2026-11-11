"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readTheme(): Theme {
  const savedTheme = localStorage.getItem("theme");
  return savedTheme === "light" || savedTheme === "dark" || savedTheme === "system" ? savedTheme : "system";
}

function subscribeToTheme(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === "theme") callback();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener("theme-change", callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("theme-change", callback);
  };
}

function subscribeToSystemTheme(callback: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function readSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribeToTheme, readTheme, () => "system");
  const systemTheme = useSyncExternalStore<"light" | "dark">(subscribeToSystemTheme, readSystemTheme, () => "light");
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((nextTheme: Theme) => {
    localStorage.setItem("theme", nextTheme);
    window.dispatchEvent(new Event("theme-change"));
  }, []);

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
