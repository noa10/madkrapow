'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase/client'
import { MenuItemForm } from '@/components/admin/MenuItemForm'
import type { MenuItem } from '@/lib/queries/menu'
import { Loader2 } from 'lucide-react'

export default function EditMenuItemPage() {
  const params = useParams()
  const supabase = getBrowserClient()
  const [menuItem, setMenuItem] = useState<MenuItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const id = params.id as string
  
  useEffect(() => {
    async function fetchMenuItem() {
      if (!id || id === 'new') {
        setLoading(false)
        return
      }
      
      const { data, error: fetchError } = await supabase
        .from('menu_items')
        .select('*')
        .eq('id', id)
        .single()
      
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setMenuItem(data)
      }
      setLoading(false)
    }
    
    fetchMenuItem()
  }, [id, supabase])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="max-w-2xl">
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      </div>
    )
  }
  
  if (!menuItem) {
    return (
      <div className="max-w-2xl">
        <div className="p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg">
          Menu item not found
        </div>
      </div>
    )
  }
  
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Edit Menu Item</h1>
        <p className="text-muted-foreground mt-1">
          Update the menu item details
        </p>
      </div>
      
      <MenuItemForm menuItem={menuItem} />
    </div>
  )
}
