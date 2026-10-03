import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard from './MovieCard';

function MovieRow({ title, icon, movies, onMovieClick }) {
  const rowRef = React.useRef(null);
  const [showChevrons, setShowChevrons] = React.useState(false);

  if (!movies || movies.length === 0) return null;

  const scroll = (direction) => {
    if (!rowRef.current) return;
    const scrollAmount = direction === 'left' ? -480 : 480;
    rowRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  return (
    <section style={{ marginTop: '2.2rem', position: 'relative' }}
      onMouseEnter={() => setShowChevrons(true)}
      onMouseLeave={() => setShowChevrons(false)}
    >
      {/* Row Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.9rem' }}>
        {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
        <h2 style={{
          margin: 0, fontSize: '1.15rem', fontWeight: 700,
          color: '#ffffff', letterSpacing: '-0.2px'
        }}>{title}</h2>
      </div>

      {/* Horizontal scrolling row wrapper with chevrons */}
      <div style={{ position: 'relative' }}>
        {showChevrons && (
          <>
            <button
              onClick={() => scroll('left')}
              style={{
                position: 'absolute', left: '-16px', top: '50%', transform: 'translateY(-50%)',
                zIndex: 10, width: '40px', height: '40px', borderRadius: '50%',
                background: 'rgba(20,20,20,0.85)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)'
              }}
              aria-label="Scroll left"
            ><ChevronLeft size={22} /></button>
            <button
              onClick={() => scroll('right')}
              style={{
                position: 'absolute', right: '-16px', top: '50%', transform: 'translateY(-50%)',
                zIndex: 10, width: '40px', height: '40px', borderRadius: '50%',
                background: 'rgba(20,20,20,0.85)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)'
              }}
              aria-label="Scroll right"
            ><ChevronRight size={22} /></button>
          </>
        )}

        <div ref={rowRef} className="mp-scroll-row">
          {movies.slice(0, 30).map(m => (
            <div key={m.id} className="mp-scroll-item">
              <MovieCard movie={m} onClick={() => onMovieClick(m)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default MovieRow;
