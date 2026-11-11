import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickAddBar } from "../_components/QuickAddBar";

type Store = { id: string; name: string };

const STORES: Store[] = [
  { id: "store-costco", name: "Costco" },
  { id: "store-trader-joes", name: "Trader Joe's" },
];

function renderQuickAddBar(overrides: Partial<Parameters<typeof QuickAddBar>[0]> = {}) {
  const props = {
    onAdd: vi.fn(),
    selectedStoreId: "",
    onStoreChange: vi.fn(),
    stores: STORES,
    ...overrides,
  };
  render(<QuickAddBar {...props} />);
  return props;
}

describe("QuickAddBar", () => {
  it("calls onAdd with item name when form is submitted", () => {
    const { onAdd } = renderQuickAddBar();
    const input = screen.getByLabelText("Item name");
    fireEvent.change(input, { target: { value: "Milk" } });
    fireEvent.submit(input.closest("form")!);
    expect(onAdd).toHaveBeenCalledWith({ name: "Milk", quantity: null, storeIds: [] });
  });

  it("calls onAdd when Enter key is pressed in the input", () => {
    const { onAdd } = renderQuickAddBar();
    const input = screen.getByLabelText("Item name");
    fireEvent.change(input, { target: { value: "Eggs" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onAdd).toHaveBeenCalledWith({ name: "Eggs", quantity: null, storeIds: [] });
  });

  it("does not call onAdd when the item name is empty", () => {
    const { onAdd } = renderQuickAddBar();
    const input = screen.getByLabelText("Item name");
    fireEvent.submit(input.closest("form")!);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("clears the inputs after successful submission", () => {
    renderQuickAddBar();
    const nameInput = screen.getByLabelText("Item name") as HTMLInputElement;
    const quantityInput = screen.getByLabelText("Quantity") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Bread" } });
    fireEvent.change(quantityInput, { target: { value: "2" } });
    fireEvent.submit(nameInput.closest("form")!);
    expect(nameInput.value).toBe("");
    expect(quantityInput.value).toBe("");
  });

  it("includes quantity when provided", () => {
    const { onAdd } = renderQuickAddBar();
    fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Soda" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith({ name: "Soda", quantity: "4", storeIds: [] });
  });

  it("shows selected store when selectedStoreId is provided", () => {
    renderQuickAddBar({ selectedStoreId: "store-costco" });
    const select = screen.getByLabelText("Store") as HTMLSelectElement;
    expect(select.value).toBe("store-costco");
  });

  it("calls onStoreChange when store is changed", () => {
    const { onStoreChange } = renderQuickAddBar();
    fireEvent.change(screen.getByLabelText("Store"), { target: { value: "store-costco" } });
    expect(onStoreChange).toHaveBeenCalledWith("store-costco");
  });

  it("calls onAdd with storeIds when store is selected", () => {
    const { onAdd } = renderQuickAddBar({ selectedStoreId: "store-costco" });
    fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Milk" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith({ name: "Milk", quantity: null, storeIds: ["store-costco"] });
  });
});
