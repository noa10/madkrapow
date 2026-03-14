import { getServerClient } from '../supabase/server'

export type StoreSettings = {
  id: string
  store_name: string
  address: string | null
  phone: string | null
  operating_hours: Record<string, { open: string; close: string }> | null
  lalamove_market: string | null
  min_order_amount: number
  delivery_fee: number
}

export async function getStoreSettings(): Promise<StoreSettings | null> {
  const supabase = await getServerClient()

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
