import { NextResponse } from "next/server";
import { env } from "@/lib/validators/env";

export async function GET() {
  const telegram = !!env.TELEGRAM_BOT_TOKEN;
  const whatsapp = !!(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  return NextResponse.json({ telegram, whatsapp });
}