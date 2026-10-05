const db = require('./database')
const taskList = require('./taskList')

// Replaces all tasks with the list in taskList.js.
// Also clears completion history, because it points to the old tasks.
db.serialize(() => {
  db.run('DELETE FROM completions')
  db.run('DELETE FROM tasks')
  db.run("DELETE FROM sqlite_sequence WHERE name = 'tasks'")

  const insertTask = db.prepare('INSERT INTO tasks (name, frequency) VALUES (?, ?)')
  for (const task of taskList) {
    insertTask.run(task.name, task.frequency)
  }
  insertTask.finalize()

  db.close(() => console.log(`Tasks replaced: ${taskList.length} tasks`))
})

