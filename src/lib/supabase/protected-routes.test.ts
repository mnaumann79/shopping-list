import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROTECTED_ROUTE_PREFIXES, isProtectedRoute } from "./protected-routes";

const APP_DIR = join(process.cwd(), "src", "app");

/**
 * Every page under a directory, as the path a visitor asks for.
 *
 * A route group — `(app)`, `(auth)` — is invisible in the URL, so it is not
 * part of the path.
 */
function pageRoutes(directory = APP_DIR, prefix = ""): string[] {
  const routes: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      const segment = entry.name.startsWith("(") ? "" : `/${entry.name}`;
      routes.push(...pageRoutes(path, `${prefix}${segment}`));
    } else if (entry.name === "page.tsx") {
      routes.push(prefix || "/");
    }
  }

  return routes;
}

describe("isProtectedRoute", () => {
  it("protects every page the application's own layout guards", () => {
    // Every page under the `(app)` group is guarded by that group's layout,
    // which checks the session. The edge guard has to guard them too, or a
    // caller without a session reaches a page that throws them out.
    const guarded = pageRoutes(join(APP_DIR, "(app)"));

    expect(guarded.length).toBeGreaterThan(0);
    for (const route of guarded) {
      expect(isProtectedRoute(route)).toBe(true);
    }
  });

  it("protects the onboarding page, which stands outside the group", () => {
    expect(isProtectedRoute("/onboarding")).toBe(true);
  });

  it("does not protect the pages a visitor may reach without a session", () => {
    for (const route of ["/sign-in", "/sign-up", "/join", "/accept-invite"]) {
      expect(isProtectedRoute(route)).toBe(false);
    }
  });

  it("protects a route and what is under it, and nothing else", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
    expect(isProtectedRoute("/dashboard/items")).toBe(true);

    // `/history-2024` is not `/history`: a prefix that matched more than it
    // should would guard a page the application does not have.
    expect(isProtectedRoute("/history-2024")).toBe(false);
  });

  it("names no route the application does not have", () => {
    const routes = pageRoutes();

    for (const prefix of PROTECTED_ROUTE_PREFIXES) {
      expect(
        routes.some((route) => route === prefix || route.startsWith(`${prefix}/`)),
      ).toBe(true);
    }
  });
});
