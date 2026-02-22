'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { Ogp } from "./types";

export default function Home() {
  const router = useRouter()
  const [rawUrls, setRawUrls] = useState('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Ogp[]>([])
  const [error, setError] = useState<string | null>(null)
  const hasLoggedPageView = useRef(false)

  const sendClientLog = (payload: {
    event_type: 'page_view' | 'start_button_click'
    page: string
    targetUrl?: string
  }) => {
    const createId = () => {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID()
      }
      return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    }

    const ensureId = (storage: Storage, key: string) => {
      const existing = storage.getItem(key)
      if (existing) return existing
      const created = createId()
      storage.setItem(key, created)
      return created
    }

    let sessionId: string | null = null
    let userId: string | null = null
    let deviceId: string | null = null
    if (typeof window !== 'undefined') {
      sessionId = ensureId(sessionStorage, 'analytics_session_id')
      userId = ensureId(localStorage, 'analytics_user_id')
      deviceId = ensureId(localStorage, 'analytics_device_id')
    }

    const body = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      session_id: sessionId,
      user_id: userId,
      device_id: deviceId,
    })

    try {
      void fetch('/api/client-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      })
    } catch (logError) {
      console.error('Client log send error:', logError)
    }
  }

  const parsedUrls = useMemo(() => {
    if (!rawUrls) return []

    // http(s):// ã‚’èµ·ç‚¹ã« URL ã‚’æŠ½å‡º
    const matches = rawUrls.match(/https?:\/\/[^\s,]+/g) ?? []

    return Array.from(new Set(matches))
  }, [rawUrls])

  const extractUrls = (text: string) => {
    return Array.from(new Set(text.match(/https?:\/\/[^\s,]+/g) ?? []))
  }

  const absorbUrlsFromText = (text: string) => {
    const urls = extractUrls(text)
    if (urls.length === 0) {
      setRawUrls(text)
      return
    }

    // 1) textareaã‹ã‚‰URLã‚’æ¶ˆã™ï¼ˆãƒãƒ£ãƒƒãƒˆç½®æ›ï¼‰
    let cleaned = text
    for (const u of urls) {
      try {
        cleaned = cleaned.replaceAll(u, '')
      } catch (error) {
        console.error('Error replacing URL:', error)
      }
    }
    setRawUrls(cleaned.trim())

    // 2) URLã¯ items å´ã«æ®‹ã™ãŸã‚ã«ã€OGPå–å¾—ã‚’èµ°ã‚‰ã›ã‚‹
    //    ãŸã ã— â€œä»Šã™ã§ã«è¡¨ç¤ºã—ã¦ã„ã‚‹URLâ€ ã¯å†å–å¾—ã—ãªã„
    const have = new Set(items.map((x) => x.url))
    const need = urls.filter((u) => !have.has(u))
    if (need.length > 0) {
      // å³æ™‚ã«OGPå–å¾—ï¼ˆUXå„ªå…ˆï¼‰
      fetchOgpWithUrls(need)
    }
  }

  console.log('parsedUrls:', parsedUrls)
  const fetchOgpWithUrls = async (urls: string[]) => {
    if (urls.length === 0) return

    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/ogp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urls }),
      })

      if (!res.ok) throw new Error('OGPå–å¾—ã«å¤±æ•—ã—ã¾ã—ãŸ')

      const data = (await res.json()) as { results: Ogp[] }

      // æ—¢å­˜ items ã¨ãƒžãƒ¼ã‚¸ï¼ˆurlã‚­ãƒ¼ï¼‰
      setItems((prev) => {
        const map = new Map<string, Ogp>()
        prev.forEach((it) => map.set(it.url, it))
        ;(data.results ?? []).forEach((it) => map.set(it.url, it))
        return Array.from(map.values())
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ã‚¨ãƒ©ãƒ¼ãŒç™ºç”Ÿã—ã¾ã—ãŸ')
    } finally {
      setLoading(false)
    }
  }

  // æ—¢å­˜ã®ã€ŒOGPã‚’è¡¨ç¤ºã€ãƒœã‚¿ãƒ³ã¯ã€textareaç”±æ¥ã® parsedUrls ã‚’å–ã‚‹ç”¨é€”ã§æ®‹ã›ã‚‹
  const fetchOgp = async () => {
    if (parsedUrls.length === 0) {
      setItems([])
      return
    }
    await fetchOgpWithUrls(parsedUrls)
  }


  const removeUrl = (url: string) => {
    setItems((prev) => prev.filter((it) => it.url !== url))
  }

  // âœ… ãƒ‡ãƒã‚¦ãƒ³ã‚¹ï¼šå…¥åŠ›ãŒæ­¢ã¾ã£ãŸã‚‰è‡ªå‹•å–å¾—
  useEffect(() => {
    if (parsedUrls.length === 0) {
      setItems([])
      return
    }

    const timer = setTimeout(() => {
      fetchOgp()
    }, 600)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedUrls]) // parsedUrls ãŒå¤‰ã‚ã£ãŸã‚‰å†ã‚¹ã‚±ã‚¸ãƒ¥ãƒ¼ãƒ«

  useEffect(() => {
    if (hasLoggedPageView.current) return
    hasLoggedPageView.current = true
    sendClientLog({
      event_type: 'page_view',
      page: '/',
    })
  }, [])

  return (
    <div className="p-6 text-center max-w-md mx-auto">
      {/* Logo */}
      <div className="mb-8 flex justify-center">
        <Image
          src="/cocoico-ai_logo.png"
          alt="Trip Planner"
          width={100}
          height={100}
          priority
        />
      </div>

      {/* Hero */}
      <section className="mb-16">
        <h1 className="text-[28px] font-bold leading-[1.45] text-emerald-600 mb-10">
          ã¾ãš
          <br />
          ã€Œè¡Œã£ã¦ã¿ãŸã„ï¼ã€
          <br />
          ã‚’ã‹ãŸã¡ã«ã—ã‚ˆã†
        </h1>
        <div className="mb-8 flex justify-center">
          <Image
            src="/cocoico-ai_chara.png"
            alt="Trip Planner"
            width={150}
            height={150}
            priority
          />
        </div>
        <p className="text-[13px] text-gray-600 leading-relaxed mb-10">
          COCOICO-AIã¯ã‚ãªãŸãŒã‚½ãƒ¼ã‚·ãƒ£ãƒ«ãƒ¡ãƒ‡ã‚£ã‚¢ãªã©æ—¥å¸¸ç”Ÿæ´»ã§ç™ºè¦‹ã—ãŸè¡ŒããŸã„å ´æ‰€ã¾ã§ã®å®Ÿè¡Œãƒ—ãƒ©ãƒ³ã‚’ææ¡ˆã—ã¦ãã‚Œã‚‹ã‚µãƒ¼ãƒ“ã‚¹ã§ã™ã€‚
        </p>

        <button
          onClick={() => {
            try {
              const url = '/plan'
              sendClientLog({
                event_type: 'start_button_click',
                page: '/',
                targetUrl: url,
              })
              console.log('Navigating to:', url)
              router.push(url)
            } catch (error) {
              console.error('Navigation error:', error)
            }
          }}
          className="inline-flex items-center justify-center px-16 sm:px-32 py-4 rounded-full font-semibold shadow-md transition outline-none border-0 text-[15px] bg-emerald-500 text-white cursor-pointer active:scale-[0.98] whitespace-nowrap"
        >
          ã¯ã˜ã‚ã‚‹
        </button>
      </section>

      {/* Features */}
      <section className="space-y-16 mt-20">
        <Feature
          title="æ¯”è¼ƒã—ãªã„"
          description="å€™è£œã‚’ä¸¦ã¹ã¾ã›ã‚“ã€‚ã²ã¨ã¤ã ã‘ææ¡ˆã—ã¾ã™ã€‚"
        />
        <Feature
          title="å…¥åŠ›ãŒå°‘ãªã„"
          description="ã‚¿ãƒƒãƒ—ä¸­å¿ƒã€‚è€ƒãˆã‚‹ã“ã¨ã‚’æ¸›ã‚‰ã—ã¾ã™ã€‚"
        />
        <Feature
          title="å…±æœ‰ã§ãã‚‹"
          description="é€”ä¸­ã®çŠ¶æ…‹ã‚’URLã§ãã®ã¾ã¾å…±æœ‰ã€‚"
        />
      </section>
    </div>
  )
}

