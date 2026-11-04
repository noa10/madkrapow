'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getBrowserClient } from '@/lib/supabase/client'
import { notifyGrabMenuAfterChange } from '@/lib/grabfood/notify-client'
import { notifyMenuChanged } from '@/lib/admin/menu-cache'
import { useToastStore } from '@/stores/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Category, MenuItem } from '@/lib/queries/menu'
import { visibleMenuCategories } from '@/app/admin/menu/menu-visibility'
import { Upload, X, Loader2, Save, ArrowLeft } from 'lucide-react'

interface MenuItemFormProps {
  menuItem?: MenuItem
  isNew?: boolean
}

export function MenuItemForm({ menuItem, isNew = false }: MenuItemFormProps) {
  const router = useRouter()
  const supabase = getBrowserClient()
  const { addToast } = useToastStore()
  
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priceCents, setPriceCents] = useState('')
  const [grabPrice, setGrabPrice] = useState('')
  const [priceLoaded, setPriceLoaded] = useState(isNew)
  const [savedItemId, setSavedItemId] = useState<string | null>(menuItem?.id ?? null)
  const [retryNotification, setRetryNotification] = useState(false)
  const [originalGrabPrice, setOriginalGrabPrice] = useState<number | null>(null)
  const [grabRowExists, setGrabRowExists] = useState(false)
  const [originalPrice, setOriginalPrice] = useState(menuItem?.price_cents ?? null)
  const [pendingRegularNotification, setPendingRegularNotification] = useState(false)
  const [priceLoadAttempt, setPriceLoadAttempt] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [isAvailable, setIsAvailable] = useState(true)
  const [isSignature, setIsSignature] = useState(false)
  
  const [imageUploading, setImageUploading] = useState(false)

  useEffect(() => {
    async function fetchCategories() {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      
      if (error) {
        setError(error.message)
      } else {
        const visible = visibleMenuCategories<Category>(data || [])
        setCategories(visible)
        if (visible.length > 0 && isNew) {
          setCategoryId(visible[0].id)
        }
      }
      setLoading(false)
    }
    
    fetchCategories()
  }, [supabase, isNew])

  useEffect(() => {
    if (menuItem) {
      setName(menuItem.name)
      setDescription(menuItem.description || '')
      setPriceCents((menuItem.price_cents / 100).toFixed(2))
      setCategoryId(menuItem.category_id)
      setImageUrl(menuItem.image_url || '')
      setIsAvailable(menuItem.is_available)
      setIsSignature(menuItem.is_signature ?? false)
    }
  }, [menuItem])

  useEffect(() => {
    if (!menuItem) return
    let cancelled = false
    async function loadPrice() {
      try {
        const { data } = await supabase.auth.getSession()
        const res = await fetch(`/api/integrations/grabfood/menu/price?menu_item_id=${menuItem!.id}`, {
          headers: { authorization: `Bearer ${data.session?.access_token ?? ''}` },
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Could not load GrabFood price')
        if (!cancelled) {
          setGrabPrice(body.price_cents === null ? '' : (body.price_cents / 100).toFixed(2))
          setOriginalGrabPrice(body.price_cents)
          setGrabRowExists(body.exists)
          setPriceLoaded(true)
          setError((current) => current?.startsWith('Could not load GrabFood price') ? null : current)
        }
      } catch (err) {
        if (!cancelled) setError(`Could not load GrabFood price. You can still save other fields. ${err instanceof Error ? err.message : ''}`)
      }
    }
    void loadPrice()
    return () => { cancelled = true }
  }, [menuItem, supabase, priceLoadAttempt])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setImageUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `menu-items/${fileName}`
      
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file)
      
      if (uploadError) {
        setError('Failed to upload image')
        return
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath)
      
      setImageUrl(publicUrl)
    } catch {
      setError('Failed to upload image')
    } finally {
      setImageUploading(false)
    }
  }

  const handleRemoveImage = () => {
    setImageUrl('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    
    const price = Math.round(parseFloat(priceCents) * 100)
    if (isNaN(price) || price < 0) {
      setError('Please enter a valid price')
      return
    }
    
    const grabPriceCents = grabPrice.trim() === '' ? null : Math.round(Number(grabPrice) * 100)
    if (grabPriceCents !== null && (!/^\d+(\.\d{1,2})?$/.test(grabPrice.trim()) || !Number.isSafeInteger(grabPriceCents) || grabPriceCents > 9999999)) {
      setError('Enter a valid GrabFood price with at most two decimal places')
      return
    }
    if (!categoryId) {
      setError('Please select a category')
      return
    }
    
    setSaving(true)
    
    try {
      let itemId = savedItemId
      if (!itemId) {
        const { data: maxOrder } = await supabase
          .from('menu_items')
          .select('sort_order')
          .eq('category_id', categoryId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single()
        
        const newSortOrder = (maxOrder?.sort_order || 0) + 1
        
        const { data: insertedItem, error: insertError } = await supabase
          .from('menu_items')
          .insert({
            name: name.trim(),
            description: description.trim() || null,
            price_cents: price,
            category_id: categoryId,
            image_url: imageUrl || null,
            is_available: isAvailable,
            sort_order: newSortOrder,
            is_signature: isSignature,
          }).select('id').single()

        if (insertError) throw insertError
        if (!insertedItem) throw new Error('Item creation returned no ID. Check the menu before retrying.')
        itemId = insertedItem.id
        setSavedItemId(itemId)
      } else {
        const { data: updatedItem, error: updateError } = await supabase
          .from('menu_items')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            price_cents: price,
            category_id: categoryId,
            image_url: imageUrl || null,
            is_available: isAvailable,
            updated_at: new Date().toISOString(),
            is_signature: isSignature,
          })
          .eq('id', itemId).select('id').maybeSingle()

        if (updateError) throw updateError
        if (!updatedItem) throw new Error('Item could not be updated. Reload the page and check your access.')
      }
      // Direct browser write: the route handlers are not involved, so ask the
      // server to drop the public menu caches (storefront, /order, /item/*).
      notifyMenuChanged()

      const regularPriceChanged = pendingRegularNotification || (originalPrice !== null && originalPrice !== price)
      setOriginalPrice(price)
      setPendingRegularNotification(regularPriceChanged)

      if (!priceLoaded) {
        // The GrabFood override could not be read. Editing the regular fields is
        // still safe as long as the override is left untouched, so save those and
        // skip the price write instead of blocking every menu edit.
        const grabWarning = isNew ? null : await notifyGrabMenuAfterChange()
        addToast({
          type: 'error',
          title: 'Item saved; GrabFood price was not changed',
          description: grabWarning
            ? `The current GrabFood price could not be loaded, and the Grab menu refresh failed: ${grabWarning}`
            : 'The current GrabFood price could not be loaded. Reload the page or use Retry to edit it.',
        })
        router.push('/admin/menu')
        return
      }

      const { data: session } = await supabase.auth.getSession()
      let response: Response
      try {
        response = await fetch('/api/integrations/grabfood/menu/price', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session.session?.access_token ?? ''}` },
          body: JSON.stringify({ menu_item_id: itemId, price_cents: grabPriceCents, update_price: grabPriceCents !== originalGrabPrice, expected_price_cents: originalGrabPrice, expected_exists: grabRowExists, regular_price_changed: regularPriceChanged, retry_notification: retryNotification }),
        })
      } catch {
        setRetryNotification(true)
        throw new Error('Item saved, but the GrabFood price save could not be confirmed. Check your connection and save again.')
      }
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(`Item saved, but GrabFood price could not be saved: ${result.error || 'Please save again.'}`)
      if (grabPriceCents !== originalGrabPrice) {
        setOriginalGrabPrice(grabPriceCents)
        setGrabRowExists(grabRowExists || grabPriceCents !== null)
      }
      setPendingRegularNotification(false)
      if (result.warning) {
        setRetryNotification(true)
        setError(`${result.warning} Save again to retry, or use Push full menu on the GrabFood Channel page later.`)
        return
      }

      // #493's full-menu refresh still covers non-price field edits (name,
      // description, image, availability). Run it after the price write so the
      // pushed menu carries the new override.
      if (!isNew) {
        const warning = await notifyGrabMenuAfterChange()
        if (warning) {
          addToast({
            type: 'error',
            title: 'Item saved, but Grab menu was not refreshed',
            description: warning,
          })
        } else {
          addToast({ type: 'success', title: 'Item saved; Grab menu refresh requested' })
        }
      }
      router.push('/admin/menu')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save menu item')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
      
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Name *
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pad Thai"
            required
          />
        </div>
        
        <div className="space-y-2">
          <label htmlFor="category" className="text-sm font-medium">
            Category *
          </label>
          <select
            id="category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            required
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="space-y-2">
        <label htmlFor="description" className="text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the dish..."
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
      </div>
      
      <div className="space-y-2">
        <label htmlFor="price" className="text-sm font-medium">
          Price (RM) *
        </label>
        <Input
          id="price"
          type="number"
          step="0.01"
          min="0"
          value={priceCents}
          onChange={(e) => setPriceCents(e.target.value)}
          placeholder="0.00"
          required
        />
      </div>
      
      <div className="space-y-2">
        <label htmlFor="grab-price" className="text-sm font-medium">GrabFood price (RM)</label>
        <Input id="grab-price" type="number" min="0" step="0.01" max="99999.99" value={grabPrice}
          onChange={(e) => setGrabPrice(e.target.value)} placeholder="Use regular price" disabled={!priceLoaded} />
        <p className="text-sm text-muted-foreground">Leave blank to use the regular price. A price of 0 is allowed.</p>
        {!priceLoaded && !isNew && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-amber-400">
            <span>GrabFood price could not be loaded. Other fields can still be saved.</span>
            <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setPriceLoadAttempt((attempt) => attempt + 1)}>
              Retry
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Image</label>
        <div className="border-2 border-dashed rounded-lg p-4">
          {imageUrl ? (
            <div className="relative">
              <div className="w-full max-w-xs relative h-48">
                <Image
                  src={imageUrl}
                  alt="Menu item"
                  fill
                  sizes="(min-width: 640px) 320px, 100vw"
                  className="rounded-lg object-cover"
                />
              </div>
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <label className="cursor-pointer">
                <span className="text-sm text-primary hover:underline">
                  Click to upload
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={imageUploading}
                />
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                or drag and drop
              </p>
            </div>
          )}
          {imageUploading && (
            <div className="flex items-center justify-center mt-2">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isAvailable"
          checked={isAvailable}
          onChange={(e) => setIsAvailable(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="isAvailable" className="text-sm font-medium">
          Available for ordering
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isSignature"
          checked={isSignature}
          onChange={(e) => setIsSignature(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="isSignature" className="text-sm font-medium">
          Featured as a Chef&apos;s pick (max 2 items)
        </label>
      </div>
      
      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/admin/menu')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {isNew ? 'Create Item' : 'Save Changes'}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
