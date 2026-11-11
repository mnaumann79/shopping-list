"use client";

import { useTheme } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, type ReactNode } from "react";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={(resolvedTheme ?? "system") as "light" | "dark" | "system"} />;
}

const PREVIEW_FONTS: Record<string, string[]> = {
  warm: ["Nunito:wght@400;500;600;700", "Fraunces:ital,opsz,wght@0,9..144,400..700"],
  clean: ["Plus Jakarta Sans:wght@400;500;600;700", "Poppins:wght@400;500;600;700"],
  bold: ["DM Sans:wght@400;500;600;700", "Fredoka:wght@400;500;600;700"],
};

function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker?.getRegistrations().then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      );
      void caches?.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration can fail in dev or private browsing
      });
    }
  }, []);
  return null;
}

function ThemePreviewLoader() {
  useEffect(() => {
    const saved = localStorage.getItem("theme-preview");
    document.documentElement.classList.remove("warm-preview", "clean-preview", "bold-preview");
    if (saved && PREVIEW_FONTS[saved]) {
      document.documentElement.classList.add(`${saved}-preview`);
      // Lazy-load preview fonts only when preview is active
      const id = "theme-preview-fonts";
      if (!document.getElementById(id)) {
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${PREVIEW_FONTS[saved].join("&family=")}&display=swap`;
        document.head.appendChild(link);
      }
    }
  }, []);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistration />
      <ThemePreviewLoader />
      {children}
      <ThemedToaster />
    </>
  );
}
