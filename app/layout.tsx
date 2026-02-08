import './globals.css'
import { MobileShell } from './components/MobileShell'
import { ErrorBoundary } from './components/ErrorBoundary'

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
      </body>
    </html>
  )
}

