import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShoppingList } from "../_components/ShoppingList";

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: toastMock,
}));

vi.mock("../_components/QuickAddBar", () => ({
  QuickAddBar: ({ selectedStoreId }: { selectedStoreId: string }) => (
    <div data-testid="quick-add-bar" data-default-store={selectedStoreId || undefined} />
  ),
}));

vi.mock("../_components/ItemRow", () => ({
  ItemRow: ({ item }: { item: { id: string; name: string; isChecked: boolean } }) => (
    <div data-testid={`item-${item.id}`} data-checked={item.isChecked ? "true" : "false"}>
      {item.name}
    </div>
  ),
}));

const CATEGORIES = [
  { id: "cat-produce", name: "Produce" },
  { id: "cat-dairy", name: "Dairy & Eggs" },
  { id: "cat-pantry", name: "Pantry" },
];

const STORES = [
  { id: "store-costco", name: "Costco" },
  { id: "store-trader-joes", name: "Trader Joe's" },
];

const ITEMS = [
  {
    id: "item-apples",
    name: "Apples",
    quantity: "4",
    note: null,
    categoryId: "cat-produce",
    isActive: true,
    isChecked: false,
    archivedAt: null,
    createdAt: "2026-03-13T00:00:00.000Z",
    updatedAt: "2026-03-13T00:00:00.000Z",
    createdById: "u1",
    organizationId: "org-1",
    storeIds: ["store-costco"],
  },
  {
    id: "item-bread",
    name: "Bread",
    quantity: null,
    note: null,
    categoryId: "cat-pantry",
    isActive: true,
    isChecked: false,
    archivedAt: null,
    createdAt: "2026-03-13T00:00:00.000Z",
    updatedAt: "2026-03-13T00:00:00.000Z",
    createdById: "u1",
    organizationId: "org-1",
    storeIds: [],
  },
  {
    id: "item-milk",
    name: "Milk",
    quantity: "2",
    note: null,
    categoryId: "cat-dairy",
    isActive: true,
    isChecked: false,
    archivedAt: null,
    createdAt: "2026-03-13T00:00:00.000Z",
    updatedAt: "2026-03-13T00:00:00.000Z",
    createdById: "u1",
    organizationId: "org-1",
    storeIds: ["store-costco", "store-trader-joes"],
  },
  {
    id: "item-yogurt",
    name: "Yogurt",
    quantity: null,
    note: null,
    categoryId: "cat-dairy",
    isActive: true,
    isChecked: true,
    archivedAt: null,
    createdAt: "2026-03-13T00:00:00.000Z",
    updatedAt: "2026-03-13T00:00:00.000Z",
    createdById: "u1",
    organizationId: "org-1",
    storeIds: ["store-trader-joes"],
  },
];

