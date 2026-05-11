# Bot API Reference

This document describes the API endpoints used by the Mad Krapow ordering bots. These endpoints are consumed internally by the Telegram and WhatsApp webhook handlers, but they are also useful for integration testing and debugging.

## Table of Contents

1. [Checkout API](#checkout-api)
2. [Telegram Webhook](#telegram-webhook)
3. [WhatsApp Webhook](#whatsapp-webhook)
4. [Environment Variables](#environment-variables)

---

## Checkout API

### `POST /api/bots/checkout`

Creates an order from a bot session, validates all prices from the database, and generates a Stripe Checkout Session URL.

**Authentication:** None (internal use only). This endpoint is called server-to-server by the webhook handlers.

**Content-Type:** `application/json`

---

### Request Schema

```typescript
interface BotCheckoutRequest {
  platform: 'telegram' | 'whatsapp'
  platformUserId: string
  items: BotCheckoutItem[]
  deliveryAddress: BotDeliveryAddress
  contactName: string
  contactPhone: string
  deliveryType: 'delivery' | 'self_pickup'
  sessionId: string // UUID of the bot session
}

interface BotCheckoutItem {
  menuItemId: string
  quantity: number // integer, min 1
  modifiers: BotCheckoutModifier[]
}

interface BotCheckoutModifier {
  modifierId: string
}

interface BotDeliveryAddress {
  address_line1: string
  address_line2?: string
  city: string
  state: string
  postal_code: string
  latitude?: number
  longitude?: number
}
```

### Request Validation (Zod)

| Field | Rules |
|-------|-------|
| `platform` | Required. Enum: `telegram`, `whatsapp`. |
| `platformUserId` | Required. Non-empty string. |
| `items` | Required. Non-empty array. Each item must have `menuItemId` (non-empty string) and `quantity` (integer >= 1). |
| `items[].modifiers` | Optional array. Each modifier must have `modifierId` (non-empty string). |
| `deliveryAddress` | Required. Must include `address_line1`, `city`, `state`, `postal_code`. Optional `address_line2`, `latitude`, `longitude`. |
| `contactName` | Required. Non-empty string. |
| `contactPhone` | Required. Non-empty string. |
| `deliveryType` | Optional. Defaults to `delivery`. Enum: `delivery`, `self_pickup`. |
| `sessionId` | Required. Valid UUID string. |

### Example Request

```json
{
  "platform": "telegram",
  "platformUserId": "123456789",
  "items": [
    {
      "menuItemId": "550e8400-e29b-41d4-a716-446655440000",
      "quantity": 2,
      "modifiers": [
        { "modifierId": "mod-123" },
        { "modifierId": "mod-456" }
      ]
    }
  ],
  "deliveryAddress": {
    "address_line1": "123 Jalan Universiti",
    "address_line2": "Block A",
    "city": "Shah Alam",
    "state": "Selangor",
    "postal_code": "40150",
    "latitude": 3.0738,
    "longitude": 101.5183
  },
  "contactName": "Ahmad bin Abdullah",
  "contactPhone": "+60123456789",
  "deliveryType": "delivery",
  "sessionId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
}
```

---

### Response Schema

#### Success (200 OK)

```typescript
interface BotCheckoutSuccess {
  success: true
  checkoutUrl: string // Stripe Checkout Session URL
  orderId: string   // UUID of the created order
  orderNumber: string // Human-readable order number (e.g., MK1A2B3C4D5)
}
```

#### Error (400 / 500)

```typescript
interface BotCheckoutError {
  success: false
  error: string // Human-readable error message
  code?: string  // Machine-readable error code
}
```

### Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `INVALID_JSON` | 400 | Request body is not valid JSON. |
| `INVALID_REQUEST` | 400 | Request failed Zod schema validation. Details are in the `error` field. |
| `BOT_DISABLED` | 400 | Ordering via this platform is currently disabled in store settings. |
| `STORE_CLOSED` | 400 | The store is currently closed based on operating hours. |
| `OUTSIDE_ZONE` | 400 | Delivery address is outside the configured delivery zone. |
| `ITEM_UNAVAILABLE` | 400 | One or more requested items are no longer available. |
| `MODIFIER_UNAVAILABLE` | 400 | One or more requested modifiers are no longer available. |
| `INVALID_SESSION` | 400 | The provided `sessionId` does not exist or has expired. |
| `PRICE_VALIDATION_FAILED` | 500 | Failed to fetch menu items from the database for price validation. |
| `ORDER_FAILED` | 500 | Failed to insert the order record into the database. |
| `ITEMS_FAILED` | 500 | Failed to insert order items. The order is rolled back. |
| `SESSION_FAILED` | 500 | Stripe Checkout Session was created but returned no URL. The order is rolled back. |
| `CHECKOUT_FAILED` | 500 | Generic checkout failure (Stripe error, database error, or unexpected exception). |

### Example Success Response

```json
{
  "success": true,
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_a1b2c3...",
  "orderId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "orderNumber": "MK1A2B3C4D5"
}
```

### Example Error Response

```json
{
  "success": false,
  "error": "We are currently closed. Our hours today are 10:00 - 22:00.",
  "code": "STORE_CLOSED"
}
```

---

### Checkout Flow Internals

When the checkout endpoint receives a valid request, it performs the following steps in order:

1. **Parse and validate** the request body with Zod.
2. **Check bot settings** — verify the platform is enabled and the store is open.
3. **Validate delivery address** — for delivery orders, geocode if needed and check the delivery zone.
4. **Fetch store settings** — delivery fee, kitchen lead time, cutlery defaults.
5. **Validate all prices from the database** — fetch every `menu_item` and `modifier` by ID, verify they exist and are available, and recalculate the subtotal. Client-sent prices are ignored.
6. **Find or create the customer** — using `findOrCreateBotCustomer` in the `customers` table.
7. **Validate the session** — confirm the `sessionId` exists in `bot_sessions`.
8. **Generate an order number** — format: `MK` + base36 timestamp + 4-char random suffix.
9. **Create the order** — insert into `orders` with status `pending`.
10. **Create order items** — insert into `order_items` with validated names and prices.
11. **Create order item modifiers** — insert into `order_item_modifiers`.
12. **Create a Stripe Checkout Session** — line items include each menu item (with modifier suffix in the name), plus a delivery fee line item if applicable.
13. **Update the order** with the Stripe session ID.
14. **Clear the bot session** — reset cart, address, contact, and state to `idle`.
15. **Return** the Stripe Checkout URL, order ID, and order number.

If any step fails after the order is created, the order and its items are rolled back (deleted) to avoid orphaned records.

---

## Telegram Webhook

### `POST /api/bots/telegram/webhook`

Receives updates from the Telegram Bot API. This endpoint must be registered as the bot's webhook URL via the Telegram Bot API.

**Security:** If `TELEGRAM_WEBHOOK_SECRET` is configured, the handler validates the `x-telegram-bot-api-secret-token` request header. Mismatches return HTTP 401.

**Content-Type:** `application/json`

### Request Body (Telegram Update)

The endpoint accepts a standard [Telegram Update](https://core.telegram.org/bots/api#update) object. The handler only processes `message` and `callback_query` updates.

```typescript
interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
  entities?: Array<{ type: string; offset: number; length: number }>
}

interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: {
    message_id: number
    chat: TelegramChat
  }
  data?: string
}

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramChat {
  id: number
  type: string
}
```

### Response

The endpoint always returns HTTP 200 with a JSON body:

```json
{ "success": true }
```

Even on errors, the handler returns HTTP 200 to prevent Telegram from retrying. Errors are logged server-side.

### Supported Commands (Text Messages)

| Command | Handler |
|---------|---------|
| `/start` | Show welcome message and inline keyboard. |
| `/menu` | Show menu categories. |
| `/cart` | Show cart with quantity controls. |
| `/status` | Show last 3 orders. |
| `/help` | Show command list. |
| `/cancel` | Clear session. |

### Supported Callback Actions

See [bot-conversation-flows.md](bot-conversation-flows.md) for the full callback data format reference.

### State-Based Text Handling

When the user sends free-form text (not a command), the bot interprets it based on the session state:

| State | Behavior |
|-------|----------|
| `entering_address` | Parse as delivery address, validate, geocode, check zone. |
| `entering_contact` | Parse as name and phone number. |
| All other states | Show fallback message directing to `/menu` or `/help`. |

---

## WhatsApp Webhook

### `GET /api/bots/whatsapp/webhook`

Handles Meta's webhook verification challenge. This is required when registering the webhook URL in the Meta Developer Dashboard.

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `hub.mode` | Must be `subscribe`. |
| `hub.verify_token` | Must match `WHATSAPP_VERIFY_TOKEN`. |
| `hub.challenge` | Echoed back in the response body on success. |

**Response:**
- **200 OK** — Returns the challenge string if verification succeeds.
- **403 Forbidden** — Returns `Verification failed` if the token does not match.

### `POST /api/bots/whatsapp/webhook`

Receives message events from the WhatsApp Cloud API.

**Content-Type:** `application/json`

### Request Body (WhatsApp Payload)

```typescript
interface WhatsAppPayload {
  object: string
  entry: WhatsAppEntry[]
}

interface WhatsAppEntry {
  id: string
  changes: WhatsAppChange[]
}

interface WhatsAppChange {
  value: WhatsAppValue
  field: string
}

interface WhatsAppValue {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  contacts?: WhatsAppContact[]
  messages?: WhatsAppMessage[]
}

interface WhatsAppContact {
  profile: { name: string }
  wa_id: string
}

interface WhatsAppMessage {
  from: string
  id: string
  type: 'text' | 'interactive'
  text?: { body: string }
  interactive?: {
    type: 'list_reply' | 'button_reply'
    list_reply?: { id: string; title: string }
    button_reply?: { id: string; title: string }
  }
}
```

### Response

The endpoint always returns HTTP 200:

```json
{ "status": "ok" }
```

Errors are logged server-side. The endpoint does not cryptographically verify the payload signature.

### Supported Text Keywords

| Keyword | Action |
|---------|--------|
| `hi`, `hello`, `menu` | Clear session and show welcome menu. |
| `cart` | Show current cart. |
| `status` | Show last 3 orders. |
| `cancel` | Clear session. |

### Supported Interactive Reply IDs

See [bot-conversation-flows.md](bot-conversation-flows.md) for the full WhatsApp reply ID format reference.

### State-Based Text Handling

| State | Behavior |
|-------|----------|
| `entering_address` | Parse as delivery address. |
| `entering_contact` | Parse as name (line 1) and phone (line 2). |
| `confirming_order` | `yes` or `confirm` triggers checkout. Anything else shows a prompt to tap the button. |
| `awaiting_payment` | Remind user to complete payment or start a new order. |
| All other states | Show fallback message with keyword hints. |

---

## Environment Variables

The following environment variables are required or optional for the bot system.

### Required for Both Bots

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for server-side DB access). | `eyJ...` |
| `NEXT_PUBLIC_URL` | Public base URL of the deployed app. Used for Stripe success/cancel URLs and checkout API calls. | `https://madkrapow.com` |
| `STRIPE_SECRET_KEY` | Stripe secret key (starts with `sk_`). Used to create Checkout Sessions. | `sk_test_...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (starts with `pk_`). | `pk_test_...` |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Google Maps API key (starts with `AIza`). Used for address geocoding. | `AIza...` |
| `STORE_LATITUDE` | Store latitude for delivery zone checks. | `3.0738` |
| `STORE_LONGITUDE` | Store longitude for delivery zone checks. | `101.5183` |
| `STORE_ADDRESS` | Store address string. | `123 Jalan Universiti, Shah Alam` |
| `STORE_CITY` | Store city. | `Shah Alam` |
| `STORE_PHONE` | Store phone (must start with `+60`). | `+60123456789` |

### Telegram-Specific

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from @BotFather (starts with `bot`). | `bot123456:ABC-DEF...` |
| `TELEGRAM_WEBHOOK_SECRET` | No | Optional secret token for webhook validation. | `my-secret-token-123` |
| `TELEGRAM_KITCHEN_GROUP_CHAT_ID` | No | Chat ID for kitchen notifications (not currently used in webhook handler). | `-1001234567890` |

### WhatsApp-Specific

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Yes | Meta WhatsApp Cloud API access token. | `EAA...` |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | WhatsApp Business Account phone number ID. | `123456789012345` |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Token for webhook verification challenge. | `my-verify-token-456` |

### Optional / Shared

| Variable | Description | Default |
|----------|-------------|---------|
| `LALAMOVE_ENABLED` | Enable Lalamove delivery auto-dispatch. | `true` |
| `LALAMOVE_API_KEY` | Lalamove API key. | — |
| `LALAMOVE_API_SECRET` | Lalamove API secret. | — |
| `LALAMOVE_ENV` | Lalamove environment. | `sandbox` |
| `LALAMOVE_MARKET` | Lalamove market code. | `MY` |
| `LALAMOVE_CITY_NAME` | Lalamove city name. | `Shah Alam` |
| `LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE` | Default service type for standard orders. | `MOTORCYCLE` |
| `LALAMOVE_DEFAULT_BULK_SERVICE_TYPE` | Default service type for bulk orders. | `CAR` |
| `SENTRY_DSN` | Sentry DSN for error tracking. | — |
| `RESEND_API_KEY` | Resend API key for email notifications. | — |
| `CRON_SECRET` | Secret token for cron job endpoints. | — |

---

## Testing the Checkout API

You can test the checkout endpoint directly with `curl`:

```bash
curl -X POST https://your-domain.com/api/bots/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "telegram",
    "platformUserId": "test-user-123",
    "items": [
      {
        "menuItemId": "your-menu-item-uuid",
        "quantity": 1,
        "modifiers": []
      }
    ],
    "deliveryAddress": {
      "address_line1": "123 Test Street",
      "city": "Shah Alam",
      "state": "Selangor",
      "postal_code": "40150"
    },
    "contactName": "Test User",
    "contactPhone": "+60123456789",
    "deliveryType": "delivery",
    "sessionId": "your-session-uuid"
  }'
```

**Prerequisites for testing:**
1. A valid bot session must exist in the `bot_sessions` table with the given `sessionId`.
2. The menu item UUID must exist in the `menu_items` table and be marked as available.
3. Stripe keys must be configured.
4. The store must be open based on operating hours.

---

## Related Files

- `apps/web/src/app/api/bots/checkout/route.ts` — Checkout API implementation
- `apps/web/src/app/api/bots/telegram/webhook/route.ts` — Telegram webhook handler
- `apps/web/src/app/api/bots/whatsapp/webhook/route.ts` — WhatsApp webhook handler
- `apps/web/src/lib/bots/conversation.ts` — Session and cart management
- `apps/web/src/lib/validators/env.ts` — Environment variable schema
