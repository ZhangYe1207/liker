import type { Item, Category, LogbookEntry, ItemStatus } from '../types'
import type { DataLayer } from './index'

const DATA_KEY = 'liker_data'
const LOGBOOK_KEY = 'liker_logbook'

const defaultCategories: Category[] = [
  { id: 'books', name: '书籍', icon: '📖' },
  { id: 'movies', name: '电影', icon: '🎬' },
  { id: 'music', name: '音乐', icon: '🎵' },
  { id: 'games', name: '游戏', icon: '🎮' },
  { id: 'anime', name: '动画', icon: '🎞️' },
]

const now = Date.now()
const DAY = 86_400_000

const defaultItems: Item[] = [
  // ── 书籍 ──
  {
    id: 'demo-book-1', categoryId: 'books', title: '百年孤独',
    description: '魔幻现实主义的巅峰之作，讲述了布恩迪亚家族七代人的传奇故事。',
    rating: 5, status: 'completed', genre: '魔幻现实主义', year: '1967',
    review: '马尔克斯用循环往复的叙事结构，把一个家族的兴衰写成了整个拉丁美洲的寓言。最后一页的震撼无以言表。',
    coverUrl: 'https://covers.openlibrary.org/b/id/11153024-L.jpg',
    createdAt: now - 90 * DAY, updatedAt: now - 85 * DAY,
  },
  {
    id: 'demo-book-2', categoryId: 'books', title: '人类简史',
    description: '从认知革命到农业革命，再到科学革命，重新认识人类的历史。',
    rating: 4, status: 'completed', genre: '社科', year: '2011',
    review: '视角独特，把人类学、生物学和历史串在一起讲。有些观点有争议但确实让人重新思考。',
    coverUrl: 'https://covers.openlibrary.org/b/id/10523356-L.jpg',
    createdAt: now - 80 * DAY, updatedAt: now - 75 * DAY,
  },
  {
    id: 'demo-book-3', categoryId: 'books', title: '设计模式',
    description: 'GoF 经典，23 种面向对象设计模式的系统阐述。',
    rating: 4, status: 'completed', genre: '计算机科学', year: '1994',
    review: '策略模式、工厂模式、观察者模式在实际项目中反复用到。虽然例子有些过时，但思想不过时。',
    coverUrl: 'https://covers.openlibrary.org/b/id/6554819-L.jpg',
    createdAt: now - 70 * DAY, updatedAt: now - 65 * DAY,
  },
  {
    id: 'demo-book-4', categoryId: 'books', title: '三体',
    description: '地球往事三部曲的开篇，中国硬科幻的里程碑之作。',
    rating: 5, status: 'completed', genre: '科幻', year: '2008',
    review: '黑暗森林法则是我读过最震撼的科幻设定，没有之一。刘慈欣的想象力太恐怖了。',
    coverUrl: 'https://covers.openlibrary.org/b/id/14544327-L.jpg',
    createdAt: now - 60 * DAY, updatedAt: now - 55 * DAY,
  },
  {
    id: 'demo-book-5', categoryId: 'books', title: '深度学习',
    description: 'Ian Goodfellow 的深度学习教科书，AI 领域的"花书"。',
    rating: 3, status: 'in_progress', genre: '人工智能', year: '2016',
    review: '数学推导很扎实，但读起来确实吃力。配合课程视频效果更好。',
    createdAt: now - 30 * DAY, updatedAt: now - 5 * DAY,
  },
  {
    id: 'demo-book-6', categoryId: 'books', title: '被讨厌的勇气',
    description: '以对话形式阐述阿德勒心理学，"课题分离"思想深刻改变了我的人际关系认知。',
    rating: 4, status: 'completed', genre: '心理学', year: '2013',
    createdAt: now - 45 * DAY, updatedAt: now - 40 * DAY,
  },

  // ── 电影 ──
  {
    id: 'demo-movie-1', categoryId: 'movies', title: '星际穿越',
    description: '一部关于爱与时间、物理与亲情的科幻史诗。',
    rating: 5, status: 'completed', genre: '科幻', year: '2014',
    review: '汉斯·季默的管风琴配乐和诺兰对时间膨胀的视觉化处理，让每次重看都起鸡皮疙瘩。那个对接场景的 No Time for Caution 是影史最佳配乐时刻之一。',
    coverUrl: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    createdAt: now - 88 * DAY, updatedAt: now - 80 * DAY,
  },
  {
    id: 'demo-movie-2', categoryId: 'movies', title: '肖申克的救赎',
    description: '希望是美好的事物，也许是世上最美好的事物。',
    rating: 5, status: 'completed', genre: '剧情', year: '1994',
    review: '每一帧都在讲自由和希望。安迪爬出下水道那一刻，大雨冲刷的不只是他的身体。',
    coverUrl: 'https://image.tmdb.org/t/p/w500/9cqNcoGLjRiIiQMvst1XKmSimPz.jpg',
    createdAt: now - 85 * DAY, updatedAt: now - 82 * DAY,
  },
  {
    id: 'demo-movie-3', categoryId: 'movies', title: '千与千寻',
    description: '宫崎骏的奇幻世界，关于成长、勇气和记忆。',
    rating: 5, status: 'completed', genre: '动画 / 奇幻', year: '2001',
    review: '小时候看的是奇幻冒险，长大后看的是对消费主义和身份认同的隐喻。每个年龄段都能有不同的感悟。',
    coverUrl: 'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg',
    createdAt: now - 75 * DAY, updatedAt: now - 70 * DAY,
  },
  {
    id: 'demo-movie-4', categoryId: 'movies', title: '盗梦空间',
    description: '诺兰的多层梦境叙事，视觉与剧情的双重迷宫。',
    rating: 5, status: 'completed', genre: '科幻 / 悬疑', year: '2010',
    review: '嵌套梦境的设定至今无人超越。最后那个陀螺到底停没停？',
    coverUrl: 'https://image.tmdb.org/t/p/w500/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg',
    createdAt: now - 65 * DAY, updatedAt: now - 60 * DAY,
  },
  {
    id: 'demo-movie-5', categoryId: 'movies', title: '沙丘2',
    description: '维伦纽瓦的史诗续作，视觉与叙事的全面升级。',
    rating: 4, status: 'completed', genre: '科幻', year: '2024',
    review: '赞达亚的角色终于有了灵魂。沙漠骑虫的 IMAX 体验太震撼了，但结尾的宗教狂热转折有点急。',
    createdAt: now - 20 * DAY, updatedAt: now - 18 * DAY,
  },
  {
    id: 'demo-movie-6', categoryId: 'movies', title: '奥本海默',
    description: '诺兰的传记片，原子弹之父的荣耀与毁灭。',
    rating: 4, status: 'completed', genre: '传记 / 历史', year: '2023',
    review: '基里安·墨菲的表演太牛了。三线叙事在最后半小时完美汇合，但三小时的片长确实需要耐心。',
    createdAt: now - 40 * DAY, updatedAt: now - 38 * DAY,
  },

  // ── 音乐 ──
  {
    id: 'demo-music-1', categoryId: 'music', title: 'OK Computer',
    description: 'Radiohead 的里程碑专辑，预言了数字时代的焦虑与异化。',
    rating: 5, status: 'completed', genre: '另类摇滚', year: '1997',
    review: '每首歌都像一个独立的小宇宙。Paranoid Android 的结构变化和 No Surprises 的温柔绝望，同一张专辑里共存。',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/05/2b/6f/052b6f38-de58-8fd4-45fa-a5bf9b34a964/source/600x600bb.jpg',
    createdAt: now - 82 * DAY, updatedAt: now - 78 * DAY,
  },
  {
    id: 'demo-music-2', categoryId: 'music', title: 'Random Access Memories',
    description: 'Daft Punk 的告别之作，致敬 70-80 年代的 Disco 与 Funk。',
    rating: 5, status: 'completed', genre: '电子 / 迪斯科', year: '2013',
    review: 'Get Lucky 让全世界跳舞，但 Touch 和 Beyond 才是这张专辑的灵魂。尼尔·罗杰斯的吉他 riff 绝了。',
    coverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/86/43/77/864377ae-6b1e-a199-d8a4-73d7a9194e68/source/600x600bb.jpg',
    createdAt: now - 72 * DAY, updatedAt: now - 68 * DAY,
  },
  {
    id: 'demo-music-3', categoryId: 'music', title: 'To Pimp a Butterfly',
    description: 'Kendrick Lamar 的社会意识说唱专辑，融合爵士与放克。',
    rating: 5, status: 'completed', genre: '嘻哈 / 爵士', year: '2015',
    review: '这不只是说唱专辑，是一部关于黑人身份认同的有声文学。Alright 成了一代人的抗议圣歌。',
    createdAt: now - 50 * DAY, updatedAt: now - 48 * DAY,
  },
  {
    id: 'demo-music-4', categoryId: 'music', title: 'Erta',
    description: 'Arca 的实验电子专辑，模糊了音乐与噪音的边界。',
    rating: 3, status: 'completed', genre: '实验电子', year: '2024',
    review: '有些段落很惊艳，但整体听感太碎片化了。需要更多时间消化。',
    createdAt: now - 15 * DAY, updatedAt: now - 12 * DAY,
  },
  {
    id: 'demo-music-5', categoryId: 'music', title: 'Blonde',
    description: 'Frank Ocean 的第二张录音室专辑，R&B 的解构与重塑。',
    rating: 5, status: 'completed', genre: 'R&B / 另类', year: '2016',
    review: 'Nights 中间那个 beat switch 是音乐史上最完美的转场之一。整张专辑像一封写给青春的情书。',
    createdAt: now - 55 * DAY, updatedAt: now - 52 * DAY,
  },

  // ── 游戏 ──
  {
    id: 'demo-game-1', categoryId: 'games', title: '塞尔达传说：旷野之息',
    description: '重新定义了开放世界游戏的设计哲学。',
    rating: 5, status: 'completed', genre: '动作冒险 / 开放世界', year: '2017',
    review: '物理引擎驱动的交互设计让每个玩家都有独一无二的体验。爬上双子山看日出那一刻，理解了什么叫"涌现式游戏设计"。',
    createdAt: now - 86 * DAY, updatedAt: now - 78 * DAY,
  },
  {
    id: 'demo-game-2', categoryId: 'games', title: 'Elden Ring',
    description: '宫崎英高 × 乔治·R·R·马丁，魂系开放世界的野心之作。',
    rating: 5, status: 'completed', genre: '动作RPG', year: '2022',
    review: '第一次玩魂系被虐哭，第一百小时后变成了虐 Boss 的人。"交界地"的地图设计是真正的世界级。',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg',
    createdAt: now - 58 * DAY, updatedAt: now - 42 * DAY,
  },
  {
    id: 'demo-game-3', categoryId: 'games', title: 'Hades',
    description: 'Supergiant Games 的 Roguelike 杰作，叙事与玩法的完美融合。',
    rating: 5, status: 'completed', genre: 'Roguelike', year: '2020',
    review: '死亡不是惩罚而是叙事的一部分，这个设计太天才了。每次 Run 都有新对话，角色塑造极其丰满。',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg',
    createdAt: now - 48 * DAY, updatedAt: now - 35 * DAY,
  },
  {
    id: 'demo-game-4', categoryId: 'games', title: 'Disco Elysium',
    description: '一款没有战斗的 RPG，你唯一的武器是对话和思考。',
    rating: 5, status: 'completed', genre: 'CRPG', year: '2019',
    review: '内心独白系统让24种人格特质在脑子里吵架，从来没有一款游戏把"思考"做得这么有趣。文学性吊打绝大多数小说。',
    coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/632470/header.jpg',
    createdAt: now - 35 * DAY, updatedAt: now - 28 * DAY,
  },
  {
    id: 'demo-game-5', categoryId: 'games', title: 'Hollow Knight: Silksong',
    description: '《空洞骑士》续作，银蜂大冒险。',
    rating: 0, status: 'want', genre: '银河恶魔城', year: '2025',
    createdAt: now - 10 * DAY, updatedAt: now - 10 * DAY,
  },

  // ── 动画 ──
  {
    id: 'demo-anime-1', categoryId: 'anime', title: '新世纪福音战士',
    description: '庵野秀明的心理学机甲动画，改变了整个业界。',
    rating: 5, status: 'completed', genre: '机甲 / 心理', year: '1995',
    review: '表面是机器人打怪兽，内核是对人际关系恐惧的极致剖析。最后两集的意识流至今仍有争议，但正是这种争议让它成为经典。',
    createdAt: now - 84 * DAY, updatedAt: now - 80 * DAY,
  },
  {
    id: 'demo-anime-2', categoryId: 'anime', title: '攻壳机动队 SAC',
    description: '押井守原作衍生的TV动画，赛博朋克世界的政治惊悚。',
    rating: 5, status: 'completed', genre: '赛博朋克 / 科幻', year: '2002',
    review: '笑�的故事线把AI意识和社会运动结合得天衣无缝。20年前的动画讨论的问题，现在反而更有现实意义了。',
    createdAt: now - 76 * DAY, updatedAt: now - 72 * DAY,
  },
  {
    id: 'demo-anime-3', categoryId: 'anime', title: '葬送的芙莉莲',
    description: '精灵魔法使在勇者死后踏上回忆之旅，关于"理解"的慢节奏冒险。',
    rating: 5, status: 'completed', genre: '奇幻 / 治愈', year: '2023',
    review: '用寿命差异来讲"珍惜与人的羁绊"这件事，每一集都在温柔地拧你的心。战斗作画也是 Madhouse 级别的惊艳。',
    createdAt: now - 25 * DAY, updatedAt: now - 20 * DAY,
  },
  {
    id: 'demo-anime-4', categoryId: 'anime', title: '孤独摇滚！',
    description: '社恐吉他少女的乐队成长故事，以癫狂表现力出圈。',
    rating: 4, status: 'completed', genre: '音乐 / 日常', year: '2022',
    review: '小孤独的社恐演出场景每次看都笑到不行。CloverWorks 的演出创意完全不按套路来，太好玩了。',
    createdAt: now - 32 * DAY, updatedAt: now - 28 * DAY,
  },
  {
    id: 'demo-anime-5', categoryId: 'anime', title: '鬼灭之刃 柱训练篇',
    description: 'ufotable 作画天花板，柱们的集训篇章。',
    rating: 3, status: 'completed', genre: '少年 / 动作', year: '2024',
    review: '作画依然是业界顶级，但内容有点水，感觉就是在为无限城篇蓄力。',
    createdAt: now - 8 * DAY, updatedAt: now - 6 * DAY,
  },
]

