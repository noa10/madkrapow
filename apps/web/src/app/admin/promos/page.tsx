"use client";

import { useEffect, useState, useCallback } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Loader2,
  Tag,
  Truck,
  Percent,
  DollarSign,
  Calendar,
  ToggleLeft,
  ToggleRight,
  Package,
} from "lucide-react";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { cn } from "@/lib/utils";

type PromoScope = "order" | "delivery";
type ApplicationType = "code" | "auto";
type DiscountType = "percentage" | "fixed";

interface PromoCode {
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

interface MenuItem {
  id: string;
  name: string;
  price_cents: number;
}

interface CategoryWithItems {
  id: string;
  name: string;
  items: MenuItem[];
}

interface PromoFormData {
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

const EMPTY_FORM: PromoFormData = {
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

function getPromoStatus(promo: PromoCode): { label: string; color: string } {
  const now = new Date();
  if (!promo.is_active) return { label: "Inactive", color: "bg-gray-500" };
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) return { label: "Depleted", color: "bg-orange-500" };
  if (promo.valid_until && new Date(promo.valid_until) < now) return { label: "Expired", color: "bg-red-500" };
  if (promo.valid_from && new Date(promo.valid_from) > now) return { label: "Scheduled", color: "bg-blue-500" };
  return { label: "Active", color: "bg-green-500" };
}

function formatDiscount(promo: PromoCode): string {
  if (promo.discount_type === "percentage") return `${promo.discount_value}%`;
  return `RM ${(promo.discount_value / 100).toFixed(2)}`;
}

function formatCurrency(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `RM ${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-MY", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminPromosPage() {
  const { hasAccess, isLoading: guardLoading } = useRoleGuard(["admin", "manager"]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | PromoScope>("all");

  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [formData, setFormData] = useState<PromoFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Menu items for target selector
  const [menuCategories, setMenuCategories] = useState<CategoryWithItems[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);

  // Delete confirmation
  const [deletingPromo, setDeletingPromo] = useState<PromoCode | null>(null);

  // Toggling
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const showItemSelector = formData.scope === "order" && formData.application_type === "auto";

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

  const fetchPromos = useCallback(async () => {
    const supabase = getBrowserClient();
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setPromos(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  const openCreateForm = () => {
    setEditingPromo(null);
    setFormData({ ...EMPTY_FORM, valid_from: new Date().toISOString().split("T")[0], targetMenuItemIds: new Set() });
    setIsFormOpen(true);
    fetchMenuItems();
  };

  const openEditForm = async (promo: PromoCode) => {
    setEditingPromo(promo);
    setFormData({
      code: promo.code,
      description: promo.description || "",
      scope: promo.scope,
      application_type: promo.application_type,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value.toString(),
      min_order_amount: promo.min_order_amount_cents ? (promo.min_order_amount_cents / 100).toFixed(2) : "",
      max_discount: promo.max_discount_cents ? promo.max_discount_cents.toString() : "",
      max_uses: promo.max_uses ? promo.max_uses.toString() : "",
      valid_from: promo.valid_from ? new Date(promo.valid_from).toISOString().split("T")[0] : "",
      valid_until: promo.valid_until ? new Date(promo.valid_until).toISOString().split("T")[0] : "",
      is_active: promo.is_active,
      targetMenuItemIds: new Set(),
    });
    setIsFormOpen(true);
    await fetchMenuItems();
    if (promo.scope === "order" && promo.application_type === "auto") {
      const targetIds = await fetchPromoTargetItems(promo.id);
      setFormData((prev) => ({ ...prev, targetMenuItemIds: new Set(targetIds) }));
    }
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingPromo(null);
    setFormData(EMPTY_FORM);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.discount_value) return;

    setSaving(true);
    const supabase = getBrowserClient();

    const discountValue = formData.discount_type === "percentage"
      ? parseInt(formData.discount_value, 10)
      : Math.round(parseFloat(formData.discount_value) * 100);

    const payload = {
      code: formData.code.trim().toUpperCase(),
      description: formData.description.trim() || null,
      scope: formData.scope,
      application_type: formData.application_type,
      discount_type: formData.discount_type,
      discount_value: discountValue,
      min_order_amount_cents: formData.min_order_amount ? Math.round(parseFloat(formData.min_order_amount) * 100) : null,
      max_discount_cents: formData.max_discount ? parseInt(formData.max_discount, 10) : null,
      max_uses: formData.max_uses ? parseInt(formData.max_uses, 10) : null,
      valid_from: formData.valid_from || null,
      valid_until: formData.valid_until || null,
      is_active: formData.is_active,
    };

    try {
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

      // Save target menu items for order+auto promos
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

      // Clear target items if switching away from order+auto
      if (promoId && !showItemSelector && editingPromo) {
        await supabase.from("promo_items").delete().eq("promo_id", promoId).eq("role", "target");
      }

      closeForm();
      await fetchPromos();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPromo) return;
    setSaving(true);
    const supabase = getBrowserClient();

    try {
      const { error } = await supabase
        .from("promo_codes")
        .delete()
        .eq("id", deletingPromo.id);
      if (error) throw error;

      setDeletingPromo(null);
      await fetchPromos();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (promo: PromoCode) => {
    setTogglingId(promo.id);
    const supabase = getBrowserClient();

    try {
      const { error } = await supabase
        .from("promo_codes")
        .update({ is_active: !promo.is_active })
        .eq("id", promo.id);
      if (error) throw error;
      await fetchPromos();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setTogglingId(null);
    }
  };

  const filteredPromos = promos.filter((promo) => {
    const matchesSearch =
      searchQuery === "" ||
      promo.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (promo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesScope = scopeFilter === "all" || promo.scope === scopeFilter;
    return matchesSearch && matchesScope;
  });

  if (guardLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600 text-center">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">Promotions</h1>
        <Button onClick={openCreateForm}>
          <Plus className="h-4 w-4 mr-2" />
          New Promotion
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search promos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value as "all" | PromoScope)}
          className="flex h-10 w-full sm:w-[180px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All Scopes</option>
          <option value="order">Order Discounts</option>
          <option value="delivery">Delivery Discounts</option>
        </select>
      </div>

      {/* Promo List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Active Promotions ({filteredPromos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredPromos.length === 0 ? (
            <div className="text-center py-8">
              <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {promos.length === 0 ? "No promotions yet" : "No promos match your filters"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-3 font-medium">Code</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium">Discount</th>
                    <th className="pb-3 font-medium">Min Order</th>
                    <th className="pb-3 font-medium">Usage</th>
                    <th className="pb-3 font-medium">Valid From</th>
                    <th className="pb-3 font-medium">Valid Until</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPromos.map((promo) => {
                    const status = getPromoStatus(promo);
                    return (
                      <tr key={promo.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {promo.scope === "delivery" ? (
                              <Truck className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Tag className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <div className="font-mono font-medium">{promo.code}</div>
                              {promo.description && (
                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {promo.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit text-xs">
                              {promo.scope === "order" ? "Order" : "Delivery"}
                            </Badge>
                            <Badge variant={promo.application_type === "auto" ? "default" : "secondary"} className="w-fit text-xs">
                              {promo.application_type === "auto" ? "Auto" : "Code"}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1 font-medium">
                            {promo.discount_type === "percentage" ? (
                              <Percent className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <DollarSign className="h-3 w-3 text-muted-foreground" />
                            )}
                            {formatDiscount(promo)}
                          </div>
                        </td>
                        <td className="py-3 text-sm">{formatCurrency(promo.min_order_amount_cents)}</td>
                        <td className="py-3 text-sm">
                          {promo.max_uses !== null
                            ? `${promo.current_uses}/${promo.max_uses}`
                            : `${promo.current_uses}/∞`}
                        </td>
                        <td className="py-3 text-sm">{formatDate(promo.valid_from)}</td>
                        <td className="py-3 text-sm">{formatDate(promo.valid_until)}</td>
                        <td className="py-3">
                          <Badge className={`${status.color} text-white text-xs`}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleToggleActive(promo)}
                              disabled={togglingId === promo.id}
                            >
                              {togglingId === promo.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : promo.is_active ? (
                                <ToggleRight className="h-5 w-5 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-5 w-5 text-gray-400" />
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditForm(promo)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {deletingPromo?.id === promo.id ? (
                              <div className="flex items-center gap-1">
                                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>
                                  Confirm
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => setDeletingPromo(null)} disabled={saving}>
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeletingPromo(promo)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{editingPromo ? "Edit Promotion" : "New Promotion"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={closeForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {/* Basic Info */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Promo Code *</label>
                    <Input
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="e.g., SUMMER10"
                      required
                      className="uppercase"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Description</label>
                    <Input
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description"
                    />
                  </div>
                </div>

                {/* Scope & Application Type */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Scope *</label>
                    <select
                      value={formData.scope}
                      onChange={(e) => setFormData({ ...formData, scope: e.target.value as PromoScope })}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="order">Whole Order Discount</option>
                      <option value="delivery">Delivery Discount</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Application Type *</label>
                    <select
                      value={formData.application_type}
                      onChange={(e) => setFormData({ ...formData, application_type: e.target.value as ApplicationType })}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="code">Promo Code (customer enters)</option>
                      <option value="auto">Auto-applied (automatic)</option>
                    </select>
                  </div>
                </div>

                {/* Target Menu Items (only for order + auto promos) */}
                {showItemSelector && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium flex items-center gap-1.5">
                        <Package className="h-4 w-4" />
                        Target Menu Items
                      </label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const allIds = menuCategories.flatMap((c) => c.items.map((i) => i.id));
                            setFormData((prev) => ({ ...prev, targetMenuItemIds: new Set(allIds) }));
                          }}
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setFormData((prev) => ({ ...prev, targetMenuItemIds: new Set() }))}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Select items this promo applies to. Leave empty to apply to all items.</p>
                    {menuLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                        {menuCategories.map((cat) => (
                          <div key={cat.id}>
                            <div className="text-xs font-semibold text-primary mt-1 mb-0.5 px-1">{cat.name}</div>
                            {cat.items.map((item) => {
                              const checked = formData.targetMenuItemIds.has(item.id);
                              return (
                                <label
                                  key={item.id}
                                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      setFormData((prev) => {
                                        const next = new Set(prev.targetMenuItemIds);
                                        if (checked) next.delete(item.id);
                                        else next.add(item.id);
                                        return { ...prev, targetMenuItemIds: next };
                                      });
                                    }}
                                    className="h-3.5 w-3.5 rounded border-gray-300"
                                  />
                                  <span className="flex-1">{item.name}</span>
                                  <span className="text-xs text-muted-foreground">RM {(item.price_cents / 100).toFixed(2)}</span>
                                </label>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">{formData.targetMenuItemIds.size} item(s) selected</p>
                  </div>
                )}

                {/* Discount */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Discount Type *</label>
                    <select
                      value={formData.discount_type}
                      onChange={(e) => setFormData({ ...formData, discount_type: e.target.value as DiscountType })}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount (RM)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      Discount Value * ({formData.discount_type === "percentage" ? "%" : "RM"})
                    </label>
                    <Input
                      type="number"
                      step={formData.discount_type === "percentage" ? "1" : "0.01"}
                      min="0"
                      value={formData.discount_value}
                      onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                      placeholder={formData.discount_type === "percentage" ? "10" : "5.00"}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Max Discount (cents)</label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.max_discount}
                      onChange={(e) => setFormData({ ...formData, max_discount: e.target.value })}
                      placeholder="e.g., 5000"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Maximum discount in cents (e.g., 5000 = RM50.00)</p>
                  </div>
                </div>

                {/* Conditions */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Min Order Amount (RM)</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.min_order_amount}
                      onChange={(e) => setFormData({ ...formData, min_order_amount: e.target.value })}
                      placeholder="e.g., 30.00"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Max Uses (blank = unlimited)</label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.max_uses}
                      onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                      placeholder="e.g., 100"
                    />
                  </div>
                </div>

                {/* Schedule */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Valid From</label>
                    <Input
                      type="date"
                      value={formData.valid_from}
                      onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Valid Until</label>
                    <Input
                      type="date"
                      value={formData.valid_until}
                      onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    />
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="is_active" className="text-sm font-medium">
                    Active
                  </label>
                </div>

                {/* Submit */}
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={closeForm} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingPromo ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
