'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Evitar mismatch de hidratación — renderizar solo en cliente
  useEffect(() => setMounted(true), [])
  if (!mounted) return (
    <div className="h-9 w-full rounded-item bg-white/4 animate-pulse" />
  )

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-item text-white/50 hover:text-white hover:bg-white/6 transition-all duration-150 text-sm font-semibold group"
    >
      {isDark
        ? <Sun  size={17} className="shrink-0 text-warning-300 group-hover:text-warning-200" />
        : <Moon size={17} className="shrink-0 text-info-300 group-hover:text-info-200" />
      }
      <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
  )
}
