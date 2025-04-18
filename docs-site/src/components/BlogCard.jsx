// Version: 1.0.0
// Description: Blog card with image placeholder using Plaiceholder LQIP
// Author: Ali Kahwaji

import React from 'react';
import styles from './BlogCard.module.css';
import placeholder from '../../.plaiceholder-cache/img_hero.jpg.json'; // ✅ Cached placeholder

export default function BlogCard({ title }) {
  const { base64, img } = placeholder;

  return (
    <div className={styles.card}>
      <img
        src={img.src}
        width={img.width}
        height={img.height}
        alt={title}
        loading="lazy"
        style={{
          objectFit: 'cover',
          borderRadius: 12,
          background: `url(${base64})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <h3>{title}</h3>
    </div>
  );
}
