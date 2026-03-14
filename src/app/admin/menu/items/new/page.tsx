import { MenuItemForm } from '@/components/admin/MenuItemForm'

export default function NewMenuItemPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Add New Menu Item</h1>
        <p className="text-muted-foreground mt-1">
          Create a new menu item for your restaurant
        </p>
      </div>
      
      <MenuItemForm isNew />
    </div>
  )
}
