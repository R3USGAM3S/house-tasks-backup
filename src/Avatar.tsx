import { COLORS, SHAPES } from './avatarOptions'

const SHAPE_PATHS: Record<string, string> = {
  circle: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z',
  square: 'M3 3h18v18H3z',
  triangle: 'M12 2L22 21H2z',
  diamond: 'M12 1L23 12L12 23L1 12z',
  star: 'M12 1.5l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.6l-6.4 3.5 1.4-7.1-5.3-5 7.2-.9z',
  heart: 'M12 21.5S2 15 2 8.5A5 5 0 0 1 12 6a5 5 0 0 1 10 2.5C22 15 12 21.5 12 21.5z',
}

interface AvatarProps {
  shape: string | null
  color: string | null
  size?: string
}

export function Avatar({ shape, color, size = '1em' }: AvatarProps) {
  if (!shape || !color) return null

  return (
    <svg
      className="avatar"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d={SHAPE_PATHS[shape] ?? SHAPE_PATHS.circle} fill={color} />
    </svg>
  )
}

interface AvatarPickerProps {
  shape: string
  color: string
  onChange: (shape: string, color: string) => void
}

export function AvatarPicker({ shape, color, onChange }: AvatarPickerProps) {
  return (
    <div className="avatar-picker">
      <div className="avatar-options">
        {SHAPES.map((option) => (
          <button
            key={option}
            type="button"
            className={option === shape ? 'avatar-option selected' : 'avatar-option'}
            onClick={() => onChange(option, color)}
            aria-label={option}
          >
            <Avatar shape={option} color={color} size="1.6rem" />
          </button>
        ))}
      </div>
      <div className="avatar-options">
        {COLORS.map((option) => (
          <button
            key={option}
            type="button"
            className={option === color ? 'avatar-option selected' : 'avatar-option'}
            onClick={() => onChange(shape, option)}
            aria-label={option}
          >
            <Avatar shape="circle" color={option} size="1.6rem" />
          </button>
        ))}
      </div>
    </div>
  )
}
