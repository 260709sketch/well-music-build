/**
 * 歌词元数据行剥离规则 —— 移植自 SPlayer-Next / lyric-kit main 分支的 stripLyricMetadata
 *
 * 用于剔除歌词头尾/间插的「制作信息」「版权水印」「职务Credit」等非演唱行，例如：
 *   作词：xxx / 作曲：xxx / 编曲：xxx / 制作人：xxx / OP / SP / 未经授权不得转载 / 纯音乐，请欣赏 …
 *
 * 完整功能（与 lyric-kit main 分支对齐）：
 *   1. 严格正则命中（音乐人标签、未经授权、纯音乐占位、DJ音乐、TME AI字幕、邮箱水印等 8 条）
 *   2. 冒号左侧职务 Key 匹配关键词库（支持单字/多字/复合双语）
 *   3. 无冒号前缀 + 合法分隔符回退匹配
 *   4. matchMetadata：前 5 行有效内容内匹配「歌曲名+歌手」行
 *   5. 背景行联动剔除：主行被剔除时其关联的 isBG 行也剔除
 *   6. 有效正文区间定位：剔除正文开唱前与结束后的空白/元数据行
 *
 * 本实现仅根据 LRC 文本判定并过滤整行，不改动任何时间轴，对歌词同步零副作用。
 * 适配本项目 LyricLineData 类型：直接读取 line.lrc 文本字段，isBG 为可选兼容字段。
 */

