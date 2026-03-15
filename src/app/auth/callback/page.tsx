'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function AuthCallbackPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          setError(sessionError.message)
          setLoading(false)
          return
        }

        if (session) {
          window.location.href = '/'
          return
        }

        const urlParams = new URL(window.location.href)
        const params = new URLSearchParams(urlParams.search)
        const code = params.get('code')
        const errorCode = params.get('error_code')
        const errorDescription = params.get('error_description')

        if (errorCode) {
          setError(errorDescription || 'Authentication failed')
          setLoading(false)
          return
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('Code exchange error:', exchangeError)
            setError(exchangeError.message)
          } else {
            window.location.href = '/'
            return
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Callback error:', err)
        setError('An unexpected error occurred')
        setLoading(false)
      }
    }

    handleCallback()
  }, [supabase])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Signing you in...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Error</h1>
        <p className="text-gray-600 mb-6">{error || 'Something went wrong'}</p>
        <a
          href="/auth"
          className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
        >
          Try Again
        </a>
      </div>
    </div>
  )
}