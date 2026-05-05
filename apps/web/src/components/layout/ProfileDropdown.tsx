'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { User, LayoutDashboard, ShoppingBag, LogOut, ChevronDown } from 'lucide-react'
import { getBrowserClient } from '@/lib/supabase/client'

interface ProfileDropdownProps {
  userName?: string | null
  userEmail?: string | null
  userAvatarUrl?: string | null
  isAdmin?: boolean
}

export function ProfileDropdown({ userName, userEmail, userAvatarUrl, isAdmin }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = async () => {
    const supabase = getBrowserClient()
    await supabase.auth.signOut()
    setIsOpen(false)
    router.push('/')
  }

  const initial = userName?.charAt(0)?.toUpperCase() || userEmail?.charAt(0)?.toUpperCase() || '?'

  return (
    <div className="relative hidden sm:block" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
      >
        {userAvatarUrl ? (
          <div className="relative h-6 w-6 rounded-full overflow-hidden">
            <Image
              src={userAvatarUrl}
              alt="Profile"
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-semibold normal-case tracking-normal">
            {initial}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-56 rounded-lg border border-border bg-popover shadow-lg overflow-hidden z-50">
          {userName && (
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              {userAvatarUrl ? (
                <div className="relative h-8 w-8 rounded-full overflow-hidden shrink-0">
                  <Image
                    src={userAvatarUrl}
                    alt="Profile"
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{userName}</p>
                {userEmail && (
                  <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                )}
              </div>
            </div>
          )}
          <div className="py-1">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground hover:bg-accent transition-colors"
            >
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              Dashboard
            </Link>
            <Link
              href="/orders"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground hover:bg-accent transition-colors"
            >
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              Order History
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground hover:bg-accent transition-colors"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Admin Panel
              </Link>
            )}
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-popover-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ProfileButton() {
  return (
    <Link
      href="/profile"
      className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold sm:hidden"
    >
      <User className="h-3.5 w-3.5" />
    </Link>
  )
}
