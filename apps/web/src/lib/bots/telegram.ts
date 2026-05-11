/**
 * Telegram Bot API helpers for sending messages and building keyboards.
 * Uses raw fetch against the Telegram Bot API (not Telegraf webhook adapter)
 * since we're inside a Next.js API route.
 */

import { env } from '@/lib/validators/env'

const TELEGRAM_API_BASE = 'https://api.telegram.org'

function getBotToken(): string {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('[Telegram] TELEGRAM_BOT_TOKEN is not configured')
  }
  return token
}

function apiUrl(method: string): string {
  return `${TELEGRAM_API_BASE}/${getBotToken()}/${method}`
}

export interface InlineKeyboardButton {
  text: string
  callback_data?: string
  url?: string
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}

export interface ReplyKeyboardButton {
  text: string
}

export interface ReplyKeyboardMarkup {
  keyboard: ReplyKeyboardButton[][]
  resize_keyboard?: boolean
  one_time_keyboard?: boolean
}

export interface SendMessageOptions {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML'
  reply_markup?: InlineKeyboardMarkup | ReplyKeyboardMarkup
  disable_web_page_preview?: boolean
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {}
): Promise<unknown> {
  const url = apiUrl('sendMessage')

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    ...options,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[Telegram] sendMessage failed (${response.status}):`, errorBody)
    throw new Error(`Telegram sendMessage failed: ${response.status}`)
  }

  return response.json()
}

export async function sendTelegramPhoto(
  chatId: number | string,
  photoUrl: string,
  caption?: string,
  options: SendMessageOptions = {}
): Promise<unknown> {
  const url = apiUrl('sendPhoto')

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    photo: photoUrl,
    ...options,
  }

  if (caption) {
    payload.caption = caption
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[Telegram] sendPhoto failed (${response.status}):`, errorBody)
    throw new Error(`Telegram sendPhoto failed: ${response.status}`)
  }

  return response.json()
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
): Promise<unknown> {
  const url = apiUrl('answerCallbackQuery')

  const payload: Record<string, unknown> = {
    callback_query_id: callbackQueryId,
  }

  if (text) {
    payload.text = text
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[Telegram] answerCallbackQuery failed (${response.status}):`, errorBody)
    throw new Error(`Telegram answerCallbackQuery failed: ${response.status}`)
  }

  return response.json()
}

export function buildInlineKeyboard(
  buttons: InlineKeyboardButton[][],
  options?: { columns?: number }
): InlineKeyboardMarkup {
  const columns = options?.columns ?? 1

  const rows: InlineKeyboardButton[][] = []
  let currentRow: InlineKeyboardButton[] = []

  for (const row of buttons) {
    for (const button of row) {
      currentRow.push(button)
      if (currentRow.length >= columns) {
        rows.push(currentRow)
        currentRow = []
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow)
      currentRow = []
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow)
  }

  return { inline_keyboard: rows }
}

export function formatPriceCents(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}
