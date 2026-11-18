import React from 'react';

export type GarmentType = 'saree' | 'mundu';

export interface RegionDefinition {
  id: string;
  number: number;
  label: string;
  malayalamHint: string;
  badgeX: number;
  badgeY: number;
  path: string;
}

export const GARMENT_REGIONS: Record<GarmentType, RegionDefinition[]> = {
  saree: [
    {
      id: 'body',
      number: 1,
      label: 'Body',
      malayalamHint: 'Main drape & pleats',
      badgeX: 214,
      badgeY: 344,
      path: 'M 154 194 L 266 194 C 284 228 292 268 294 318 L 302 464 L 118 464 L 126 318 C 128 268 136 228 154 194 Z',
    },
    {
      id: 'kara',
      number: 2,
      label: 'Kara (Border)',
      malayalamHint: 'Lower kasavu border',
      badgeX: 210,
      badgeY: 490,
      path: 'M 118 464 L 302 464 L 306 514 Q 210 520 114 514 Z',
    },
    {
      id: 'pallu',
      number: 3,
      label: 'Pallu',
      malayalamHint: 'Shoulder cascade',
      badgeX: 98,
      badgeY: 292,
      path: 'M 266 198 C 232 162 192 120 154 82 L 120 92 C 102 180 82 315 66 444 L 122 434 C 126 330 132 242 138 176 C 176 202 222 222 262 232 Z',
    },
    {
      id: 'blouse',
      number: 4,
      label: 'Blouse',
      malayalamHint: 'Bodice & sleeves',
      badgeX: 232,
      badgeY: 130,
      path: 'M 142 84 Q 176 118 210 118 Q 244 118 278 84 L 292 92 L 312 142 L 282 156 L 266 128 L 260 194 L 160 194 L 154 128 L 138 156 L 108 142 L 128 92 Z',
    },
  ],
  mundu: [
    {
      id: 'body',
      number: 1,
      label: 'Body',
      malayalamHint: 'Main handloom wrap',
      badgeX: 208,
      badgeY: 266,
      path: 'M 134 94 Q 210 104 286 94 C 294 140 302 260 306 424 L 114 424 C 118 260 126 140 134 94 Z',
    },
    {
      id: 'kara',
      number: 2,
      label: 'Kara (Border)',
      malayalamHint: 'Traditional hem border',
      badgeX: 208,
      badgeY: 456,
      path: 'M 114 424 L 306 424 L 309 486 Q 210 492 111 486 Z',
    },
  ],
};

const UNCOLOURED_FILL = '#FBF9F4';
const INK_COLOR = '#1C1917';

function isDarkColour(hex?: string): boolean {
  if (!hex) return false;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.42;
}

interface GarmentSvgProps {
  garment: GarmentType;
  regionColours: Record<string, string>;
  activeRegionId: string | null;
  onSelectRegion?: (index: number) => void;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  className?: string;
}

