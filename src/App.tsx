import { useEffect, useState } from 'react'
import type { Task } from './types/Task'
import './App.css'
import Login from './Login'
const API_URL = '/api'

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [tasks, setTasks] = useState<Task[]>([])



  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const handleLogin = (newToken: string) => {
    localStorage.setItem('token', newToken)
    setToken(newToken)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setToken(null)
  }

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (response.status === 401) {
          handleLogout()
          return []
        }
        return response.json()
      })
      .then((data) => setTasks(data))
      .catch((error) => console.error('Failed to fetch tasks:', error))
  }, [token])

  const toggleTask = async (id: number) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    const newCompleted = !task.completed

    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ completed: newCompleted }),
      })

      if (response.status === 401) {
        handleLogout()
        return
      }
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`)
      }

      const data = await response.json()
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                completed: data.completed,
                completedBy: data.completedBy,
                completedAt: data.completed ? new Date().toISOString() : null,
              }
            : t
        )
      )
    } catch (error) {
      console.error('Failed to update task:', error)
    }
  }

  if (!token) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <>
      <h1>House Tasks</h1>
      <button onClick={handleLogout}>Log out</button>
      <h2>Today's Tasks</h2>

      {tasks.map((task) => (
        <div
          key={task.id}
          className={task.completed ? 'task-card completed' : 'task-card'}
        >
          <h3>{task.name}</h3>
          <p>{task.frequency}</p>
          <p>Estimated time: {task.estimatedTime} min</p>
          <p>
            {task.completed
              ? `Completed by ${task.completedBy}, ${new Date(task.completedAt ?? '').toLocaleString()}`
              : 'Not completed'}
          </p>

          <div className="task-actions">
            <button
              onClick={() =>
                setOpenTaskId(openTaskId === task.id ? null : task.id)
              }
            >
              {openTaskId === task.id ? 'Hide details' : 'Show details'}
            </button>

            <button onClick={() => toggleTask(task.id)}>
              {task.completed ? 'Undo' : 'Complete'}
            </button>
          </div>

          {openTaskId === task.id && (
            <div className="task-details">
              <h4>Instructions</h4>
              <ul>
                {task.instructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>

              <h4>Supplies</h4>
              <ul>
                {task.supplies.map((supply) => (
                  <li key={supply}>{supply}</li>
                ))}
              </ul>

              <h4>Location</h4>
              <p>{task.supplyLocation}</p>
            </div>
          )}
        </div>
      ))}
    </>
  )
}

export default App