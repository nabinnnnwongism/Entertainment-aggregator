import React, { useState, useEffect } from 'react';
import { Eye, CheckCircle, Heart, ArrowLeft, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { api } from '../mockData';

export default function WebtoonDetailView({ manga, onBack, onChapterSelect }) {
  const [details, setDetails] = useState(manga);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);

  // Pagination & Sorting State
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [sortAsc, setSortAsc] = useState(true); // true = Chapter 1 at top, false = Chapter N at top

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    if (manga && (manga.id || manga.anilistId || manga.title || manga.comickSlug)) {
      const lookupId = manga.comickSlug || manga.anilistId || manga.id || manga.title;
      api.getMangaInfo(lookupId).then(res => {
        if (!mounted) return;
        if (res && res.chapters && res.chapters.length > 0) {
          setDetails(prev => ({
            ...prev,
            ...res,
            coverImage: res.cover || prev?.coverImage || prev?.bannerImage,
            bannerImage: res.banner || res.cover || prev?.bannerImage || prev?.coverImage
          }));
        }
        setLoading(false);
      }).catch(() => {
        if (mounted) setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => { mounted = false; };
  }, [manga?.id, manga?.anilistId, manga?.title, manga?.comickSlug]);

  // Raw chapters list from details
  const rawChapters = (details?.chapters && details.chapters.length > 0) ? details.chapters : [];

  // Sorted chapters list
  const sortedChapters = [...rawChapters].sort((a, b) => {
    const numA = parseFloat(a.chapter || a.number || 0);
    const numB = parseFloat(b.chapter || b.number || 0);
    return sortAsc ? numA - numB : numB - numA;
  });

  const totalChapters = sortedChapters.length;
  const totalPages = Math.max(1, Math.ceil(totalChapters / pageSize));

  // Current page slice
  const startIndex = (page - 1) * pageSize;
  const pageChapters = sortedChapters.slice(startIndex, startIndex + pageSize);

  // Chapter 1 for "First episode >" CTA
  const firstChapter = [...rawChapters].sort((a, b) => {
    const numA = parseFloat(a.chapter || a.number || 0);
    const numB = parseFloat(b.chapter || b.number || 0);
    return numA - numB;
  })[0];

  const handlePageChange = (newPage) => {
    const clamped = Math.max(1, Math.min(totalPages, newPage));
    setPage(clamped);
    window.scrollTo({ top: 400, behavior: 'smooth' });
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const coverUrl = details?.coverImage || details?.bannerImage || details?.cover || details?.banner;

  const handleSelectChapter = (ch) => {
    if (!onChapterSelect) return;
    onChapterSelect({
      ...ch,
      comickSlug: details?.comickSlug || details?.id,
      mangaTitle: details?.title,
      chapters: sortedChapters
    });
  };

  const handleImgError = (e) => {
    e.target.style.display = 'none';
    if (e.target.parentNode) {
      e.target.parentNode.classList.add('wt-img-fallback');
    }
  };

  return (
    <div style={{ background: '#111111', minHeight: '100vh', color: '#ffffff' }}>
      {/* Back button header */}
      <div style={{ background: '#181818', padding: '12px 28px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={onBack}
          style={{ background: 'transparent', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
        >
          <ArrowLeft size={18} /> Back to Webtoons
        </button>
      </div>

      {/* Hero Header */}
      <div className="wt-detail-hero">
        {coverUrl && (
          <img
            src={coverUrl}
            alt={details?.title}
            className="wt-detail-hero-bg"
            onError={handleImgError}
          />
        )}
        {loading ? (
          // Hero overlay skeleton — title / author / button placeholders so the
          // layout doesn't shift and we don't show a stale/empty title string.
          <div className="wt-detail-hero-overlay">
            <div className="wt-skeleton wt-sk-stagger-2" style={{ width: '140px', height: '18px', borderRadius: '4px' }} />
            <div className="wt-skeleton wt-sk-stagger-3" style={{ width: '320px', maxWidth: '60%', height: '38px', marginTop: '8px' }} />
            <div className="wt-skeleton wt-sk-stagger-4" style={{ width: '220px', height: '16px', marginTop: '6px' }} />
            <div className="wt-skeleton wt-sk-stagger-5" style={{ width: '130px', height: '38px', borderRadius: '20px', marginTop: '14px' }} />
          </div>
        ) : (
          <div className="wt-detail-hero-overlay wt-reveal-fade">
            <span className="wt-detail-genre">{details?.genres?.[0] || 'WEBTOON ORIGINAL'}</span>
            <h1 className="wt-detail-title">{details?.title}</h1>
            <span className="wt-detail-author">Author / Studio • {details?.author || 'Webtoon Original'}</span>
            <button
              className="wt-subscribe-btn"
              onClick={() => setSubscribed(!subscribed)}
            >
              {subscribed ? '✓ Subscribed' : '+ Subscribe'}
            </button>
          </div>
        )}
      </div>

      {/* Split Layout Container */}
      <div className="wt-detail-split">
        {/* Left Column: Episode List */}
        <div className="wt-ep-table-wrap">
          {/* Table Header: Total count + Sort Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#aaa' }}>
              {loading ? 'Loading episodes from ComicK...' : `Episodes (${totalChapters})`}
            </span>
            <button
              onClick={() => setSortAsc(!sortAsc)}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '6px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              <ArrowUpDown size={14} /> {sortAsc ? 'Oldest First (#1 → #N)' : 'Newest First (#N → #1)'}
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="wt-skeleton-ep-row">
                  <div className={`wt-skeleton wt-sk-stagger-${(i % 6) + 1}`} style={{ width: '60px', height: '60px', borderRadius: '6px', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className={`wt-skeleton wt-sk-stagger-${(i % 6) + 1}`} style={{ width: `${60 + (i % 3) * 15}%`, height: '16px' }} />
                    <div className={`wt-skeleton wt-sk-stagger-${(i % 6) + 1}`} style={{ width: '30%', height: '12px' }} />
                  </div>
                  <div className={`wt-skeleton wt-sk-stagger-${(i % 6) + 1}`} style={{ width: '50px', height: '14px' }} />
                </div>
              ))}
            </div>
          ) : pageChapters.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#888', fontSize: '14px' }}>
              No chapters found for this webtoon title.
            </div>
          ) : (
            <div className="wt-ep-table wt-reveal">
              {pageChapters.map((ch, idx) => {
                const chNum = ch.chapter || ch.number || (startIndex + idx + 1);
                const pubDate = ch.publishAt ? new Date(ch.publishAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Jan 16, 2022';

                return (
                  <div
                    key={ch.id || idx}
                    className="wt-ep-row"
                    onClick={() => handleSelectChapter(ch)}
                  >
                    <img
                      src={coverUrl}
                      alt={ch.title || `Chapter ${chNum}`}
                      className="wt-ep-thumb"
                      onError={handleImgError}
                    />
                    <div className="wt-ep-info">
                      <div className="wt-ep-name">{ch.title || `Chapter ${chNum}`}</div>
                      <div className="wt-ep-date">{pubDate}</div>
                    </div>
                    <div className="wt-ep-likes">
                      <Heart size={14} color="#ef4444" fill="#ef4444" />
                      <span>{(174000 + (parseInt(chNum) * 150)).toLocaleString()}</span>
                    </div>
                    <div className="wt-ep-num">#{chNum}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Webtoon Pagination Bar */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => handlePageChange(1)}
                disabled={page === 1}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: page === 1 ? '#555' : '#fff', padding: '8px 12px', borderRadius: '4px', cursor: page === 1 ? 'default' : 'pointer' }}
                title="First Page"
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: page === 1 ? '#555' : '#fff', padding: '8px 12px', borderRadius: '4px', cursor: page === 1 ? 'default' : 'pointer' }}
                title="Previous Page"
              >
                <ChevronLeft size={16} />
              </button>

              {getPageNumbers().map(num => (
                <button
                  key={num}
                  onClick={() => handlePageChange(num)}
                  style={{
                    background: page === num ? '#00e561' : 'rgba(255,255,255,0.08)',
                    color: page === num ? '#000000' : '#ffffff',
                    fontWeight: page === num ? 800 : 500,
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {num}
                </button>
              ))}

              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: page === totalPages ? '#555' : '#fff', padding: '8px 12px', borderRadius: '4px', cursor: page === totalPages ? 'default' : 'pointer' }}
                title="Next Page"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={page === totalPages}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: page === totalPages ? '#555' : '#fff', padding: '8px 12px', borderRadius: '4px', cursor: page === totalPages ? 'default' : 'pointer' }}
                title="Last Page"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Right Sidebar: Metadata & First Episode CTA */}
        <div className="wt-detail-sidebar">
          <div className="wt-stats-card">
            {loading ? (
              // Skeleton sidebar that mirrors the real stats card layout —
              // avoids flashing fabricated "1.9M / 68.9M" numbers before the
              // real metadata resolves.
              <div className="wt-stats-skel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="wt-skeleton wt-sk-stagger-2" style={{ width: '150px', height: '24px', borderRadius: '4px' }} />
                <div className="wt-stat-row">
                  <div className="wt-skeleton wt-sk-stagger-2" style={{ width: '110px', height: '16px' }} />
                  <div className="wt-skeleton wt-sk-stagger-3" style={{ width: '60px', height: '22px' }} />
                </div>
                <div className="wt-stat-row">
                  <div className="wt-skeleton wt-sk-stagger-3" style={{ width: '110px', height: '16px' }} />
                  <div className="wt-skeleton wt-sk-stagger-4" style={{ width: '60px', height: '22px' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="wt-skeleton wt-sk-stagger-4" style={{ width: '100%', height: '12px' }} />
                  <div className="wt-skeleton wt-sk-stagger-5" style={{ width: '92%', height: '12px' }} />
                  <div className="wt-skeleton wt-sk-stagger-5" style={{ width: '80%', height: '12px' }} />
                </div>
                <div className="wt-skeleton wt-sk-stagger-6" style={{ width: '100%', height: '48px', borderRadius: '8px', marginTop: '4px' }} />
              </div>
            ) : (
              <div className="wt-reveal-fade">
                <span className="wt-status-badge">
                  {details?.status === 'Completed' ? 'COMPLETED' : 'UP EVERY MONDAY'}
                </span>

                <div className="wt-stat-row">
                  <span className="wt-stat-label"><Eye size={16} /> Total Views</span>
                  <span className="wt-stat-val">{(Math.floor((details?.popularity || 0) / 100000) / 10).toFixed(1)}M</span>
                </div>

                <div className="wt-stat-row">
                  <span className="wt-stat-label"><CheckCircle size={16} /> Subscribers</span>
                  <span className="wt-stat-val">{(Math.floor((details?.popularity || 0) / 50000) / 10).toFixed(1)}M</span>
                </div>

                <div className="wt-synopsis">
                  {details?.description || 'Discover this amazing Webtoon original series. Read all available episodes in high quality.'}
                </div>

                <button
                  className="wt-first-ep-btn"
                  disabled={loading || !firstChapter}
                  onClick={() => firstChapter && handleSelectChapter(firstChapter)}
                >
                  First episode &gt;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
