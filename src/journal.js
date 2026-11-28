import { cleanStickerAuthor, cleanReactions } from './stickers.js'

import { breakfastFields } from './breakfast-model.js'
export const CATEGORIES = ['美食', '饮品', '灵感', '回忆']

const tastes = ['', '好吃', '一般', '不合口味']

const dishNames = [
  ['番茄炒蛋', /(?:番茄|西红柿)炒(?:鸡)?蛋|(?:鸡)?蛋炒(?:西红柿|番茄)/],
  ['番茄鸡蛋面', /(?:番茄|西红柿)(?:鸡)?蛋面/],
  ['葱油拌面', /葱油(?:拌)?面/],
  ['牛油果吐司', /牛油果.{0,3}(?:吐司|土司)/],
  ['煎蛋吐司', /煎蛋.{0,3}(?:吐司|土司)/],
  ['冰拿铁', /冰(?:的)?拿铁|冰咖啡拿铁/],
  ['燕麦拿铁', /燕麦(?:奶)?拿铁/],
  ['手冲咖啡', /手冲(?:咖啡)?/],
  ['柠檬茶', /柠檬(?:红|绿)?茶/],
  ['蛋炒饭', /蛋炒饭/],
  ['可乐鸡翅', /可乐鸡翅/],
  ['麻婆豆腐', /麻婆豆腐/],
  ['拍黄瓜', /拍黄瓜/],
  ['红烧肉', /红烧肉/],
  ...[
    '鱼香肉丝',
    '宫保鸡丁',
    '红烧排骨',
    '糖醋排骨',
    '青椒肉丝',
    '青椒炒肉',
    '辣椒炒肉',
    '酸辣土豆丝',
    '土豆炖牛肉',
    '咖喱鸡',
    '咖喱饭',
    '虾仁炒蛋',
    '清蒸鲈鱼',
    '蒸水蛋',
    '紫菜蛋花汤',
    '凉拌黄瓜',
    '小鸡炖蘑菇',
    '香菇滑鸡',
    '蒜蓉西兰花',
    '红烧茄子',
    '水煮肉片',
    '豆角焖面',
    '韭菜盒子',
    '油泼面',
    '麻酱拌面',
    '螺蛳粉',
    '酸辣粉',
    '炸酱面',
    '扬州炒饭',
    '海南鸡饭',
    '皮蛋瘦肉粥',
    '馄饨',
    '蛋包饭',
    '三文鱼饭团',
    '生椰拿铁',
    '冷萃咖啡',
    '抹茶拿铁',
    '杨枝甘露',
    '酸梅汤',
  ].map((name) => [name, new RegExp(name)]),
]

const ingredientNames = [
  ['番茄', /番茄|西红柿/],
  ['鸡蛋', /鸡蛋|番茄炒蛋|蛋液|炒蛋|蛋炒|煎蛋|西红柿炒蛋/],
  ['牛油果', /牛油果|鳄梨/],
  ['吐司', /吐司|土司/],
  ['咖啡', /咖啡|浓缩|意式浓缩/],
  ['燕麦奶', /燕麦奶/],
  ['牛奶', /牛奶|鲜奶/],
  ['冰块', /冰块/],
  ['面条', /面条|挂面|拉面|拌面|鸡蛋面/],
  ['米饭', /米饭|炒饭/],
  ['青葱', /青葱|小葱|葱花|香葱|葱段|葱油/],
  ['姜', /生姜|姜片|姜丝/],
  ['蒜', /大蒜|蒜末|蒜瓣|蒜蓉|蒜香/],
  ['柠檬', /柠檬/],
  ['豆腐', /豆腐/],
  ['鸡翅', /鸡翅/],
  ['鸡肉', /鸡肉|鸡胸|鸡腿|鸡丁|咖喱鸡|滑鸡|小鸡/],
  ['牛肉', /牛肉/],
  ['猪肉', /猪肉|五花肉/],
  ['虾', /大虾|鲜虾|虾仁/],
  ['黄瓜', /黄瓜/],
  ['土豆', /土豆|马铃薯/],
  ['胡萝卜', /胡萝卜/],
  ['西兰花', /西兰花/],
  ['青椒', /青椒/],
  ['香菇', /香菇/],
  ['蘑菇', /蘑菇/],
  ['菠菜', /菠菜/],
  ['生菜', /生菜/],
  ['燕麦', /燕麦(?!奶)/],
  ['蜂蜜', /蜂蜜/],
  ['香蕉', /香蕉/],
  ['草莓', /草莓/],
  ['芝士', /芝士|奶酪/],
  ['黄油', /黄油/],
  ['生抽', /生抽/],
  ['排骨', /排骨/],
  ['鸡蛋', /蛋花|蛋饼|蛋羹|水蛋|蛋包饭/],
  ['鲈鱼', /鲈鱼/],
  ...[
    '洋葱',
    '茄子',
    '豆角',
    '韭菜',
    '芹菜',
    '大白菜',
    '小白菜',
    '娃娃菜',
    '冬瓜',
    '南瓜',
    '丝瓜',
    '莲藕',
    '紫菜',
    '玉米',
    '山药',
    '豌豆',
    '毛豆',
    '木耳',
    '金针菇',
    '彩椒',
    '辣椒',
    '香菜',
    '花生',
    '芝麻',
    '三文鱼',
    '鳕鱼',
    '鱿鱼',
    '贝果',
    '米粉',
    '椰奶',
    '豆浆',
    '酸奶',
    '奶油',
    '苹果',
    '芒果',
    '橙子',
    '蓝莓',
    '菠萝',
    '西瓜',
    '豆瓣酱',
    '蚝油',
    '老抽',
    '陈醋',
    '料酒',
    '黑胡椒',
    '咖喱',
  ].map((name) => [name, new RegExp(name)]),
]

