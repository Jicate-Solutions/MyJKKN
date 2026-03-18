'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface CelebrationConfettiProps {
  active: boolean;
}

export function CelebrationConfetti({ active }: CelebrationConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasFired = useRef(false);

  useEffect(() => {
    if (!active || hasFired.current || !canvasRef.current) return;
    hasFired.current = true;

    const myConfetti = confetti.create(canvasRef.current, {
      resize: true,
      useWorker: false,
    });

    const timer = setTimeout(() => {
      // Left burst
      myConfetti({
        particleCount: 60,
        spread: 70,
        origin: { x: 0.15, y: 0.6 },
        colors: ['#FFD700', '#FF6B35', '#1E90FF', '#32CD32', '#FF1493'],
        ticks: 120,
        gravity: 1.2,
        scalar: 0.9,
        disableForReducedMotion: true,
      });

      // Right burst
      myConfetti({
        particleCount: 60,
        spread: 70,
        origin: { x: 0.85, y: 0.6 },
        colors: ['#FFD700', '#FF6B35', '#1E90FF', '#32CD32', '#FF1493'],
        ticks: 120,
        gravity: 1.2,
        scalar: 0.9,
        disableForReducedMotion: true,
      });

      // Center shower
      setTimeout(() => {
        myConfetti({
          particleCount: 80,
          spread: 100,
          origin: { x: 0.5, y: 0.3 },
          colors: ['#FFD700', '#FFA500', '#FF4500', '#9400D3', '#00CED1'],
          ticks: 150,
          gravity: 0.8,
          scalar: 1.1,
          shapes: ['circle', 'square'],
          disableForReducedMotion: true,
        });
      }, 300);

      // Final sparkle
      setTimeout(() => {
        myConfetti({
          particleCount: 30,
          spread: 120,
          origin: { x: 0.5, y: 0.5 },
          colors: ['#FFD700', '#FFFFFF', '#FFC107'],
          ticks: 100,
          gravity: 0.6,
          scalar: 0.7,
          shapes: ['circle'],
          disableForReducedMotion: true,
        });
      }, 700);
    }, 500);

    return () => clearTimeout(timer);
  }, [active]);

  // Always render canvas so ref is available when active becomes true
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
}
