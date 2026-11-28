// Some iPhone Home Screen windows stop one status-bar height before the
// physical edge, while still reporting both safe-area insets inside the page.
export function watchHomeScreenInsets(shell) {
  if (
    !navigator.standalone &&
    !matchMedia('(display-mode: standalone)').matches
  )
    return

  const root = document.documentElement
  let frame = 0
  let afterTransition = 0
  function measure() {
    frame = 0
    const { width, height } = window.screen
    const inPortrait = height > width && Math.abs(width - root.clientWidth) <= 2
    const safeTop = parseFloat(getComputedStyle(shell).borderTopWidth) || 0
    // The root's clientHeight can keep the launch size after iOS expands the
    // window. innerHeight follows the layout window once the system releases it.
    const reserved = height - window.innerHeight
    if (
      inPortrait &&
      reserved > safeTop + 2 &&
      document.activeElement?.matches('input, textarea, [contenteditable=true]')
    )
      return
    root.toggleAttribute(
      'data-home-screen-gutter',
      inPortrait && safeTop > 0 && Math.abs(reserved - safeTop) <= 2,
    )
    // After a short window expands, WebKit can leave fixed percentage heights
    // at the launch size. Only use an explicit height when the layout window
    // itself reports the entire portrait screen as available.
    const fullHeight = inPortrait && Math.abs(reserved) <= 2 ? window.innerHeight + 'px' : ''
    // Keep the root/body hit-test bounds and fixed shell in the same rectangle.
    if (root.style.getPropertyValue('--full-window-height') !== fullHeight)
      root.style.setProperty('--full-window-height', fullHeight)
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure)
  }
  function settle() {
    schedule()
    // A resumed iOS window can publish its final layout height after the
    // keyboard/status-bar animation, without sending another resize event.
    clearTimeout(afterTransition)
    afterTransition = setTimeout(schedule, 500)
  }
  // Read layout geometry only. The keyboard's visual viewport belongs to editors.
  measure()
  new ResizeObserver(schedule).observe(shell)
  window.addEventListener('pageshow', settle)
  window.addEventListener('resize', settle)
  window.addEventListener('orientationchange', settle)
  window.visualViewport?.addEventListener('resize', schedule)
  document.addEventListener('focusout', (event) => {
    if (event.target.matches('input, textarea, [contenteditable=true]')) settle()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') settle()
  })
}
