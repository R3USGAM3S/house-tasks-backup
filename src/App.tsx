import { useEffect, useState } from 'react'
import type { Task } from './types/Task'
import './App.css'
import Login from './Login'
import { Avatar, AvatarPicker } from './Avatar'
const API_URL = '/api'

const sections = ['Daily', 'Weekly', 'Biweekly', 'Monthly']

interface Profile {
  username: string
  shape: string
  color: string
}

// Only show the details button when the task has something to show
const hasDetails = (task: Task) =>
  task.instructions.length > 0 || task.supplies.length > 0 || Boolean(task.supplyLocation)

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [tasks, setTasks] = useState<Task[]>([])
  const [me, setMe] = useState<Profile | null>(null)
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<number | null>(null)
  const [openSection, setOpenSection] = useState<string | null>(null)
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

    fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setMe(data))
      .catch((error) => console.error('Failed to fetch profile:', error))
  }, [token])

  const saveProfile = async (shape: string, color: string) => {
    if (!me) return

    try {
      const response = await fetch(`${API_URL}/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shape, color }),
      })
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`)
      }

      setMe({ ...me, shape, color })
      // Tasks this user has completed show the new avatar right away
      setTasks((prev) =>
        prev.map((t) =>
          t.completedBy === me.username
            ? { ...t, completedByShape: shape, completedByColor: color }
            : t
        )
      )
    } catch (error) {
      console.error('Failed to save profile:', error)
    }
  }

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
                completedByShape: data.completed ? me?.shape ?? null : null,
                completedByColor: data.completed ? me?.color ?? null : null,
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

      {me && (
        <div className="profile">
          <button onClick={() => setIsEditingProfile(!isEditingProfile)}>
            <Avatar shape={me.shape} color={me.color} /> {me.username}
          </button>
          <button onClick={handleLogout}>Log out</button>
        </div>
      )}

      {me && isEditingProfile && (
        <AvatarPicker shape={me.shape} color={me.color} onChange={saveProfile} />
      )}
      <h2>Tasks</h2>

      {sections.map((section) => {
        const sectionTasks = tasks.filter((task) => task.frequency === section)
        const doneCount = sectionTasks.filter((task) => task.completed).length
        const isOpen = openSection === section
        const allDone = sectionTasks.length > 0 && doneCount === sectionTasks.length

        return (
          <div key={section} className="section">
            <button
              className={allDone ? 'section-button all-done' : 'section-button'}
              onClick={() => setOpenSection(isOpen ? null : section)}
            >
              <span>{isOpen ? '▼' : '▶'} {section}</span>
              <span>{doneCount}/{sectionTasks.length}</span>
            </button>

            {isOpen && sectionTasks.map((task) => (
              <div
                key={task.id}
                className={task.completed ? 'task-card completed' : 'task-card'}
              >
                <h3>{task.name}</h3>
                {task.estimatedTime && <p>Estimated time: {task.estimatedTime} min</p>}
                {task.completed ? (
                  <p>
                    Completed by{' '}
                    <Avatar shape={task.completedByShape} color={task.completedByColor} />{' '}
                    {task.completedBy}, {new Date(task.completedAt ?? '').toLocaleString()}
                  </p>
                ) : (
                  <p>Not completed</p>
                )}

                <div className="task-actions">
                  {hasDetails(task) && (
                    <button
                      onClick={() =>
                        setOpenTaskId(openTaskId === task.id ? null : task.id)
                      }
                    >
                      {openTaskId === task.id ? 'Hide details' : 'Show details'}
                    </button>
                  )}

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
          </div>
        )
      })}
    </>
  )
}

export default App