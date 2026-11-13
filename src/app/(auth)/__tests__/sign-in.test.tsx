import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import SignInPage from "../sign-in/page";

// Mock next/navigation. The router object is stable: Next.js returns the
// same router from useRouter() on every render, and the sign-in page's
// effect depends on it.
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRouter = { push: mockPush, replace: mockReplace };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
}));

// Mock auth client — factory must not reference outer variables (vi.mock is hoisted)
vi.mock("@/lib/auth-client", () => ({
  signInWithPassword: vi.fn(),
  getSession: vi.fn(),
}));

// Import after mock to get mocked version
import { getSession, signInWithPassword } from "@/lib/auth-client";

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No session yet, so the page does not bounce the visitor away.
    vi.mocked(getSession).mockResolvedValue(null);
  });

  it("renders email and password fields", () => {
    render(<SignInPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("calls signInWithPassword on valid submit", async () => {
    vi.mocked(signInWithPassword).mockResolvedValueOnce({ error: null });
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith(
        "alice@example.com",
        "password123",
      );
    });
  });

  it("redirects to /dashboard on success with no returnTo", async () => {
    vi.mocked(signInWithPassword).mockResolvedValueOnce({ error: null });
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows generic error on failed sign in", async () => {
    vi.mocked(signInWithPassword).mockResolvedValueOnce({
      error: { message: "Invalid credentials" },
    });
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrongpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("sends a visitor who already has a session to the dashboard", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({} as never);
    render(<SignInPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("renders a link to /sign-up", () => {
    render(<SignInPage />);
    const link = screen.getByRole("link", { name: /sign up/i });
    expect(link).toHaveAttribute("href", "/sign-up");
  });
});
