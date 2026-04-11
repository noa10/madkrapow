import { describe, it, expect } from 'vitest'
import {
  normalizeMalaysianPhone,
  isValidMalaysianPhone,
} from '../phone'

describe('normalizeMalaysianPhone', () => {
  it('normalizes local format starting with 0', () => {
    expect(normalizeMalaysianPhone('0123456789')).toBe('+60123456789')
  })

  it('normalizes format with dashes', () => {
    expect(normalizeMalaysianPhone('012-345 6789')).toBe('+60123456789')
  })

  it('normalizes format with spaces', () => {
    expect(normalizeMalaysianPhone('012 345 6789')).toBe('+60123456789')
  })

  it('normalizes format with 60 prefix (no +)', () => {
    expect(normalizeMalaysianPhone('60123456789')).toBe('+60123456789')
  })

  it('passthrough already valid E.164', () => {
    expect(normalizeMalaysianPhone('+60123456789')).toBe('+60123456789')
  })

  it('normalizes with extra whitespace', () => {
    expect(normalizeMalaysianPhone('  +60 12-345 6789  ')).toBe('+60123456789')
  })

  it('handles 10-digit local numbers', () => {
    expect(normalizeMalaysianPhone('0123456789')).toBe('+60123456789')
  })

  it('handles 9-digit local numbers', () => {
    expect(normalizeMalaysianPhone('0111234567')).toBe('+60111234567')
  })

  it('returns null for empty string', () => {
    expect(normalizeMalaysianPhone('')).toBeNull()
  })

  it('returns null for too short numbers', () => {
    expect(normalizeMalaysianPhone('01234')).toBeNull()
  })

  it('returns null for non-Malaysian numbers', () => {
    expect(normalizeMalaysianPhone('+12025551234')).toBeNull()
  })

  it('handles formatted landline-style numbers', () => {
    expect(normalizeMalaysianPhone('03-1234 5678')).toBe('+60312345678')
  })
})

describe('isValidMalaysianPhone', () => {
  it('validates correct E.164 Malaysian mobile', () => {
    expect(isValidMalaysianPhone('+60123456789')).toBe(true)
  })

  it('validates 10-digit Malaysian mobile after +60', () => {
    expect(isValidMalaysianPhone('+6012345678')).toBe(true)
  })

  it('rejects numbers without +60 prefix', () => {
    expect(isValidMalaysianPhone('0123456789')).toBe(false)
  })

  it('rejects too short numbers', () => {
    expect(isValidMalaysianPhone('+601234')).toBe(false)
  })

  it('rejects too long numbers', () => {
    expect(isValidMalaysianPhone('+601234567890123')).toBe(false)
  })

  it('rejects non-Malaysian country codes', () => {
    expect(isValidMalaysianPhone('+12025551234')).toBe(false)
  })
})