// ---- 默认元数据关键词库（完整移植 lyric-kit defaultKeywords，main 分支最新版）----
const DEFAULT_KEYWORDS: readonly string[] = [
	"版权",
	"版权运营",
	"版权所有",
	"贝斯",
	"贝斯Bass",
	"本歌曲商用授权，前往小程序",
	"编",
	"编曲",
	"编曲 Arranger",
	"编曲Arranged By",
	"编曲Arrangement",
	"编配/钢琴",
	"编曲/混音",
	"编曲/混音/制作",
	"编调",
	"编程",
	"编程播放",
	"编钟",
	"唱",
	"录",
	"混",
	"制",
	"监",
	"策划",
	"策划 Planner",
	"策划统筹",
	"策划统筹Planner and coordinator",
	"出品",
	"出品、发行",
	"出品/发行",
	"出品/发行方",
	"出品/发行公司",
	"出品方Presented by",
	"出品方Presenter",
	"出品公司",
	"出品公司Production Company",
	"出品人",
	"出品人 Publisher",
	"出品人Chief Producer",
	"出品人Presenter",
	"出品人Producer",
	"出品团队",
	"出品团队Production Team",
	"出品Present by",
	"出品方",
	"出品人/监制",
	"出品 Produced by",
	"词",
	"词 Lyricist",
	"词曲提供",
	"词曲提供Lyrics & Composition Provided by",
	"词曲提供Lyrics and Composition Provided by",
	"词曲提供Music and Lyrics Provided by",
	"词曲提供Words and Music by",
	"词曲协力",
	"词Lyrics",
	"词曲版权管理",
	"词曲",
	"词曲创作",
	"大提琴",
	"大提琴 Cello",
	"大提琴solo",
	"大提琴独奏",
	"大键琴",
	"大提",
	"大管",
	"大号",
	"大阮",
	"大笒",
	"灯光设计",
	"灯光师",
	"第二小提琴",
	"第二小提琴 Second Violin",
	"第一小提琴",
	"第一小提琴 First Violin",
	"发行",
	"发行方",
	"发行方Publisher",
	"发行公司",
	"发行人",
	"发行Distributed by",
	"发行Distribution",
	"发行Release",
	"发行Released by",
	"发行策划",
	"发布",
	"翻唱",
	"翻译",
	"封面",
	"封面插画Cover illustration",
	"封面设计",
	"封面设计 Cover Design",
	"钢琴/合成器演奏",
	"钢琴演奏",
	"钢琴",
	"钢琴 Piano",
	"钢琴/Synth",
	"钢琴/贝斯/吉他",
	"钢片琴",
	"钢鼓",
	"歌名",
	"歌手",
	"歌手 Vocal Artist",
	"歌手 Vocal",
	"工作室",
	"鼓",
	"鼓Drums",
	"鼓录音",
	"鼓录音师",
	"鼓Drum",
	"鼓技师",
	"合成器演奏",
	"合声",
	"合声编写",
	"合声演唱",
	"合作",
	"合唱 Choir",
	"合唱指挥 Choir Conductor",
	"合唱编写",
	"合成器",
	"合成贝斯",
	"和声",
	"和声 Backing Vocals",
	"和声/和声设计",
	"和声设计",
	"和声编写",
	"和声编写Backing Vocal Arrangement",
	"和声编写Backing Vocals Design",
	"和声演唱",
	"和声Backing Vocal",
	"和音",
	"和音 Bvox",
	"和音编写",
	"和声 Back Vocal",
	"和声编写/演唱",
	"和声编写/和声",
	"和声编写、和声",
	"和音 Backing Vocal",
	"混缩",
	"混音",
	"混音 Mixed by",
	"混音 Mixing Engineer",
	"混音/母带工程师",
	"混音工程师",
	"混音工程师Mixing Engineer",
	"混音师",
	"混音室",
	"混音室Mixing Studio",
	"混音、母带",
	"混音&母带",
	"混音母带",
	"混音母带棚",
	"混音录音室",
	"混音录音棚",
	"混音/母带棚",
	"混音/音编",
	"混音助理",
	"混音棚",
	"混音师 Mixing Engineer",
	"混音/母带",
	"混音/母带 Mixing/Mastering Engineer",
	"混音工作室",
	"混音工作室 Mixing Studio",
	"吉他",
	"吉他 Guitar",
	"吉他Guitars",
	"吉他录音师",
	"吉他录制录音棚",
	"吉他/贝斯",
	"吉他演奏",
	"吉他录音",
	"吉他录音室",
	"吉他技师",
	"监制",
	"监制 Deputy Executive Producer",
	"监制Chief Producer",
	"监制Executive Director",
	"监制Supervised production",
	"监唱",
	"监听工程师",
	"键盘",
	"键盘Keyboard",
	"键提琴",
	"乐队统筹",
	"乐器演奏",
	"乐团",
	"乐队总监",
	"乐杯 Glass Harp",
	"乐队 Orchestra",
	"乐队配器 Orchestrator",
	"乐器录音师 Instrumental Recording Engineer",
	"乐器录音棚 Instrumental Recording Studio",
	"乐器录音",
	"乐器录音师",
	"乐器录音室",
	"乐手",
	"乐师",
	"乐队",
	"乐谱管理员",
	"乐器技师",
	"联合策划",
	"联合出品",
	"联合出品Co-produced by",
	"联合出品Co-production",
	"联合出品Jointly Produced by",
	"联合出品Published",
	"联合推广",
	"联合出品方",
	"录/混音",
	"录音",
	"录音 Recording Engineer",
	"录音师",
	"录音师Recording Engineer",
	"录音室",
	"录音室 Recording Studio",
	"录音制作",
	"录音工程师",
	"录音工程师 Recording Engineer",
	"录音助理",
	"录音师/混音师",
	"录音棚",
	"录音棚 Recording Studio",
	"录音工作室",
	"录音工作室 Recording Studio",
	"录音室经理",
	"民乐录制",
	"鸣谢",
	"母带",
	"母带 Mastered by",
	"母带处理工程师",
	"母带工程师",
	"母带工程师Mastering Engineer",
	"母带工程室",
	"母带后期处理工程师",
	"母带后期处理工程师Mastering Engineer",
	"母带后期处理录音室",
	"母带后期处理录音室Mastering Studio",
	"母带后期制作人",
	"母带后期制作人Mastering Producer",
	"母带制作 Mastering Engineer",
	"母带 Mastering Engineer",
	"母带Mastering",
	"母带制作",
	"母带处理",
	"母带制作人",
	"母带助理",
	"母带后期",
	"母带处理制作人",
	"母带处理录音室",
	"母带录音室",
	"配唱制作人",
	"配唱制作人 Vocals Producer",
	"配唱制作人Vocal Producer",
	"配唱",
	"配唱制作 VOCAL PRODUCTION",
	"配唱制作",
	"配唱编写",
	"配器",
	"企划",
	"企划宣传",
	"企划宣传Propaganda",
	"企划营销",
	"企划制作A&R Planning",
	"企划Planning",
	"企划统筹",
	"企宣",
	"清唱处作词",
	"清唱处作曲",
	"曲",
	"曲 Composer",
	"曲绘",
	"曲版权管理方",
	"设计",
	"设计Design",
	"特别鸣谢",
	"特别鸣谢/艺人支持",
	"特别鸣谢Acknowledgement",
	"特别企划",
	"特别感谢",
	"特邀",
	"特约嘉宾",
	"特雷门琴",
	"题记",
	"题字",
	"统筹",
	"统筹Coordinator",
	"统筹Planning",
	"推广",
	"推广策划",
	"推广策划Marketing Strategy",
	"推广策划Promotion Planning",
	"推广策划Promotion Strategy",
	"推广统筹 Promotion Coordinator",
	"推广宣传",
	"推广营销 Marketing Promotion",
	"维伴音乐",
	"文案",
	"文案Copywriting",
	"弦乐",
	"弦乐 Strings",
	"弦乐编写",
	"弦乐编写Strings Arrangement",
	"弦乐监制",
	"弦乐录音师",
	"弦乐录音室",
	"弦乐录音棚",
	"弦乐录音棚 Strings Recording Studio",
	"弦乐录制",
	"弦乐四重奏",
	"弦乐录音",
	"弦乐演奏",
	"弦乐团",
	"弦乐助理",
	"项目统筹",
	"项目统筹 Project Coordinator",
	"项目策划",
	"项目企划&统筹",
	"项目总监",
	"项目统筹Project Coordination",
	"项目协力",
	"宣传",
	"宣传/推广",
	"宣推",
	"宣发",
	"宣发统筹",
	"演唱",
	"演唱 Vocal Artist",
	"演奏者",
	"艺术指导",
	"艺术指导Art Director",
	"艺人统筹",
	"艺人助理",
	"音乐项目总监Project Executive",
	"音乐制作",
	"音乐制作发行",
	"音乐制作Music Production",
	"音频编辑",
	"音频编辑 Editing Engineer",
	"音频编辑 Vocal Editing",
	"音频编辑/人声录音",
	"音频工程师",
	"音乐出品发行公司",
	"音乐混音总监",
	"音乐编辑",
	"音乐企划",
	"音乐制作助理",
	"音乐制作总监",
	"音乐总监",
	"音响总监",
	"音乐发行",
	"音乐统筹",
	"音乐制作助理 Production Assistant",
	"音响工程师",
	"音效设计",
	"音控师",
	"音序",
	"营销推广",
	"营销推广/出品/发行",
	"营销推广Marketing",
	"营销推广Marketing Promotion",
	"营销策划",
	"营销",
	"原唱",
	"原曲",
	"原编曲",
	"原声吉他 Acoustic Guitar",
	"原版权",
	"原始版权",
	"制作发行",
	"制作公司",
	"制作公司 Production",
	"制作公司/OP",
	"制作公司Produce Company",
	"制作人",
	"制作人 Producer",
	"制作人Music Producer",
	"制作人Record Producer",
	"制作统筹",
	"制作统筹Executive Producer",
	"制作团队",
	"制作助理",
	"制作",
	"制作公司&OP",
	"制谱 Music Copyist",
	"制作人/编曲",
	"制作人/作曲/编曲",
	"制作协力",
	"制作行政",
	"制作行政统筹",
	"助理",
	"助理工程师",
	"妆发",
	"妆造",
	"服装",
	"中提琴",
	"中提琴 Viola",
	"中文词",
	"中国笛",
	"中提",
	"中阮",
	"中胡",
	"专辑",
	"总策划",
	"总策划 Chief Planner",
	"总策划Chref Planner",
	"总监制 Chief Executive Producer",
	"总企划",
	"总监制",
	"作词",
	"作曲",
	"作词协力",
	"作曲/编曲",
	"作曲 Composer",
	"作词 Lyricist",
	"Acknowledgement",
	"Additional Vocal by",
	"Arranged By",
	"Arrangement",
	"Arranger",
	"Art Director",
	"Artist",
	"A&R",
	"Background Vocals by",
	"Backing Vocal",
	"Backing Vocal Arrangement",
	"Backing Vocals",
	"Backing Vocals Design",
	"Backing vocals by",
	"Bass",
	"Beatmaker",
	"Cello",
	"Chief Producer",
	"Chref Planner",
	"Co-produced by",
	"Co-Producer",
	"Co-production",
	"Composed by",
	"Composer",
	"Copywriting",
	"Cover Design",
	"Copyist",
	"Design",
	"Distributed by",
	"Distribution",
	"Drums",
	"DJ",
	"Executive Producer",
	"First Violin",
	"Foley Artist",
	"Foley",
	"Guitar",
	"Guitars",
	"Instruments by",
	"Jointly Produced by",
	"Label Courtesy",
	"Lyricist",
	"Lyrics",
	"Lyrics & Composition Provided by",
	"Lyrics and Composition Provided by",
	"Lyrics by",
	"Marketing Promotion",
	"Marketing Strategy",
	"Mastered by",
	"Mastering by",
	"Mastering Engineer",
	"Mixed by",
	"Mixing Engineer",
	"Music and Lyrics Provided by",
	"Music Production",
	"MIDI",
	"MIDI编程",
	"OP",
	"OP、SP",
	"OP/发行",
	"OP/SP",
	"Organ",
	"Performed by",
	"Planner",
	"Planner and coordinator",
	"Presented by",
	"Presenter",
	"Produce Company",
	"Produced by",
	"Producer",
	"Production Company",
	"Production Team",
	"Promotion Planning",
	"Promotion Strategy",
	"Propaganda",
	"Published by",
	"Publisher",
	"Program",
	"Programming by",
	"PGM",
	"Record Producer",
	"Recorded at",
	"Recording Engineer",
	"Recording Studio",
	"Release",
	"Released by",
	"Repertoire Owner",
	"RAP词",
	"Remix",
	"Remixer",
	"Remixed by",
	"Second Violin",
	"Songs Title",
	"SP",
	"Strings",
	"Strings Arrangement",
	"Supervised production",
	"Scratching",
	"Viola",
	"Vocal Engineer",
	"Vocal Producer",
	"Vocal production by",
	"Vocals by",
	"Vocals Produced by",
	"Vocal Direction",
	"Words and Music by",
	"Written by",
	"电脑工程",
	"商务统筹",
	"主唱",
	"伴唱",
	"伴唱 Background Vocals",
	"伴唱 Choir",
	"女声和音",
	"男声和音",
	"绞弦琴 Hurdy-Gurdy",
	"长笛 Flute",
	"声乐指导",
	"声乐编辑",
	"人声录音 Recording",
	"人声录音 Vocal Recording",
	"人声编辑Vocal Editing",
	"人声编辑 Vocal Editor",
	"人声录制录音棚",
	"打击乐 Percussion",
	"经纪公司",
	"古琴 Guqin",
	"缩混",
	"改编曲",
	"潮语指导",
	"戏曲指导",
	"品牌宣传",
	"二胡Erhu",
	"古筝Guzheng",
	"长号 Trombone",
	"小号 Trumpet",
	"小提琴 Violin",
	"古典吉他 Classical Guitar",
	"玻璃琴 Glass Harmonica",
	"电吉他/贝司",
	"电吉他",
	"电吉他 Electric Guitar",
	"电贝斯",
	"电影原声发行",
	"电贝司",
	"电贝司 Electric Bass",
	"电脑工程师",
	"电钢琴",
	"电子鼓",
	"电子打击垫",
	"电子琴",
	"主创",
	"女声",
	"男声",
	"长号",
	"长鼓",
	"声音设计师",
	"声码器",
	"人声录音",
	"人声录音师",
	"人声录音师 Vocal Recording Engineer",
	"人声录音室",
	"人声录音棚",
	"人声录音棚 Vocal Recording Studio",
	"人声 Vocal Artist",
	"人声 Vocal",
	"人声 Voice",
	"人声编辑",
	"人声录制",
	"人声后期制作",
	"人声",
	"人声/木吉他录音师",
	"人声/木吉他录音棚",
	"人声制作人",
	"人声制作",
	"人声指导",
	"打击垫",
	"古筝",
	"二胡",
	"小号",
	"小提琴",
	"小提",
	"小阮",
	"小鼓",
	"京剧演唱",
	"京胡",
	"技术支持",
	"酷狗音乐就是歌多",
	"酷狗搜索",
	"业务联系",
	"笛子",
	"笛萧",
	"木吉他",
	"木吉他 Acoustic Guitar",
	"架子鼓 Drums",
	"琵琶",
	"萨克斯",
	"唢呐",
	"指挥 Conductor",
	"行销策略",
	"木吉他录音师",
	"木吉他录音棚",
	"视觉设计",
	"视觉设计 Visual Design",
	"木吉他录制",
	"木管",
	"木琴",
	"木箱鼓",
	"木棒",
	"木鱼",
	"指挥",
	"指弹吉他",
	"尼古赫帕琴 Nyckelharpa",
	"客串",
	"童声",
	"现场乐队",
	"英文词",
	"谱曲",
	"单曲制作",
	"执行制作人",
	"协力制作人",
	"共同制作",
	"共同制作人",
	"节拍制作",
	"节拍制作人",
	"管弦乐编排",
	"管乐编写",
	"节奏编写",
	"分轨",
	"贴混",
	"杜比全景声",
	"修音师",
	"修音",
	"重混音师",
	"预制作",
	"创意制作人",
	"创意总监",
	"拟音师",
	"拟音",
	"跟踪工程师",
	"抄谱员",
	"抄谱",
	"扒谱员",
	"扒谱",
	"谱务",
	"调音师",
	"调音",
	"调校",
	"调教",
	"前台工程师",
	"厂牌",
	"唱片公司",
	"插画",
	"承办单位",
	"承办人",
	"数字编辑",
	"数字剪辑",
	"次级发行",
	"次级发行方",
	"分发行",
	"所有乐器",
	"全部乐器",
	"造型",
	"次级版权",
	"后期制作",
	"风琴",
	"哈蒙德风琴",
	"采样器",
	"采样",
	"序列器",
	"箱琴",
	"尤克里里",
	"低音吉他",
	"乌德琴",
	"班卓琴",
	"西塔琴",
	"鲁特琴",
	"曼陀林",
	"提琴",
	"低音提琴",
	"竖琴",
	"管乐",
	"铜管",
	"竹笛",
	"短笛",
	"班苏里笛",
	"哨笛",
	"单簧管",
	"竖笛",
	"低音单簧管",
	"双簧管",
	"英国管",
	"巴松",
	"短号",
	"圆号",
	"次中音号",
	"富鲁格号",
	"富鲁格",
	"定音鼓",
	"蒂姆巴尔鼓",
	"铃鼓",
	"康加鼓",
	"邦戈鼓",
	"钹",
	"镲",
	"锣",
	"沙锤",
	"三角铁",
	"响板",
	"钟琴",
	"马林巴",
	"颤音琴",
	"瑶琴",
	"玉琴",
	"扬琴",
	"阮",
	"箫",
	"洞萧",
	"笙",
	"巴乌",
	"葫芦丝",
	"手风琴",
	"六角手风琴",
	"口琴",
	"拇指琴",
	"转盘",
	"克拉维奈",
	"梅洛特隆",
	"口风琴",
	"肩背键盘",
	"簧风琴",
	"踏板钢弦吉他",
	"滑棒吉他",
	"谐振吉他",
	"十二弦吉他",
	"布祖基",
	"恰朗戈",
	"巴拉莱卡",
	"德西马",
	"齐特琴",
	"自动竖琴",
	"手摇琴",
	"拉巴卜",
	"柳琴",
	"月琴",
	"三弦",
	"高胡",
	"板胡",
	"箜篌",
	"埙",
	"排箫",
	"排笛",
	"三味线",
	"太鼓",
	"尺八",
	"伽倻琴",
	"奚琴",
	"马头琴",
	"迪吉里杜管",
	"风笛",
	"杜杜克",
	"陶笛",
	"锡笛",
	"卡洪",
	"非洲鼓",
	"金贝鼓",
	"塔布拉",
	"达布卡",
	"手碟",
	"说话鼓",
	"波德兰鼓",
	"管钟",
	"牛铃",
	"刮壶",
	"军鼓",
	"手鼓",
	"框鼓",
	"班多钮",
	"Transcriber",
	"Transcription",
	"Turntable",
	"Turntables",
]

