import { describe, it, expect } from 'vitest'
import { validateRequest, urlSchema, placeSchema, chatRequestSchema } from '../app/lib/validation'

describe('Validation', () => {
  describe('urlSchema', () => {
    it('should accept valid URLs', () => {
      const result = urlSchema.safeParse('https://example.com')
      expect(result.success).toBe(true)
    })

    it('should reject invalid URLs', () => {
      const result = urlSchema.safeParse('not-a-url')
      expect(result.success).toBe(false)
    })

    it('should reject URLs over 2048 characters', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2048)
      const result = urlSchema.safeParse(longUrl)
      expect(result.success).toBe(false)
    })
  })

  describe('placeSchema', () => {
    it('should accept valid place object', () => {
      const place = {
        url: 'https://example.com',
        category: 'visit',
        name: 'Test Place',
        address: 'Tokyo, Japan',
      }
      const result = placeSchema.safeParse(place)
      expect(result.success).toBe(true)
    })

    it('should reject invalid category', () => {
      const place = {
        url: 'https://example.com',
        category: 'invalid',
        name: 'Test Place',
        address: 'Tokyo, Japan',
      }
      const result = placeSchema.safeParse(place)
      expect(result.success).toBe(false)
    })
  })

  describe('chatRequestSchema', () => {
    it('should accept valid chat request', () => {
      const request = {
        place: {
          url: 'https://example.com',
          category: 'hotel',
          name: 'Test Hotel',
          address: 'Tokyo',
        },
        context: {
          depart: '東京駅',
        },
      }
      const result = chatRequestSchema.safeParse(request)
      expect(result.success).toBe(true)
    })
  })

  describe('validateRequest', () => {
    it('should return success for valid data', () => {
      const result = validateRequest(urlSchema, 'https://example.com')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('https://example.com')
      }
    })

    it('should return errors for invalid data', () => {
      const result = validateRequest(urlSchema, 'invalid')
      expect(result.success).toBe(false)
    })
  })
})
