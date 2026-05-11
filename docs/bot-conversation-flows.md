# Bot Conversation Flows

This document describes the complete conversation flows for the Mad Krapow ordering bots on Telegram and WhatsApp. It covers the state machine, step-by-step user journeys, error handling, and message formats.

## Table of Contents

1. [Conversation State Machine](#conversation-state-machine)
2. [Telegram Ordering Flow](#telegram-ordering-flow)
3. [WhatsApp Ordering Flow](#whatsapp-ordering-flow)
4. [Error Handling and Edge Cases](#error-handling-and-edge-cases)
5. [Telegram Callback Data Format](#telegram-callback-data-format)
6. [WhatsApp Interactive Message Types](#whatsapp-interactive-message-types)

---

## Conversation State Machine

Both bots share a single state machine defined in `apps/web/src/lib/bots/conversation.ts`. The state is stored per user in the `bot_sessions` Supabase table.

### States

| State | Description |
|-------|-------------|
| `idle` | User has not started an order. Default state for new sessions. |
| `browsing_menu` | User is viewing menu categories or item lists. |
| `selecting_modifiers` | User is choosing modifiers (options) for a selected item. |
| `viewing_cart` | User is reviewing cart contents and can adjust quantities. |
| `entering_address` | Bot is waiting for the user to send a delivery address. |
| `entering_contact` | Bot is waiting for the user to send name and phone number. |
| `confirming_order` | User is reviewing the full order summary before payment. |
| `awaiting_payment` | Order created. User must complete payment via Stripe link. |
| `complete` | Order fully paid and confirmed. Session can be reset. |

### Valid State Transitions

```
idle
  -> browsing_menu, viewing_cart, entering_address, entering_contact

browsing_menu
  -> idle, selecting_modifiers, viewing_cart

selecting_modifiers
  -> browsing_menu, viewing_cart

viewing_cart
  -> browsing_menu, entering_address, idle

entering_address
  -> entering_contact, viewing_cart

entering_contact
  -> confirming_order, entering_address, viewing_cart

confirming_order
  -> awaiting_payment, viewing_cart, entering_contact

awaiting_payment
  -> complete, viewing_cart

complete
  -> idle
```

Invalid transitions throw an error and are logged. The session timeout is **30 minutes** of inactivity, after which the session resets to `idle` with an empty cart.

---

## Telegram Ordering Flow

### Entry Points

Users can start ordering at any time by sending these commands:

| Command | Action |
|---------|--------|
| `/start` | Shows welcome message with inline buttons. Sets state to `browsing_menu`. |
| `/menu` | Shows menu categories. Sets state to `browsing_menu`. |
| `/cart` | Shows current cart. Sets state to `viewing_cart`. |
| `/status` | Shows last 3 orders for this customer. |
| `/help` | Shows available commands. |
| `/cancel` | Clears the session (cart, address, contact) and resets to `idle`. |

### Step-by-Step Flow

#### 1. Welcome / Start

User sends `/start`.

**Bot responds:**
```
Welcome to Mad Krapow, {first_name}! 🍽️

Order delicious food directly from this chat. Use the buttons below or type /menu to browse.
```

**Inline keyboard:**
- 📋 Browse Menu (`callback_data: menu`)
- 🛒 View Cart (`callback_data: cart`)
- ❓ Help (`callback_data: help`)

**State:** `browsing_menu`

---

#### 2. Browse Menu Categories

User taps "Browse Menu" or sends `/menu`.

**Bot responds:**
```
*Our Menu*

Select a category:
```

**Inline keyboard:** One button per category, plus 🛒 View Cart at the bottom. Buttons are arranged in 2 columns.

**Callback data format:** `cat:{category_id}`

**State:** `browsing_menu`

---

#### 3. View Items in a Category

User taps a category button.

**Bot responds:** Category name as header, then one button per item showing name and price.

**Inline keyboard:**
- `{item_name} — RM {price}` (`callback_data: item:{item_id}`)
- ⬅️ Back to Categories (`callback_data: menu`)

**State:** `browsing_menu`

---

#### 4. View Item Details

User taps an item.

**Bot responds:** Item name, description, and price. If the item has no modifiers, it shows an "Add to Cart" button. If it has modifiers, the bot transitions to modifier selection.

**No modifiers:**
- 🛒 Add to Cart (`callback_data: add:{item_id}`)
- 📋 Back to Menu (`callback_data: menu`)

**With modifiers:** State becomes `selecting_modifiers`. See Step 5.

---

#### 5. Select Modifiers

For items with modifier groups (e.g., "Spice Level", "Add-ons"), the bot presents each group one at a time.

**Bot responds:**
```
*{item_name}*

*{group_name}* (Required)
Pick 1-2
```

**Inline keyboard:** One button per available modifier:
- `{modifier_name} (+RM {price})` (`callback_data: modsel:{item_id}:{group_index}:{prev_modifiers}:{modifier_id}`)
- ⏭️ Skip (only for optional groups) (`callback_data: modskip:{item_id}:{group_index}:{prev_modifiers}`)
- ❌ Cancel (`callback_data: menu`)

After the last group, the item is added to the cart automatically.

**State:** `selecting_modifiers` → `browsing_menu`

---

#### 6. Add to Cart Confirmation

After adding an item (with or without modifiers):

**Bot responds:**
```
✅ *{item_name}* added to cart (RM {total_price})
```

**Inline keyboard:**
- 📋 Continue Shopping (`callback_data: menu`)
- 🛒 View Cart (`callback_data: cart`)

---

#### 7. View Cart

User taps "View Cart" or sends `/cart`.

**Bot responds:**
```
*Your Cart*

{item_name} (modifier1, modifier2) x2 — RM {line_total}
...

*Total: RM {total}*
```

**Inline keyboard per item:**
- ➖ (`callback_data: dec:{index}`) | `{quantity}` | ➕ (`callback_data: inc:{index}`)
- 🗑️ Remove {item_name} (`callback_data: rem:{index}`)

**Bottom buttons:**
- 📋 Add More Items (`callback_data: menu`)
- 💳 Proceed to Checkout (`callback_data: checkout`)

**State:** `viewing_cart`

---

#### 8. Enter Delivery Address

User taps "Proceed to Checkout" with a non-empty cart.

**Bot responds:**
```
Please send your delivery address. Include:
• Street address
• City (Shah Alam)
• State (Selangor)
• Postal code
```

**State:** `entering_address`

The bot expects free-form text. It parses the address, validates required fields, geocodes it via Google Maps, and checks whether it falls within the delivery zone (Shah Alam). If validation fails, the bot lists the errors and asks again.

---

#### 9. Enter Contact Details

After a valid address is accepted:

**Bot responds:**
```
✅ Address confirmed!

Please send your name and phone number (e.g., *John Doe +60123456789*).
```

**State:** `entering_contact`

The bot extracts the phone number using a regex pattern (`/(?:\+?60|0)[\d\s-]{8,12}/`). The remaining text becomes the name. If no phone is found, the name defaults to the Telegram user's display name.

---

#### 10. Confirm Order

After contact details are captured:

**Bot responds:** Full order summary including items, subtotal, delivery fee, total, address, and contact info.

**Inline keyboard:**
- 🔒 Confirm & Pay (`callback_data: confirm`)
- 🛒 Back to Cart (`callback_data: cart`)
- 📋 Add More Items (`callback_data: menu`)

**State:** `confirming_order`

---

#### 11. Create Order and Payment Link

User taps "Confirm & Pay".

The bot calls the internal checkout API (`POST /api/bots/checkout`), which:
1. Validates all prices against the database (never trusts client-sent prices)
2. Creates an order record in Supabase
3. Creates a Stripe Checkout Session
4. Returns a payment URL

**Bot responds:**
```
✅ Order *#{order_number}* created!

Click the button below to complete payment:
```

**Inline keyboard:**
- 🔒 Pay Now (URL button linking to Stripe Checkout)

**State:** `awaiting_payment`

---

#### 12. Payment Complete

After the user pays via Stripe, the order status updates via the standard Stripe webhook (`/api/webhooks/stripe`). The bot session is cleared during checkout. The user can start a new order with `/start` or `/menu`.

---

## WhatsApp Ordering Flow

### Entry Points

WhatsApp does not use slash commands. Users interact via text keywords and interactive buttons/lists.

| User Input | Action |
|------------|--------|
| `hi`, `hello`, `menu` | Clears session and shows welcome menu. |
| `cart` | Shows current cart. |
| `status` | Shows last 3 orders. |
| `cancel` | Clears session and confirms. |

### Step-by-Step Flow

#### 1. Welcome / Start

User sends "hi" or "menu".

**Bot responds (text):**
```
Welcome to Mad Krapow!
```

**Followed by an interactive list message:**
- Header: "Welcome to Mad Krapow!"
- Body: "Tap a category to browse items."
- Button: "View Categories"
- Sections: Categories with item counts

**List row IDs:** `cat:{category_id}`

**State:** `browsing_menu`

---

#### 2. Browse Category Items

User selects a category from the list.

**Bot responds with an interactive list message:**
- Header: Category name
- Body: "Tap an item to add to your cart."
- Button: "View Items"
- Sections: Items with prices and "(+options)" hint if modifiers exist

**List row IDs:** `item:{item_id}`

---

#### 3. Item Selection

User selects an item.

**No modifiers:** The item is added to the cart immediately. The bot confirms with text, then shows the cart.

**With modifiers:** State becomes `selecting_modifiers`. The bot shows the first modifier group.

---

#### 4. Select Modifiers

**Bot sends text:**
```
*{item_name}*
RM {price}

*{group_name}* (Required)
Pick 1-2
```

**If 3 or fewer modifiers available:** Interactive reply buttons (up to 3)
- Button ID: `mod:{modifier_id}`
- Title: modifier name (max 20 chars)

**If more than 3 modifiers:** Interactive list message
- Rows with modifier name, price delta, and ID `mod:{modifier_id}`

After the final group, the item is added to the cart and the cart is shown automatically.

**State:** `selecting_modifiers` → `viewing_cart`

---

#### 5. View Cart

User sends "cart" or adds an item.

**Bot responds (text):**
```
*Your Cart*

1. {item_name} (modifier1, modifier2)
   2 x RM {unit_price} = RM {line_total}

*Total: RM {total}*
```

**Interactive reply buttons:**
- Add More (`id: cart:add_more`)
- Checkout (`id: cart:checkout`)

**State:** `viewing_cart`

---

#### 6. Enter Delivery Address

User taps "Checkout".

**Bot responds (text):**
```
Please enter your delivery address. Include street, city, state, and postal code.
```

**State:** `entering_address`

Address validation and geocoding work the same as Telegram.

---

#### 7. Enter Contact Details

After address validation passes:

**Bot responds (text):**
```
Great! Now please provide your name and phone number.

Example:
John Doe
+60123456789
```

**State:** `entering_contact`

The WhatsApp parser splits the message by newlines. Line 1 = name, line 2 = phone. If only one line is provided, the phone defaults to the user's WhatsApp number.

---

#### 8. Confirm Order

After contact is captured, the bot shows the order summary.

**Bot responds (text):**
```
*Order Summary*

• {item_name} (modifiers)
  {quantity} x RM {unit_price}

*Total: RM {total}*

*Delivery Address:*
{formatted_address}

*Contact:*
{name}
{phone}
```

**Interactive reply button:**
- Confirm & Pay (`id: confirm:pay`)

**State:** `confirming_order`

---

#### 9. Create Order and Payment Link

User taps "Confirm & Pay".

The bot calls the same checkout API as Telegram. After success:

**Bot responds (text):**
```
Please complete your payment here:

{checkout_url}

Order #{order_number}
```

**State:** `awaiting_payment`

---

## Error Handling and Edge Cases

### Session Timeout

Sessions expire after **30 minutes** of inactivity. On the next interaction, the session is silently reset to `idle` with an empty cart. The user must start over.

### Bot Disabled or Closed

Before processing any message, both bots check:
1. Whether the bot is enabled in `store_settings` (`bots_enabled` JSONB)
2. Whether the store is currently open based on operating hours

If the bot is disabled or the store is closed, the user receives a polite message and no state changes occur.

### Invalid Address

If address parsing or validation fails, the bot lists the specific errors and asks the user to try again. The state remains `entering_address`.

### Out-of-Zone Delivery

If geocoding succeeds but the address is outside the delivery zone (Shah Alam), the bot informs the user and asks for a different address. The state remains `entering_address`.

### Unavailable Items or Modifiers

If an item or modifier becomes unavailable between menu viewing and cart addition, the bot shows a "no longer available" message and returns the user to the menu.

### Empty Cart at Checkout

If the user tries to proceed to checkout with an empty cart, the bot redirects them to the menu.

### Checkout API Failure

If the checkout API returns an error (validation failure, Stripe error, database error), the bot shows the error message to the user and keeps the session in `confirming_order` so they can retry.

### Unexpected Text Input

When the bot is in `browsing_menu`, `selecting_modifiers`, `viewing_cart`, `confirming_order`, `awaiting_payment`, or `complete`, free-form text that is not a recognized command produces a fallback message directing the user to `/menu` or `/help` (Telegram) or "Menu"/"Cart"/"Status" (WhatsApp).

### Webhook Security

**Telegram:** Supports an optional secret token (`TELEGRAM_WEBHOOK_SECRET`). If configured, the webhook handler validates the `x-telegram-bot-api-secret-token` header. Requests with an invalid token return HTTP 401.

**WhatsApp:** Uses Meta's standard webhook verification. The GET handler validates `hub.verify_token` against `WHATSAPP_VERIFY_TOKEN`. The POST handler does not cryptographically verify the payload signature in the current implementation (relies on Meta's infrastructure security).

---

## Telegram Callback Data Format

All Telegram inline keyboard buttons use `callback_data` strings. The format is:

```
{action}:{arg1}:{arg2}:...
```

### Action Reference

| Action | Arguments | Description |
|--------|-----------|-------------|
| `menu` | none | Show menu categories. |
| `cat` | `category_id` | Show items in a category. |
| `item` | `item_id` | Show item details / start modifier flow. |
| `modsel` | `item_id`, `group_index`, `prev_modifiers_csv`, `modifier_id` | Select a modifier. |
| `modskip` | `item_id`, `group_index`, `prev_modifiers_csv` | Skip an optional modifier group. |
| `add` | `item_id`, `[modifier_ids_csv]` | Add item to cart (no modifiers or pre-selected). |
| `cart` | none | Show current cart. |
| `inc` | `cart_index` | Increment quantity of cart item at index. |
| `dec` | `cart_index` | Decrement quantity (removes if quantity reaches 0). |
| `rem` | `cart_index` | Remove item at index from cart. |
| `checkout` | none | Proceed to address entry. |
| `confirm` | none | Call checkout API and create Stripe payment link. |
| `help` | none | Show help text. |
| `cancel` | none | Clear session. |
| `status` | none | Show recent orders. |

### Examples

```
cat:550e8400-e29b-41d4-a716-446655440000
item:6ba7b810-9dad-11d1-80b4-00c04fd430c8
modsel:6ba7b810-9dad-11d1-80b4-00c04fd430c8:0:mod_123,mod_456:mod_789
modskip:6ba7b810-9dad-11d1-80b4-00c04fd430c8:1:mod_123
add:6ba7b810-9dad-11d1-80b4-00c04fd430c8:mod_123,mod_456
inc:0
dec:2
rem:1
checkout
confirm
```

**Note:** The `_` callback data is used as a no-op placeholder for the quantity display button in the cart.

---

## WhatsApp Interactive Message Types

The WhatsApp bot uses three message types from the WhatsApp Cloud API:

### 1. Text Messages

Simple text replies for confirmations, prompts, and error messages. Used for address requests, contact requests, and payment links.

### 2. Interactive List Messages

Used when there are more than 3 options to present (categories, items, or many modifiers).

**Structure:**
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{phone_number}",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "header": { "type": "text", "text": "Header text" },
    "body": { "text": "Body text" },
    "action": {
      "button": "Button label",
      "sections": [
        {
          "title": "Section title",
          "rows": [
            {
              "id": "cat:category_id",
              "title": "Row title (max 24 chars)",
              "description": "Optional description (max 72 chars)"
            }
          ]
        }
      ]
    }
  }
}
```

**Used for:**
- Category browsing (welcome menu)
- Item browsing within a category
- Modifier selection when more than 3 modifiers are available

### 3. Interactive Reply Buttons

Used for up to 3 quick-action buttons (cart actions, confirmation, or small modifier groups).

**Structure:**
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "{phone_number}",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Body text" },
    "action": {
      "buttons": [
        {
          "type": "reply",
          "reply": {
            "id": "cart:checkout",
            "title": "Checkout (max 20 chars)"
          }
        }
      ]
    }
  }
}
```

**Used for:**
- Cart actions ("Add More", "Checkout")
- Order confirmation ("Confirm & Pay")
- Modifier selection when 3 or fewer modifiers are available

### WhatsApp Reply ID Format

| Prefix | Format | Description |
|--------|--------|-------------|
| `cat:` | `cat:{category_id}` | Category selection |
| `item:` | `item:{item_id}` | Item selection |
| `mod:` | `mod:{modifier_id}` | Modifier selection |
| `cart:` | `cart:add_more`, `cart:checkout` | Cart actions |
| `confirm:` | `confirm:pay` | Confirm and pay |

---

## Shared Cart Data Structure

The cart is stored as JSON in `bot_sessions.cart_json`. Both platforms use the same schema.

```typescript
interface CartItem {
  menuItemId: string
  name: string
  priceCents: number
  quantity: number
  modifiers: CartModifier[]
}

interface CartModifier {
  modifierId: string
  name: string
  priceDeltaCents: number
}
```

Prices are always stored and calculated in **cents** (integer) to avoid floating-point errors. Display formatting divides by 100 and shows 2 decimal places with an "RM" prefix.

---

## Related Files

- `apps/web/src/lib/bots/conversation.ts` — State machine, session management, cart operations
- `apps/web/src/lib/bots/telegram.ts` — Telegram message sending and keyboard builders
- `apps/web/src/lib/bots/whatsapp.ts` — WhatsApp Cloud API message sending
- `apps/web/src/app/api/bots/telegram/webhook/route.ts` — Telegram webhook handler
- `apps/web/src/app/api/bots/whatsapp/webhook/route.ts` — WhatsApp webhook handler
- `apps/web/src/app/api/bots/checkout/route.ts` — Shared checkout API
