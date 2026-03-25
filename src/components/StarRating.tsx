interface Props {
  value: number
  onChange?: (v: number) => void
  size?: number
}

export default function StarRating({ value, onChange, size = 18 }: Props) {
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`star ${n <= value ? 'filled' : ''} ${onChange ? 'clickable' : ''}`}
          style={{ fontSize: size }}
          onClick={() => onChange?.(n)}
        >
          ★
        </span>
      ))}
    </div>
  )
}
