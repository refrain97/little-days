import { appPath } from './paths.js'

export function registerOfflineShell() {
  const workers = navigator.serviceWorker
  if (!workers) return
  let previouslyControlled = Boolean(workers.controller)
  let reloadPending = false
  let observer
  const fontPrefix = new URL(appPath('fonts/'), location.href).href

  function applyUpdate() {
    if (!reloadPending) return
    const editing =
      document.querySelector('dialog[open], #overlay [role=dialog]') ||
      document.activeElement?.matches('input, textarea, [contenteditable=true]')
    if (editing || document.visibilityState !== 'visible') return
    reloadPending = false
    observer?.disconnect()
    location.reload()
  }

  function rememberFonts(entries) {
    const used = entries
      .map(({ name }) => name)
      .filter((name) => name.startsWith(fontPrefix) && name.endsWith('.woff2'))
    if (used.length)
      workers.controller?.postMessage({
        type: 'used-fonts',
        urls: [...new Set(used)],
      })
  }
  // Safari may resolve a font through the stylesheet's initial (uncontrolled)
  // request context even after the document has gained a controller.
  if (window.PerformanceObserver?.supportedEntryTypes?.includes('resource')) {
    new PerformanceObserver((list) => rememberFonts(list.getEntries())).observe(
      { entryTypes: ['resource'] },
    )
  }
  workers.addEventListener('controllerchange', () => {
    rememberFonts(performance.getEntriesByType('resource'))
    if (previouslyControlled) {
      reloadPending = true
      if (!observer) {
        observer = new MutationObserver(applyUpdate)
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['open'],
        })
      }
      applyUpdate()
    }
    previouslyControlled = true
  })
  document.addEventListener('focusout', () => {
    if (reloadPending) setTimeout(applyUpdate, 0)
  })

  async function register() {
    const registration = await workers.register(appPath('sw.js'), {
      updateViaCache: 'none',
    })
    let lastCheck = Date.now()
    function checkOnReturn() {
      if (document.visibilityState !== 'visible') return
      applyUpdate()
      if (navigator.onLine && Date.now() - lastCheck >= 60000) {
        lastCheck = Date.now()
        registration.update().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', checkOnReturn)
    window.addEventListener('pageshow', checkOnReturn)
  }
  if (document.readyState === 'complete') register().catch(() => {})
  else
    window.addEventListener('load', () => register().catch(() => {}), {
      once: true,
    })
}