const drinkWords =
  /咖啡|拿铁|美式|卡布奇诺|茶饮|奶茶|红茶|绿茶|乌龙|果茶|抹茶|花茶|柠檬茶|果汁|汽水|气泡水|饮料|饮品|豆浆|奶昔|冰沙|啤酒|葡萄酒|鸡尾酒|冷萃|杨枝甘露|酸梅汤|好喝/
const foodWords =
  /午餐|早餐|晚餐|午饭|晚饭|下厨|食谱|菜谱|美食|食材|好吃|美味|口感|炒菜|拌面|饭团|馄饨|饺子|意面|披萨|三明治|沙拉|蛋糕|饼干|面包|烤肉|火锅|煎饼|寿司|馒头|粥/
const ideaWords =
  /灵感|点子|想法|突然想到|想到一个|想试试|下次想|想做一个|脑洞|不妨试/
const feelingWords =
  /喜欢|觉得|感觉|开心|舒服|治愈|满足|惊喜|好吃|好喝|好看|美味|鲜美|酸甜|酥脆|美好|难忘|难吃|难喝|不合口味|一般般|不喜欢|香极了|很香|好香|不错|太咸|太甜|有点咸|有点腻/
const stepWords =
  /^(?:首先|第一步|接着|然后|随后|最后|(?:先|再)(?:把|将|炒|加|放|切|煎|煮|打|倒|撒|蒸|烤|焖|拌|腌|洗|泡|煸|炖|淋)|把.{0,10}(?:切|倒|煮|炒|煎|拌|放|打|腌|烤|蒸))|(?:切成|切块|切片|切丁|打散|热锅|热油|倒入|倒进|加入|焯水|沥干|翻炒|翻面|搅拌|煮开|煮熟|煮软|炖煮|煎至|出锅|收汁|装盘|冲泡|萃取|打奶泡)/
const truncate = (value, length) => Array.from(value).slice(0, length).join('')
const isDining = (category) => category === '美食' || category === '饮品'
const originalSamples = new Map()

function venueDisplayName(value) {
  return String(value ?? '')
    .trim()
    .replace(/^[「『“"](.+)[」』”"]$/u, '$1')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function venueKey(name) {
  return venueDisplayName(name)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[‐‑–—]/gu, '-')
}

const placeEnding =
  '(?:咖啡馆|咖啡厅|咖啡店|咖啡|面馆|餐厅|饭馆|饭店|餐馆|茶馆|茶室|酒馆|酒家|食府|食堂|小厨|小馆|茶铺|面庄|居酒屋|料理店|店|麦当劳|肯德基|星巴克|瑞幸|海底捞)'
const placeName = `[\\p{L}\\p{N}·&\\- ]{0,28}?${placeEnding}(?:[（(][^（）()，。]{1,16}[）)])?`
const locatedPlace = new RegExp(
  `(?:在|去了?|来到|(?<![喝吃买看尝找闻学梦听拿拍见做收得])到了?|从|探店|打卡了?)\\s*(${placeName})(?=\\s*(?:吃|喝|点|尝|买|用餐|堂食|外带|打包|叫|订|的|里|$))`,
  'iu',
)
const namedDishPlace = new RegExp(
  `^(${placeName})的(?=.{0,12}(?:面|饭|菜|汤|包|饼|粉|茶|拿铁|咖啡|甜点|饮品))`,
  'iu',
)
// Ordering a specific item provides enough evidence for a name like “萨莉亚”
// even on a first visit. Everyday locations aren't business names.
const orderedAt =
  /(?:在|去了?|来到|到)\s*([\p{L}\p{N}·& -]{2,32}?)(?:里)?\s*点(?:了|的是)\s*(?=.{1,40})/iu
