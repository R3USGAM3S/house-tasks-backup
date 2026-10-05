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

const allowedFrequencies = ['Daily', 'Weekly', 'Biweekly', 'Monthly']

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

app.get('/api/tasks', (req, res) => {
  db.all('SELECT * FROM tasks', (error, rows) => {
    if (error) {
      console.error('Failed to fetch tasks:', error.message)
      res.status(500).json({ error: 'Failed to fetch tasks' })
      return
    }

    const tasks = rows.map((row) => ({
      id: row.id,
      name: row.name,
      frequency: row.frequency,
      completed: Boolean(row.completed),
      estimatedTime: row.estimated_time,
      instructions: JSON.parse(row.instructions) ?? [],   
      supplies: JSON.parse(row.supplies) ?? [], 
      supplyLocation: row.supply_location,
    }))

    res.json(tasks)
  })
})
app.post('/api/tasks', (req, res) => {
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
app.patch('/api/tasks/:id', (req, res) => {
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

  db.run(
    'UPDATE tasks SET completed = ? WHERE id = ?',
    [body.completed ? 1 : 0, id],
    function (error) {
      if (error) {
        console.error('Failed to update task:', error.message)
        res.status(500).json({ error: 'Failed to update task' })
        return
      }
      if (this.changes === 0) {
        res.status(404).json({ error: 'Task not found' })
        return
      }
      res.json({ id, completed: body.completed })
    }
  )
})
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})