// Keep the mobile sheet on the visible part of Safari's layout viewport while
// its keyboard, accessory bar, or browser chrome moves.
const mobileLayout = window.matchMedia(
  '(max-width: 760px), (hover: none) and (max-width: 1000px) and (max-height: 520px)',
)

export const usesMobileShell = () => mobileLayout.matches

export function fitDialogViewport(surface, scroller) {
  const viewport = window.visualViewport
  let frame = 0
  function align() {
    frame = 0
    if (!usesMobileShell()) return
    const height = viewport?.height || window.innerHeight
    surface.style.setProperty('--visible-height', height + 'px')
    surface.style.setProperty(
      '--visible-width',
      (viewport?.width || window.innerWidth) + 'px',
    )
    surface.style.setProperty(
      '--visible-top',
      (viewport?.offsetTop || 0) + 'px',
    )
    surface.style.setProperty(
      '--visible-left',
      (viewport?.offsetLeft || 0) + 'px',
    )
    surface.toggleAttribute('data-short-viewport', height < 350)

    const field = document.activeElement
    if (!field?.matches('input, textarea, select') || !scroller.contains(field))
      return
    const bounds = scroller.getBoundingClientRect()
    const input = field.getBoundingClientRect()
    if (input.top < bounds.top) scroller.scrollTop += input.top - bounds.top
    else if (input.bottom > bounds.bottom)
      scroller.scrollTop += Math.min(
        input.bottom - bounds.bottom,
        input.top - bounds.top,
      )
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(align)
  }
  align()
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  window.addEventListener('resize', schedule)
  surface.addEventListener('focusin', schedule)
  return () => {
    cancelAnimationFrame(frame)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    surface.removeEventListener('focusin', schedule)
  }
}

export function showEditor(dialog, scroller, desktopFocus) {
  const close = dialog.querySelector('[data-close]')
  // The browser chooses focus synchronously in showModal(). Name the button
  // first so opening a sheet never briefly gives the keyboard a text target.
  close.autofocus = usesMobileShell()
  const stop = fitDialogViewport(dialog, scroller)
  dialog.addEventListener('close', stop, { once: true })
  dialog.showModal()
  const target = usesMobileShell() ? close : desktopFocus || close
  target.focus({ preventScroll: true })
}
