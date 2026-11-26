// Use the browser's actual encode support; an iPhone may offer MP4/AAC while
// another device supports only WebM. Some encoders fail only at start().
const audioFormats = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
]

export function startAudioRecorder(
  stream,
  attach,
  Recorder = globalThis.MediaRecorder,
) {
  const supported =
    typeof Recorder.isTypeSupported === 'function'
      ? audioFormats.filter((type) => Recorder.isTypeSupported(type))
      : []
  for (const mimeType of [...supported, '']) {
    let recorder
    try {
      recorder = mimeType
        ? new Recorder(stream, { mimeType })
        : new Recorder(stream)
      attach(recorder, mimeType)
      recorder.start(500)
      return recorder
    } catch (error) {
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        if (recorder.state === 'recording') recorder.stop()
      }
      if (!mimeType || !['NotSupportedError', 'TypeError'].includes(error.name))
        throw error
    }
  }
}

export async function recordingType(blob, hint = '', filename = '') {
  for (const value of [blob.type, hint]) {
    const type = value?.toLowerCase().replace(/\s+/g, '')
    if (
      /^(?:audio\/[\w.+-]+|video\/(?:mp4|webm)|application\/ogg)(?:;[\w.+=",-]+)*$/u.test(
        type,
      )
    )
      return type.includes(',') ? type.split(';')[0] : type
  }
  // Safari's file picker sometimes returns an empty MIME type for voice memos.
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  const chars = String.fromCharCode(...bytes)
  if (chars.slice(4, 8) === 'ftyp') return 'audio/mp4'
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'audio/aac'
  if (chars.startsWith('OggS')) return 'audio/ogg'
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return 'audio/webm'
  if (chars.startsWith('RIFF') && chars.slice(8, 12) === 'WAVE')
    return 'audio/wav'
  const extension = filename.split('.').at(-1)?.toLowerCase()
  return (
    {
      aac: 'audio/aac',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      caf: 'audio/x-caf',
      webm: 'audio/webm',
    }[extension] || 'application/octet-stream'
  )
}
