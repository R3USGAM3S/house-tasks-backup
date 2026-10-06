const taskList = require('./taskList')

// Copies taskList.js into the database, matching tasks by name.
// Existing tasks keep their id, so their completion history is kept.
// removeMissing: also delete tasks that are no longer in the list.
function syncTasks(db, { removeMissing = false } = {}, done = () => {}) {
  db.serialize(() => {
    const update = db.prepare(`
      UPDATE tasks SET frequency = ?, instructions = ?, supplies = ?, supply_location = ?
      WHERE name = ?`)
    const insert = db.prepare(`
      INSERT INTO tasks (name, frequency, instructions, supplies, supply_location)
      SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE name = ?)`)

    for (const task of taskList) {
      const fields = [
        task.frequency,
        JSON.stringify(task.instructions ?? []),
        JSON.stringify(task.supplies ?? []),
        task.location ?? '',
      ]
      update.run(...fields, task.name)
      insert.run(task.name, ...fields, task.name)
    }
    update.finalize()
    insert.finalize()

    if (removeMissing) {
      const names = taskList.map((task) => task.name)
      const placeholders = names.map(() => '?').join(', ')
      db.run(
        `DELETE FROM completions WHERE task_id IN (SELECT id FROM tasks WHERE name NOT IN (${placeholders}))`,
        names,
      )
      db.run(`DELETE FROM tasks WHERE name NOT IN (${placeholders})`, names)
    }

    // Runs after everything above, because db.serialize keeps the order
    db.get('SELECT COUNT(*) AS count FROM tasks', (error, row) => done(error, row?.count))
  })
}

module.exports = syncTasks
