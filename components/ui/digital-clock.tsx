'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface DigitalClockProps {
  className?: string;
  timezone?: string;
  showSettings?: boolean;
  embedded?: boolean;
}

export function DigitalClock({
  className,
  timezone = 'Europe/Berlin',
  showSettings = false,
  embedded = false
}: DigitalClockProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState({
    minuteMarkerOpacity: 1,
    innerShadowOpacity: 0.15,
    reflectionOpacity: 0.5,
    glossyOpacity: 0.3,
    showNumbers: true,
    secondsMode: 'smooth' as 'smooth' | 'tick1' | 'tick2' | 'highFreq'
  });
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  const hourHandRef = useRef<HTMLDivElement>(null);
  const minuteHandRef = useRef<HTMLDivElement>(null);
  const secondHandRef = useRef<HTMLDivElement>(null);
  const secondHandShadowRef = useRef<HTMLDivElement>(null);

  // Update time every second for smooth animation
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 16); // 60fps for smooth second hand

    return () => clearInterval(timer);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'h' || event.key === 'H') {
        setShowSettingsPanel((prev) => !prev);
      }
    };

    if (showSettings && !embedded) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [showSettings, embedded]);

  // Update clock hands
  useEffect(() => {
    const now = new Date();
    const timeInTimezone = new Date(
      now.toLocaleString('en-US', { timeZone: timezone })
    );

    const hours = timeInTimezone.getHours() % 12;
    const minutes = timeInTimezone.getMinutes();
    const seconds = timeInTimezone.getSeconds();
    const milliseconds = timeInTimezone.getMilliseconds();

    // Calculate angles
    const hoursDegrees = hours * 30 + (minutes / 60) * 30;
    const minutesDegrees = minutes * 6;
    let secondsDegrees = seconds * 6;

    if (settings.secondsMode === 'smooth') {
      secondsDegrees += (milliseconds / 1000) * 6;
    }

    // Apply rotations
    if (hourHandRef.current) {
      hourHandRef.current.style.transform = `rotate(${hoursDegrees}deg)`;
    }
    if (minuteHandRef.current) {
      minuteHandRef.current.style.transform = `rotate(${minutesDegrees}deg)`;
    }
    if (secondHandRef.current) {
      secondHandRef.current.style.transform = `rotate(${secondsDegrees}deg)`;
    }
    if (secondHandShadowRef.current) {
      secondHandShadowRef.current.style.transform = `rotate(${
        secondsDegrees + 0.5
      }deg)`;
    }
  }, [currentTime, timezone, settings.secondsMode]);

  // Generate hour numbers and minute markers
  const generateMarkers = () => {
    const markers = [];

    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) {
        // Hour numbers
        const hourIndex = i / 5;
        const angle = (i * 6 * Math.PI) / 180;
        const radius = 145;
        const left = 175 + Math.sin(angle) * radius - 15;
        const top = 175 - Math.cos(angle) * radius - 10;

        markers.push(
          <div
            key={`hour-${i}`}
            className='absolute text-base font-medium text-gray-700 text-center w-7 h-5 leading-5 select-none pointer-events-none z-[15] transition-opacity duration-300'
            style={{
              left: `${left}px`,
              top: `${top}px`,
              opacity: settings.showNumbers ? settings.minuteMarkerOpacity : 0,
              textShadow: '0 1px 1px rgba(255, 255, 255, 0.5)'
            }}
          >
            {hourIndex === 0 ? '12' : hourIndex}
          </div>
        );
      } else {
        // Minute markers
        markers.push(
          <div
            key={`minute-${i}`}
            className='absolute w-0.5 h-2.5 bg-gray-500 top-2.5 left-[175px] origin-[center_165px] select-none pointer-events-none'
            style={{
              transform: `rotate(${i * 6}deg)`,
              opacity: settings.minuteMarkerOpacity,
              boxShadow: '0 0 2px rgba(255, 255, 255, 0.3)'
            }}
          />
        );
      }
    }

    return markers;
  };

  const formatDate = (date: Date) => {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    const timeInTimezone = new Date(
      date.toLocaleString('en-US', { timeZone: timezone })
    );
    const month = months[timeInTimezone.getMonth()];
    const day = timeInTimezone.getDate();
    return `${month} ${day}`;
  };

  return (
    <div
      className={cn(
        'relative font-sans',
        !embedded &&
          'flex flex-col items-center justify-center min-h-screen bg-white',
        embedded ? 'w-[350px] h-[350px]' : '',
        className
      )}
    >
      {!embedded && (
        <>
          {/* Background Grid Pattern */}
          <svg
            className='absolute inset-0 w-full h-full z-0'
            width='100%'
            height='100%'
          >
            <defs>
              <pattern
                id='dottedGrid'
                width='30'
                height='30'
                patternUnits='userSpaceOnUse'
              >
                <circle cx='2' cy='2' r='1' fill='rgba(0,0,0,0.15)' />
              </pattern>
            </defs>
            <rect width='100%' height='100%' fill='url(#dottedGrid)' />
          </svg>
        </>
      )}

      {/* Clock Container */}
      <div
        className={cn(
          'relative w-[350px] h-[350px] flex justify-center items-center z-10',
          !embedded && 'mt-5'
        )}
      >
        {/* Glass Effect Wrapper */}
        <div className='relative z-10 rounded-full bg-transparent pointer-events-none transition-all duration-500 ease-out perspective-1000 transform-style-preserve-3d backface-hidden will-change-transform group hover:scale-[0.98] active:scale-[0.97]'>
          {/* Outer Shadow */}
          <div
            className='absolute w-[calc(100%+3em)] h-[calc(100%+3em)] top-[-1.5em] left-[-1.5em] blur-[10px] pointer-events-none z-[1] transition-all duration-500 ease-out opacity-100'
            style={{ opacity: settings.innerShadowOpacity }}
          >
            <div className='absolute inset-0 rounded-full bg-gradient-to-b from-black/40 to-black/20 w-[calc(100%-3em-0.25em)] h-[calc(100%-3em-0.25em)] top-[2.5em] left-[2.125em] opacity-80 shadow-[0_10px_30px_rgba(0,0,0,0.05),0_15px_25px_rgba(0,0,0,0.05),0_20px_40px_rgba(0,0,0,0.05)]' />
          </div>

          {/* Clock Face */}
          <div className='relative w-[350px] h-[350px] rounded-full bg-white/[0.03] backdrop-blur-sm z-[3] overflow-hidden pointer-events-auto cursor-pointer transition-all duration-500 ease-out select-none transform-style-preserve-3d backface-hidden will-change-transform shadow-[inset_0_0.4em_0.4em_rgba(0,0,0,0.1),inset_0_-0.4em_0.4em_rgba(255,255,255,0.5),10px_5px_10px_rgba(0,0,0,0.1),10px_20px_20px_rgba(0,0,0,0.1),10px_55px_50px_rgba(0,0,0,0.1)]'>
            {/* Glossy Border Effect */}
            <div
              className='absolute z-[10] inset-0 rounded-full w-[calc(100%+2px)] h-[calc(100%+2px)] top-[-1px] left-[-1px] p-0.5 box-border bg-gradient-conic from-white via-white/20 to-white bg-gradient-to-b opacity-90 transition-all duration-500 ease-out will-change-transform shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9),0_0_12px_rgba(255,255,255,0.8)]'
              style={{
                mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                maskComposite: 'exclude',
                WebkitMask:
                  'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                WebkitMaskComposite: 'xor'
              }}
            />

            {/* Edge Highlight */}
            <div className='absolute w-[350px] h-[350px] rounded-full top-0 left-0 border border-white/80 shadow-[0_0_10px_rgba(255,255,255,0.5)] z-[8] pointer-events-none opacity-60' />

            {/* Edge Shadow */}
            <div
              className='absolute w-[350px] h-[350px] rounded-full top-0 left-0 shadow-[inset_-5px_5px_15px_rgba(0,0,0,0.3),inset_-8px_8px_20px_rgba(0,0,0,0.2)] z-[7] pointer-events-none'
              style={{ opacity: settings.innerShadowOpacity }}
            />

            {/* Glossy Overlay */}
            <div
              className='absolute w-[350px] h-[350px] rounded-full top-0 left-0 bg-gradient-to-br from-white/90 via-white/50 to-white/10 pointer-events-none z-[6] mix-blend-overlay blur-[10px]'
              style={{ opacity: settings.glossyOpacity }}
            />

            {/* Reflection Overlay */}
            <div
              className='absolute w-[330px] h-[330px] rounded-full top-2.5 left-2.5 bg-radial-gradient pointer-events-none z-[15] mix-blend-overlay opacity-70 transform -rotate-[15deg] blur-[10px]'
              style={{
                opacity: settings.reflectionOpacity,
                background:
                  'radial-gradient(ellipse at 30% 30%, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.3) 30%, rgba(255, 255, 255, 0.1) 60%, transparent 100%)'
              }}
            />

            {/* Reflection */}
            <div
              className='absolute w-[350px] h-[175px] top-0 left-0 bg-gradient-to-b from-white/70 via-white/40 to-transparent rounded-t-[175px] pointer-events-none z-[10] mix-blend-soft-light blur-[10px]'
              style={{ opacity: settings.reflectionOpacity }}
            />

            {/* Hour Marks Container */}
            <div className='absolute top-0 left-0 w-full h-full z-[14]'>
              {generateMarkers()}
            </div>

            {/* Clock Hands */}
            <div
              ref={hourHandRef}
              className='absolute w-1.5 h-[70px] bg-gray-700 -ml-[3px] rounded-[3px] shadow-[0_0_5px_rgba(0,0,0,0.3)] z-[15] will-change-transform'
              style={{
                transformOrigin: 'center bottom',
                bottom: '175px',
                left: '175px'
              }}
            />

            <div
              ref={minuteHandRef}
              className='absolute w-1 h-[100px] bg-gray-700 -ml-[2px] rounded-[2px] shadow-[0_0_5px_rgba(0,0,0,0.3)] z-[15] will-change-transform'
              style={{
                transformOrigin: 'center bottom',
                bottom: '175px',
                left: '175px'
              }}
            />

            {/* Second Hand Container */}
            <div
              ref={secondHandRef}
              className='absolute w-0.5 h-[120px] top-[55px] left-[174px] z-[17] will-change-transform'
              style={{ transformOrigin: '1px 120px' }}
            >
              {/* Second Hand */}
              <div className='absolute w-0.5 h-[120px] bg-orange-500 bottom-0 left-0 shadow-[0_0_5px_rgba(255,107,0,0.5)]' />
              {/* Counterweight */}
              <div className='absolute w-1.5 h-3.5 bg-orange-500 bottom-[-14px] left-[-2px] rounded-b-1 shadow-[0_0_5px_rgba(255,107,0,0.5)]' />
            </div>

            {/* Second Hand Shadow */}
            <div
              ref={secondHandShadowRef}
              className='absolute w-0.5 h-[120px] top-[55px] left-[174px] z-[14] blur-[2px] opacity-30 will-change-transform'
              style={{ transformOrigin: '1px 120px' }}
            >
              <div className='absolute w-0.5 h-[120px] bg-transparent bottom-0 left-0 shadow-[0_0_5px_1px_rgba(0,0,0,0.15)]' />
              <div className='absolute w-2 h-4 bg-transparent bottom-[-16px] left-[-3px] shadow-[0_0_5px_1px_rgba(0,0,0,0.15)]' />
            </div>

            {/* Center Dot */}
            <div className='absolute w-3 h-3 bg-orange-500 rounded-full top-[169px] left-[169px] z-[17] shadow-[0_0_8px_rgba(255,107,0,0.4)]' />

            {/* Center Blur */}
            <div className='absolute w-9 h-9 top-[157px] left-[157px] bg-white/35 rounded-full backdrop-blur-sm z-[16] pointer-events-none shadow-[0_0_20px_rgba(255,255,255,0.4),inset_0_0_8px_rgba(255,255,255,0.6)]' />

            {/* Date Display */}
            <div
              className='absolute text-lg font-semibold text-gray-700 text-center w-[140px] h-auto leading-none bottom-[100px] left-[105px] select-none pointer-events-none z-[15]'
              style={{ textShadow: '0 1px 1px rgba(255, 255, 255, 0.3)' }}
            >
              {formatDate(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {!embedded && showSettings && showSettingsPanel && (
        <div className='fixed top-5 right-5 z-[1000] bg-white/90 rounded-lg p-5 shadow-[0_2px_10px_rgba(0,0,0,0.1)] min-w-[250px]'>
          <h3 className='text-lg font-semibold mb-4'>Clock Settings</h3>

          <div className='space-y-4'>
            <div>
              <label className='block text-sm font-medium mb-1'>
                Minute Markers
              </label>
              <input
                type='range'
                min='0'
                max='1'
                step='0.1'
                value={settings.minuteMarkerOpacity}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    minuteMarkerOpacity: parseFloat(e.target.value)
                  }))
                }
                className='w-full'
              />
            </div>

            <div>
              <label className='block text-sm font-medium mb-1'>
                Inner Shadow
              </label>
              <input
                type='range'
                min='0'
                max='1'
                step='0.1'
                value={settings.innerShadowOpacity}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    innerShadowOpacity: parseFloat(e.target.value)
                  }))
                }
                className='w-full'
              />
            </div>

            <div>
              <label className='block text-sm font-medium mb-1'>
                Reflection
              </label>
              <input
                type='range'
                min='0'
                max='1'
                step='0.1'
                value={settings.reflectionOpacity}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    reflectionOpacity: parseFloat(e.target.value)
                  }))
                }
                className='w-full'
              />
            </div>

            <div>
              <label className='block text-sm font-medium mb-1'>
                Glossy Effect
              </label>
              <input
                type='range'
                min='0'
                max='1'
                step='0.1'
                value={settings.glossyOpacity}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    glossyOpacity: parseFloat(e.target.value)
                  }))
                }
                className='w-full'
              />
            </div>

            <div>
              <label className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  checked={settings.showNumbers}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      showNumbers: e.target.checked
                    }))
                  }
                />
                <span className='text-sm font-medium'>Show Numbers</span>
              </label>
            </div>

            <div>
              <label className='block text-sm font-medium mb-1'>
                Seconds Mode
              </label>
              <select
                value={settings.secondsMode}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    secondsMode: e.target.value as any
                  }))
                }
                className='w-full p-1 border rounded'
              >
                <option value='smooth'>Smooth Movement</option>
                <option value='tick1'>Tick Every Second</option>
                <option value='tick2'>Half-Second Ticks</option>
                <option value='highFreq'>High-Frequency Sweep</option>
              </select>
            </div>

            <button
              onClick={() =>
                setSettings({
                  minuteMarkerOpacity: 1,
                  innerShadowOpacity: 0.15,
                  reflectionOpacity: 0.5,
                  glossyOpacity: 0.3,
                  showNumbers: true,
                  secondsMode: 'smooth'
                })
              }
              className='w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors'
            >
              Reset All Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
