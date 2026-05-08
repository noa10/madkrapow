"use client";

import { useState, useCallback, useMemo } from "react";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { useDebounce } from "@/hooks/use-debounce";
import {
  usePromos,
  type PromoCode,
  type PromoFormData,
  EMPTY_FORM,
} from "@/hooks/use-promos";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { PromoSearchBar } from "@/components/admin/promos/PromoSearchBar";
import { PromoList } from "@/components/admin/promos/PromoList";
import { PromoFAB } from "@/components/admin/promos/PromoFAB";
import { PromoFormModal } from "@/components/admin/promos/PromoFormModal";
import {
  PromoFilterSheet,
  type StatusFilter,
  type ScopeFilter,
  type AppTypeFilter,
} from "@/components/admin/promos/PromoFilterSheet";
import { useToastStore } from "@/stores/toast";

function getPromoStatusFilter(promo: PromoCode): StatusFilter {
  const now = new Date();
  if (!promo.is_active) return "inactive";
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) return "depleted";
  if (promo.valid_until && new Date(promo.valid_until) < now) return "expired";
  if (promo.valid_from && new Date(promo.valid_from) > now) return "scheduled";
  return "active";
}

export default function AdminPromosPage() {
  const { hasAccess, isLoading: guardLoading } = useRoleGuard(["admin", "manager"]);
  const {
    promos,
    loading,
    error,
    refresh,
    toggleActive,
    deletePromo,
    savePromo,
    menuCategories,
    menuLoading,
    fetchMenuItems,
    fetchPromoTargetItems,
  } = usePromos();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [appTypeFilter, setAppTypeFilter] = useState<AppTypeFilter>("all");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [formData, setFormData] = useState<PromoFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [deletingPromo, setDeletingPromo] = useState<PromoCode | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const handleToggle = useCallback(
    async (promo: PromoCode) => {
      setTogglingId(promo.id);
      try {
        await toggleActive(promo);
      } finally {
        setTogglingId(null);
      }
    },
    [toggleActive]
  );

  const openCreateForm = useCallback(() => {
    setEditingPromo(null);
    setFormData({ ...EMPTY_FORM, valid_from: new Date().toISOString().split("T")[0], targetMenuItemIds: new Set() });
    setIsFormOpen(true);
    fetchMenuItems();
  }, [fetchMenuItems]);

  const openEditForm = useCallback(
    async (promo: PromoCode) => {
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
    },
    [fetchMenuItems, fetchPromoTargetItems]
  );

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingPromo(null);
    setFormData(EMPTY_FORM);
  }, []);

  const handleFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.code.trim() || !formData.discount_value) return;

      setSaving(true);
      try {
        await savePromo(formData, editingPromo);
        closeForm();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to save promotion";
        addToast({ type: "error", title: "Error", description: message, duration: 4000 });
      } finally {
        setSaving(false);
      }
    },
    [formData, editingPromo, savePromo, closeForm, addToast]
  );

  const handleDelete = useCallback(async () => {
    if (!deletingPromo) return;
    setSaving(true);
    try {
      await deletePromo(deletingPromo);
      setDeletingPromo(null);
    } catch (err: unknown) {
      console.error("Delete promo failed:", err);
    } finally {
      setSaving(false);
    }
  }, [deletingPromo, deletePromo]);

  const filteredPromos = useMemo(() => {
    return promos.filter((promo) => {
      const matchesSearch =
        debouncedSearch === "" ||
        promo.code.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (promo.description?.toLowerCase().includes(debouncedSearch.toLowerCase()) ?? false);

      const matchesScope = scopeFilter === "all" || promo.scope === scopeFilter;
      const matchesStatus = statusFilter === "all" || getPromoStatusFilter(promo) === statusFilter;
      const matchesAppType = appTypeFilter === "all" || promo.application_type === appTypeFilter;

      return matchesSearch && matchesScope && matchesStatus && matchesAppType;
    });
  }, [promos, debouncedSearch, scopeFilter, statusFilter, appTypeFilter]);

  const hasFilters = debouncedSearch !== "" || scopeFilter !== "all" || statusFilter !== "all" || appTypeFilter !== "all";

  if (guardLoading || loading) {
    return (
      <div className="space-y-6">
        <PromoSearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onFilterClick={() => setFilterSheetOpen(true)}
          resultCount={0}
          totalCount={0}
        />
        <PromoList
          promos={[]}
          loading={true}
          onToggle={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          togglingId={null}
          onCreate={openCreateForm}
          hasFilters={false}
        />
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-card shadow-sm rounded-xl">
        <CardContent className="pt-6">
          <p className="text-destructive text-center">{error}</p>
          <div className="flex justify-center mt-4">
            <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6 pb-20 lg:pb-0">
      {/* Desktop CTA */}
      <div className="hidden lg:flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display">Promotions</h1>
        <Button onClick={openCreateForm} className="shadow-gold gap-2">
          <Plus className="h-4 w-4" />
          New Promotion
        </Button>
      </div>

      <PromoSearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onFilterClick={() => setFilterSheetOpen(true)}
        resultCount={filteredPromos.length}
        totalCount={promos.length}
      />

      {/* Active filter chips (mobile) */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2 lg:hidden">
          {debouncedSearch && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-xs font-medium">
              &quot;{debouncedSearch}&quot;
              <button onClick={() => setSearchQuery("")} className="p-0.5 rounded-full hover:bg-primary/20" aria-label="Clear search">
                <Plus className="h-3 w-3 rotate-45" />
              </button>
            </span>
          )}
          {scopeFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2.5 py-1 text-xs font-medium">
              {scopeFilter}
              <button onClick={() => setScopeFilter("all")} className="p-0.5 rounded-full hover:bg-border" aria-label="Clear scope filter">
                <Plus className="h-3 w-3 rotate-45" />
              </button>
            </span>
          )}
          {statusFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2.5 py-1 text-xs font-medium">
              {statusFilter}
              <button onClick={() => setStatusFilter("all")} className="p-0.5 rounded-full hover:bg-border" aria-label="Clear status filter">
                <Plus className="h-3 w-3 rotate-45" />
              </button>
            </span>
          )}
          {appTypeFilter !== "all" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2.5 py-1 text-xs font-medium">
              {appTypeFilter}
              <button onClick={() => setAppTypeFilter("all")} className="p-0.5 rounded-full hover:bg-border" aria-label="Clear type filter">
                <Plus className="h-3 w-3 rotate-45" />
              </button>
            </span>
          )}
        </div>
      )}

      <PromoFilterSheet
        isOpen={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        scope={scopeFilter}
        onScopeChange={setScopeFilter}
        appType={appTypeFilter}
        onAppTypeChange={setAppTypeFilter}
      />

      <PromoList
        promos={filteredPromos}
        loading={false}
        onToggle={handleToggle}
        onEdit={openEditForm}
        onDelete={setDeletingPromo}
        togglingId={togglingId}
        onCreate={openCreateForm}
        hasFilters={hasFilters}
      />

      <PromoFAB onClick={openCreateForm} />

      <PromoFormModal
        isOpen={isFormOpen}
        onClose={closeForm}
        editingPromo={editingPromo}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleFormSubmit}
        saving={saving}
        menuCategories={menuCategories}
        menuLoading={menuLoading}
      />

      {/* Delete confirmation dialog */}
      {deletingPromo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold font-display">Delete Promotion?</h3>
              <button
                onClick={() => setDeletingPromo(null)}
                disabled={saving}
                className="p-2 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Cancel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              This will permanently remove <strong className="text-foreground">{deletingPromo.code}</strong>. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDeletingPromo(null)} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={saving}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