const ordinaryLocation =
  /(?:公园|家里?|家中|办公室|公司|学校|教室|宿舍|图书馆|商场|火车站|地铁站|手机上?|网上|路边|街上|楼下|外面|客厅|厨房)$/u
const genericPlace =
  /^(?:(?:这|那|一)家|附近的?|家里|家|店里|外面|公司|学校|街上|公园|厨房|餐厅|餐馆|饭店|店|咖啡|咖啡馆|面馆|食堂)$/u
const homeAction =
  /(?:我(?:刚|刚刚|今天|亲手|第一次|试着)?|我?自己|亲手|在家(?:里)?|在厨房|回家)(?:动手)?(?:做|煮|炒|蒸|烤|烘|煎|炖|冲|调|泡|打了|榨|烘焙|备)|(?:^|我|今天|第一次|尝试|在家)自制|自己下厨|在家下厨|(?:早餐|午餐|晚餐|早饭|午饭|晚饭|今天|早上|中午|晚上)(?:给自己)?(?:做了|炒了|煮了|烤了|炖了|冲了)/u
const outAction =
  /堂食|外食|外卖|下馆子|店里(?:吃|喝|点)|在(?:外面|餐馆|餐厅|饭店|面馆|咖啡馆|食堂)(?:里)?(?:吃|喝|点|用餐)|出去(?:吃|喝)/u

function concreteVenue(value) {
  const name = venueDisplayName(value).replace(
    /^(?:(?:这|那|一)家|新开的)\s*/u,
    '',
  )
  if (
    !name ||
    name.length > 60 ||
    genericPlace.test(name) ||
    /今天|昨天|自己|回家|做了|吃了|喝了|泡了|点了|买了|冲了|好喝的|好吃的|^[了]|^(?:一|这|那)[杯碗份盘]|在家|^家(?:里)?[喝吃做泡冲]|附近的|路边的/u.test(
      name,
    )
  )
    return ''
  return name
}

export function inferDining(text, names = []) {
  const known = names
    .map(venueDisplayName)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const evidence = new Set()
  const venues = new Map()
  for (const clause of String(text ?? '')
    .normalize('NFKC')
    .split(/[，,。！？!?；;\n]/u)) {
    const part = clause.trim()
    if (
      !part ||
      /想(?:去|在)|计划(?:去|在)|下次|没(?:有)?去|没在|不是(?:我?自己|自制|在)|路过|听说|打算|推荐去|准备去|想自己做/u.test(
        part,
      )
    )
      continue
    // A venue may be a known name without a restaurant suffix (“陶陶居”).
    const compact = venueKey(part)
    const remembered = known.find((name) => {
      const key = venueKey(name)
      return (
        ['在', '去', '去了', '来到', '到', '从', '打卡'].some((prefix) =>
          compact.includes(prefix + key),
        ) || compact.startsWith(key + '的')
      )
    })
    const supplied = part.match(
      /(?:店名|店叫|餐厅叫)(?:叫作?|是|为|[：:])?\s*(.+)$/u,
    )?.[1]
    const quoted = part.match(
      /(?:在|去了?|来到|打卡了?)[「『“"]([^」』”"]+)[」』”"](?:吃|喝|点|用餐|堂食|买)/u,
    )?.[1]
    const ordered = orderedAt.exec(part)?.[1]?.trim()
    const candidate = concreteVenue(
      supplied ||
        quoted ||
        locatedPlace.exec(part)?.[1] ||
        namedDishPlace.exec(part)?.[1] ||
        remembered ||
        (ordered && !ordinaryLocation.test(ordered) ? ordered : ''),
    )
    const detected =
      known.find((name) => venueKey(name) === venueKey(candidate)) || candidate
    if (detected) {
      evidence.add('out')
      venues.set(venueKey(detected), detected)
    } else if (outAction.test(part)) evidence.add('out')
    if (homeAction.test(part)) evidence.add('home')
  }
  const diningSource = evidence.size === 1 ? [...evidence][0] : ''
  return {
    diningSource,
    venueName:
      diningSource === 'out' && venues.size === 1
        ? [...venues.values()][0]
        : '',
  }
}