// ---- 默认元数据正则（完整移植 lyric-kit defaultRegexes，main 分支最新版，共 8 条）----
const DEFAULT_REGEXES: readonly string[] = [
	"(?:【.*?音乐人.*?】|\\(.*?音乐人.*?\\)|「.*?音乐人.*?」|（.*?音乐人.*?）|『.*?音乐人.*?』)",
	".*?未经.*?不得.*?",
	"未经(?:授权|许可)",
	"^纯音乐，请欣赏$",
	"^此歌曲为没有填词的纯音乐，请您欣赏$",
	"^DJ音乐[，,]?\\s*请(?:您)?欣赏$",
	"^本字幕由\\s*TME\\s*AI\\s*技术生成[。.]?$",
	"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
]

/** 归一化关键词：NFKC + 小写 + 去空白（与 lyric-kit 一致） */
const normalizeKw = (str: string): string =>
	str.normalize("NFKC").toLowerCase().replace(/\s+/g, "")

/** 无冒号回退匹配时允许的分隔符（归一化后形态）：用于「作词-青石」「编曲（林一）」这类无冒号格式 */
const NO_COLON_SEPARATORS = new Set([
	":", ",", ".", "!", "-", "_", "(", "[", "{", "【", "『", "「", "。", "·",
])

/** 模块级预归一化的默认关键词集合 */
const NORMALIZED_DEFAULT_KEYWORDS: ReadonlySet<string> = new Set(
	DEFAULT_KEYWORDS.map(normalizeKw),
)

