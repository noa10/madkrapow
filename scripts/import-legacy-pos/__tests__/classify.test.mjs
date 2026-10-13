import { describe, it, expect } from 'vitest';
import { classifyChannel, mapPaymentMethod, parseRemarks } from '../lib/classify.mjs';

describe('classifyChannel', () => {
  it('classifies by Counter Payment Method first', () => {
    expect(classifyChannel({ 'Counter Payment Method': 'GrabFood' })).toBe('grabfood');
    expect(classifyChannel({ 'Counter Payment Method': 'FoodPanda' })).toBe('foodpanda');
    expect(classifyChannel({ 'Counter Payment Method': 'Cash' })).toBe('counter');
    expect(classifyChannel({ 'Counter Payment Method': 'QR Pay' })).toBe('counter');
  });

  it('falls back to the Cashier robot names', () => {
    expect(classifyChannel({ Cashier: 'GrabFood Robot' })).toBe('grabfood');
    expect(classifyChannel({ Cashier: 'FoodPanda Robot' })).toBe('foodpanda');
    expect(classifyChannel({ Cashier: 'Mad Krapow - Desa Subang Permai' })).toBe('counter');
  });
});

describe('mapPaymentMethod', () => {
  it.each([
    ['Cash', 'cash'],
    ['QR Pay', 'qr_pay'],
    ['GrabFood', 'grabfood'],
    ['FoodPanda', 'foodpanda'],
    ['', 'other'],
  ])('maps %j -> %j', (method, expected) => {
    expect(mapPaymentMethod({ 'Counter Payment Method': method })).toBe(expected);
  });
});

describe('parseRemarks', () => {
  it('extracts GF number and cutlery preference', () => {
    expect(parseRemarks('GF-659 (cutlery - no)')).toEqual({
      externalOrderNumber: 'GF-659',
      cutlery: false,
    });
    expect(parseRemarks('GF-705 (cutlery - yes)')).toEqual({
      externalOrderNumber: 'GF-705',
      cutlery: true,
    });
  });

  it('extracts FoodPanda # numbers', () => {
    expect(parseRemarks('#1995')).toEqual({
      externalOrderNumber: '#1995',
      cutlery: null,
    });
  });

  it('handles empty remarks (counter orders)', () => {
    expect(parseRemarks('')).toEqual({ externalOrderNumber: null, cutlery: null });
    expect(parseRemarks(null)).toEqual({ externalOrderNumber: null, cutlery: null });
  });
});
