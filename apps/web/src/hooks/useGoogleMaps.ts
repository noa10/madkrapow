'use client'

import { useState, useEffect } from 'react'
import { env } from '@/lib/validators/env'

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

let loadPromise: Promise<void> | null = null
let loadStatus: LoadStatus = 'idle'
const listeners = new Set<(status: LoadStatus) => void>()

function notifyListeners(status: LoadStatus) {
  listeners.forEach((listener) => listener(status))
}

function isReady(): boolean {
  return typeof window !== 'undefined' && window.google?.maps?.Map != null
}

function loadGoogleMapsApi(): Promise<void> {
  if (loadStatus === 'loaded') return Promise.resolve()
  if (loadStatus === 'error') return Promise.reject(new Error('Google Maps failed to load'))
  if (loadPromise) return loadPromise

  loadStatus = 'loading'
  notifyListeners('loading')

  loadPromise = new Promise<void>((resolve, reject) => {
    if (isReady()) {
      loadStatus = 'loaded'
      notifyListeners('loaded')
      resolve()
      return
    }

    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    )

    if (existingScript) {
      // Script tag already exists — poll until the async API is ready
      const interval = setInterval(() => {
        if (isReady()) {
          clearInterval(interval)
          loadStatus = 'loaded'
          notifyListeners('loaded')
          resolve()
        }
      }, 100)
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&loading=async&libraries=places,geocoding`
    script.async = true

    script.addEventListener('load', () => {
      // With loading=async, the API initializes after the script loads.
      // Poll until the Map constructor is actually available.
      const interval = setInterval(() => {
        if (isReady()) {
          clearInterval(interval)
          loadStatus = 'loaded'
          notifyListeners('loaded')
          resolve()
        }
      }, 100)
    })

    script.addEventListener('error', () => {
      loadStatus = 'error'
      notifyListeners('error')
      loadPromise = null
      reject(new Error('Failed to load Google Maps API'))
    })

    document.head.appendChild(script)
  })

  return loadPromise
}

export function useGoogleMaps() {
  const [status, setStatus] = useState<LoadStatus>(loadStatus)

  useEffect(() => {
    listeners.add(setStatus)

    if (loadStatus === 'idle') {
      loadGoogleMapsApi().catch(() => {})
    }

    return () => {
      listeners.delete(setStatus)
    }
  }, [])

  return {
    isLoaded: status === 'loaded',
    loadError: status === 'error' ? new Error('Google Maps failed to load') : null,
  }
}
