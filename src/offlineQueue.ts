// Offline queue: when the server can't be reached, Complete/Undo clicks are
// saved on this phone and sent to the server when the connection is back.

const STORAGE_KEY = 'pendingChanges'

export interface PendingChange {
  taskId: number
  completed: boolean
  at: string // when the button was pressed
}

export function loadQueue(): PendingChange[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveQueue(queue: PendingChange[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

// Complete followed by Undo on the same task cancel each other out
export function addToQueue(change: PendingChange): PendingChange[] {
  const queue = loadQueue()
  const last = queue.findLastIndex((c) => c.taskId === change.taskId)
  if (last !== -1 && queue[last].completed !== change.completed) {
    queue.splice(last, 1)
  } else {
    queue.push(change)
  }
  saveQueue(queue)
  return queue
}

export type SendResult = 'ok' | 'offline' | 'unauthorized' | 'rejected'

export async function sendChange(change: PendingChange, token: string): Promise<SendResult> {
  try {
    const response = await fetch(`/api/tasks/${change.taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ completed: change.completed, completedAt: change.at }),
    })
    if (response.status === 401) return 'unauthorized'
    return response.ok ? 'ok' : 'rejected'
  } catch {
    // fetch throws when the server can't be reached at all
    return 'offline'
  }
}

// Sends saved changes in order. Stops at the first one that can't reach the server.
export async function syncQueue(token: string): Promise<{ result: SendResult; left: number }> {
  const queue = loadQueue()
  while (queue.length > 0) {
    const result = await sendChange(queue[0], token)
    if (result === 'offline' || result === 'unauthorized') {
      saveQueue(queue)
      return { result, left: queue.length }
    }
    // 'ok', or 'rejected' (for example the task was deleted): either way it is done
    queue.shift()
    saveQueue(queue)
  }
  return { result: 'ok', left: 0 }
}
