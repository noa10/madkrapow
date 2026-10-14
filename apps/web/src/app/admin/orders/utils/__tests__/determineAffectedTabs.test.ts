import { describe, it, expect } from 'vitest';
import { determineAffectedTabs } from '../determineAffectedTabs';
import { ORDER_STATUSES } from '@/lib/orders/status';
import type { Order, OrderTab } from '@/types/orders';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    display_code: 'MK-1',
    status: 'preparing',
    total_cents: 1250,
    delivery_fee_cents: 500,
    created_at: '2026-10-14T10:00:00.000Z',
    delivery_address_json: null,
    customer_phone: '60123456789',
    customer_name: 'Customer',
    delivery_type: 'delivery',
    fulfillment_type: 'asap',
    dispatch_status: null,
    scheduled_for: null,
    order_kind: 'standard',
    approval_status: 'approved',
    bulk_company_name: null,
    item_count: 1,
    source: 'web',
    customer_id: null,
    stripe_payment_intent_id: null,
    stripe_session_id: null,
    lalamove_order_id: null,
    lalamove_quote_id: null,
    driver_name: null,
    driver_phone: null,
    ...overrides,
  };
}

describe('determineAffectedTabs', () => {
  it('assigns pre-kitchen and kitchen statuses on ASAP orders to preparing', () => {
    for (const status of ['pending', 'paid', 'accepted', 'preparing']) {
      expect(determineAffectedTabs(makeOrder({ status }))).toEqual(['preparing']);
    }
  });

  it('assigns only ready+asap to ready', () => {
    expect(determineAffectedTabs(makeOrder({ status: 'ready' }))).toEqual(['ready']);
  });

  it('keeps a scheduled order out of preparing even in a preparing status', () => {
    expect(
      determineAffectedTabs(makeOrder({ status: 'preparing', fulfillment_type: 'scheduled' }))
    ).toEqual(['upcoming']);
  });

  it('assigns a bulk order to upcoming regardless of fulfillment type', () => {
    expect(determineAffectedTabs(makeOrder({ status: 'paid', order_kind: 'bulk' }))).toEqual([
      'preparing',
      'upcoming',
    ]);
  });

  it('lists a bulk+scheduled order in upcoming exactly once', () => {
    const tabs = determineAffectedTabs(
      makeOrder({ status: 'paid', order_kind: 'bulk', fulfillment_type: 'scheduled' })
    );
    expect(tabs.filter((t) => t === 'upcoming')).toHaveLength(1);
  });

  it('assigns picked_up, delivered and cancelled to history', () => {
    for (const status of ['picked_up', 'delivered', 'cancelled']) {
      expect(determineAffectedTabs(makeOrder({ status }))).toEqual(['history']);
    }
  });

  // The upcoming tab's query excludes exactly ADMIN_TAB_STATUSES.history, so a
  // bulk/scheduled order that reaches one of those statuses is no longer in it.
  // Regression guard: this previously excluded only delivered/cancelled, so a
  // picked_up bulk order was needlessly invalidated as if still upcoming.
  it('drops a bulk or scheduled order out of upcoming once it is history', () => {
    for (const status of ['picked_up', 'delivered', 'cancelled']) {
      expect(
        determineAffectedTabs(makeOrder({ status, order_kind: 'bulk', fulfillment_type: 'scheduled' }))
      ).toEqual(['history']);
    }
  });

  it('treats an unrecognised status as out of every status-filtered tab', () => {
    expect(determineAffectedTabs(makeOrder({ status: 'out_for_delivery' }))).toEqual([]);
  });

  it('still lists an unrecognised status in upcoming when bulk or scheduled', () => {
    expect(determineAffectedTabs(makeOrder({ status: 'mystery', order_kind: 'bulk' }))).toEqual([
      'upcoming',
    ]);
  });

  it('never returns a tab twice', () => {
    for (const status of ORDER_STATUSES) {
      for (const order_kind of ['standard', 'bulk']) {
        for (const fulfillment_type of ['asap', 'scheduled']) {
          const tabs = determineAffectedTabs(makeOrder({ status, order_kind, fulfillment_type }));
          expect(new Set(tabs).size).toBe(tabs.length);
        }
      }
    }
  });

  it('never places an order in both upcoming and history', () => {
    for (const status of ORDER_STATUSES) {
      for (const order_kind of ['standard', 'bulk']) {
        for (const fulfillment_type of ['asap', 'scheduled']) {
          const tabs: OrderTab[] = determineAffectedTabs(
            makeOrder({ status, order_kind, fulfillment_type })
          );
          expect(tabs.includes('upcoming') && tabs.includes('history')).toBe(false);
        }
      }
    }
  });

  it('never places an order in both preparing and ready', () => {
    for (const status of ORDER_STATUSES) {
      const tabs = determineAffectedTabs(makeOrder({ status }));
      expect(tabs.includes('preparing') && tabs.includes('ready')).toBe(false);
    }
  });

  it('assigns every known order status to at least one tab', () => {
    for (const status of ORDER_STATUSES) {
      expect(determineAffectedTabs(makeOrder({ status })).length).toBeGreaterThan(0);
    }
  });
});
