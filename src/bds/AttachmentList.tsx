import type { BdsAttachment } from './types'

const isPdf = (item: BdsAttachment) => item.kind === 'pdf' || /\.pdf$/i.test(item.url)

// Thumbnails for images and file tiles for PDFs attached to a request.
export default function AttachmentList({ items }: { items?: BdsAttachment[] }) {
  if (!items || items.length === 0) return null

  return (
    <div className="bds-attachments">
      <h4>Attachments ({items.length})</h4>
      <div className="bds-attach-grid">
        {items.map((item) => (
          <a key={item.publicId} href={item.url} target="_blank" rel="noopener noreferrer" title={item.name}>
            {isPdf(item) ? (
              <div className="bds-attach-pdf" aria-hidden="true">PDF</div>
            ) : (
              <img src={item.url} alt={item.name} loading="lazy" />
            )}
            <span>{item.name}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
