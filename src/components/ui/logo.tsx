export function LogoIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="og-grad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F97316" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill="url(#og-grad)" />
      {/* Left curly bracket */}
      <path
        d="M148 148c-28 0-44 16-44 44v52c0 20-16 36-36 36v16c20 0 36 16 36 36v52c0 28 16 44 44 44h16v-24h-12c-16 0-24-8-24-24v-56c0-24-12-40-32-48 20-8 32-24 32-48v-56c0-16 8-24 24-24h12v-24h-16z"
        fill="white"
      />
      {/* Right curly bracket */}
      <path
        d="M364 148c28 0 44 16 44 44v52c0 20 16 36 36 36v16c-20 0-36 16-36 36v52c0 28-16 44-44 44h-16v-24h12c16 0 24-8 24-24v-56c0-24 12-40 32-48-20-8-32-24-32-48v-56c0-16-8-24-24-24h-12v-24h16z"
        fill="white"
      />
      {/* Upward arrow */}
      <path
        d="M256 160l-56 64h36v80h40v-80h36z"
        fill="white"
      />
    </svg>
  );
}
