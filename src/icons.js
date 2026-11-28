// Tiny two-tone sticker drawings. Every control shares the same rounded cocoa outline.
const milk = '#fff5df'
const pink = '#efafa3'
const green = '#c4d89e'
const yellow = '#f3d176'
const cocoa = '#684a37'
const path = (d, fill = 'none', extra = '') =>
  `<path d="${d}" fill="${fill}" ${extra}/>`
const dot = (x, y, r, fill = cocoa) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="none"/>`
const rect = (x, y, w, h, r, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`
const eyes = dot(8.7, 10, 0.95) + dot(15.3, 10, 0.95)
const face = (fill, mouth) =>
  `<circle cx="12" cy="12" r="9" fill="${fill}"/>` + eyes + path(mouth)
const arrow = (d) => path(d, 'none', 'stroke-width="3.1"')
const drawings = {
  store:
    rect(4, 8, 16, 12, 2, milk) +
    path(
      'M3 9 5.4 4.2l13.3-.1L21 9c0 3-3.9 4-5.1.8-1.4 2.8-4.1 2.8-5.3 0-1.5 2.9-4.1 2.7-4.7.2C4.4 11.7 3 11 3 9Z',
      pink,
    ) +
    path('m9.1 4.6-.7 3.2m6.6-3 .6 3') +
    rect(8.1, 14.1, 4.7, 6, 0.7, green),
  trash:
    path('m5.1 7.2.9 11.6q.2 2.1 2.5 2.1h7.1q2.1-.1 2.3-2.1L19 7.2Z', pink) +
    path('M9 5.1V4q0-1.2 1.6-1.2h2.8q1.6 0 1.6 1.2v1.1') +
    rect(3.1, 5.2, 17.8, 3.2, 1.5, milk) +
    path('M10 11.5v5m4-5v5'),
  book:
    path(
      'M2.4 5.3q5.1-2 9.6.9 4.1-2.8 9.4-1.4l.1 13.6c-3.8-.6-6.5.2-9.4 2.1-3.3-2-6.1-2.6-9.7-1.8Z',
      green,
    ) +
    path(
      'M3.9 4.4c3-.6 5.6.1 8.1 2.1 2.5-2 5-2.9 8.1-2.6l.1 12.3c-3.3-.1-5.5.7-8 2.6-2.5-1.9-5.1-2.6-8.3-2.1Z',
      milk,
    ) +
    path('m12 6.5.2 12M6.3 8.3l3 .9m5.4 2.5 2.9-.8') +
    path('m16.3 4.8.1 3.5 1.2-1 1.2.4V4.3', pink),
  clock:
    '<circle cx="12" cy="12.3" r="8.9" fill="' +
    milk +
    '"/>' +
    path('m12.1 6.5-.4 6 4 1.9', 'none', 'stroke-width="2.2"') +
    dot(12, 12.1, 1.3),
  chef:
    path(
      'M6.1 14c-5 .2-5.3-7.2-.8-8.1q1.5-.5 3.1.1c1.8-4.2 6.8-4.2 8.6-.4 5.3-1 7 6.2 1.7 8l-.2 4.9-12-.1Z',
      milk,
    ) +
    path(
      'm6.4 16.3 12.3-.3-.2 3.2q0 1.1-1.6 1.2l-9 .2q-1.5 0-1.5-1.2Z',
      yellow,
    ) +
    path('m10.2 10.6.4 2.4m3.8-2.5-.4 2.5'),
  heart:
    path(
      'M12 20.4C9.6 18.5 2.5 14.7 2.7 9.1c.2-4.9 6.2-6.8 9.3-2.3 3.3-4.8 9.4-2.8 9.3 2.1 0 4.7-6.3 9.3-9.3 11.5Z',
      'var(--heart-fill, #efb1a8)',
    ) +
    path(
      'M5.7 8.6q.3-1.6 1.9-1.8',
      'none',
      'stroke="#fff8e9" stroke-width="1.4"',
    ),
  camera:
    rect(2.4, 6.9, 19.2, 13.1, 3.2, pink) +
    path('m7.5 7 .8-2.4q.3-.9 1.4-.9h4.9q1 0 1.4.9l1 2.4', milk) +
    '<circle cx="12" cy="13.3" r="4" fill="' +
    milk +
    '"/>' +
    dot(12, 13.3, 2, green) +
    dot(18.5, 10.2, 0.8),
  mic:
    rect(8, 2.4, 8, 13.2, 4, pink) +
    path(
      'M5.1 11.1c0 9.5 13.7 9.3 13.7-.2m-6.8 7.7v2.7m-3.2 0h6.4',
      'none',
      'stroke-width="2"',
    ) +
    path('m9 6.8 2.6.1m-2.6 3h2.1', 'none', 'stroke-width="1.25"'),
  pen:
    path(
      'm3.1 20.8 1.1-5.4L15.9 3.6q1.2-1.2 2.4-.2l2.2 2q1.2 1.1.2 2.2L8.4 19.8Z',
      yellow,
    ) +
    path('m15 4.6 4.3 4.1 1.4-1.6q1.1-1.1-.2-2.2l-2.2-2q-1.2-1-2.4.2Z', pink) +
    path('m4.2 15.4 4.1 4.2-5.2 1.2Z', milk),
  sun:
    '<circle cx="12" cy="12" r="5.9" fill="' +
    yellow +
    '"/>' +
    path(
      'M12 1.5v2.1m0 16.6v2.3M1.6 12h2.2m16.3 0h2.2M4.6 4.8l1.6 1.5m11.8 11.9 1.5 1.5m-.1-15-1.6 1.5M6 18.1l-1.5 1.4',
      'none',
      'stroke-width="1.9"',
    ) +
    dot(10.1, 11.8, 0.68) +
    dot(14.1, 11.8, 0.68) +
    path('M11.3 14q.8.8 1.6-.1', 'none', 'stroke-width="1.1"'),
  plus: arrow('M12.1 4.8 12 19.1M5 12.1l14.1-.2'),
  arrow: arrow('m3.8 12.3 15.6-.4m-5.9-5.4 6 5.4-5.4 5.9'),
  next: arrow('m9.2 5.8 6.1 6-5.8 6.6'),
  down: arrow('m6.1 9.2 5.9 5.9 6-5.8'),
  refresh: path(
    'M4.9 8.7a7.9 7.9 0 0 1 13.8-2.3l1.5 2.4m-4.5-.1 4.5.1.2-4.4M19 15.1a7.9 7.9 0 0 1-13.7 2.5l-1.4-2.3m4.2.2-4.2-.2-.3 4.1',
    'none',
    'stroke-width="2.3"',
  ),
  star: path(
    'm12.1 2.5 2.9 5.8 6.2 1.1-4.4 4.7.8 6.3-5.7-2.9-5.9 2.6 1-6.3-4.3-4.5 6.3-.9Z',
    'var(--star-fill, #f5d383)',
  ),
  food:
    path('M2.7 11.4q9.3-1.5 18.7-.2-.9 8.1-9.2 8.5-8.5-.1-9.5-8.3Z', pink) +
    path(
      'M2.9 11.5q8.4 2.7 18.1-.1M7.8 20.2l8.3.1M6.4 8.5Q5.3 7 6.7 4.8m4.6 3.7q-1.6-2 .4-4.8m4.5 4.8q-1.1-1.9.7-3.6',
    ),
  cup:
    path('m15.6 8.2 2.8-.1c4.4 0 4.2 6.1-1.6 6.1h-1.2', milk) +
    path(
      'M3.2 7.6q6.8-1.1 13.7-.1l-.7 7.3q-.5 4.9-6.4 4.7-5.8.3-6.2-4.9Z',
      green,
    ) +
    path('M6.8 4.7q-1-1.1.2-2.1m4 2.2q-1-1 .2-2.3M4.7 20.7l12.8-.2'),
  bulb:
    path(
      'M8.6 16.7c-.1-3-3.6-3.4-3.6-8A6.9 6.9 0 0 1 12 2.4c4.3.1 7.1 3.2 6.9 6.7-.2 4.3-3.3 4.6-3.7 7.7Z',
      yellow,
    ) +
    rect(8.8, 16.8, 6.5, 3.5, 1.2, green) +
    path('m10.1 21.4 3.8-.1m-3.8-11.2 1.9 2.1 2.1-2.4'),
  memory:
    rect(2.8, 3.7, 18.4, 16.8, 2.4, milk) +
    rect(5.1, 6.1, 13.8, 10.7, 1, green) +
    path('m5.4 15 4-4 2.7 2.7 2.8-3 3.5 4.8v.9H5.4Z', pink) +
    dot(15.6, 8.6, 1.3, yellow),
  grid:
    rect(3.1, 3.2, 7.1, 7.1, 1.8, pink) +
    rect(13.7, 3.2, 7.1, 7.1, 1.8, yellow) +
    rect(3.1, 13.8, 7.1, 7.1, 1.8, green) +
    rect(13.7, 13.8, 7.1, 7.1, 1.8, milk),
  list:
    path(
      'm9 6.4 11.2-.2M9 12h11.6M9 17.8l10.3-.1',
      'none',
      'stroke-width="2.4"',
    ) +
    dot(4.2, 6.3, 1.65) +
    dot(4.2, 12, 1.65) +
    dot(4.2, 17.8, 1.65),
  calendar:
    rect(3.1, 4.9, 17.9, 15.7, 2.9, milk) +
    path('M3.2 9.7V7.8q0-2.9 2.9-2.9H18q3 0 3 2.8v2Z', pink) +
    path('M7.7 3.1v3.7M16.6 3v3.6') +
    dot(8.4, 13.2, 0.83) +
    dot(12.2, 13.2, 0.83) +
    dot(15.9, 13.2, 0.83) +
    dot(8.4, 16.6, 0.83) +
    dot(12.2, 16.6, 0.83),
  search:
    '<circle cx="10" cy="10.3" r="6.4" fill="' +
    milk +
    '"/>' +
    path('m14.7 15 4.5 5.4q.7.7 1.5-.2l.7-.7q.6-.9-.3-1.5l-5-4.1Z', pink) +
    path('M6.6 9.7q.4-2.3 2.7-2.8', 'none', 'stroke-width="1.2"'),
  x: arrow('m6.5 6.4 11.1 11.3M17.5 6.3 6.6 17.7'),
  sprout:
    path('M11.9 16.5C5 16.8 2.6 12 2.7 7.6c5.5-.9 10.2 2.4 9.2 8.9Z', green) +
    path('M12 13C12 6.1 16.1 3.4 21 2.9c.9 5.5-2.5 10.3-9 10.1Z', '#e2e9bc') +
    path('M12 21c.2-4.1-.3-8.4 4.6-13.4m-4.7 9.7q-1-3.9-5-6.3'),
  settings:
    path('m3 6.2 18-.3M3 12.6l18-.3M3 18.5l18-.3', 'none', 'stroke-width="2"') +
    '<circle cx="8.5" cy="6.1" r="2.65" fill="' +
    pink +
    '"/><circle cx="15.5" cy="12.4" r="2.65" fill="' +
    green +
    '"/><circle cx="9.5" cy="18.4" r="2.65" fill="' +
    yellow +
    '"/>',
  check: arrow('m4.3 12.3 5.1 4.9 10.4-11'),
  sparkle: path(
    'M11.8 2.3c.9 5.8 3.8 8.5 9.3 9.3-5.8 1.3-8.5 4.1-9.3 10-1.4-5.7-3.6-8.6-9.1-9.8 5.2-1.1 7.8-3.8 9.1-9.5Z',
    yellow,
  ),
  back: arrow('m14.6 5.8-6.2 6 5.9 6.5'),
  tag:
    path('M3.4 4.3 11 4l10.2 9.9-7 7.3L3.5 11Z', green) + dot(7.7, 7.9, 1.05),
  dice:
    rect(3, 3, 18, 18, 4.6, milk) +
    dot(7.9, 8, 1.5) +
    dot(16, 8, 1.5) +
    dot(12, 12, 1.5, '#cb796e') +
    dot(8, 16, 1.5) +
    dot(16, 16, 1.5),
  bolt: path('m14.3 2.1-10 12 6.6-.4-1.7 8 10.5-13-6.5.4Z', yellow),
  toast:
    path(
      'M5.3 10.8C-.1 6.2 5.3 2.1 11.9 2.4c7.1-.2 12.3 3.9 6.9 8.3l.4 8.3q.1 1.9-2.1 2H7.2Q5 21 5.1 19Z',
      '#dcad72',
    ) +
    path(
      'M7.4 10.1C3.2 7.1 7.4 4.9 12 5c4.8-.3 8.4 2 4.7 5l.4 8.3H7.2Z',
      milk,
    ) +
    rect(10, 9.7, 4.9, 4, 1.1, yellow),
  stop: rect(4.8, 4.8, 14.4, 14.4, 3.2, pink),
  together:
    '<circle cx="8.5" cy="7.5" r="3.4" fill="' +
    pink +
    '"/><circle cx="16.5" cy="7.7" r="2.9" fill="' +
    yellow +
    '"/>' +
    path('M13.2 12.6c5.7-3.6 9.4 1.1 8.7 5.7l-7.1.1Z', yellow) +
    path('M2.3 18.7c-.4-8.9 12.3-9.1 12.5-.1Z', pink),
  lock:
    path(
      'M7.4 10.3V7.2a4.6 4.6 0 0 1 9.2 0v3.3',
      'none',
      'stroke-width="2.1"',
    ) +
    rect(4.3, 9.9, 15.4, 11, 2.5, yellow) +
    dot(12, 14.1, 1.4) +
    path('m12 14.6-.1 2.4'),
  glad: face(yellow, 'M8.3 13.2q3.5 5.4 7.5 0'),
  okay: face(green, 'M9.1 14.5q2.7.7 5.7-.2'),
  nope: face(pink, 'M9.2 15.7q2.4-3.9 5.5-.2'),
}

