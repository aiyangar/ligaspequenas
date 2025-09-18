import React from 'react'
import { useAuth } from '../hooks/useAuth'
import { LoginForm } from './forms'

export const Auth = ({ onAuthSuccess }) => {
  const { signIn } = useAuth()

  return (
    <LoginForm 
      onAuthSuccess={onAuthSuccess}
      signIn={signIn}
    />
  )
}