import test from 'node:test'
import assert from 'node:assert/strict'
import { recordingType, startAudioRecorder } from '../src/audio-recorder.js'

test('MP4 and AAC recording negotiate the available encoder and fall back if start rejects it', () => {
  const order = []
  class Recorder {
    static isTypeSupported(type) {
      return ['audio/mp4', 'audio/aac'].includes(type)
    }
    constructor(_, options) {
      this.mimeType = options.mimeType
    }
    start() {
      order.push(this.mimeType)
      if (this.mimeType === 'audio/mp4')
        throw new DOMException('unavailable', 'NotSupportedError')
    }
  }
  const recorder = startAudioRecorder(
    {},
    (current, format) => {
      assert.equal(current.mimeType, format)
    },
    Recorder,
  )
  assert.deepEqual(order, ['audio/mp4', 'audio/aac'])
  assert.equal(recorder.mimeType, 'audio/aac')
})

test('recorders with no MIME probing can use their native defaults', () => {
  class Recorder {
    constructor(_, options) {
      assert.equal(options, undefined)
    }
    start() {
      this.state = 'recording'
    }
  }
  assert.equal(startAudioRecorder({}, () => {}, Recorder).state, 'recording')
})

test('preserve audio format when a recorder or the file picker omits the MIME type', async () => {
  assert.equal(
    await recordingType(new Blob([new Uint8Array([255, 241, 0])])),
    'audio/aac',
  )
  assert.equal(
    await recordingType(
      new Blob([new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112])]),
    ),
    'audio/mp4',
  )
  assert.equal(await recordingType(new Blob([]), '', '录音.M4A'), 'audio/mp4')
  assert.equal(
    await recordingType(new Blob([], { type: 'audio/webm; codecs=opus' })),
    'audio/webm;codecs=opus',
  )
})
