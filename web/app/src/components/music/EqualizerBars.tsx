export function EqualizerBars({
  playing = true,
  size = 18,
  className = '',
}: {
  playing?: boolean;
  size?: number;
  className?: string;
}) {
  const heights = [0.3, 0.68, 0.45, 0.56];
  const delays = [0, -0.24, -0.49, -0.73];
  // Keep the bars on whole CSS pixels at the 12–16px sizes used in rows.
  // Fractional 1.6px bars scaled every frame shimmer and can look like they
  // overlap on Windows at 125%/150% display scaling.
  const barWidth = Math.max(2, Math.round(size * 0.14));
  const gap = Math.max(1, Math.round(size * 0.07));
  return (
    <div
      className={`inline-flex items-end justify-center ${className}`}
      style={{ height: size, width: size, gap }}
      role="img"
      aria-label={playing ? 'Playing' : 'Paused'}
    >
      {heights.map((height, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`shrink-0 origin-bottom rounded-full bg-(--theme-accent) ${playing ? 'mellow-equalizer-bar' : ''}`}
          style={playing
            ? { width: barWidth, height: '100%', animationDelay: `${delays[i]}s` }
            : { width: barWidth, height: `${height * 100}%` }}
        />
      ))}
    </div>
  );
}
