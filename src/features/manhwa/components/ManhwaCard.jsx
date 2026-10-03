import React, { useState } from 'react';
import { InlineLoader } from '../../../App';

function ManhwaCard({ series, onClick }) {
  const [imgErr, setImgErr] = React.useState(false);
  return (
    <button className="manhwa-card" onClick={onClick}>
      <div className="manhwa-card-art">
        {!imgErr ? (
          <img
            src={series.cover}
            alt={series.title}
            loading="lazy"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="manhwa-card-placeholder">
            <span>{series.title?.[0] || '?'}</span>
          </div>
        )}
        <div className="manhwa-card-overlay">
          <div className="manhwa-card-read">Read</div>
        </div>
      </div>
      <div className="manhwa-card-info">
        <span className="manhwa-card-title">{series.title}</span>
      </div>
    </button>
  );
}

export default ManhwaCard;
