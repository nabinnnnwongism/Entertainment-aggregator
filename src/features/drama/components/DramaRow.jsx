import React from 'react';
import DramaCard from './DramaCard';

export default function DramaRow({ title, icon, dramas, onDramaClick }) {
  if (!dramas || dramas.length === 0) return null;

  return (
    <section className="hv-section netflix-row">
      <div className="hv-section-header">
        <h2 className="hv-section-title">
          {icon && <span className="hv-title-accent">{icon}</span>} {title}
        </h2>
        <span className="hv-section-line" />
      </div>
      <div className="netflix-slider">
        {dramas.map(d => (
          <DramaCard key={d.id} drama={d} onClick={() => onDramaClick(d)} />
        ))}
      </div>
    </section>
  );
}
