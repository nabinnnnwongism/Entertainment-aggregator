import { useState, useEffect } from 'react';

/**
 * Custom hook to detect mobile viewports and touch devices.
 * Automatically updates on window resize or orientation change.
 */
export function useDeviceType(mobileBreakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= mobileBreakpoint || /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
  });

  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth;
    return w > 500 && w <= 1024;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const w = window.innerWidth;
      const mobileMatch = w <= mobileBreakpoint || /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
      setIsMobile(mobileMatch);
      setIsTablet(w > 500 && w <= 1024);

      if (mobileMatch) {
        document.body.classList.add('is-mobile-device');
        document.body.classList.remove('is-desktop-device');
      } else {
        document.body.classList.add('is-desktop-device');
        document.body.classList.remove('is-mobile-device');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [mobileBreakpoint]);

  return { isMobile, isTablet, isDesktop: !isMobile };
}
