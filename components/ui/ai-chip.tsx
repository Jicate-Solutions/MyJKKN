'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface AIChipProps {
  className?: string;
  embedded?: boolean;
}

const AIChip: React.FC<AIChipProps> = ({ className, embedded = false }) => {
  return (
    <div
      className={cn(
        'w-full h-full flex items-center justify-center relative microchip-container',
        className
      )}
    >
      <style jsx>{`
        .microchip-container {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .microchip {
          display: block;
          width: 100%;
          height: auto;
          max-width: ${embedded ? '180px' : '200px'};
        }

        .microchip__center,
        .microchip__dot,
        .microchip__line,
        .microchip__lines,
        .microchip__spark,
        .microchip__wave,
        .microchip__text {
          animation-duration: 10s;
          animation-timing-function: cubic-bezier(0.65, 0, 0.35, 1);
          animation-iteration-count: infinite;
        }

        .microchip__center,
        .microchip__wave {
          transform-origin: 25px 25px;
        }

        .microchip__center {
          animation-name: center-scale;
        }

        .microchip__lines {
          animation-name: lines-scale;
          transform-origin: 54px 54px;
        }

        .microchip__spark,
        .microchip__wave {
          animation-timing-function: linear;
        }

        .microchip__text {
          animation-name: text-glow;
          font-family: 'Arial', sans-serif;
          font-weight: bold;
          font-size: ${embedded ? '10px' : '12px'};
          fill: #ffffff;
          text-anchor: middle;
          dominant-baseline: central;
        }

        /* Dot animations */
        .microchip__dot--1 { animation-name: dot-scale1; transform-origin: 3px 38px; }
        .microchip__dot--2 { animation-name: dot-scale2; transform-origin: 3px 54px; }
        .microchip__dot--3 { animation-name: dot-scale3; transform-origin: 3px 70px; }
        .microchip__dot--4 { animation-name: dot-scale4; transform-origin: 3px 3px; }
        .microchip__dot--5 { animation-name: dot-scale5; transform-origin: 20px 3px; }
        .microchip__dot--6 { animation-name: dot-scale6; transform-origin: 3px 30px; }
        .microchip__dot--7 { animation-name: dot-scale7; transform-origin: 37px 3px; }
        .microchip__dot--8 { animation-name: dot-scale8; transform-origin: 54px 3px; }
        .microchip__dot--9 { animation-name: dot-scale9; transform-origin: 71px 3px; }

        /* Line animations */
        .microchip__line--1 { animation-name: line-draw1; }
        .microchip__line--2 { animation-name: line-draw2; }
        .microchip__line--3 { animation-name: line-draw3; }
        .microchip__line--4 { animation-name: line-draw4; }
        .microchip__line--5 { animation-name: line-draw5; }
        .microchip__line--6 { animation-name: line-draw6; }
        .microchip__line--7 { animation-name: line-draw7; }
        .microchip__line--8 { animation-name: line-draw8; }
        .microchip__line--9 { animation-name: line-draw9; }

        /* Spark animations */
        .microchip__spark--1 { animation-name: spark1; }
        .microchip__spark--2 { animation-name: spark2; }
        .microchip__spark--3 { animation-name: spark3; }
        .microchip__spark--4 { animation-name: spark4; }
        .microchip__spark--5 { animation-name: spark5; }
        .microchip__spark--6 { animation-name: spark6; }
        .microchip__spark--7 { animation-name: spark7; }
        .microchip__spark--8 { animation-name: spark8; }
        .microchip__spark--9 { animation-name: spark9; }

        /* Wave animations */
        .microchip__wave--1 { animation-name: wave-scale1; }
        .microchip__wave--2 { animation-name: wave-scale2; }

        /* Keyframe animations */
        @keyframes center-scale {
          from, to { transform: scale(0); }
          12.5%, 75% { transform: scale(1); }
        }

        @keyframes text-glow {
          0%, 100% {
            opacity: 0.8;
            filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.8));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 8px rgba(34, 197, 94, 1)) drop-shadow(0 0 12px rgba(16, 185, 129, 0.8));
          }
        }

        @keyframes lines-scale {
          from { opacity: 1; transform: scale(0); }
          12.5%, 75% { opacity: 1; transform: scale(1); }
          93.75%, to { opacity: 0; transform: scale(0.5); }
        }

        /* Dot scale animations */
        @keyframes dot-scale1 { from, 20%, 81.25%, to { transform: scale(0); } 32.5%, 68.75% { transform: scale(1); } }
        @keyframes dot-scale2 { from, 10.5%, 87.5%, to { transform: scale(0); } 23%, 75% { transform: scale(1); } }
        @keyframes dot-scale3 { from, 20%, 81.25%, to { transform: scale(0); } 32.5%, 68.75% { transform: scale(1); } }
        @keyframes dot-scale4 { from, 20%, 81.25%, to { transform: scale(0); } 32.5%, 68.75% { transform: scale(1); } }
        @keyframes dot-scale5 { from, 11.5%, 87.5%, to { transform: scale(0); } 24%, 75% { transform: scale(1); } }
        @keyframes dot-scale6 { from, 14.5%, 85%, to { transform: scale(0); } 27%, 72.5% { transform: scale(1); } }
        @keyframes dot-scale7 { from, 20%, 81.25%, to { transform: scale(0); } 32.5%, 68.75% { transform: scale(1); } }
        @keyframes dot-scale8 { from, 11%, 87.5%, to { transform: scale(0); } 23.5%, 75% { transform: scale(1); } }
        @keyframes dot-scale9 { from, 20%, 81.25%, to { transform: scale(0); } 32.5%, 68.75% { transform: scale(1); } }

        /* Line draw animations */
        @keyframes line-draw1 { from, 93.75%, to { stroke-dashoffset: 59; } 25%, 68.75% { stroke-dashoffset: 17; } }
        @keyframes line-draw2 { from, 93.75%, to { stroke-dashoffset: 42; } 25%, 68.75% { stroke-dashoffset: 0; } }
        @keyframes line-draw3 { from, 93.75%, to { stroke-dashoffset: 59; } 25%, 68.75% { stroke-dashoffset: 17; } }
        @keyframes line-draw4 { from, 93.75%, to { stroke-dashoffset: 78; } 25%, 68.75% { stroke-dashoffset: 18; } }
        @keyframes line-draw5 { from, 93.75%, to { stroke-dashoffset: 60; } 25%, 68.75% { stroke-dashoffset: 0; } }
        @keyframes line-draw6 { from, 93.75%, to { stroke-dashoffset: 91; } 25%, 68.75% { stroke-dashoffset: 31; } }
        @keyframes line-draw7 { from, 93.75%, to { stroke-dashoffset: 60; } 25%, 68.75% { stroke-dashoffset: 17; } }
        @keyframes line-draw8 { from, 93.75%, to { stroke-dashoffset: 43; } 25%, 68.75% { stroke-dashoffset: 0; } }
        @keyframes line-draw9 { from, 93.75%, to { stroke-dashoffset: 60; } 25%, 68.75% { stroke-dashoffset: 17; } }

        /* Spark animations */
        @keyframes spark1 { from, 27.5% { stroke-dashoffset: 59; } 50%, 52.5% { stroke-dashoffset: -25; } 75%, to { stroke-dashoffset: -109; } }
        @keyframes spark2 { from, 27.5% { stroke-dashoffset: 42; } 50%, 52.5% { stroke-dashoffset: -42; } 75%, to { stroke-dashoffset: -126; } }
        @keyframes spark3 { from, 27.5% { stroke-dashoffset: 59; } 50%, 52.5% { stroke-dashoffset: -25; } 75%, to { stroke-dashoffset: -109; } }
        @keyframes spark4 { from, 27.5% { stroke-dashoffset: 78; } 50%, 52.5% { stroke-dashoffset: -42; } 75%, to { stroke-dashoffset: -162; } }
        @keyframes spark5 { from, 27.5% { stroke-dashoffset: 60; } 50%, 52.5% { stroke-dashoffset: -60; } 75%, to { stroke-dashoffset: -180; } }
        @keyframes spark6 { from, 27.5% { stroke-dashoffset: 91; } 50%, 52.5% { stroke-dashoffset: -29; } 75%, to { stroke-dashoffset: -149; } }
        @keyframes spark7 { from, 27.5% { stroke-dashoffset: 60; } 50%, 52.5% { stroke-dashoffset: -26; } 75%, to { stroke-dashoffset: -112; } }
        @keyframes spark8 { from, 27.5% { stroke-dashoffset: 43; } 50%, 52.5% { stroke-dashoffset: -43; } 75%, to { stroke-dashoffset: -129; } }
        @keyframes spark9 { from, 27.5% { stroke-dashoffset: 60; } 50%, 52.5% { stroke-dashoffset: -26; } 75%, to { stroke-dashoffset: -112; } }

        /* Wave animations */
        @keyframes wave-scale1 {
          from, 0%, 25%, 50%, 75% { stroke-width: 6px; transform: scale(1); }
          10%, 35%, 60%, 85%, to { animation-timing-function: steps(1); stroke-width: 0; transform: scale(2); }
        }
        @keyframes wave-scale2 {
          from, 5%, 30%, 55%, 80% { stroke-width: 6px; transform: scale(1); }
          15%, 40%, 65%, 90%, to { animation-timing-function: steps(1); stroke-width: 0; transform: scale(2); }
        }
      `}</style>

      <svg
        className='microchip'
        viewBox='0 0 128 128'
        role='img'
        aria-label='JKKN AI Processing Chip'
      >
        <defs>
          {/* Dot symbols */}
          <symbol id='dot-1'>
            <circle r='3' cx='3' cy='38' />
          </symbol>
          <symbol id='dot-2'>
            <circle r='3' cx='3' cy='54' />
          </symbol>
          <symbol id='dot-3'>
            <circle r='3' cx='3' cy='70' />
          </symbol>
          <symbol id='dot-4'>
            <circle r='3' cx='3' cy='3' />
          </symbol>
          <symbol id='dot-5'>
            <circle r='3' cx='20' cy='3' />
          </symbol>
          <symbol id='dot-6'>
            <circle r='3' cx='3' cy='30' />
          </symbol>
          <symbol id='dot-7'>
            <circle r='3' cx='37' cy='3' />
          </symbol>
          <symbol id='dot-8'>
            <circle r='3' cx='54' cy='3' />
          </symbol>
          <symbol id='dot-9'>
            <circle r='3' cx='71' cy='3' />
          </symbol>

          {/* Line symbols */}
          <symbol id='line-1'>
            <polyline points='12 54,12 46,3 46,3 38' strokeDasharray='42 42' />
          </symbol>
          <symbol id='line-2'>
            <polyline points='29 54,3 54' strokeDasharray='42 42' />
          </symbol>
          <symbol id='line-3'>
            <polyline points='12 54,12 62,3 62,3 70' strokeDasharray='42 42' />
          </symbol>
          <symbol id='line-4'>
            <polyline points='28 20,28 12,20 12,20 3' strokeDasharray='60 60' />
          </symbol>
          <symbol id='line-5'>
            <polyline points='37 29,37 20,3 20,3 3' strokeDasharray='60 60' />
          </symbol>
          <symbol id='line-6'>
            <polyline points='15 20,15 30,3 30' strokeDasharray='60 60' />
          </symbol>
          <symbol id='line-7'>
            <polyline points='54 12,37 12,37 3' strokeDasharray='43 43' />
          </symbol>
          <symbol id='line-8'>
            <polyline points='54 29,54 3' strokeDasharray='43 43' />
          </symbol>
          <symbol id='line-9'>
            <polyline points='54 12,71 12,71 3' strokeDasharray='43 43' />
          </symbol>

          {/* Spark symbols */}
          <symbol id='spark-1'>
            <polyline points='12 54,12 46,3 46,3 38' strokeDasharray='15 69' />
          </symbol>
          <symbol id='spark-2'>
            <polyline points='29 54,3 54' strokeDasharray='15 69' />
          </symbol>
          <symbol id='spark-3'>
            <polyline points='12 54,12 62,3 62,3 70' strokeDasharray='15 69' />
          </symbol>
          <symbol id='spark-4'>
            <polyline
              points='28 20,28 12,20 12,20 3'
              strokeDasharray='15 105'
            />
          </symbol>
          <symbol id='spark-5'>
            <polyline points='37 29,37 20,3 20,3 3' strokeDasharray='15 105' />
          </symbol>
          <symbol id='spark-6'>
            <polyline points='15 20,15 30,3 30' strokeDasharray='15 105' />
          </symbol>
          <symbol id='spark-7'>
            <polyline points='54 12,37 12,37 3' strokeDasharray='15 71' />
          </symbol>
          <symbol id='spark-8'>
            <polyline points='54 29,54 3' strokeDasharray='15 71' />
          </symbol>
          <symbol id='spark-9'>
            <polyline points='54 12,71 12,71 3' strokeDasharray='15 71' />
          </symbol>

          {/* Wave symbol */}
          <symbol id='wave'>
            <rect x='3' y='3' rx='2.5' ry='2.5' width='44' height='44' />
          </symbol>

          {/* Green gradient definitions */}
          <linearGradient id='chipGradient' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor='#22c55e' />
            <stop offset='33%' stopColor='#16a34a' />
            <stop offset='66%' stopColor='#15803d' />
            <stop offset='100%' stopColor='#22c55e' />
          </linearGradient>

          <linearGradient
            id='sparkGradient'
            x1='0%'
            y1='0%'
            x2='100%'
            y2='100%'
          >
            <stop offset='0%' stopColor='#34d399' />
            <stop offset='33%' stopColor='#10b981' />
            <stop offset='66%' stopColor='#059669' />
            <stop offset='100%' stopColor='#34d399' />
          </linearGradient>

          {/* Text gradient for JKKN */}
          <linearGradient id='textGradient' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stopColor='#ffffff' />
            <stop offset='50%' stopColor='#dcfce7' />
            <stop offset='100%' stopColor='#bbf7d0' />
          </linearGradient>
        </defs>

        <g transform='translate(10,10)'>
          <g
            className='microchip__lines'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            {/* Left side lines and dots */}
            <g>
              <g fill='none' stroke='url(#chipGradient)'>
                <use
                  className='microchip__line microchip__line--1'
                  href='#line-1'
                />
                <use
                  className='microchip__spark microchip__spark--1'
                  href='#spark-1'
                />
                <use
                  className='microchip__line microchip__line--2'
                  href='#line-2'
                />
                <use
                  className='microchip__spark microchip__spark--2'
                  href='#spark-2'
                />
                <use
                  className='microchip__line microchip__line--3'
                  href='#line-3'
                />
                <use
                  className='microchip__spark microchip__spark--3'
                  href='#spark-3'
                />
              </g>
              <g fill='url(#chipGradient)'>
                <use
                  className='microchip__dot microchip__dot--1'
                  href='#dot-1'
                />
                <use
                  className='microchip__dot microchip__dot--2'
                  href='#dot-2'
                />
                <use
                  className='microchip__dot microchip__dot--3'
                  href='#dot-3'
                />
              </g>
            </g>

            {/* Top side lines and dots */}
            <g>
              <g fill='none' stroke='url(#chipGradient)'>
                <use
                  className='microchip__line microchip__line--4'
                  href='#line-4'
                />
                <use
                  className='microchip__spark microchip__spark--4'
                  href='#spark-4'
                />
                <use
                  className='microchip__line microchip__line--5'
                  href='#line-5'
                />
                <use
                  className='microchip__spark microchip__spark--5'
                  href='#spark-5'
                />
                <use
                  className='microchip__line microchip__line--6'
                  href='#line-6'
                />
                <use
                  className='microchip__spark microchip__spark--6'
                  href='#spark-6'
                />
              </g>
              <g fill='url(#chipGradient)'>
                <use
                  className='microchip__dot microchip__dot--4'
                  href='#dot-4'
                />
                <use
                  className='microchip__dot microchip__dot--5'
                  href='#dot-5'
                />
                <use
                  className='microchip__dot microchip__dot--6'
                  href='#dot-6'
                />
              </g>
            </g>

            {/* Top center lines and dots */}
            <g>
              <g fill='none' stroke='url(#chipGradient)'>
                <use
                  className='microchip__line microchip__line--7'
                  href='#line-7'
                />
                <use
                  className='microchip__spark microchip__spark--7'
                  href='#spark-7'
                />
                <use
                  className='microchip__line microchip__line--8'
                  href='#line-8'
                />
                <use
                  className='microchip__spark microchip__spark--8'
                  href='#spark-8'
                />
                <use
                  className='microchip__line microchip__line--9'
                  href='#line-9'
                />
                <use
                  className='microchip__spark microchip__spark--9'
                  href='#spark-9'
                />
              </g>
              <g fill='url(#chipGradient)'>
                <use
                  className='microchip__dot microchip__dot--7'
                  href='#dot-7'
                />
                <use
                  className='microchip__dot microchip__dot--8'
                  href='#dot-8'
                />
                <use
                  className='microchip__dot microchip__dot--9'
                  href='#dot-9'
                />
              </g>
            </g>

            {/* Right side (mirrored) */}
            <g transform='translate(108,0) scale(-1,1)'>
              <g fill='none' stroke='url(#chipGradient)'>
                <use
                  className='microchip__line microchip__line--4'
                  href='#line-4'
                />
                <use
                  className='microchip__spark microchip__spark--4'
                  href='#spark-4'
                />
                <use
                  className='microchip__line microchip__line--5'
                  href='#line-5'
                />
                <use
                  className='microchip__spark microchip__spark--5'
                  href='#spark-5'
                />
                <use
                  className='microchip__line microchip__line--6'
                  href='#line-6'
                />
                <use
                  className='microchip__spark microchip__spark--6'
                  href='#spark-6'
                />
              </g>
              <g fill='url(#chipGradient)'>
                <use
                  className='microchip__dot microchip__dot--4'
                  href='#dot-4'
                />
                <use
                  className='microchip__dot microchip__dot--5'
                  href='#dot-5'
                />
                <use
                  className='microchip__dot microchip__dot--6'
                  href='#dot-6'
                />
              </g>
            </g>

            <g transform='translate(108,0) scale(-1,1)'>
              <g fill='none' stroke='url(#chipGradient)'>
                <use
                  className='microchip__line microchip__line--1'
                  href='#line-1'
                />
                <use
                  className='microchip__spark microchip__spark--1'
                  href='#spark-1'
                />
                <use
                  className='microchip__line microchip__line--2'
                  href='#line-2'
                />
                <use
                  className='microchip__spark microchip__spark--2'
                  href='#spark-2'
                />
                <use
                  className='microchip__line microchip__line--3'
                  href='#line-3'
                />
                <use
                  className='microchip__spark microchip__spark--3'
                  href='#spark-3'
                />
              </g>
              <g fill='url(#chipGradient)'>
                <use
                  className='microchip__dot microchip__dot--1'
                  href='#dot-1'
                />
                <use
                  className='microchip__dot microchip__dot--2'
                  href='#dot-2'
                />
                <use
                  className='microchip__dot microchip__dot--3'
                  href='#dot-3'
                />
              </g>
            </g>

            {/* Bottom side (mirrored) */}
            <g transform='translate(108,108) scale(-1,-1)'>
              <g fill='none' stroke='url(#chipGradient)'>
                <use
                  className='microchip__line microchip__line--4'
                  href='#line-4'
                />
                <use
                  className='microchip__spark microchip__spark--4'
                  href='#spark-4'
                />
                <use
                  className='microchip__line microchip__line--5'
                  href='#line-5'
                />
                <use
                  className='microchip__spark microchip__spark--5'
                  href='#spark-5'
                />
                <use
                  className='microchip__line microchip__line--6'
                  href='#line-6'
                />
                <use
                  className='microchip__spark microchip__spark--6'
                  href='#spark-6'
                />
              </g>
              <g fill='url(#chipGradient)'>
                <use
                  className='microchip__dot microchip__dot--4'
                  href='#dot-4'
                />
                <use
                  className='microchip__dot microchip__dot--5'
                  href='#dot-5'
                />
                <use
                  className='microchip__dot microchip__dot--6'
                  href='#dot-6'
                />
              </g>
            </g>

            <g transform='translate(0,108) scale(1,-1)'>
              <g fill='none' stroke='url(#chipGradient)'>
                <use
                  className='microchip__line microchip__line--7'
                  href='#line-7'
                />
                <use
                  className='microchip__spark microchip__spark--7'
                  href='#spark-7'
                />
                <use
                  className='microchip__line microchip__line--8'
                  href='#line-8'
                />
                <use
                  className='microchip__spark microchip__spark--8'
                  href='#spark-8'
                />
                <use
                  className='microchip__line microchip__line--9'
                  href='#line-9'
                />
                <use
                  className='microchip__spark microchip__spark--9'
                  href='#spark-9'
                />
              </g>
              <g fill='url(#chipGradient)'>
                <use
                  className='microchip__dot microchip__dot--7'
                  href='#dot-7'
                />
                <use
                  className='microchip__dot microchip__dot--8'
                  href='#dot-8'
                />
                <use
                  className='microchip__dot microchip__dot--9'
                  href='#dot-9'
                />
              </g>
            </g>

            <g transform='translate(0,108) scale(1,-1)'>
              <g fill='none' stroke='url(#chipGradient)'>
                <use
                  className='microchip__line microchip__line--4'
                  href='#line-4'
                />
                <use
                  className='microchip__spark microchip__spark--4'
                  href='#spark-4'
                />
                <use
                  className='microchip__line microchip__line--5'
                  href='#line-5'
                />
                <use
                  className='microchip__spark microchip__spark--5'
                  href='#spark-5'
                />
                <use
                  className='microchip__line microchip__line--6'
                  href='#line-6'
                />
                <use
                  className='microchip__spark microchip__spark--6'
                  href='#spark-6'
                />
              </g>
              <g fill='url(#chipGradient)'>
                <use
                  className='microchip__dot microchip__dot--4'
                  href='#dot-4'
                />
                <use
                  className='microchip__dot microchip__dot--5'
                  href='#dot-5'
                />
                <use
                  className='microchip__dot microchip__dot--6'
                  href='#dot-6'
                />
              </g>
            </g>
          </g>

          {/* Center chip with JKKN text */}
          <g transform='translate(29,29)'>
            <g className='microchip__center'>
              <g fill='none' stroke='url(#sparkGradient)' strokeWidth='6'>
                <use
                  className='microchip__wave microchip__wave--1'
                  href='#wave'
                />
                <use
                  className='microchip__wave microchip__wave--2'
                  href='#wave'
                />
              </g>
              <rect
                className='microchip__core'
                fill='url(#chipGradient)'
                rx='5'
                ry='5'
                width='50'
                height='50'
              />

              {/* JKKN Text */}
              <text
                x='25'
                y='25'
                className='microchip__text'
                fill='url(#textGradient)'
              >
                JKKN
              </text>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
};

export default AIChip;
