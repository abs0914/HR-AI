// Kawani AI brand mark, recreated as inline SVG from the supplied logo:
// teal speech-bubble ring, navy team silhouettes, gold check, circuit nodes.
export function KawaniMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="kw-teal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="55%" stopColor="#14a394" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
      </defs>

      {/* speech-bubble ring with a gap at the top-right for the circuits */}
      <circle
        cx="46" cy="52" r="38"
        fill="none" stroke="url(#kw-teal)" strokeWidth="9" strokeLinecap="round"
        pathLength="100" strokeDasharray="86 14" strokeDashoffset="6"
      />
      {/* bubble tail, bottom-left */}
      <path d="M 20 82 L 8 96 L 32 90 Z" fill="#0f766e" />

      {/* circuit branches exiting the gap */}
      <g stroke="#14a394" strokeWidth="3.2" strokeLinecap="round" fill="#ffffff">
        <line x1="68" y1="18" x2="80" y2="8" />
        <circle cx="83" cy="6.5" r="4" />
        <line x1="75" y1="25" x2="89" y2="15" />
        <circle cx="92" cy="13" r="4" />
        <line x1="80" y1="33" x2="93" y2="26" />
        <circle cx="96" cy="24.5" r="4" />
      </g>

      {/* team silhouettes */}
      <g fill="#0e2a47">
        <circle cx="27" cy="42" r="7.5" />
        <rect x="16.5" y="51" width="21" height="16" rx="9" />
        <circle cx="65" cy="42" r="7.5" />
        <rect x="54.5" y="51" width="21" height="16" rx="9" />
        <circle cx="46" cy="35" r="10.5" />
        <rect x="31.5" y="47" width="29" height="22" rx="12" />
      </g>

      {/* check notch */}
      <circle cx="60" cy="74" r="13.5" fill="#ffffff" />
      <path d="M 52.5 74 L 58.5 80.5 L 69.5 66" fill="none" stroke="#d29b12" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KawaniLogo({ size = 36, tagline = false, className }: { size?: number; tagline?: boolean; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <KawaniMark size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block whitespace-nowrap font-bold tracking-tight" style={{ fontSize: size * 0.52 }}>
          <span className="text-[#0e2a47]">Kawani</span> <span className="text-teal-600">AI</span>
        </span>
        {tagline && (
          <span className="block text-[0.6em] font-medium uppercase tracking-[0.28em] text-gray-400">
            Agentic AI Platform
          </span>
        )}
      </span>
    </span>
  );
}
