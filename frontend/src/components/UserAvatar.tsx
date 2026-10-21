import React, { useState } from 'react';

interface UserAvatarProps {
  name: string;
  picture?: string;
  /** Classes for size/shape, shared by the photo and the letter fallback */
  className: string;
  /** Extra classes for the letter fallback (e.g. text size) */
  fallbackClassName?: string;
}

/**
 * Google profile photo with a first-letter fallback.
 * `no-referrer` avoids Google's 429 (Too Many Requests) on hot-linked lh3.googleusercontent.com photos,
 * and if the photo still fails we show the letter instead of a broken image.
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({ name, picture, className, fallbackClassName = '' }) => {
  const [failed, setFailed] = useState(false);

  if (picture && !failed) {
    return (
      <img
        src={picture}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} border border-slate-200 dark:border-slate-700 object-cover shrink-0`}
      />
    );
  }
  return (
    <div className={`${className} bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 ${fallbackClassName}`}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
};
