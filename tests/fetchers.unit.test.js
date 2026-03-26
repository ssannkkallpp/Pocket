import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock node-fetch before importing server functions ──
vi.mock('node-fetch', () => ({ default: vi.fn() }))
import fetch from 'node-fetch'

import { fetchViaJina, fetchViaFirecrawl, fetchViaZyte } from '../server.js'

const LONG_TEXT = 'a'.repeat(200)
const SHORT_TEXT = 'too short'

function mockResponse({ ok = true, status = 200, text = LONG_TEXT, json = null } = {}) {
  return {
    ok,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(json)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.FIRECRAWL_API_KEY
  delete process.env.ZYTE_API_KEY
})

// ─────────────────────────────────────────────
// fetchViaJina
// ─────────────────────────────────────────────
describe('fetchViaJina', () => {
  it('returns trimmed text on 200 with content ≥ 100 chars', async () => {
    fetch.mockResolvedValue(mockResponse({ text: '  ' + LONG_TEXT + '  ' }))
    const result = await fetchViaJina('https://example.com')
    expect(result).toBe(LONG_TEXT)
  })

  it('throws on status 403', async () => {
    fetch.mockResolvedValue(mockResponse({ ok: false, status: 403 }))
    await expect(fetchViaJina('https://example.com')).rejects.toThrow('Jina blocked (403)')
  })

  it('throws on status 451', async () => {
    fetch.mockResolvedValue(mockResponse({ ok: false, status: 451 }))
    await expect(fetchViaJina('https://example.com')).rejects.toThrow('Jina blocked (451)')
  })

  it('throws on status 405', async () => {
    fetch.mockResolvedValue(mockResponse({ ok: false, status: 405 }))
    await expect(fetchViaJina('https://example.com')).rejects.toThrow('Jina blocked (405)')
  })

  it('throws on other non-OK status', async () => {
    fetch.mockResolvedValue(mockResponse({ ok: false, status: 500 }))
    await expect(fetchViaJina('https://example.com')).rejects.toThrow('Jina 500')
  })

  it('throws when content is shorter than 100 chars', async () => {
    fetch.mockResolvedValue(mockResponse({ text: SHORT_TEXT }))
    await expect(fetchViaJina('https://example.com')).rejects.toThrow('Jina returned empty content')
  })

  it('throws when content is empty', async () => {
    fetch.mockResolvedValue(mockResponse({ text: '' }))
    await expect(fetchViaJina('https://example.com')).rejects.toThrow('Jina returned empty content')
  })
})

// ─────────────────────────────────────────────
// fetchViaFirecrawl
// ─────────────────────────────────────────────
describe('fetchViaFirecrawl', () => {
  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = 'test-key'
  })

  it('returns markdown content from json.data.markdown', async () => {
    fetch.mockResolvedValue(mockResponse({ json: { data: { markdown: LONG_TEXT } } }))
    const result = await fetchViaFirecrawl('https://example.com')
    expect(result).toBe(LONG_TEXT)
  })

  it('falls back to json.data.content when markdown is missing', async () => {
    fetch.mockResolvedValue(mockResponse({ json: { data: { content: LONG_TEXT } } }))
    const result = await fetchViaFirecrawl('https://example.com')
    expect(result).toBe(LONG_TEXT)
  })

  it('throws when FIRECRAWL_API_KEY is not set', async () => {
    delete process.env.FIRECRAWL_API_KEY
    await expect(fetchViaFirecrawl('https://example.com')).rejects.toThrow('No Firecrawl key configured')
  })

  it('throws on non-OK HTTP status', async () => {
    fetch.mockResolvedValue(mockResponse({ ok: false, status: 402 }))
    await expect(fetchViaFirecrawl('https://example.com')).rejects.toThrow('Firecrawl 402')
  })

  it('throws when both markdown and content are missing', async () => {
    fetch.mockResolvedValue(mockResponse({ json: { data: {} } }))
    await expect(fetchViaFirecrawl('https://example.com')).rejects.toThrow('Firecrawl returned empty content')
  })

  it('throws when content is shorter than 100 chars', async () => {
    fetch.mockResolvedValue(mockResponse({ json: { data: { markdown: SHORT_TEXT } } }))
    await expect(fetchViaFirecrawl('https://example.com')).rejects.toThrow('Firecrawl returned empty content')
  })
})

// ─────────────────────────────────────────────
// fetchViaZyte
// ─────────────────────────────────────────────
describe('fetchViaZyte', () => {
  beforeEach(() => {
    process.env.ZYTE_API_KEY = 'test-zyte-key'
  })

  it('returns HTML-stripped, whitespace-normalised text', async () => {
    const html = '<h1>Hello</h1>  <p>World  today</p>'
    fetch.mockResolvedValue(mockResponse({ json: { articleBodyHtml: html } }))
    const result = await fetchViaZyte('https://example.com')
    expect(result).toBe('Hello World today')
  })

  it('throws when ZYTE_API_KEY is not set', async () => {
    delete process.env.ZYTE_API_KEY
    await expect(fetchViaZyte('https://example.com')).rejects.toThrow('No Zyte key configured')
  })

  it('throws on non-OK HTTP status', async () => {
    fetch.mockResolvedValue(mockResponse({ ok: false, status: 422 }))
    await expect(fetchViaZyte('https://example.com')).rejects.toThrow('Zyte 422')
  })

  it('throws when articleBodyHtml is missing', async () => {
    fetch.mockResolvedValue(mockResponse({ json: {} }))
    await expect(fetchViaZyte('https://example.com')).rejects.toThrow('Zyte returned no article body')
  })
})

// ─────────────────────────────────────────────
// Waterfall via /api/fetch endpoint
// ─────────────────────────────────────────────
import request from 'supertest'
import { app } from '../server.js'

describe('Waterfall endpoint', () => {
  it('returns 400 when url param is missing', async () => {
    const res = await request(app).get('/api/fetch')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('url param required')
  })

  it('returns 200 from Jina without calling Firecrawl/Zyte', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ text: LONG_TEXT }))
    const res = await request(app).get('/api/fetch?url=https://example.com')
    expect(res.status).toBe(200)
    expect(res.text).toBe(LONG_TEXT)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('falls through to Firecrawl when Jina fails', async () => {
    process.env.FIRECRAWL_API_KEY = 'test-key'
    fetch
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 451 }))
      .mockResolvedValueOnce(mockResponse({ json: { data: { markdown: LONG_TEXT } } }))
    const res = await request(app).get('/api/fetch?url=https://example.com')
    expect(res.status).toBe(200)
    expect(res.text).toBe(LONG_TEXT)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('falls through to Zyte when Jina and Firecrawl both fail', async () => {
    process.env.FIRECRAWL_API_KEY = 'test-key'
    process.env.ZYTE_API_KEY = 'test-zyte-key'
    fetch
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 451 }))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 500 }))
      .mockResolvedValueOnce(mockResponse({ json: { articleBodyHtml: '<p>' + LONG_TEXT + '</p>' } }))
    const res = await request(app).get('/api/fetch?url=https://example.com')
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('returns 500 when all fetchers fail', async () => {
    process.env.FIRECRAWL_API_KEY = 'test-key'
    process.env.ZYTE_API_KEY = 'test-zyte-key'
    fetch
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 451 }))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 500 }))
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 503 }))
    const res = await request(app).get('/api/fetch?url=https://example.com')
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/All fetchers failed/)
  })
})
