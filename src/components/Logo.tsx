/**
 * Logo — PR Sentinel mark.
 *
 * A shielded checkmark with a subtle GitHub-PR-style branch curve baked in.
 * The gradient is tied to the project's violet → cyan accent so the mark
 * matches buttons, badges, and CTAs without extra wiring.
 *
 * `size` controls width/height in pixels. `withWordmark` adds the
 * "PR Sentinel" text next to the icon (used in headers).
 */
interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

export default function Logo({ size = 32, withWordmark = false, className = '' }: LogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="logoStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#67e8f9" />
          </linearGradient>
          <filter id="logoGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Shield body */}
        <path
          d="M20 3.5L33 8v11.2c0 7.6-5.2 14.6-13 17.3-7.8-2.7-13-9.7-13-17.3V8l13-4.5z"
          fill="url(#logoGradient)"
          fillOpacity="0.14"
          stroke="url(#logoStroke)"
          strokeWidth="1.5"
        />

        {/* PR branch dots + line */}
        <circle cx="15" cy="14" r="2" fill="url(#logoGradient)" />
        <circle cx="15" cy="26" r="2" fill="url(#logoGradient)" />
        <circle cx="25" cy="20" r="2" fill="url(#logoGradient)" />
        <path
          d="M15 16v8M15 18c0 3 4 2 4 2h2M25 22c0-4-4-2-4-2"
          stroke="url(#logoStroke)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Sentinel eye accent */}
        <circle cx="25" cy="20" r="0.8" fill="#0a0b10" />
      </svg>

      {withWordmark && (
        <span className="font-bold text-white tracking-tight text-lg">
          PR Sentinel
        </span>
      )}
    </div>
  );
}
