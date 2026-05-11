# Bot Deployment Guide

This guide covers deploying and configuring the Mad Krapow ordering bots for Telegram and WhatsApp.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Telegram Bot Deployment](#telegram-bot-deployment)
4. [WhatsApp Bot Deployment](#whatsapp-bot-deployment)
5. [Webhook Setup](#webhook-setup)
6. [Verification and Testing](#verification-and-testing)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying either bot, ensure the following are in place:

1. **Deployed Next.js application** with a public HTTPS URL (e.g., Vercel, Railway, or a custom server).
2. **Supabase project** with the `bot_sessions`, `customers`, `orders`, `order_items`, and `order_item_modifiers` tables.
3. **Stripe account** with Checkout Sessions enabled.
4. **Google Maps API key** with the Geocoding API enabled (for address validation).
5. **Store settings** configured in the `store_settings` table, including:
   - `bots_enabled` (JSONB with `telegram` and `whatsapp` booleans)
   - `operating_hours` (JSONB with daily open/close times)
   - `delivery_fee` (integer, cents)

---

## Environment Variables

Add the following variables to your deployment platform (Vercel, Railway, etc.) or `.env.local` for local development.

### Core (Required)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# App URL
NEXT_PUBLIC_URL=https://your-domain.com

# Google Maps (for geocoding)
NEXT_PUBLIC_GOOGLE_MAPS_KEY=AIza...

# Store location (for delivery zone checks)
STORE_LATITUDE=3.0738
STORE_LONGITUDE=101.5183
STORE_ADDRESS=123 Jalan Universiti, Shah Alam
STORE_CITY=Shah Alam
STORE_PHONE=+60123456789
```

### Telegram (Required for Telegram Bot)

```bash
TELEGRAM_BOT_TOKEN=bot123456789:ABCdefGHIjklMNOpqrSTUvwxyz
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret-here  # optional but recommended
```

### WhatsApp (Required for WhatsApp Bot)

```bash
WHATSAPP_ACCESS_TOKEN=EAA...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=your-verify-token-here
```

---

## Telegram Bot Deployment

### Step 1: Create a Bot with BotFather

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts to choose a name and username.
3. BotFather will give you a token that looks like `bot123456789:ABCdef...`.
4. Save this token as `TELEGRAM_BOT_TOKEN`.

### Step 2: Set the Webhook URL

Use `curl` or any HTTP client to register your webhook with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/api/bots/telegram/webhook",
    "secret_token": "your-webhook-secret-here"
  }'
```

**Parameters:**
- `url` — Must be HTTPS. Must point to `/api/bots/telegram/webhook` on your deployed app.
- `secret_token` — Optional but strongly recommended. Must match `TELEGRAM_WEBHOOK_SECRET`.

### Step 3: Verify Webhook Registration

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

You should see a response like:

```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/api/bots/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "max_connections": 40,
    "ip_address": "1.2.3.4"
  }
}
```

### Step 4: Test the Bot

1. Open Telegram and find your bot.
2. Send `/start`.
3. You should receive a welcome message with inline buttons.
4. Try `/menu` to browse categories.

### Step 5: Remove the Webhook (if needed)

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/deleteWebhook"
```

---

## WhatsApp Bot Deployment

### Step 1: Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com) and create a new app.
2. Select **Business** as the app type.
3. Add the **WhatsApp** product to your app.
4. Connect a WhatsApp Business Account.
5. Note the **Phone Number ID** and **Access Token**.

### Step 2: Configure Environment Variables

Set these in your deployment platform:

```bash
WHATSAPP_ACCESS_TOKEN=EAA...        # From Meta Developer Dashboard
WHATSAPP_PHONE_NUMBER_ID=123...    # From WhatsApp product settings
WHATSAPP_VERIFY_TOKEN=any-string    # Choose any string you will remember
```

### Step 3: Register the Webhook URL

1. In the Meta Developer Dashboard, go to your app.
2. Navigate to **WhatsApp > Configuration**.
3. Under **Webhooks**, click **Edit**.
4. Enter your callback URL:
   ```
   https://your-domain.com/api/bots/whatsapp/webhook
   ```
5. Enter your **Verify Token** (must match `WHATSAPP_VERIFY_TOKEN`).
6. Click **Verify and Save**. Meta will send a GET request to your endpoint with a challenge.
7. Subscribe to the `messages` field so your webhook receives message events.

### Step 4: Verify the Phone Number

If you are using a test number provided by Meta, no additional verification is needed. For a production business phone number:

1. Go to **WhatsApp > Getting Started** in the Meta Dashboard.
2. Follow the verification steps for your business phone number.
3. Ensure the number is not already registered with the WhatsApp consumer app.

### Step 5: Test the Bot

1. Send a WhatsApp message to your configured phone number.
2. Send "hi" or "menu".
3. You should receive a welcome message with an interactive list of categories.

---

## Webhook Setup Summary

| Platform | Webhook URL | Verification Method | Security |
|----------|-------------|---------------------|----------|
| Telegram | `https://your-domain.com/api/bots/telegram/webhook` | `setWebhook` API call | Optional `secret_token` header |
| WhatsApp | `https://your-domain.com/api/bots/whatsapp/webhook` | Meta dashboard challenge | `verify_token` query param |

### Important Notes

- **HTTPS is mandatory** for both platforms. Localhost will not work for webhooks.
- **Do not expose your tokens** in client-side code or public repositories.
- **Use environment variables** for all secrets.
- **The webhook handlers return 200 OK** even on errors to prevent platform retry loops. Check server logs for actual errors.

---

## Verification and Testing

### Health Check

After deployment, verify that your app is running:

```bash
curl https://your-domain.com/api/bots/telegram/webhook \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"update_id":1}'
```

Expected: `{"success":true}` (the empty update is ignored gracefully).

```bash
curl "https://your-domain.com/api/bots/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

Expected: `test123` in the response body.

### End-to-End Test (Telegram)

1. Send `/start` to your bot.
2. Tap "Browse Menu".
3. Select a category.
4. Select an item.
5. If modifiers appear, select options.
6. Tap "View Cart".
7. Tap "Proceed to Checkout".
8. Send a valid Shah Alam address.
9. Send name and phone number.
10. Tap "Confirm & Pay".
11. Click the Stripe payment link and complete a test payment.
12. Verify the order appears in your admin dashboard.

### End-to-End Test (WhatsApp)

1. Send "hi" to your WhatsApp number.
2. Select a category from the list.
3. Select an item.
4. If modifiers appear, select options (buttons or list).
5. Tap "Checkout" from the cart.
6. Send a valid Shah Alam address.
7. Send name and phone number (two lines).
8. Tap "Confirm & Pay".
9. Complete the Stripe payment.
10. Verify the order in your admin dashboard.

---

## Troubleshooting

### Telegram: No Response to Messages

1. Check `getWebhookInfo` — is the URL correct? Is there a high `pending_update_count`?
2. Check server logs for errors in `/api/bots/telegram/webhook`.
3. Verify `TELEGRAM_BOT_TOKEN` is set correctly.
4. If using `TELEGRAM_WEBHOOK_SECRET`, verify the header is being sent by Telegram.
5. Ensure your deployment is not returning 404 for the webhook path.

### WhatsApp: Webhook Verification Fails

1. Ensure the callback URL is HTTPS and publicly accessible.
2. Verify `WHATSAPP_VERIFY_TOKEN` matches exactly what you entered in the Meta dashboard.
3. Check that the GET handler at `/api/bots/whatsapp/webhook` is returning the challenge string.
4. Meta may take a few minutes to propagate webhook changes.

### WhatsApp: Messages Not Received

1. In the Meta dashboard, ensure you have subscribed to the `messages` webhook field.
2. Check server logs for POST requests to `/api/bots/whatsapp/webhook`.
3. Verify `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are correct.
4. Ensure the sending phone number is not blocked or restricted.

### Checkout Fails with "Store Closed"

1. Check `store_settings.operating_hours` in Supabase.
2. The bot checks the current day and time against these hours.
3. You can temporarily bypass by adjusting the hours or testing at a different time.

### Address Validation Fails

1. Ensure `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is set and the Geocoding API is enabled.
2. The address must include a recognizable street, city (Shah Alam), state (Selangor), and postal code.
3. Check server logs for geocoding errors.

### Stripe Checkout URL Not Generated

1. Verify `STRIPE_SECRET_KEY` is set and starts with `sk_`.
2. Check Stripe Dashboard for failed session creation attempts.
3. Ensure `NEXT_PUBLIC_URL` is a valid HTTPS URL (Stripe requires this for success/cancel URLs).

### Session Resets Unexpectedly

1. Sessions expire after **30 minutes** of inactivity. This is expected behavior.
2. Check `bot_sessions.last_interaction_at` to see when the user last interacted.

---

## Local Development

For local testing, you can use a tunneling service like **ngrok** to expose your local server:

```bash
# Start your Next.js dev server
npm run dev

# In another terminal, expose port 3000
npx ngrok http 3000
```

Use the ngrok HTTPS URL as your webhook URL:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d '{"url":"https://your-ngrok-url.ngrok.io/api/bots/telegram/webhook"}'
```

For WhatsApp, update the callback URL in the Meta Developer Dashboard to your ngrok URL.

**Note:** ngrok URLs change every time you restart ngrok (unless you have a paid plan with a static domain). You will need to update the webhook URL each time.

---

## Production Checklist

Before going live, verify the following:

- [ ] `NEXT_PUBLIC_URL` points to your production domain (HTTPS).
- [ ] `STRIPE_SECRET_KEY` is a live key (starts with `sk_live_`).
- [ ] `TELEGRAM_BOT_TOKEN` is the production bot token.
- [ ] `WHATSAPP_ACCESS_TOKEN` is a long-lived token (not a temporary test token).
- [ ] `WHATSAPP_PHONE_NUMBER_ID` is a verified business number.
- [ ] `TELEGRAM_WEBHOOK_SECRET` and `WHATSAPP_VERIFY_TOKEN` are strong, random strings.
- [ ] Webhook URLs are registered with the correct production domain.
- [ ] Store settings (`bots_enabled`, `operating_hours`, `delivery_fee`) are configured.
- [ ] Menu items and modifiers are marked as `is_available = true`.
- [ ] Supabase RLS policies allow the service role to read/write `bot_sessions`, `orders`, and related tables.
- [ ] Error monitoring (Sentry) is configured if desired.

---

## Related Files

- `docs/bot-conversation-flows.md` — Detailed conversation flow documentation
- `docs/bot-api-reference.md` — API endpoint reference and schemas
- `apps/web/src/app/api/bots/telegram/webhook/route.ts` — Telegram webhook handler
- `apps/web/src/app/api/bots/whatsapp/webhook/route.ts` — WhatsApp webhook handler
- `apps/web/src/app/api/bots/checkout/route.ts` — Shared checkout API
- `apps/web/src/lib/validators/env.ts` — Environment variable schema
