// Each user picks a shape and a color that represents them in the app.
// Keep these lists in sync with allowedShapes / allowedColors in server/index.js.
export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'heart']

export const COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#16a34a',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
]

export function randomAvatar() {
  return {
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }
}