function diningFields(fields, category) {
  if (!isDining(category)) return { diningSource: '', venueName: '' }
  if (['home', 'out', ''].includes(fields.diningSource)) {
    return {
      diningSource: fields.diningSource,
      venueName:
        fields.diningSource === 'out' ? venueDisplayName(fields.venueName) : '',
    }
  }
  if (venueDisplayName(fields.venueName))
    return {
      diningSource: 'out',
      venueName: venueDisplayName(fields.venueName),
    }
  const inferred = inferDining(
    [fields.text, fields.notes, fields.title].filter(Boolean).join('。'),
  )
  if (inferred.diningSource) return inferred
  const sample = originalSamples.get(fields.id)
  if (
    sample &&
    fields.isSample !== false &&
    sample.title === fields.title &&
    sample.category === category &&
    sample.text === fields.text
  ) {
    return { diningSource: sample.diningSource, venueName: sample.venueName }
  }
  return inferred
}

function explicitRating(text) {
  const normalized = text.normalize('NFKC')
  if (
    /十分制|百分制|(?:满分(?:是|为)?\s*(?:十|10|一百|100)\s*分)|(?:十|10|一百|100)\s*分满分/.test(
      normalized,
    )
  )
    return undefined
  const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5 }
  const ratingWords =
    /(?:(?:评分|打分|打|给(?:它|这道菜|这个|这次|这杯)?|评)(?:了|个|为|是)?\s*[：:]?\s*([一二两三四五1-5])\s*(?:颗?星(?!级|红旗|酒店)|分(?!钟|之|熟|半|钱|贝|析))|([一二两三四五1-5])\s*(?:颗?星好评|星评价))/gu
  let rating
  for (const match of normalized.matchAll(ratingWords)) {
    const before = normalized
      .slice(0, match.index)
      .split(/[。！？；，,\n]/u)
      .at(-1)
    if (
      /(?:不(?:想|会|敢|要|该|能|值得)?|没(?:有)?|别|差点儿?|拒绝|他|她|朋友|别人|大家|店主|对方|请|请你)\s*$/.test(
        before,
      )
    )
      continue
    if (/(?:如果|假如|要是)/u.test(before)) continue
    const digit = match[1] || match[2]
    rating = digits[digit] || Number(digit)
  }
  return rating
}

export function extractEntry(input = '') {
  const text = String(input || '').trim()
  const dining = inferDining(text)
  const place = dining.venueName
  // “在山间咖啡吃了三明治” mentions coffee only as part of a business name.
  const content = (
    place
      ? text.normalize('NFKC').replaceAll(place.normalize('NFKC'), '')
      : text
  ).replace(
    /(?:在|去了?|来到)(?:咖啡馆|咖啡店|咖啡厅|面馆|餐馆|餐厅)(?:里)?(?=吃|喝|点|买|用餐)/gu,
    '',
  )
  const sentences = text
    .split(/[。！!？?；;\n]+/u)
    .map((s) => s.trim())
    .filter(Boolean)
  const phrases = sentences.flatMap((s) =>
    s
      .split(/[，,]+/u)
      .map((p) => p.trim())
      .filter(Boolean),
  )
  const served = content.match(
    /(做|煮|炒|烤|蒸|吃|喝|点)(?:了|的是)\s*(?:(?:[一二两三四五1-5])?(?:道|份|碗|盘|杯|锅|块|个|片|盒))?\s*([\p{L}\p{N}· -]{2,30})(?=[，,。！？!?；;\n]|$)/u,
  )
  const cookedDish = served?.[2]
    .split(/(?:味道|口感|真好吃|很好吃|很好喝|特别好吃|我觉得|我给)/u)[0]
    ?.trim()
  const dish = dishNames.find(([, pattern]) =>
    pattern.test(cookedDish || content),
  )
  const ingredients = [
    ...new Set(
      ingredientNames
        .filter(([, pattern]) => pattern.test(content))
        .map(([name]) => name),
    ),
  ]
  const listed = text.match(
    /(?:食材有|食材是|食材[：:])\s*([^。；;！!？?\n，,]{1,100})/u,
  )?.[1]
  if (listed) {
    for (const item of listed
      .split(/(?:、|以及|还有|和)/u)
      .map((value) => value.trim())) {
      if (!item || item.length > 12) continue
      const canonical =
        ingredientNames.find(([, pattern]) => pattern.test(item))?.[0] || item
      if (!ingredients.includes(canonical)) ingredients.push(canonical)
    }
  }
  const opening = phrases[0] || ''
  const isMeal =
    /饭|餐|下厨|做菜|食谱/.test(opening) ||
    ingredients.length > 0 ||
    /煮了|炒了|烤了|蒸了|吃了|喝了/.test(opening) ||
    dining.diningSource === 'out'
  const planned =
    ideaWords.test(opening) ||
    (!dish &&
      !isMeal &&
      phrases.some((phrase) => /(?:灵感|点子|想法)/.test(phrase)))
  const solidItem =
    cookedDish &&
    /(?:蛋糕|甜点|面包|饼|饭|面|米粉|虾饺|饺子|馄饨|寿司|三明治|布丁|粥)$/.test(
      cookedDish,
    )
  const category = planned
    ? '灵感'
    : served?.[1] === '吃' || solidItem
      ? '美食'
      : (served?.[1] === '喝' &&
            !(/汤$/.test(cookedDish) && !drinkWords.test(cookedDish))) ||
          (drinkWords.test(cookedDish || content) &&
            (!dish || drinkWords.test(dish[0])))
        ? '饮品'
        : dish ||
            foodWords.test(content) ||
            ingredients.length > 0 ||
            (cookedDish && isMeal)
          ? '美食'
          : '回忆'
  const foodOrDrink = category === '美食' || category === '饮品'
  const quotedTitle = text.match(/[《「](.{1,24}?)[》」]/u)?.[1]
  const shortTitle = opening.replace(/^(?:今天|刚刚|刚才)(?=.{4})/u, '').trim()
  const title =
    (quotedTitle && venueKey(quotedTitle) !== venueKey(place) && quotedTitle) ||
    (foodOrDrink && (dish?.[0] || cookedDish)) ||
    truncate(shortTitle, 18) ||
    '随手一记'
  let taste = ''
  const flavor = text.replace(/不(?:算|太)?难(?:吃|喝)/gu, '还行')
  if (
    foodOrDrink &&
    /不(?:太|怎么|是很|够|大|算|那么|那么的)?(?:好吃|好喝|美味|喜欢|合(?:我(?:的)?)?口味)|没有(?:想象中?|想象的)?那么好(?:吃|喝)|难吃|难喝|太咸|太腻|吃不惯|喝不惯|不(?:会|想)再(?:来|去)|不想再(?:吃|喝)/.test(
      flavor,
    )
  )
    taste = '不合口味'
  else if (foodOrDrink && /一般|普普通通|还行|还好|过得去/.test(flavor))
    taste = '一般'
  else if (
    foodOrDrink &&
    /好吃|好喝|美味|喜欢|很香|鲜美|不错|棒极了|下次(?:还会|还想|还要|再|还)?(?:再)?来|还想再(?:吃|喝|来)/.test(
      flavor,
    )
  )
    taste = '好吃'
  return {
    title,
    category,
    taste,
    rating: explicitRating(text),
    ingredients: foodOrDrink ? ingredients : [],
    steps: foodOrDrink
      ? phrases.filter((phrase) => stepWords.test(phrase))
      : [],
    feeling: phrases.filter((phrase) => feelingWords.test(phrase)).join('，'),
  }
}

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

