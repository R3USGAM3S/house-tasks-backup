const db = require('./database')
const syncTasks = require('./syncTasks')

// Makes the database match taskList.js: adds, updates and removes tasks.
// Completion history of tasks that stay in the list is kept.
syncTasks(db, { removeMissing: true }, (error, count) => {
  if (error) console.error('Failed:', error.message)
  else console.log(`Task list updated: ${count} tasks`)
  db.close()
})