export function icon(name, size = 20, extra = '') {
  return `<svg aria-hidden="true" class="icon ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${cocoa}" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">${drawings[name] || ''}</svg>`
}

export function flower() {
  return `<svg class="brand-flower" aria-hidden="true" viewBox="0 0 52 52"><path fill="#f1b2a2" stroke="#684a37" stroke-width="2.1" stroke-linejoin="round" d="M26 12C25 1 13 2 13 13 4 8-2 20 9 25-2 29 4 41 14 37 12 48 25 52 28 41c6 9 17 3 13-6 11 .3 12-12 1-14 8-8-2-17-11-10 0-2-2-3-5 1Z"/><circle cx="26" cy="26" r="10.2" fill="#f6da83" stroke="#684a37" stroke-width="1.8"/><g fill="#684a37"><ellipse cx="22" cy="25" rx="1.3" ry="1.8"/><ellipse cx="29.9" cy="25" rx="1.3" ry="1.8"/></g><path d="M24 29q2.3 2.6 4.6-.3" fill="none" stroke="#684a37" stroke-width="1.5" stroke-linecap="round"/></svg>`
}

export const flourish = `<svg class="flourish" viewBox="0 0 34 32" aria-hidden="true" fill="#edc970" stroke="#79543c" stroke-width="1.4" stroke-linejoin="round"><path d="M12 3q1.1 7 8 9-7 2-8.2 9Q10 14 3 12q7-2 9-9Z"/><path d="M26 17q.8 4.1 5 5.5-4 1.4-5.1 5.2-1-3.8-5-5.2 4.2-1.5 5.1-5.5Z" fill="#edb6a8"/></svg>`

