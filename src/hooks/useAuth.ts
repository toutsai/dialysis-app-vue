import { useMemo } from 'react'
import { create } from 'zustand'
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '@/firebase'

// ============================================================
// Types
// ============================================================

export interface AppUser {
  id: string
  uid: string
  name: string
  role: string
  title: string
  email: string
  lastLogin: string
}

export interface AuthClaims {
  role?: string
  name?: string
  title?: string
  [key: string]: unknown
}

type RoleName = 'viewer' | 'contributor' | 'editor' | 'admin'

const ROLE_HIERARCHY: Record<RoleName, number> = {
  viewer: 1,
  contributor: 2,
  editor: 3,
  admin: 4,
}

// ============================================================
// Zustand Store
// ============================================================

interface AuthState {
  currentUser: AppUser | null
  authLoading: boolean
  claims: AuthClaims
  _authInitResolve: (() => void) | null
  _authInitPromise: Promise<void>

  setCurrentUser: (user: AppUser | null) => void
  setAuthLoading: (loading: boolean) => void
  setClaims: (claims: AuthClaims) => void
  initAuthListener: () => () => void
  login: (username: string, password: string) => Promise<AppUser>
  logout: () => Promise<void>
  updatePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message: string }>
  waitForAuthInit: () => Promise<void>
}

let authListenerInitialized = false

export const useAuthStore = create<AuthState>((set, get) => {
  let resolveAuthInit: (() => void) | null = null
  const authInitPromise = new Promise<void>((resolve) => {
    resolveAuthInit = resolve
  })

  return {
    currentUser: null,
    authLoading: true,
    claims: {},
    _authInitResolve: resolveAuthInit,
    _authInitPromise: authInitPromise,

    setCurrentUser: (user: AppUser | null) => {
      set({ currentUser: user })
    },

    setAuthLoading: (loading: boolean) => {
      set({ authLoading: loading })
    },

    setClaims: (claims: AuthClaims) => {
      set({ claims })
    },

    initAuthListener: () => {
      if (authListenerInitialized) {
        return () => {}
      }
      authListenerInitialized = true

      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
        const { _authInitResolve } = get()

        if (firebaseUser) {
          try {
            const tokenResult = await firebaseUser.getIdTokenResult()
            const claims = tokenResult.claims as AuthClaims

            const appUser: AppUser = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              name: (claims.name as string) || firebaseUser.displayName || '',
              role: (claims.role as string) || 'viewer',
              title: (claims.title as string) || '',
              email: firebaseUser.email || '',
              lastLogin: new Date().toISOString(),
            }

            set({
              currentUser: appUser,
              claims,
              authLoading: false,
            })
          } catch (error) {
            console.error('[useAuth] Error processing auth state:', error)
            set({
              currentUser: null,
              claims: {},
              authLoading: false,
            })
          }
        } else {
          set({
            currentUser: null,
            claims: {},
            authLoading: false,
          })
        }

        if (_authInitResolve) {
          _authInitResolve()
          set({ _authInitResolve: null })
        }
      })

      return () => {
        unsubscribe()
        authListenerInitialized = false
      }
    },

    login: async (username: string, password: string): Promise<AppUser> => {
      set({ authLoading: true })

      try {
        const customLogin = httpsCallable<
          { username: string; password: string },
          { token: string }
        >(functions, 'customLogin')

        const result = await customLogin({ username, password })
        const { token } = result.data

        const userCredential = await signInWithCustomToken(auth, token)
        const firebaseUser = userCredential.user

        const tokenResult = await firebaseUser.getIdTokenResult()
        const claims = tokenResult.claims as AuthClaims

        const appUser: AppUser = {
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          name: (claims.name as string) || firebaseUser.displayName || '',
          role: (claims.role as string) || 'viewer',
          title: (claims.title as string) || '',
          email: firebaseUser.email || '',
          lastLogin: new Date().toISOString(),
        }

        set({
          currentUser: appUser,
          claims,
          authLoading: false,
        })

        return appUser
      } catch (error) {
        set({ authLoading: false })
        throw error
      }
    },

    logout: async () => {
      try {
        await signOut(auth)
        set({
          currentUser: null,
          claims: {},
          authLoading: false,
        })
      } catch (error) {
        console.error('[useAuth] Logout error:', error)
        throw error
      }
    },

    updatePassword: async (oldPassword: string, newPassword: string) => {
      const changeUserPassword = httpsCallable<
        { oldPassword: string; newPassword: string },
        { success: boolean; message: string }
      >(functions, 'changeUserPassword')

      const result = await changeUserPassword({ oldPassword, newPassword })
      return result.data
    },

    waitForAuthInit: () => {
      return get()._authInitPromise
    },
  }
})

// ============================================================
// Permission helpers (pure functions)
// ============================================================

function getRoleLevel(role: string | undefined): number {
  if (!role) return 0
  return ROLE_HIERARCHY[role as RoleName] || 0
}

function hasPermission(userRole: string | undefined, requiredRole: RoleName): boolean {
  return getRoleLevel(userRole) >= ROLE_HIERARCHY[requiredRole]
}

// ============================================================
// Convenience hook
// ============================================================

export function useAuth() {
  const currentUser = useAuthStore((state) => state.currentUser)
  const authLoading = useAuthStore((state) => state.authLoading)
  const claims = useAuthStore((state) => state.claims)
  const login = useAuthStore((state) => state.login)
  const logout = useAuthStore((state) => state.logout)
  const updatePassword = useAuthStore((state) => state.updatePassword)
  const initAuthListener = useAuthStore((state) => state.initAuthListener)
  const waitForAuthInit = useAuthStore((state) => state.waitForAuthInit)

  const role = currentUser?.role

  const isLoggedIn = useMemo(() => currentUser !== null, [currentUser])
  const isAdmin = useMemo(() => role === 'admin', [role])
  const isEditor = useMemo(() => hasPermission(role, 'editor'), [role])
  const isContributor = useMemo(() => hasPermission(role, 'contributor'), [role])
  const isViewer = useMemo(() => hasPermission(role, 'viewer'), [role])

  const canManagePhysicianSchedule = useMemo(() => hasPermission(role, 'admin'), [role])
  const canManageOrders = useMemo(() => hasPermission(role, 'editor'), [role])
  const canEditSchedules = useMemo(() => hasPermission(role, 'editor'), [role])
  const canEditPatients = useMemo(() => hasPermission(role, 'contributor'), [role])
  const canEditClinicalNotesAndOrders = useMemo(() => hasPermission(role, 'contributor'), [role])

  const checkPermission = useMemo(
    () => (requiredRole: RoleName) => hasPermission(role, requiredRole),
    [role],
  )

  return {
    currentUser,
    authLoading,
    claims,
    login,
    logout,
    updatePassword,
    initAuthListener,
    waitForAuthInit,

    isLoggedIn,
    isAdmin,
    isEditor,
    isContributor,
    isViewer,
    hasPermission: checkPermission,

    canManagePhysicianSchedule,
    canManageOrders,
    canEditSchedules,
    canEditPatients,
    canEditClinicalNotesAndOrders,
  }
}
