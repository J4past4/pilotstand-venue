import React from 'react';

interface Props {
  catalogId: string;
}

export const EquipmentThumb: React.FC<Props> = ({ catalogId }) => {
  const stroke = '#1B365D';
  const accent = '#D95D39';
  const fillSoft = '#E8EEF5';

  switch (catalogId) {
    case 'popup-wall-straight':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="6" y="12" width="36" height="24" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <line x1="15" y1="12" x2="15" y2="36" stroke={stroke} strokeOpacity="0.25" strokeWidth="1.5" />
          <line x1="24" y1="12" x2="24" y2="36" stroke={stroke} strokeOpacity="0.25" strokeWidth="1.5" />
          <line x1="33" y1="12" x2="33" y2="36" stroke={stroke} strokeOpacity="0.25" strokeWidth="1.5" />
          <path d="M14 12 L14 8 L17 8 M34 12 L34 8 L31 8" stroke={accent} strokeWidth="2" fill="none" strokeLinecap="round" />
          <rect x="11" y="18" width="14" height="3" rx="1.5" fill={accent} />
          <rect x="11" y="24" width="22" height="2.5" rx="1" fill={stroke} opacity="0.45" />
        </svg>
      );
    case 'popup-wall-curved':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <path d="M6 14 Q24 8 42 14 L42 36 Q24 30 6 36 Z" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <path d="M12 20 Q24 16 36 20" stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M14 26 Q24 23 34 26" stroke={stroke} strokeOpacity="0.4" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'seg-lightbox':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="8" y="10" width="32" height="26" rx="2" fill="#FFF7ED" stroke={accent} strokeWidth="2" />
          <rect x="11" y="13" width="26" height="20" rx="1" fill={fillSoft} stroke={stroke} strokeWidth="1.2" />
          <line x1="12" y1="39" x2="20" y2="39" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <line x1="28" y1="39" x2="36" y2="39" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'front-arch':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <path d="M7 39 L7 11 L41 11 L41 39 L34 39 L34 20 L14 20 L14 39 Z" fill={fillSoft} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <rect x="12" y="13.5" width="24" height="3.5" rx="1.5" fill={accent} />
        </svg>
      );
    case 'storage-cabin':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <polygon points="10,14 28,10 38,14 38,38 28,41 10,37" fill={fillSoft} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <line x1="28" y1="10" x2="28" y2="41" stroke={stroke} strokeWidth="1.6" />
          <rect x="14" y="19" width="10" height="5" rx="1" fill={accent} />
          <circle cx="33" cy="27" r="1.4" fill={stroke} />
        </svg>
      );
    case 'rollup-banner':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="16" y="7" width="16" height="30" rx="1.5" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <rect x="13" y="37" width="22" height="4" rx="1.5" fill={stroke} />
          <rect x="19" y="13" width="10" height="4" rx="1" fill={accent} />
          <line x1="19" y1="22" x2="29" y2="22" stroke={stroke} strokeOpacity="0.45" strokeWidth="2" />
          <line x1="19" y1="27" x2="27" y2="27" stroke={stroke} strokeOpacity="0.45" strokeWidth="2" />
        </svg>
      );
    case 'hanging-cube':
    case 'hanging-ring':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <line x1="15" y1="5" x2="15" y2="16" stroke={stroke} strokeWidth="1.4" strokeDasharray="2 2" />
          <line x1="33" y1="5" x2="33" y2="16" stroke={stroke} strokeWidth="1.4" strokeDasharray="2 2" />
          {catalogId === 'hanging-ring' ? (
            <ellipse cx="24" cy="22" rx="15" ry="7" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          ) : (
            <rect x="10" y="16" width="28" height="13" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          )}
          <rect x="16" y="20.5" width="16" height="3.5" rx="1.5" fill={accent} />
        </svg>
      );
    case 'tv-stand':
    case 'led-video-wall':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="7" y="10" width="34" height="21" rx="2" fill="#182234" stroke={stroke} strokeWidth="2" />
          <path d="M13 24 L20 18 L26 22 L35 14" stroke={accent} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="24" y1="31" x2="24" y2="39" stroke={stroke} strokeWidth="2.5" />
          <line x1="15" y1="39" x2="33" y2="39" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case 'reception-desk':
    case 'quickfold-counter':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="6" y="15" width="36" height="4" rx="1.5" fill={stroke} />
          <rect x="9" y="19" width="30" height="19" rx="1.5" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <rect x="15" y="25" width="18" height="6" rx="1.5" fill={accent} />
        </svg>
      );
    case 'demo-kiosk':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <polygon points="16,16 32,12 32,17 16,19" fill={stroke} />
          <rect x="17" y="19" width="14" height="20" rx="1.5" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <rect x="20" y="24" width="8" height="4" rx="1" fill={accent} />
          <line x1="13" y1="39" x2="35" y2="39" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'display-plinth':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="16" y="9" width="16" height="11" rx="1" fill="#E0F2FE" fillOpacity="0.65" stroke={stroke} strokeWidth="1.4" strokeDasharray="3 2" />
          <polygon points="24,11.5 27.5,14.5 24,17.5 20.5,14.5" fill={accent} />
          <rect x="15" y="20" width="18" height="20" rx="1.5" fill={fillSoft} stroke={stroke} strokeWidth="2" />
        </svg>
      );
    case 'bistro-table':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <ellipse cx="24" cy="14" rx="14" ry="4" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <line x1="24" y1="18" x2="24" y2="38" stroke={stroke} strokeWidth="2.5" />
          <ellipse cx="24" cy="39" rx="8" ry="2.5" fill={stroke} />
        </svg>
      );
    case 'meeting-table':
    case 'coffee-table':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="7" y="17" width="34" height="5" rx="1.5" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <line x1="12" y1="22" x2="10" y2="37" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="36" y1="22" x2="38" y2="37" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'bar-stool':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <path d="M16 11 L16 20 L32 20" fill="none" stroke={accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="24" y1="22" x2="24" y2="39" stroke={stroke} strokeWidth="2.4" />
          <line x1="19" y1="31" x2="29" y2="31" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <line x1="17" y1="39" x2="31" y2="39" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 'meeting-chair':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <path d="M16 11 L16 24 L33 24" fill="none" stroke={stroke} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="18" y1="25" x2="15" y2="38" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="31" y1="25" x2="34" y2="38" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'lounge-sofa':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="8" y="16" width="32" height="17" rx="4" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <rect x="13" y="23" width="22" height="10" rx="2" fill="#FFFFFF" stroke={stroke} strokeWidth="1.5" />
          <rect x="16" y="19" width="7" height="6" rx="1.5" fill={accent} />
          <line x1="12" y1="33" x2="12" y2="38" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="36" y1="33" x2="36" y2="38" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case 'planter-box':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="16" y="28" width="16" height="12" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <circle cx="24" cy="18" r="8" fill="#4B825B" opacity="0.88" />
          <circle cx="18" cy="21" r="5" fill="#3B6E4C" />
          <circle cx="30" cy="21" r="5" fill="#568F64" />
        </svg>
      );
    case 'truss-rig':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="7" y="10" width="34" height="5" fill={fillSoft} stroke={stroke} strokeWidth="1.8" />
          <line x1="10" y1="15" x2="10" y2="39" stroke={stroke} strokeWidth="2.5" />
          <line x1="38" y1="15" x2="38" y2="39" stroke={stroke} strokeWidth="2.5" />
          <circle cx="17" cy="18" r="2.2" fill={accent} />
          <circle cx="24" cy="18" r="2.2" fill={accent} />
          <circle cx="31" cy="18" r="2.2" fill={accent} />
        </svg>
      );
    case 'modular-wall':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="8" y="11" width="32" height="27" rx="1.5" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <line x1="18.5" y1="11" x2="18.5" y2="38" stroke={stroke} strokeOpacity="0.45" strokeWidth="1.5" />
          <line x1="29.5" y1="11" x2="29.5" y2="38" stroke={stroke} strokeOpacity="0.45" strokeWidth="1.5" />
          <rect x="12" y="16" width="24" height="5" rx="1" fill={accent} />
        </svg>
      );
    case 'brand-totem':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="17" y="9" width="14" height="28" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <rect x="20" y="14" width="8" height="16" rx="1" fill="#FFFFFF" stroke={accent} strokeWidth="1.6" />
          <rect x="13" y="37" width="22" height="3" rx="1" fill={stroke} />
        </svg>
      );
    case 'feather-flag':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <path d="M18 38 V14 C18 9 29 9 31 16 L29 31 C25 32 21 31 18 29 Z" fill={fillSoft} stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
          <path d="M21 17 H27" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
          <line x1="12" y1="38" x2="26" y2="38" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 'brochure-stand':
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <line x1="18" y1="10" x2="17" y2="38" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <line x1="30" y1="10" x2="31" y2="38" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <rect x="19" y="13" width="10" height="5.5" rx="1" fill={fillSoft} stroke={accent} strokeWidth="1.4" />
          <rect x="19" y="21" width="10" height="5.5" rx="1" fill={fillSoft} stroke={stroke} strokeWidth="1.4" />
          <rect x="19" y="29" width="10" height="5.5" rx="1" fill={fillSoft} stroke={stroke} strokeWidth="1.4" />
          <line x1="13" y1="38" x2="35" y2="38" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 48 48" className="equip-svg" aria-hidden="true">
          <rect x="12" y="10" width="24" height="28" rx="2" fill={fillSoft} stroke={stroke} strokeWidth="2" />
          <rect x="16" y="16" width="16" height="5" rx="1" fill={accent} />
          <line x1="16" y1="26" x2="32" y2="26" stroke={stroke} strokeOpacity="0.4" strokeWidth="2" />
          <line x1="16" y1="31" x2="28" y2="31" stroke={stroke} strokeOpacity="0.4" strokeWidth="2" />
        </svg>
      );
  }
};
