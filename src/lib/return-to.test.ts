import { describe, expect, it } from "vitest";
import { safeDestination } from "./return-to";

describe("safeDestination", () => {
  it("keeps a page of this application", () => {
    expect(safeDestination("/dashboard")).toBe("/dashboard");
    expect(safeDestination("/household/settings")).toBe("/household/settings");
  });

  it("refuses a destination that points off this site", () => {
    // "//host" is a host, not a path: a browser reads it as another site.
    expect(safeDestination("//example.com")).toBeNull();
    expect(safeDestination("https://example.com")).toBeNull();
    expect(safeDestination("example.com")).toBeNull();
  });

  it("refuses a destination a browser reads as another site", () => {
    // A backslash is a slash to a browser, and the tab and the newline are
    // removed from a URL before it is read. The three forms below are the
    // ones the rule exists for: a browser sends every one of them to
    // another site.
    const base = "https://app.example";
    expect(new URL("/\\evil.com", base).href).toBe("https://evil.com/");
    expect(new URL("/\\/evil.com", base).href).toBe("https://evil.com/");
    expect(new URL("/\t/evil.com", base).href).toBe("https://evil.com/");

    expect(safeDestination("/\\evil.com")).toBeNull();
    expect(safeDestination("/\\/evil.com")).toBeNull();
    expect(safeDestination("/\t/evil.com")).toBeNull();

    // A percent-encoded backslash stays on this site: the URL parser does
    // not decode it before it looks for the authority, so the rule does not
    // need to refuse it — and does not.
    expect(new URL("/%5cevil.com", base).href).toBe(
      "https://app.example/%5cevil.com",
    );
    expect(safeDestination("/%5cevil.com")).toBe("/%5cevil.com");
  });

  it("refuses a destination that would send the visitor in a circle", () => {
    expect(safeDestination("/sign-in")).toBeNull();
    expect(safeDestination("/sign-up")).toBeNull();
  });

  it("refuses a destination that is not there", () => {
    expect(safeDestination(null)).toBeNull();
    expect(safeDestination("")).toBeNull();
  });
});