// ── Default logbook entries (derived from demo items) ──

function generateDefaultLogbook(): LogbookEntry[] {
  const entries: LogbookEntry[] = []
  let seq = 0

  for (const item of defaultItems) {
    const status = item.status ?? 'completed'
    const created = item.createdAt
    const updated = item.updatedAt ?? created

    if (status === 'want') {
      entries.push({
        id: `demo-log-${++seq}`, itemId: item.id,
        fromStatus: null, toStatus: 'want',
        createdAt: created,
      })
    } else if (status === 'in_progress') {
      entries.push({
        id: `demo-log-${++seq}`, itemId: item.id,
        fromStatus: null, toStatus: 'want',
        createdAt: created,
      })
      entries.push({
        id: `demo-log-${++seq}`, itemId: item.id,
        fromStatus: 'want', toStatus: 'in_progress',
        createdAt: created + Math.round((updated - created) * 0.5),
      })
    } else if (status === 'completed') {
      // Some items get a multi-step journey for variety
      const span = updated - created
      if (span > 3 * DAY) {
        entries.push({
          id: `demo-log-${++seq}`, itemId: item.id,
          fromStatus: null, toStatus: 'want',
          createdAt: created,
        })
        entries.push({
          id: `demo-log-${++seq}`, itemId: item.id,
          fromStatus: 'want', toStatus: 'in_progress',
          createdAt: created + Math.round(span * 0.3),
        })
        entries.push({
          id: `demo-log-${++seq}`, itemId: item.id,
          fromStatus: 'in_progress', toStatus: 'completed',
          createdAt: updated,
        })
      } else {
        entries.push({
          id: `demo-log-${++seq}`, itemId: item.id,
          fromStatus: null, toStatus: 'completed',
          createdAt: updated || created,
        })
      }
    }
  }

  return entries
}

