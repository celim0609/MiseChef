import {
  getWeeklyDates,
  isFullWeekSelection,
  hasEmbeddedMenu,
  resolveHealthyLunchDay,
} from "../../../functions/storeWeeklyMealPlan.js";
import {
  resolveSelectionMealOptions,
  mealOptionSurcharge,
} from "../../../functions/healthyLunchOptions.js";
import { buildStoreOrderItems } from "./storeModel";
import type {
  CartSelection,
  StoreProduct,
  StoreSet,
  StoreOptionGroup,
} from "./types";
export type ManualLine = {
  quantity: number;
  date: string;
  time: string;
  method: string;
  deliveryAddress: string;
  notes: string;
  selection?: Partial<CartSelection>;
  custom?: { name: string; unitPrice: number; savePrivate?: boolean };
};
// Preview only. Saving and payment confirmation always use the server's catalog and saved amount.
export function previewManualLines(
  lines: ManualLine[],
  products: StoreProduct[],
  sets: StoreSet[],
  groups: StoreOptionGroup[],
) {
  const rows = lines.map((line, index) => {
    let name = line.custom?.name || "Custom Item";
    let unitMinor = 0;
    let error = "";
    let dates = [line.date];
    try {
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 20
      )
        throw new Error("Quantity must be 1–20.");
      if (line.custom) {
        unitMinor = Math.round(line.custom.unitPrice * 100);
        if (!line.custom.name.trim()) throw new Error("Enter an item name.");
        if (
          !Number.isFinite(unitMinor) ||
          unitMinor < 0 ||
          unitMinor > 10000000 ||
          unitMinor / 100 !== line.custom.unitPrice
        )
          throw new Error("Enter a valid price with up to two decimals.");
      } else {
        const selection = {
          ...line.selection,
          quantity: line.quantity,
          selectedOptions: line.selection?.selectedOptions || [],
        } as CartSelection;
        const product = products.find((p) => p.id === selection.productId);
        name =
          product?.name ||
          sets.find((s) => s.id === selection.setId)?.name ||
          "Unavailable item";
        let catalog = products;
        if (product && hasEmbeddedMenu(product) && selection.healthyLunchDate) {
          const meal = resolveHealthyLunchDay(
            product,
            products,
            selection.healthyLunchDate,
          );
          if (!meal) throw new Error("No meal on this date.");
          catalog = products.map((p) =>
            p.id === product.id
              ? {
                  ...meal,
                  id: product.id,
                  available: true,
                  optionGroupIds: meal.optionGroupIds || [],
                }
              : p,
          );
        }
        const item = buildStoreOrderItems(
          [selection],
          catalog,
          groups,
          sets,
        )[0];
        name = item.productName;
        unitMinor =
          Math.round(item.unitPrice * 100) +
          mealOptionSurcharge(
            resolveSelectionMealOptions(selection, products, line.date),
          );
        if (isFullWeekSelection(selection, products)) {
          dates = getWeeklyDates(line.date);
          if (dates.length !== 5)
            throw new Error("Choose a Monday for the full week.");
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Complete this item.";
    }
    return {
      index,
      name,
      unitMinor,
      totalMinor: error ? null : unitMinor * line.quantity,
      dates,
      error,
    };
  });
  const days = new Map<
    string,
    {
      date: string;
      totalMinor: number;
      entries: {
        index: number;
        name: string;
        quantity: number;
        time: string;
        method: string;
        amountMinor: number | null;
        package: boolean;
      }[];
    }
  >();
  rows.forEach((row) =>
    row.dates.forEach((date, dayIndex) => {
      const line = lines[row.index];
      const day = days.get(date) || { date, totalMinor: 0, entries: [] };
      // Allocate a package's cents evenly for the planning summary; never multiply the package price by five.
      const amountMinor =
        row.totalMinor === null
          ? null
          : Math.floor(row.totalMinor / row.dates.length) +
            (dayIndex < row.totalMinor % row.dates.length ? 1 : 0);
      day.totalMinor += amountMinor || 0;
      day.entries.push({
        index: row.index,
        name: row.name,
        quantity: line.quantity,
        time: line.time,
        method: line.method,
        amountMinor,
        package: row.dates.length > 1,
      });
      days.set(date, day);
    }),
  );
  return {
    rows,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totalMinor: rows.some((row) => row.error)
      ? null
      : rows.reduce((sum, row) => sum + (row.totalMinor || 0), 0),
  };
}
