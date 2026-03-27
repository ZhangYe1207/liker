import type { MetadataResult } from '../services/metadata'

interface Props {
  results: MetadataResult[]
  loading: boolean
  onSelect: (result: MetadataResult) => void
}

export default function MetadataSearchResults({ results, loading, onSelect }: Props) {
  if (loading) {
    return (
      <div className="meta-search-loading">
        <span className="rec-dot" />
        <span className="rec-dot" />
        <span className="rec-dot" />
      </div>
    )
  }

  if (results.length === 0) {
    return <div className="meta-search-empty">未找到结果，请尝试其他关键词</div>
  }

  return (
    <div className="meta-search-results">
      {results.map((r) => (
        <button
          key={`${r.source}-${r.externalId}`}
          className="meta-search-item"
          onClick={() => onSelect(r)}
          type="button"
        >
          {r.coverUrl
            ? <img className="meta-search-cover" src={r.coverUrl} alt={r.title} loading="lazy" />
            : <div className="meta-search-cover meta-search-cover-empty">?</div>
          }
          <div className="meta-search-info">
            <div className="meta-search-title">{r.title}</div>
            <div className="meta-search-sub">
              {[r.year, r.genre].filter(Boolean).join(' · ')}
            </div>
            {r.description && (
              <div className="meta-search-desc">{r.description.slice(0, 100)}{r.description.length > 100 ? '…' : ''}</div>
            )}
            <span className="meta-search-source">{r.source}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
