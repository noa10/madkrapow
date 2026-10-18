"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

/** A single dish on a kitchen ticket, with its addons flattened to names. */
export interface KitchenItem {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  modifiers: string[];
}

/**
 * Raw `order_items` row shape as returned by the embedded select below.
 *
 * Exported so the grouping can be tested without a live client.
 */
export interface RawKitchenItemRow {
  id: string;
  order_id: string;
  menu_item_name: string;
  quantity: number | null;
  notes: string | null;
  order_item_modifiers: { modifier_name: string }[] | null;
}

// One query, not two: `order_item_modifiers.order_item_id` references
// `order_items(id)`, so PostgREST embeds the addons directly. Only the columns
// the ticket renders — no prices, the kitchen doesn't read money.
const ITEM_SELECT =
  "id, order_id, menu_item_name, quantity, notes, order_item_modifiers(modifier_name)";

/**
 * Groups embedded item rows by their order id, preserving row order.
 *
 * Order is significant on a kitchen ticket — it is the order the dishes were
 * added — so this never re-sorts. Orders with no items are absent from the
 * result rather than present with an empty array.
 */
export function groupItemsByOrderId(
  rows: RawKitchenItemRow[]
): Record<string, KitchenItem[]> {
  const byOrderId: Record<string, KitchenItem[]> = {};

  for (const row of rows) {
    const items = (byOrderId[row.order_id] ??= []);
    items.push({
      id: row.id,
      name: row.menu_item_name,
      quantity: row.quantity ?? 1,
      notes: row.notes,
      modifiers: (row.order_item_modifiers ?? []).map((m) => m.modifier_name),
    });
  }

  return byOrderId;
}

/**
 * Items (with addons) for the given orders, keyed by order id.
 *
 * Items are supporting detail: if this fails the board must still show the
 * orders, so the error is surfaced separately rather than thrown or used to
 * blank the data. A card can then say "unavailable" instead of the misleading
 * "no items recorded".
 */
export function useKitchenOrderItems(orderIds: string[]) {
  const [itemsByOrderId, setItemsByOrderId] = useState<
    Record<string, KitchenItem[]>
  >({});
  const [error, setError] = useState<string | null>(null);

  // Key on the *set* of ids, not array identity: the caller rebuilds the array
  // on every realtime order event, which would otherwise refetch constantly.
  const idsKey = [...orderIds].sort().join(",");

  useEffect(() => {
    if (!idsKey) return;

    let cancelled = false;
    const supabase = getBrowserClient();

    const load = async () => {
      const { data, error: queryError } = await supabase
        .from("order_items")
        .select(ITEM_SELECT)
        .in("order_id", idsKey.split(","))
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setError(null);
      setItemsByOrderId(
        groupItemsByOrderId((data ?? []) as unknown as RawKitchenItemRow[])
      );
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  // With no ids there is nothing to show, derived rather than written to state:
  // setting it from the effect body would trigger a cascading render.
  return {
    itemsByOrderId: idsKey ? itemsByOrderId : {},
    error: idsKey ? error : null,
  };
}
