'use client'

import { createContext, useContext } from 'react'

interface SidebarCtx {
  closeSidebar: () => void
}

export const SidebarContext = createContext<SidebarCtx>({ closeSidebar: () => {} })

export function useSidebar() {
  return useContext(SidebarContext)
}
