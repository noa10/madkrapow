"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
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
  ArrowUp,
  ArrowDown,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

type SortField = "name" | "price_cents" | "is_available";
type SortDirection = "asc" | "desc";

function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}) {
  if (sortField !== field) return null;
  return <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>;
}

export default function AdminMenuPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  
  // Category management state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

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

      if (groupsRes.data && groupsRes.data.length > 0) {
        const groupIds = groupsRes.data.map((g) => g.id);
        const { data: modifiers } = await supabase
          .from("modifiers")
          .select("*")
          .in("modifier_group_id", groupIds)
          .order("sort_order", { ascending: true });

        const groupsWithModifiers = groupsRes.data.map((group) => ({
          ...group,
          modifiers: modifiers?.filter((m) => m.modifier_group_id === group.id) || [],
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

  const filteredAndSortedItems = menuItems
    .filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesCategory =
        categoryFilter === "all" || item.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "price_cents":
          comparison = a.price_cents - b.price_cents;
          break;
        case "is_available":
          comparison = (a.is_available ? 1 : 0) - (b.is_available ? 1 : 0);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

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

    if (groups && groups.length > 0) {
      const groupIds = groups.map((g) => g.id);
      const { data: modifiers } = await supabase
        .from("modifiers")
        .select("*")
        .in("modifier_group_id", groupIds)
        .order("sort_order", { ascending: true });

      const groupsWithModifiers = groups.map((group) => ({
        ...group,
        modifiers: modifiers?.filter((m) => m.modifier_group_id === group.id) || [],
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

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free";
    return `+RM ${(cents / 100).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
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
        <h1 className="text-2xl font-bold">Menu Management</h1>
        <Button asChild>
          <Link href="/admin/menu/new">
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
          className="flex h-10 w-full sm:w-[200px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Menu Items</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAndSortedItems.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {menuItems.length === 0
                  ? "No menu items yet"
                  : "No items match your filters"}
              </p>
              {menuItems.length === 0 && (
                <Button asChild className="mt-4">
                  <Link href="/admin/menu/new">Add Your First Item</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-muted-foreground">
                    <th
                      className="pb-3 font-medium cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("name")}
                    >
                      Name{" "}
                      <SortIcon
                        field="name"
                        sortField={sortField}
                        sortDirection={sortDirection}
                      />
                    </th>
                    <th className="pb-3 font-medium">Category</th>
                    <th
                      className="pb-3 font-medium cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("price_cents")}
                    >
                      Price{" "}
                      <SortIcon
                        field="price_cents"
                        sortField={sortField}
                        sortDirection={sortDirection}
                      />
                    </th>
                    <th
                      className="pb-3 font-medium cursor-pointer hover:text-foreground"
                      onClick={() => handleSort("is_available")}
                    >
                      Status{" "}
                      <SortIcon
                        field="is_available"
                        sortField={sortField}
                        sortDirection={sortDirection}
                      />
                    </th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-muted/50"
                    >
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
                          {getCategoryName(item.category_id)}
                        </Badge>
                      </td>
                      <td className="py-3">
                        RM {(item.price_cents / 100).toFixed(2)}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={item.is_available ? "default" : "secondary"}
                        >
                          {item.is_available ? "Available" : "Unavailable"}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/menu/${item.id}`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Categories Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Categories</CardTitle>
            <Button size="sm" onClick={openCreateForm}>
              <Plus className="h-4 w-4 mr-1" />
              Add Category
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center py-8">
              <Tag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
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
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Modifier Groups</CardTitle>
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
            <div className="text-center py-8">
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
                        <div className="space-y-2">
                          {group.modifiers.map((modifier) => (
                            <div
                              key={modifier.id}
                              className={cn(
                                "flex items-center justify-between p-2 rounded border",
                                !modifier.is_available && "bg-muted/50 opacity-60"
                              )}
                            >
                              <div className="flex items-center gap-2">
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEditModifier(modifier)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {deletingModifier === modifier.id ? (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleDeleteModifier(modifier.id)}
                                      disabled={saving}
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setDeletingModifier(null)}
                                      disabled={saving}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setDeletingModifier(modifier.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
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
    </div>
  );
}
