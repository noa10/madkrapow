import { createClient } from '../supabase/client'
import { unstable_cache } from 'next/cache'

function createPublicClient() {
  return createClient()
}

export type StoreSettings = {
  id: string
  store_name: string
  address: string | null
  phone: string | null
  operating_hours: Record<string, { open: string; close: string }> | null
  lalamove_market: string | null
  min_order_amount: number
  delivery_fee: number
  logo_url: string | null
  hero_image_url: string | null
}

async function fetchStoreSettings(): Promise<StoreSettings | null> {
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('store_settings')
    .select('*')
    .limit(1)
    .single()

  if (error) {
    console.error('Failed to fetch store settings:', error)
    return null
  }

  return data
}

export const getStoreSettings = unstable_cache(
  fetchStoreSettings,
  ['store-settings'],
  { revalidate: 60 }
)