export function tasteForRating(rating) {
  if (!(rating >= 1 && rating <= 5)) return ''
  return rating <= 2 ? '不合口味' : rating === 3 ? '一般' : '好吃'
}

// Only quote words whose authorship is known. A generated photo caption and a
// constructed title/feeling are not evidence of what someone actually said.
export function recommendationQuote(
  entry,
  { inspiration = false, maxLength = 64 } = {},
) {
  if (!entry) return ''
  const sample = entry.isSample ?? String(entry.id || '').startsWith('sample-')
  const idea = inspiration || INSPIRATIONS.some((item) => item.id === entry.id)
  const text = String(entry.text || '').trim()
  const caption = String(entry.photoDescription || '').trim()
  const unverified =
    entry.originalTextUnverified ??
    (!sample &&
      entry.source === 'photo' &&
      !Object.hasOwn(entry, 'photoDescription'))
  const original = !unverified && text && text !== caption ? text : ''
  const choices = [original, String(entry.notes || '').trim()].filter(Boolean)
  if (!choices.length) return ''
  const sentences = choices.flatMap(
    (value) => value.match(/[^。！？!?\n]+[。！？!?]?/gu) || [],
  )
  const feeling =
    /好吃|好喝|喜欢|好香|清爽|刚好|刚刚好|下次|开心|舒服|治愈|有趣|惊喜|惬意|想再|值得|舍不得|阳光|香气|酸甜/u
  const line = (
    sentences.find((sentence) => feeling.test(sentence)) ||
    sentences[0] ||
    choices[0]
  ).trim()
  const chars = Array.from(line)
  const limit = Math.max(1, Math.trunc(maxLength) || 64)
  const excerpt = chars.slice(0, limit).join('')
  // The ellipsis sits outside the quotation, so the words inside are always a verbatim excerpt.
  const end = chars.length > limit ? '…' : ''
  if (idea) return '做法灵感 · ' + excerpt + end
  return (sample ? '示例手记' : '你记过') + '「' + excerpt + '」' + end
}

export function publicAuthor(value) {
  if (!value || typeof value.nickname !== 'string' || !value.nickname.trim())
    return null
  const nickname = value.nickname.trim()
  return {
    nickname,
    initial: String(value.initial || Array.from(nickname)[0]).trim(),
  }
}

