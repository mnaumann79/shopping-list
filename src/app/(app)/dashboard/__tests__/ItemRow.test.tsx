import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ItemRow } from "../_components/ItemRow";

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, error: toastMock }));

const fetchMock = vi.fn();
global.fetch = fetchMock as typeof fetch;

const MOCK_ITEM = {
  id: "item-1",
  name: "Milk",
  quantity: "2",
  note: "Whole milk",
  categoryId: "cat-1",
  isActive: true,
  isChecked: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdById: "u1",
  householdId: "org-1",
  storeIds: ["store-1"],
};

const CHECKED_ITEM = {
  ...MOCK_ITEM,
  isChecked: true,
};

const MOCK_STORES = [
  { id: "store-1", name: "Costco" },
  { id: "store-2", name: "Trader Joe's" },
];

const MOCK_CATEGORIES = [
  { id: "cat-1", name: "Dairy & Eggs" },
  { id: "cat-2", name: "Produce" },
];

beforeEach(() => {
  fetchMock.mockReset();
  toastMock.mockReset();
});

describe("ItemRow (compact row)", () => {
  it("renders item name and quantity inline", () => {
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders store tag in compact row", () => {
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    expect(screen.getByText("CO")).toBeInTheDocument();
  });

  it("tapping the row body toggles completion", () => {
    const onToggleChecked = vi.fn();
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={onToggleChecked}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^Milk$/i }));

    expect(onToggleChecked).toHaveBeenCalledWith("item-1", true);
  });

  it("checked rows render the required visual state", () => {
    render(
      <ItemRow
        item={CHECKED_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^Milk$/i })).toHaveAttribute(
      "data-checked",
      "true"
    );
    expect(screen.getByRole("button", { name: /^milk$/i })).toHaveClass("line-through");
  });

  it("hides quantity column when quantity is null", () => {
    render(
      <ItemRow
        item={{ ...MOCK_ITEM, quantity: null }}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    expect(screen.queryByText("2")).toBeNull();
  });

  it("hides notes column when note is null", () => {
    render(
      <ItemRow
        item={{ ...MOCK_ITEM, note: null }}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    expect(screen.queryByText("Whole milk")).toBeNull();
  });

  it("hides store column when no stores assigned", () => {
    render(
      <ItemRow
        item={{ ...MOCK_ITEM, storeIds: [] }}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    expect(screen.queryByText("Costco")).toBeNull();
  });

  it("shows +N count when multiple stores assigned", () => {
    render(
      <ItemRow
        item={{ ...MOCK_ITEM, storeIds: ["store-1", "store-2"] }}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    expect(screen.getByText("CO")).toBeInTheDocument();
  });

  it("notes preview is visible in compact row", () => {
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    expect(screen.getByText("Whole milk")).toBeInTheDocument();
  });
});

describe("ItemRow (edit modal)", () => {
  it("edit opens from a dedicated affordance without toggling completion", async () => {
    const onUpdate = vi.fn();
    const onToggleChecked = vi.fn();
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={onUpdate}
        onToggleChecked={onToggleChecked}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit milk/i }));

    expect(await screen.findByLabelText("Name", {}, { timeout: 5_000 })).toHaveValue("Milk");
    expect(screen.getByLabelText("Quantity")).toHaveValue("2");
    expect(screen.getByLabelText("Note")).toHaveValue("Whole milk");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onToggleChecked).not.toHaveBeenCalled();
  }, 10_000);

  it("closing with cancel hides edit fields", async () => {
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /edit milk/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^discard$/i }, { timeout: 5_000 }));
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  }, 10_000);

  it("saves updated name and quantity", async () => {
    const onUpdate = vi.fn();
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={onUpdate}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /edit milk/i }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Oat Milk" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onUpdate).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ name: "Oat Milk", quantity: "3" })
    );
  });

  it("changing category select can target another category", async () => {
    const onUpdate = vi.fn();
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={onUpdate}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /edit milk/i }));
    fireEvent.change(await screen.findByDisplayValue("Dairy & Eggs"), {
      target: { value: "cat-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onUpdate).toHaveBeenCalledWith(
      "item-1",
      { categoryId: "cat-2" }
    );
  });

  it("does not resend storeIds when only the category changes", async () => {
    const onUpdate = vi.fn();
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={onUpdate}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit milk/i }));
    fireEvent.change(await screen.findByDisplayValue("Dairy & Eggs"), {
      target: { value: "cat-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onUpdate).toHaveBeenCalledWith("item-1", { categoryId: "cat-2" });
    expect(onUpdate.mock.calls[0]?.[1]).not.toHaveProperty("storeIds");
  });

  it("shows inline category creation controls and creates a category", async () => {
    const onCategoryCreated = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "cat-3", name: "Wine & Beer" }),
    });

    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={vi.fn()}
        onCategoryCreated={onCategoryCreated}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit milk/i }));
    fireEvent.change(screen.getByDisplayValue("Dairy & Eggs"), {
      target: { value: "__new__" },
    });
    fireEvent.change(screen.getByLabelText("New category name"), {
      target: { value: "Wine & Beer" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add category/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/categories",
        expect.objectContaining({ method: "POST" })
      );
    });

    expect(onCategoryCreated).toHaveBeenCalledWith({ id: "cat-3", name: "Wine & Beer" });
  });

  it("delete triggers onDelete and shows undo toast", async () => {
    const onDelete = vi.fn();
    render(
      <ItemRow
        item={MOCK_ITEM}
        stores={MOCK_STORES}
        categories={MOCK_CATEGORIES}
        onUpdate={vi.fn()}
        onToggleChecked={vi.fn()}
        onDelete={onDelete}
        onCategoryCreated={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /delete milk/i }));
    expect(onDelete).toHaveBeenCalledWith("item-1");
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalled();
    });
  });
});
