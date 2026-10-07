import { useEffect, useState } from 'react'
import type { Task } from './types/Task'
import './App.css'
import Login from './Login'
import { Avatar, AvatarPicker } from './Avatar'
import { addToQueue, loadQueue, sendChange, syncQueue } from './offlineQueue'
import History from './History'
const API_URL = '/api'

// Other = tasks with no fixed schedule, like defrosting the freezer
const sections = ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Other']

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
  const [pendingCount, setPendingCount] = useState(loadQueue().length)
  const [view, setView] = useState<'tasks' | 'history'>('tasks')
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

    // First send changes saved while offline, then load the up-to-date list
    const refresh = () => {
      syncQueue(token)
        .then(({ result, left }) => {
          setPendingCount(left)
          if (result === 'unauthorized') {
            handleLogout()
            return
          }
          if (result === 'offline') return
          return fetch(`${API_URL}/tasks`, {
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
        })
        .catch((error) => console.error('Failed to fetch tasks:', error))
    }

    refresh()

    // Try again when the phone gets its connection back, and every 20 s while changes wait
    window.addEventListener('online', refresh)
    const timer = setInterval(() => {
      if (loadQueue().length > 0) refresh()
    }, 20000)

    fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setMe(data))
      .catch((error) => console.error('Failed to fetch profile:', error))

    return () => {
      window.removeEventListener('online', refresh)
      clearInterval(timer)
    }
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
    if (!task || !token) return

    const change = { taskId: id, completed: !task.completed, at: new Date().toISOString() }

    // If older changes are still waiting, this one waits too so the order stays right
    const result = loadQueue().length > 0 ? 'offline' : await sendChange(change, token)

    if (result === 'unauthorized') {
      handleLogout()
      return
    }
    if (result === 'rejected') {
      console.error('Server did not accept the change')
      return
    }
    if (result === 'offline') {
      setPendingCount(addToQueue(change).length)
    }

    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              completed: change.completed,
              completedBy: change.completed ? me?.username ?? null : null,
              completedByShape: change.completed ? me?.shape ?? null : null,
              completedByColor: change.completed ? me?.color ?? null : null,
              completedAt: change.completed ? change.at : null,
              pending: result === 'offline',
            }
          : t
      )
    )
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
      {pendingCount > 0 && (
        <p className="offline-banner">
          Offline: {pendingCount} change{pendingCount === 1 ? '' : 's'} saved on this phone.
          They are sent when the house computer can be reached.
        </p>
      )}

      <div className="profile view-tabs">
        <button onClick={() => setView('tasks')} disabled={view === 'tasks'}>Tasks</button>
        <button onClick={() => setView('history')} disabled={view === 'history'}>History</button>
      </div>

      {view === 'history' && <History token={token} onUnauthorized={handleLogout} />}

      {view === 'tasks' && <h2>Tasks</h2>}

      {view === 'tasks' && sections.map((section) => {
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
                <p className="points">+{task.points} pts</p>
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
                {task.pending && <p>Waiting to sync</p>}

                <div className="complete-row">
                  <button className="complete-button" onClick={() => toggleTask(task.id)}>
                    {task.completed ? 'Undo' : 'Complete'}
                  </button>
                </div>

                {hasDetails(task) && (
                  <div className="task-actions">
                    <button
                      className="instructions-button"
                      onClick={() =>
                        setOpenTaskId(openTaskId === task.id ? null : task.id)
                      }
                    >
                      {openTaskId === task.id ? '▼' : '▶'} Instructions
                    </button>
                  </div>
                )}

                {openTaskId === task.id && (
                  <div className="task-details">
                    {task.instructions.length > 0 && (
                      <>
                        <h4>Steps</h4>
                        <ol>
                          {task.instructions.map((instruction) => (
                            <li key={instruction}>{instruction}</li>
                          ))}
                        </ol>
                      </>
                    )}

                    {task.supplies.length > 0 && (
                      <>
                        <h4>Tools</h4>
                        <ul>
                          {task.supplies.map((supply) => (
                            <li key={supply}>{supply}</li>
                          ))}
                        </ul>
                      </>
                    )}

                    {task.supplyLocation && (
                      <>
                        <h4>Where to find them</h4>
                        <p>{task.supplyLocation}</p>
                      </>
                    )}
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