export const MobileShell = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-green-200 flex justify-center p-6">
      <main className="w-full max-w-[420px] bg-white rounded-2xl px-6 py-12 shadow-sm">
        {children}
      </main>
    </div>
  )
}

