import React, { useState, useEffect, useRef } from 'react';
import { Search, Mic, Bell, LogOut, User, Bookmark, History, Menu, ArrowLeft, X, Settings, Clock, ThumbsUp, Download, ListVideo, ChevronRight, Film, Tv, BookOpen } from 'lucide-react';

/* ── YouTube-style Mobile Slide-in Drawer ─────────────────────────── */
export function MobileDrawer({ open, onClose, setView, setSection, user, onSignIn, onSignOut, activeView }) {
  const drawerRef = useRef(null);

  // Close on outside tap
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) onClose();
    };
    setTimeout(() => document.addEventListener('touchstart', handleOutside), 100);
    setTimeout(() => document.addEventListener('mousedown', handleOutside), 100);
    return () => {
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const navigate = (view, section) => {
    if (!user && ['watch-history', 'watch-later', 'liked', 'playlists'].includes(view)) {
      onClose();
      if (onSignIn) onSignIn();
      return;
    }
    if (section) setSection(section);
    setView(view);
    window.scrollTo(0, 0);
    onClose();
  };

  const displayName = user?.user_metadata?.username || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Guest';
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const avatarUrl = user?.user_metadata?.avatar_url || null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9998,
          background: 'rgba(0,0,0,0.6)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.28s ease',
          backdropFilter: open ? 'blur(2px)' : 'none',
        }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: 'min(82vw, 300px)',
          zIndex: 9999,
          background: '#0f0f0f',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowY: 'auto',
          boxShadow: '4px 0 24px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Drawer Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.7rem',
          padding: '1rem 1rem 0.8rem',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          position: 'sticky', top: 0, background: '#0f0f0f', zIndex: 1,
        }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <Menu size={22} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }} onClick={() => { navigate('home', 'anime'); }}>
            <svg viewBox="0 0 26 18" width="22" height="16" aria-hidden="true">
              <rect width="26" height="18" rx="4" fill="#FF0000"/>
              <polygon points="11,4.5 11,13.5 19,9" fill="white"/>
            </svg>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff', letterSpacing: '-0.3px' }}>EetNet</span>
          </div>
        </div>

        {/* User profile strip (if signed in) */}
        {user ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.8rem',
            padding: '0.9rem 1rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#fff', fontSize: '0.95rem',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {avatarUrl ? <img src={avatarUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarLetter}
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '0.88rem', lineHeight: 1.2 }}>{displayName}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.72rem' }}>{user.email}</div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { onClose(); if (onSignIn) onSignIn(); }}
            style={{
              margin: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
              background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#3ea6ff',
              padding: '0.5rem 1rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              width: 'calc(100% - 2rem)',
            }}
          >
            <User size={16} /> Sign in
          </button>
        )}

        {/* You section */}
        <div style={{ padding: '0.5rem 0' }}>
          <div style={{ padding: '0.5rem 1rem 0.2rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>You</div>
          <DrawerItem icon={<Clock size={20} />} label="History" onClick={() => navigate('watch-history')} active={activeView === 'watch-history'} />
          <DrawerItem icon={<ListVideo size={20} />} label="Playlists" onClick={() => navigate('playlists')} active={activeView === 'playlists'} />
          <DrawerItem icon={<Clock size={20} />} label="Watch later" onClick={() => navigate('watch-later')} active={activeView === 'watch-later'} />
          <DrawerItem icon={<ThumbsUp size={20} />} label="Liked videos" onClick={() => navigate('liked')} active={activeView === 'liked'} />
          <DrawerItem icon={<Download size={20} />} label="Downloads" onClick={() => navigate('my-list')} active={activeView === 'my-list'} />
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0.4rem 0' }} />

        {/* Browse section */}
        <div style={{ padding: '0.5rem 0' }}>
          <div style={{ padding: '0.5rem 1rem 0.2rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Browse</div>
          <DrawerItem icon={<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg>} label="Anime" onClick={() => navigate('anime', 'anime')} active={activeView === 'anime'} />
          <DrawerItem icon={<Film size={20} />} label="Movies" onClick={() => navigate('movies', 'movies')} active={activeView === 'movies'} />
          <DrawerItem icon={<BookOpen size={20} />} label="Comics & Manga" onClick={() => navigate('manga', 'manga')} active={activeView === 'manga'} />
          <DrawerItem icon={<Tv size={20} />} label="K-Dramas" onClick={() => navigate('dramas', 'drama')} active={activeView === 'dramas'} />
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0.4rem 0' }} />

        {/* Account section */}
        {user && (
          <div style={{ padding: '0.5rem 0' }}>
            <DrawerItem icon={<LogOut size={20} />} label="Sign out" onClick={() => { onClose(); if (onSignOut) onSignOut(); }} />
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>
          © 2026 EetNet
        </div>
      </div>
    </>
  );
}

function DrawerItem({ icon, label, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        width: '100%', background: active ? 'rgba(255,255,255,0.1)' : 'none',
        border: 'none', color: active ? '#fff' : 'rgba(255,255,255,0.85)',
        padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.9rem',
        fontWeight: active ? 700 : 400, textAlign: 'left',
        borderRadius: '0 24px 24px 0', marginRight: '0.5rem',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'none'; }}
    >
      <span style={{ color: active ? '#fff' : 'rgba(255,255,255,0.7)', display: 'flex' }}>{icon}</span>
      {label}
    </button>
  );
}

export function MobileBottomNav({ activeView, setView, setSection, user, onSignIn }) {
  return (
    <nav className="yt-mobile-bottom-nav">
      <button
        className={`yt-mobile-nav-item ${activeView === 'home' ? 'active' : ''}`}
        onClick={() => { setSection('anime'); setView('home'); window.scrollTo(0, 0); }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        <span>Home</span>
      </button>
      <button
        className={`yt-mobile-nav-item ${activeView === 'anime' ? 'active' : ''}`}
        onClick={() => { setSection('anime'); setView('anime'); window.scrollTo(0, 0); }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg>
        <span>Anime</span>
      </button>
      <button
        className={`yt-mobile-nav-item ${activeView === 'movies' || activeView === 'movie-detail' || activeView === 'movie-watch' ? 'active' : ''}`}
        onClick={() => { setSection('movies'); setView('movies'); window.scrollTo(0, 0); }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>
        <span>Movies</span>
      </button>
      <button
        className={`yt-mobile-nav-item ${activeView === 'manga' || activeView === 'comic-category' ? 'active' : ''}`}
        onClick={() => { setSection('manga'); setView('manga'); window.scrollTo(0, 0); }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
        <span>Comics</span>
      </button>
      <button
        className={`yt-mobile-nav-item ${activeView === 'dramas' ? 'active' : ''}`}
        onClick={() => { setSection('drama'); setView('dramas'); window.scrollTo(0, 0); }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>
        <span>Drama</span>
      </button>
      <button
        className={`yt-mobile-nav-item ${['my-list','watch-history','watch-later','liked'].includes(activeView) ? 'active' : ''}`}
        onClick={() => { if (!user) { if (onSignIn) onSignIn(); return; } setView('my-list'); window.scrollTo(0, 0); }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
        <span>You</span>
      </button>
    </nav>
  );
}

export default function Navbar({
  onSearch,
  activeView,
  setView,
  onHome,
  activeSection = 'anime',
  user,
  onSignIn,
  onSignOut,
  onToggleSidebar,
  notifications = [],
  onSelectNotification,
  setSection,
}) {
  const [searchVal, setSearchVal] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const mobileInputRef = useRef(null);

  const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  useEffect(() => { setSearchVal(''); }, [activeSection]);

  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (mobileSearchOpen && mobileInputRef.current) {
      mobileInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) onSearch(searchVal);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchVal(val);
    if (onSearch) onSearch(val);
  };

  const displayName = user?.user_metadata?.username || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const avatarLetter = displayName.charAt(0).toUpperCase();
  const avatarUrl = user?.user_metadata?.avatar_url || null;

  const unreadCount = notifications.filter(n => !n.read).length;
  const importantNotifs = notifications.filter(n => n.type === 'season');
  const regularNotifs = notifications.filter(n => n.type !== 'season');

  const handleMenuClick = () => {
    if (isMobile) {
      setDrawerOpen(true);
    } else {
      if (onToggleSidebar) onToggleSidebar();
    }
  };

  return (
    <>
      {/* Mobile Drawer */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        setView={setView}
        setSection={setSection || (() => {})}
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        activeView={activeView}
      />

      <header className="yt-header">
        {/* Mobile Expandable Search Bar Overlay */}
        {mobileSearchOpen ? (
          <div className="yt-mobile-search-bar">
            <button className="yt-icon-btn" onClick={() => setMobileSearchOpen(false)} aria-label="Close search">
              <ArrowLeft size={20} />
            </button>
            <form className="yt-mobile-search-form" onSubmit={handleSearchSubmit}>
              <input
                ref={mobileInputRef}
                type="text"
                className="yt-mobile-search-input"
                placeholder="Search anime, drama, movies, manga..."
                value={searchVal}
                onChange={handleInputChange}
              />
              {searchVal && (
                <button type="button" className="yt-search-clear-btn" onClick={() => { setSearchVal(''); if (onSearch) onSearch(''); }}>
                  <X size={16} />
                </button>
              )}
            </form>
            <button className="yt-mic-btn" title="Voice search" aria-label="Voice search">
              <Mic size={18} />
            </button>
          </div>
        ) : (
          <>
            <div className="yt-header-left">
              <button className="yt-icon-btn" onClick={handleMenuClick} aria-label="Toggle menu" title="Menu">
                <Menu size={22} />
              </button>
              <div className="yt-logo" onClick={onHome} title="EetNet Home">
                <svg viewBox="0 0 26 18" width="26" height="18" aria-hidden="true">
                  <rect width="26" height="18" rx="4" fill="#FF0000"/>
                  <polygon points="11,4.5 11,13.5 19,9" fill="white"/>
                </svg>
                <span className="yt-logo-text">EetNet</span>
              </div>
            </div>

            <div className="yt-header-center">
              <form className="yt-search-form" onSubmit={handleSearchSubmit}>
                <div className="yt-search-input-wrap">
                  <input
                    type="text"
                    className="yt-search-input"
                    placeholder="Search anime, drama, movies, manga..."
                    value={searchVal}
                    onChange={handleInputChange}
                  />
                </div>
                <button type="submit" className="yt-search-btn" aria-label="Search">
                  <Search size={18} />
                </button>
              </form>
              <button className="yt-mic-btn" title="Voice search" aria-label="Voice search">
                <Mic size={18} />
              </button>
            </div>

            <div className="yt-header-right">
              {/* Mobile search trigger icon */}
              <button className="yt-icon-btn yt-mobile-search-trigger" onClick={() => setMobileSearchOpen(true)} aria-label="Search">
                <Search size={20} />
              </button>

              {/* Notifications */}
              <div className="yt-notif-wrap" ref={notifRef}>
                <button className="yt-icon-btn yt-notif-btn" onClick={() => setNotifOpen(v => !v)} title="Notifications" aria-label="Notifications">
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="yt-notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </button>

                {notifOpen && (
                  <div className="yt-notif-dropdown">
                    <div className="yt-notif-header">
                      <span>Notifications</span>
                      <button className="yt-notif-gear-btn" title="Settings">
                        <Settings size={18} />
                      </button>
                    </div>

                    <div className="yt-notif-body">
                      {importantNotifs.length > 0 && (
                        <div className="yt-notif-section">
                          <div className="yt-notif-section-title">Important</div>
                          {importantNotifs.map((n) => (
                            <div
                              key={n.id}
                              className={`yt-notif-item ${!n.read ? 'unread' : ''}`}
                              onClick={() => { setNotifOpen(false); if (onSelectNotification) onSelectNotification(n); }}
                            >
                              <div className="yt-notif-avatar">
                                {n.avatar ? <img src={n.avatar} alt={n.animeTitle} /> : <span>🎙️</span>}
                              </div>
                              <div className="yt-notif-content">
                                <div className="yt-notif-text"><strong>{n.animeTitle}</strong> {n.message}</div>
                                <div className="yt-notif-time">{n.timeAgo || 'Recently'}</div>
                              </div>
                              {n.thumb && (<div className="yt-notif-thumb"><img src={n.thumb} alt="Preview" /></div>)}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="yt-notif-section">
                        {importantNotifs.length > 0 && (<div className="yt-notif-section-title">More notifications</div>)}
                        {regularNotifs.length === 0 && importantNotifs.length === 0 ? (
                          <div className="yt-notif-empty">
                            <Bell size={32} />
                            <p>No notifications yet</p>
                            <small>Subscribe to anime shows to receive release updates!</small>
                          </div>
                        ) : (
                          regularNotifs.map((n) => (
                            <div
                              key={n.id}
                              className={`yt-notif-item ${!n.read ? 'unread' : ''}`}
                              onClick={() => { setNotifOpen(false); if (onSelectNotification) onSelectNotification(n); }}
                            >
                              <div className="yt-notif-avatar">
                                {n.avatar ? <img src={n.avatar} alt={n.animeTitle} /> : <span>🎙️</span>}
                              </div>
                              <div className="yt-notif-content">
                                <div className="yt-notif-text"><strong>{n.animeTitle}</strong> {n.message}</div>
                                <div className="yt-notif-time">{n.timeAgo || 'Recently'}</div>
                              </div>
                              {n.thumb && (<div className="yt-notif-thumb"><img src={n.thumb} alt="Preview" /></div>)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {user ? (
                <div className="yt-profile-wrap" ref={profileRef}>
                  <button className="yt-avatar-btn" onClick={() => setProfileOpen(v => !v)} aria-label="Account">
                    {avatarUrl
                      ? <img src={avatarUrl} alt={displayName} className="yt-avatar-img" />
                      : <span className="yt-avatar-letter">{avatarLetter}</span>
                    }
                  </button>
                  {profileOpen && (
                    <div className="yt-profile-dropdown" role="menu">
                      <div className="yt-profile-dropdown-header">
                        <div className="yt-profile-dropdown-avatar">
                          {avatarUrl ? <img src={avatarUrl} alt={displayName} /> : <span>{avatarLetter}</span>}
                        </div>
                        <div className="yt-profile-dropdown-info">
                          <strong>{displayName}</strong>
                          <small>{user.email}</small>
                        </div>
                      </div>
                      <div className="yt-dropdown-divider" />
                      <button className="yt-dropdown-item" onClick={() => { setProfileOpen(false); setView('my-list'); }}>
                        <Bookmark size={16} /> My Watchlist
                      </button>
                      <button className="yt-dropdown-item" onClick={() => { setProfileOpen(false); setView('watch-history'); }}>
                        <History size={16} /> Watch History
                      </button>
                      <div className="yt-dropdown-divider" />
                      <button className="yt-dropdown-item danger" onClick={() => { setProfileOpen(false); onSignOut(); }}>
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button className="yt-signin-btn" onClick={onSignIn}>
                  <User size={18} />
                  <span className="yt-signin-text">Sign in</span>
                </button>
              )}
            </div>
          </>
        )}
      </header>
    </>
  );
}



