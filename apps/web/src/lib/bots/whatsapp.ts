/**
 * WhatsApp Cloud API messaging utilities.
 *
 * Uses native fetch — no third-party libraries (unofficial APIs violate Meta ToS).
 * All messages are sent within the 24-hour customer service window.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */

import { env } from '@/lib/validators/env'

const WHATSAPP_API_VERSION = 'v18.0'

function getPhoneNumberId(): string {
  const id = env.WHATSAPP_PHONE_NUMBER_ID
  if (!id) {
    throw new Error('[WhatsApp] WHATSAPP_PHONE_NUMBER_ID is not configured')
  }
  return id
}

function getAccessToken(): string {
  const token = env.WHATSAPP_ACCESS_TOKEN
  if (!token) {
    throw new Error('[WhatsApp] WHATSAPP_ACCESS_TOKEN is not configured')
  }
  return token
}

function apiUrl(): string {
  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${getPhoneNumberId()}/messages`
}

async function sendMessage(payload: Record<string, unknown>): Promise<void> {
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[WhatsApp] API error:', response.status, errorBody)
    throw new Error(`WhatsApp API error: ${response.status} ${errorBody}`)
  }
}

export async function sendWhatsAppTextMessage(
  phoneNumber: string,
  body: string
): Promise<void> {
  await sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNumber,
    type: 'text',
    text: { body },
  })
}

export interface ListSectionRow {
  id: string
  title: string
  description?: string
}

export interface ListSection {
  title: string
  rows: ListSectionRow[]
}

/**
 * Send an interactive list message.
 * Used for category menus and modifier selection when >3 options.
 */
export async function sendWhatsAppListMessage(
  phoneNumber: string,
  header: string,
  body: string,
  sections: ListSection[],
  buttonText: string = 'View options'
): Promise<void> {
  await sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: header,
      },
      body: {
        text: body,
      },
      action: {
        button: buttonText,
        sections: sections.map((section) => ({
          title: section.title,
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title.substring(0, 24), // WhatsApp limit
            description: row.description?.substring(0, 72),
          })),
        })),
      },
    },
  })
}

export interface ReplyButton {
  id: string
  title: string
}

/**
 * Send interactive reply buttons (up to 3 buttons).
 * Used for cart actions, modifier selection (≤3), and confirmations.
 */
export async function sendWhatsAppReplyButtons(
  phoneNumber: string,
  body: string,
  buttons: ReplyButton[]
): Promise<void> {
  const limitedButtons = buttons.slice(0, 3).map((btn) => ({
    type: 'reply',
    reply: {
      id: btn.id,
      title: btn.title.substring(0, 20), // WhatsApp limit
    },
  }))

  await sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phoneNumber,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: body,
      },
      action: {
        buttons: limitedButtons,
      },
    },
  })
}

export async function sendWhatsAppMessage(
  phoneNumber: string,
  message:
    | { type: 'text'; body: string }
    | {
        type: 'list'
        header: string
        body: string
        sections: ListSection[]
        buttonText?: string
      }
    | { type: 'buttons'; body: string; buttons: ReplyButton[] }
): Promise<void> {
  switch (message.type) {
    case 'text':
      return sendWhatsAppTextMessage(phoneNumber, message.body)
    case 'list':
      return sendWhatsAppListMessage(
        phoneNumber,
        message.header,
        message.body,
        message.sections,
        message.buttonText
      )
    case 'buttons':
      return sendWhatsAppReplyButtons(phoneNumber, message.body, message.buttons)
    default:
      throw new Error(`Unsupported WhatsApp message type`)
  }
}
