import { appPath } from './paths.js'

export function registerOfflineShell() {
  const workers = navigator.serviceWorker
  if (!workers) return
  let lastController = workers.controller
  const documentVersion = document.querySelector(
    'meta[name="little-days-shell"]',
  )?.content
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
  function announceDocument() {
    if (documentVersion)
      workers.controller?.postMessage({
        type: 'current-document',
        version: documentVersion,
      })
    rememberFonts(performance.getEntriesByType('resource'))
  }

  function checkController() {
    const controller = workers.controller
    if (!controller) return
    // Chromium can fire controllerchange before the activation transaction completes.
    if (controller.state === 'activating') {
      controller.addEventListener('statechange', checkController, {
        once: true,
      })
      return
    }
    const updated = lastController && lastController !== controller
    lastController = controller
    announceDocument()
    if (updated) {
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
  }
  workers.addEventListener('controllerchange', checkController)
  document.addEventListener('focusout', () => {
    if (reloadPending) setTimeout(applyUpdate, 0)
  })

  async function register() {
    const registration = await workers.register(appPath('sw.js'), {
      updateViaCache: 'none',
    })
    let lastCheck = 0
    function checkForUpdate() {
      if (document.visibilityState !== 'visible') return
      applyUpdate()
      if (
        navigator.onLine !== false &&
        !registration.installing &&
        Date.now() - lastCheck >= 60000
      ) {
        lastCheck = Date.now()
        registration.update().catch(() => {})
      }
    }
    function resume() {
      if (document.visibilityState !== 'visible') return
      checkController()
      checkForUpdate()
    }
    resume()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    window.addEventListener('online', () => {
      lastCheck = 0
      resume()
    })
    // Tabs and installed apps can stay in the foreground across several deployments.
    window.setInterval(checkForUpdate, 60000)
  }
  if (document.readyState === 'complete') register().catch(() => {})
  else
    window.addEventListener('load', () => register().catch(() => {}), {
      once: true,
    })
}
