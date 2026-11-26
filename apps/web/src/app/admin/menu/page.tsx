"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { notifyMenuChanged } from "@/lib/admin/menu-cache";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  Package,
  Tag,
  Pencil,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { useToastStore } from "@/stores/toast";
import { notifyGrabMenuAfterChange } from "@/lib/grabfood/notify-client";
import { isMissingColumnError, resolveGroupSelectionRange, visibleMenuCategories, visibleMenuItems } from "./menu-visibility";
import { MenuItemActions } from "./menu-item-actions";

const MENU_ITEM_SELECT = "*";
const CATEGORY_SELECT = "*";
const MODIFIER_GROUP_SELECT = "*";
const MODIFIER_SELECT = "*, channel_modifiers(channel, price_cents)";

interface Category {
  archived_at?: string | null;
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MenuItem {
  archived_at?: string | null;
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
  spice_level: number;
  ingredients: string[];
  is_signature: boolean;
}

interface ModifierGroup {
  archived_at?: string | null;
  id: string;
  name: string;
  description: string | null;
  min_selections: number;
  max_selections: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  modifiers?: Modifier[];
}

interface Modifier {
  archived_at?: string | null;
  id: string;
  modifier_group_id: string;
  name: string;
  price_delta_cents: number;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  channel_modifiers?: Array<{ channel: string; price_cents: number | null }>;
}

function grabModifierPrice(modifier: Modifier): number | null {
  return modifier.channel_modifiers?.find((row) => row.channel === "grabfood")?.price_cents ?? null;
}

function SortableMenuItemRow({
  item,
  categoryName,
  isDeleting,
  isSaving,
  isSnoozing,
  onDeleteStart,
  onDelete,
  onDeleteCancel,
  autoFocusDelete,
  onToggleAvailability,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  item: MenuItem;
  categoryName: string;
  isDeleting: boolean;
  isSaving: boolean;
  isSnoozing: boolean;
  onDeleteStart: () => void;
  onDelete: () => void;
  onDeleteCancel: () => void;
  autoFocusDelete: boolean;
  onToggleAvailability: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <li
      role="listitem"
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-b py-3 last:border-0 hover:bg-muted/50 sm:grid-cols-[auto_auto_3rem_minmax(0,1fr)_auto_auto] sm:items-center"
    >
      <div className="hidden sm:block">
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="row-span-2 w-10 sm:row-span-1">
        <div className="flex flex-col items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onMoveUp}
            aria-label={`Move ${item.name} up`}
            disabled={!canMoveUp || isSaving}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onMoveDown}
            aria-label={`Move ${item.name} down`}
            disabled={!canMoveDown || isSaving}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="hidden sm:block">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt=""
            width={48}
            height={48}
            className="rounded object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="font-medium">{item.name}</div>
        {item.description && (
          <div className="text-sm text-muted-foreground truncate">
            {item.description}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          <span className="sr-only">Category: </span>{categoryName}
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, Price: </span>RM {(item.price_cents / 100).toFixed(2)}
        </p>
      </div>
      <div className="col-start-2 sm:col-auto">
        <button
          type="button"
          onClick={onToggleAvailability}
          disabled={isSnoozing || isSaving}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors min-h-[40px]",
            item.is_available
              ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15"
              : "bg-slate-500/10 text-slate-400 hover:bg-slate-500/15",
            (isSnoozing || isSaving) && "opacity-60 cursor-not-allowed"
          )}
          aria-label={`${item.name}, ${item.is_available ? "available; make unavailable" : "unavailable; make available"}`}
          title={item.is_available ? "Snooze (make unavailable)" : "Un-snooze (make available)"}
        >
          {isSnoozing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : item.is_available ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          {item.is_available ? "Available" : "Unavailable"}
        </button>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <MenuItemActions
          id={item.id}
          name={item.name}
          isDeleting={isDeleting}
          isSaving={isSaving}
          autoFocusDelete={autoFocusDelete}
          onDeleteStart={onDeleteStart}
          onDelete={onDelete}
          onDeleteCancel={onDeleteCancel}
        />
      </div>
    </li>
  );
}

function SortableModifierRow({
  modifier,
  isActive,
  isDeleting,
  isSaving,
  onEdit,
  onDelete,
  onDeleteStart,
  onDeleteCancel,
  autoFocusDelete,
  losesAssignments,
  formatPrice,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  modifier: Modifier;
  isActive: boolean;
  isDeleting: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteStart: () => void;
  onDeleteCancel: () => void;
  autoFocusDelete: boolean;
  losesAssignments: boolean;
  formatPrice: (cents: number) => string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: modifier.id, disabled: isSaving });
  const grabPrice = grabModifierPrice(modifier);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded border p-2",
        !modifier.is_available && "bg-muted/50 opacity-60",
        isActive && "ring-2 ring-primary"
      )}
    >
      <div className="flex items-center gap-2">
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hidden sm:inline-flex"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex flex-col gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onMoveUp}
            aria-label={`Move ${modifier.name} up`}
            disabled={!canMoveUp || isSaving}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onMoveDown}
            aria-label={`Move ${modifier.name} down`}
            disabled={!canMoveDown || isSaving}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        </div>
        <span className="font-medium">{modifier.name}</span>
        {modifier.is_default && (
          <Badge variant="secondary" className="text-xs">
            Default
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {formatPrice(modifier.price_delta_cents)}
        </span>
        {grabPrice !== null && (
          <Badge variant="outline" className="text-xs">
            Grab {formatPrice(grabPrice)}
          </Badge>
        )}
        {!modifier.is_available && (
          <Badge variant="outline" className="text-xs">
            Unavailable
          </Badge>
        )}
        <Button variant="ghost" size="icon" onClick={onEdit} disabled={isSaving} aria-label={`Edit ${modifier.name}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        {isDeleting ? (
          <div className="flex flex-wrap items-center gap-1">
            <span id={`modifier-delete-warning-${modifier.id}`} className="text-sm text-destructive">This removes {modifier.name} from active menus.{losesAssignments ? " This is the last available option, so required item assignments for this group will be removed." : ""}</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={isSaving}
              autoFocus
              aria-label={`Confirm delete option ${modifier.name}`}
              aria-describedby={`modifier-delete-warning-${modifier.id}`}
            >
              Confirm
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDeleteCancel}
              disabled={isSaving}
              aria-label={`Cancel delete option ${modifier.name}`}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDeleteStart}
            disabled={isSaving}
            autoFocus={autoFocusDelete}
            aria-label={`Delete ${modifier.name}`}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}

function mutationErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "An unexpected error occurred.";
}

// Monotonic token so a slow binding response for a previously selected item
// cannot overwrite the current item's assignments.
let bindingsRequestSeq = 0;

/**
 * A DELETE filtered by RLS returns success with no rows changed. Archiving is
 * confirmed by reading the archived row back before reporting success.
 */
async function assertArchived(
  supabase: ReturnType<typeof getBrowserClient>,
  table: "categories" | "menu_items" | "modifier_groups" | "modifiers",
  id: string,
  label: string,
): Promise<void> {
  const { data, error } = await supabase.from(table).select("archived_at").eq("id", id);
  if (error) {
    // Before the archival migration the column does not exist and the DELETE
    // above hard-deletes the row, which is also a successful delete.
    if (isMissingColumnError(error)) return;
    throw error;
  }
  if (!data?.[0]?.archived_at) {
    throw new Error(`The server did not confirm that the ${label} was deleted. You may not have permission, or the row may have changed. Reload the page and try again.`);
  }
}

export default function AdminMenuPage() {
  const { hasAccess, isLoading: guardLoading } = useRoleGuard(["admin", "manager"]);
  const { addToast } = useToastStore();

  const notifyGrabAfterMenuChange = async (label: string, action: "saved" | "deleted" = "saved") => {
    const warning = await notifyGrabMenuAfterChange();
    if (warning) {
      addToast({
        type: "error",
        title: `${label} ${action}, but Grab menu was not refreshed`,
        description: warning,
      });
    } else {
      addToast({
        type: "success",
        title: `${label} ${action}; Grab menu refresh requested`,
      });
    }
  };
  const [allMenuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [allCategories, setCategories] = useState<Category[]>([]);
  const menuItems = useMemo(() => visibleMenuItems(allMenuItems), [allMenuItems]);
  const categories = useMemo(() => visibleMenuCategories(allCategories), [allCategories]);
  const [section, setSection] = useState<"items" | "categories" | "modifiers">("items");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  // Category management state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  // Menu item management state
  const [deletingMenuItem, setDeletingMenuItem] = useState<{ id: string; name: string } | null>(null);
  const [snoozingItemId, setSnoozingItemId] = useState<string | null>(null);

  // Modifier groups state
  const [allModifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const modifierGroups = useMemo(() => allModifierGroups
    .filter((group) => !group.archived_at)
    .map((group) => ({ ...group, modifiers: group.modifiers?.filter((modifier) => !modifier.archived_at) })), [allModifierGroups]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<{
    id?: string;
    name: string;
    description: string;
    type: "radio" | "checkbox";
    required: boolean;
    minSelections?: number;
    maxSelections?: number;
  } | null>(null);
  const [editingModifier, setEditingModifier] = useState<{
    groupId: string;
    error?: string;
    modifier: {
      id?: string;
      name: string;
      price: string;
      grabPrice: string;
      originalGrabPrice: number | null;
      grabRowExists: boolean;
      grabPriceUnconfirmed?: boolean;
      is_default: boolean;
      is_available: boolean;
    };
  } | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [deletingModifier, setDeletingModifier] = useState<string | null>(null);

  // Item-modifier group bindings state
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>("");
  const selectedMenuItemIdRef = useRef(selectedMenuItemId);
  const [selectedBindings, setSelectedBindings] = useState<Record<string, { bound: boolean; required: boolean }>>({});
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [bindingsSaving, setBindingsSaving] = useState(false);
  const [bindingsSaved, setBindingsSaved] = useState(false);
  const [bindingsLoadFailed, setBindingsLoadFailed] = useState(false);
  const [bindingsLoadError, setBindingsLoadError] = useState<string | null>(null);

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [restoreFocusId, setRestoreFocusId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();

    const fetchData = async () => {
      const [menuItemsRes, categoriesRes, groupsRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select(MENU_ITEM_SELECT)
          .order("sort_order", { ascending: true }),
        supabase
          .from("categories")
          .select(CATEGORY_SELECT)
          .order("sort_order", { ascending: true }),
        supabase
          .from("modifier_groups")
          .select(MODIFIER_GROUP_SELECT)
          .order("sort_order", { ascending: true }),
      ]);

      const loadError = menuItemsRes.error ?? categoriesRes.error ?? groupsRes.error;
      if (loadError) {
        setError(loadError.message);
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      setMenuItems(menuItemsRes.data || []);
      setCategories(categoriesRes.data || []);

      const groupsData: ModifierGroup[] = groupsRes.data ?? [];

      if (groupsData.length > 0) {
        const groupIds = groupsData.map((group) => group.id);
        const { data: modifiers, error: modifiersError } = await supabase
          .from("modifiers")
          .select(MODIFIER_SELECT)
          .in("modifier_group_id", groupIds)
          .order("sort_order", { ascending: true });

        if (modifiersError) {
          setError(modifiersError.message);
          setLoadFailed(true);
          setLoading(false);
          return;
        }

        const modifiersData: Modifier[] = modifiers ?? [];
        const groupsWithModifiers = groupsData.map((group) => ({
          ...group,
          modifiers: modifiersData.filter((modifier) => modifier.modifier_group_id === group.id),
        }));
        setModifierGroups(groupsWithModifiers);
      } else {
        setModifierGroups([]);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );

  const getCategoryName = (categoryId: string) =>
    categoryNames.get(categoryId) || "Uncategorized";

  const filteredAndSortedItems = useMemo(() => {
    const needle = searchQuery.toLowerCase();
    return menuItems.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.name.toLowerCase().includes(needle) ||
        (item.description?.toLowerCase().includes(needle) ?? false);
      const matchesCategory =
        categoryFilter === "all" || item.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [menuItems, searchQuery, categoryFilter]);

  // Group/sort once per filter change rather than re-filtering every category
  // on every render (drag state, dialogs, typing in unrelated fields, ...).
  const itemsByCategory = useMemo(() => {
    const grouped = new Map<string, MenuItem[]>();
    for (const item of filteredAndSortedItems) {
      const group = grouped.get(item.category_id);
      if (group) {
        group.push(item);
      } else {
        grouped.set(item.category_id, [item]);
      }
    }
    for (const group of grouped.values()) {
      group.sort((a, b) => a.sort_order - b.sort_order);
    }
    return grouped;
  }, [filteredAndSortedItems]);

  const categoryItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of menuItems) {
      counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1);
    }
    return counts;
  }, [menuItems]);

  // Category management functions
  const openCreateForm = () => {
    setFormData({ name: "", description: "" });
    setEditingCategory(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (category: Category) => {
    setFormData({
      name: category.name,
      description: category.description || "",
    });
    setEditingCategory(category);
    setFormError(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
    setFormData({ name: "", description: "" });
    setFormError(null);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    setFormError(null);
    const supabase = getBrowserClient();

    try {
      if (editingCategory) {
        const { error } = await supabase
          .from("categories")
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
          })
          .eq("id", editingCategory.id);

        if (error) throw error;
      } else {
        const maxSortOrder = categories.length > 0
          ? Math.max(...categories.map((c) => c.sort_order))
          : -1;

        const { error } = await supabase.from("categories").insert({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          sort_order: maxSortOrder + 1,
        });

        if (error) throw error;
      }
    } catch (err: unknown) {
      setFormError(mutationErrorMessage(err));
      setSaving(false);
      return;
    }

    closeForm();
    notifyMenuChanged();

    try {
      await notifyGrabAfterMenuChange("Menu section");

      const categoriesRes = await supabase
        .from("categories")
        .select(CATEGORY_SELECT)
        .order("sort_order", { ascending: true });
      if (categoriesRes.error) throw categoriesRes.error;
      setCategories(categoriesRes.data ?? []);
    } catch (err: unknown) {
      setError(`Category saved, but the menu could not be refreshed: ${mutationErrorMessage(err)} Reload the page to see the current menu.`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;

    setError(null);
    setSaving(true);
    const supabase = getBrowserClient();

    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", deletingCategory.id);

      if (error) throw error;
      await assertArchived(supabase, "categories", deletingCategory.id, "category");
    } catch (err: unknown) {
      setError(`Could not delete category: ${mutationErrorMessage(err)}`);
      setSaving(false);
      return;
    }

    const deletedCategoryId = deletingCategory.id;
    const selectedItemWasInCategory = menuItems.some(
      (item) => item.id === selectedMenuItemId && item.category_id === deletedCategoryId
    );

    setDeletingCategory(null);
    if (categoryFilter === deletedCategoryId) setCategoryFilter("all");
    if (selectedItemWasInCategory) {
      selectedMenuItemIdRef.current = "";
      setSelectedMenuItemId("");
      setSelectedBindings({});
      setBindingsLoadFailed(false);
      setBindingsLoadError(null);
    }
    notifyMenuChanged();

    try {
      await notifyGrabAfterMenuChange("Menu section", "deleted");

      const [menuItemsRes, categoriesRes] = await Promise.all([
        supabase.from("menu_items").select(MENU_ITEM_SELECT).order("sort_order", { ascending: true }),
        supabase.from("categories").select(CATEGORY_SELECT).order("sort_order", { ascending: true }),
      ]);
      if (menuItemsRes.error) throw menuItemsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      setMenuItems(menuItemsRes.data ?? []);
      setCategories(categoriesRes.data ?? []);
    } catch (err: unknown) {
      setError(`Category deleted, but the menu could not be refreshed: ${mutationErrorMessage(err)} Reload the page to see the current menu.`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMenuItem = async () => {
    if (!deletingMenuItem) return;

    setError(null);
    setSaving(true);
    const supabase = getBrowserClient();

    try {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", deletingMenuItem.id);

      if (error) throw error;
      await assertArchived(supabase, "menu_items", deletingMenuItem.id, "menu item");
    } catch (err: unknown) {
      setError(`Could not delete item: ${mutationErrorMessage(err)}`);
      setSaving(false);
      return;
    }

    const deletedItemId = deletingMenuItem.id;
    setDeletingMenuItem(null);
    if (selectedMenuItemId === deletedItemId) {
      selectedMenuItemIdRef.current = "";
      setSelectedMenuItemId("");
      setSelectedBindings({});
      setBindingsLoadFailed(false);
      setBindingsLoadError(null);
    }
    notifyMenuChanged();

    try {
      await notifyGrabAfterMenuChange("Menu item", "deleted");

      const menuItemsRes = await supabase
        .from("menu_items")
        .select(MENU_ITEM_SELECT)
        .order("sort_order", { ascending: true });
      if (menuItemsRes.error) throw menuItemsRes.error;

      setMenuItems(menuItemsRes.data ?? []);
    } catch (err: unknown) {
      setError(`Item deleted, but the menu could not be refreshed: ${mutationErrorMessage(err)} Reload the page to see the current menu.`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    if (snoozingItemId) return;

    const previousValue = item.is_available;
    const newValue = !previousValue;

    // Optimistic update
    setMenuItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_available: newValue } : i))
    );
    setSnoozingItemId(item.id);
    setError(null);

    try {
      const res = await fetch(`/api/admin/menu/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: newValue }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to update: ${res.status}`);
      }

      // The PATCH response carries the updated row; apply it instead of
      // re-fetching the entire menu.
      const body = (await res.json().catch(() => null)) as {
        data?: MenuItem;
      } | null;
      if (body?.data) {
        const updatedItem = body.data;
        setMenuItems((prev) =>
          prev.map((item) =>
            item.id === updatedItem.id ? { ...item, ...updatedItem } : item
          )
        );
      } else {
        const supabase = getBrowserClient();
        const menuItemsRes = await supabase
          .from("menu_items")
          .select(MENU_ITEM_SELECT)
          .order("sort_order", { ascending: true });
        setMenuItems(menuItemsRes.data || []);
      }

      const warning = await notifyGrabMenuAfterChange();
      if (warning) {
        addToast({
          type: "error",
          title: "Availability saved, but Grab menu was not refreshed",
          description: warning,
        });
      } else {
        addToast({
          type: "success",
          title: newValue
            ? "Item available; Grab menu refresh requested"
            : "Item unavailable; Grab menu refresh requested",
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update availability";
      setError(errorMessage);
      // Revert optimistic update
      setMenuItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: previousValue } : i))
      );
    } finally {
      setSnoozingItemId(null);
    }
  };

  const handleMenuItemDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeItem = menuItems.find((item) => item.id === active.id);
    if (!activeItem) return;

    const categoryId = activeItem.category_id;

    // Get all items in this category, sorted by sort_order
    const categoryItems = menuItems
      .filter((item) => item.category_id === categoryId)
      .sort((a, b) => a.sort_order - b.sort_order);

    const oldIndex = categoryItems.findIndex((item) => item.id === active.id);
    const newIndex = categoryItems.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categoryItems, oldIndex, newIndex);

    const supabase = getBrowserClient();

    try {
      for (let i = 0; i < reordered.length; i++) {
        await supabase
          .from("menu_items")
          .update({ sort_order: i + 1 })
          .eq("id", reordered[i].id);
      }

      notifyMenuChanged();
      await notifyGrabAfterMenuChange("Menu order");

      const res = await supabase
        .from("menu_items")
        .select(MENU_ITEM_SELECT)
        .order("sort_order", { ascending: true });
      setMenuItems(res.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const moveCategory = async (category: Category, direction: "up" | "down") => {
    const currentIndex = categories.findIndex((c) => c.id === category.id);
    if (direction === "up" && currentIndex === 0) return;
    if (direction === "down" && currentIndex === categories.length - 1) return;

    const otherCategory = direction === "up"
      ? categories[currentIndex - 1]
      : categories[currentIndex + 1];

    const supabase = getBrowserClient();

    try {
      await supabase.from("categories").update({ sort_order: otherCategory.sort_order }).eq("id", category.id);
      await supabase.from("categories").update({ sort_order: category.sort_order }).eq("id", otherCategory.id);

      notifyMenuChanged();
      await notifyGrabAfterMenuChange("Menu section order");

      const categoriesRes = await supabase
        .from("categories")
        .select(CATEGORY_SELECT)
        .order("sort_order", { ascending: true });
      setCategories(categoriesRes.data || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    }
  };

  const moveMenuItem = async (item: MenuItem, direction: "up" | "down") => {
    const categoryItems = menuItems
      .filter((i) => i.category_id === item.category_id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const currentIndex = categoryItems.findIndex((i) => i.id === item.id);
    if (direction === "up" && currentIndex === 0) return;
    if (direction === "down" && currentIndex === categoryItems.length - 1) return;

    const otherItem = direction === "up"
      ? categoryItems[currentIndex - 1]
      : categoryItems[currentIndex + 1];

    const supabase = getBrowserClient();

    try {
      await supabase.from("menu_items").update({ sort_order: otherItem.sort_order }).eq("id", item.id);
      await supabase.from("menu_items").update({ sort_order: item.sort_order }).eq("id", otherItem.id);

      notifyMenuChanged();
      await notifyGrabAfterMenuChange("Menu order");

      const res = await supabase
        .from("menu_items")
        .select(MENU_ITEM_SELECT)
        .order("sort_order", { ascending: true });
      setMenuItems(res.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const moveModifier = async (modifier: Modifier, direction: "up" | "down") => {
    let targetGroup: ModifierGroup | undefined;
    let modifierList: Modifier[] = [];

    for (const g of modifierGroups) {
      if (g.modifiers?.find((m) => m.id === modifier.id)) {
        targetGroup = g;
        modifierList = g.modifiers;
        break;
      }
    }

    if (!targetGroup || !modifierList) return;

    const currentIndex = modifierList.findIndex((m) => m.id === modifier.id);
    if (direction === "up" && currentIndex === 0) return;
    if (direction === "down" && currentIndex === modifierList.length - 1) return;

    const otherModifier = direction === "up"
      ? modifierList[currentIndex - 1]
      : modifierList[currentIndex + 1];

    const supabase = getBrowserClient();

    try {
      await supabase.from("modifiers").update({ sort_order: otherModifier.sort_order }).eq("id", modifier.id);
      await supabase.from("modifiers").update({ sort_order: modifier.sort_order }).eq("id", otherModifier.id);
      notifyMenuChanged();
      await notifyGrabAfterMenuChange("Option order");
      await fetchModifierGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Modifier group functions
  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const fetchModifierGroups = async (): Promise<ModifierGroup[]> => {
    const supabase = getBrowserClient();
    const { data: groups, error: groupsError } = await supabase
      .from("modifier_groups")
      .select(MODIFIER_GROUP_SELECT)
      .order("sort_order", { ascending: true });

    if (groupsError) throw groupsError;
    const groupsData: ModifierGroup[] = groups ?? [];

    if (groupsData.length > 0) {
      const groupIds = groupsData.map((group) => group.id);
      const { data: modifiers, error: modifiersError } = await supabase
        .from("modifiers")
        .select(MODIFIER_SELECT)
        .in("modifier_group_id", groupIds)
        .order("sort_order", { ascending: true });

      if (modifiersError) throw modifiersError;
      const modifiersData: Modifier[] = modifiers ?? [];
      const groupsWithModifiers = groupsData.map((group) => ({
        ...group,
        modifiers: modifiersData.filter((modifier) => modifier.modifier_group_id === group.id),
      }));
      setModifierGroups(groupsWithModifiers);
      return groupsWithModifiers;
    }

    setModifierGroups([]);
    return [];
  };

  const handleCreateGroup = () => {
    setEditingGroup({
      name: "",
      description: "",
      type: "radio",
      required: false,
      minSelections: 0,
      maxSelections: 1,
    });
  };

  const handleEditGroup = (group: ModifierGroup) => {
    setEditingGroup({
      id: group.id,
      name: group.name,
      description: group.description || "",
      type: group.max_selections === 1 ? "radio" : "checkbox",
      required: group.min_selections > 0,
      minSelections: group.min_selections,
      maxSelections: group.max_selections,
    });
  };

  const handleSaveGroup = async () => {
    if (!editingGroup || !editingGroup.name.trim()) return;

    const supabase = getBrowserClient();
    setSaving(true);

    const wasRequired = (editingGroup.minSelections ?? 0) > 0;
    const { minSelections, maxSelections } = resolveGroupSelectionRange(editingGroup);

    if (minSelections > 0 && editingGroup.id && !wasRequired) {
      const existingGroup = allModifierGroups.find((group) => group.id === editingGroup.id);
      const hasAvailableOption = existingGroup?.modifiers?.some(
        (modifier) => modifier.is_available && !modifier.archived_at
      );
      if (!hasAvailableOption) {
        setError("A required option group needs at least one available option. Add an option and make it available before requiring this group.");
        setSaving(false);
        return;
      }
    }

    try {
      if (editingGroup.id) {
        const { data: updated, error: updateError } = await supabase
          .from("modifier_groups")
          .update({
            name: editingGroup.name.trim(),
            description: editingGroup.description.trim() || null,
            min_selections: minSelections,
            max_selections: maxSelections,
          })
          .eq("id", editingGroup.id)
          .select("id");

        if (updateError) throw updateError;
        if (!updated?.length) {
          throw new Error("The server did not confirm that the option group was saved. You may not have permission, or the group may have changed. Reload the page and try again.");
        }
      } else {
        const { data: maxOrder } = await supabase
          .from("modifier_groups")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1)
          .single();

        const newSortOrder = (maxOrder?.sort_order ?? -1) + 1;

        const { error: insertError } = await supabase
          .from("modifier_groups")
          .insert({
            name: editingGroup.name.trim(),
            description: editingGroup.description.trim() || null,
            min_selections: minSelections,
            max_selections: maxSelections,
            sort_order: newSortOrder,
          });

        if (insertError) throw insertError;
      }

      notifyMenuChanged();
      await notifyGrabAfterMenuChange("Option group");
      const groups = await fetchModifierGroups();
      await refreshSelectedItemBindings(groups);
      setEditingGroup(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const supabase = getBrowserClient();
    setError(null);
    setSaving(true);
    try {
      const { error: deleteGroupError } = await supabase
        .from("modifier_groups")
        .delete()
        .eq("id", groupId);

      if (deleteGroupError) throw deleteGroupError;
      await assertArchived(supabase, "modifier_groups", groupId, "option group");
    } catch (err: unknown) {
      setError(`Could not delete option group: ${mutationErrorMessage(err)}`);
      setSaving(false);
      return;
    }

    setDeletingGroup(null);
    // The archived group keeps its identity, so a stale selection would
    // otherwise save a hidden group back onto the item.
    setSelectedBindings((prev) => {
      if (!(groupId in prev)) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    notifyMenuChanged();

    try {
      await notifyGrabAfterMenuChange("Option group", "deleted");
      await fetchModifierGroups();
    } catch (err: unknown) {
      setError(`Option group deleted, but the options list could not be refreshed: ${mutationErrorMessage(err)} Reload the page before making more changes.`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddModifier = (groupId: string) => {
    setEditingModifier({
      groupId,
      modifier: {
        name: "",
        price: "0",
        grabPrice: "",
        originalGrabPrice: null,
        grabRowExists: false,
        is_default: false,
        is_available: true,
      },
    });
  };

  const handleEditModifier = (modifier: Modifier) => {
    const grabRow = modifier.channel_modifiers?.find((row) => row.channel === "grabfood");
    const originalGrabPrice = grabRow?.price_cents ?? null;
    setEditingModifier({
      groupId: modifier.modifier_group_id,
      modifier: {
        id: modifier.id,
        name: modifier.name,
        price: (modifier.price_delta_cents / 100).toFixed(2),
        grabPrice: originalGrabPrice === null ? "" : (originalGrabPrice / 100).toFixed(2),
        originalGrabPrice,
        grabRowExists: Boolean(grabRow),
        is_default: modifier.is_default,
        is_available: modifier.is_available,
      },
    });
  };

  const handleSaveModifier = async () => {
    if (!editingModifier || !editingModifier.modifier.name.trim()) return;

    const grabPriceInput = editingModifier.modifier.grabPrice.trim();
    const grabPriceCents = grabPriceInput === "" ? null : Math.round(Number(grabPriceInput) * 100);
    if (grabPriceCents !== null && (!/^\d+(\.\d{1,2})?$/.test(grabPriceInput) || !Number.isSafeInteger(grabPriceCents) || grabPriceCents > 9999999)) {
      setEditingModifier((prev) => prev ? { ...prev, error: "Enter a valid GrabFood price with at most two decimal places" } : prev);
      return;
    }
    if (editingModifier.modifier.grabPriceUnconfirmed && grabPriceCents === editingModifier.modifier.originalGrabPrice) {
      setEditingModifier((prev) => prev ? { ...prev, error: "The previous GrabFood price save could not be confirmed. Cancel and reopen the option to review the current price." } : prev);
      return;
    }
    const supabase = getBrowserClient();
    setSaving(true);
    setEditingModifier((prev) => prev ? { ...prev, error: undefined } : prev);
    const priceCents = Math.round(parseFloat(editingModifier.modifier.price || "0") * 100);
    let localSaved = false;
    let grabNotified = false;

    try {
      let modifierId = editingModifier.modifier.id;
      if (modifierId) {
        const { data: updated, error: updateError } = await supabase
          .from("modifiers")
          .update({
            name: editingModifier.modifier.name.trim(),
            price_delta_cents: priceCents,
            is_default: editingModifier.modifier.is_default,
            is_available: editingModifier.modifier.is_available,
          })
          .eq("id", modifierId)
          .select("id");

        if (updateError) throw updateError;
        if (!updated?.length) {
          throw new Error("The server did not confirm that the option was saved. You may not have permission, or the option may have changed. Reload the page and try again.");
        }
        localSaved = true;
        notifyMenuChanged();
      } else {
        const { data: existingModifiers } = await supabase
          .from("modifiers")
          .select("sort_order")
          .eq("modifier_group_id", editingModifier.groupId)
          .order("sort_order", { ascending: false })
          .limit(1)
          .single();

        const newSortOrder = (existingModifiers?.sort_order ?? -1) + 1;

        const { data: insertedModifier, error: insertError } = await supabase
          .from("modifiers")
          .insert({
            modifier_group_id: editingModifier.groupId,
            name: editingModifier.modifier.name.trim(),
            price_delta_cents: priceCents,
            is_default: editingModifier.modifier.is_default,
            is_available: editingModifier.modifier.is_available,
            sort_order: newSortOrder,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        localSaved = true;
        notifyMenuChanged();
        if (!insertedModifier) throw new Error("Option creation returned no ID. Check the options list before retrying.");
        modifierId = insertedModifier.id;
        // Keep the id so a retry after a failed price save updates this row
        // instead of inserting a duplicate option.
        setEditingModifier((prev) =>
          prev ? { ...prev, modifier: { ...prev.modifier, id: modifierId } } : prev
        );
      }

      if (grabPriceCents !== editingModifier.modifier.originalGrabPrice) {
        const { data: session } = await supabase.auth.getSession();
        const body = JSON.stringify({
          modifier_id: modifierId,
          price_cents: grabPriceCents,
          expected_price_cents: editingModifier.modifier.originalGrabPrice,
          expected_exists: editingModifier.modifier.grabRowExists,
        });
        let response: Response;
        try {
          response = await fetch("/api/integrations/grabfood/menu/modifier-price", {
            method: "PUT",
            headers: { "Content-Type": "application/json", authorization: `Bearer ${session.session?.access_token ?? ""}` },
            body,
          });
        } catch {
          setEditingModifier((prev) => prev ? { ...prev, modifier: { ...prev.modifier, grabPriceUnconfirmed: true } } : prev);
          throw new Error("Option saved, but the GrabFood price save could not be confirmed. Check your connection and save again.");
        }
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status >= 500) {
            setEditingModifier((prev) => prev ? { ...prev, modifier: { ...prev.modifier, grabPriceUnconfirmed: true } } : prev);
          }
          throw new Error(`Option saved, but GrabFood price could not be saved: ${result.error || "Please save again."}`);
        }
        setEditingModifier((prev) => prev && !prev.modifier.grabPriceUnconfirmed ? {
          ...prev,
          modifier: { ...prev.modifier, originalGrabPrice: grabPriceCents, grabRowExists: prev.modifier.grabRowExists || grabPriceCents !== null },
        } : prev);
      }

      grabNotified = true;
      await notifyGrabAfterMenuChange("Option");
      const groups = await fetchModifierGroups();
      await refreshSelectedItemBindings(groups);
      setEditingModifier(null);
    } catch (err: any) {
      let refreshError = "";
      if (localSaved) {
        if (!grabNotified) await notifyGrabAfterMenuChange("Option");
        try {
          const groups = await fetchModifierGroups();
          await refreshSelectedItemBindings(groups);
        } catch {
          refreshError = " The options list could not be refreshed; reload the page before retrying.";
        }
      }
      setEditingModifier((prev) => prev ? { ...prev, error: `${err.message}${refreshError}` } : prev);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteModifier = async (modifierId: string) => {
    const supabase = getBrowserClient();
    setError(null);
    setSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from("modifiers")
        .delete()
        .eq("id", modifierId);

      if (deleteError) throw deleteError;
      await assertArchived(supabase, "modifiers", modifierId, "option");
    } catch (err: unknown) {
      setError(`Could not delete option: ${mutationErrorMessage(err)}`);
      setSaving(false);
      return;
    }

    setDeletingModifier(null);
    notifyMenuChanged();

    try {
      await notifyGrabAfterMenuChange("Option", "deleted");
      const groups = await fetchModifierGroups();
      await refreshSelectedItemBindings(groups);
    } catch (err: unknown) {
      setError(`Option deleted, but the options list could not be refreshed: ${mutationErrorMessage(err)} Reload the page before making more changes.`);
    } finally {
      setSaving(false);
    }
  };

  // Item-modifier group binding functions
  const loadBindings = async (menuItemId: string, groups: ModifierGroup[] = modifierGroups) => {
    const requestId = ++bindingsRequestSeq;
    setBindingsLoading(true);
    setBindingsLoadFailed(false);
    setBindingsLoadError(null);
    // Clear immediately so a Save during the spinner cannot write the previous
    // item's assignments to this item.
    setSelectedBindings({});
    const supabase = getBrowserClient();

    try {
      const { data: bindings, error: bindingsError } = await supabase
        .from("menu_item_modifier_groups")
        .select("modifier_group_id, is_required")
        .eq("menu_item_id", menuItemId);

      if (bindingsError) throw bindingsError;

      const bindingsMap: Record<string, { bound: boolean; required: boolean }> = {};
      for (const group of groups) {
        const binding = bindings?.find(
          (binding: { modifier_group_id: string; is_required: boolean }) =>
            binding.modifier_group_id === group.id
        );
        bindingsMap[group.id] = {
          bound: !!binding,
          required: binding?.is_required ?? false,
        };
      }
      if (requestId !== bindingsRequestSeq || menuItemId !== selectedMenuItemIdRef.current) return;
      setSelectedBindings(bindingsMap);
    } catch (err: unknown) {
      if (requestId !== bindingsRequestSeq || menuItemId !== selectedMenuItemIdRef.current) return;
      // Never leave a previous item's bindings selected: saving them would
      // overwrite this item's real assignments.
      setSelectedBindings({});
      setBindingsLoadFailed(true);
      setBindingsLoadError(mutationErrorMessage(err));
    } finally {
      if (requestId === bindingsRequestSeq && menuItemId === selectedMenuItemIdRef.current) {
        setBindingsLoading(false);
      }
    }
  };

  const refreshSelectedItemBindings = async (groups: ModifierGroup[]) => {
    // A refresh can finish after the admin has selected another item. Read the
    // current selection instead of the one captured when the refresh started.
    const menuItemId = selectedMenuItemIdRef.current;
    if (!menuItemId) return;
    await loadBindings(menuItemId, groups);
  };

  const handleMenuItemSelect = async (menuItemId: string) => {
    selectedMenuItemIdRef.current = menuItemId;
    setSelectedMenuItemId(menuItemId);
    setBindingsSaved(false);
    setBindingsLoadFailed(false);
    setBindingsLoadError(null);

    if (!menuItemId) {
      bindingsRequestSeq += 1;
      setBindingsLoading(false);
      setSelectedBindings({});
      return;
    }

    await loadBindings(menuItemId);
  };

  const handleBindingToggle = (groupId: string) => {
    setSelectedBindings((prev) => {
      const current = prev[groupId] ?? { bound: false, required: false };
      return {
        ...prev,
        [groupId]: {
          bound: !current.bound,
          required: current.bound ? false : current.required,
        },
      };
    });
  };

  const handleRequiredToggle = (groupId: string) => {
    const group = modifierGroups.find((candidate) => candidate.id === groupId);
    if (group && group.min_selections > 0) return;
    setSelectedBindings((prev) => {
      const current = prev[groupId];
      if (!current?.bound) return prev;
      return {
        ...prev,
        [groupId]: { ...current, required: !current.required },
      };
    });
  };

  const handleSaveBindings = async () => {
    if (!selectedMenuItemId || bindingsLoading || bindingsLoadFailed) return;

    setBindingsSaving(true);
    const supabase = getBrowserClient();

    try {
      const visibleGroupIds = new Set(modifierGroups.map((group) => group.id));
      const rowsToBind = Object.entries(selectedBindings)
        // A group archived in another session is hidden from the panel, so it
        // must not be resent or the atomic replace rejects every binding.
        .filter(([groupId, val]) => val.bound && visibleGroupIds.has(groupId))
        .map(([groupId, val]) => ({
          modifier_group_id: groupId,
          is_required: val.required,
        }));

      const { error: bindError } = await supabase.rpc("replace_item_modifier_groups", {
        p_menu_item_id: selectedMenuItemId,
        p_bindings: rowsToBind,
      });

      if (bindError) throw bindError;

      notifyMenuChanged();
      await notifyGrabAfterMenuChange("Item options");

      setBindingsSaved(true);
      setTimeout(() => setBindingsSaved(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBindingsSaving(false);
    }
  };

  // Drag-and-drop reorder functions
  const handleModifierDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const supabase = getBrowserClient();

    // Find which group this modifier belongs to
    let targetGroup: ModifierGroup | undefined;
    for (const g of modifierGroups) {
      if (g.modifiers?.find((m) => m.id === active.id)) {
        targetGroup = g;
        break;
      }
    }
    if (!targetGroup?.modifiers) return;

    const oldIndex = targetGroup.modifiers.findIndex((m) => m.id === active.id);
    const newIndex = targetGroup.modifiers.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(targetGroup.modifiers, oldIndex, newIndex);

    try {
      for (let i = 0; i < reordered.length; i++) {
        await supabase
          .from("modifiers")
          .update({ sort_order: i + 1 })
          .eq("id", reordered[i].id);
      }
      notifyMenuChanged();
      await notifyGrabAfterMenuChange("Option order");
      await fetchModifierGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free";
    return `+RM ${(cents / 100).toFixed(2)}`;
  };

  const editingModifierGroup = editingModifier
    ? modifierGroups.find((group) => group.id === editingModifier.groupId)
    : undefined;
  const editingModifierAvailableOptions = editingModifierGroup?.modifiers?.filter((option) => option.is_available) ?? [];
  const editingModifierIsLastAvailable = Boolean(
    editingModifier &&
    editingModifier.modifier.id &&
    editingModifier.modifier.is_available &&
    editingModifierAvailableOptions.length === 1 &&
    editingModifierAvailableOptions[0].id === editingModifier.modifier.id
  );

  if (guardLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <Card className="bg-card border-destructive/50 shadow-sm rounded-xl">
        <CardContent className="pt-6 text-center" role="alert">
          <p className="text-destructive">Could not load the menu: {error}</p>
          <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-xl border border-destructive/50 bg-card p-4 text-sm text-destructive">
          <p>{error}</p>
          <p>Review the message above. Dismiss it to keep managing the menu, or reload the page if the menu looks out of date.</p>
          <Button variant="outline" size="sm" onClick={() => setError(null)} className="mt-2">Dismiss</Button>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Catalog</p>
          <h1 className="mt-1 text-2xl font-bold font-display">Menu management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your items, categories and customer options.</p>
        </div>
        {section === "items" && (
          <Button asChild>
            <Link href="/admin/menu/items/new">
              <Plus className="h-4 w-4 mr-2" />
              Add item
            </Link>
          </Button>
        )}
      </div>

      <nav aria-label="Menu management sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {([
          ["items", "Items"],
          ["categories", "Categories"],
          ["modifiers", "Options"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={saving}
            onClick={() => setSection(value)}
            aria-current={section === value ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
              section === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === "items" && <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            aria-label="Search menu items"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          aria-label="Filter by category"
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="flex h-10 w-full sm:w-[200px] items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="all">All Categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {/* Menu Items Table */}
      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display">Menu Items</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAndSortedItems.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {menuItems.length === 0
                  ? "No menu items yet"
                  : "No items match your filters"}
              </p>
              {menuItems.length === 0 && (
                <Button asChild className="mt-4">
                  <Link href="/admin/menu/items/new">Add Your First Item</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {categories.map((cat) => {
                const catItems = itemsByCategory.get(cat.id) ?? [];

                if (catItems.length === 0) return null;

                return (
                    <div key={cat.id} role="group" aria-labelledby={`menu-category-${cat.id}`}>
                      <h3 id={`menu-category-${cat.id}`} className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                        <Tag className="h-3 w-3" />
                        {cat.name}
                      </h3>
                      <DndContext
                        collisionDetection={closestCenter}
                        onDragStart={(e) => setActiveDragId(e.active.id as string)}
                        onDragEnd={handleMenuItemDragEnd}
                      >
                        <SortableContext
                          items={catItems.map((i) => i.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <ul role="list" aria-label={`${cat.name} items`}>
                                {catItems.map((item, index) => (
                                  <SortableMenuItemRow
                                    key={item.id}
                                    item={item}
                                    categoryName={getCategoryName(item.category_id)}
                                    isDeleting={deletingMenuItem?.id === item.id}
                                    isSaving={saving}
                                    isSnoozing={snoozingItemId === item.id}
                                    onDeleteStart={() => {
                                      setRestoreFocusId(null);
                                      setDeletingMenuItem({ id: item.id, name: item.name });
                                    }}
                                    onDelete={handleDeleteMenuItem}
                                    onDeleteCancel={() => {
                                      setDeletingMenuItem(null);
                                      setRestoreFocusId(`item-${item.id}`);
                                    }}
                                    autoFocusDelete={restoreFocusId === `item-${item.id}`}
                                    onToggleAvailability={() => handleToggleAvailability(item)}
                                    canMoveUp={index > 0}
                                    canMoveDown={index < catItems.length - 1}
                                    onMoveUp={() => moveMenuItem(item, "up")}
                                    onMoveDown={() => moveMenuItem(item, "down")}
                                  />
                                ))}
                          </ul>
                        </SortableContext>
                      </DndContext>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
      </div>}

      {/* Categories Section */}
      {section === "categories" && <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display">Categories</CardTitle>
            <Button size="sm" onClick={openCreateForm}>
              <Plus className="h-4 w-4 mr-1" />
              Add Category
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center">
              <Tag className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No categories yet</p>
              <Button className="mt-4" onClick={openCreateForm}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Category
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((category, index) => {
                const itemCount = categoryItemCounts.get(category.id) ?? 0;
                return (
                  <div
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveCategory(category, "up")}
                          aria-label={`Move ${category.name} up`}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveCategory(category, "down")}
                          aria-label={`Move ${category.name} down`}
                          disabled={index === categories.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-medium">
                          {category.name}
                          {!category.is_active && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                        {category.description && (
                          <div className="text-sm text-muted-foreground">
                            {category.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{itemCount} {itemCount === 1 ? "item" : "items"}</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditForm(category)}
                        aria-label={`Edit ${category.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {deletingCategory?.id === category.id ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <span id={`category-delete-warning-${category.id}`} className="text-sm text-destructive">This removes {itemCount} {itemCount === 1 ? "item" : "items"} from active menus. Past orders and Grab mappings are kept, but the menu entry cannot be restored here.</span>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteCategory}
                            disabled={saving}
                            autoFocus
                            aria-label={`Confirm delete category ${category.name}`}
                            aria-describedby={`category-delete-warning-${category.id}`}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeletingCategory(null);
                              setRestoreFocusId(`category-${category.id}`);
                            }}
                            disabled={saving}
                            aria-label={`Cancel delete category ${category.name}`}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setRestoreFocusId(null);
                            setDeletingCategory(category);
                          }}
                          autoFocus={restoreFocusId === `category-${category.id}`}
                          aria-label={`Delete ${category.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* Category Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="bg-card border-border shadow-sm rounded-xl w-full max-w-md mx-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-display">
                  {editingCategory ? "Edit Category" : "New Category"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={closeForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCategorySubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Name
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Category name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description (optional)
                  </label>
                  <Input
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Brief description"
                  />
                </div>
                {formError && (
                  <p role="alert" className="text-sm text-destructive">{formError}</p>
                )}
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {editingCategory ? "Save" : "Create"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Option Groups Section */}
      {section === "modifiers" && <div className="space-y-6">
      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display">Option groups</CardTitle>
            <Button size="sm" onClick={handleCreateGroup} disabled={saving}>
              <Plus className="h-4 w-4 mr-1" />
              New Group
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editingGroup && (
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium mb-1 block">Name</label>
                  <Input
                    value={editingGroup.name}
                    onChange={(e) =>
                      setEditingGroup({ ...editingGroup, name: e.target.value })
                    }
                    placeholder="e.g., Size, Toppings"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">
                    Description
                  </label>
                  <Input
                    value={editingGroup.description}
                    onChange={(e) =>
                      setEditingGroup({ ...editingGroup, description: e.target.value })
                    }
                    placeholder="Brief description"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium mb-1 block">Type</label>
                  <div className="flex gap-2">
                    <Button
                      variant={editingGroup.type === "radio" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditingGroup({ ...editingGroup, type: "radio" })}
                    >
                      Radio
                    </Button>
                    <Button
                      variant={editingGroup.type === "checkbox" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditingGroup({ ...editingGroup, type: "checkbox" })}
                    >
                      Checkbox
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Required</label>
                  <Button
                    variant={editingGroup.required ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setEditingGroup({ ...editingGroup, required: !editingGroup.required })
                    }
                  >
                    {editingGroup.required ? "Required" : "Optional"}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveGroup}
                  disabled={saving || !editingGroup.name.trim()}
                  size="sm"
                >
                  {saving ? "Saving..." : "Save Group"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingGroup(null)}
                  disabled={saving}
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {modifierGroups.length === 0 && !editingGroup ? (
            <div className="rounded-xl border bg-card p-12 text-center">
              <p className="text-muted-foreground">
                No modifier groups yet. Create one to allow customers to customize their orders.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {modifierGroups.map((group) => (
                <div key={group.id} className="border rounded-lg overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 p-3">
                    <button
                      onClick={() => toggleGroupExpanded(group.id)}
                      disabled={saving}
                      aria-expanded={expandedGroups.has(group.id)}
                      className="flex items-center gap-2 text-left"
                    >
                      {expandedGroups.has(group.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <div>
                        <span className="font-medium">{group.name}</span>
                        {group.description && (
                          <span className="text-sm text-muted-foreground ml-2">
                            ({group.description})
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {group.max_selections === 1 ? "Radio" : "Checkbox"}
                      </Badge>
                      {group.min_selections > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Required
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditGroup(group)}
                        disabled={saving}
                        aria-label={`Edit ${group.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {deletingGroup === group.id ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <span id={`group-delete-warning-${group.id}`} className="text-sm text-destructive">This removes {group.modifiers?.length ?? 0} {(group.modifiers?.length ?? 0) === 1 ? "option" : "options"} from active menus. Their per-item assignments and required settings are permanently deleted and cannot be restored.</span>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteGroup(group.id)}
                            disabled={saving}
                            autoFocus
                            aria-label={`Confirm delete option group ${group.name}`}
                            aria-describedby={`group-delete-warning-${group.id}`}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeletingGroup(null);
                              setRestoreFocusId(`group-${group.id}`);
                            }}
                            disabled={saving}
                            aria-label={`Cancel delete option group ${group.name}`}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setRestoreFocusId(null);
                            setDeletingGroup(group.id);
                          }}
                          disabled={saving}
                          autoFocus={restoreFocusId === `group-${group.id}`}
                          aria-label={`Delete ${group.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {expandedGroups.has(group.id) && (
                    <div className="p-3 border-t">
                      {editingModifier?.groupId === group.id ? (
                        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <Input
                              disabled={saving}
                              value={editingModifier.modifier.name}
                              onChange={(e) =>
                                setEditingModifier({
                                  ...editingModifier,
                                  modifier: {
                                    ...editingModifier.modifier,
                                    name: e.target.value,
                                  },
                                })
                              }
                              placeholder="Option name"
                              aria-label="Option name"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={saving}
                              value={editingModifier.modifier.price}
                              onChange={(e) =>
                                setEditingModifier({
                                  ...editingModifier,
                                  modifier: {
                                    ...editingModifier.modifier,
                                    price: e.target.value,
                                  },
                                })
                              }
                              placeholder="Price (RM)"
                              aria-label="Option price (RM)"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={saving}
                              value={editingModifier.modifier.grabPrice}
                              onChange={(e) =>
                                setEditingModifier({
                                  ...editingModifier,
                                  modifier: {
                                    ...editingModifier.modifier,
                                    grabPrice: e.target.value,
                                  },
                                })
                              }
                              placeholder="GrabFood price (RM)"
                              aria-label="GrabFood price (RM)"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            GrabFood price blank = same as the regular option price.
                          </p>
                          <div className="flex items-center gap-4 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                disabled={saving}
                                checked={editingModifier.modifier.is_default}
                                onChange={(e) =>
                                  setEditingModifier({
                                    ...editingModifier,
                                    modifier: {
                                      ...editingModifier.modifier,
                                      is_default: e.target.checked,
                                    },
                                  })
                                }
                                className="rounded"
                              />
                              Default
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                disabled={saving}
                                checked={editingModifier.modifier.is_available}
                                onChange={(e) =>
                                  setEditingModifier({
                                    ...editingModifier,
                                    modifier: {
                                      ...editingModifier.modifier,
                                      is_available: e.target.checked,
                                    },
                                  })
                                }
                                className="rounded"
                              />
                              Available
                            </label>
                          </div>
                          {editingModifierIsLastAvailable && (
                            <p className="text-xs text-destructive">
                              Unchecking Available removes required item assignments for this group because it would have no available options.
                            </p>
                          )}
                          {editingModifier.error && (
                            <p role="alert" className="text-sm text-destructive">{editingModifier.error}</p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={handleSaveModifier}
                              disabled={saving || !editingModifier.modifier.name.trim()}
                            >
                              {saving ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingModifier(null)}
                              disabled={saving}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddModifier(group.id)}
                          disabled={saving}
                          className="mb-3"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add option
                        </Button>
                      )}

                      {group.modifiers && group.modifiers.length > 0 ? (
                        <DndContext
                          collisionDetection={closestCenter}
                          onDragStart={(e) => setActiveDragId(e.active.id as string)}
                          onDragEnd={handleModifierDragEnd}
                        >
                          <SortableContext
                            items={group.modifiers.map((m) => m.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {group.modifiers.map((modifier, index) => {
                                const isActive = activeDragId === modifier.id;
                                const availableCount = group.modifiers?.filter((option) => option.is_available).length ?? 0;
                                return (
                                  <SortableModifierRow
                                    key={modifier.id}
                                    modifier={modifier}
                                    isActive={isActive}
                                    isDeleting={deletingModifier === modifier.id}
                                    isSaving={saving}
                                    onEdit={() => handleEditModifier(modifier)}
                                    onDelete={() => handleDeleteModifier(modifier.id)}
                                    onDeleteStart={() => {
                                      setRestoreFocusId(null);
                                      setDeletingModifier(modifier.id);
                                    }}
                                    onDeleteCancel={() => {
                                      setDeletingModifier(null);
                                      setRestoreFocusId(`modifier-${modifier.id}`);
                                    }}
                                    autoFocusDelete={restoreFocusId === `modifier-${modifier.id}`}
                                    losesAssignments={availableCount === 1 && Boolean(modifier.is_available)}
                                    formatPrice={formatPrice}
                                    canMoveUp={index > 0}
                                    canMoveDown={index < (group.modifiers?.length ?? 0) - 1}
                                    onMoveUp={() => moveModifier(modifier, "up")}
                                    onMoveDown={() => moveModifier(modifier, "down")}
                                  />
                                );
                              })}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No options yet. Add choices like Small, Medium, Large.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Options Section */}
      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display">Assign options to items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block">Select Menu Item</label>
            <select
              value={selectedMenuItemId}
              aria-label="Select menu item"
              disabled={bindingsLoading || bindingsSaving}
              onChange={(e) => handleMenuItemSelect(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            >
              <option value="">Choose a menu item...</option>
              {menuItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {getCategoryName(item.category_id)}
                </option>
              ))}
            </select>
          </div>

          {selectedMenuItemId && (
            <>
              {bindingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : bindingsLoadFailed ? (
                <div role="alert" className="rounded-lg border border-destructive/50 bg-card p-4 text-sm text-destructive">
                  <p>Could not load this item&apos;s option assignments: {bindingsLoadError ?? "Unknown error"}</p>
                  <p>Saving is disabled until the assignments load, so the item&apos;s existing bindings are not overwritten.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => void handleMenuItemSelect(selectedMenuItemId)}
                  >
                    Retry
                  </Button>
                </div>
              ) : modifierGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No modifier groups available. Create one first.
                </p>
              ) : (
                <div className="space-y-2">
                  {modifierGroups.map((group) => {
                    const binding = selectedBindings[group.id] ?? { bound: false, required: false };
                    const effectivelyRequired = binding.bound && (binding.required || group.min_selections > 0);
                    return (
                      <div
                        key={group.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-colors",
                          binding.bound ? "bg-muted/50" : "bg-card"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={binding.bound}
                            aria-label={`Assign ${group.name}`}
                            onChange={() => handleBindingToggle(group.id)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <div>
                            <span className="font-medium text-sm">{group.name}</span>
                            {group.description && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ({group.description})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {group.max_selections === 1 ? "Radio" : "Checkbox"}
                          </Badge>
                          {binding.bound && (
                            <Button
                              variant={effectivelyRequired ? "default" : "outline"}
                              size="sm"
                              disabled={group.min_selections > 0}
                              title={group.min_selections > 0 ? `This group requires at least ${group.min_selections} option${group.min_selections === 1 ? "" : "s"}.` : undefined}
                              onClick={() => handleRequiredToggle(group.id)}
                            >
                              {effectivelyRequired
                                ? group.min_selections > 0
                                  ? `Required · min ${group.min_selections}`
                                  : "Required"
                                : "Optional"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSaveBindings}
                  disabled={bindingsSaving || bindingsLoading || bindingsLoadFailed || modifierGroups.length === 0}
                  size="sm"
                >
                  {bindingsSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Bindings"
                  )}
                </Button>
                {bindingsSaved && (
                  <span className="text-sm text-green-600 font-medium">
                    Bindings saved!
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>}
    </div>
  );
}
