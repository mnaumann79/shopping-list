import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import OnboardingPage from "../../onboarding/page";

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: {
      create: vi.fn(),
      list: vi.fn(),
      setActive: vi.fn(),
    },
    useSession: vi.fn(),
  },
}));

import { authClient } from "@/lib/auth-client";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no active organization (new user)
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { session: { activeOrganizationId: null }, user: { name: "Alice" } },
      isPending: false,
    } as never);
    vi.mocked(authClient.organization.list).mockResolvedValue({ data: [], error: null } as never);
  });

  it("renders household name input and submit button", () => {
    render(<OnboardingPage />);
    return waitFor(async () => {
      expect(await screen.findByLabelText(/household name/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create household/i })).toBeInTheDocument();
    });
  });

  it("shows validation error for empty name", async () => {
    render(<OnboardingPage />);
    await screen.findByRole("button", { name: /create household/i });
    fireEvent.click(screen.getByRole("button", { name: /create household/i }));
    await waitFor(() => {
      expect(screen.getByText(/household name is required/i)).toBeInTheDocument();
    });
  });

  it("calls organization.create with name and slug on submit", async () => {
    vi.mocked(authClient.organization.create).mockResolvedValueOnce({ data: { id: "org-1" }, error: null } as never);
    vi.mocked(authClient.organization.setActive).mockResolvedValueOnce({ data: {}, error: null } as never);
    render(<OnboardingPage />);
    await screen.findByLabelText(/household name/i);
    fireEvent.change(screen.getByLabelText(/household name/i), { target: { value: "Smith Family" } });
    fireEvent.click(screen.getByRole("button", { name: /create household/i }));
    await waitFor(() => {
      expect(authClient.organization.create).toHaveBeenCalledWith({
        name: "Smith Family",
        slug: "smith-family",
      });
    });
  });

  it("calls organization.setActive with new org id after create", async () => {
    vi.mocked(authClient.organization.create).mockResolvedValueOnce({ data: { id: "org-1" }, error: null } as never);
    vi.mocked(authClient.organization.setActive).mockResolvedValueOnce({ data: {}, error: null } as never);
    render(<OnboardingPage />);
    await screen.findByLabelText(/household name/i);
    fireEvent.change(screen.getByLabelText(/household name/i), { target: { value: "Test Household" } });
    fireEvent.click(screen.getByRole("button", { name: /create household/i }));
    await waitFor(() => {
      expect(authClient.organization.setActive).toHaveBeenCalledWith({ organizationId: "org-1" });
    });
  });

  it("redirects to /dashboard after creating household", async () => {
    vi.mocked(authClient.organization.create).mockResolvedValueOnce({ data: { id: "org-1" }, error: null } as never);
    vi.mocked(authClient.organization.setActive).mockResolvedValueOnce({ data: {}, error: null } as never);
    render(<OnboardingPage />);
    await screen.findByLabelText(/household name/i);
    fireEvent.change(screen.getByLabelText(/household name/i), { target: { value: "Test Household" } });
    fireEvent.click(screen.getByRole("button", { name: /create household/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("redirects to /dashboard if user already has active org", async () => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { session: { activeOrganizationId: "existing-org-123" }, user: { name: "Alice" } },
      isPending: false,
    } as never);
    render(<OnboardingPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("restores the first existing household when membership exists but no active org is set", async () => {
    vi.mocked(authClient.organization.list).mockResolvedValue({
      data: [{ id: "org-existing", name: "Existing Household" }],
      error: null,
    } as never);
    vi.mocked(authClient.organization.setActive).mockResolvedValue({ data: {}, error: null } as never);

    render(<OnboardingPage />);

    await waitFor(() => {
      expect(authClient.organization.list).toHaveBeenCalled();
      expect(authClient.organization.setActive).toHaveBeenCalledWith({
        organizationId: "org-existing",
      });
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("renders the create form when no existing households are available", async () => {
    render(<OnboardingPage />);

    expect(await screen.findByLabelText(/household name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create household/i })).toBeInTheDocument();
  });
});
