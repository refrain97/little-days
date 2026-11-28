// The layout viewport belongs to the notebook. Only the open editor follows
// Safari's visual viewport while a text field has the keyboard.
const mobileLayout = window.matchMedia(
  '(max-width: 760px), (hover: none) and (max-width: 1000px) and (max-height: 520px)',
)
export const usesMobileShell = () => mobileLayout.matches

const inputSelector =
  'input:not([type=button]):not([type=submit]), textarea, select, [contenteditable=true]'
const dimensions = [
  '--visible-height',
  '--visible-width',
  '--visible-top',
  '--visible-left',
]
const editorCleanup = new WeakMap()

function settlePage() {
  if (!usesMobileShell()) return
  function resetScroll() {
    // Another field can receive focus during the keyboard dismissal animation.
    if (!document.activeElement?.matches(inputSelector)) window.scrollTo(0, 0)
  }
  requestAnimationFrame(resetScroll)
  window.setTimeout(resetScroll, 120)
}

export function fitDialogViewport(surface, scroller) {
  const viewport = window.visualViewport
  let frame = 0
  let stopped = false

  function clearSize() {
    cancelAnimationFrame(frame)
    frame = 0
    for (const key of dimensions) surface.style.removeProperty(key)
    surface.removeAttribute('data-short-viewport')
  }
  function align() {
    cancelAnimationFrame(frame)
    frame = 0
    const field = document.activeElement
    if (
      !usesMobileShell() ||
      !surface.contains(field) ||
      !field?.matches(inputSelector)
    ) {
      clearSize()
      return
    }
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

    if (!scroller.contains(field)) return
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
  function onBlur(event) {
    if (!event.target.matches(inputSelector)) return
    clearSize()
    settlePage()
  }
  function keepButtonInPlace(event) {
    // iOS synthesizes mousedown before click. If it blurs the field at that
    // instant, the sheet expands and the release lands on a different element.
    if (
      usesMobileShell() &&
      surface.contains(document.activeElement) &&
      document.activeElement?.matches(inputSelector) &&
      event.target.closest('button, summary, a[href]')
    )
      event.preventDefault()
  }
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)
  window.addEventListener('resize', schedule)
  surface.addEventListener('mousedown', keepButtonInPlace, true)
  surface.addEventListener('focusin', align)
  surface.addEventListener('focusout', onBlur)
  return () => {
    if (stopped) return
    stopped = true
    surface.removeEventListener('mousedown', keepButtonInPlace, true)
    surface.removeEventListener('focusin', align)
    surface.removeEventListener('focusout', onBlur)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    if (surface.contains(document.activeElement)) document.activeElement.blur()
    clearSize()
    settlePage()
  }
}

export function closeEditor(dialog) {
  editorCleanup.get(dialog)?.()
  dialog.close()
}

export function showEditor(dialog, scroller, desktopFocus) {
  const close = dialog.querySelector('[data-close]')
  // Give showModal() a non-text starting point so Safari never flashes a keyboard.
  close.autofocus = usesMobileShell()
  const stop = fitDialogViewport(dialog, scroller)
  editorCleanup.set(dialog, stop)
  dialog.addEventListener('close', stop, { capture: true, once: true })
  dialog.showModal()
  const target = usesMobileShell() ? close : desktopFocus || close
  target.focus({ preventScroll: true })
}
