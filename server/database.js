const { createClient } = require('@libsql/client')
const syncTasks = require('./syncTasks')

let client
let initPromise

function getClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL
    if (!url) {
      throw new Error('TURSO_DATABASE_URL is required (Turso / libSQL)')
    }
    client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
  }
  return client
}

function rowsOf(result) {
  return result.rows.map((row) => {
    const plain = {}
    for (const key of Object.keys(row)) {
      plain[key] = row[key]
    }
    return plain
  })
}

async function all(sql, args = []) {
  const result = await getClient().execute({ sql, args })
  return rowsOf(result)
}

async function get(sql, args = []) {
  const rows = await all(sql, args)
  return rows[0]
}

async function run(sql, args = []) {
  const result = await getClient().execute({ sql, args })
  return {
    lastID: Number(result.lastInsertRowid ?? 0),
    changes: result.rowsAffected ?? 0,
  }
}

async function batch(statements) {
  const stmts = statements.map((statement) =>
    typeof statement === 'string'
      ? statement
      : { sql: statement.sql, args: statement.args ?? [] },
  )
  await getClient().batch(stmts, 'write')
}

async function executeMultiple(sql) {
  await getClient().executeMultiple(sql)
}

async function init() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    await executeMultiple(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        frequency TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        estimated_time INTEGER,
        instructions TEXT,
        supplies TEXT,
        supply_location TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        completed_at TEXT NOT NULL
      );
    `)

    // Avatar columns were added later, so add them to existing databases too
    const columns = await all('PRAGMA table_info(users)')
    const names = columns.map((column) => column.name)
    if (!names.includes('shape')) {
      await run("ALTER TABLE users ADD COLUMN shape TEXT NOT NULL DEFAULT 'circle'")
    }
    if (!names.includes('color')) {
      await run("ALTER TABLE users ADD COLUMN color TEXT NOT NULL DEFAULT '#16a34a'")
    }

    // Adds new tasks from taskList.js and updates instructions of existing ones.
    // Never deletes tasks here; the admin page's Reload task list does that.
    await syncTasks(db, {})
    console.log('Connected to Turso database')
  })().catch((error) => {
    initPromise = null
    throw error
  })
  return initPromise
}

async function close() {
  if (client) {
    client.close()
    client = null
  }
  initPromise = null
}

const db = { all, get, run, batch, executeMultiple, init, close }

module.exports = db
