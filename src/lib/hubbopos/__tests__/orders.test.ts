import { describe, it, expect, vi } from 'vitest';
import { generateTransId, generateInvoiceNo } from '../orders';

vi.mock('@/lib/validators/env', () => ({
  env: {
    HUBBOPOS_MERCHANT_ID: 'merchant-123',
    HUBBOPOS_LOCATION_ID: 'location-456',
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: table === 'orders'
              ? {
                  id: 'order-1',
                  order_number: 'MK-001',
                  status: 'paid',
                  subtotal_cents: 2500,
                  delivery_fee_cents: 500,
                  total_cents: 3000,
                  customer_name: 'John Doe',
                  customer_phone: '+60123456789',
                  delivery_type: 'delivery',
                  scheduled_for: null,
                  notes: 'Extra napkins',
                  created_at: '2026-03-31T10:00:00.000Z',
                }
              : { hubbo_pos_external_id: 'hp-item-1' },
          }),
        }),
      }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'new-id' } }) }) }),
      update: () => ({ eq: () => Promise.resolve({}) }),
    }),
  }),
}));

describe('generateTransId', () => {
  it('generates deterministic trans_id from order UUID', () => {
    const orderId = 'abc-123-def';
    const transId1 = generateTransId(orderId);
    const transId2 = generateTransId(orderId);

    expect(transId1).toBe(`mk-${orderId}`);
    expect(transId1).toBe(transId2);
  });

  it('generates different trans_ids for different orders', () => {
    const id1 = generateTransId('order-1');
    const id2 = generateTransId('order-2');

    expect(id1).not.toBe(id2);
  });
});

describe('generateInvoiceNo', () => {
  it('generates invoice number from order number', () => {
    const invoiceNo = generateInvoiceNo('MK-001');
    expect(invoiceNo).toBe('MK-MK-001');
  });

  it('generates unique invoice numbers', () => {
    const inv1 = generateInvoiceNo('001');
    const inv2 = generateInvoiceNo('002');

    expect(inv1).not.toBe(inv2);
  });
});
