"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useToastStore } from "@/stores/toast";

export type PromoScope = "order" | "delivery";
export type ApplicationType = "code" | "auto";
export type DiscountType = "percentage" | "fixed";

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  scope: PromoScope;
  application_type: ApplicationType;
  discount_type: DiscountType;
  discount_value: number;
  min_order_amount_cents: number | null;
  max_discount_cents: number | null;
  max_uses: number | null;
  current_uses: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price_cents: number;
}

export interface CategoryWithItems {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface PromoFormData {
  code: string;
  description: string;
  scope: PromoScope;
  application_type: ApplicationType;
  discount_type: DiscountType;
  discount_value: string;
  min_order_amount: string;
  max_discount: string;
  max_uses: string;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  targetMenuItemIds: Set<string>;
}

export const EMPTY_FORM: PromoFormData = {
  code: "",
  description: "",
  scope: "order",
  application_type: "code",
  discount_type: "percentage",
  discount_value: "",
  min_order_amount: "",
  max_discount: "",
  max_uses: "",
  valid_from: new Date().toISOString().split("T")[0],
  valid_until: "",
  is_active: true,
  targetMenuItemIds: new Set(),
};

export interface PromoPayload {
  code: string;
  description: string | null;
  scope: PromoScope;
  application_type: ApplicationType;
  discount_type: DiscountType;
  discount_value: number;
  min_order_amount_cents: number | null;
  max_discount_cents: number | null;
  max_uses: number | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

export function usePromos() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuCategories, setMenuCategories] = useState<CategoryWithItems[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    const supabase = getBrowserClient();
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setPromos(data || []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  // Real-time subscription for cross-session promo sync
  useEffect(() => {
    const supabase = getBrowserClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel("promo-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "promo_codes" },
        (payload: { new: PromoCode }) => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            setPromos((prev) => [payload.new, ...prev]);
          }, 200);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "promo_codes" },
        (payload: { new: PromoCode }) => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            setPromos((prev) =>
              prev.map((p) => (p.id === payload.new.id ? payload.new : p))
            );
          }, 200);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "promo_codes" },
        (payload: { old: { id: string } }) => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            setPromos((prev) => prev.filter((p) => p.id !== payload.old.id));
          }, 200);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "promo_items" },
        () => {
          // Target item changes may affect promo eligibility; refetch promos
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            fetchPromos();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchPromos]);

  const fetchMenuItems = useCallback(async () => {
    setMenuLoading(true);
    const supabase = getBrowserClient();
    const [catRes, itemRes] = await Promise.all([
      supabase.from("categories").select("id, name").order("sort_order"),
      supabase.from("menu_items").select("id, name, price_cents, category_id").eq("is_available", true).order("name"),
    ]);
    if (catRes.data && itemRes.data) {
      const cats: CategoryWithItems[] = catRes.data.map((c: { id: string; name: string }) => ({
        id: c.id,
        name: c.name,
        items: itemRes.data.filter((i: { category_id: string }) => i.category_id === c.id),
      }));
      setMenuCategories(cats.filter((c) => c.items.length > 0));
    }
    setMenuLoading(false);
  }, []);

  const fetchPromoTargetItems = useCallback(async (promoId: string): Promise<string[]> => {
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("promo_items")
      .select("menu_item_id")
      .eq("promo_id", promoId)
      .eq("role", "target");
    return (data || []).map((r: { menu_item_id: string }) => r.menu_item_id);
  }, []);

  const toggleActive = useCallback(
    async (promo: PromoCode) => {
      const nextActive = !promo.is_active;

      // Optimistic update
      setPromos((prev) =>
        prev.map((p) => (p.id === promo.id ? { ...p, is_active: nextActive } : p))
      );

      const supabase = getBrowserClient();
      try {
        const { error } = await supabase
          .from("promo_codes")
          .update({ is_active: nextActive })
          .eq("id", promo.id);
        if (error) throw error;
        addToast({
          type: "success",
          title: nextActive ? "Promotion activated" : "Promotion deactivated",
          description: promo.code,
          duration: 3000,
        });
      } catch (err: unknown) {
        // Revert using functional update to avoid stale closure
        setPromos((prev) =>
          prev.map((p) => (p.id === promo.id ? { ...p, is_active: promo.is_active } : p))
        );
        const message = err instanceof Error ? err.message : "Failed to toggle status";
        addToast({ type: "error", title: "Error", description: message, duration: 4000 });
      }
    },
    [addToast]
  );

  const deletePromo = useCallback(
    async (promo: PromoCode) => {
      const supabase = getBrowserClient();
      try {
        const { error } = await supabase.from("promo_codes").delete().eq("id", promo.id);
        if (error) throw error;
        setPromos((prev) => prev.filter((p) => p.id !== promo.id));
        addToast({
          type: "success",
          title: "Promotion deleted",
          description: promo.code,
          duration: 3000,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to delete promotion";
        addToast({ type: "error", title: "Error", description: message, duration: 4000 });
      }
    },
    [addToast]
  );

  const savePromo = useCallback(
    async (formData: PromoFormData, editingPromo: PromoCode | null) => {
      const supabase = getBrowserClient();

      const discountValue =
        formData.discount_type === "percentage"
          ? parseInt(formData.discount_value, 10)
          : Math.round(parseFloat(formData.discount_value) * 100);

      if (isNaN(discountValue) || discountValue < 0) {
        throw new Error("Invalid discount value");
      }

      const minOrder = formData.min_order_amount
        ? Math.round(parseFloat(formData.min_order_amount) * 100)
        : null;
      if (minOrder !== null && isNaN(minOrder)) {
        throw new Error("Invalid minimum order amount");
      }

      const maxDiscount = formData.max_discount ? parseInt(formData.max_discount, 10) : null;
      if (maxDiscount !== null && isNaN(maxDiscount)) {
        throw new Error("Invalid maximum discount");
      }

      const maxUses = formData.max_uses ? parseInt(formData.max_uses, 10) : null;
      if (maxUses !== null && isNaN(maxUses)) {
        throw new Error("Invalid maximum uses");
      }

      const payload = {
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim() || null,
        scope: formData.scope,
        application_type: formData.application_type,
        discount_type: formData.discount_type,
        discount_value: discountValue,
        min_order_amount_cents: minOrder,
        max_discount_cents: maxDiscount,
        max_uses: maxUses,
        valid_from: formData.valid_from || null,
        valid_until: formData.valid_until || null,
        is_active: formData.is_active,
      };

      let promoId = editingPromo?.id;

      if (editingPromo) {
        const { error } = await supabase
          .from("promo_codes")
          .update(payload)
          .eq("id", editingPromo.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("promo_codes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        promoId = data.id;
      }

      const showItemSelector = formData.scope === "order" && formData.application_type === "auto";

      if (promoId && showItemSelector) {
        await supabase.from("promo_items").delete().eq("promo_id", promoId).eq("role", "target");
        const ids = Array.from(formData.targetMenuItemIds);
        if (ids.length > 0) {
          const rows = ids.map((menuItemId) => ({
            promo_id: promoId,
            menu_item_id: menuItemId,
            role: "target",
            quantity: 1,
          }));
          const { error: itemErr } = await supabase.from("promo_items").insert(rows);
          if (itemErr) throw itemErr;
        }
      }

      if (promoId && !showItemSelector && editingPromo) {
        await supabase.from("promo_items").delete().eq("promo_id", promoId).eq("role", "target");
      }

      await fetchPromos();
      addToast({
        type: "success",
        title: editingPromo ? "Promotion updated" : "Promotion created",
        description: payload.code,
        duration: 3000,
      });
    },
    [fetchPromos, addToast]
  );

  return {
    promos,
    loading,
    error,
    refresh: fetchPromos,
    toggleActive,
    deletePromo,
    savePromo,
    menuCategories,
    menuLoading,
    fetchMenuItems,
    fetchPromoTargetItems,
  };
}
