import React from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * PilotStand geometric mark: an isometric exhibition stand corner
 * paired with a Laser Vermilion (#FF4D2E) directional pilot pointer.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 20, className }) => (
  <svg
    viewBox="0 0 32 32"
    width={size}
    height={size}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Isometric exhibition stand corner frame */}
    <path
      d="M16 4L27 10.2V19.6L24.2 18V11.8L16 7.2L7.8 11.8V20.2L14.2 23.8V27L5 21.8V10.2L16 4Z"
      fill="currentColor"
    />
    {/* Interior stand corner spine */}
    <path
      d="M16 7.2V16.8M16 16.8L8.2 21.2M16 16.8L22.6 20.5"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.55"
    />
    {/* Laser Vermilion pilot cursor arrow */}
    <path
      d="M18.2 18.8L28.4 22.1L23.7 24.1L21.9 28.8L18.2 18.8Z"
      fill="#FF4D2E"
    />
  </svg>
);
