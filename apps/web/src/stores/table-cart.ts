import { createCartStore, type CartStore } from './cart'

/**
 * One cart store per table, cached for the page's lifetime.
 *
 * Keying the persist storage by table id keeps a cart tied to the table the
 * diner actually scanned, even if they reopen the QR later on the same phone.
 * A module-level cache (rather than `useMemo`) keeps the store identity stable
 * across React StrictMode's double render.
 */
const tableCartStores = new Map<string, CartStore>()

export function getTableCartStore(tableId: string): CartStore {
  let store = tableCartStores.get(tableId)
  if (!store) {
    store = createCartStore(`table-cart:${tableId}`)
    tableCartStores.set(tableId, store)
  }
  return store
}
