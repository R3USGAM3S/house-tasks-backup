const path = require('path')

// Settings: server/.env (Plesk), then root .env.local / .env (Vercel env pull)
for (const file of [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env'),
]) {
  try {
    process.loadEnvFile(file)
  } catch {
    // file missing: keep going
  }
}

const express = require('express')
const os = require('os')
const crypto = require('crypto')
const QRCode = require('qrcode')
const cors = require('cors')
const db = require('./database')
const syncTasks = require('./syncTasks')
const app = express()
const PORT = Number(process.env.PORT) || 3001
const MIN_PASSWORD_LENGTH = 8
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.error('JWT_SECRET puuttuu')
  process.exit(1)
}

function corsOrigin(origin, callback) {
  if (!origin) {
    callback(null, true)
    return
  }
  const allowed = new Set(
    [
      'http://localhost:5173',
      'http://localhost:3001',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3001',
      process.env.PUBLIC_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    ].filter(Boolean),
  )
  if (allowed.has(origin) || /\.vercel\.app$/i.test(new URL(origin).hostname)) {
    callback(null, true)
    return
  }
  callback(null, false)
}

app.use(cors({ origin: corsOrigin }))
app.use(express.json())

// On the server the app runs behind a reverse proxy (Plesk / Vercel).
app.set('trust proxy', 1)

async function ensureDb(req, res, next) {
  try {
    await db.init()
    next()
  } catch (error) {
    console.error('Database init failed:', error.message)
    res.status(500).json({ error: 'Database unavailable' })
  }
}

app.use('/api', ensureDb)

// Limits wrong login, sign-up and admin password attempts: 10 per 15 minutes per address
const failedAttempts = new Map()
const MAX_ATTEMPTS = 10
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000

function isBlocked(key) {
  const entry = failedAttempts.get(key)
  if (!entry) return false
  if (Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    failedAttempts.delete(key)
    return false
  }
  return entry.count >= MAX_ATTEMPTS
}

function recordFailure(key) {
  const entry = failedAttempts.get(key)
  if (!entry || Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    failedAttempts.set(key, { count: 1, first: Date.now() })
  } else {
    entry.count += 1
  }
}