// Original die-cut illustration shared by the notebook cover on both screen sizes.
export const notebookCat = `<svg class="notebook-cat" aria-hidden="true" viewBox="0 0 270 134" fill="none" stroke="#684a37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="none" fill="#bf9273" opacity=".17"><ellipse cx="133" cy="119" rx="87" ry="6"/><ellipse cx="235" cy="115" rx="21" ry="3.5"/></g>
  <!-- a little roll of gingham tape -->
  <g transform="rotate(-12 43 100)"><path d="M31 92c1-5 7-8 15-7 8 .8 14 4 14 10v9c-.4 7-11 11-20 8-6-2-10-5-10-10Z" fill="#d7e4b8"/>
    <ellipse cx="45" cy="94" rx="14.8" ry="8.7" fill="#e5ebc6"/><ellipse cx="45" cy="94" rx="7.1" ry="3.6" fill="#fcf3d8"/>
    <path d="m34.5 103.2.4 4m4.8-3 .4 5m5.2-4.4.4 5m5-5.4.4 4.5" stroke="#a1ac7b" stroke-width="1.4"/></g>
  <!-- the kitten's curled tail, body, and page -->
  <path d="M167 93q17 8 24-1c4-7 1-14-4-17-3-2-1-8 5-6 15 5 15 23 7 32q-11 13-30 7Z" fill="#e9ab81"/>
  <path d="M183 84q5-2 9-1m-9-7q3-1 6-2" stroke="#b77a55" stroke-width="2.5"/>
  <path d="M114 66c-10 6-17 26-13 38q3 17 28 17l30-1q24-1 27-13c3-13-8-34-20-40Z" fill="#fff2db"/>
  <path d="M121 76q16 11 39-2l13 19-7 13-46 2-9-13Z" fill="#c5d7ab"/>
  <path d="m125 84 4 14 28 .5 5-16" stroke="#72815a" stroke-width="1.7"/>
  <path d="M136 92q7 3 15-.4l-1 8.3q-6 6-13 0Z" fill="#d8e1bc" stroke="#7d8c64" stroke-width="1.3"/>
  <path d="M100 44c-2-8-6-23-1-25q9-3 22 9c10-3 23-4 34-1q12-14 19-13c4 2 5 15 5 26 8 8 9 21 4 29-8 13-24 18-42 18-22 0-41-5-47-16-5-9-4-19 6-27Z" fill="#fff2db"/>
  <path d="M100 26q5 1 12 8l-11 3Z" fill="#eab3a2" stroke="none"/><path d="m159 32 11-11 2 14Z" fill="#eab3a2" stroke="none"/>
  <path d="M144 26q3 8 1 11m6-11q3 6 2 9" stroke="#dca277" stroke-width="3.2"/>
  <g fill="#664633" stroke="none"><ellipse cx="116" cy="55" rx="2.5" ry="3.4" transform="rotate(-7 116 55)"/><ellipse cx="154" cy="53" rx="2.5" ry="3.4"/><path d="M130.8 61q2-2.6 6.7-1 .7 1.6-3.3 3.7-3.3-1.4-3.4-2.7Z"/></g>
  <path d="m134 63.3-.4 2q-2 3.3-5.5 1m5.5-1q1.9 2.9 5.1.5" stroke-width="1.55"/>
  <g fill="#edb5a2" stroke="none"><ellipse cx="106.8" cy="62" rx="6" ry="2.6" transform="rotate(11 106.8 62)"/><ellipse cx="164" cy="59.3" rx="6.3" ry="2.6" transform="rotate(-9 164 59.3)"/></g>
  <path d="m88.5 56.8 9.8 2.4m-9.9 4.5 9.8-.2m75.7-7.7 10-3.9m-9.5 9.2 10.9-.9" stroke-width="1.6"/>
  <!-- a tiny red beret -->
  <g transform="rotate(-13 114 27)"><path d="M94 30c-6-3-4-9 .5-11.4 2.3-5.4 10.2-7.9 17.4-5.8 5.8 0 12.7 4.9 11 11.3-.8 3.5-4.9 4.7-7 5.9Z" fill="#e7a091"/>
    <path d="M96 28q12.5 1.4 25-3.1l-1.7 5.1q-10 4.8-22.2 2.9Z" fill="#d78976"/>
    <path d="M107.6 14q-2.5-5-1.4-6.1 1.7-.7 3.1 1.1l2.2 4.4Z" fill="#cc8c6b"/></g>
  <!-- miniature open journal, pencil, and little paws -->
  <g transform="rotate(4 132 108)"><path d="m69 101 40-12 22 7 28-10 32 17-54 24-54-9Z" fill="#d28f79"/>
    <path d="m69.4 98.4 40.8-12.9q12-1 22 7 9-8 25.8-9.8l31 16.4-51.8 23.5-55.1-9Z" fill="#fff9e9"/>
    <path d="M132.3 93.3q-1 8.2 5.1 26M85.8 100.4l22.6-6.8m-18.9 11.2 22.4-6.4m37.6-2.6 9.2-3.1m-6.8 7.3 12.2-4.1" stroke="#c7ae8f" stroke-width="1.3"/>
    <path d="m154.6 112.9 5.6.1 2.5 4.2 3.9-8.8" fill="#d5dfb3" stroke-width="1.3"/></g>
  <path d="M106.3 87.9q1.3 7.8 6.8 11.4c6.1 3.5 12-2.4 8.1-8.5l-4.1-5.6" fill="#fff1d8"/>
  <g transform="rotate(23 164 81)"><path d="m161.1 65.3.3 31.4 2.6 6.4 2.8-6.1-.1-31Z" fill="#e8ae9d"/><path d="m161.5 96.5 5.3.4-2.9 6.1Z" fill="#f4d6a7"/><path d="m161.4 69.8 5-.1" stroke-width="1.3"/></g>
  <path d="M172.6 86.5c-1.7-7.8-7.6-10.2-11.6-6.2-2.3 2.8-1.3 7.8 2.2 10.1q5.3 3.4 8 .7" fill="#fff1d8"/>
  <!-- cocoa mug on the side -->
  <g transform="rotate(7 226 102)"><path d="M234 98c10-4 14.1 1.7 10.1 7.5-2.5 3.4-5.8 4.3-10.7 3.5l.2-3.7c6.3 1.1 8.8-5.3.6-3.9Z" fill="#e6af9d"/>
    <path d="m213.7 96 22.7-.1-1.3 14c-.8 8.2-18.9 8.4-20.1.6Z" fill="#efc0ac"/><ellipse cx="225.1" cy="96.1" rx="11.4" ry="3.8" fill="#ffebd0"/>
    <path d="M216.7 97q9.1-3.3 16.6.2-7.4 3.5-16.6-.2Z" fill="#af7e55" stroke="none"/>
    <path d="M221.6 107.5c-4-3.9.5-5.4 2.6-2.4 3-3.5 6.3-.1 2.8 2.3l-2.9 2.3Z" fill="#fff4dc" stroke-width=".8"/>
    <path d="M221 88.1q-4-6 .2-11m7 10q3.4-3.4.6-7.2" stroke="#c18f72" stroke-width="1.6"/></g>
  <g fill="#f5da89" stroke-width="1.5"><path d="M58 32q1.2 7 8 8.2-6.7 1.6-8.3 8.2Q56 42.5 50 40q6.3-1.7 8-8Z"/><path d="M210.4 29q1.2 4.3 5.5 5.6-4.7 1.4-5.8 5.3-1.1-4.2-5.2-5.4 4-1.1 5.5-5.5Z"/></g>
  <path d="M38.1 63c-1.9-3-5-2.1-4.5.2.3 2 3.6 3.4 5.4 4 1.2-1.9 3-5.1 1.8-6.5-1-1-2.9.1-2.7 2.3Z" fill="#eeb2a4" stroke-width="1.1"/>
</svg>`

