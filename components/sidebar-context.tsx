'use client'

import { createContext, useContext } from 'react'

interface SidebarCtx {
  closeSidebar: () => void
  openSidebar:  () => void
}

export const SidebarContext = createContext<SidebarCtx>({
  closeSidebar: () => {},
  openSidebar:  () => {},
})

export function useSidebar() {
  return useContext(SidebarContext)
}
