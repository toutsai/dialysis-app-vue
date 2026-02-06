import { useState, useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/firebase'
import { useAuthStore } from '@/hooks/useAuth'
import router from '@/router'
import '@/App.css'

function App() {
  const [authReady, setAuthReady] = useState(false)
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser)
  const setAuthLoading = useAuthStore((state) => state.setAuthLoading)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult()
        const claims = tokenResult.claims
        setCurrentUser({
          id: firebaseUser.uid,
          uid: firebaseUser.uid,
          name: (claims.name as string) || firebaseUser.displayName || '',
          role: (claims.role as string) || 'viewer',
          title: (claims.title as string) || '',
          email: firebaseUser.email || '',
          lastLogin: new Date().toISOString(),
        })
      } else {
        setCurrentUser(null)
      }
      setAuthLoading(false)
      setAuthReady(true)
    })

    return () => unsubscribe()
  }, [setCurrentUser, setAuthLoading])

  if (!authReady) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '1.2rem',
          color: '#666',
        }}
      >
        系統載入中...
      </div>
    )
  }

  return <RouterProvider router={router} />
}

export default App
