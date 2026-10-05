

import { useState } from 'react'
 
const API_URL = 'http://localhost:3001/api'
 
interface LoginProps {
  onLogin: (token: string) => void
}
 
function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
 
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
 
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await response.json()
 
      if (!response.ok) {
        setError(data.error ?? 'Login failed')
        return
      }
 
      onLogin(data.token)
    } catch (error) {
      console.error('Login failed:', error)
      setError('Could not reach the server')
    }
  }
 
  return (
    <form onSubmit={handleSubmit}>
      <h1>House Tasks</h1>
      <h2>Log in</h2>
      <input
        placeholder="Username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button type="submit">Log in</button>
      {error && <p>{error}</p>}
    </form>
  )
}
 
export default Login