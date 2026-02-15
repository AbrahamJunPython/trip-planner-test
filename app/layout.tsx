import './globals.css'
import './lib/init'
import { MobileShell } from './components/MobileShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Analytics } from "@vercel/analytics/next"

export const metadata = {
  title: "Cocoico AI",
  description: "あなた専属のお出掛け相談AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>
        <ErrorBoundary>
          <MobileShell>{children}</MobileShell>
        </ErrorBoundary>
        <Analytics />
      </body>
    </html>
  )
}

