const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const taskList = require('./taskList')

const db = new sqlite3.Database(path.join(__dirname, 'house-tasks.db'), (error) => {
  if (error) {
    console.error('Failed to connect to database:', error.message)
  } else {
    console.log('Connected to SQLite database')
  }
})

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      estimated_time INTEGER,
      instructions TEXT,
      supplies TEXT,
      supply_location TEXT
      
    )     
  `)

  db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
)`)

  // Avatar columns were added later, so add them to existing databases too
  db.all('PRAGMA table_info(users)', (error, columns) => {
    if (error) {
      console.error('Failed to read users table:', error.message)
      return
    }
    const names = columns.map((column) => column.name)
    if (!names.includes('shape')) {
      db.run("ALTER TABLE users ADD COLUMN shape TEXT NOT NULL DEFAULT 'circle'")
    }
    if (!names.includes('color')) {
      db.run("ALTER TABLE users ADD COLUMN color TEXT NOT NULL DEFAULT '#16a34a'")
    }
  })

  db.run(`CREATE TABLE IF NOT EXISTS completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  completed_at TEXT NOT NULL
)`)


  db.get('SELECT COUNT(*) AS count FROM tasks', (error, row) => {
    if (error) {
      console.error('Failed to count tasks:', error.message)
      return
    }

    if (row.count === 0) {
      const insertTask = db.prepare('INSERT INTO tasks (name, frequency) VALUES (?, ?)')
      for (const task of taskList) {
        insertTask.run(task.name, task.frequency)
      }
      insertTask.finalize()

      console.log('Inserted initial tasks into database')
    }
  })
})

module.exports = db