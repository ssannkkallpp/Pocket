/**
 * Smoke tests — real network calls.
 * Skipped automatically if the required API key is not in the environment.
 * Run with: npm run test:smoke
 */
import { describe, it, expect } from 'vitest'
import { fetchViaJina, fetchViaFirecrawl, fetchViaZyte } from '../server.js'

const JINA_URL       = 'https://medium.com/@smbaker/using-ai-to-find-interesting-hackaday-posts-d02c6b04a5a9'
const FIRECRAWL_URL  = 'https://sports.yahoo.com/nfl/'
const ZYTE_URL       = 'https://www.wsj.com/'

const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY
const hasZyte      = !!process.env.ZYTE_API_KEY

describe('Jina smoke', () => {
  it('fetches Medium article and returns substantial text', async () => {
    const text = await fetchViaJina(JINA_URL)
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(500)
    console.log(`  Jina returned ${text.length} chars`)
  }, 15_000)
})

describe('Firecrawl smoke', { skip: !hasFirecrawl }, () => {
  it('fetches Yahoo Sports (Jina-blocked) via Firecrawl', async () => {
    const text = await fetchViaFirecrawl(FIRECRAWL_URL)
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(100)
    console.log(`  Firecrawl returned ${text.length} chars`)
  }, 20_000)
})

describe('Zyte smoke', { skip: !hasZyte }, () => {
  it('fetches WSJ (paywalled) via Zyte', async () => {
    const text = await fetchViaZyte(ZYTE_URL)
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(100)
    console.log(`  Zyte returned ${text.length} chars`)
  }, 30_000)
})
