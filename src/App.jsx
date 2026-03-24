import { useState, useEffect, useRef, useCallback } from 'react'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY
const ASSISTANT_ID   = import.meta.env.VITE_VAPI_ASSISTANT_ID

const STOPWORDS = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','are','was','were','it','this','that','by','as','be','been'])

function generateTitle(text) {
  const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const first = clean.split(/[.!?\n]/)[0].trim()
  const words = first.split(/\s+/).filter(w => w.length > 1 && !STOPWORDS.has(w.toLowerCase()))
  const chosen = words.slice(0, 5)
  return chosen.length ? chosen.join(' ') : first.split(/\s+/).slice(0, 5).join(' ') || 'Untitled Article'
}

function getSnippet(text) {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90)
}

function useToast() {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const timer = useRef(null)
  const toast = useCallback((m) => {
    setMsg(m); setShow(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShow(false), 3000)
  }, [])
  return { msg, show, toast }
}

// ── ICONS ──
const IconBook   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
const IconPlus   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
const IconMic    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
const IconSearch = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>

export default function App() {
  const [articles, setArticles] = useState(() => JSON.parse(localStorage.getItem('pocket_articles') || '[]'))
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [articleText, setArticleText] = useState('')
  const [fetching, setFetching] = useState(false)
  const [vapiActive, setVapiActive] = useState(false)
  const [vapiConnecting, setVapiConnecting] = useState(false)
  const vapiRef = useRef(null)
  const { msg: toastMsg, show: toastShow, toast } = useToast()

  useEffect(() => {
    localStorage.setItem('pocket_articles', JSON.stringify(articles))
  }, [articles])

  function getVapi() {
    if (!vapiRef.current) {
      vapiRef.current = new Vapi(VAPI_PUBLIC_KEY)
      vapiRef.current.on('call-end', () => {
        setVapiActive(false)
        setVapiConnecting(false)
        toast('Call ended.')
      })
      vapiRef.current.on('error', (e) => {
        console.error('[Vapi]', e)
        setVapiActive(false)
        setVapiConnecting(false)
        toast('Connection error — check console.')
      })
    }
    return vapiRef.current
  }

  async function fetchArticle() {
    if (!urlInput.trim()) { toast('Paste a URL first.'); return }
    setFetching(true)
    try {
      const res = await fetch(`/api/fetch?url=${encodeURIComponent(urlInput.trim())}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Server error ' + res.status)
      }
      const text = await res.text()
      setArticleText(text.trim())
      setUrlInput('')
      toast('Article fetched — review and save.')
    } catch (e) {
      toast('Could not fetch URL. Try pasting the text directly.')
      console.error('[fetch]', e)
    } finally {
      setFetching(false)
    }
  }

  function saveArticle() {
    const text = articleText.trim()
    if (!text) { toast('Please paste an article first.'); return }
    const id = 'a_' + Date.now()
    const title = generateTitle(text)
    const next = [{ id, title, text, read: false, created: Date.now() }, ...articles]
    setArticles(next)
    setArticleText('')
    toast(`Article saved: "${title}"`)
    selectArticle(id, next)
  }

  function selectArticle(id, list = articles) {
    setSelectedId(id)
    setArticles(list.map(a => a.id === id ? { ...a, read: true } : a))
  }

  function deleteArticle(e, id) {
    e.stopPropagation()
    setArticles(articles.filter(a => a.id !== id))
    if (selectedId === id) setSelectedId(null)
    toast('Article removed.')
  }

  function clearAll() {
    if (!articles.length) return
    if (!confirm('Clear all saved articles?')) return
    setArticles([])
    setSelectedId(null)
    toast('Library cleared.')
  }

  async function toggleVapi() {
    if (!selectedId) return
    if (vapiActive) {
      vapiRef.current?.stop()
      return
    }
    const article = articles.find(a => a.id === selectedId)
    const vapi = getVapi()
    setVapiConnecting(true)
    toast('Connecting to Reed…')
    try {
      await vapi.start(ASSISTANT_ID, {
        variableValues: {
          articleTitle:   article.title,
          articleContent: article.text.slice(0, 4000)
        }
      })
      setVapiActive(true)
    } catch (e) {
      console.error('[Vapi start]', e)
      toast('Failed to connect.')
    } finally {
      setVapiConnecting(false)
    }
  }

  const selected = articles.find(a => a.id === selectedId)
  const visible  = articles.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.text.toLowerCase().includes(search.toLowerCase())
  )
  const readCount = articles.filter(a => a.read).length

  return (
    <>
      {/* SIDEBAR */}
      <aside>
        <div className="brand">Pocket<span>.</span></div>
        <div className="user-block">
          <div className="avatar">S</div>
          <div className="user-info">
            <div className="user-name">Sankalp</div>
            <div className="user-sub">Personal Library</div>
          </div>
        </div>
        <nav>
          <a className="active"><IconBook />Library</a>
          <a onClick={() => document.getElementById('urlInputEl')?.focus()}><IconPlus />Add Article</a>
          <a onClick={() => document.getElementById('vapiBtn')?.scrollIntoView({ behavior: 'smooth' })}><IconMic />Voice Agent</a>
        </nav>
        <div className="sidebar-footer">
          <button className="add-btn" onClick={() => document.getElementById('urlInputEl')?.focus()}>
            + Save Article
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main>
        <header>
          <div className="header-title">My Reading List</div>
          <div className="search-box">
            <IconSearch />
            <input
              type="text"
              placeholder="Search articles…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </header>

        <div className="content">
          {/* LEFT SCROLL AREA */}
          <div className="content-left">
            <div className="page-header">
              <h1>Your Pocket</h1>
              <p>Save articles. Read later. Ask your voice agent anything.</p>
            </div>

            {/* STATS */}
            <div className="stats-row">
              <div className="stat-card">
                <div className="label">Saved</div>
                <div className="value">{articles.length}</div>
              </div>
              <div className="stat-card">
                <div className="label">Read</div>
                <div className="value green">{readCount}</div>
              </div>
              <div className="stat-card">
                <div className="label">Unread</div>
                <div className="value">{articles.length - readCount}</div>
              </div>
            </div>

            <div className="section-heading"><IconBook />Saved Articles</div>
              <div className="articles-panel">
                <div className="articles-panel-header">
                  <h2>All Articles</h2>
                  <button className="view-all" onClick={clearAll}>Clear All</button>
                </div>
                <ul className="article-list">
                  {visible.length === 0 ? (
                    <li className="empty-state">
                      <IconBook />
                      <div>No articles saved yet.</div>
                      <div style={{ marginTop: 4, fontSize: 12 }}>Paste a URL or article on the right to get started.</div>
                    </li>
                  ) : visible.map(a => (
                    <li
                      key={a.id}
                      className={`article-item${a.id === selectedId ? ' selected' : ''}`}
                      onClick={() => selectArticle(a.id)}
                    >
                      <div className="article-icon">{a.read ? '✅' : '📄'}</div>
                      <div className="article-meta">
                        <div className="article-title">{a.title}</div>
                        <div className="article-snippet">{getSnippet(a.text)}</div>
                      </div>
                      <span className="article-badge">{a.read ? 'Read' : 'Unread'}</span>
                      <button className="article-delete" onClick={e => deleteArticle(e, a.id)}>✕</button>
                    </li>
                  ))}
                </ul>
              </div>

              {selected && (
                <div className="reader-card">
                  <h2>{selected.title}</h2>
                  <div className="reader-body">{selected.text}</div>
                </div>
              )}
          </div>{/* end content-left */}

          {/* RIGHT PANEL — pinned to top */}
          <div className="right-panel">
              {/* ADD ARTICLE */}
              <div className="add-card">
                <h3>Save New Article</h3>
                <input
                  id="urlInputEl"
                  type="text"
                  className="url-input"
                  placeholder="Paste a URL to fetch article…"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchArticle()}
                />
                <button className="fetch-btn" onClick={fetchArticle} disabled={fetching}>
                  {fetching ? 'Fetching…' : 'Fetch Article from URL'}
                </button>
                <div className="divider">
                  <div className="divider-line" />
                  <span className="divider-text">or paste text directly</span>
                  <div className="divider-line" />
                </div>
                <textarea
                  placeholder="Paste your article text here…"
                  value={articleText}
                  onChange={e => setArticleText(e.target.value)}
                  onKeyDown={e => e.metaKey && e.key === 'Enter' && saveArticle()}
                />
                <button className="save-btn" onClick={saveArticle}>Save to Library</button>
              </div>

              {/* VAPI */}
              <div className="vapi-card">
                <div className="vc-label">AI Voice Agent</div>
                <h3>Talk to Reed</h3>
                <p>Select an article, then press Talk to ask Reed anything about it.</p>
                <div className="selected-article-chip">
                  <IconBook />
                  {selected
                    ? <span>{selected.title}</span>
                    : <span className="chip-none">No article selected</span>
                  }
                </div>
                <button
                  id="vapiBtn"
                  className={`vapi-talk-btn${vapiActive ? ' active' : ''}`}
                  onClick={toggleVapi}
                  disabled={!selected || vapiConnecting}
                >
                  {vapiConnecting ? (
                    <><div className="pulse-dot" /> Connecting…</>
                  ) : vapiActive ? (
                    <><div className="pulse-dot" /> End Call</>
                  ) : (
                    <><IconMic /> Talk to Reed</>
                  )}
                </button>
                <p className="vapi-footer">Powered by Vapi</p>
              </div>
            </div>{/* end right-panel */}
        </div>{/* end content */}
      </main>

      {/* TOAST */}
      <div className={`toast${toastShow ? ' show' : ''}`}>{toastMsg}</div>
    </>
  )
}