/** 模块级预编译的默认严格正则列表 */
const COMPILED_DEFAULT_REGEXES: readonly RegExp[] = DEFAULT_REGEXES
	.map((pattern) => {
		try {
			return new RegExp(pattern, "i")
		} catch {
			return null
		}
	})
	.filter((re): re is RegExp => re !== null)

/** 剥除文本两端的成对/预留外层包装括号（圆、方、花、书名等） */
function cleanTextForCheck(text: string): string {
	let processed = text.trim()
	const brackets: ReadonlyArray<readonly [string, string]> = [
		["(", ")"],
		["（", "）"],
		["【", "】"],
		["[", "]"],
		["{", "}"],
		["『", "』"],
		["「", "」"],
	]
	let changed = true
	let loopCount = 0
	while (changed && loopCount < 5) {
		changed = false
		loopCount++
		for (const [open, close] of brackets) {
			if (processed.startsWith(open)) {
				if (processed.endsWith(close)) {
					processed = processed.slice(open.length, processed.length - close.length).trim()
					changed = true
					break
				}
				const closeIdx = processed.indexOf(close)
				if (closeIdx > -1) {
					const contentAfter = processed.slice(closeIdx + close.length).trim()
					if (contentAfter.length > 0) {
						processed = contentAfter
						changed = true
						break
					}
				}
			}
		}
	}
	return processed
}

