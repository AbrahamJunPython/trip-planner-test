export default function Loading() {
  return (
    <div className="min-h-screen bg-[#f6f7f9] flex items-center justify-center p-6">
      <div className="text-center max-w-md mx-auto w-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-6"></div>
        
        {/* プログレスバー */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div className="bg-emerald-500 h-2 rounded-full animate-pulse" style={{width: '60%'}}></div>
        </div>
        
        <p className="text-gray-600 text-center">読み込み中...</p>
      </div>
    </div>
  )
}