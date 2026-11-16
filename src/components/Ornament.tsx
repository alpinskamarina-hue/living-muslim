export function Ornament() {
  return (
    <svg className="orn" aria-hidden="true">
      <defs>
        <pattern id="orn8" width="48" height="48" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="var(--pattern)" strokeWidth="1.1">
            <rect x="12" y="12" width="24" height="24" />
            <rect x="12" y="12" width="24" height="24" transform="rotate(45 24 24)" />
            <circle cx="24" cy="24" r="5" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#orn8)" />
    </svg>
  );
}
