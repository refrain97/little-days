import { extractEntry, inferDining } from './journal.js'

const futureAction =
  /(?:提醒我|别忘了?|记得要|记一下要|记得|准备(?!好|了|完)|打算|计划|约好|想找|想要|(?:我|以后|一直|周末|明天|下次)?想(?:去|做|试|买|学|听|看|约|送|带|吃|喝|玩|逛)|找个(?:时间|晴天|周末|空闲)|有空(?:要|想|去|再)|(?:周末|明天|后天|下周[一二三四五六日天末]?|星期[一二三四五六日天]|下个?月|这个月|今晚|明早|下次|改天).{0,12}(?:去|买|做|约|吃|喝|见|看|提醒|带|送|洗|听|野餐)|^(?:我要|要去|待办|愿望|约会|约.{1,10}(?:见面|吃饭)|买.{0,6}礼物|洗鞋|洗.{0,3}鞋子|给.{1,12}(?:买|送)|预约|取快递))/u
const experienced =
  /(?:刚才|刚刚|刚去|昨天|前天|(?:吃|喝|做|去了?|点|买|洗|看|逛|送|玩|见面|散步|野餐)(?:完了?|过|了)|觉得|真好吃|真好喝|不合口味)/u
const task =
  /待办|提醒|要记得|别忘|记得|要买|买.{0,6}礼物|洗.{0,4}鞋|预约|取快递|缴费|交费|归还|打扫/u

function dayString(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, i) => (i === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-')
}

function planDate(text, now) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const monthDay = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/u)
  if (monthDay) {
    const month = Number(monthDay[2]) - 1,
      date = Number(monthDay[3])
    let target = new Date(
      Number(monthDay[1]) || day.getFullYear(),
      month,
      date,
      12,
    )
    if (!monthDay[1] && target < day)
      target.setFullYear(target.getFullYear() + 1)
    if (target.getMonth() === month && target.getDate() === date)
      return dayString(target)
  }
  const relative = text.match(/后天|明天|明早|明晚|今天|今晚/u)
  if (relative) {
    day.setDate(
      day.getDate() +
        (relative[0] === '后天' ? 2 : relative[0][0] === '明' ? 1 : 0),
    )
    return dayString(day)
  }
  const week = text.match(/(下|本|这)?(?:星期|周)([一二三四五六日天])/u)
  if (week) {
    const target = '一二三四五六日'.indexOf(week[2].replace('天', '日'))
    const current = (day.getDay() + 6) % 7
    let offset = target - current
    if (week[1] === '下' || (!week[1] && offset < 0)) offset += 7
    day.setDate(day.getDate() + offset)
    return dayString(day)
  }
  return ''
}

// Separate a remembered meal from a future activity. A later “下次还想吃”
// can be feedback about the meal that was just described.
export function quickNoteDraft(input, venues = [], now = new Date()) {
  const text = String(input || '').trim()
  const clauses = text
    .split(/[，。！？!?；;,\n]/u)
    .map((part) => part.trim())
    .filter(Boolean)
  const first =
    /^(?:明天|后天|周末|今晚|下周[一二三四五六日天末]?|这个周末)$/u.test(
      clauses[0],
    )
      ? clauses.slice(0, 2).join('')
      : clauses[0] || ''
  const future = futureAction.exec(first)
  const past = experienced.exec(first)
  const isPlan = Boolean(
    future && (!past || future.index + future[0].length <= past.index),
  )
  const parsed = extractEntry(text)
  const isBreakfast =
    /早餐|早饭|早点(?:吃|是|摊)|早上(?:在家|在.{1,12}(?:店|咖啡|面馆))?(?:吃|喝|做|煮|烤|煎)/u.test(
      text,
    )
  const dining = inferDining(text, venues)
  return {
    target: isPlan ? 'plan' : 'entry',
    entry: {
      ...parsed,
      ...dining,
      category:
        isBreakfast && parsed.category === '回忆' ? '美食' : parsed.category,
      text,
      isBreakfast,
      source: 'text',
    },
    plan: {
      title: text,
      kind: task.test(text) ? 'chore' : 'wish',
      date: planDate(text, now),
      setting: /去|出门|野餐|约会|郊游|见面/u.test(text) ? 'out' : 'any',
    },
  }
}
