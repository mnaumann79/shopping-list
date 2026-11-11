import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import SignInPage from "../sign-in/page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock auth client — factory must not reference outer variables (vi.mock is hoisted)
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
    },
  },
}));

// Import after mock to get mocked version
import { authClient } from "@/lib/auth-client";

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email and password fields", () => {
    render(<SignInPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("calls authClient.signIn.email on valid submit", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValueOnce({ data: {}, error: null } as never);
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(authClient.signIn.email).toHaveBeenCalledWith({
        email: "alice@example.com",
        password: "password123",
      });
    });
  });

  it("redirects to /dashboard on success with no returnTo", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValueOnce({ data: {}, error: null } as never);
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows generic error on failed sign in", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid credentials" },
    } as never);
    render(<SignInPage />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrongpassword" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("renders a link to /sign-up", () => {
    render(<SignInPage />);
    const link = screen.getByRole("link", { name: /sign up/i });
    expect(link).toHaveAttribute("href", "/sign-up");
  });
});
