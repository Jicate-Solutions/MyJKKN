'use client';

import React from 'react';
import Confetti from 'react-confetti';

const ConfettiEffect = () => {
  const [dimensions, setDimensions] = React.useState({
    width: 0,
    height: 0
  });

  React.useEffect(() => {
    const { innerWidth: width, innerHeight: height } = window;
    setDimensions({
      width,
      height
    });
  }, []);

  if (dimensions.width === 0) {
    return null;
  }

  return (
    <Confetti
      width={dimensions.width}
      height={dimensions.height}
      numberOfPieces={200}
      recycle={false}
      onConfettiComplete={(confetti) => {
        if (confetti) {
          confetti.reset();
        }
      }}
    />
  );
};

export default ConfettiEffect;
