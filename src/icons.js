const drawings = {
  store:
    '<path d="M4 10.5v9h16v-9M3 8l2-4h14l2 4v1a2.2 2.2 0 0 1-4.5 0 2.2 2.2 0 0 1-4.5 0 2.2 2.2 0 0 1-4.5 0A2.2 2.2 0 0 1 3 9zM8 4l-.5 4m8.5-4 .5 4M12 4v4M7 19v-5h4v5"/>',
  trash:
    '<path d="M4 6.5h16M9 6.5v-3h6v3M6 6.5l1 14h10l1-14M10 10v6.5m4-6.5v6.5"/>',
  book: '<path d="M4 5.2C7.2 4 9.7 4.2 12 6c2.3-1.8 4.8-2 8-.8v13.6c-3.2-1.1-5.7-1-8 .6-2.4-1.6-4.9-1.7-8-.6z"/><path d="M12 6v13"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.3 2"/>',
  chef: '<path d="M7 13c-4 .2-5.5-5.6-1.5-7.3 1.1-.5 2-.4 2.8 0 1.3-4 6.2-4 7.5 0 4.8-2 7.3 5.5 2.2 7.2V20H7z"/><path d="M7 16.6h11"/>',
  heart:
    '<path d="M20.4 5.9A5.1 5.1 0 0 0 12 7a5.1 5.1 0 0 0-8.4-1.1C.5 9.6 4.1 14.4 12 20c7.9-5.6 11.5-10.4 8.4-14.1Z"/>',
  camera:
    '<path d="M3 7.5h4l1.6-2.7h6.7l1.6 2.7H21v12H3z"/><circle cx="12" cy="13" r="3.4"/>',
  mic: '<rect x="9" y="2.7" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.3m-3.5 0h7"/>',
  pen: '<path d="m4 16-.8 4.8 4.8-.8L20.2 7.8a2 2 0 0 0 0-2.8L19 3.8a2 2 0 0 0-2.8 0zM14 6l4 4"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 1.8v2.8m0 14.8v2.8M1.8 12h2.8m14.8 0h2.8M4.7 4.7l2 2m10.6 10.6 2 2m0-14.6-2 2M6.7 17.3l-2 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M4.5 12h14M13 6l6 6-6 6"/>',
  next: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  down: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  refresh:
    '<path d="M20.5 4.5v5.2h-5.2M3.5 19.5v-5.2h5.2"/><path d="M19.8 9a8.2 8.2 0 0 0-13.5-3M4.2 15a8.2 8.2 0 0 0 13.5 3"/>',
  star: '<path d="m12 2.5 2.9 6 6.6 1-4.8 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5-4.8-4.6 6.6-1z"/>',
  food: '<path d="M3 12h18a9 9 0 0 1-18 0Zm3 8h12M7 8l1-3m4 3 1.3-4M17 8l1-3"/>',
  cup: '<path d="M3 8h13v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM16 9h2a2.7 2.7 0 0 1 0 5h-2M6 3v2m5-2v2"/>',
  bulb: '<path d="M8.5 17c0-3-3-3.7-3-7.3a6.5 6.5 0 0 1 13 0c0 3.6-3 4.3-3 7.3zM9 20h6"/>',
  memory:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.2" cy="9.6" r="1.3"/><path d="m5 17 4.5-4 2.4 1.6 3.2-3 4.8 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8.5 6h12m-12 6h12m-12 6h12"/><circle cx="3.6" cy="6" r=".6"/><circle cx="3.6" cy="12" r=".6"/><circle cx="3.6" cy="18" r=".6"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M7.5 3v4m9-4v4M4 10h16"/>',
  search: '<circle cx="10" cy="10" r="6.3"/><path d="m15 15 5 5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  sprout:
    '<path d="M12 21v-8m0 3C5 16 3 12 3 8c6 0 9 3 9 8Zm0-3c0-6 3-9 9-10 0 6-3 10-9 10Z"/>',
  settings:
    '<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="1.8" fill="currentColor"/><circle cx="15" cy="12" r="1.8" fill="currentColor"/><circle cx="10" cy="18" r="1.8" fill="currentColor"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  sparkle:
    '<path d="M12 2c.7 6.2 3.8 9.2 9 10-5.8 1.1-8.6 4-9 10-.8-6-3.3-9-9-10 5.7-1 8.5-4 9-10Z"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>',
  tag: '<path d="M3 4h8l10 10-7 7L3 10z"/><circle cx="7.5" cy="7.8" r=".8"/>',
}
export function icon(name, size = 20, extra = '') {
  return (
    '<svg aria-hidden="true" class="icon ' +
    extra +
    '" width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
    (drawings[name] || '') +
    '</svg>'
  )
}
export function flower() {
  return (
    '<svg class="brand-flower" aria-hidden="true" viewBox="0 0 64 64"><g fill="#f4bb98">' +
    Array.from(
      { length: 8 },
      (_, i) =>
        '<ellipse cx="32" cy="17" rx="8.1" ry="12.1" transform="rotate(' +
        i * 45 +
        ' 32 32)"/>',
    ).join('') +
    '</g><circle cx="32" cy="32" r="12" fill="#644051"/><g stroke="#ffddbd" stroke-width="2.3" stroke-linecap="round" fill="none"><path d="M27.5 29v2m9-2v2m-9 4q4.5 5 9 0"/></g></svg>'
  )
}
export const flourish =
  '<svg class="flourish" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="m4 16 3-8m5 12 10-9m-7 16 12-3"/></svg>'
export const kitchenSketch =
  '<svg class="kitchen-sketch" aria-hidden="true" viewBox="0 0 180 97" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(-8 98 60)"><path d="M45 52q39 9 82-1c-2 23-18 33-40 32-23 0-37-11-42-31Z"/><ellipse cx="86" cy="52" rx="41" ry="8"/><path d="M73 81q13 8 29 0m-46-20q2 7 8 10M65 53q3-12 12-4 5-13 14-3 6-7 11 1"/><path d="m101 51 33-38q2-3 4 0l-31 39m-1 0 40-30q3-3 5 0l-40 30"/></g><path d="M68 37c8-10-7-12 1-22m12 17c8-10-5-11 1-18M37 28v8m-4-4h8m98 33v6m-3-3h6"/><circle cx="51" cy="18" r="1" fill="currentColor"/><circle cx="132" cy="77" r="1" fill="currentColor"/></svg>'
