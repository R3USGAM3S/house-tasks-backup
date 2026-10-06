import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import './App.css'

const API_URL = '/api/admin'

interface AdminInfo {
  addresses: { url: string; qr: string }[]
  userCount: number
  taskCount: number
}

interface AdminUser {
  id: number
  username: string
  shape: string
  color: string
  completionCount: number
}

const TOKEN_KEY = 'adminToken'

class LoginRequired extends Error {}

function adminHeaders() {
  return { Authorization: `Bearer ${sessionStorage.getItem(TOKEN_KEY) ?? ''}` }
}

async function fetchAdminData(): Promise<{ info: AdminInfo; users: AdminUser[] }> {
  const [infoResponse, usersResponse] = await Promise.all([
    fetch(`${API_URL}/info`, { headers: adminHeaders() }),
    fetch(`${API_URL}/users`, { headers: adminHeaders() }),
  ])
  if (infoResponse.status === 401 || usersResponse.status === 401) {
    throw new LoginRequired()
  }
  if (!infoResponse.ok || !usersResponse.ok) {
    throw new Error('Could not load admin data')
  }
  return { info: await infoResponse.json(), users: await usersResponse.json() }
}

// Admin page: open /admin and log in with ADMIN_PASSWORD.
// The login lasts 2 hours or until the browser tab is closed.
function Admin() {
  const [info, setInfo] = useState<AdminInfo | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [message, setMessage] = useState('')
  const [loggedIn, setLoggedIn] = useState(Boolean(sessionStorage.getItem(TOKEN_KEY)))
  const [password, setPassword] = useState('')

  function load() {
    fetchAdminData()
      .then((data) => {
        setInfo(data.info)
        setUsers(data.users)
      })
      .catch((error) => {
        if (error instanceof LoginRequired) {
          sessionStorage.removeItem(TOKEN_KEY)
          setLoggedIn(false)
          return
        }
        setMessage(error.message)
      })
  }

  useEffect(() => {
    if (loggedIn) load()
  }, [loggedIn])

  async function logIn(event: React.FormEvent) {
    event.preventDefault()
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error ?? 'Login failed')
      return
    }
    sessionStorage.setItem(TOKEN_KEY, data.token)
    setPassword('')
    setMessage('')
    setLoggedIn(true)
  }

  async function runAction(question: string, url: string, method: string, done: string) {
    if (!window.confirm(question)) return
    const response = await fetch(url, { method, headers: adminHeaders() })
    setMessage(response.ok ? done : 'Something went wrong')
    load()
  }

  if (!loggedIn) {
    return (
      <form onSubmit={logIn}>
        <h1>House Tasks Admin</h1>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit">Log in</button>
        {message && <p>{message}</p>}
      </form>
    )
  }

  return (
    <>
      <h1>House Tasks Admin</h1>

      <div className="admin-box">
        <h2>Open on phone</h2>
        {info?.addresses.length === 0 && <p>No address found</p>}
        {info?.addresses.map((address) => (
          <div key={address.url} className="admin-qr">
            <img src={address.qr} alt={`QR code for ${address.url}`} />
            <p className="admin-address">{address.url}</p>
          </div>
        ))}
        <p>Scan with the phone camera, then add the page to the home screen.</p>
        {info && <p>Users: {info.userCount} · Tasks: {info.taskCount}</p>}
      </div>

      {message && <p className="admin-message">{message}</p>}

      <div className="admin-box">
        <h2>Users</h2>
        {users.length === 0 && <p>No users yet</p>}
        {users.map((user) => (
          <div key={user.id} className="admin-row">
            <span>
              <Avatar shape={user.shape} color={user.color} /> {user.username} ({user.completionCount} done)
            </span>
            <button
              onClick={() =>
                runAction(
                  `Delete user ${user.username}?`,
                  `${API_URL}/users/${user.id}`,
                  'DELETE',
                  `Deleted ${user.username}`,
                )
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <div className="admin-box">
        <h2>Reset</h2>
        <div className="admin-actions">
          <button
            onClick={() =>
              runAction(
                'Delete ALL users and their completed tasks?',
                `${API_URL}/clear-users`,
                'POST',
                'All users deleted',
              )
            }
          >
            Clear all users
          </button>
          <button
            onClick={() =>
              runAction(
                'Mark all tasks as not done? Completion history is deleted.',
                `${API_URL}/clear-completions`,
                'POST',
                'All tasks marked not done',
              )
            }
          >
            Clear completed tasks
          </button>
          <button
            onClick={() =>
              runAction(
                'Replace all tasks with the task list file? Completion history is deleted.',
                `${API_URL}/reset-tasks`,
                'POST',
                'Task list reloaded',
              )
            }
          >
            Reload task list
          </button>
        </div>
      </div>
    </>
  )
}

export default Admin
