import { useState } from 'react'
import { AvatarPicker } from './Avatar'
import { randomAvatar } from './avatarOptions'

const API_URL = '/api'

interface LoginProps {
  onLogin: (token: string) => void
}

function Login({ onLogin }: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [houseCode, setHouseCode] = useState('')
  const [error, setError] = useState('')
  const [avatar, setAvatar] = useState(randomAvatar)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    const url = isRegistering ? `${API_URL}/register` : `${API_URL}/login`
    const body = isRegistering
      ? { username, password, houseCode, shape: avatar.shape, color: avatar.color }
      : { username, password }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      onLogin(data.token)
    } catch (error) {
      console.error('Request failed:', error)
      setError('Could not reach the server')
    }
  }

  const switchMode = () => {
    setIsRegistering(!isRegistering)
    setError('')
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>House Tasks</h1>
      <h2>{isRegistering ? 'Create account' : 'Log in'}</h2>
      <input
        placeholder="Username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <input
        type="password"
        placeholder={isRegistering ? 'Password (at least 8 characters)' : 'Password'}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {isRegistering && (
        <>
          <input
            type="password"
            placeholder="House code"
            value={houseCode}
            onChange={(event) => setHouseCode(event.target.value)}
          />
          <p>Pick your shape and color</p>
          <AvatarPicker
            shape={avatar.shape}
            color={avatar.color}
            onChange={(shape, color) => setAvatar({ shape, color })}
          />
        </>
      )}
      <button type="submit">{isRegistering ? 'Create account' : 'Log in'}</button>
      <button type="button" onClick={switchMode}>
        {isRegistering ? 'Back to login' : 'New here? Create account'}
      </button>
      {error && <p>{error}</p>}
    </form>
  )
}

export default Login
