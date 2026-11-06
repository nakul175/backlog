// The product mark, drawn in currentColor so it works on any background. Same
// shapes as the favicon in `app/icon.svg`.
export default function AppLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <rect x="13" y="14.3" width="6" height="3.4" rx="1.7" fill="currentColor" opacity="0.4" />
      <circle cx="9.5" cy="16" r="6" fill="currentColor" />
      <rect x="17" y="10.5" width="11" height="11" rx="3.4" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}