export const GarmentSvg: React.FC<GarmentSvgProps> = ({
  garment,
  regionColours,
  activeRegionId,
  onSelectRegion,
  svgRef,
  className = '',
}) => {
  const regions = GARMENT_REGIONS[garment];

  // Render order ensures Pallu sits cleanly over Blouse/Body edges on the Saree
  const renderOrder =
    garment === 'saree'
      ? ['blouse', 'body', 'kara', 'pallu']
      : ['body', 'kara'];

  const orderedRegions = renderOrder
    .map((id) => regions.find((r) => r.id === id)!)
    .filter(Boolean);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 420 560"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={
        garment === 'saree'
          ? 'Kerala Kasavu Saree colouring outline'
          : 'Kerala Kasavu Mundu colouring outline'
      }
      className={className}
    >
      {/* Clean warm ivory backdrop for PNG export */}
      <rect width="420" height="560" fill="#FAF8F3" rx="16" />

      {/* Subtle framing hairline */}
      <rect
        x="14"
        y="14"
        width="392"
        height="532"
        fill="none"
        stroke="#E7E2D8"
        strokeWidth="1.2"
        rx="12"
      />

      {/* Interactive closed shapes */}
      {orderedRegions.map((region) => {
        const fill = regionColours[region.id] || UNCOLOURED_FILL;
        const isActive = region.id === activeRegionId;
        const regionIndex = regions.findIndex((r) => r.id === region.id);
        const darkFill = isDarkColour(regionColours[region.id]);

        return (
          <g key={region.id}>
            <path
              d={region.path}
              fill={fill}
              stroke={darkFill ? '#0C0A09' : INK_COLOR}
              strokeWidth={2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              onClick={() => onSelectRegion?.(regionIndex)}
              style={{
                cursor: onSelectRegion ? 'pointer' : 'default',
                transition: 'fill 260ms ease',
              }}
            />

            {/* Interior woven/drape ink details per region (pointer-events-none) */}
            {garment === 'saree' && region.id === 'blouse' && (
              <g
                pointerEvents="none"
                fill="none"
                stroke={darkFill ? 'rgba(255,255,255,0.45)' : 'rgba(28,25,23,0.45)'}
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M 148 89 Q 179 124 210 124 Q 241 124 272 89" />
                <path d="M 112 135 L 140 148" />
                <path d="M 308 135 L 280 148" />
                <path d="M 234 192 L 231 154" />
              </g>
            )}

            {garment === 'saree' && region.id === 'body' && (
              <g
                pointerEvents="none"
                fill="none"
                stroke={darkFill ? 'rgba(255,255,255,0.4)' : 'rgba(28,25,23,0.38)'}
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M 192 214 L 181 462" />
                <path d="M 205 216 L 198 462" />
                <path d="M 218 218 L 215 462" />
                <path d="M 231 222 L 232 462" />
                <path d="M 244 226 L 249 462" />
                <path d="M 278 242 Q 252 262 232 276" />
              </g>
            )}

            {garment === 'saree' && region.id === 'kara' && (
              <g
                pointerEvents="none"
                fill="none"
                stroke={darkFill ? 'rgba(255,255,255,0.5)' : 'rgba(28,25,23,0.52)'}
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M 118 473 L 302 473" />
                <path d="M 115 505 Q 210 511 305 505" />
              </g>
            )}

            {garment === 'saree' && region.id === 'pallu' && (
              <g
                pointerEvents="none"
                fill="none"
                stroke={darkFill ? 'rgba(255,255,255,0.45)' : 'rgba(28,25,23,0.42)'}
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M 258 210 C 222 178 184 138 144 96" />
                <path d="M 250 220 C 212 192 178 158 138 118" />
                <path d="M 127 116 C 110 214 96 322 84 438" />
                <path d="M 139 112 C 125 208 113 318 104 434" />
                <path d="M 70 412 L 122 403" strokeWidth="1.6" />
                <path d="M 68 424 L 122 415" strokeWidth="1.6" />
                {/* Pallu tassels */}
                <path d="M 72 443 L 70 457" stroke={INK_COLOR} strokeWidth="1.5" />
                <path d="M 82 441 L 80 455" stroke={INK_COLOR} strokeWidth="1.5" />
                <path d="M 92 439 L 91 453" stroke={INK_COLOR} strokeWidth="1.5" />
                <path d="M 103 437 L 102 451" stroke={INK_COLOR} strokeWidth="1.5" />
                <path d="M 114 435 L 113 449" stroke={INK_COLOR} strokeWidth="1.5" />
              </g>
            )}

            {garment === 'mundu' && region.id === 'body' && (
              <g
                pointerEvents="none"
                fill="none"
                stroke={darkFill ? 'rgba(255,255,255,0.42)' : 'rgba(28,25,23,0.4)'}
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M 132 118 Q 210 128 288 118" />
                <path d="M 220 118 C 223 215 225 320 227 424" strokeWidth="1.7" />
                <path d="M 164 128 C 160 224 156 322 153 416" />
                <path d="M 188 130 C 186 226 184 326 184 416" />
                <path d="M 254 128 C 258 224 262 322 266 416" />
              </g>
            )}

            {garment === 'mundu' && region.id === 'kara' && (
              <g
                pointerEvents="none"
                fill="none"
                stroke={darkFill ? 'rgba(255,255,255,0.5)' : 'rgba(28,25,23,0.52)'}
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M 114 433 L 306 433" />
                <path d="M 112 476 Q 210 482 308 476" />
                <path d="M 227 424 L 228 487" strokeWidth="1.7" />
              </g>
            )}

            {/* Pulsing active outline (excluded from PNG export) */}
            {isActive && (
              <path
                data-export-exclude="true"
                d={region.path}
                fill="none"
                stroke="#D97706"
                strokeLinejoin="round"
                strokeLinecap="round"
                pointerEvents="none"
                className="region-pulse-outline"
              />
            )}
          </g>
        );
      })}

      {/* Visible region numbers (excluded from PNG export) */}
      <g data-export-exclude="true" pointerEvents="none">
        {regions.map((region) => {
          const isActive = region.id === activeRegionId;
          const isColoured = Boolean(regionColours[region.id]);
          return (
            <g
              key={`badge-${region.id}`}
              className={isActive ? 'region-badge-pulse' : undefined}
            >
              <circle
                cx={region.badgeX}
                cy={region.badgeY}
                r={isActive ? 17 : 13}
                fill={isActive ? '#D97706' : isColoured ? '#1C1917' : '#FFFFFF'}
                stroke={isActive ? '#FEF3C7' : '#1C1917'}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <text
                x={region.badgeX}
                y={region.badgeY + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="Plus Jakarta Sans, sans-serif"
                fontWeight="700"
                fontSize={isActive ? 14 : 12}
                fill={isActive || isColoured ? '#FFFFFF' : '#1C1917'}
              >
                {region.number}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};
