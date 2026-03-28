import type { ItemStatus } from '../types'
import { getStatusConfig, type MediaType } from '../utils/statusLabels'

interface Props {
  status: ItemStatus
  mediaType?: MediaType
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, mediaType, size = 'sm' }: Props) {
  const config = getStatusConfig(status, mediaType)
  return (
    <span className={`status-badge ${config.className} status-${size}`}>
      {config.icon} {config.label}
    </span>
  )
}
