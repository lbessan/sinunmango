'use client'

import { useRouter } from 'next/navigation'
import { TourOverlay } from './tour-overlay'

export function TourTrigger() {
  const router = useRouter()
  return <TourOverlay onDone={() => router.replace('/dashboard')} />
}
