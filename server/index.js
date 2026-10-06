const express = require('express')
const path = require('path')
const os = require('os')
const QRCode = require('qrcode')
const cors = require('cors')
const db = require('./database')
const syncTasks = require('./syncTasks')
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
 
const allowedFrequencies = ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Other']
 
// Keep these in sync with src/avatarOptions.ts
const allowedShapes = ['circle', 'square', 'triangle', 'diamond', 'star', 'heart']
const allowedColors = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#16a34a',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
]
 
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
  } else if (frequency === 'Other') {
    // No fixed schedule: shows as done for 90 days
    start.setDate(start.getDate() - 89)
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
    SELECT tasks.*, completions.completed_at, users.username AS completed_by,
      users.shape AS completed_by_shape, users.color AS completed_by_color
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
        completedByShape: completed ? row.completed_by_shape : null,
        completedByColor: completed ? row.completed_by_color : null,
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
function createToken(user) {
  return jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' })
}
 
// New residents create their own account with the shared house code (HOUSE_CODE in .env)
app.post('/api/register', async (req, res) => {
  const { username, password, houseCode, shape = 'circle', color = '#16a34a' } = req.body ?? {}
 
  if (!process.env.HOUSE_CODE) {
    return res.status(403).json({ error: 'Registration is not enabled' })
  }
  if (houseCode !== process.env.HOUSE_CODE) {
    return res.status(403).json({ error: 'Wrong house code' })
  }
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 letters, numbers, _ or -' })
  }
  if (typeof password !== 'string' || password.length < 1) {
    return res.status(400).json({ error: 'Password is required' })
  }
 
  if (!allowedShapes.includes(shape) || !allowedColors.includes(color)) {
    return res.status(400).json({ error: 'Invalid shape or color' })
  }
 
  const hash = await bcrypt.hash(password, 10)
  db.run(
    'INSERT INTO users (username, password_hash, shape, color) VALUES (?, ?, ?, ?)',
    [username, hash, shape, color],
    function (error) {
      if (error) {
        if (error.message.includes('UNIQUE')) {
          return res.status(409).json({ error: 'Username is already taken' })
        }
        console.error('Failed to create user:', error.message)
        return res.status(500).json({ error: 'Failed to create user' })
      }
      res.status(201).json({ token: createToken({ id: this.lastID, username }) })
    }
  )
})
 
// The logged-in user's own profile
app.get('/api/me', requireAuth, (req, res) => {
  db.get(
    'SELECT username, shape, color FROM users WHERE id = ?',
    [req.user.userId],
    (error, user) => {
      if (error) return res.status(500).json({ error: 'Database error' })
      if (!user) return res.status(401).json({ error: 'User not found' })
      res.json(user)
    }
  )
})
 
app.patch('/api/me', requireAuth, (req, res) => {
  const { shape, color } = req.body ?? {}
  if (!allowedShapes.includes(shape) || !allowedColors.includes(color)) {
    return res.status(400).json({ error: 'Invalid shape or color' })
  }
 
  db.run(
    'UPDATE users SET shape = ?, color = ? WHERE id = ?',
    [shape, color, req.user.userId],
    (error) => {
      if (error) return res.status(500).json({ error: 'Database error' })
      res.json({ shape, color })
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
    res.json({ token: createToken(user) })
  })
})
// A phone that was offline sends the time the button was pressed.
// Use it if it is a valid time in the past, otherwise use the current time.
function completionTime(value) {
  const now = new Date()
  const time = typeof value === 'string' ? new Date(value) : null
  if (!time || Number.isNaN(time.getTime()) || time > now) {
    return now.toISOString()
  }
  return time.toISOString()
}

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
      ? [id, req.user.userId, completionTime(body.completedAt)]
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
// ----- Admin page (/admin) -----
// Admin routes only answer requests made on this machine itself,
// so phones on the Wi-Fi can't clear users or tasks.
function requireLocal(req, res, next) {
  const address = req.socket.remoteAddress
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
    next()
    return
  }
  res.status(403).json({ error: 'Admin is only available on the house computer' })
}

// The addresses other devices on the Wi-Fi can use to open the app
function wifiAddresses() {
  const addresses = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family === 'IPv4' && !item.internal) {
        addresses.push(`http://${item.address}:${PORT}`)
      }
    }
  }
  return addresses
}

function sendDbResult(res, message) {
  return (error) => {
    if (error) {
      console.error(`${message} failed:`, error.message)
      res.status(500).json({ error: `${message} failed` })
      return
    }
    res.json({ ok: true })
  }
}

app.get('/api/admin/info', requireLocal, (req, res) => {
  db.get(
    'SELECT (SELECT COUNT(*) FROM users) AS userCount, (SELECT COUNT(*) FROM tasks) AS taskCount',
    (error, row) => {
      if (error) {
        res.status(500).json({ error: 'Failed to read database' })
        return
      }
      // A QR code per address, so phones can open the app by scanning
      Promise.all(
        wifiAddresses().map(async (url) => ({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }) })),
      ).then((addresses) => res.json({ addresses, ...row }))
    },
  )
})

app.get('/api/admin/users', requireLocal, (req, res) => {
  const sql = `
    SELECT users.id, users.username, users.shape, users.color,
           COUNT(completions.id) AS completionCount
    FROM users
    LEFT JOIN completions ON completions.user_id = users.id
    GROUP BY users.id
    ORDER BY users.username`
  db.all(sql, (error, rows) => {
    if (error) {
      res.status(500).json({ error: 'Failed to read users' })
      return
    }
    res.json(rows)
  })
})

app.delete('/api/admin/users/:id', requireLocal, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid user id' })
    return
  }
  db.serialize(() => {
    db.run('DELETE FROM completions WHERE user_id = ?', [id])
    db.run('DELETE FROM users WHERE id = ?', [id], sendDbResult(res, 'Delete user'))
  })
})

app.post('/api/admin/clear-users', requireLocal, (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM completions')
    db.run('DELETE FROM users', sendDbResult(res, 'Clear users'))
  })
})

app.post('/api/admin/clear-completions', requireLocal, (req, res) => {
  db.run('DELETE FROM completions', sendDbResult(res, 'Clear completions'))
})

// Same as resetTasks.js: makes the tasks match taskList.js, keeps history of kept tasks
app.post('/api/admin/reset-tasks', requireLocal, (req, res) => {
  syncTasks(db, { removeMissing: true }, sendDbResult(res, 'Reload tasks'))
})

// Serve the built frontend (npm run build creates the dist folder)
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})
 
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Admin page: http://localhost:${PORT}/admin`)
})