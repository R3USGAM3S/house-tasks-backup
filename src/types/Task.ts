export interface Task {
  name: string
  id: number
  frequency: string
  completed: boolean
  completedBy: string | null
  completedByShape: string | null
  completedByColor: string | null
  completedAt: string | null
  instructions: string[]
  supplies: string[]
  supplyLocation: string
  estimatedTime: number | null
  // true while the change is only saved on this phone (offline)
  pending?: boolean
}