export function authorship(value) {
  const author = publicAuthor(value?.author),
    updatedBy = publicAuthor(value?.updatedBy)
  const stickerAuthor = cleanStickerAuthor(value?.stickerAuthor)
  return {
    ...(author ? { author } : {}),
    ...(updatedBy ? { updatedBy } : {}),
    ...(stickerAuthor ? { stickerAuthor } : {}),
  }
}

export function createEntry(fields = {}) {
  const text = String(fields.text || '').trim()
  // Fully normalized IndexedDB rows already have these fields. Parse only legacy or new input.
  let inferred
  const extracted = () => (inferred ??= extractEntry(text))
  const date = fields.createdAt ? new Date(fields.createdAt) : new Date()
  const rawRating = Math.round(Number(fields.rating))
  const rating = Number.isFinite(rawRating)
    ? Math.max(0, Math.min(5, rawRating))
    : 0
  const category = CATEGORIES.includes(fields.category)
    ? fields.category
    : extracted().category
  const sample =
    fields.isSample ?? String(fields.id || '').startsWith('sample-')
  const source = ['text', 'photo', 'voice'].includes(fields.source)
    ? fields.source
    : fields.audio
      ? 'voice'
      : fields.image
        ? 'photo'
        : 'text'
  const legacyPhoto =
    !sample &&
    source === 'photo' &&
    text &&
    !Object.hasOwn(fields, 'photoDescription')
  const enteredTaste = tastes.includes(fields.taste)
    ? fields.taste
    : extracted().taste
  // Low/neutral ratings must never produce a positive recommendation. Keep an
  // explicit legacy dislike even when it conflicts with a high rating.
  const taste =
    isDining(category) && rating
      ? rating >= 4 && enteredTaste
        ? enteredTaste
        : tasteForRating(rating)
      : enteredTaste
  return {
    id: String(fields.id || makeId()),
    isSample: sample,
    ...authorship(fields),
    ...(fields.visibility !== 'private' && fields.reactions?.length
      ? { reactions: cleanReactions(fields.reactions) }
      : {}),
    ...breakfastFields(fields),
    visibility: fields.visibility === 'private' ? 'private' : 'shared',
    photoDescription: String(fields.photoDescription || '').trim(),
    ...((fields.originalTextUnverified ?? legacyPhoto)
      ? { originalTextUnverified: true }
      : {}),
    title: String(fields.title || extracted().title).trim() || '随手一记',
    category,
    ...diningFields(fields, category),
    createdAt: (Number.isNaN(date.getTime()) ? new Date() : date).toISOString(),
    text,
    notes: String(fields.notes || '').trim(),
    rating,
    taste,
    favorite: fields.favorite === true,
    image: String(fields.image || ''),
    audio: String(fields.audio || ''),
    ingredients: Array.isArray(fields.ingredients)
      ? fields.ingredients.map(String)
      : extracted().ingredients,
    steps: Array.isArray(fields.steps)
      ? fields.steps.map(String)
      : extracted().steps,
    feeling: String(fields.feeling ?? extracted().feeling),
    source,
  }
}

function daysAgo(days, hour, minute) {
  const now = new Date()
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)
  return (date > now ? now : date).toISOString()
}

