import { describe, it, expect } from 'vitest'
import type { Database, Json } from '@/types/database.types'

/**
 * Type-level tests to verify the generated database types
 * match our expected schema for lalamove_shipments and lalamove_webhook_events.
 *
 * These tests verify that the TypeScript types compile correctly
 * and have the expected shape by constructing valid type instances.
 */

describe('database.types - lalamove_shipments', () => {
  type ShipmentRow = Database['public']['Tables']['lalamove_shipments']['Row']
  type ShipmentInsert = Database['public']['Tables']['lalamove_shipments']['Insert']
  type ShipmentUpdate = Database['public']['Tables']['lalamove_shipments']['Update']

  it('Row type has expected fields', () => {
    // Verify the type compiles with expected field access
    function checkRow(row: ShipmentRow) {
      // Required string fields
      const _id: string = row.id
      const _orderId: string = row.order_id
      const _quotationId: string = row.quotation_id
      const _serviceType: string = row.service_type
      const _dispatchStatus: string = row.dispatch_status
      const _currency: string = row.currency

      // Required number fields
      const _quotedFee: number = row.quoted_fee_cents

      // Required timestamp fields
      const _createdAt: string = row.created_at
      const _updatedAt: string = row.updated_at

      // Nullable fields
      const _lalamoveOrderId: string | null = row.lalamove_order_id
      const _shareLink: string | null = row.share_link
      const _actualFee: number | null = row.actual_fee_cents
      const _driverName: string | null = row.driver_name
      const _driverPhone: string | null = row.driver_phone
      const _driverPlate: string | null = row.driver_plate
      const _driverPhotoUrl: string | null = row.driver_photo_url
      const _driverLat: number | null = row.driver_latitude
      const _driverLng: number | null = row.driver_longitude
      const _quoteExpiresAt: string | null = row.quote_expires_at
      const _scheduleAt: string | null = row.schedule_at
      const _dispatchedAt: string | null = row.dispatched_at
      const _completedAt: string | null = row.completed_at
      const _cancelledAt: string | null = row.cancelled_at
      const _cancellationReason: string | null = row.cancellation_reason

      // JSONB fields
      const _senderJson: unknown = row.sender_json
      const _recipientJson: unknown = row.recipient_json
      const _stopIds: unknown = row.stop_ids
      const _rawOrderResponse: unknown = row.raw_order_response
      const _rawWebhookPayload: unknown = row.raw_webhook_payload

      return [_id, _orderId, _quotationId, _serviceType, _dispatchStatus,
        _currency, _quotedFee, _createdAt, _updatedAt, _lalamoveOrderId,
        _shareLink, _actualFee, _driverName, _driverPhone, _driverPlate,
        _driverPhotoUrl, _driverLat, _driverLng, _quoteExpiresAt, _scheduleAt,
        _dispatchedAt, _completedAt, _cancelledAt, _cancellationReason,
        _senderJson, _recipientJson, _stopIds, _rawOrderResponse, _rawWebhookPayload]
    }

    expect(checkRow).toBeDefined()
  })

  it('Insert type requires minimum fields', () => {
    // Minimum required fields for insert
    const insert: ShipmentInsert = {
      order_id: 'uuid',
      quotation_id: '123',
      service_type: 'MOTORCYCLE',
      quoted_fee_cents: 500,
      sender_json: {} as Json,
      recipient_json: {} as Json,
    }

    expect(insert.order_id).toBe('uuid')
    expect(insert.quotation_id).toBe('123')
    expect(insert.quoted_fee_cents).toBe(500)
  })

  it('Update type allows partial updates', () => {
    const update: ShipmentUpdate = {
      dispatch_status: 'delivered',
      actual_fee_cents: 600,
      completed_at: '2026-01-01T00:00:00Z',
    }

    expect(update.dispatch_status).toBe('delivered')
    expect(update.actual_fee_cents).toBe(600)
  })
})

describe('database.types - lalamove_webhook_events', () => {
  type WebhookEventRow = Database['public']['Tables']['lalamove_webhook_events']['Row']
  type WebhookEventInsert = Database['public']['Tables']['lalamove_webhook_events']['Insert']

  it('Row type has expected fields', () => {
    function checkRow(row: WebhookEventRow) {
      const _id: string = row.id
      const _lalamoveOrderId: string = row.lalamove_order_id
      const _eventType: string = row.event_type
      const _processed: boolean = row.processed
      const _createdAt: string = row.created_at

      // Nullable fields
      const _eventStatus: string | null = row.event_status
      const _signature: string | null = row.signature
      const _processingError: string | null = row.processing_error

      // JSONB
      const _rawPayload: unknown = row.raw_payload

      return [_id, _lalamoveOrderId, _eventType, _processed, _createdAt,
        _eventStatus, _signature, _processingError, _rawPayload]
    }

    expect(checkRow).toBeDefined()
  })

  it('Insert type requires minimum fields', () => {
    const insert: WebhookEventInsert = {
      lalamove_order_id: '123',
      event_type: 'ORDER_STATUS_CHANGED',
      raw_payload: { data: 'test' },
    }

    expect(insert.lalamove_order_id).toBe('123')
    expect(insert.event_type).toBe('ORDER_STATUS_CHANGED')
  })
})

describe('database.types - orders (extended dispatch_status)', () => {
  type OrderRow = Database['public']['Tables']['orders']['Row']

  it('Row type has dispatch_status field', () => {
    function checkRow(row: OrderRow) {
      const _dispatchStatus: string | null = row.dispatch_status
      const _lalamoveQuoteId: string | null = row.lalamove_quote_id
      const _lalamoveOrderId: string | null = row.lalamove_order_id
      return [_dispatchStatus, _lalamoveQuoteId, _lalamoveOrderId]
    }

    expect(checkRow).toBeDefined()
  })
})
