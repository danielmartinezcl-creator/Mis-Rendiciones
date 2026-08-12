import { describe, it, expect, vi } from 'vitest'
import { buildDedupKey } from '@/lib/rate-limit'

describe('buildDedupKey', () => {
  it('genera clave determinista', () => {
    const key = buildDedupKey('draft_reminder', 'entity-123', '2026-08-11')
    expect(key).toBe('draft_reminder:entity-123:2026-08-11')
    expect(key.length).toBeLessThan(150)
  })
})