/**
 * 判定单行是否为制作人/版权元数据行。
 * 机制：命中严格正则；含冒号且冒号左侧职务 Key 命中关键词库（支持单字/多字/复合双语）；
 * 无冒号时整行完全等于多字关键词，或以多字关键词开头并紧跟合法分隔符。
 */
const isMetadataLine = (
	text: string,
	keywordSet: ReadonlySet<string>,
	regexes: readonly RegExp[],
): boolean => {
	for (const regex of regexes) {
		if (regex.test(text)) return true
	}
	const cleaned = cleanTextForCheck(text)
	const colonMatch = /[:：]/.exec(cleaned)
	if (colonMatch) {
		const rawKey = cleaned.slice(0, colonMatch.index).trim()
		if (!rawKey) return false
		const key = normalizeKw(cleanTextForCheck(rawKey))
		if (!key) return false
		if (keywordSet.has(key)) return true
		for (const kw of keywordSet) {
			if (key.startsWith(kw)) {
				const nextChar = key[kw.length]
				if (
					nextChar === "/" ||
					nextChar === "&" ||
					nextChar === "、" ||
					nextChar === "+" ||
					(nextChar >= "a" && nextChar <= "z")
				) {
					return true
				}
			}
		}
		return false
	}
	const normalizedText = normalizeKw(cleaned)
	if (normalizedText.length >= 2 && keywordSet.has(normalizedText)) {
		return true
	}
	// 无冒号回退：多字关键词前缀 + 紧随分隔符
	for (const kw of keywordSet) {
		if (kw.length < 2) continue
		if (normalizedText.startsWith(kw)) {
			const nextChar = normalizedText[kw.length]
			if (nextChar && NO_COLON_SEPARATORS.has(nextChar)) {
				return true
			}
		}
	}
	return false
}

