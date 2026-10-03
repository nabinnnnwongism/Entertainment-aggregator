import React from 'react';
import ManhwaCard from './ManhwaCard';

function ManhwaRow({ title, series, onSeriesClick }) {
  if (!series || series.length === 0) return null;
  return (
    <section className="manhwa-row">
      <h2 className="manhwa-row-title">{title}</h2>
      <div className="manhwa-row-slider">
        {series.map((s, i) => (
          <ManhwaCard key={s.slug + i} series={s} onClick={() => onSeriesClick(s)} />
        ))}
      </div>
    </section>
  );
}

export default ManhwaRow;
