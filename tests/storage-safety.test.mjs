import assert from 'node:assert/strict'
import test from 'node:test'
import {mediaAttributes} from '../src/media-store.js'

test('gallery accepts device media and bundled examples while rejecting external image sources', () => {
  assert.match(mediaAttributes('/__little_days_media__/entry/image/id'), /^data-local-media=/)
  assert.match(mediaAttributes('/images/hero.jpg'), /^src=/)
  for (const url of [
    'https://raw.githubusercontent.com/example/private/main/shared/photos/test.jpg',
    'https://example.invalid/test.jpg', '//example.invalid/test.jpg', '/images/../private',
    '/__little_days_media__/entry/audio/old', 'data:audio/aac;base64,AQID',
  ]) assert.equal(mediaAttributes(url), '')
})

test('an unavailable journal database rejects writes without touching legacy localStorage data', async () => {
  const originals = new Map()
  const replacement = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis,key))
    Object.defineProperty(globalThis,key,{configurable:true,value})
  }
  const writes=[]
  try {
    replacement('BroadcastChannel',undefined)
    replacement('indexedDB',undefined)
    replacement('localStorage',{setItem:(...args)=>writes.push(args),removeItem:key=>writes.push([key])})
    const {putRecord,removeRecord,toggleRecordFavorite,replaceRecords}=await import('../src/storage.js')
    const {putPlan}=await import('../src/plans.js')
    for (const visibility of ['shared','private']) {
      await assert.rejects(putRecord({visibility,title:'测试手记'}),/IndexedDB/)
      await assert.rejects(putPlan({visibility,title:'测试事项'}),/IndexedDB/)
    }
    await assert.rejects(removeRecord('example'),/IndexedDB/)
    await assert.rejects(toggleRecordFavorite('example'),/IndexedDB/)
    await assert.rejects(replaceRecords([],()=>{throw Error('unexpected write')}),/IndexedDB/)
    assert.deepEqual(writes,[])
  } finally {
    for(const [key,desc] of originals) {
      if (desc) Object.defineProperty(globalThis,key,desc)
      else delete globalThis[key]
    }
  }
})

test('venue totals follow the records visible on each device while shared grouping omits private visits', async () => {
  const { createEntry, groupVenues } = await import('../src/journal.js')
  const visit = (id, visibility, venueName, rating) => createEntry({
    id, isSample: false, title: '面', category: '美食', diningSource: 'out',
    venueName, visibility, rating, createdAt: '2026-05-01T12:30:00Z',
  })
  const shared = visit('together', 'shared', '松间面馆', 4)
  const a = [shared, visit('a-private', 'private', '松间', 2), visit('secret', 'private', '另一家', 1)]
  const b = [shared, visit('b-private', 'private', '松间面馆', 5)]
  const profiles = [{id:'one', name:'松间面馆', aliases:['松间']}]
  const totals = rows => rows.map(({name, rating, entries}) => [name, rating, entries.length]).sort()
  assert.deepEqual(totals(groupVenues(a, profiles, {includePrivate:true})), [['另一家',1,1],['松间面馆',3,2]])
  assert.deepEqual(totals(groupVenues(b, profiles, {includePrivate:true})), [['松间面馆',4.5,2]])
  for (const device of [a,b]) assert.deepEqual(totals(groupVenues(device, profiles)), [['松间面馆',4,1]])
})

test('legacy dictation retains its original words and photo without an attachment field', async () => {
  const { createEntry } = await import('../src/journal.js')
  const saved = { id: 'old-note', source: 'voice', audio: 'data:audio/aac;base64,AQID', text: '我的原话' }
  for (const [image, source] of [['', 'text'], ['/images/hero.webp', 'photo']]) {
    const entry = createEntry({ ...saved, image })
    assert.equal(entry.text, saved.text)
    assert.equal(entry.source, source)
    assert.equal(entry.originalTextUnverified, undefined)
    assert(!Object.hasOwn(entry, 'audio'))
  }
})
