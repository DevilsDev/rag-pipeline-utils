// docs-site/src/components/BlogImage.jsx
// Version: 2.0.0
// Description: Resilient image renderer with LQIP blur fallback from Plaiceholder cache
// Author: Ali Kahwaji

import React from 'react';
import PropTypes from 'prop-types';
import defaultPlaceholder from '../../.plaiceholder-cache/img_hero.jpg.json'; // Default fallback image

/**
 * BlogImage
 * Renders an image using precomputed LQIP placeholders
 *
 * @param {string} srcKey - Cache key (e.g., 'img_logo') without .json
 * @param {string} alt - Image alt text
 * @param {string} [className] - Optional className for custom styling
 * @param {object} [style] - Optional inline styles
 * @returns {JSX.Element}
 */
export default function BlogImage({ srcKey, alt, className = '', style = {} }) {
  let imageData;

  try {
    imageData = require(`../../.plaiceholder-cache/${srcKey}.json`);
  } catch (e) {
    console.warn(`⚠️ LQIP not found for ${srcKey}, using fallback.`);
    imageData = defaultPlaceholder;
  }

  const { base64, img } = imageData;

  return (
    <img
      src={img.src}
      width={img.width}
      height={img.height}
      alt={alt}
      loading="lazy"
      className={className}
      style={{
        objectFit: 'cover',
        background: `url(${base64})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRadius: '12px',
        transition: 'opacity 0.3s ease',
        ...style,
      }}
    />
  );
}

BlogImage.propTypes = {
  srcKey: PropTypes.string.isRequired,
  alt: PropTypes.string.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
};
