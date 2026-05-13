'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, X, Loader2, Store, ImageIcon } from 'lucide-react'

interface BrandingSettingsProps {
  logoUrl: string | null
  heroImageUrl: string | null
}

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function BrandingSettings({ logoUrl: initialLogoUrl, heroImageUrl: initialHeroUrl }: BrandingSettingsProps) {
  const router = useRouter()
  const supabase = getBrowserClient()

  const [logoUrl, setLogoUrl] = useState(initialLogoUrl)
  const [heroImageUrl, setHeroImageUrl] = useState(initialHeroUrl)

  const [logoUploading, setLogoUploading] = useState(false)
  const [heroUploading, setHeroUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [heroError, setHeroError] = useState<string | null>(null)

  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [heroPreview, setHeroPreview] = useState<string | null>(null)

  const handleFileChange = useCallback(
    async (file: File | undefined, type: 'logo' | 'hero') => {
      if (!file) return

      const setError = type === 'logo' ? setLogoError : setHeroError
      const setUploading = type === 'logo' ? setLogoUploading : setHeroUploading
      const setPreview = type === 'logo' ? setLogoPreview : setHeroPreview

      setError(null)

      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Invalid file type. Only JPEG, PNG, and WebP are allowed.')
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        setError('File too large. Maximum size is 5MB.')
        return
      }

      // Show local preview
      const previewUrl = URL.createObjectURL(file)
      setPreview(previewUrl)

      setUploading(true)
      try {
        const fileExt = file.name.split('.').pop() || 'jpg'
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
        const storagePath = `store/${type}-${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('store-images')
          .upload(storagePath, file)

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        const { data: { publicUrl } } = supabase.storage
          .from('store-images')
          .getPublicUrl(storagePath)

        const updateField = type === 'logo' ? 'logo_url' : 'hero_image_url'
        const { data: row, error: idError } = await supabase.from('store_branding').select('id').single()
        if (idError) {
          throw new Error(idError.message)
        }
        const { error: updateError } = await supabase
          .from('store_branding')
          .update({ [updateField]: publicUrl })
          .eq('id', row!.id)

        if (updateError) {
          throw new Error(updateError.message)
        }

        if (type === 'logo') {
          setLogoUrl(publicUrl)
        } else {
          setHeroImageUrl(publicUrl)
        }

        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        setPreview(null)
        URL.revokeObjectURL(previewUrl)
      }
    },
    [supabase, router]
  )

  const handleRemove = useCallback(
    async (type: 'logo' | 'hero') => {
      const setError = type === 'logo' ? setLogoError : setHeroError
      const setUploading = type === 'logo' ? setLogoUploading : setHeroUploading

      setError(null)
      setUploading(true)
      try {
        const updateField = type === 'logo' ? 'logo_url' : 'hero_image_url'
        const { data: row, error: idError } = await supabase.from('store_branding').select('id').single()
        if (idError) {
          throw new Error(idError.message)
        }
        const { error: updateError } = await supabase
          .from('store_branding')
          .update({ [updateField]: null })
          .eq('id', row!.id)

        if (updateError) {
          throw new Error(updateError.message)
        }

        if (type === 'logo') {
          setLogoUrl(null)
        } else {
          setHeroImageUrl(null)
        }

        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Remove failed')
      } finally {
        setUploading(false)
      }
    },
    [supabase, router]
  )

  const renderUploadCard = (
    title: string,
    type: 'logo' | 'hero',
    currentUrl: string | null,
    previewUrl: string | null,
    uploading: boolean,
    error: string | null,
    placeholderIcon: React.ReactNode
  ) => {
    const displayUrl = previewUrl || currentUrl
    const isLogo = type === 'logo'

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">{title}</label>
        <div className="border-2 border-dashed rounded-lg p-4">
          {displayUrl ? (
            <div className="relative flex flex-col items-center gap-3">
              <div
                className={`relative overflow-hidden rounded-lg ${
                  isLogo ? 'h-32 w-32' : 'h-40 w-full max-w-md'
                }`}
              >
                <Image
                  src={displayUrl}
                  alt={title}
                  fill
                  sizes={isLogo ? '128px' : '(min-width: 768px) 448px, 100vw'}
                  className={isLogo ? 'object-contain' : 'object-cover'}
                  unoptimized
                />
              </div>
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <Button type="button" variant="outline" size="sm" disabled={uploading} asChild>
                    <span className="gap-1">
                      <Upload className="h-3 w-3" />
                      Change
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e.target.files?.[0], type)}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 text-red-500 hover:text-red-600"
                  disabled={uploading}
                  onClick={() => handleRemove(type)}
                >
                  <X className="h-3 w-3" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto h-12 w-12 text-muted-foreground mb-2 flex items-center justify-center">
                {placeholderIcon}
              </div>
              <label className="cursor-pointer">
                <span className="text-sm text-primary hover:underline">
                  Click to upload
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e.target.files?.[0], type)}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                JPEG, PNG, WebP up to 5MB
              </p>
            </div>
          )}
          {uploading && (
            <div className="flex items-center justify-center mt-2">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Uploading...</span>
            </div>
          )}
          {error && (
            <p className="text-xs text-red-500 mt-2 text-center">{error}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card className="bg-card border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="font-display">Store Branding</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {renderUploadCard(
            'Store Logo',
            'logo',
            logoUrl,
            logoPreview,
            logoUploading,
            logoError,
            <Store className="h-8 w-8" />
          )}
          {renderUploadCard(
            'Hero Image',
            'hero',
            heroImageUrl,
            heroPreview,
            heroUploading,
            heroError,
            <ImageIcon className="h-8 w-8" />
          )}
        </div>

        {/* Live preview of how it looks on mobile */}
        <div className="border rounded-xl overflow-hidden bg-gradient-to-b from-primary/20 to-background">
          <div className="relative h-48">
            {(heroImageUrl || heroPreview) && (
              <Image
                src={heroPreview || heroImageUrl || ''}
                alt="Hero preview"
                fill
                sizes="(min-width: 768px) 400px, 100vw"
                className="object-cover opacity-60"
                unoptimized
              />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {(logoUrl || logoPreview) ? (
                <div className="relative h-16 w-16 mb-3">
                  <Image
                    src={logoPreview || logoUrl || ''}
                    alt="Logo preview"
                    fill
                    sizes="64px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Store className="h-8 w-8 text-primary" />
                </div>
              )}
              <h3 className="text-lg font-bold">Mad Krapow</h3>
              <p className="text-sm text-muted-foreground text-center px-4">
                Hot, fiery Phad Kra Phao delivered to your door.
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          This preview shows how your branding will appear on the mobile app home screen.
        </p>
      </CardContent>
    </Card>
  )
}
