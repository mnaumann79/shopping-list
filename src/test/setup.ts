import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

// Make next/dynamic work in tests using React.lazy + Suspense.
// Without this, components loaded with { ssr: false } never render in jsdom.
vi.mock("next/dynamic", () => ({
  default: (fn: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
    const LazyComp = React.lazy(fn);
    return function DynamicWrapper(props: Record<string, unknown>) {
      return React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(LazyComp, props)
      );
    };
  },
}));
