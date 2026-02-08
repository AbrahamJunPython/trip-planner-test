import Link from 'next/link'
import Image from 'next/image'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f6f7f9] flex items-center justify-center">
      <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow text-center">
        <div className="mb-6 flex justify-center">
          <Image
            src="/cocoico-ai_logo.png"
            alt="Trip Planner"
            width={80}
            height={80}
            priority
          />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          ページが見つかりません
        </h2>
        
        <p className="text-gray-600 mb-6">
          お探しのページは存在しないか、移動した可能性があります。
        </p>
        
        <Link 
          href="/"
          className="inline-block px-6 py-3 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 transition"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  )
}