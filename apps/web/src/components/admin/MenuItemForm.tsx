'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Category, MenuItem } from '@/lib/queries/menu'
import { Upload, X, Loader2, Save, ArrowLeft } from 'lucide-react'

interface MenuItemFormProps {
  menuItem?: MenuItem
  isNew?: boolean
}

export function MenuItemForm({ menuItem, isNew = false }: MenuItemFormProps) {
  const router = useRouter()
  const supabase = getBrowserClient()
  
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priceCents, setPriceCents] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [isAvailable, setIsAvailable] = useState(true)
  const [spiceLevel, setSpiceLevel] = useState(0)
  const [ingredients, setIngredients] = useState('')
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
        setCategories(data || [])
        if (data && data.length > 0 && isNew) {
          setCategoryId(data[0].id)
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
      setSpiceLevel(menuItem.spice_level ?? 0)
      setIngredients((menuItem.ingredients ?? []).join(', '))
      setIsSignature(menuItem.is_signature ?? false)
    }
  }, [menuItem])

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
    
    if (!categoryId) {
      setError('Please select a category')
      return
    }
    
    setSaving(true)
    
    try {
      if (isNew) {
        const { data: maxOrder } = await supabase
          .from('menu_items')
          .select('sort_order')
          .eq('category_id', categoryId)
          .order('sort_order', { ascending: false })
          .limit(1)
          .single()
        
        const newSortOrder = (maxOrder?.sort_order || 0) + 1
        
        const { error: insertError } = await supabase
          .from('menu_items')
          .insert({
            name: name.trim(),
            description: description.trim() || null,
            price_cents: price,
            category_id: categoryId,
            image_url: imageUrl || null,
            is_available: isAvailable,
            sort_order: newSortOrder,
            spice_level: spiceLevel,
            ingredients: ingredients.split(',').map(s => s.trim()).filter(Boolean),
            is_signature: isSignature,
          })
        
        if (insertError) throw insertError
      } else if (menuItem) {
        const { error: updateError } = await supabase
          .from('menu_items')
          .update({
            name: name.trim(),
            description: description.trim() || null,
            price_cents: price,
            category_id: categoryId,
            image_url: imageUrl || null,
            is_available: isAvailable,
            updated_at: new Date().toISOString(),
            spice_level: spiceLevel,
            ingredients: ingredients.split(',').map(s => s.trim()).filter(Boolean),
            is_signature: isSignature,
          })
          .eq('id', menuItem.id)
        
        if (updateError) throw updateError
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

      <div className="space-y-2">
        <label className="text-sm font-medium">Spice Level</label>
        <div className="flex gap-4">
          {(['Mild', 'Medium', 'Hot', 'Thai-hot'] as const).map((label, i) => (
            <label key={i} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="spiceLevel"
                value={i}
                checked={spiceLevel === i}
                onChange={() => setSpiceLevel(i)}
                className="h-4 w-4"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="ingredients" className="text-sm font-medium">
          Ingredients (comma-separated)
        </label>
        <Input
          id="ingredients"
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder="e.g., rice noodles, shrimp, egg, bean sprouts"
        />
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
          Featured on /menu hero (max 2 items)
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
