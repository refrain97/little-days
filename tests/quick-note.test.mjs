import assert from 'node:assert/strict'
import test from 'node:test'
import { quickNoteDraft } from '../src/quick-note-draft.js'

test('quick notes keep the original words and extract dining and breakfast details', () => {
  const text = '早餐在山间咖啡喝了冰拿铁，特别好喝'
  const { target, entry } = quickNoteDraft(text, ['山间咖啡'])
  assert.equal(target, 'entry')
  assert.equal(entry.text, text)
  assert.equal(entry.category, '饮品')
  assert.equal(entry.source, 'text')
  assert.equal(entry.diningSource, 'out')
  assert.equal(entry.venueName, '山间咖啡')
  assert.equal(entry.isBreakfast, true)
  assert.equal(entry.taste, '好吃')
  assert.deepEqual(
    [
      entry.title,
      quickNoteDraft('午饭自己做了番茄炒蛋，特别好吃').entry.diningSource,
    ],
    ['冰拿铁', 'home'],
  )
})

test('intentions and reminders enter the free-time list, completed memories stay in the journal', () => {
  const now = new Date(2026, 10, 29, 20)
  const reminder = quickNoteDraft('明天提醒我洗鞋', [], now)
  assert.equal(reminder.target, 'plan')
  assert.equal(reminder.plan.date, '2026-11-30')
  assert.equal(reminder.plan.kind, 'chore')
  for (const words of [
    '找个晴天去河边野餐',
    '想喝咖啡',
    '睡前提醒我给花浇水',
  ]) {
    assert.equal(quickNoteDraft(words).target, 'plan', words)
  }
  for (const words of [
    '今天的晚风很舒服',
    '给小林买了生日礼物',
    '这家店真好吃，下次还想吃',
  ]) {
    assert.equal(quickNoteDraft(words).target, 'entry', words)
  }
})
