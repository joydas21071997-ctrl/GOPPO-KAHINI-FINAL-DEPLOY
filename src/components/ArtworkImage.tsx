import React, { useEffect, useState } from 'react';
import { resolveArtworkUrl } from '../utils/artworkRegistry';

interface ArtworkImageProps {
  srcKeyOrUrl: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

export const ArtworkImage: React.FC<ArtworkImageProps> = ({
  srcKeyOrUrl,
  alt,
  className = '',
  eager = false,
}) => {
  const [failed, setFailed] = useState(false);
  const resolved = resolveArtworkUrl(srcKeyOrUrl);

  useEffect(() => {
    setFailed(false);
  }, [srcKeyOrUrl]);

  if (!resolved || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#23141B] via-[#171217] to-[#0D0B0E] p-4 text-center ${className}`}
      >
        <svg
          viewBox="0 0 40 40"
          fill="none"
          className="h-9 w-9 text-[#EF4444]/80 mb-2 shrink-0"
          aria-hidden="true"
        >
          <path
            d="M20 7V13M14 10V14M26 10V14M9 18C13 17 16.8 18 20 20.5C23.2 18 27 17 31 18V30C27 29 23.2 30 20 32.2C16.8 30 13 29 9 30V18Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-editorial text-xs text-[#F6F1E7]/85 line-clamp-2 max-w-[18ch]">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
