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
    eventType: 'page_view' | 'start_button_click'
    page: string
    targetUrl?: string
  }) => {
    const body = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
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

    // http(s):// を起点に URL を抽出
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

    // 1) textareaからURLを消す（チャット置換）
    let cleaned = text
    for (const u of urls) {
      try {
        cleaned = cleaned.replaceAll(u, '')
      } catch (error) {
        console.error('Error replacing URL:', error)
      }
    }
    setRawUrls(cleaned.trim())

    // 2) URLは items 側に残すために、OGP取得を走らせる
    //    ただし “今すでに表示しているURL” は再取得しない
    const have = new Set(items.map((x) => x.url))
    const need = urls.filter((u) => !have.has(u))
    if (need.length > 0) {
      // 即時にOGP取得（UX優先）
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

      if (!res.ok) throw new Error('OGP取得に失敗しました')

      const data = (await res.json()) as { results: Ogp[] }

      // 既存 items とマージ（urlキー）
      setItems((prev) => {
        const map = new Map<string, Ogp>()
        prev.forEach((it) => map.set(it.url, it))
        ;(data.results ?? []).forEach((it) => map.set(it.url, it))
        return Array.from(map.values())
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  // 既存の「OGPを表示」ボタンは、textarea由来の parsedUrls を取る用途で残せる
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

  // ✅ デバウンス：入力が止まったら自動取得
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
  }, [parsedUrls]) // parsedUrls が変わったら再スケジュール

  useEffect(() => {
    if (hasLoggedPageView.current) return
    hasLoggedPageView.current = true
    sendClientLog({
      eventType: 'page_view',
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
          まず
          <br />
          「行ってみたい！」
          <br />
          をかたちにしよう
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
          COCOICO-AIはあなたがソーシャルメディアなど日常生活で発見した行きたい場所までの実行プランを提案してくれるサービスです。
        </p>

        <button
          onClick={() => {
            try {
              const url = '/plan'
              sendClientLog({
                eventType: 'start_button_click',
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
          はじめる
        </button>
      </section>

      {/* Features */}
      <section className="space-y-16 mt-20">
        <Feature
          title="比較しない"
          description="候補を並べません。ひとつだけ提案します。"
        />
        <Feature
          title="入力が少ない"
          description="タップ中心。考えることを減らします。"
        />
        <Feature
          title="共有できる"
          description="途中の状態をURLでそのまま共有。"
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
      {/* × ボタン */}
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
        aria-label="このURLを削除"
        title="削除"
      >
        ×
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

