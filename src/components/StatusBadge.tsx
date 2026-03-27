import type { ItemStatus } from '../types'

const STATUS_CONFIG: Record<ItemStatus, { label: string; icon: string; className: string }> = {
  want: { label: '想看', icon: '🔖', className: 'status-want' },
  in_progress: { label: '在看', icon: '▶', className: 'status-progress' },
  completed: { label: '看过', icon: '✓', className: 'status-completed' },
  dropped: { label: '搁置', icon: '✗', className: 'status-dropped' },
}

interface Props {
  status: ItemStatus
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.completed
  return (
    <span className={`status-badge ${config.className} status-${size}`}>
      {config.icon} {config.label}
    </span>
  )
}