// Small illustrated toast clipped to the bottom of the desktop index.
export const kitchenSketch = `<svg class="kitchen-sketch" aria-hidden="true" viewBox="0 0 174 92" fill="none" stroke="#74553d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="88" cy="78" rx="50" ry="5" fill="#ba9876" opacity=".21" stroke="none"/>
  <g transform="rotate(-10 73 51)"><path d="M44 42C32 26 49 15 71 15c21-2 42 7 31 25l-.2 27.1q-.2 9.3-9.4 9.4H52.6q-9.2 0-9-8.4Z" fill="#e7b77b"/>
  <path d="M49.8 40.4C40 29.7 53 20.5 71 20.8c19-.6 32.1 6.2 23.5 18.2l.3 28.3q0 3.8-4.5 3.9l-36.8-.2q-4.2 0-4-4Z" fill="#fae1ac" stroke="#af8257" stroke-width="1.3"/>
  <g transform="rotate(12 73 38)"><rect x="64" y="29.3" width="18" height="13" rx="4" fill="#efd37b"/><path d="m67 32.4 9-.1" stroke="#fff3b5"/></g>
  <g fill="#74553d" stroke="none"><circle cx="59.5" cy="51" r="2.1"/><circle cx="83" cy="51" r="2.1"/></g>
  <path d="M68 55q3.3 4 7.2-.1"/><path d="m53.6 54.5 5 .4m24-.4 5 .2" stroke="#dc9a87" stroke-width="3"/></g>
  <path d="M119 54q3-19 14-28" stroke="#8a9363"/><path d="M126 38c-9-1-12-6-12-13 7 2 12 6 12 13Zm2-4c1-9 5-14 13-17 .5 7-5 15-13 17Z" fill="#c5d79a"/>
  <path d="m112.4 52.1 20.1-.1-2 19.2q-7.5 5-15.1-.1Z" fill="#edb3a1"/><rect x="111" y="49.9" width="23" height="6.4" rx="2.8" fill="#f2c5b3"/>
  <path d="M34 17q.8 4.1 5.2 5.4-3.9.8-5.4 5.2-1.3-4-5.2-5.2 4.1-1.2 5.4-5.4Z" fill="#f4d37e" stroke-width="1.3"/>
</svg>`
