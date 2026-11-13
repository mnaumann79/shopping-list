import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import OnboardingPage from "../../onboarding/page";
import { ThemeProvider } from "@/components/ThemeProvider";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRouter = { push: mockPush, replace: mockReplace };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(),
  listHouseholds: vi.fn(),
  createHousehold: vi.fn(),
  setActiveHousehold: vi.fn(),
  acceptInvitation: vi.fn(),
}));

import {
  acceptInvitation,
  createHousehold,
  listHouseholds,
  setActiveHousehold,
  useSession,
} from "@/lib/auth-client";

// The onboarding page renders MinimalHeader -> DarkModeToggle, which reads the
// theme context. Without a ThemeProvider above it, useTheme() throws.
function renderOnboarding() {
  return render(
    <ThemeProvider>
      <OnboardingPage />
    </ThemeProvider>
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // ThemeProvider resolves the "system" theme through matchMedia, which
    // jsdom does not implement. Report "light" for every query.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    // Default: no session yet, and no household to restore.
    vi.mocked(useSession).mockReturnValue({ session: null, isPending: false });
    vi.mocked(listHouseholds).mockResolvedValue([]);
    vi.mocked(acceptInvitation).mockResolvedValue(null);
    vi.mocked(setActiveHousehold).mockResolvedValue(true);
  });

  it("renders household name input and submit button", () => {
    renderOnboarding();
    return waitFor(async () => {
      expect(await screen.findByLabelText(/household name/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create household/i })).toBeInTheDocument();
    });
  });

  it("shows validation error for empty name", async () => {
    renderOnboarding();
    await screen.findByRole("button", { name: /create household/i });
    fireEvent.click(screen.getByRole("button", { name: /create household/i }));
    await waitFor(() => {
      expect(screen.getByText(/household name is required/i)).toBeInTheDocument();
    });
  });

  it("creates the household with the name on submit", async () => {
    vi.mocked(createHousehold).mockResolvedValueOnce({ householdId: "household-1" });
    renderOnboarding();
    await screen.findByLabelText(/household name/i);
    fireEvent.change(screen.getByLabelText(/household name/i), { target: { value: "Smith Family" } });
    fireEvent.click(screen.getByRole("button", { name: /create household/i }));
    await waitFor(() => {
      expect(createHousehold).toHaveBeenCalledWith("Smith Family");
    });
  });

  it("makes the new household the active one after create", async () => {
    vi.mocked(createHousehold).mockResolvedValueOnce({ householdId: "household-1" });
    renderOnboarding();
    await screen.findByLabelText(/household name/i);
    fireEvent.change(screen.getByLabelText(/household name/i), { target: { value: "Test Household" } });
    fireEvent.click(screen.getByRole("button", { name: /create household/i }));
    await waitFor(() => {
      expect(setActiveHousehold).toHaveBeenCalledWith("household-1");
    });
  });

  it("redirects to /dashboard after creating household", async () => {
    vi.mocked(createHousehold).mockResolvedValueOnce({ householdId: "household-1" });
    renderOnboarding();
    await screen.findByLabelText(/household name/i);
    fireEvent.change(screen.getByLabelText(/household name/i), { target: { value: "Test Household" } });
    fireEvent.click(screen.getByRole("button", { name: /create household/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("restores the first existing household when the user has one", async () => {
    vi.mocked(listHouseholds).mockResolvedValue([
      { id: "household-existing", name: "Existing Household", role: "owner" },
    ]);

    renderOnboarding();

    await waitFor(() => {
      expect(listHouseholds).toHaveBeenCalled();
      expect(setActiveHousehold).toHaveBeenCalledWith("household-existing");
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("renders the create form when no existing households are available", async () => {
    renderOnboarding();

    expect(await screen.findByLabelText(/household name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create household/i })).toBeInTheDocument();
  });
});
