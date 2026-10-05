const express = require('express')
const cors = require('cors')
const db = require('./database')
const app = express()
const PORT = 3001
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('JWT_SECRET puuttuu')
  process.exit(1)
}

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())
function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Login required' })
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

const allowedFrequencies = ['Daily', 'Weekly', 'Biweekly', 'Monthly']

// Start of the current period for a task: a completion after this counts as done.
function periodStart(frequency) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (frequency === 'Weekly') {
    const daysSinceMonday = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - daysSinceMonday)
  } else if (frequency === 'Biweekly') {
    start.setDate(start.getDate() - 13)
  } else if (frequency === 'Monthly') {
    start.setDate(1)
  }
  return start.toISOString()
}

function validateTask(task) {
  const errors = []

  if (typeof task.name !== 'string' || task.name.trim() === '') {
    errors.push('name is required')
  }
  if (!allowedFrequencies.includes(task.frequency)) {
    errors.push(`frequency must be one of: ${allowedFrequencies.join(', ')}`)
  }
  if (task.estimatedTime !== undefined &&
      (!Number.isInteger(task.estimatedTime) || task.estimatedTime <= 0)) {
    errors.push('estimatedTime must be a positive whole number')
  }
  if (task.instructions !== undefined && !Array.isArray(task.instructions)) {
    errors.push('instructions must be a list')
  }
  if (task.supplies !== undefined && !Array.isArray(task.supplies)) {
    errors.push('supplies must be a list')
  }

  return errors
}

app.get('/api/tasks', requireAuth, (req, res) => {
  const sql = `
    SELECT tasks.*, completions.completed_at, users.username AS completed_by
    FROM tasks
    LEFT JOIN completions ON completions.id = (
      SELECT id FROM completions
      WHERE task_id = tasks.id
      ORDER BY completed_at DESC
      LIMIT 1
    )
    LEFT JOIN users ON users.id = completions.user_id
  `

  db.all(sql, (error, rows) => {
    if (error) {
      console.error('Failed to fetch tasks:', error.message)
      res.status(500).json({ error: 'Failed to fetch tasks' })
      return
    }

    const tasks = rows.map((row) => {
      const completed =
        row.completed_at !== null && row.completed_at >= periodStart(row.frequency)

      return {
        id: row.id,
        name: row.name,
        frequency: row.frequency,
        completed,
        completedBy: completed ? row.completed_by : null,
        completedAt: completed ? row.completed_at : null,
        estimatedTime: row.estimated_time,
        instructions: JSON.parse(row.instructions) ?? [],
        supplies: JSON.parse(row.supplies) ?? [],
        supplyLocation: row.supply_location,
      }
    })

    res.json(tasks)
  })
})
app.post('/api/tasks', requireAuth, (req, res) => {
  const body = req.body ?? {}
  const errors = validateTask(body)

  if (errors.length > 0) {
    res.status(400).json({ errors })
    return
  }

  const {
    name,
    frequency,
    estimatedTime,
    instructions = [],
    supplies = [],
    supplyLocation = '',
  } = body

  const sql = `
    INSERT INTO tasks (
      name,
      frequency,
      completed,
      estimated_time,
      instructions,
      supplies,
      supply_location
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `

  db.run(
    sql,
    [
      name,
      frequency,
      0,
      estimatedTime,
      JSON.stringify(instructions),
      JSON.stringify(supplies),
      supplyLocation,
    ],
    function (error) {
      if (error) {
        console.error('Failed to create task:', error.message)
        res.status(500).json({ error: 'Failed to create task' })
        return
      }

      res.status(201).json({
        id: this.lastID,
        name,
        frequency,
        completed: false,
        estimatedTime,
        instructions,
        supplies,
        supplyLocation,
      })
    }
  )
})
app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {}
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' })
  }
  db.get('SELECT * FROM users WHERE username = ?', [username], async (error, user) => {
    if (error) return res.status(500).json({ error: 'Database error' })
    const ok = user && await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid username or password' })
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' })
    res.json({ token })
  })
})
app.patch('/api/tasks/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const body = req.body ?? {}

  if (!Number.isInteger(id)) {
    res.status(400).json({ errors: ['id must be a number'] })
    return
  }
  if (typeof body.completed !== 'boolean') {
    res.status(400).json({ errors: ['completed must be true or false'] })
    return
  }

  db.get('SELECT frequency FROM tasks WHERE id = ?', [id], (error, task) => {
    if (error) {
      console.error('Failed to update task:', error.message)
      res.status(500).json({ error: 'Failed to update task' })
      return
    }
    if (!task) {
      res.status(404).json({ error: 'Task not found' })
      return
    }

    // Complete adds a new completion; Undo removes the ones from the current period.
    const sql = body.completed
      ? 'INSERT INTO completions (task_id, user_id, completed_at) VALUES (?, ?, ?)'
      : 'DELETE FROM completions WHERE task_id = ? AND completed_at >= ?'
    const params = body.completed
      ? [id, req.user.userId, new Date().toISOString()]
      : [id, periodStart(task.frequency)]

    db.run(sql, params, (error) => {
      if (error) {
        console.error('Failed to update task:', error.message)
        res.status(500).json({ error: 'Failed to update task' })
        return
      }
      res.json({
        id,
        completed: body.completed,
        completedBy: body.completed ? req.user.username : null,
      })
    })
  })
})
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})