import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
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

/** What the transitional route answers. */
function routeResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Fills the form in and signs in. */
function submit(email = "alice@example.com", password = "password123") {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No session yet, so the page does not bounce the visitor away.
    vi.mocked(getSession).mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders email and password fields", () => {
    render(<SignInPage />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("posts the credentials to the transitional route", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(routeResponse(200, { ok: true }));
    render(<SignInPage />);
    submit();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/auth/legacy-signin",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "alice@example.com", password: "password123" }),
        }),
      );
    });
  });

  it("redirects to /dashboard on success with no returnTo", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(routeResponse(200, { ok: true }));
    render(<SignInPage />);
    submit();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("leaves the choice of path to the route", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(routeResponse(200, { ok: true }));
    render(<SignInPage />);
    submit();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    // The route tries Supabase Auth first and falls back to the legacy
    // password. The page does not choose between the two.
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows the route's message when the route refuses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      routeResponse(401, { error: "Invalid email or password" }),
    );
    render(<SignInPage />);
    submit("alice@example.com", "wrongpassword");

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("tells a wrong password and an unknown account apart not at all", async () => {
    // Both are the route's one 401, and the page shows the one message.
    const wrongPassword = render(<SignInPage />);
    vi.mocked(fetch).mockResolvedValueOnce(
      routeResponse(401, { error: "Invalid email or password" }),
    );
    submit("alice@example.com", "wrongpassword");

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
    wrongPassword.unmount();

    vi.mocked(fetch).mockResolvedValueOnce(
      routeResponse(401, { error: "Invalid email or password" }),
    );
    render(<SignInPage />);
    submit("nobody@example.com", "password123");

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("shows the same message when the route cannot be reached", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    render(<SignInPage />);
    submit();

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("signs in with Supabase Auth alone when the route is gone", async () => {
    // The route goes with the rollback window, and a 404 is how the page
    // learns that it is gone.
    vi.mocked(fetch).mockResolvedValueOnce(routeResponse(404));
    vi.mocked(signInWithPassword).mockResolvedValueOnce({ error: null });
    render(<SignInPage />);
    submit();

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith(
        "alice@example.com",
        "password123",
      );
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
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
