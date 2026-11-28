import { recordingType, startAudioRecorder } from './audio-recorder.js'

function within(promise, ms) {
  if (!promise) return Promise.resolve()
  let timer
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

export function quickListener({ onChange, onWords }) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition
  const hasLocalSpeech = Boolean(Speech && 'processLocally' in Speech.prototype)
  let stream, recorder, speech, speechEnded, audioEnded, stopping
  let audio = null,
    accepting = true,
    disposed = false,
    recording = false,
    transcribing = false
  let micHint = '',
    speechHint = '',
    capturedWords = ''
  function update() {
    if (!disposed) onChange({ recording, transcribing, micHint, speechHint })
  }
  function releaseMic() {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
  }
  function stopSpeech(abort = false) {
    try {
      if (abort) speech?.abort()
      else speech?.stop()
    } catch {
      /* Safari may already have ended the session. */
    }
  }
  function startSpeech(local) {
    if (!Speech || speech || !accepting || disposed) return false
    let engine
    try {
      engine = new Speech()
      if (local && !hasLocalSpeech) return false
      if (hasLocalSpeech) engine.processLocally = local
      engine.lang = 'zh-CN'
      engine.continuous = true
      engine.interimResults = true
      let ended
      speechEnded = new Promise((resolve) => {
        ended = resolve
      })
      speech = engine
      const previouslyHeard = capturedWords
      engine.onstart = () => {
        if (disposed || !accepting || speech !== engine) return
        transcribing = true
        speechHint = ''
        update()
      }
      engine.onresult = (event) => {
        if (disposed || speech !== engine) return
        const result = Array.from(
          event.results,
          (item) => item[0]?.transcript || '',
        )
          .join('')
          .trim()
        if (result) {
          capturedWords = previouslyHeard
            ? previouslyHeard + '\n' + result
            : result
          onWords(capturedWords)
        }
      }
      engine.onerror = (event) => {
        if (disposed || event.error === 'aborted' || speech !== engine) return
        speech = null
        transcribing = false
        ended()
        speechHint =
          event.error === 'not-allowed'
            ? '浏览器听写未获授权。'
            : '这次听写暂不可用。'
        update()
      }
      engine.onend = () => {
        ended()
        if (speech !== engine) return
        speech = null
        transcribing = false
        update()
      }
      engine.start()
      return true
    } catch {
      speech = null
      speechEnded = null
      transcribing = false
      speechHint = '这次听写暂不可用。'
      update()
      return false
    }
  }
  async function startMic() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      micHint = '此浏览器无法录下原声。'
      update()
      return
    }
    try {
      const granted = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!accepting || disposed) {
        granted.getTracks().forEach((track) => track.stop())
        return
      }
      stream = granted
      recorder = startAudioRecorder(granted, (instance, hint) => {
        const chunks = []
        let ended
        audioEnded = new Promise((resolve) => {
          ended = resolve
        })
        instance.ondataavailable = (event) => {
          if (!disposed && event.data.size) chunks.push(event.data)
        }
        instance.onerror = () => {
          micHint = '麦克风录音中断。'
          recording = false
          update()
        }
        instance.onstop = async () => {
          recording = false
          releaseMic()
          try {
            if (disposed || !chunks.length) return
            const blob = new Blob(chunks, { type: chunks[0].type })
            const type = await recordingType(blob, instance.mimeType || hint)
            if (!disposed) audio = blob.slice(0, blob.size, type)
          } catch {
            micHint = '原声读取失败，仍可留下文字。'
          } finally {
            chunks.length = 0
            ended()
            update()
          }
        }
      })
      recording = true
    } catch (error) {
      releaseMic()
      audioEnded = null
      micHint =
        error.name === 'NotAllowedError'
          ? '麦克风未获授权。'
          : '麦克风暂不可用。'
    }
    update()
  }
  async function finish() {
    accepting = false
    stopSpeech()
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        releaseMic()
      }
    }
    await Promise.all([within(speechEnded, 1100), within(audioEnded, 2200)])
    if (speech) stopSpeech(true)
    releaseMic()
    return audio
  }
  return {
    hasLocalSpeech,
    hasSpeech: Boolean(Speech),
    startMic,
    startSpeech,
    stopSpeech,
    stop() {
      return (stopping ||= finish())
    },
    dispose() {
      disposed = true
      accepting = false
      stopSpeech(true)
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          /* Already stopped. */
        }
      }
      releaseMic()
    },
  }
}
