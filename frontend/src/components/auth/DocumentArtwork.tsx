// Decorative vector artwork stays crisp at every screen size.
export function DocumentArtwork() {
  return (
    <svg viewBox="0 0 360 260" fill="none" aria-hidden="true" style={{ display: 'block', width: '100%' }}>
      <ellipse cx="181" cy="231" rx="155" ry="23" fill="#0b1d35" />
      <g transform="rotate(-10 110 135)">
        <rect x="62" y="58" width="108" height="158" rx="10" fill="#395d8d" />
      </g>
      <g transform="rotate(-12 65 160)">
        <rect x="24" y="112" width="78" height="102" rx="7" fill="#537bb3" />
        <path d="M42 140h39M42 155h39M42 170h32M42 185h24" stroke="#91b4ea" strokeWidth="6" strokeLinecap="round" />
      </g>
      <rect x="191" y="79" width="87" height="139" rx="8" fill="#96b9f3" />
      <path d="M208 111h48M208 130h48M208 149h33" stroke="#7aa2e4" strokeWidth="8" strokeLinecap="round" />
      <g transform="rotate(10 291 163)">
        <rect x="260" y="117" width="67" height="99" rx="7" fill="#395d8d" />
        <path d="M274 141h34M274 156h34M274 171h30M274 186h20" stroke="#6f94cd" strokeWidth="5" strokeLinecap="round" />
      </g>
      <rect x="117" y="62" width="124" height="168" rx="9" fill="#f4f8ff" />
      <path d="M142 103h48M142 124h74M142 145h66M142 166h42M142 187h42" stroke="#afcbff" strokeWidth="9" strokeLinecap="round" />
      <path d="m259 204 28 31a9 9 0 0 1-13 12l-28-31" fill="#183759" stroke="#a6c9ff" strokeWidth="5" />
      <circle cx="235" cy="176" r="31" fill="#e6f1ff" fillOpacity=".75" stroke="#102943" strokeWidth="10" />
      <path d="m289 57 6-16m10 27 13-10m-7 27 16 1" stroke="#438fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
