import {createEntry, authorship} from './journal.js'
import {normalPlan} from './plans.js'
import {sharedLocalState,readSharedAttachment,applyCloudObject,normalizePlace,onExternalChange} from './storage.js'
import {isLocalMedia,blobDataUrl,dataMediaType} from './media-store.js'
import {assetPath} from './paths.js'
import {compressJournalPhoto} from './device-ai.js'
import {validateBackup} from './backup.js'

const recordFields=['id','visibility','isSample','title','category','diningSource','venueName','createdAt','text','notes','rating','taste','favorite','ingredients','steps','feeling','source','photoDescription','originalTextUnverified']
const planFields=['id','visibility','title','kind','setting','date','sourceEntryId','createdAt','updatedAt','doneAt']
const stepFields=['id','key','planId','title','planTitle','kind','setting','date','stage','year','eventDate','doneAt','sourceEntryId','visibility']
const placeFields=['id','visibility','name','aliases']
const sample=id=>typeof id==='string' && (id.startsWith('sample-') || id.startsWith('idea-'))
const builtInPhoto=path=>/^\/images\/[a-zA-Z0-9_-]+\.(?:webp|jpe?g|png)$/i.test(path)
const pick=(obj,fields)=>Object.fromEntries(fields.filter(f=>obj[f]!==undefined).map(f=>[f,obj[f]]))

function privacy(records,plans) {
  const entries=new Set(records.filter(r=>r.visibility==='private').map(r=>r.id))
  const freetime=new Set(plans.filter(p=>p.visibility==='private').map(p=>p.id))
  // A completed plan's journal key embeds its source. A linked task can also
  // refer to a journal produced from an earlier, private task.
  let changed
  do {
    const size=entries.size+freetime.size
    for (const p of plans) if ([p,...(p.completions||[]),...(p.reopened||[])].some(r=>entries.has(r.sourceEntryId))) freetime.add(p.id)
    for (const r of records) if(r.id.startsWith('plan-note-')) {
      for(const id of freetime) if(r.id.startsWith('plan-note-'+encodeURIComponent(id)+':')) {entries.add(r.id);break}
    }
    changed=size!==entries.size+freetime.size
  }while(changed)
  return {entries,freetime,places:new Set()}
}

function cleanStep(row) {
  return {...pick(row,stepFields),...authorship(row),visibility:'shared'}
}
function metadata(kind,row) {
  if(kind==='entries')return {...pick(createEntry(row),recordFields),...authorship(row),visibility:'shared',isSample:false}
  if(kind==='places')return {...pick(normalizePlace(row),placeFields),...authorship(row),visibility:'shared'}
  const p=normalPlan(row)
  return {...pick(p,planFields),...authorship(row),visibility:'shared',completions:p.completions.map(cleanStep),reopened:p.reopened.map(cleanStep)}
}
function entity(kind,row) {
  const result={kind,id:row.id,data:metadata(kind,row)}
  if(kind==='entries'){
    if (isLocalMedia(row.image) || builtInPhoto(row.image)) result.photoKey=row.image
    if (isLocalMedia(row.audio)) result.audioKey=row.audio
  }
  return result
}
function same(a,b) {
  if(a===b)return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
  const keys=Object.keys(a)
  return keys.length===Object.keys(b).length && keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]))
}

export function onCloudLocalChange(callback) {
  let pending=false
  const signal=()=>{if(!pending){pending=true;queueMicrotask(()=>{pending=false;callback()})}}
  globalThis.addEventListener?.('little-days-local-edit',signal)
  const stop=onExternalChange(event=>{if(event!=='cloud')signal()})
  return ()=>{stop();globalThis.removeEventListener?.('little-days-local-edit',signal)}
}

