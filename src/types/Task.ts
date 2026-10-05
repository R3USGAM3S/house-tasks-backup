export interface Task {
  name: string
  id: number
  frequency: string
  completed: boolean
  completedBy: string | null
  completedAt: string | null
  instructions: string[]
  supplies: string[]
  supplyLocation: string
  estimatedTime: number | null
}