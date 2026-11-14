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

  it("refuses a destination that would send the visitor in a circle", () => {
    expect(safeDestination("/sign-in")).toBeNull();
    expect(safeDestination("/sign-up")).toBeNull();
  });

  it("refuses a destination that is not there", () => {
    expect(safeDestination(null)).toBeNull();
    expect(safeDestination("")).toBeNull();
  });
});
