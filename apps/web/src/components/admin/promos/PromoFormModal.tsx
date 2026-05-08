"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, X, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PromoCode, PromoFormData, CategoryWithItems } from "@/hooks/use-promos";
import { useEffect } from "react";

interface PromoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPromo: PromoCode | null;
  formData: PromoFormData;
  setFormData: React.Dispatch<React.SetStateAction<PromoFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  menuCategories: CategoryWithItems[];
  menuLoading: boolean;
}

export function PromoFormModal({
  isOpen,
  onClose,
  editingPromo,
  formData,
  setFormData,
  onSubmit,
  saving,
  menuCategories,
  menuLoading,
}: PromoFormModalProps) {
  const showItemSelector = formData.scope === "order" && formData.application_type === "auto";

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose, saving]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} aria-hidden="true" />

      {/* Modal / Bottom Sheet */}
      <Card
        className={cn(
          "relative z-10 w-full bg-card border-border shadow-2xl overflow-y-auto",
          "h-[92vh] sm:h-auto sm:max-h-[90vh] sm:max-w-lg rounded-t-2xl sm:rounded-xl"
        )}
      >
        <CardHeader className="sticky top-0 z-20 bg-card border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display">{editingPromo ? "Edit Promotion" : "New Promotion"}</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose} disabled={saving} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={onSubmit} className="space-y-4">
            {/* Basic Info */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Promo Code *</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g., SUMMER10"
                  required
                  className="uppercase"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
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
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      scope: e.target.value as "order" | "delivery",
                    }))
                  }
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
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      application_type: e.target.value as "code" | "auto",
                    }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="code">Promo Code (customer enters)</option>
                  <option value="auto">Auto-applied (automatic)</option>
                </select>
              </div>
            </div>

            {/* Target Menu Items */}
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
                <p className="text-xs text-muted-foreground">
                  Select items this promo applies to. Leave empty to apply to all items.
                </p>
                {menuLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
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
                              <span className="text-xs text-muted-foreground">
                                RM {(item.price_cents / 100).toFixed(2)}
                              </span>
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
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      discount_type: e.target.value as "percentage" | "fixed",
                    }))
                  }
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, discount_value: e.target.value }))}
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, max_discount: e.target.value }))}
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, min_order_amount: e.target.value }))}
                  placeholder="e.g., 30.00"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Max Uses (blank = unlimited)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.max_uses}
                  onChange={(e) => setFormData((prev) => ({ ...prev, max_uses: e.target.value }))}
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, valid_from: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Valid Until</label>
                <Input
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) => setFormData((prev) => ({ ...prev, valid_until: e.target.value }))}
                />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="is_active" className="text-sm font-medium">
                Active
              </label>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-4 pb-6 sm:pb-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="shadow-gold">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingPromo ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
