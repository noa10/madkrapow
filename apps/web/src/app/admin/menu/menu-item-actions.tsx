"use client";

import Link from "next/link";
import { Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MenuItemActions({
  id, name, isDeleting, isSaving, onDeleteStart, onDelete, onDeleteCancel,
}: {
  id: string;
  name: string;
  isDeleting: boolean;
  isSaving: boolean;
  onDeleteStart: () => void;
  onDelete: () => void;
  onDeleteCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isDeleting ? (
        <>
          <Button variant="destructive" size="sm" className="h-10" onClick={onDelete} disabled={isSaving} aria-label={`Confirm delete ${name}`}>
            Confirm
          </Button>
          <Button variant="outline" size="sm" className="h-10" onClick={onDeleteCancel} disabled={isSaving} aria-label={`Cancel delete ${name}`}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" size="sm" className="h-10 w-10" asChild>
            <Link href={`/admin/menu/items/${id}`} aria-label={`Edit ${name}`}>
              <Edit className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-10 w-10" onClick={onDeleteStart} aria-label={`Delete ${name}`}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </>
      )}
    </div>
  );
}