const defaultLogbookEntries = generateDefaultLogbook()

function normalizeItem(item: Item): Item {
  return {
    ...item,
    status: item.status ?? 'completed',
    review: item.review ?? '',
    updatedAt: item.updatedAt ?? item.createdAt,
  }
}

function loadRaw(): { items: Item[]; categories: Category[] } {
  const raw = localStorage.getItem(DATA_KEY)
  if (!raw) return { items: defaultItems, categories: defaultCategories }
  try {
    const data = JSON.parse(raw) as { items: Item[]; categories: Category[] }
    return {
      items: data.items.map(normalizeItem),
      categories: data.categories,
    }
  } catch {
    return { items: defaultItems, categories: defaultCategories }
  }
}

function saveRaw(items: Item[], categories: Category[]): void {
  localStorage.setItem(DATA_KEY, JSON.stringify({ items, categories }))
}

function loadLogbook(): LogbookEntry[] {
  const raw = localStorage.getItem(LOGBOOK_KEY)
  if (!raw) return defaultLogbookEntries
  try {
    return JSON.parse(raw) as LogbookEntry[]
  } catch {
    return defaultLogbookEntries
  }
}

function saveLogbook(entries: LogbookEntry[]): void {
  localStorage.setItem(LOGBOOK_KEY, JSON.stringify(entries))
}

