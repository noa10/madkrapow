"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
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
  Edit,
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
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useRoleGuard } from "@/hooks/use-role-guard";

interface Category {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
}

interface ModifierGroup {
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
  id: string;
  modifier_group_id: string;
  name: string;
  price_delta_cents: number;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function SortableMenuItemRow({
  item,
  categoryName,
  isDeleting,
  isSaving,
  onDeleteStart,
  onDelete,
  onDeleteCancel,
}: {
  item: MenuItem;
  categoryName: string;
  isDeleting: boolean;
  isSaving: boolean;
  onDeleteStart: () => void;
  onDelete: () => void;
  onDeleteCancel: () => void;
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
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b last:border-0 hover:bg-muted/50"
    >
      <td className="py-3 w-8">
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="py-3 hidden sm:table-cell">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
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
      </td>
      <td className="py-3">
        <div className="font-medium">{item.name}</div>
        {item.description && (
          <div className="text-sm text-muted-foreground truncate max-w-[200px]">
            {item.description}
          </div>
        )}
      </td>
      <td className="py-3">
        <Badge variant="outline">
          <Tag className="h-3 w-3 mr-1" />
          {categoryName}
        </Badge>
      </td>
      <td className="py-3">RM {(item.price_cents / 100).toFixed(2)}</td>
      <td className="py-3">
        <Badge variant={item.is_available ? "default" : "secondary"}>
          {item.is_available ? "Available" : "Unavailable"}
        </Badge>
      </td>
      <td className="py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/menu/items/${item.id}`}>
              <Edit className="h-4 w-4" />
            </Link>
          </Button>
          {isDeleting ? (
            <div className="flex items-center gap-1">
              <Button variant="destructive" size="sm" onClick={onDelete} disabled={isSaving}>
                Confirm
              </Button>
              <Button variant="outline" size="sm" onClick={onDeleteCancel} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={onDeleteStart}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </td>
    </tr>
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
  formatPrice,
}: {
  modifier: Modifier;
  isActive: boolean;
  isDeleting: boolean;
  isSaving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteStart: () => void;
  onDeleteCancel: () => void;
  formatPrice: (cents: number) => string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: modifier.id });

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
        "flex items-center justify-between p-2 rounded border",
        !modifier.is_available && "bg-muted/50 opacity-60",
        isActive && "ring-2 ring-primary"
      )}
    >
      <div className="flex items-center gap-2">
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
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
        {!modifier.is_available && (
          <Badge variant="outline" className="text-xs">
            Unavailable
          </Badge>
        )}
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        {isDeleting ? (
          <div className="flex items-center gap-1">
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={isSaving}>
              Confirm
            </Button>
            <Button variant="outline" size="sm" onClick={onDeleteCancel} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={onDeleteStart}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AdminMenuPage() {
  const { hasAccess, isLoading: guardLoading } = useRoleGuard(["admin", "manager"]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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

  // Modifier groups state
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<{
    id?: string;
    name: string;
    description: string;
    type: "radio" | "checkbox";
    required: boolean;
  } | null>(null);
  const [editingModifier, setEditingModifier] = useState<{
    groupId: string;
    modifier: {
      id?: string;
      name: string;
      price: string;
      is_default: boolean;
      is_available: boolean;
    };
  } | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [deletingModifier, setDeletingModifier] = useState<string | null>(null);

  // Item-modifier group bindings state
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>("");
  const [selectedBindings, setSelectedBindings] = useState<Record<string, { bound: boolean; required: boolean }>>({});
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [bindingsSaving, setBindingsSaving] = useState(false);
  const [bindingsSaved, setBindingsSaved] = useState(false);

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();

    const fetchData = async () => {
      const [menuItemsRes, categoriesRes, groupsRes] = await Promise.all([
        supabase
          .from("menu_items")
          .select("*")
          .order("sort_order", { ascending: true }),
        supabase
          .from("categories")
          .select("*")
          .order("sort_order", { ascending: true }),
        supabase
          .from("modifier_groups")
          .select("*")
          .order("sort_order", { ascending: true }),
      ]);

      if (menuItemsRes.error) {
        setError(menuItemsRes.error.message);
        setLoading(false);
        return;
      }

      setMenuItems(menuItemsRes.data || []);
      setCategories(categoriesRes.data || []);

      const groupsData: ModifierGroup[] = groupsRes.data ?? [];

      if (groupsData.length > 0) {
        const groupIds = groupsData.map((group) => group.id);
        const { data: modifiers } = await supabase
          .from("modifiers")
          .select("*")
          .in("modifier_group_id", groupIds)
          .order("sort_order", { ascending: true });

        const modifiersData: Modifier[] = modifiers ?? [];
        const groupsWithModifiers = groupsData.map((group) => ({
          ...group,
          modifiers: modifiersData.filter((modifier) => modifier.modifier_group_id === group.id),
        }));
        setModifierGroups(groupsWithModifiers);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || "Uncategorized";
  };

  const filteredAndSortedItems = menuItems.filter((item) => {
    const matchesSearch =
      searchQuery === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesCategory =
      categoryFilter === "all" || item.category_id === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Category management functions
  const openCreateForm = () => {
    setFormData({ name: "", description: "" });
    setEditingCategory(null);
    setIsFormOpen(true);
  };

  const openEditForm = (category: Category) => {
    setFormData({
      name: category.name,
      description: category.description || "",
    });
    setEditingCategory(category);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
    setFormData({ name: "", description: "" });
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
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

      const categoriesRes = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });
      setCategories(categoriesRes.data || []);
      closeForm();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;

    setSaving(true);
    const supabase = getBrowserClient();

    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", deletingCategory.id);

      if (error) throw error;

      const [menuItemsRes, categoriesRes] = await Promise.all([
        supabase.from("menu_items").select("*").order("sort_order", { ascending: true }),
        supabase.from("categories").select("*").order("sort_order", { ascending: true }),
      ]);
      setMenuItems(menuItemsRes.data || []);
      setCategories(categoriesRes.data || []);
      setDeletingCategory(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMenuItem = async () => {
    if (!deletingMenuItem) return;

    setSaving(true);
    const supabase = getBrowserClient();

    try {
      const { error } = await supabase
        .from("menu_items")
        .delete()
        .eq("id", deletingMenuItem.id);

      if (error) throw error;

      const menuItemsRes = await supabase
        .from("menu_items")
        .select("*")
        .order("sort_order", { ascending: true });

      setMenuItems(menuItemsRes.data || []);
      setDeletingMenuItem(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setSaving(false);
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

      const res = await supabase
        .from("menu_items")
        .select("*")
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

      const categoriesRes = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });
      setCategories(categoriesRes.data || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
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

  const fetchModifierGroups = async () => {
    const supabase = getBrowserClient();
    const { data: groups } = await supabase
      .from("modifier_groups")
      .select("*")
      .order("sort_order", { ascending: true });

    const groupsData: ModifierGroup[] = groups ?? [];

    if (groupsData.length > 0) {
      const groupIds = groupsData.map((group) => group.id);
      const { data: modifiers } = await supabase
        .from("modifiers")
        .select("*")
        .in("modifier_group_id", groupIds)
        .order("sort_order", { ascending: true });

      const modifiersData: Modifier[] = modifiers ?? [];
      const groupsWithModifiers = groupsData.map((group) => ({
        ...group,
        modifiers: modifiersData.filter((modifier) => modifier.modifier_group_id === group.id),
      }));
      setModifierGroups(groupsWithModifiers);
    } else {
      setModifierGroups([]);
    }
  };

  const handleCreateGroup = () => {
    setEditingGroup({
      name: "",
      description: "",
      type: "radio",
      required: false,
    });
  };

  const handleEditGroup = (group: ModifierGroup) => {
    setEditingGroup({
      id: group.id,
      name: group.name,
      description: group.description || "",
      type: group.max_selections === 1 ? "radio" : "checkbox",
      required: group.min_selections > 0,
    });
  };

  const handleSaveGroup = async () => {
    if (!editingGroup || !editingGroup.name.trim()) return;

    const supabase = getBrowserClient();
    setSaving(true);
    const maxSelections = editingGroup.type === "radio" ? 1 : 10;
    const minSelections = editingGroup.required ? 1 : 0;

    try {
      if (editingGroup.id) {
        const { error: updateError } = await supabase
          .from("modifier_groups")
          .update({
            name: editingGroup.name.trim(),
            description: editingGroup.description.trim() || null,
            min_selections: minSelections,
            max_selections: maxSelections,
          })
          .eq("id", editingGroup.id);

        if (updateError) throw updateError;
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

      await fetchModifierGroups();
      setEditingGroup(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const supabase = getBrowserClient();
    setSaving(true);
    try {
      const { error: deleteModError } = await supabase
        .from("modifiers")
        .delete()
        .eq("modifier_group_id", groupId);

      if (deleteModError) throw deleteModError;

      const { error: deleteGroupError } = await supabase
        .from("modifier_groups")
        .delete()
        .eq("id", groupId);

      if (deleteGroupError) throw deleteGroupError;

      await fetchModifierGroups();
      setDeletingGroup(null);
    } catch (err: any) {
      setError(err.message);
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
        is_default: false,
        is_available: true,
      },
    });
  };

  const handleEditModifier = (modifier: Modifier) => {
    setEditingModifier({
      groupId: modifier.modifier_group_id,
      modifier: {
        id: modifier.id,
        name: modifier.name,
        price: (modifier.price_delta_cents / 100).toFixed(2),
        is_default: modifier.is_default,
        is_available: modifier.is_available,
      },
    });
  };

  const handleSaveModifier = async () => {
    if (!editingModifier || !editingModifier.modifier.name.trim()) return;

    const supabase = getBrowserClient();
    setSaving(true);
    const priceCents = Math.round(parseFloat(editingModifier.modifier.price || "0") * 100);

    try {
      if (editingModifier.modifier.id) {
        const { error: updateError } = await supabase
          .from("modifiers")
          .update({
            name: editingModifier.modifier.name.trim(),
            price_delta_cents: priceCents,
            is_default: editingModifier.modifier.is_default,
            is_available: editingModifier.modifier.is_available,
          })
          .eq("id", editingModifier.modifier.id);

        if (updateError) throw updateError;
      } else {
        const { data: existingModifiers } = await supabase
          .from("modifiers")
          .select("sort_order")
          .eq("modifier_group_id", editingModifier.groupId)
          .order("sort_order", { ascending: false })
          .limit(1)
          .single();

        const newSortOrder = (existingModifiers?.sort_order ?? -1) + 1;

        const { error: insertError } = await supabase
          .from("modifiers")
          .insert({
            modifier_group_id: editingModifier.groupId,
            name: editingModifier.modifier.name.trim(),
            price_delta_cents: priceCents,
            is_default: editingModifier.modifier.is_default,
            is_available: editingModifier.modifier.is_available,
            sort_order: newSortOrder,
          });

        if (insertError) throw insertError;
      }

      await fetchModifierGroups();
      setEditingModifier(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteModifier = async (modifierId: string) => {
    const supabase = getBrowserClient();
    setSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from("modifiers")
        .delete()
        .eq("id", modifierId);

      if (deleteError) throw deleteError;

      await fetchModifierGroups();
      setDeletingModifier(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Item-modifier group binding functions
  const handleMenuItemSelect = async (menuItemId: string) => {
    setSelectedMenuItemId(menuItemId);
    setBindingsSaved(false);

    if (!menuItemId) {
      setSelectedBindings({});
      return;
    }

    setBindingsLoading(true);
    const supabase = getBrowserClient();

    try {
      const { data: bindings } = await supabase
        .from("menu_item_modifier_groups")
        .select("modifier_group_id, is_required")
        .eq("menu_item_id", menuItemId);

      const bindingsMap: Record<string, { bound: boolean; required: boolean }> = {};
      for (const group of modifierGroups) {
        const binding = bindings?.find(
          (binding: { modifier_group_id: string; is_required: boolean }) =>
            binding.modifier_group_id === group.id
        );
        bindingsMap[group.id] = {
          bound: !!binding,
          required: binding?.is_required ?? false,
        };
      }
      setSelectedBindings(bindingsMap);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBindingsLoading(false);
    }
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
    if (!selectedMenuItemId) return;

    setBindingsSaving(true);
    const supabase = getBrowserClient();

    try {
      const { error: deleteError } = await supabase
        .from("menu_item_modifier_groups")
        .delete()
        .eq("menu_item_id", selectedMenuItemId);

      if (deleteError) throw deleteError;

      const rowsToInsert = Object.entries(selectedBindings)
        .filter(([, val]) => val.bound)
        .map(([groupId, val]) => ({
          menu_item_id: selectedMenuItemId,
          modifier_group_id: groupId,
          is_required: val.required,
        }));

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("menu_item_modifier_groups")
          .insert(rowsToInsert);

        if (insertError) throw insertError;
      }

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
      await fetchModifierGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free";
    return `+RM ${(cents / 100).toFixed(2)}`;
  };

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

  if (error) {
    return (
      <Card className="bg-card border-destructive/50 shadow-sm rounded-xl">
        <CardContent className="pt-6">
          <p className="text-destructive text-center">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold font-display">Menu Management</h1>
        <Button asChild className="shadow-gold">
          <Link href="/admin/menu/items/new">
            <Plus className="h-4 w-4 mr-2" />
            Add New Item
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
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
              {categories
                .filter((cat) =>
                  filteredAndSortedItems.some((item) => item.category_id === cat.id)
                )
                .map((cat) => {
                  const catItems = filteredAndSortedItems
                    .filter((item) => item.category_id === cat.id)
                    .sort((a, b) => a.sort_order - b.sort_order);

                  if (catItems.length === 0) return null;

                  return (
                    <div key={cat.id}>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
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
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                  <th className="pb-2 w-8"></th>
                                  <th className="pb-2 font-medium hidden sm:table-cell">Photo</th>
                                  <th className="pb-2 font-medium">Name</th>
                                  <th className="pb-2 font-medium hidden sm:table-cell">Category</th>
                                  <th className="pb-2 font-medium">Price</th>
                                  <th className="pb-2 font-medium">Status</th>
                                  <th className="pb-2 font-medium text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catItems.map((item) => (
                                  <SortableMenuItemRow
                                    key={item.id}
                                    item={item}
                                    categoryName={getCategoryName(item.category_id)}
                                    isDeleting={deletingMenuItem?.id === item.id}
                                    isSaving={saving}
                                    onDeleteStart={() =>
                                      setDeletingMenuItem({ id: item.id, name: item.name })
                                    }
                                    onDelete={handleDeleteMenuItem}
                                    onDeleteCancel={() => setDeletingMenuItem(null)}
                                  />
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Categories Section */}
      <Card className="bg-card border-border shadow-sm rounded-xl">
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
                const itemCount = menuItems.filter(
                  (item) => item.category_id === category.id
                ).length;
                return (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveCategory(category, "up")}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveCategory(category, "down")}
                          disabled={index === categories.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <div>
                        <div className="font-medium">{category.name}</div>
                        {category.description && (
                          <div className="text-sm text-muted-foreground">
                            {category.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{itemCount} items</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditForm(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {deletingCategory?.id === category.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteCategory}
                            disabled={saving}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeletingCategory(null)}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingCategory(category)}
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
      </Card>

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

      {/* Modifier Groups Section */}
      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-display">Modifier Groups</CardTitle>
            <Button size="sm" onClick={handleCreateGroup}>
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
                  <div className="flex items-center justify-between p-3 bg-muted/30">
                    <button
                      onClick={() => toggleGroupExpanded(group.id)}
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
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {deletingGroup === group.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteGroup(group.id)}
                            disabled={saving}
                          >
                            Confirm
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeletingGroup(null)}
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingGroup(group.id)}
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
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
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
                              placeholder="Modifier name"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
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
                            />
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
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
                          className="mb-3"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Modifier
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
                              {group.modifiers.map((modifier) => {
                                const isActive = activeDragId === modifier.id;
                                return (
                                  <SortableModifierRow
                                    key={modifier.id}
                                    modifier={modifier}
                                    isActive={isActive}
                                    isDeleting={deletingModifier === modifier.id}
                                    isSaving={saving}
                                    onEdit={() => handleEditModifier(modifier)}
                                    onDelete={() => handleDeleteModifier(modifier.id)}
                                    onDeleteStart={() => setDeletingModifier(modifier.id)}
                                    onDeleteCancel={() => setDeletingModifier(null)}
                                    formatPrice={formatPrice}
                                  />
                                );
                              })}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No modifiers. Add options like Small, Medium, Large.
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

      {/* Item-Modifier Bindings Section */}
      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display">Item-Modifier Bindings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block">Select Menu Item</label>
            <select
              value={selectedMenuItemId}
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
              ) : modifierGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No modifier groups available. Create one first.
                </p>
              ) : (
                <div className="space-y-2">
                  {modifierGroups.map((group) => {
                    const binding = selectedBindings[group.id] ?? { bound: false, required: false };
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
                              variant={binding.required ? "default" : "outline"}
                              size="sm"
                              onClick={() => handleRequiredToggle(group.id)}
                            >
                              {binding.required ? "Required" : "Optional"}
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
                  disabled={bindingsSaving || modifierGroups.length === 0}
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
    </div>
  );
}
