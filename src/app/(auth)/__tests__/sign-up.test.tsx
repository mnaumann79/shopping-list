import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import SignUpPage from "../sign-up/page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock auth client — factory must not reference outer variables (vi.mock is hoisted)
vi.mock("@/lib/auth-client", () => ({
  signUpWithPassword: vi.fn(),
  setActiveHousehold: vi.fn(),
  acceptInvitation: vi.fn(),
}));

// Import after mock to get mocked version
import { signUpWithPassword } from "@/lib/auth-client";

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name, email, and password fields", () => {
    render(<SignUpPage />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("shows validation errors for empty fields on submit", async () => {
    render(<SignUpPage />);
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
  });

  it("shows error for invalid email format", async () => {
    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "notanemail" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
  });

  it("shows error when password is shorter than 8 characters", async () => {
    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it("calls signUpWithPassword on valid submit", async () => {
    vi.mocked(signUpWithPassword).mockResolvedValueOnce({ error: null });
    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      expect(signUpWithPassword).toHaveBeenCalledWith(
        "Alice",
        "alice@example.com",
        "password123",
      );
    });
  });

  it("redirects to /onboarding on success", async () => {
    vi.mocked(signUpWithPassword).mockResolvedValueOnce({ error: null });
    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("shows error message on sign up failure", async () => {
    vi.mocked(signUpWithPassword).mockResolvedValueOnce({
      error: { message: "Email already in use" },
    });
    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
    await waitFor(() => {
      expect(screen.getByText(/email already in use/i)).toBeInTheDocument();
    });
  });

  it("renders a link to /sign-in", () => {
    render(<SignUpPage />);
    const link = screen.getByRole("link", { name: /sign in/i });
    expect(link).toHaveAttribute("href", "/sign-in");
  });
});
