// src/hooks/useUserDirectory.ts
// Hook that provides a cached user directory fetched from the 'users' collection.

import { useState, useEffect, useCallback, useRef } from 'react'
import ApiManager from '@/services/api_manager'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: string
  uid?: string
  name?: string
  displayName?: string
  role?: string
  title?: string
  email?: string
  [key: string]: unknown
}

interface UseUserDirectoryReturn {
  /** Full list of all users */
  allUsers: UserRecord[]
  /** Look up a single user by their document ID */
  getUserById: (id: string) => UserRecord | undefined
  /** Look up user(s) by name (partial match, case-insensitive) */
  getUserByName: (name: string) => UserRecord | undefined
  /** Whether the initial fetch is in progress */
  isLoading: boolean
  /** Error string if the fetch failed */
  error: string | null
  /** Re-fetch the user list from Firestore */
  refresh: () => Promise<void>
}

const usersApi = ApiManager<UserRecord>('users')

// Module-level cache so the user list is shared across all hook consumers and
// survives component re-mounts without hitting Firestore again.
let cachedUsers: UserRecord[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function isCacheValid(): boolean {
  return cachedUsers !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS
}

/**
 * Hook that fetches all users from the Firestore `users` collection and
 * exposes convenience lookup helpers.
 *
 * The user list is cached at the module level so that multiple components
 * consuming this hook share the same data without redundant fetches.
 */
export function useUserDirectory(): UseUserDirectoryReturn {
  const [allUsers, setAllUsers] = useState<UserRecord[]>(cachedUsers || [])
  const [isLoading, setIsLoading] = useState<boolean>(!isCacheValid())
  const [error, setError] = useState<string | null>(null)

  // Guard to prevent state updates after unmount
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fetchUsers = useCallback(async (force = false) => {
    if (!force && isCacheValid()) {
      // Use the module-level cache
      if (mountedRef.current) {
        setAllUsers(cachedUsers!)
        setIsLoading(false)
      }
      return
    }

    if (mountedRef.current) {
      setIsLoading(true)
      setError(null)
    }

    try {
      const users = await usersApi.fetchAll()
      cachedUsers = users
      cacheTimestamp = Date.now()

      if (mountedRef.current) {
        setAllUsers(users)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users'
      console.error('[useUserDirectory] fetch failed:', err)
      if (mountedRef.current) {
        setError(message)
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  // Auto-fetch on mount
  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // ----- Lookup helpers -----

  const getUserById = useCallback(
    (id: string): UserRecord | undefined => {
      return allUsers.find((u) => u.id === id || u.uid === id)
    },
    [allUsers],
  )

  const getUserByName = useCallback(
    (name: string): UserRecord | undefined => {
      if (!name) return undefined
      const lower = name.toLowerCase()
      return allUsers.find((u) => {
        const uName = (u.name || u.displayName || '').toLowerCase()
        return uName === lower || uName.includes(lower) || lower.includes(uName)
      })
    },
    [allUsers],
  )

  const refresh = useCallback(async () => {
    await fetchUsers(true)
  }, [fetchUsers])

  return {
    allUsers,
    getUserById,
    getUserByName,
    isLoading,
    error,
    refresh,
  }
}

export default useUserDirectory
