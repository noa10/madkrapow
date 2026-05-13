import { describe, it, expect } from 'vitest'
import { buildLalamoveRemarks, MAX_REMARKS_LEN } from '../remarks'

describe('buildLalamoveRemarks', () => {
  const orderId = 'ec8ffffd-2660-49ea-9303-3f3bb6b7f238'

  it('formats display code, system id, and ref on a single header line', () => {
    expect(
      buildLalamoveRemarks({
        displayCode: 'MK-336',
        orderId,
        orderNumber: 'MKMP2ZUWCVLHPG',
      }),
    ).toBe('Order MK-336 | ID: ec8ffffd | Ref: MKMP2ZUWCVLHPG')
  })

  it('omits display code when not provided', () => {
    expect(
      buildLalamoveRemarks({
        orderId,
        orderNumber: 'MKMP2ZUWCVLHPG',
      }),
    ).toBe('ID: ec8ffffd | Ref: MKMP2ZUWCVLHPG')
  })

  it('omits ref when order number is missing or empty', () => {
    expect(
      buildLalamoveRemarks({ displayCode: 'MK-042', orderId }),
    ).toBe('Order MK-042 | ID: ec8ffffd')
    expect(
      buildLalamoveRemarks({ displayCode: 'MK-042', orderId, orderNumber: '' }),
    ).toBe('Order MK-042 | ID: ec8ffffd')
  })

  it('appends existing notes on a second line, trimmed', () => {
    expect(
      buildLalamoveRemarks({
        displayCode: 'MK-336',
        orderId,
        orderNumber: 'MKMP2ZUWCVLHPG',
        existingNotes: '  Leave at reception, floor 3  \n',
      }),
    ).toBe('Order MK-336 | ID: ec8ffffd | Ref: MKMP2ZUWCVLHPG\nLeave at reception, floor 3')
  })

  it('skips the notes line when notes are empty or whitespace', () => {
    const base = {
      displayCode: 'MK-336',
      orderId,
      orderNumber: 'MKMP2ZUWCVLHPG',
    }
    const header = 'Order MK-336 | ID: ec8ffffd | Ref: MKMP2ZUWCVLHPG'
    expect(buildLalamoveRemarks({ ...base, existingNotes: null })).toBe(header)
    expect(buildLalamoveRemarks({ ...base, existingNotes: '' })).toBe(header)
    expect(buildLalamoveRemarks({ ...base, existingNotes: '   \n  ' })).toBe(header)
  })

  it('truncates to MAX_REMARKS_LEN with an ellipsis', () => {
    const notes = 'x'.repeat(MAX_REMARKS_LEN + 500)
    const out = buildLalamoveRemarks({
      displayCode: 'MK-336',
      orderId,
      orderNumber: 'MKMP2ZUWCVLHPG',
      existingNotes: notes,
    })
    expect(out.length).toBe(MAX_REMARKS_LEN)
    expect(out.endsWith('…')).toBe(true)
  })

  it('keeps short output intact without an ellipsis', () => {
    const out = buildLalamoveRemarks({
      displayCode: 'MK-336',
      orderId,
      orderNumber: 'MKMP2ZUWCVLHPG',
      existingNotes: 'short note',
    })
    expect(out.endsWith('…')).toBe(false)
  })
})
