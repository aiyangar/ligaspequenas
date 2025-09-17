import { useState, useEffect } from 'react'
import { authService } from '../lib/database'

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    // Obtener sesión inicial
    const getInitialSession = async () => {
      try {
        const currentUser = await authService.getCurrentUser()
        setUser(currentUser)
        
        // Verificar si es SuperAdmin
        if (currentUser && currentUser.email === 'ing.gustavo.cardenas@gmail.com') {
          setIsSuperAdmin(true)
        } else {
          setIsSuperAdmin(false)
        }
      } catch (error) {
        // No mostrar error en consola si no hay sesión (es normal)
        if (!error.message.includes('Auth session missing')) {
          console.error('Error al obtener usuario actual:', error)
        }
        setUser(null)
        setIsSuperAdmin(false)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Escuchar cambios de autenticación
    const { data: { subscription } } = authService.onAuthStateChange(
      (event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        
        // Verificar si es SuperAdmin
        if (currentUser && currentUser.email === 'ing.gustavo.cardenas@gmail.com') {
          setIsSuperAdmin(true)
        } else {
          setIsSuperAdmin(false)
        }
        
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    try {
      setLoading(true)
      const { user } = await authService.signIn(email, password)
      setUser(user)
      
      // Verificar si es SuperAdmin
      if (user && user.email === 'ing.gustavo.cardenas@gmail.com') {
        setIsSuperAdmin(true)
      } else {
        setIsSuperAdmin(false)
      }
      
      return { success: true, user }
    } catch (error) {
      return { success: false, error: error.message }
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email, password, userData) => {
    // Solo el SuperAdmin puede crear usuarios
    if (!isSuperAdmin) {
      return { success: false, error: 'No tienes permisos para crear usuarios' }
    }
    
    try {
      setLoading(true)
      const { user } = await authService.signUp(email, password, userData)
      return { success: true, user }
    } catch (error) {
      return { success: false, error: error.message }
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      await authService.signOut()
      setUser(null)
      setIsSuperAdmin(false)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    } finally {
      setLoading(false)
    }
  }

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!user,
    isSuperAdmin
  }
}
