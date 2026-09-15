import * as React from "react"

// Aligned with bottom-navbar.tsx `lg:hidden` (≥1024px hides the strip).
// The previous 768 left the 768-1023px range with BOTH bottom-strip AND
// no sidebar; 1024 collapses that ghost zone — tablets get desktop sidebar.
const MOBILE_BREAKPOINT = 1024
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT
}

// The server has no viewport; it renders the desktop shape.
function getServerSnapshot() {
  return false
}

// Why useSyncExternalStore and not useState + useEffect: the previous
// version seeded useState from window.innerWidth on the client. During
// hydration that initial value was already `true` on a phone, the effect
// then set `true` again — no state change, no re-render — and React kept
// the SERVER-rendered class names (no `pb-20` on <main>, no `hidden` on the
// footer) silently, because those elements carry suppressHydrationWarning.
// Measured live on www.jkkn.ai at 430px, 2026-09-15: staff pages first
// painted with desktop bottom padding and the site footer drawn under the
// bottom nav until something else re-rendered the layout. With a server
// snapshot React hydrates against `false`, compares with the client
// snapshot afterwards and re-renders when they differ — the designed path.
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
