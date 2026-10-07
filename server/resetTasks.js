const path = require('path')

for (const file of [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env'),
]) {
  try {
    process.loadEnvFile(file)
  } catch {
    // missing file
  }
}

const db = require('./database')
const syncTasks = require('./syncTasks')

// Makes the database match taskList.js: adds, updates and removes tasks.
// Completion history of tasks that stay in the list is kept.
async function main() {
  await db.init()
  const count = await syncTasks(db, { removeMissing: true })
  console.log(`Task list updated: ${count} tasks`)
}

main()
  .catch((error) => {
    console.error('Failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => db.close())
