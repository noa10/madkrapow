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

function loadGoogleMapsApi(): Promise<void> {
  if (loadStatus === 'loaded') return Promise.resolve()
  if (loadStatus === 'error') return Promise.reject(new Error('Google Maps failed to load'))
  if (loadPromise) return loadPromise

  loadStatus = 'loading'
  notifyListeners('loading')

  loadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    )

    if (existingScript || window.google?.maps) {
      loadStatus = 'loaded'
      notifyListeners('loaded')
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&loading=async&libraries=places,geocoding`
    script.async = true

    script.addEventListener('load', () => {
      loadStatus = 'loaded'
      notifyListeners('loaded')
      resolve()
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
