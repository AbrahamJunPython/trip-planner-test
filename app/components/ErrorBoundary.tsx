'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen bg-[#f6f7f9] flex items-center justify-center">
            <div className="max-w-md mx-auto p-6 bg-white rounded-xl shadow text-center">
              <h2 className="text-lg font-bold text-red-600 mb-4">
                エラーが発生しました
              </h2>
              <p className="text-gray-600 mb-4">
                申し訳ございません。予期しないエラーが発生しました。
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-semibold"
              >
                ページを再読み込み
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}