export const SEED_ENTRIES = [
  {
    id: 'sample-tomato-eggs',
    title: '番茄炒蛋',
    category: '美食',
    diningSource: 'home',
    createdAt: daysAgo(0, 12, 18),
    image: '/images/tomato-eggs.webp',
    rating: 5,
    taste: '好吃',
    favorite: true,
    text: '番茄多炒一会儿，酸甜的汤汁刚好拌一碗米饭。',
    ingredients: ['番茄', '鸡蛋', '小葱'],
    steps: [
      '番茄切块，鸡蛋打散',
      '炒好鸡蛋，先盛出来',
      '番茄炒出汁，再放回鸡蛋，撒上葱花',
    ],
    feeling: '酸酸甜甜，配刚出锅的米饭特别好吃。',
  },
  {
    id: 'sample-iced-latte',
    title: '午后的冰拿铁',
    category: '饮品',
    diningSource: 'home',
    createdAt: daysAgo(1, 14, 32),
    image: '/images/iced-latte.webp',
    rating: 4,
    taste: '好吃',
    text: '冰块碰到杯壁叮的一声，下午也跟着醒了。',
    ingredients: ['咖啡', '牛奶', '冰块'],
    steps: ['杯子里放入冰块', '倒入牛奶，再慢慢倒入浓缩咖啡'],
    feeling: '奶香刚刚好，下次想试试燕麦奶。',
  },
  {
    id: 'sample-walk',
    title: '树影漫步',
    category: '回忆',
    createdAt: daysAgo(2, 16, 48),
    image: '/images/walk.webp',
    rating: 5,
    favorite: true,
    text: '回家绕了一条远路，刚好遇见阳光穿过树梢。',
    feeling: '走慢一点，连脚下的树影都变得有趣。',
  },
  {
    id: 'sample-idea',
    title: '把散步变成寻色游戏',
    category: '灵感',
    createdAt: daysAgo(3, 19, 7),
    text: '下次散步前先挑一种颜色，沿路拍下所有遇见它的瞬间。想从橘色开始。',
  },
  {
    id: 'sample-noodles',
    title: '一碗葱油拌面',
    category: '美食',
    diningSource: 'home',
    createdAt: daysAgo(4, 18, 20),
    image: '/images/noodles.webp',
    rating: 5,
    taste: '好吃',
    text: '小火把葱慢慢煸香，连厨房都变得让人舍不得走。',
    ingredients: ['面条', '小葱', '生抽'],
    steps: ['小火煸香葱段', '加入生抽调成葱油汁', '把面煮好，沥干后趁热拌匀'],
    feeling: '简单又好吃，一会儿就见了碗底。',
  },
  {
    id: 'sample-breakfast',
    title: '周末的早餐吐司',
    isBreakfast: true,
    breakfastKind: 'quick',
    category: '美食',
    diningSource: 'home',
    createdAt: daysAgo(6, 9, 15),
    image: '/images/breakfast.webp',
    rating: 4,
    taste: '好吃',
    text: '面包烘到边缘微微发脆，周末的早晨就从这里开始。',
    ingredients: ['吐司'],
    steps: ['吐司烤到表面金黄', '趁热加上喜欢的配料'],
    feeling: '脆脆的边最好吃。',
  },
  {
    id: 'sample-venue-shanjian',
    title: '窗边的冰拿铁',
    category: '饮品',
    diningSource: 'out',
    venueName: '山间咖啡',
    createdAt: daysAgo(8, 15, 20),
    image: '/images/iced-latte.webp',
    rating: 5,
    taste: '好吃',
    text: '在山间咖啡喝了冰拿铁，牛奶和咖啡的比例刚刚好。',
  },
  {
    id: 'sample-venue-xiaoman',
    title: '小满的葱油拌面',
    category: '美食',
    diningSource: 'out',
    venueName: '小满面馆',
    createdAt: daysAgo(10, 12, 10),
    image: '/images/noodles.webp',
    rating: 4,
    taste: '好吃',
    text: '在小满面馆吃了葱油拌面，一拌开就能闻到葱香。',
  },
].map(createEntry)

for (const sample of SEED_ENTRIES) originalSamples.set(sample.id, sample)

// Add only the new dining fields to legacy objects. User edits and deletions
// stay intact. Older demo collections get the new venue examples once.
export function upgradeDiningRecords(records, addVenueExamples = true) {
  if (!records.some((record) => !Object.hasOwn(record, 'diningSource')))
    return records
  const upgraded = records.map((record) =>
    Object.hasOwn(record, 'diningSource')
      ? record
      : {
          ...record,
          ...diningFields(record, record.category),
        },
  )
  if (!addVenueExamples) return upgraded
  const existingSamples = records.filter(
    (record) => record.isSample !== false && originalSamples.has(record.id),
  )
  const anchor = Math.min(
    ...existingSamples
      .map((record) => new Date(record.createdAt).getTime())
      .filter(Number.isFinite),
  )
  if (Number.isFinite(anchor)) {
    const ids = new Set(records.map((record) => record.id))
    SEED_ENTRIES.filter((sample) =>
      sample.id.startsWith('sample-venue-'),
    ).forEach((sample, i) => {
      if (!ids.has(sample.id))
        upgraded.push({
          ...sample,
          createdAt: new Date(anchor - (i + 1) * 86400000).toISOString(),
        })
    })
  }
  return upgraded
}

const chronological = (a, b) =>
  String(b.createdAt || '').localeCompare(String(a.createdAt || ''))

export function recommendEntries(
  entries,
  { excludeIds = [], limit = 3, meal = '' } = {},
) {
  const ignored = new Set(excludeIds)
  const mealMatch = (entry) =>
    meal === '早餐' && /早餐|燕麦|吐司|三明治|粥/.test(entry.title) ? 1 : 0
  return entries
    .filter(
      (entry) =>
        isDining(entry.category) &&
        diningFields(entry, entry.category).diningSource === 'home' &&
        isLikedEntry(entry) &&
        !ignored.has(entry.id),
    )
    .sort(
      (a, b) =>
        mealMatch(b) - mealMatch(a) ||
        b.rating - a.rating ||
        Number(b.favorite) - Number(a.favorite) ||
        chronological(a, b),
    )
    .slice(0, Math.max(0, limit))
}

