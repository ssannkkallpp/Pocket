import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'

const app = express()
app.use(cors())

app.get('/api/fetch', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url param required' })

  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain' }
    })
    if (response.status === 451 || response.status === 403) {
      return res.status(451).json({ error: 'This site blocks article fetching. Please copy and paste the article text directly.' })
    }
    if (!response.ok) throw new Error(`Jina returned ${response.status}`)
    const text = await response.text()
    res.type('text/plain').send(text)
  } catch (e) {
    console.error('[fetch]', e.message)
    res.status(500).json({ error: e.message })
  }
})

app.listen(3001, () => console.log('Backend running on http://localhost:3001'))