function tooManyAttempts(res) {
  res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Login required' })
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    // Admin tokens are only for the admin page
    if (!req.user.userId) throw new Error('Not a user token')
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
  if (
    task.estimatedTime !== undefined &&
    (!Number.isInteger(task.estimatedTime) || task.estimatedTime <= 0)
  ) {
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

function parseJsonList(value) {
  if (value == null || value === '') return []
  if (Array.isArray(value)) return value
  try {
    return JSON.parse(value) ?? []
  } catch {
    return []
  }
}

app.get('/api/tasks', requireAuth, async (req, res) => {
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

  try {
    const rows = await db.all(sql)
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
        instructions: parseJsonList(row.instructions),
        supplies: parseJsonList(row.supplies),
        supplyLocation: row.supply_location,
      }
    })
    res.json(tasks)
  } catch (error) {
    console.error('Failed to fetch tasks:', error.message)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

app.post('/api/tasks', requireAuth, async (req, res) => {
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

  try {
    const result = await db.run(sql, [
      name,
      frequency,
      0,
      estimatedTime,
      JSON.stringify(instructions),
      JSON.stringify(supplies),
      supplyLocation,
    ])
    res.status(201).json({
      id: result.lastID,
      name,
      frequency,
      completed: false,
      estimatedTime,
      instructions,
      supplies,
      supplyLocation,
    })
  } catch (error) {
    console.error('Failed to create task:', error.message)
    res.status(500).json({ error: 'Failed to create task' })
  }
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
  const attemptKey = `register:${req.ip}`
  if (isBlocked(attemptKey)) {
    return tooManyAttempts(res)
  }
  if (houseCode !== process.env.HOUSE_CODE) {
    recordFailure(attemptKey)
    return res.status(403).json({ error: 'Wrong house code' })
  }
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 letters, numbers, _ or -' })
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` })
  }

  if (!allowedShapes.includes(shape) || !allowedColors.includes(color)) {
    return res.status(400).json({ error: 'Invalid shape or color' })
  }

  try {
    const hash = await bcrypt.hash(password, 10)
    const result = await db.run(
      'INSERT INTO users (username, password_hash, shape, color) VALUES (?, ?, ?, ?)',
      [username, hash, shape, color],
    )
    res.status(201).json({ token: createToken({ id: result.lastID, username }) })
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username is already taken' })
    }
    console.error('Failed to create user:', error.message)
    return res.status(500).json({ error: 'Failed to create user' })
  }
})

// The logged-in user's own profile
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const user = await db.get('SELECT username, shape, color FROM users WHERE id = ?', [
      req.user.userId,
    ])
    if (!user) return res.status(401).json({ error: 'User not found' })
    res.json(user)
  } catch {
    return res.status(500).json({ error: 'Database error' })
  }
})

app.patch('/api/me', requireAuth, async (req, res) => {
  const { shape, color } = req.body ?? {}
  if (!allowedShapes.includes(shape) || !allowedColors.includes(color)) {
    return res.status(400).json({ error: 'Invalid shape or color' })
  }

  try {
    await db.run('UPDATE users SET shape = ?, color = ? WHERE id = ?', [
      shape,
      color,
      req.user.userId,
    ])
    res.json({ shape, color })
  } catch {
    return res.status(500).json({ error: 'Database error' })
  }
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body ?? {}
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' })
  }
  const attemptKey = `login:${req.ip}`
  if (isBlocked(attemptKey)) {
    return tooManyAttempts(res)
  }
  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username])
    const ok = user && (await bcrypt.compare(password, user.password_hash))
    if (!ok) {
      recordFailure(attemptKey)
      return res.status(401).json({ error: 'Invalid username or password' })
    }
    failedAttempts.delete(attemptKey)
    res.json({ token: createToken(user) })
  } catch {
    return res.status(500).json({ error: 'Database error' })
  }
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

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
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

  try {
    const task = await db.get('SELECT frequency FROM tasks WHERE id = ?', [id])
    if (!task) {
      res.status(404).json({ error: 'Task not found' })
      return
    }

    // Complete adds a new completion; Undo removes the ones from the current period.
    if (body.completed) {
      await db.run('INSERT INTO completions (task_id, user_id, completed_at) VALUES (?, ?, ?)', [
        id,
        req.user.userId,
        completionTime(body.completedAt),
      ])
    } else {
      await db.run('DELETE FROM completions WHERE task_id = ? AND completed_at >= ?', [
        id,
        periodStart(task.frequency),
      ])
    }
    res.json({
      id,
      completed: body.completed,
      completedBy: body.completed ? req.user.username : null,
    })
  } catch (error) {
    console.error('Failed to update task:', error.message)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

// ----- Admin page (/admin) -----
// The admin page asks for ADMIN_PASSWORD (in .env or the Plesk settings).
// Without ADMIN_PASSWORD the admin page is switched off.
function sameText(a, b) {
  // Compares without leaking how many characters matched
  const hashA = crypto.createHash('sha256').update(String(a)).digest()
  const hashB = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(hashA, hashB)
}

app.post('/api/admin/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Admin page is not enabled (ADMIN_PASSWORD missing)' })
  }
  const attemptKey = `admin:${req.ip}`
  if (isBlocked(attemptKey)) {
    return tooManyAttempts(res)
  }
  if (!sameText(req.body?.password ?? '', process.env.ADMIN_PASSWORD)) {
    recordFailure(attemptKey)
    return res.status(401).json({ error: 'Wrong admin password' })
  }
  failedAttempts.delete(attemptKey)
  res.json({ token: jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '2h' }) })
})

function requireAdmin(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  try {
    if (!token || jwt.verify(token, JWT_SECRET).admin !== true) throw new Error('Not admin')
    next()
  } catch {
    res.status(401).json({ error: 'Admin login required' })
  }
}

// The address residents use to open the app.
// On the server: PUBLIC_URL, for example https://tasks.example.com
// At home: the computer's Wi-Fi addresses
function appAddresses() {
  if (process.env.PUBLIC_URL) return [process.env.PUBLIC_URL]
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

async function sendDbOk(res, message, work) {
  try {
    await work()
    res.json({ ok: true })
  } catch (error) {
    console.error(`${message} failed:`, error.message)
    res.status(500).json({ error: `${message} failed` })
  }
}

app.get('/api/admin/info', requireAdmin, async (req, res) => {
  try {
    const row = await db.get(
      'SELECT (SELECT COUNT(*) FROM users) AS userCount, (SELECT COUNT(*) FROM tasks) AS taskCount',
    )
    const addresses = await Promise.all(
      appAddresses().map(async (url) => ({
        url,
        qr: await QRCode.toDataURL(url, { margin: 1, width: 240 }),
      })),
    )
    res.json({ addresses, ...row })
  } catch {
    res.status(500).json({ error: 'Failed to read database' })
  }
})

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const sql = `
    SELECT users.id, users.username, users.shape, users.color,
           COUNT(completions.id) AS completionCount
    FROM users
    LEFT JOIN completions ON completions.user_id = users.id
    GROUP BY users.id
    ORDER BY users.username`
  try {
    const rows = await db.all(sql)
    res.json(rows)
  } catch {
    res.status(500).json({ error: 'Failed to read users' })
  }
})

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Invalid user id' })
    return
  }
  await sendDbOk(res, 'Delete user', () =>
    db.batch([
      { sql: 'DELETE FROM completions WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [id] },
    ]),
  )
})

app.post('/api/admin/clear-users', requireAdmin, async (req, res) => {
  await sendDbOk(res, 'Clear users', () =>
    db.batch(['DELETE FROM completions', 'DELETE FROM users']),
  )
})

app.post('/api/admin/clear-completions', requireAdmin, async (req, res) => {
  await sendDbOk(res, 'Clear completions', () => db.run('DELETE FROM completions'))
})

// Same as resetTasks.js: makes the tasks match taskList.js, keeps history of kept tasks
app.post('/api/admin/reset-tasks', requireAdmin, async (req, res) => {
  await sendDbOk(res, 'Reload tasks', () => syncTasks(db, { removeMissing: true }))
})

// Serve the built frontend (npm run build creates the dist folder).
// On Vercel, static files are served from dist/ separately; this keeps Plesk / local working.
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.use((req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

async function startLocal() {
  try {
    await db.init()
  } catch (error) {
    console.error(`Database could not start: ${error.message}`)
    process.exit(1)
  }

  app.listen(PORT, (error) => {
    // Express 5 reports startup errors here, for example when the port is already in use
    if (error) {
      console.error(`Server could not start on port ${PORT}: ${error.message}`)
      if (error.code === 'EADDRINUSE') {
        console.error(
          'Another server is already running on this port. Stop it first (Ctrl+C in its terminal).',
        )
      }
      process.exit(1)
    }
    console.log(`Server running on http://localhost:${PORT}`)
    console.log(`Admin page: http://localhost:${PORT}/admin`)
    if (!process.env.ADMIN_PASSWORD) console.log('ADMIN_PASSWORD is not set: admin page is off')
    if ((process.env.HOUSE_CODE ?? '').length < 12) {
      console.log('Warning: HOUSE_CODE should be at least 12 characters on a public server')
    }
  })
}

module.exports = app

if (require.main === module) {
  startLocal()
}
