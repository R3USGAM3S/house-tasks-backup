import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'

interface HistoryItem {
  id: number
  taskName: string
  points: number
  username: string
  shape: string
  color: string
  completedAt: string
}

interface Props {
  token: string
  onUnauthorized: () => void
}

// Latest completed tasks: who did what, when, and how many points it gave
function History({ token, onUnauthorized }: Props) {
  const [items, setItems] = useState<HistoryItem[] | null>(null)

  useEffect(() => {
    fetch('/api/history', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (response.status === 401) {
          onUnauthorized()
          return []
        }
        return response.json()
      })
      .then((data) => setItems(data))
      .catch((error) => {
        console.error('Failed to fetch history:', error)
        setItems([])
      })
  }, [token])

  if (items === null) return <p>Loading...</p>
  if (items.length === 0) return <p>No completed tasks yet.</p>

  return (
    <ul className="history">
      {items.map((item) => (
        <li key={item.id}>
          <Avatar shape={item.shape} color={item.color} /> {item.username}: {item.taskName}{' '}
          <strong>+{item.points}</strong>
          <br />
          <small>{new Date(item.completedAt).toLocaleString()}</small>
        </li>
      ))}
    </ul>
  )
}

export default History