function OgpCard({
  item,
  onRemove,
}: {
  item: Ogp
  onRemove: () => void
}) {
  const title = item.title ?? item.url
  const desc = item.description
  const site = item.siteName

  return (
    <div className="relative p-4 rounded-xl border border-gray-200 bg-white flex gap-4 overflow-hidden">
      {/* Ã— ãƒœã‚¿ãƒ³ */}
      <button
        type="button"
        onClick={onRemove}
        className="
          absolute top-2 right-2 z-10
          w-8 h-8 rounded-full
          flex items-center justify-center
          text-gray-500
          hover:bg-gray-100
          active:scale-[0.98]
          transition
        "
        aria-label="ã“ã®URLã‚’å‰Šé™¤"
        title="å‰Šé™¤"
      >
        Ã—
      </button>

      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-gray-100 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0 pr-8 overflow-hidden">
        {site && <div className="text-xs text-gray-500 truncate">{site}</div>}
        <div className="font-semibold text-black truncate break-words">{title}</div>
        {desc && (
          <div className="text-sm text-gray-600 mt-1 break-words overflow-hidden line-clamp-2">
            {desc}
          </div>
        )}
        <div className="text-xs text-gray-400 mt-2 truncate break-all">{item.url}</div>
      </div>
    </div>
  )
}

const Feature = ({
  title,
  description,
}: {
  title: string
  description: string
}) => (
  <div className="text-center">
    <h3 className="text-[17px] font-bold text-black mb-4">{title}</h3>
    <p className="text-[14px] text-gray-600 leading-relaxed">{description}</p>
  </div>
)