export function isLikedEntry(entry) {
  return (
    (entry.rating >= 4 ||
      (!entry.rating && ['好吃', '好喝'].includes(entry.taste))) &&
    entry.taste !== '不合口味' &&
    entry.taste !== '一般'
  )
}

function meanRating(entries) {
  const rated = entries.filter((entry) => entry.rating > 0 && entry.rating <= 5)
  return rated.length
    ? rated.reduce((sum, entry) => sum + Number(entry.rating), 0) / rated.length
    : 0
}

export function groupVenues(entries, profiles = []) {
  const aliases = new Map()
  for (const profile of profiles) {
    for (const name of [profile.name, ...(profile.aliases || [])])
      aliases.set(venueKey(name), profile)
  }
  const groups = new Map()
  for (const entry of [...entries].sort(chronological)) {
    const { diningSource, venueName } = diningFields(entry, entry.category)
    if (entry.visibility === 'private') continue
    const profile = aliases.get(venueKey(venueName))
    const key = venueKey(profile?.name || venueName)
    if (diningSource !== 'out' || !key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups
      .get(key)
      .push({ entry, venueName: profile?.name || venueName, profile })
  }
  const venues = []
  for (const [key, visits] of groups) {
    const personal = visits.filter(({ entry }) => !isSample(entry))
    const included = personal.length ? personal : visits
    const records = included.map(({ entry }) => entry)
    venues.push({
      key,
      name: included[0].venueName,
      ...(included[0].profile ? { profile: included[0].profile } : {}),
      entries: records,
      rating: meanRating(records),
      likedCount: records.filter(isLikedEntry).length,
      lastVisit: records[0].createdAt || '',
    })
  }
  for (const profile of profiles) {
    const key = venueKey(profile.name)
    if (!groups.has(key))
      venues.push({
        key,
        name: profile.name,
        profile,
        entries: [],
        rating: 0,
        likedCount: 0,
        lastVisit: '',
      })
  }
  return venues.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit))
}

const isSample = (entry) =>
  entry.isSample ?? String(entry.id).startsWith('sample-')

export function recommendVenues(entries, profiles = []) {
  const ranked = []
  for (const group of groupVenues(entries, profiles)) {
    if (!group.entries.length) continue
    const personal = !isSample(group.entries[0])
    const feedback = group.entries.filter(
      (entry) => entry.rating || entry.taste,
    )
    const positives = feedback.filter(isLikedEntry).length
    const negatives = feedback.filter(
      (entry) =>
        entry.taste === '不合口味' || (entry.rating > 0 && entry.rating <= 2),
    ).length
    const average = meanRating(feedback)
    if (
      positives <= negatives ||
      positives * 2 < feedback.length ||
      (average > 0 && average < 3.5)
    )
      continue
    ranked.push({ group, personal, positives, average })
  }
  return ranked
    .sort(
      (a, b) =>
        Number(b.personal) - Number(a.personal) ||
        b.positives - a.positives ||
        b.average - a.average ||
        b.group.lastVisit.localeCompare(a.group.lastVisit),
    )
    .map((item) => item.group)
}

export const INSPIRATIONS = [
  {
    id: 'idea-tomato-noodles',
    title: '汤汁浓浓的番茄鸡蛋面',
    category: '美食',
    text: '把番茄炒蛋多留一点汤，拌进热乎乎的面条里。',
    ingredients: ['番茄', '鸡蛋', '面条'],
    steps: [
      '番茄切块，鸡蛋打散炒熟',
      '另起锅把番茄炒软，加水煮沸',
      '放入面条煮熟，加入炒蛋',
    ],
    meal: '晚餐',
  },
  {
    id: 'idea-honey-toast',
    title: '蜂蜜香蕉吐司',
    category: '美食',
    text: '给烤得酥脆的吐司铺上香蕉片，淋一小圈蜂蜜。',
    ingredients: ['吐司', '香蕉', '蜂蜜'],
    steps: ['吐司烤至酥脆', '铺上香蕉片，淋少许蜂蜜'],
    meal: '早餐',
  },
  {
    id: 'idea-lemon-noodles',
    title: '清清爽爽的柠檬拌面',
    category: '美食',
    text: '挤一点柠檬汁，给熟悉的拌面换个酸香的口味。',
    ingredients: ['面条', '柠檬', '黄瓜', '生抽'],
    steps: [
      '面条煮熟过凉水',
      '黄瓜切丝，与面条放入碗中',
      '加入柠檬汁和生抽拌匀',
    ],
    meal: '晚餐',
  },
]