describe("ShoppingList", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    toastMock.mockReset();
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not render DarkModeToggle", () => {
    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);
    expect(screen.queryByTestId("dark-mode-toggle")).toBeNull();
  });

  it("renders the All stores chip first and persists selected trip controls locally", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    const allStoresChip = screen.getByRole("button", { name: /All stores/i });
    expect(allStoresChip.compareDocumentPosition(screen.getByRole("button", { name: /Costco/i })) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Trader Joe's/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Store$/i }, { timeout: 5_000 }));

    await waitFor(() => {
      expect(setItemSpy).toHaveBeenCalledWith("shopping-trip-store-filter", "store-trader-joes");
      expect(setItemSpy).toHaveBeenCalledWith("shopping-trip-organization-mode", "store");
    });

    setItemSpy.mockRestore();
  });

  it("restores saved trip controls after mount", async () => {
    window.localStorage.setItem("shopping-trip-store-filter", "store-trader-joes");
    window.localStorage.setItem("shopping-trip-organization-mode", "store");

    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Trader Joe's/i })[0]).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByRole("button", { name: /^Store$/i })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });
  });

  it("renders active items by category and shows completed items", () => {
    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    expect(screen.getByRole("heading", { name: /Produce \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Dairy & Eggs \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Pantry \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Completed \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText("Yogurt")).toBeInTheDocument();
  });

  it("can switch to alphabetical organization and render a flat A-Z list", () => {
    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    fireEvent.click(screen.getByRole("button", { name: /Alphabetical/i }));

    expect(screen.getByText("Apples")).toBeInTheDocument();
    expect(screen.getByText("Bread")).toBeInTheDocument();
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Produce \(1\)/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /A-Z/i })).not.toBeInTheDocument();
  });

  it("can filter by store while still showing untagged items", () => {
    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    fireEvent.click(screen.getByRole("button", { name: /Costco/i }));

    expect(screen.getByText("Apples")).toBeInTheDocument();
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.getByText("Bread")).toBeInTheDocument();
    expect(screen.queryByText("Yogurt")).not.toBeInTheDocument();
  });

  it("can switch to store organization and render store plus untagged sections", async () => {
    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    fireEvent.click(await screen.findByRole("button", { name: /^Store$/i }));

    expect(screen.getByRole("heading", { name: /Costco \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Trader Joe's \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Untagged \(1\)/i })).toBeInTheDocument();
  });

  it("shows filter-aware empty copy when the selected store has no active items", () => {
    const itemsWithOnlyCompletedAtTraderJoes = ITEMS.map((item) => {
      if (item.id === "item-milk") {
        return { ...item, storeIds: ["store-costco"] };
      }

      if (item.id === "item-bread") {
        return { ...item, storeIds: ["store-costco"] };
      }

      return item;
    });

    render(
      <ShoppingList
        initialItems={itemsWithOnlyCompletedAtTraderJoes}
        categories={CATEGORIES}
        stores={STORES}
      />
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Trader Joe's/i })[0]);

    expect(screen.getByText(/No active items for Trader Joe's right now\./i)).toBeInTheDocument();
    expect(screen.getByText(/Completed items are still available below\./i)).toBeInTheDocument();
  });

  it("archives completed items and removes them from the active list", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          clearedItems: [ITEMS[3]],
        }),
      } as Response);

    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    // Completed items are visible by default
    expect(screen.getByText("Yogurt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Clear completed/i }));

    expect(confirmSpy).toHaveBeenCalledWith("Clear all completed items?");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/items/clear-completed", { method: "POST" });
    });
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: /Completed \(1\)/i })).not.toBeInTheDocument();
    });

    expect(toastMock).toHaveBeenCalledWith("Archived 1 completed item. Re-add them from History.");
  });

  it("does not clear completed items when confirmation is cancelled", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.mocked(fetch);

    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    fireEvent.click(screen.getByRole("button", { name: /Clear completed/i }));

    expect(confirmSpy).toHaveBeenCalledWith("Clear all completed items?");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses filter store as Priority 1 default for QuickAddBar", async () => {
    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    fireEvent.click(screen.getByRole("button", { name: /Costco/i }));

    await waitFor(() => {
      const quickAddBar = screen.getByTestId("quick-add-bar");
      expect(quickAddBar.getAttribute("data-default-store")).toBe("store-costco");
    });
  });

  it("falls back to last-used store when filter is All stores", async () => {
    window.localStorage.setItem("shopping-last-store", "store-trader-joes");

    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    await waitFor(() => {
      const quickAddBar = screen.getByTestId("quick-add-bar");
      expect(quickAddBar.getAttribute("data-default-store")).toBe("store-trader-joes");
    });
  });

  it("falls back to blank when last-used store is deleted", async () => {
    window.localStorage.setItem("shopping-last-store", "store-nonexistent");

    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    await waitFor(() => {
      const quickAddBar = screen.getByTestId("quick-add-bar");
      // When last-used store is deleted, the attribute is absent (null from getAttribute)
      expect(quickAddBar.getAttribute("data-default-store")).toBeNull();
    });
  });

  it("persists last-used store optimistically on add", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "new-item", name: "Bananas", storeIds: ["store-costco"] }),
    } as Response);

    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);

    // Click Costco to set filter store; verify QuickAddBar receives it as default
    fireEvent.click(screen.getByRole("button", { name: /Costco/i }));

    await waitFor(() => {
      const quickAddBar = screen.getByTestId("quick-add-bar");
      expect(quickAddBar.getAttribute("data-default-store")).toBe("store-costco");
    });
    // The filter selection itself persists via TRIP_STORE_FILTER_KEY
    expect(window.localStorage.getItem("shopping-trip-store-filter")).toBe("store-costco");
  });

  it("updates last-used store on edit when storeIds changes", () => {
    window.localStorage.setItem("shopping-last-store", "store-costco");
    render(<ShoppingList initialItems={ITEMS} categories={CATEGORIES} stores={STORES} />);
    // Initial last-used store is Costco
    expect(window.localStorage.getItem("shopping-last-store")).toBe("store-costco");
  });
});
