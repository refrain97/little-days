import { stickerActor } from './cloud-profile.js'
import { icon } from './icons.js'
import { animalIcon, cleanReactions, stampOptions } from './stickers.js'

// These two collections share the journal sticker vocabulary and per-person toggle.
export function itemStamps(row, kind) {
  if (row.visibility !== 'shared') return ''
  const reactions = cleanReactions(row.reactions).filter((r) => r.stamp)
  const category = kind === 'breakfast' ? '美食' : '回忆'
  const label = reactions.length
    ? reactions.map((r) => animalIcon(r.actor.animal, 20)).join('') +
      ' ' +
      reactions.length +
      ' 枚回应'
    : '+ 盖个章'
  return `<details class="item-stamps"><summary>${label}</summary>${stampOptions({ ...row, category }, stickerActor(), icon, `data-stamp-kind="${kind}"`)}</details>`
}
