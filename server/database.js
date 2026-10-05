const path = require('path')
const sqlite3 = require('sqlite3').verbose()

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
      const insertTask = db.prepare(`
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
      `)

      insertTask.run(
        'Clean bathroom',
        'Weekly',
        0,
        20,
        JSON.stringify([
          'Clean sink',
          'Clean toilet',
          'Wipe mirror',
          'Mop floor',
        ]),
        JSON.stringify([
          'Bathroom cleaner',
          'Cloth',
          'Mop',
        ]),
        'Utility room'
      )

      insertTask.run(
        'Empty kitchen bins',
        'Daily',
        0,
        10,
        JSON.stringify([
          'Remove full bin bag',
          'Replace with a new bag',
          'Take rubbish to the correct container',
        ]),
        JSON.stringify([
          'Bin bags',
        ]),
        'Kitchen cupboard'
      )

      insertTask.finalize()

      console.log('Inserted initial tasks into database')
    }
  })
})

module.exports = db