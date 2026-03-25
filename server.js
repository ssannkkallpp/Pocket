import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'

const app = express()
app.use(cors())

if (isProd) {
  app.use(express.static(path.join(__dirname, 'dist')))
}

// ── FETCHER PIPELINE ──

async function fetchViaJina(url) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'Accept': 'text/plain' }
  })
  if (res.status === 403 || res.status === 451 || res.status === 405) throw new Error(`Jina blocked (${res.status})`)
  if (!res.ok) throw new Error(`Jina ${res.status}`)
  const text = await res.text()
  if (!text || text.trim().length < 100) throw new Error('Jina returned empty content')
  return text.trim()
}

async function fetchViaFirecrawl(url) {
  const key = process.env.FIRECRAWL_API_KEY
  if (!key) throw new Error('No Firecrawl key configured')
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['markdown'] })
  })
  if (!res.ok) throw new Error(`Firecrawl ${res.status}`)
  const json = await res.json()
  const text = json?.data?.markdown || json?.data?.content
  if (!text || text.trim().length < 100) throw new Error('Firecrawl returned empty content')
  return text.trim()
}

async function fetchViaZyte(url) {
  const key = process.env.ZYTE_API_KEY
  if (!key) throw new Error('No Zyte key configured')
  const res = await fetch('https://api.zyte.com/v1/extract', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url, articleBodyHtml: true })
  })
  if (!res.ok) throw new Error(`Zyte ${res.status}`)
  const json = await res.json()
  const html = json?.articleBodyHtml
  if (!html) throw new Error('Zyte returned no article body')
  // strip HTML tags from Zyte's response
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

app.get('/api/fetch', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url param required' })

  const pipeline = [
    { name: 'Jina',      fn: () => fetchViaJina(url) },
    { name: 'Firecrawl', fn: () => fetchViaFirecrawl(url) },
    { name: 'Zyte',      fn: () => fetchViaZyte(url) }
  ]

  for (const { name, fn } of pipeline) {
    try {
      console.log(`[fetch] Trying ${name}…`)
      const text = await fn()
      console.log(`[fetch] Success via ${name}`)
      return res.type('text/plain').send(text)
    } catch (e) {
      console.warn(`[fetch] ${name} failed: ${e.message}`)
    }
  }

  res.status(500).json({ error: 'All fetchers failed. Please paste the article text directly.' })
})

if (isProd) {
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))
}

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`Server running on port ${port}`))
