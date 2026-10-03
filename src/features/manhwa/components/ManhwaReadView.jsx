import React from 'react';
import { InlineLoader } from '../../../App';

function ManhwaReadView({ series, chapter, images, isLoading, onBack, onChapterSelect }) {
  const chapters = Array.isArray(series?.chapters) ? series.chapters : [];
  const currentIdx = chapters.findIndex(ch => ch.slug === chapter.slug);
  const prevChapter = currentIdx > 0 ? chapters[currentIdx - 1] : null;
  const nextChapter = currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null;

  return (
    <div className="manhwa-reader">
      {/* Top navigation bar */}
      <div className="manhwa-reader-header">
        <button className="manhwa-back-btn" onClick={onBack}>Â Ã‚Â Back</button>
        <span className="manhwa-reader-chapter-label">Chapter {chapter.number}</span>
        <div className="manhwa-reader-nav">
          {prevChapter && (
            <button className="manhwa-nav-btn" onClick={() => onChapterSelect(prevChapter)}>
              Â Ã‚Â Prev
            </button>
          )}
          {nextChapter && (
            <button className="manhwa-nav-btn" onClick={() => onChapterSelect(nextChapter)}>
              Next â†’
            </button>
          )}
        </div>
      </div>

      {/* Chapter images */}
      <div className="manhwa-reader-pages">
        {isLoading ? (
          <div className="manhwa-loading" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <InlineLoader />
          </div>
        ) : images.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
            <p>No pages found for this chapter.</p>
          </div>
        ) : (
          images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Page ${i + 1}`}
              className="manhwa-reader-page"
              loading="lazy"
            />
          ))
        )}
      </div>

      {/* Bottom navigation */}
      {!isLoading && images.length > 0 && (
        <div className="manhwa-reader-footer">
          {prevChapter && (
            <button className="manhwa-nav-btn" onClick={() => { onChapterSelect(prevChapter); window.scrollTo(0,0); }}>
              Â Ã‚Â Previous Chapter
            </button>
          )}
          <button className="manhwa-back-btn-plain" onClick={() => { onBack(); }}>
            Chapter List
          </button>
          {nextChapter && (
            <button className="manhwa-nav-btn" onClick={() => { onChapterSelect(nextChapter); window.scrollTo(0,0); }}>
              Next Chapter â†’
            </button>
          )}
        </div>
      )}

      {/* Chapter picker */}
      {chapters.length > 0 && (
        <div className="manhwa-reader-picker container">
          <h3 className="manhwa-chapters-heading">All Chapters</h3>
          <div className="manhwa-chapters-grid">
            {chapters.slice().reverse().map(ch => (
              <button
                key={ch.slug}
                className={`manhwa-ch-btn ${ch.slug === chapter.slug ? 'active' : ''}`}
                onClick={() => { onChapterSelect(ch); window.scrollTo(0, 0); }}
              >
                Ch. {ch.number}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ManhwaReadView;
