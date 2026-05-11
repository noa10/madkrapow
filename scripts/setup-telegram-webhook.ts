// Usage: npx ts-node scripts/setup-telegram-webhook.ts <webhook-url>
// Example: npx ts-node scripts/setup-telegram-webhook.ts https://example.com/api/bots/telegram/webhook

import { env } from "../apps/web/src/lib/validators/env";

async function main() {
  const webhookUrl = process.argv[2];
  if (!webhookUrl) {
    console.error("Usage: npx ts-node scripts/setup-telegram-webhook.ts <webhook-url>");
    process.exit(1);
  }

  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("Error: TELEGRAM_BOT_TOKEN not set in environment");
    process.exit(1);
  }

  const secret = env.TELEGRAM_WEBHOOK_SECRET;

  const body: Record<string, string> = {
    url: webhookUrl,
  };
  if (secret) {
    body.secret_token = secret;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  if (result.ok) {
    console.log("✅ Telegram webhook set successfully");
    console.log("URL:", webhookUrl);
    if (secret) console.log("Secret token: configured");
  } else {
    console.error("❌ Failed to set webhook:", result.description);
    process.exit(1);
  }
}

main();