/** 歌词行最小结构（兼容本项目 LyricLineData：读取 lrc 文本，isBG 可选） */
export interface StripEligibleLine {
	lrc?: string
	isBG?: boolean
	[key: string]: unknown
}

/** 元数据行清理配置选项（移植自 lyric-kit StripOptions） */
export interface StripOptions {
	/** 是否启用内置默认排除规则，默认 true */
	useDefaultRules?: boolean
	/** 自定义关键词列表，与内置合并去重 */
	keywords?: string[]
	/** 自定义正则字符串列表，与内置合并去重 */
	regexPatterns?: string[]
	/** 歌曲元信息，用于在前 5 行有效内容内匹配「歌曲名+歌手」行 */
	matchMetadata?: {
		title?: string
		artists?: string[]
	}
}

/**
 * 从歌词行提取纯文本（适配本项目：直接读 lrc 字段，lyric-kit 原版读 words 数组拼接）
 */
const getLineText = (line: StripEligibleLine | null | undefined): string => {
	if (!line) return ""
	const text = line.lrc
	if (!text) return ""
	return String(text).trim()
}

/**
 * 剥离歌词中的元数据行（词/曲/编曲/制作/版权/版权水印/纯音乐占位等）。
 * 完整移植 lyric-kit main 分支 stripLyricMetadata 逻辑：
 *   1. 关键词+正则精准判定元数据行
 *   2. matchMetadata 标题歌手匹配（前 5 行有效内容扫描）
 *   3. 背景行联动剔除（主行被剔除时其 isBG 行也剔除）
 *   4. 有效正文区间定位（剔除首尾空白/元数据行）
 * 仅按行过滤，保留结构不变、不改动时间轴，对歌词同步零副作用。
 */
