import React, { useState, useEffect } from 'react';
import { Sparkles, ChevronRight, TrendingUp, Calendar, Flame, Eye, Bookmark } from 'lucide-react';
import { api } from '../mockData';

const DAYS_OF_WEEK = [
  { id: 'MON', label: 'MON' },
  { id: 'TUE', label: 'TUE' },
  { id: 'WED', label: 'WED' },
  { id: 'THU', label: 'THU' },
  { id: 'FRI', label: 'FRI' },
  { id: 'SAT', label: 'SAT' },
  { id: 'SUN', label: 'SUN' },
  { id: 'COMPLETED', label: 'COMPLETED' }
];

const GENRE_CHIPS = [
  { id: 'all', label: 'All Categories' },
  { id: 'drama', label: 'Drama' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'action', label: 'Action' },
  { id: 'romance', label: 'Romance' },
  { id: 'slice-of-life', label: 'Slice of life' },
  { id: 'superhero', label: 'Superhero' },
  { id: 'sci-fi', label: 'Sci-Fi' }
];

export default function WebtoonComicView({ onComicClick }) {
  const [heroComics, setHeroComics] = useState([]);
  const [activeHeroIdx, setActiveHeroIdx] = useState(0);
  const [rankTab, setRankTab] = useState('trending');
  const [rankList, setRankList] = useState([]);
  const [scheduleTab, setScheduleTab] = useState('MON');
  const [scheduleMap, setScheduleMap] = useState({});
  const [scheduleList, setScheduleList] = useState([]);
  const [activeGenre, setActiveGenre] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    api.getMangaHomeData().then(data => {
      if (!mounted) return;

      const trending = data.trending || [];
      const popular = data.popular || [];
      const featured = data.featured || trending.slice(0, 5);
      const schedule = data.schedule || {};

      setScheduleMap(schedule);
      if (featured.length > 0) setHeroComics(featured);
      setRankList(rankTab === 'trending' ? trending.slice(0, 5) : popular.slice(0, 5));

      const dayItems = schedule[scheduleTab] || trending.slice(0, 12);
      setScheduleList(dayItems);
      setLoading(false);
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, []);

  // Update list when genre filter or schedule tab changes
  useEffect(() => {
    let mounted = true;
    if (activeGenre === 'all') {
      const dayItems = scheduleMap[scheduleTab] || [];
      if (dayItems.length > 0) setScheduleList(dayItems);
      return;
    }

    api.getMangaCategoryData('manhwa', activeGenre).then(data => {
      if (!mounted) return;
      const items = data.items || data.trending || [];
      setScheduleList(items);
    });

    return () => { mounted = false; };
  }, [activeGenre, scheduleTab, scheduleMap]);

  useEffect(() => {
    api.getMangaHomeData().then(data => {
      const list = rankTab === 'trending' ? (data.trending || []) : (data.popular || []);
      if (list.length > 0) setRankList(list.slice(0, 5));
    });
  }, [rankTab]);

  // While loading, there is no real hero — render a layout-faithful placeholder
  // instead of leaking a hardcoded fake title/description into the UI.
  const currentHero = loading ? null : (heroComics[activeHeroIdx] || null);

  const handleImgError = (e) => {
    e.target.style.display = 'none';
    if (e.target.parentNode) {
      e.target.parentNode.classList.add('wt-img-fallback');
    }
  };

  return (
    <div className="wt-container">
      {/* ── 1. Webtoon Hero Slider ── */}
      <div className="wt-hero">
        {loading ? (
          // Layout-faithful hero skeleton: gradient backdrop + bottom content
          // block skeleton shaped to match the real hero (genre chip, title,
          // two-line description, button).
          <div className="wt-hero-skel">
            <div className="wt-hero-skel-content">
              <div className="wt-skeleton wt-sk-stagger-2" style={{ width: '120px', height: '16px' }} />
              <div className="wt-skeleton wt-sk-stagger-3" style={{ width: '60%', maxWidth: '420px', height: '34px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '650px' }}>
                <div className="wt-skeleton wt-sk-stagger-4" style={{ width: '100%', height: '14px' }} />
                <div className="wt-skeleton wt-sk-stagger-5" style={{ width: '75%', height: '14px' }} />
              </div>
              <div className="wt-skeleton wt-sk-stagger-6" style={{ width: '130px', height: '40px', borderRadius: '24px', marginTop: '8px' }} />
            </div>
          </div>
        ) : currentHero ? (
          <>
            <img
              src={currentHero.bannerImage || currentHero.coverImage || currentHero.banner || currentHero.cover}
              alt={currentHero.title}
              className="wt-hero-bg"
              onError={handleImgError}
            />
            <div className="wt-hero-content wt-reveal-fade">
              <span className="wt-hero-genre">{currentHero.genres?.[0] || 'WEBTOON ORIGINAL'}</span>
              <h1 className="wt-hero-title">{currentHero.title}</h1>
              <p className="wt-hero-desc">{currentHero.description}</p>
              <button className="wt-hero-btn" onClick={() => onComicClick(currentHero)}>
                Read Now
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* ── 2. Trending & Popular Series (Top 5 Numbers) ── */}
      <div className="wt-section-header">
        <h2 className="wt-section-title">Trending &amp; Popular Series</h2>
        <div className="wt-sub-tabs">
          <button
            className={`wt-sub-tab ${rankTab === 'trending' ? 'active' : ''}`}
            onClick={() => setRankTab('trending')}
          >
            Trending
          </button>
          <button
            className={`wt-sub-tab ${rankTab === 'popular' ? 'active' : ''}`}
            onClick={() => setRankTab('popular')}
          >
            Popular
          </button>
        </div>
      </div>

      {loading ? (
        <div className="wt-rank-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="wt-rank-card">
              <div className="wt-rank-thumb-wrap">
                <div className={`wt-skeleton wt-sk-stagger-${i + 1}`} style={{ position: 'absolute', inset: 0, height: '100%', border: 'none', borderRadius: '0' }} />
              </div>
              <div className="wt-rank-info">
                <div className={`wt-skeleton wt-sk-stagger-${i + 1}`} style={{ width: '85%', height: '15px' }} />
                <div className={`wt-skeleton wt-sk-stagger-${i + 1}`} style={{ width: '50%', height: '12px', marginTop: '4px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="wt-rank-grid wt-reveal">
          {rankList.map((item, idx) => {
            const trendUp = idx % 2 === 0;
            const delta = (idx % 3) + 1;
            const thumbUrl = item.coverImage || item.bannerImage || item.cover || item.banner;
            return (
              <div key={item.id || idx} className="wt-rank-card" onClick={() => onComicClick(item)}>
                <div className="wt-rank-thumb-wrap">
                  <img src={thumbUrl} alt={item.title} loading="lazy" onError={handleImgError} />
                  <span className="wt-rank-number">{idx + 1}</span>
                  <span className={`wt-rank-trend ${trendUp ? 'up' : 'down'}`}>
                    {trendUp ? `▲ ${delta}` : `▼ ${delta}`}
                  </span>
                </div>
                <div className="wt-rank-info">
                  <span className="wt-rank-title">{item.title}</span>
                  <span className="wt-rank-genre">{item.genres?.slice(0, 2).join(' • ') || 'Fantasy'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 3. Weekly Update Schedule ── */}
      <div className="wt-section-header">
        <h2 className="wt-section-title">Weekly Update Schedule</h2>
      </div>

      <div className="wt-schedule-tabs">
        {DAYS_OF_WEEK.map(day => (
          <button
            key={day.id}
            className={`wt-schedule-tab ${scheduleTab === day.id ? 'active' : ''}`}
            onClick={() => setScheduleTab(day.id)}
          >
            {day.label}
          </button>
        ))}
      </div>

      {/* Category Chips Bar */}
      <div className="wt-category-chips">
        {GENRE_CHIPS.map(chip => (
          <button
            key={chip.id}
            className={`wt-category-chip ${activeGenre === chip.id ? 'active' : ''}`}
            onClick={() => setActiveGenre(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="wt-schedule-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="wt-card">
              <div className="wt-card-thumb-wrap">
                <div className={`wt-skeleton wt-sk-stagger-${(i % 6) + 1}`} style={{ position: 'absolute', inset: 0, height: '100%', border: 'none', borderRadius: '0' }} />
              </div>
              <div className={`wt-skeleton wt-sk-stagger-${(i % 6) + 1}`} style={{ width: '85%', height: '14px', marginTop: '8px' }} />
              <div className={`wt-skeleton wt-sk-stagger-${(i % 6) + 1}`} style={{ width: '45%', height: '12px', marginTop: '4px' }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="wt-schedule-grid wt-reveal">
          {scheduleList.map((item, idx) => {
            const thumbUrl = item.coverImage || item.bannerImage || item.cover || item.banner;
            return (
              <div key={item.id || idx} className="wt-card" onClick={() => onComicClick(item)}>
                <div className="wt-card-thumb-wrap">
                  <img src={thumbUrl} alt={item.title} loading="lazy" onError={handleImgError} />
                  <span className="wt-card-up-badge">UP</span>
                </div>
                <span className="wt-card-title">{item.title}</span>
                <span className="wt-card-subs">
                  {(Math.floor((item.popularity || 450000) / 1000) / 10).toFixed(1)}M subs
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
