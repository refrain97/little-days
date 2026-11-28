// Only the v1 migration recognizes recordings. Current documents have photo attachments only.
export const legacyRecordingFile = /^shared\/audio\/[a-f0-9]{40}\.bin$/
const recordingField =
  /^(?:audio(?:Key|Path|Type|Blob|Data|Base64|MimeType)?|cloudAudioPath)$/i

function stripRecordingFields(value) {
  if (Array.isArray(value)) return value.map(stripRecordingFields)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !recordingField.test(key))
      .map(([key, field]) => [key, stripRecordingFields(field)]),
  )
}

function updateSource(data, hasPhoto) {
  if (data?.source !== 'voice') return
  data.source = hasPhoto ? 'photo' : 'text'
  if (hasPhoto && data.text && !Object.hasOwn(data, 'photoDescription'))
    data.photoDescription = ''
}

export function migrateSharedDocument(doc) {
  const clean = stripRecordingFields(doc)
  const record = clean.record || clean
  updateSource(record.data, Boolean(record.photoPath))
  return clean
}

export function migrateSyncState(state) {
  if (state.version === 2) return state
  // Keep the merge base (and pending withdrawals/restores), even on an offline device.
  const base = {}
  for (const [key, row] of Object.entries(state.base || {})) {
    const saved = stripRecordingFields(row)
    updateSource(saved.wire?.data, Boolean(saved.wire?.photoPath))
    if (row.localDigest) {
      // v1 used [metadata, photo key, recording key, optional thumbnail key].
      const [metadata, photo, , thumb = ''] = JSON.parse(row.localDigest)
      const data = stripRecordingFields(metadata)
      updateSource(data, Boolean(photo))
      saved.localDigest = JSON.stringify([data, photo || '', thumb])
    }
    base[key] = saved
  }
  const migrated = {
    ...state,
    version: 2,
    base,
    trash: stripRecordingFields(state.trash || []),
  }
  // A v1 inventory can contain recording filenames and an old format marker.
  delete migrated.inventory
  return migrated
}
