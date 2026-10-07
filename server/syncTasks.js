const taskList = require('./taskList')

// Copies taskList.js into the database, matching tasks by name.
// Existing tasks keep their id, so their completion history is kept.
// removeMissing: also delete tasks that are no longer in the list.
async function syncTasks(db, { removeMissing = false } = {}) {
  for (const task of taskList) {
    const fields = [
      task.frequency,
      JSON.stringify(task.instructions ?? []),
      JSON.stringify(task.supplies ?? []),
      task.location ?? '',
    ]
    await db.run(
      `UPDATE tasks SET frequency = ?, instructions = ?, supplies = ?, supply_location = ?
       WHERE name = ?`,
      [...fields, task.name],
    )
    await db.run(
      `INSERT INTO tasks (name, frequency, instructions, supplies, supply_location)
       SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE name = ?)`,
      [task.name, ...fields, task.name],
    )
  }

  if (removeMissing) {
    const names = taskList.map((task) => task.name)
    if (names.length === 0) {
      await db.run('DELETE FROM completions')
      await db.run('DELETE FROM tasks')
    } else {
      const placeholders = names.map(() => '?').join(', ')
      await db.run(
        `DELETE FROM completions WHERE task_id IN (SELECT id FROM tasks WHERE name NOT IN (${placeholders}))`,
        names,
      )
      await db.run(`DELETE FROM tasks WHERE name NOT IN (${placeholders})`, names)
    }
  }

  const row = await db.get('SELECT COUNT(*) AS count FROM tasks')
  return row?.count ?? 0
}

module.exports = syncTasks
