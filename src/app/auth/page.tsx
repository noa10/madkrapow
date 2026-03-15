'use client'

import { AuthForm } from '@/components/auth/AuthForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Mad Krapow</h1>
          <p className="text-gray-600 mt-2">Sign in to continue</p>
        </div>

        <AuthForm />
      </div>
    </div>
  )
}