export function stripLyricMetadataLines<T extends StripEligibleLine>(
	lines: T[] | null | undefined,
	options: StripOptions = {},
): T[] {
	if (!lines || lines.length === 0) return []

	const useDefaultRules = options.useDefaultRules ?? true

	// 构建关键词集合
	let keywordSet: ReadonlySet<string>
	if (!useDefaultRules) {
		keywordSet = new Set((options.keywords ?? []).map(normalizeKw))
	} else if (!options.keywords || options.keywords.length === 0) {
		keywordSet = NORMALIZED_DEFAULT_KEYWORDS
	} else {
		keywordSet = new Set([
			...NORMALIZED_DEFAULT_KEYWORDS,
			...options.keywords.map(normalizeKw),
		])
	}

	// 构建正则列表
	let regexes: readonly RegExp[]
	if (!useDefaultRules) {
		regexes = (options.regexPatterns ?? [])
			.map((pattern) => {
				try {
					return new RegExp(pattern, "i")
				} catch {
					return null
				}
			})
			.filter((re): re is RegExp => re !== null)
	} else if (!options.regexPatterns || options.regexPatterns.length === 0) {
		regexes = COMPILED_DEFAULT_REGEXES
	} else {
		const extraRegexes = (options.regexPatterns ?? [])
			.map((pattern) => {
				try {
					return new RegExp(pattern, "i")
				} catch {
					return null
				}
			})
			.filter((re): re is RegExp => re !== null)
		regexes = [...COMPILED_DEFAULT_REGEXES, ...extraRegexes]
	}

	// 预提取所有行文本，避免重复计算
	const lineTexts = lines.map(getLineText)
	const excludeIndices = new Set<number>()

	// 第一阶段：制作人与版权元数据精准判定
	for (let idx = 0; idx < lines.length; idx++) {
		const text = lineTexts[idx]
		if (!text) continue
		if (isMetadataLine(text, keywordSet, regexes)) {
			excludeIndices.add(idx)
		}
	}

	// 第二阶段：歌曲名与歌手匹配（在清理元数据后的前 5 行有效内容内扫描）
	if (options.matchMetadata) {
		const { title, artists } = options.matchMetadata
		if (title && artists && artists.length > 0) {
			const lowerTitle = title.toLowerCase()
			let scanned = 0
			for (let idx = 0; idx < lines.length && scanned < 5; idx++) {
				if (excludeIndices.has(idx)) continue
				const text = lineTexts[idx]
				if (!text) continue
				scanned++
				const lowerText = text.toLowerCase()
				if (lowerText.includes(lowerTitle)) {
					const hasAnyArtist = artists.some((artist) =>
						lowerText.includes(artist.toLowerCase()),
					)
					if (hasAnyArtist) {
						excludeIndices.add(idx)
					}
				}
			}
		}
	}

	// 第三阶段：关联背景行处理——若主行被剔除或背景行孤立无主，背景行联动剔除
	let currentMainIdx = -1
	for (let idx = 0; idx < lines.length; idx++) {
		if (!lines[idx].isBG) {
			currentMainIdx = idx
		} else if (currentMainIdx === -1 || excludeIndices.has(currentMainIdx)) {
			excludeIndices.add(idx)
		}
	}

	// 第四阶段：定位有效正文区间，排除正文开唱前与结束后的空白行与元数据
	let firstContentIdx = -1
	for (let idx = 0; idx < lines.length; idx++) {
		if (excludeIndices.has(idx)) continue
		if (lineTexts[idx].length > 0) {
			firstContentIdx = idx
			break
		}
	}
	if (firstContentIdx === -1) {
		return []
	}
	let lastContentIdx = -1
	for (let idx = lines.length - 1; idx >= firstContentIdx; idx--) {
		if (excludeIndices.has(idx)) continue
		if (lineTexts[idx].length > 0) {
			lastContentIdx = idx
			break
		}
	}
	for (let idx = 0; idx < firstContentIdx; idx++) {
		excludeIndices.add(idx)
	}
	for (let idx = lastContentIdx + 1; idx < lines.length; idx++) {
		excludeIndices.add(idx)
	}

	if (excludeIndices.size === 0) return lines as T[]
	return lines.filter((_, idx) => !excludeIndices.has(idx))
}