export class LocalStorageDataLayer implements DataLayer {
  async getItems(): Promise<Item[]> {
    return loadRaw().items
  }

  async getCategories(): Promise<Category[]> {
    return loadRaw().categories
  }

  async saveItem(item: Item): Promise<void> {
    const { items, categories } = loadRaw()
    const idx = items.findIndex(i => i.id === item.id)
    if (idx >= 0) {
      items[idx] = normalizeItem(item)
    } else {
      items.push(normalizeItem(item))
    }
    saveRaw(items, categories)
  }

  async deleteItem(id: string): Promise<void> {
    const { items, categories } = loadRaw()
    saveRaw(items.filter(i => i.id !== id), categories)
  }

  async saveCategory(category: Category): Promise<void> {
    const { items, categories } = loadRaw()
    const idx = categories.findIndex(c => c.id === category.id)
    if (idx >= 0) {
      categories[idx] = category
    } else {
      categories.push(category)
    }
    saveRaw(items, categories)
  }

  async deleteCategory(id: string): Promise<void> {
    const { items, categories } = loadRaw()
    saveRaw(items.filter(i => i.categoryId !== id), categories.filter(c => c.id !== id))
  }

  async addLogEntry(entry: LogbookEntry): Promise<void> {
    const entries = loadLogbook()
    entries.push(entry)
    saveLogbook(entries)
  }

  async getLogEntries(filters?: { categoryId?: string; status?: ItemStatus }): Promise<LogbookEntry[]> {
    let entries = loadLogbook()
    if (filters?.status) {
      entries = entries.filter(e => e.toStatus === filters.status)
    }
    if (filters?.categoryId) {
      const { items } = loadRaw()
      const itemIds = new Set(items.filter(i => i.categoryId === filters.categoryId).map(i => i.id))
      entries = entries.filter(e => itemIds.has(e.itemId))
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt)
  }

  async bulkSaveItems(items: Item[]): Promise<void> {
    const data = loadRaw()
    const existing = new Map(data.items.map(i => [i.id, i]))
    for (const item of items) {
      existing.set(item.id, normalizeItem(item))
    }
    saveRaw([...existing.values()], data.categories)
  }

  async bulkSaveCategories(categories: Category[]): Promise<void> {
    const data = loadRaw()
    const existing = new Map(data.categories.map(c => [c.id, c]))
    for (const cat of categories) {
      existing.set(cat.id, cat)
    }
    saveRaw(data.items, [...existing.values()])
  }
}
