import React, { useState } from 'react';
import { Play, Shuffle, Trash2, X, Plus, Check, Bookmark, ThumbsUp, History, Clock, ListPlus, Share2, Search, MoreVertical } from 'lucide-react';

// ─────────────────────────────────────────────────────
// 1. SAVE TO PLAYLIST MODAL (Matching Image 3)
// ─────────────────────────────────────────────────────
export function SaveToPlaylistModal({
  isOpen,
  onClose,
  targetMedia,
  customPlaylists = [],
  watchLater = [],
  likedVideos = [],
  onToggleWatchLater,
  onToggleLiked,
  onToggleCustomPlaylist,
  onCreateNewPlaylistClick
}) {
  if (!isOpen || !targetMedia) return null;

  const targetId = String(targetMedia.id || targetMedia.media_id);

  const isInWatchLater = watchLater.some(item => String(item.id || item.media_id) === targetId);
  const isInLiked = likedVideos.some(item => String(item.id || item.media_id) === targetId);

  return (
    <div className="yt-modal-backdrop" onClick={onClose}>
      <div className="yt-save-modal" onClick={(e) => e.stopPropagation()}>
        <div className="yt-save-modal-header">
          <h3>Save to...</h3>
          <button className="yt-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="yt-save-modal-list">
          {/* Watch later */}
          <button className="yt-save-item" onClick={() => onToggleWatchLater(targetMedia)}>
            <div className="yt-save-item-left">
              <div className="yt-save-checkbox">
                {isInWatchLater ? <Check size={14} className="check-icon" /> : <div className="checkbox-box" />}
              </div>
              <div className="yt-save-item-info">
                <span className="yt-save-title">Watch later</span>
                <span className="yt-save-sub">Private</span>
              </div>
            </div>
            <Clock size={16} className="yt-save-type-icon" />
          </button>

          {/* Liked videos */}
          <button className="yt-save-item" onClick={() => onToggleLiked(targetMedia)}>
            <div className="yt-save-item-left">
              <div className="yt-save-checkbox">
                {isInLiked ? <Check size={14} className="check-icon" /> : <div className="checkbox-box" />}
              </div>
              <div className="yt-save-item-info">
                <span className="yt-save-title">Liked videos</span>
                <span className="yt-save-sub">Private</span>
              </div>
            </div>
            <ThumbsUp size={16} className="yt-save-type-icon" />
          </button>

          {/* Custom Playlists */}
          {customPlaylists.length > 0 ? (
            customPlaylists.map((pl) => {
              const isSaved = pl.items?.some(item => String(item.id || item.media_id) === targetId);
              return (
                <button
                  key={pl.id}
                  className="yt-save-item"
                  onClick={() => onToggleCustomPlaylist(pl.id, targetMedia)}
                >
                  <div className="yt-save-item-left">
                    <div className="yt-save-checkbox">
                      {isSaved ? <Check size={14} className="check-icon" /> : <div className="checkbox-box" />}
                    </div>
                    <div className="yt-save-item-info">
                      <span className="yt-save-title">{pl.title}</span>
                      <span className="yt-save-sub">Private</span>
                    </div>
                  </div>
                  <ListPlus size={16} className="yt-save-type-icon" />
                </button>
              );
            })
          ) : (
            <div className="yt-save-empty-hint">No custom playlists created yet</div>
          )}
        </div>

        <button className="yt-save-new-btn" onClick={onCreateNewPlaylistClick}>
          <Plus size={18} />
          <span>New playlist</span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 2. CREATE PLAYLIST MODAL (Matching Image 4)
// ─────────────────────────────────────────────────────
export function CreatePlaylistModal({ isOpen, onClose, onCreate }) {
  const [title, setTitle] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(title.trim());
    setTitle('');
  };

  return (
    <div className="yt-modal-backdrop" onClick={onClose}>
      <div className="yt-create-modal" onClick={(e) => e.stopPropagation()}>
        <h3>New playlist</h3>

        <form onSubmit={handleSubmit}>
          <div className="yt-floating-input">
            <input
              type="text"
              id="playlist-title-input"
              placeholder="Choose a title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              maxLength={150}
            />
          </div>

          <div className="yt-create-modal-actions">
            <button type="button" className="yt-btn-text" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="yt-btn-primary-text"
              disabled={!title.trim()}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 3. PLAYLISTS OVERVIEW PAGE (Matching Image 5)
// ─────────────────────────────────────────────────────
// 3. WATCH HISTORY PAGE
// ─────────────────────────────────────────────────────
export function YTHistoryView({
  history = [],
  onItemClick,
  onRemoveItem,
  onClearHistory
}) {
  const [searchFilter, setSearchFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const filtered = history.filter(item => {
    const matchSearch = (item.title || '').toLowerCase().includes(searchFilter.toLowerCase());
    const matchType = activeFilter === 'All' || (item.type || 'anime').toLowerCase() === activeFilter.toLowerCase();
    return matchSearch && matchType;
  });

  // Group items by date
  const groupedByDate = filtered.reduce((acc, item) => {
    const dateKey = item.updated_at
      ? (() => {
          const d = new Date(item.updated_at);
          const today = new Date();
          const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
          if (d.toDateString() === today.toDateString()) return 'Today';
          if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
          return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        })()
      : 'Unknown date';
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(item);
    return acc;
  }, {});

  const TYPE_COLORS = { anime: '#6366f1', movie: '#f59e0b', drama: '#ec4899', manhwa: '#10b981', manga: '#3b82f6' };

  const getBadgeLabel = (item) => {
    const t = item.type || 'anime';
    if (t === 'movie') return 'Movie';
    if (t === 'drama') return `Ep. ${item.episode_number || '1'}`;
    if (t === 'manhwa') return `Ch. ${item.chapter_number || '1'}`;
    if (t === 'manga') return `Ch. ${item.chapter_number || '1'}`;
    return `Ep. ${item.episode_number || '?'}`;
  };

  const getTypeLabel = (item) => {
    const t = item.type || 'anime';
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  const FILTERS = ['All', 'Anime', 'Movie', 'Drama', 'Manhwa'];

  return (
    <div className="yt-history-page">
      <div className="yt-history-container">
        <div className="yt-history-main">
          <div className="yt-history-header">
            <h2>Watch history</h2>
            {history.length > 0 && (
              <button className="yt-clear-btn" onClick={onClearHistory}>
                <Trash2 size={16} />
                <span>Clear all watch history</span>
              </button>
            )}
          </div>

          {/* Type filter chips */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: '0.3rem 0.9rem', borderRadius: '20px', border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s',
                  background: activeFilter === f ? '#fff' : 'rgba(255,255,255,0.1)',
                  color: activeFilter === f ? '#000' : 'rgba(255,255,255,0.75)',
                }}
              >{f}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="yt-empty-state">
              <History size={48} />
              <h3>{searchFilter || activeFilter !== 'All' ? 'No results found' : 'No watch history yet'}</h3>
              <p>{searchFilter ? 'Try a different search.' : 'Content you watch will appear here.'}</p>
            </div>
          ) : (
            <div className="yt-history-list">
              {Object.entries(groupedByDate).map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '1.2rem 0 0.6rem', paddingLeft: '2px' }}>
                    {dateLabel}
                  </div>
                  {items.map((item, idx) => {
                    const progressPct = item.duration_seconds > 0
                      ? Math.min(100, Math.round((item.progress_seconds / item.duration_seconds) * 100))
                      : 0;
                    const typeColor = TYPE_COLORS[item.type || 'anime'] || '#6366f1';

                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        className="yt-history-card"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onItemClick && onItemClick(item)}
                      >
                        <div className="yt-history-thumb">
                          <img src={item.cover || item.coverImage || item.bannerImage} alt={item.title} />
                          {progressPct > 0 && (
                            <div className="yt-history-progress-bar">
                              <div className="yt-history-progress-fill" style={{ width: `${progressPct}%` }} />
                            </div>
                          )}
                          <span className="yt-history-ep-badge">{getBadgeLabel(item)}</span>
                        </div>

                        <div className="yt-history-info">
                          <div className="yt-history-title">{item.title}</div>
                          <div className="yt-history-sub" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ background: typeColor, color: '#fff', borderRadius: '4px', padding: '1px 6px', fontSize: '0.68rem', fontWeight: 700 }}>
                              {getTypeLabel(item)}
                            </span>
                            {item.type !== 'movie' && item.episode_number && (
                              <span>Episode {item.episode_number}</span>
                            )}
                            {progressPct > 0 && (
                              <span style={{ color: 'rgba(255,255,255,0.4)' }}>{progressPct}% watched</span>
                            )}
                          </div>
                          {item.updated_at && (
                            <div className="yt-history-time">
                              {new Date(item.updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>

                        <button
                          className="yt-history-remove-btn"
                          onClick={(e) => { e.stopPropagation(); onRemoveItem(item); }}
                          title="Remove from watch history"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="yt-history-sidebar">
          <div className="yt-history-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search watch history"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
          <div style={{ marginTop: '1rem', padding: '0 0.5rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            History is saved locally on your device. Sign in to sync across devices.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 4. PLAYLISTS MAIN PAGE (Matching Image 5 Grid)
// ─────────────────────────────────────────────────────
export function YTPlaylistsView({
  watchLater = [],
  likedVideos = [],
  customPlaylists = [],
  onSelectPlaylist,
  onCreatePlaylistClick,
  onDeletePlaylist
}) {
  const [activeFilter, setActiveFilter] = useState('All');

  return (
    <div className="yt-playlists-page">
      <div className="yt-playlists-header">
        <h2>Playlists</h2>
        <div className="yt-playlists-header-actions">
          <div className="yt-playlists-chips">
            {['All', 'Created', 'Saved'].map(chip => (
              <button
                key={chip}
                className={`yt-chip ${activeFilter === chip ? 'active' : ''}`}
                onClick={() => setActiveFilter(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <button className="yt-create-pl-btn" onClick={onCreatePlaylistClick}>
            <Plus size={18} />
            <span>New Playlist</span>
          </button>
        </div>
      </div>

      <div className="yt-playlists-grid">
        {/* Card 1: Liked videos */}
        <PlaylistCard
          title="Liked videos"
          subtitle="Private • Playlist"
          itemCount={likedVideos.length}
          items={likedVideos}
          onClick={() => onSelectPlaylist({ type: 'liked', title: 'Liked videos', items: likedVideos })}
        />

        {/* Card 2: Watch Later */}
        <PlaylistCard
          title="Watch Later"
          subtitle="Private • Playlist"
          itemCount={watchLater.length}
          items={watchLater}
          onClick={() => onSelectPlaylist({ type: 'watch-later', title: 'Watch Later', items: watchLater })}
        />

        {/* Custom Playlists */}
        {customPlaylists.map((pl) => (
          <PlaylistCard
            key={pl.id}
            title={pl.title}
            subtitle="Private • Playlist"
            itemCount={pl.items?.length || 0}
            items={pl.items || []}
            onClick={() => onSelectPlaylist({ type: 'custom', id: pl.id, title: pl.title, items: pl.items || [] })}
            onDelete={() => onDeletePlaylist(pl.id)}
          />
        ))}

        {/* Add Card */}
        <div className="yt-playlist-card-create" onClick={onCreatePlaylistClick}>
          <div className="yt-create-icon-wrapper">
            <Plus size={32} />
          </div>
          <span>Create new playlist</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 5. PLAYLIST CARD COMPONENT (Matching Image 5 Stack)
// ─────────────────────────────────────────────────────
function PlaylistCard({ title, subtitle, itemCount, items, onClick, onDelete }) {
  const coverImg = items?.[0]?.cover || items?.[0]?.coverImage || items?.[0]?.bannerImage;

  return (
    <div className="yt-playlist-card" onClick={onClick}>
      <div className="yt-playlist-card-thumb">
        {coverImg ? (
          <img src={coverImg} alt={title} />
        ) : (
          <div className="yt-playlist-card-placeholder">
            <ListPlus size={32} />
          </div>
        )}
        <div className="yt-playlist-card-badge">
          <ListPlus size={14} />
          <span>{itemCount} {itemCount === 1 ? 'video' : 'videos'}</span>
        </div>
      </div>

      <div className="yt-playlist-card-meta">
        <div className="yt-playlist-card-text">
          <div className="yt-playlist-card-title">{title}</div>
          <div className="yt-playlist-card-sub">{subtitle}</div>
          <div className="yt-playlist-card-link">View full playlist</div>
        </div>
        {onDelete && (
          <button
            className="yt-playlist-card-menu"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete playlist"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 6. PLAYLIST DETAIL VIEW (Full YouTube Playlist Page)
// ─────────────────────────────────────────────────────
export function YTPlaylistDetailView({
  playlist,
  onBack,
  onStartWatching,
  onAnimeClick,
  onRemoveItemFromPlaylist
}) {
  if (!playlist) return null;

  const items = playlist.items || [];
  const topCover = items[0]?.cover || items[0]?.coverImage || items[0]?.bannerImage;

  return (
    <div className="yt-pl-detail-page">
      {/* Left Column — Sticky Banner */}
      <div className="yt-pl-detail-sidebar">
        <div className="yt-pl-detail-banner-card">
          <div className="yt-pl-detail-cover">
            {topCover ? (
              <img src={topCover} alt={playlist.title} />
            ) : (
              <div className="yt-pl-detail-cover-empty">
                <ListPlus size={48} />
              </div>
            )}
            <div className="yt-pl-detail-cover-count">
              <ListPlus size={14} />
              <span>{items.length} videos</span>
            </div>
          </div>

          <h2 className="yt-pl-detail-title">{playlist.title}</h2>
          <div className="yt-pl-detail-sub">Private • {items.length} items</div>

          <div className="yt-pl-detail-actions">
            {items.length > 0 && (
              <>
                <button className="yt-pl-btn-play" onClick={() => onStartWatching(items[0], items[0].episode_number || 1)}>
                  <Play size={18} fill="black" />
                  <span>Play all</span>
                </button>
                <button className="yt-pl-btn-shuffle" onClick={() => onStartWatching(items[Math.floor(Math.random() * items.length)], 1)}>
                  <Shuffle size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right Column — Video Rows */}
      <div className="yt-pl-detail-main">
        {items.length === 0 ? (
          <div className="yt-empty-state">
            <ListPlus size={48} />
            <h3>No videos in this playlist</h3>
            <p>Click "Save" on any video or anime to add it to this playlist.</p>
          </div>
        ) : (
          <div className="yt-pl-item-list">
            {items.map((item, idx) => (
              <div key={`${item.id}-${idx}`} className="yt-pl-item">
                <div className="yt-pl-item-index">{idx + 1}</div>
                <div className="yt-pl-item-thumb" onClick={() => onStartWatching(item, item.episode_number || 1)}>
                  <img src={item.cover || item.coverImage || item.bannerImage} alt={item.title} />
                </div>
                <div className="yt-pl-item-info">
                  <div className="yt-pl-item-title" onClick={() => onAnimeClick(item.media_id || item.id)}>
                    {item.title}
                  </div>
                  <div className="yt-pl-item-sub">
                    {item.type || 'Anime'} • Episode {item.episode_number || 1}
                  </div>
                </div>
                {onRemoveItemFromPlaylist && (
                  <button
                    className="yt-pl-item-remove"
                    onClick={() => onRemoveItemFromPlaylist(playlist, item)}
                    title="Remove from playlist"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
