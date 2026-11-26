import assert from 'node:assert/strict'
import test from 'node:test'
import {mediaAttributes} from '../src/media-store.js'

test('gallery accepts device media and bundled examples while rejecting external image sources', () => {
  assert.match(mediaAttributes('/__little_days_media__/entry/image/id'), /^data-local-media=/)
  assert.match(mediaAttributes('/images/hero.jpg'), /^src=/)
  for (const url of [
    'https://raw.githubusercontent.com/example/private/main/shared/photos/test.jpg',
    'https://example.invalid/test.jpg', '//example.invalid/test.jpg', '/images/../private',
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