export function createCloudAdapter() {
  async function snapshot() {
    const state=await sharedLocalState(), restricted=privacy(state.entries,state.freetime)
    const entities=[],privateKeys=[]
    for(const kind of ['entries','places','freetime']){
      for(const row of state[kind]){
        if(row.isSample || sample(row.id)) continue
        if(restricted[kind].has(row.id) || row.visibility==='private') privateKeys.push({kind,id:row.id})
        else entities.push(entity(kind,row))
      }
    }
    const visiblePlaces = new Set(state.places.map(p=>p.id))
    for(const id of state.withdrawn) if(!visiblePlaces.has(id)) privateKeys.push({kind:'places',id})
    return {entities,privateKeys}
  }
  async function requireCurrent(expected) {
    const {entities}=await snapshot()
    if(!same(entities.find(v=>v.kind===expected.kind&&v.id===expected.id),expected))
      throw new Error('共享内容在读取时已改变，请重新同步。')
  }
  async function attachment(expected,kind) {
    if(expected.kind!=='entries')return null
    const key=kind==='image'?expected.photoKey:expected.audioKey
    if(!key)return null
    await requireCurrent(expected)
    let value=await readSharedAttachment(expected.id,kind,key)
    if(typeof value==='string' && builtInPhoto(value)){
      const response=await fetch(assetPath(value))
      if(!response.ok)throw new Error('无法读取内置照片。')
      value=await response.blob()
    }
    const data=kind==='image' ? await compressJournalPhoto(value) : value instanceof Blob ? await blobDataUrl(value) : value
    if(!dataMediaType(data,kind))throw new Error('共享附件格式无效。')
    await requireCurrent(expected)
    return data
  }
  async function apply({kind,id,data,photoPath,audioPath,readPhoto,readAudio,expected,keepPhoto=false,keepAudio=false}) {
    if(!['entries','places','freetime'].includes(kind) || typeof id!=='string'||!id||sample(id))return false
    const accepts=(current,records,plans,withdrawn)=>{
      if(kind==='places'&&!current&&withdrawn.includes(id))return false
      const restricted=privacy(records,plans)
      if(current?.isSample || current?.visibility==='private'||restricted[kind].has(id))return false
      if(kind==='freetime' && data && [data,...(data.completions||[]),...(data.reopened||[])].some(r=>restricted.entries.has(r.sourceEntryId)))return false
      return same(current?entity(kind,current):null,expected||null)
    }
    let value=null
    if(data!=null){
      if(data.visibility!=='shared'||data.isSample || (data.id && data.id!==id))return false
      const wire={...data,id,visibility:'shared'}
      if(kind==='entries'){
        keepPhoto=Boolean(keepPhoto && photoPath && expected?.photoKey)
        keepAudio=Boolean(keepAudio && audioPath && expected?.audioKey)
        const image=photoPath && !keepPhoto ? await readPhoto() : '', audio=audioPath && !keepAudio ? await readAudio() : ''
        if((photoPath&&!keepPhoto&&!dataMediaType(image,'image')) || (audioPath&&!keepAudio&&!dataMediaType(audio,'audio')))throw new Error('云端附件尚未完整读取。')
        value={...pick(wire,recordFields),...authorship(wire),isSample:false,image,audio}
      }else if(kind==='freetime'){
        if(!Array.isArray(wire.completions)||!Array.isArray(wire.reopened))throw new Error('云端清单格式无效。')
        value={...pick(wire,planFields),...authorship(wire),completions:wire.completions.map(cleanStep),reopened:wire.reopened.map(cleanStep)}
      }else value=normalizePlace({...pick(wire,placeFields),...authorship(wire)})
      validateBackup({format:'little-days-backup',version:1,exportedAt:new Date().toISOString(),preferences:{},generation:'',
        records:kind==='entries'?[value]:[],places:kind==='places'?[value]:[],plans:kind==='freetime'?[value]:[]})
    }
    return applyCloudObject(kind,id,value,accepts,{cloudPhotoPath:photoPath,cloudAudioPath:audioPath,keepPhoto,keepAudio})
  }
  return {snapshot,apply,readPhoto:item=>attachment(item,'image'),readAudio:item=>attachment(item,'audio')}
}
