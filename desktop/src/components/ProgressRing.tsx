import type { ReactNode } from 'react';

type Props = {
  size?: number;
  stroke?: number;
  ratio: number;
  trackColor?: string;
  color?: string;
  children?: ReactNode;
};

export default function ProgressRing({
  size = 132,
  stroke = 11,
  ratio,
  trackColor = 'rgba(148,163,184,0.16)',
  color = '#22d3ee',
  children,
}: Props) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.5s cubic-bezier(0.4,0,0.2,1)',
            filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.45))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
