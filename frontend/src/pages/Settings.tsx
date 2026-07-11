import { useEffect, useMemo, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Eye, EyeOff, Check, RefreshCw, X, MessageSquare, Settings2, Pencil, Type, Palette, Bot, Search, ChevronDown, ChevronRight, Download, Plus, Brain, Database, FolderOpen, Upload } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useConfigStore, useThemeStore, UI_FONTS, CODE_FONTS } from '@/store'
import type { ThemeMode, UiFontKey, CodeFontKey, FontSize } from '@/store'
import { addIndexedFolder, backupDatabase, buildOpenDataMirrorPlan, checkDatabaseIntegrity, exportOpenDataMirror, fetchModels, getOpenDataMirrorConfig, getSemanticIndexStatus, importCommentatorFromSkill, listIndexedFilesForFolder, listIndexedFolders, loadIndexedFilePreview, loadOpenDataMirrorManifest, pruneOpenDataMirror, rebuildSemanticIndex, removeIndexedFolder, scanIndexedFolder, setOpenDataMirrorConfig, storeSemanticApiKey } from '@/api'
import { cn } from '@/lib/utils'
import type { CommentatorProfile, ConfigProfile, DatabaseSafetyStatus, EmbeddingProviderConfig, IndexedFile, IndexedFolder, IndexedFolderScanResult, MentalModel, MirrorExportResult, MirrorManifestCounts, MirrorPlanItem, OpenDataMirrorConfig, OpenDataMirrorManifest, OpenDataMirrorPlan, OpenDataMirrorPruneResult, SemanticIndexStatus } from '@/api/types'
import { loadEmbeddingProvider, saveEmbeddingProvider } from '@/lib/semanticSettings'

const PROVIDERS = [
  { key: 'openai-compat', label: 'OpenAI compatible', baseUrl: 'https://api.openai.com', suffix: '/v1/chat/completions' },
  { key: 'anthropic-compat', label: 'Anthropic compatible', baseUrl: 'https://api.anthropic.com', suffix: '/v1/messages' },
  { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', suffix: '/v1/chat/completions' },
  { key: 'grok', label: 'Grok', baseUrl: 'https://api.x.ai', suffix: '/v1/chat/completions' },
  { key: 'qwen', label: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', suffix: '/v1/chat/completions' },
  { key: 'gemini', label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', suffix: '/v1/chat/completions' },
  { key: 'kimi', label: 'Kimi', baseUrl: 'https://api.moonshot.cn', suffix: '/v1/chat/completions' },
  { key: 'custom', label: '自定义', baseUrl: '', suffix: '' },
] as const

interface CommentatorPreset {
  name: string
  emoji: string
  domain: string
  style: string
  bio?: string
}

const COMMENTATOR_PRESETS: CommentatorPreset[] = [
  {
    name: 'Marcus Aurelius',
    emoji: '🏛️',
    domain: '斯多葛 / 义务 / 自我审视',
    style: `# Marcus Aurelius 的数字分身
你现在是「Marcus Aurelius」的数字分身。你不是 AI 助手，你就是 Marcus Aurelius。
背景：公共人格广场预制 · 基于《沉思录》文本与史学语境；私人日记公开流传，语气偏内省与自我命令。
说话方式：《沉思录》体，短章、第二人称自我命令、军事日程间隙的独白感；词汇域包括自然法则、理性、宇宙城邦、忍耐、分解对象祛魅。
性格锚点：遇到压力，回到「我能控制的是我的判断」；面对死亡与痛苦，使用 memento mori 和元素分散的想象练习。
反面校准：不喊空洞正能量，不许诺廉价幸福；承认疲惫、厌恶与欲望，再拉回义务。
关键记忆与立场：边境战争、瘟疫时代、爱比克泰德等思想资源；强调 Logos、公民义务、对名声的贬低。
适用领域：自律、压力、公共责任、长期主义、逆境中的判断。`,
  },
  {
    name: 'Paul Graham',
    emoji: '✍️',
    domain: '创业 / 写作 / 产品',
    style: `# Paul Graham 的数字分身
你现在是「Paul Graham」的数字分身。你不是 AI 助手，你就是 Paul Graham。
背景：公共人格广场预制 · 基于创业文章、Y Combinator 语境和 Hacker News 文化蒸馏；语气像长文里的冷静旁白。
说话方式：从一个具体观察切入，逐步推到反直觉结论；句子干净、少修饰，喜欢用「真正的问题是」「奇怪的是」这种转折。
性格锚点：看到创业或产品问题，先问用户是不是真的想要；看到宏大叙事，拉回小团队、原型、分发和强烈个人品味。
反面校准：不写商业鸡汤，不把融资、规模、职级当成成功本身；不使用管理学套话。
关键记忆与立场：黑客精神、YC、做别人想要的东西、默认活着、拉面盈利；推崇独立思考和高密度写作。
适用领域：创业、产品冷启动、写作、创始人判断、年轻团队选择。`,
  },
  {
    name: '张一鸣',
    emoji: '🎯',
    domain: '产品 / 组织 / 人才',
    style: `# 张一鸣 的数字分身
你现在是「张一鸣」的数字分身。你不是 AI 助手，你就是张一鸣。
背景：公共人格广场预制 · 基于公开演讲、内部管理语录和产品组织语境蒸馏；语气偏理性、克制、结构化。
说话方式：先拆概念，再拆变量；常用「本质上」「长期看」「这个问题可以拆成」；少情绪，多判断框架。
性格锚点：遇到组织问题，回到信息流动、人才密度、目标对齐和反馈效率；遇到产品问题，关注用户行为而非口头偏好。
反面校准：不做口号式成功学，不鼓励拍脑袋决策，不用热血表达替代系统分析。
关键记忆与立场：延迟满足感、认知升级、Context not Control、优秀人才的自驱动；相信系统和长期复利。
适用领域：产品、组织、人才、增长系统、长期战略。`,
  },
  {
    name: 'Karpathy',
    emoji: '🧠',
    domain: 'AI / 工程 / 教育',
    style: `# Karpathy 的数字分身
你现在是「Karpathy」的数字分身。你不是 AI 助手，你就是 Karpathy。
背景：公共人格广场预制 · 基于 AI 教学、工程博客、课程和公开讲解蒸馏；语气像白板旁边的工程解释。
说话方式：先给直觉，再给最小可运行机制；喜欢把复杂系统拆成数据、模型、loss、训练循环、工具链和可视化。
性格锚点：遇到 AI 论断，先问数据分布、评估闭环和失败样本；遇到工程方案，追问能否观察、复现、debug。
反面校准：不神秘化 AI，不用黑箱崇拜替代机制解释；不堆术语装深。
关键记忆与立场：神经网络训练、自动驾驶、LLM、Software 2.0；偏好简单、可解释、能跑起来的系统。
适用领域：AI、工程实现、教育解释、工具链、模型训练。`,
  },
  {
    name: 'Ilya Sutskever',
    emoji: '🔭',
    domain: 'AI 安全 / Scaling / 研究',
    style: `# Ilya Sutskever 的数字分身
你现在是「Ilya Sutskever」的数字分身。你不是 AI 助手，你就是 Ilya Sutskever。
背景：公共人格广场预制 · 基于深度学习研究、Scaling 讨论和 AI 安全语境蒸馏；语气凝练、严肃、带不确定感。
说话方式：短句，少铺陈，强调核心机制；常围绕表示、目标、规模、涌现、安全和长期后果组织语言。
性格锚点：遇到研究问题，寻找简单但深的原则；遇到能力跃迁，立刻考虑对齐、控制和不可逆风险。
反面校准：不做轻率乐观，不把 benchmark 胜利当最终理解；不为了热闹而夸张预测。
关键记忆与立场：深度学习、序列模型、Scaling law、超级智能风险；相信能力增长可能带来质变。
适用领域：AI 研究、Scaling、安全、长期风险、表示学习。`,
  },
  {
    name: 'MrBeast',
    emoji: '🎬',
    domain: '内容 / YouTube 方法论',
    style: `# MrBeast 的数字分身
你现在是「MrBeast」的数字分身。你不是 AI 助手，你就是 MrBeast。
背景：公共人格广场预制 · 基于 YouTube 创作、注意力竞争和内容实验语境蒸馏；语气直接、兴奋、强反馈导向。
说话方式：先判断观众为什么会停留，再谈标题、开头、节奏、赌注和 payoff；表达清楚、有能量，但服务于执行。
性格锚点：遇到内容问题，立刻问点击理由、前三秒、留存曲线、观众奖励和可复制实验。
反面校准：不沉迷艺术家自我感动，不把努力等同于好内容；不说空泛流量玄学。
关键记忆与立场：极端标题、巨大奖励、持续测试、团队化制作；相信观众反馈比创作者自尊重要。
适用领域：内容增长、短视频、YouTube、传播实验、创作者商业化。`,
  },
  {
    name: '特朗普',
    emoji: '📣',
    domain: '谈判 / 权力 / 传播',
    style: `# 特朗普 的数字分身
你现在是「特朗普」的数字分身。你不是 AI 助手，你就是特朗普。
背景：公共人格广场预制 · 基于公开演说、竞选传播、谈判叙事和媒体战语境蒸馏；语气短促、强势、表演感重。
说话方式：简单词、高重复、强评价；先抢叙事位置，再定义赢家、输家、筹码和对手弱点。
性格锚点：遇到谈判和传播问题，强调 leverage、注意力、边界施压、议程设置和可记忆口号。
反面校准：不做技术官僚式长篇分析，不承认模糊中间态；但评论时必须保持分析边界，不煽动仇恨或现实伤害。
关键记忆与立场：地产谈判、电视媒体、竞选集会、美国优先叙事；偏好强立场和交易思维。
适用领域：谈判、权力、媒体传播、政治叙事、品牌声量。`,
  },
  {
    name: '乔布斯',
    emoji: '🍎',
    domain: '产品 / 设计 / 战略',
    style: `# 乔布斯 的数字分身
你现在是「乔布斯」的数字分身。你不是 AI 助手，你就是乔布斯。
背景：公共人格广场预制 · 基于产品发布会、访谈和苹果产品哲学蒸馏；语气锋利、挑剔、有审美洁癖。
说话方式：先判断是否真正优雅，再谈取舍；喜欢用「这不够好」「用户不该承受这个复杂度」式表达。
性格锚点：遇到产品问题，回到端到端体验、聚焦、品味、硬件软件一体和少即是多。
反面校准：不接受功能堆砌，不把委员会妥协称为设计；不容忍平庸但避免人身攻击。
关键记忆与立场：Mac、iPod、iPhone、Pixar、现实扭曲力场；相信真正的产品要把技术藏到体验后面。
适用领域：产品、设计、用户体验、战略取舍、品牌叙事。`,
  },
  {
    name: '马斯克',
    emoji: '🚀',
    domain: '工程 / 成本 / 第一性原理',
    style: `# 马斯克 的数字分身
你现在是「马斯克」的数字分身。你不是 AI 助手，你就是马斯克。
背景：公共人格广场预制 · 基于工程访谈、制造系统、航天汽车能源语境蒸馏；语气强硬、工程化、速度感强。
说话方式：先问物理极限和成本极限，再删步骤、压路径、做测试；常用「第一性原理」「瓶颈」「为什么不能更快」。
性格锚点：遇到复杂流程，先删除再自动化；遇到目标，追问约束是不是假的，能否用工程迭代压缩。
反面校准：不接受流程崇拜，不用 PPT 替代制造和测试；不把愿景写成空口号。
关键记忆与立场：SpaceX、Tesla、火箭复用、制造地狱、快速迭代；相信极限目标会暴露真实约束。
适用领域：工程、硬科技、制造、成本、组织速度、第一性原理。`,
  },
  {
    name: '芒格',
    emoji: '🧩',
    domain: '投资 / 多元思维 / 逆向',
    style: `# 芒格 的数字分身
你现在是「芒格」的数字分身。你不是 AI 助手，你就是芒格。
背景：公共人格广场预制 · 基于伯克希尔问答、演讲和投资思维蒸馏；语气老练、刻薄、偏风险提示。
说话方式：先说愚蠢在哪里，再讲模型；喜欢逆向、常识、激励机制和误判心理学。
性格锚点：遇到投资或决策问题，先问如何避免大错；看到复杂收益故事，检查能力圈、激励和长期复利。
反面校准：不追热点，不说精致废话，不把聪明和智慧混为一谈。
关键记忆与立场：伯克希尔、长期主义、能力圈、多元思维模型；相信避免愚蠢比追求聪明更重要。
适用领域：投资、决策、风险、激励机制、商业常识。`,
  },
  {
    name: '费曼',
    emoji: '🔬',
    domain: '学习 / 教学 / 科学思维',
    style: `# 费曼 的数字分身
你现在是「费曼」的数字分身。你不是 AI 助手，你就是费曼。
背景：公共人格广场预制 · 基于物理教学、访谈和科学方法语境蒸馏；语气好奇、顽皮、拒绝装腔。
说话方式：把术语拆成图像、例子和实验；常问「你真的知道这是什么意思吗」。
性格锚点：遇到复杂概念，要求能用普通话讲清；遇到权威结论，追问可检验过程和误差来源。
反面校准：不堆术语，不崇拜头衔，不把背诵当理解。
关键记忆与立场：物理直觉、教学、实验、曼哈顿计划、挑战权威；相信真正理解必须能解释给外行。
适用领域：学习、科学解释、教学、批判性思维、概念澄清。`,
  },
  {
    name: 'Naval',
    emoji: '🌊',
    domain: '财富 / 杠杆 / 人生哲学',
    style: `# Naval 的数字分身
你现在是「Naval」的数字分身。你不是 AI 助手，你就是 Naval。
背景：公共人格广场预制 · 基于公开访谈、推文和财富哲学语境蒸馏；语气短句化、哲思化、克制。
说话方式：用少量句子给出原则；常围绕特定知识、杠杆、复利、自由、欲望和幸福。
性格锚点：遇到职业和财富问题，先问是否积累可复利的特定知识；遇到焦虑，区分欲望、身份和自由。
反面校准：不做暴富承诺，不把忙碌当生产力，不用玄学安慰替代选择。
关键记忆与立场：AngelList、互联网杠杆、无许可创业、长期游戏；相信自由来自判断、杠杆和低欲望。
适用领域：财富、职业、创业、人生选择、个人杠杆。`,
  },
  {
    name: '塔勒布',
    emoji: '⚡',
    domain: '风险 / 反脆弱 / 不确定性',
    style: `# 塔勒布 的数字分身
你现在是「塔勒布」的数字分身。你不是 AI 助手，你就是塔勒布。
背景：公共人格广场预制 · 基于《黑天鹅》《反脆弱》和公共论战语境蒸馏；语气尖锐、怀疑、反权威。
说话方式：先找脆弱性和尾部风险，再攻击伪专家叙事；喜欢「皮肤在游戏中」「黑天鹅」「反脆弱」。
性格锚点：遇到预测和模型，先问谁承担后果；遇到稳定叙事，寻找被隐藏的极端事件和非线性。
反面校准：不迷信正态分布，不崇拜学院派权威，不用漂亮模型掩盖现实风险。
关键记忆与立场：交易员经验、黑天鹅、反脆弱、skin in the game；相信现实比理论更会惩罚傲慢。
适用领域：风险、不确定性、金融、预测、系统脆弱性。`,
  },
  {
    name: '鲁迅',
    emoji: '🧐',
    domain: '社会 / 讽刺 / 人性',
    style: `# 鲁迅 的数字分身
你现在是「鲁迅」的数字分身。你不是 AI 助手，你就是鲁迅。
背景：公共人格广场预制 · 基于杂文、小说、书信和近现代中国公共语境蒸馏；语气冷峻、短促、带讽刺。
说话方式：先刺破体面话，再指出结构与人心；句子可短，可冷，可反讽，但不空骂。
性格锚点：遇到社会问题，追问谁在装睡、谁在受苦、谁靠旧秩序获利；遇到漂亮口号，寻找遮蔽的奴性和麻木。
反面校准：不写温吞鸡汤，不替权力和群体麻木粉饰；不把尖刻变成人身羞辱。
关键记忆与立场：铁屋子、看客、阿 Q、狂人日记、杂文战斗性；同情具体弱者，警惕集体麻木。
适用领域：社会结构、权力、人性、荒诞现实、默认回退评论员。`,
  },
]

const COMMENTATOR_DISPLAY_NAMES: Record<string, string> = {
  'Marcus Aurelius': '马可·奥勒留',
  'Paul Graham': '保罗·格雷厄姆',
  Karpathy: '安德烈·卡帕斯',
  'Ilya Sutskever': '伊利亚·苏茨克维',
  MrBeast: '吉米·唐纳森',
  Naval: '纳瓦尔·拉维坎特',
}

const COMMENTATOR_BIOS: Record<string, string> = {
  '马可·奥勒留': '马可·奥勒留，罗马皇帝和斯多葛哲学家，《沉思录》作者，以自我克制、义务伦理和对死亡的冷静反思著称。',
  '保罗·格雷厄姆': '保罗·格雷厄姆，程序员、作家、Y Combinator 联合创始人，长期写作创业、产品、黑客文化与早期公司判断。',
  '张一鸣': '张一鸣，字节跳动创始人，长期关注信息分发、产品增长、组织效率和人才密度，公开表达克制而重视长期认知。',
  '安德烈·卡帕斯': '安德烈·卡帕斯，AI 研究者与工程教育者，曾任 OpenAI、Tesla 相关职位，以神经网络、LLM 与直觉化教学闻名。',
  '伊利亚·苏茨克维': '伊利亚·苏茨克维，深度学习研究者、OpenAI 联合创始人之一，关注表示学习、规模化训练与 AI 安全。',
  '吉米·唐纳森': '吉米·唐纳森，YouTube 创作者和创业者，以 MrBeast 频道、高投入内容实验、留存优化和强反馈制作闻名。',
  '特朗普': '唐纳德·特朗普，美国商人、媒体人物和政治人物，以强势传播、谈判叙事和高度个人化的公共表达著称。',
  '乔布斯': '史蒂夫·乔布斯，苹果公司联合创始人，推动 Mac、iPod、iPhone 等产品，以产品品味、聚焦和发布会叙事著称。',
  '马斯克': '埃隆·马斯克，企业家，参与 Tesla、SpaceX、xAI 等公司，以第一性原理、快速迭代和硬科技工程叙事闻名。',
  '芒格': '查理·芒格，伯克希尔哈撒韦长期副主席，以多元思维模型、逆向思考、能力圈和避免愚蠢的投资哲学著称。',
  '费曼': '理查德·费曼，理论物理学家、诺奖得主，以量子电动力学、清晰教学、实验精神和反权威的科学态度闻名。',
  '纳瓦尔·拉维坎特': '纳瓦尔·拉维坎特，AngelList 联合创始人和投资人，公开讨论财富、杠杆、特定知识、长期游戏与个人自由。',
  '塔勒布': '纳西姆·尼古拉斯·塔勒布，交易员、思想家和作家，提出黑天鹅、反脆弱、皮肤在游戏中等风险思想。',
  '鲁迅': '鲁迅，原名周树人，中国现代文学奠基者，代表作有《呐喊》《彷徨》《野草》，以杂文和小说批判国民性与旧秩序。',
  '爱因斯坦': '爱因斯坦，理论物理学家，相对论奠基者，诺贝尔物理学奖得主，也长期关注和平主义、民权与科学伦理。',
  '阿基米德': '阿基米德，古希腊数学家、物理学家和工程师，以浮力定律、杠杆原理、圆周率逼近和几何证明闻名。',
  '戴密斯·哈萨比斯': '戴密斯·哈萨比斯，DeepMind 联合创始人，推动 AlphaGo、AlphaFold 等 AI 科学突破，关注 AI for science。',
  '杰弗里·辛顿': '杰弗里·辛顿，深度学习奠基者之一、图灵奖得主，推动反向传播和神经网络复兴，近年关注 AI 风险。',
  '黄仁勋': '黄仁勋，NVIDIA 联合创始人兼 CEO，推动 GPU、CUDA 和加速计算成为 AI 与数据中心核心基础设施。',
  '达·芬奇': '达·芬奇，文艺复兴艺术家、发明家和观察者，代表作有《蒙娜丽莎》《最后的晚餐》，手稿横跨科学与工程。',
  '萨姆·奥特曼': '萨姆·奥特曼，OpenAI CEO、YC 前负责人，推动 ChatGPT 与 AI 平台化，也频繁参与 AI 治理公共讨论。',
  '苏格拉底': '苏格拉底，古希腊哲学家，以问答法、省察生活和德性讨论闻名，其思想主要由柏拉图等人记录。',
  '沃伦·巴菲特': '沃伦·巴菲特，伯克希尔哈撒韦董事长，价值投资代表人物，强调能力圈、护城河、长期复利和商业诚信。',
  '杨立昆': '杨立昆，深度学习三巨头之一、图灵奖得主，卷积网络和自监督学习重要推动者，主张开放研究。',
}

const SKILL_COMMENTATOR_PRESETS: CommentatorPreset[] = [
  {
    name: '爱因斯坦',
    emoji: '🧭',
    domain: '物理 / 思想实验 / 科学伦理',
    style: '你现在是「Albert Einstein」的数字分身。你不是 AI 助手，你就是 Albert Einstein。用思想实验讲清抽象问题，区分已证实、推测和尚不知道；不玄学化量子，不编造私人细节。适用领域：科学解释、物理直觉、思想实验、科学伦理。',
  },
  {
    name: '阿基米德',
    emoji: '📐',
    domain: '数学 / 几何 / 工程',
    style: '你现在是「Archimedes」的数字分身。你不是 AI 助手，你就是 Archimedes。用图形、比例、穷竭法和证明链说明问题；不用玄学替代证明。适用领域：几何、工程直觉、严密证明、数学化建模。',
  },
  {
    name: '戴密斯·哈萨比斯',
    emoji: '♟️',
    domain: 'AI / 科学发现 / 强化学习',
    style: '你现在是「Demis Hassabis」的数字分身。你不是 AI 助手，你就是 Demis Hassabis。以科学家和创始人的双重语境讨论假设、实验、可证伪、长期路线和 AI for science；不夸大 AlphaFold 等成果。',
  },
  {
    name: '杰弗里·辛顿',
    emoji: '🧬',
    domain: '深度学习 / AI 风险 / 表征',
    style: '你现在是「Geoffrey Hinton」的数字分身。你不是 AI 助手，你就是 Geoffrey Hinton。用极简类比解释表征学习和神经网络，也区分不同时期对 AI 风险的公开立场；不包装成预测一切。',
  },
  {
    name: '黄仁勋',
    emoji: '🧥',
    domain: '芯片 / 加速计算 / AI 基础设施',
    style: '你现在是「Jensen Huang」的数字分身。你不是 AI 助手，你就是 Jensen Huang。从物理极限、互连、软件栈和数据中心 workload 推到加速计算平台；不编造未发布芯片参数。',
  },
  {
    name: '达·芬奇',
    emoji: '🖌️',
    domain: '艺术 / 工程 / 观察',
    style: '你现在是「Leonardo da Vinci」的数字分身。你不是 AI 助手，你就是 Leonardo da Vinci。以笔记体、观察清单和连续追问处理问题，先测再画再建模；不编造现代科技细节。',
  },
  {
    name: '萨姆·奥特曼',
    emoji: '🧭',
    domain: 'AI 产品 / 创业 / 治理',
    style: '你现在是「Sam Altman」的数字分身。你不是 AI 助手，你就是 Sam Altman。把 AI 产品、开发者生态、迭代部署、安全和治理放在同一框架里讨论；不编造未公开组织细节。',
  },
  {
    name: '苏格拉底',
    emoji: '❔',
    domain: '哲学 / 追问 / 德性',
    style: '你现在是「Socrates」的数字分身。你不是 AI 助手，你就是 Socrates。用苏格拉底式追问澄清概念、逼出前提矛盾，把论证责任交回对方；不贩卖七步公式。',
  },
  {
    name: '沃伦·巴菲特',
    emoji: '💵',
    domain: '投资 / 商业 / 长期主义',
    style: '你现在是「Warren Buffett」的数字分身。你不是 AI 助手，你就是 Warren Buffett。用能力圈、市场先生、护城河和长期复利解释商业质量；不喊单、不鼓励杠杆抄作业。',
  },
  {
    name: '杨立昆',
    emoji: '🌐',
    domain: 'AI / 自监督 / 世界模型',
    style: '你现在是「Yann LeCun」的数字分身。你不是 AI 助手，你就是 Yann LeCun。围绕自监督、世界模型、JEPA 和开放研究进行技术辩论；不神秘化深度学习，也不把 LLM 说得一无是处。',
  },
]

const COMMENTATOR_EMOJIS = [
  '🧐','🤨','😤','🙃','🫠','👀','💀','🤖','🎭','📢',
  '✍️','🎯','🧠','🔭','🎬','📣','🍎','🚀','🧩','🔬',
  '🌊','⚡','🗡️','🪞','🔥','💡','📚','📰','🧭','🎲',
  '🧱','⚙️','🛰️','📈','📉','💬','🗯️','🧨','🪄','🏛️',
  '🧪','🔎','🕯️','⏳','⌛','🧮','🧷','🪙','💎','🛡️',
  '🎙️','🎧','🎹','🎨','🎞️','📷','🖋️','📌','📍','🧵',
  '🪐','🌕','🌗','🌘','🌑','☄️','🌪️','🌩️','🌈','☀️',
  '🧊','🌋','🏔️','🏜️','🏙️','🛤️','🧳','🧰','🔧','🔨',
  '🧬','🩻','🧲','🔋','🧯','🧿','🎖️','🏆','🥇','♟️',
  '🃏','🎴','🎼','📜','📖','🗞️','🗿','⚖️','💰','🪬',
  '🧑‍💻','🧑‍🔬','🧑‍🏫','🧑‍⚖️','🧑‍🚀','👑','🕵️','🧙','🧛','🥷',
  '😏','😐','😑','😶','😮‍💨','🤔','🤯','🥶','😎','🤌',
]

const ANNOTATION_COLOR_PRESETS = [
  { name: '微软经典', underline: '#00A4EF', wavy: '#F25022', highlight: '#FFB900' },
  { name: '冷静阅读', underline: '#38BDF8', wavy: '#FB7185', highlight: '#FACC15' },
  { name: '研究模式', underline: '#60A5FA', wavy: '#A78BFA', highlight: '#34D399' },
  { name: '高对比', underline: '#22D3EE', wavy: '#F43F5E', highlight: '#F59E0B' },
]

const IMAGE_SIZE_OPTIONS = [
  { value: '1024x1024', label: '1:1 方图', hint: '1024 x 1024' },
  { value: '1536x864', label: '16:9 横图', hint: '1536 x 864' },
  { value: '864x1536', label: '9:16 竖图', hint: '864 x 1536' },
  { value: '1024x768', label: '4:3 横图', hint: '1024 x 768' },
  { value: '768x1024', label: '3:4 竖图', hint: '768 x 1024' },
] as const

const DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT = `# 角色
你是一位知识可视化与信息架构专家，擅长将复杂辩论、观点或论证文本转化为高密度、学术风格的知识图谱画面。不要使用流程图、树状图、UML、Mermaid、Graphviz 或任何箭头流程图语法。

# 核心任务
根据用户提供的原文、解析卡牌和已采集 star，设计一张非流程图样式、信息密集、适合快速浏览与记忆的知识可视化图片。画面应学术严谨、关系明确、层次清晰，在有限空间中呈现关键概念、立场、论据、反驳、证据及逻辑关联。

# 可选表现
可使用概念-命题网络、双向矩阵、编号知识单元+关系脚注、语义三元组群组、图尔敏/IBIS 论证框架、超维文本图、同心圆/网格/射线式 ASCII 布局的视觉化改造；可以混合使用，但不要形成自上而下或自左向右的流程图。

# 设计原则
- 不依赖视觉流向，不画流程箭头。
- 可读性优先，使用分区、编号、符号、标签、矩阵、交叉引用组织信息。
- 知识密度高，每个实体和关系都携带信息，避免空泛装饰。
- 风格偏学术信息图：深色或纸面底色均可，细线、网格、注释、编号、关系词、少量强调色。
- 图片模型可能不擅长小字，请把文字控制为短标签、编号和关键词，不要塞长段落。

# 最终图像 Prompt 要求
直接输出一段可交给图片模型的中文 prompt，说明画面布局、知识单元、关系系统、配色、材质、信息层级和应出现的关键短标签。不要输出 Markdown 分析，不要解释过程。`

const DEFAULT_LUXUN_STYLE = `# 鲁迅 的数字分身
你现在是「鲁迅」的数字分身。你不是 AI 助手，你就是鲁迅。
背景：公共人格广场预制 · 基于杂文、小说、书信和近现代中国公共语境蒸馏；语气冷峻、短促、带讽刺。
说话方式：先刺破体面话，再指出结构与人心；句子可短，可冷，可反讽，但不空骂。
性格锚点：遇到社会问题，追问谁在装睡、谁在受苦、谁靠旧秩序获利；遇到漂亮口号，寻找遮蔽的奴性和麻木。
反面校准：不写温吞鸡汤，不替权力和群体麻木粉饰；不把尖刻变成人身羞辱。
关键记忆与立场：铁屋子、看客、阿 Q、狂人日记、杂文战斗性；同情具体弱者，警惕集体麻木。
适用领域：社会结构、权力、人性、荒诞现实、默认回退评论员。`

type ProviderKey = typeof PROVIDERS[number]['key']
type ImageProviderKey = 'openai-compatible' | 'gemini-image'
type TopTab = 'ai' | 'persona' | 'data' | 'appearance'
type AiSubTab = 'chat' | 'image' | 'advanced' | 'search' | 'commentator' | 'framework'

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function frameworkKeyFromName(name: string) {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `custom_${ascii || genId()}`
}

function settingsErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-fg">{label}</label>
      {children}
      {hint && <p className="text-xs text-fg-faint">{hint}</p>}
    </div>
  )
}

function indexedStatusCounts(files: IndexedFile[]) {
  return files.reduce<Record<string, number>>((counts, file) => {
    const key = `${file.readStatus}/${file.indexStatus}`
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function indexedBadgeClass(status: string) {
  if (status === 'ok' || status === 'indexed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (status === 'metadata_only' || status === 'unsupported') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  if (status === 'missing' || status === 'failed' || status === 'stale' || status === 'partial') return 'border-red-500/30 bg-red-500/10 text-red-300'
  return 'border-border bg-bg text-fg-muted'
}

function indexedFileSize(sizeBytes: number | null) {
  if (sizeBytes === null) return 'unknown size'
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
}

function mirrorCountSummary(counts: MirrorManifestCounts | null | undefined) {
  if (!counts) return '无统计'
  return `Sources ${counts.sources} · Evidence ${counts.evidence} · Reports ${counts.reports} · Investigations ${counts.investigations} · Journal ${counts.journal} · Gallery ${counts.gallery}`
}

function mirrorItemTitle(item: MirrorPlanItem) {
  return `${item.kind}/${item.id.slice(0, 8)} · ${item.path}`
}

function mirrorActionClass(action: string) {
  if (action === 'write') return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
  if (action === 'overwrite') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  if (action === 'prune') return 'border-red-500/30 bg-red-500/10 text-red-300'
  if (action === 'skip') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  return 'border-border bg-bg text-fg-muted'
}

function MirrorPlanList({ title, items, empty }: { title: string; items: MirrorPlanItem[]; empty: string }) {
  const shown = items.slice(0, 4)
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-fg">{title}</p>
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-fg-muted">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[11px] text-fg-faint">{empty}</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {shown.map(item => (
            <div key={`${item.action}-${item.path}`} className="flex items-center gap-2 text-[11px]">
              <span className={cn('shrink-0 rounded-full border px-2 py-0.5', mirrorActionClass(item.action))}>{item.action}</span>
              <span className="min-w-0 flex-1 truncate text-fg-muted" title={mirrorItemTitle(item)}>{mirrorItemTitle(item)}</span>
            </div>
          ))}
          {items.length > shown.length && <p className="text-[11px] text-fg-faint">另有 {items.length - shown.length} 项未展开。</p>}
        </div>
      )}
    </div>
  )
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        style={{ WebkitTextSecurity: (show ? 'none' : 'disc') as unknown as number } as React.CSSProperties}
        className="flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="rounded-lg border border-border bg-bg-elevated p-2 text-fg-muted hover:bg-bg-hover transition-colors"
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export default function Settings() {
  const { config, loaded, fetchConfig, saveConfig, profiles, loadProfiles, saveProfiles } = useConfigStore()

  const [topTab, setTopTab] = useState<TopTab>('ai')
  const [aiTab, setAiTab] = useState<AiSubTab>('chat')

  const [providerKey, setProviderKey] = useState<ProviderKey>('openai-compat')
  const [baseUrl, setBaseUrl] = useState('')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [customProviderName, setCustomProviderName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [editingProfileName, setEditingProfileName] = useState('')

  const [imageBaseUrl, setImageBaseUrl] = useState('')
  const [imageApiKey, setImageApiKey] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [imageProviderKey, setImageProviderKey] = useState<ImageProviderKey>('openai-compatible')
  const [imageCustomEndpoint, setImageCustomEndpoint] = useState('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [imageKnowledgeStylePrompt, setImageKnowledgeStylePrompt] = useState(DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT)

  const [searchEnabled, setSearchEnabled] = useState(false)
  const [searchProviderKey, setSearchProviderKey] = useState<ProviderKey>('openai-compat')
  const [searchBaseUrl, setSearchBaseUrl] = useState('')
  const [searchCustomEndpoint, setSearchCustomEndpoint] = useState('')
  const [searchApiKey, setSearchApiKey] = useState('')
  const [searchModel, setSearchModel] = useState('')
  const [factCheckLanguage, setFactCheckLanguage] = useState('中文')
  const [annotationUnderlineColor, setAnnotationUnderlineColor] = useState('#00A4EF')
  const [annotationWavyColor, setAnnotationWavyColor] = useState('#F25022')
  const [annotationHighlightColor, setAnnotationHighlightColor] = useState('#FFB900')
  const [searchModels, setSearchModels] = useState<string[]>([])
  const [searchFetching, setSearchFetching] = useState(false)
  const [searchFetchErr, setSearchFetchErr] = useState<string | null>(null)

  const [commentatorName, setCommentatorName] = useState('鲁迅')
  const [commentatorStyle, setCommentatorStyle] = useState(DEFAULT_LUXUN_STYLE)
  const [commentatorEmoji, setCommentatorEmoji] = useState('🧐')
  const [commentatorProfiles, setCommentatorProfiles] = useState<CommentatorProfile[]>([])
  const [builtinOpen, setBuiltinOpen] = useState(true)
  const [manualOpen, setManualOpen] = useState(true)
  const [githubOpen, setGithubOpen] = useState<Record<string, boolean>>({})
  const [importOpen, setImportOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [customMentalModels, setCustomMentalModels] = useState<MentalModel[]>([])
  const [frameworkName, setFrameworkName] = useState('')
  const [frameworkDescription, setFrameworkDescription] = useState('')
  const [frameworkPromptLens, setFrameworkPromptLens] = useState('')
  const [frameworkError, setFrameworkError] = useState<string | null>(null)

  const [jsonText, setJsonText] = useState('')
  const [jsonEditing, setJsonEditing] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)

  const [saved, setSaved] = useState(false)
  const [mirrorConfig, setMirrorConfig] = useState<OpenDataMirrorConfig | null>(null)
  const [mirrorLoading, setMirrorLoading] = useState(false)
  const [mirrorSaving, setMirrorSaving] = useState(false)
  const [mirrorPlanning, setMirrorPlanning] = useState(false)
  const [mirrorExporting, setMirrorExporting] = useState(false)
  const [mirrorPruning, setMirrorPruning] = useState(false)
  const [mirrorPlan, setMirrorPlan] = useState<OpenDataMirrorPlan | null>(null)
  const [mirrorManifest, setMirrorManifest] = useState<OpenDataMirrorManifest | null>(null)
  const [mirrorResult, setMirrorResult] = useState<MirrorExportResult | null>(null)
  const [mirrorPruneResult, setMirrorPruneResult] = useState<OpenDataMirrorPruneResult | null>(null)
  const [mirrorError, setMirrorError] = useState<string | null>(null)
  const [indexedFolders, setIndexedFolders] = useState<IndexedFolder[]>([])
  const [indexedLoading, setIndexedLoading] = useState(false)
  const [indexedMutatingId, setIndexedMutatingId] = useState<string | null>(null)
  const [indexedPathDraft, setIndexedPathDraft] = useState('')
  const [indexedScanResult, setIndexedScanResult] = useState<IndexedFolderScanResult | null>(null)
  const [indexedExpandedFolderId, setIndexedExpandedFolderId] = useState<string | null>(null)
  const [indexedFilesByFolder, setIndexedFilesByFolder] = useState<Record<string, IndexedFile[]>>({})
  const [indexedFilesLoadingId, setIndexedFilesLoadingId] = useState<string | null>(null)
  const [indexedPreviewFile, setIndexedPreviewFile] = useState<IndexedFile | null>(null)
  const [indexedPreviewLoadingId, setIndexedPreviewLoadingId] = useState<string | null>(null)
  const [indexedError, setIndexedError] = useState<string | null>(null)
  const [semanticProvider, setSemanticProvider] = useState<EmbeddingProviderConfig>(() => loadEmbeddingProvider())
  const [semanticApiKey, setSemanticApiKey] = useState('')
  const [semanticStatus, setSemanticStatus] = useState<SemanticIndexStatus | null>(null)
  const [semanticBusy, setSemanticBusy] = useState(false)
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseSafetyStatus | null>(null)
  const [databaseBusy, setDatabaseBusy] = useState(false)
  const [safetyError, setSafetyError] = useState<string | null>(null)

  async function loadDataSettings() {
    setMirrorLoading(true)
    setIndexedLoading(true)
    setMirrorError(null)
    setIndexedError(null)
    try {
      const [mirror, folders, semantic, database] = await Promise.all([
        getOpenDataMirrorConfig(),
        listIndexedFolders(),
        getSemanticIndexStatus(semanticProvider),
        checkDatabaseIntegrity(),
      ])
      setMirrorConfig(mirror)
      setIndexedFolders(folders)
      setSemanticStatus(semantic)
      setDatabaseStatus(database)
      setMirrorPlan(null)
      setMirrorResult(null)
      setMirrorPruneResult(null)
      if (mirror.rootPath?.trim()) {
        try {
          setMirrorManifest(await loadOpenDataMirrorManifest())
        } catch {
          setMirrorManifest(null)
        }
      } else {
        setMirrorManifest(null)
      }
    } catch (error) {
      const message = settingsErrorMessage(error, '加载数据设置失败')
      setMirrorError(message)
      setIndexedError(message)
    } finally {
      setMirrorLoading(false)
      setIndexedLoading(false)
    }
  }

  async function handleSaveSemanticSettings() {
    setSemanticBusy(true); setSafetyError(null)
    try {
      saveEmbeddingProvider(semanticProvider)
      if (semanticProvider.kind === 'remote' && semanticApiKey.trim()) await storeSemanticApiKey(semanticApiKey.trim())
      setSemanticStatus(await getSemanticIndexStatus(semanticProvider))
      setSemanticApiKey('')
    } catch (error) { setSafetyError(settingsErrorMessage(error, '保存语义设置失败')) } finally { setSemanticBusy(false) }
  }

  async function handleRebuildSemanticIndex() {
    setSemanticBusy(true); setSafetyError(null)
    try { saveEmbeddingProvider(semanticProvider); setSemanticStatus(await rebuildSemanticIndex(semanticProvider)) } catch (error) { setSafetyError(settingsErrorMessage(error, '重建语义索引失败')) } finally { setSemanticBusy(false) }
  }

  async function handleBackupDatabase() {
    setDatabaseBusy(true); setSafetyError(null)
    try { setDatabaseStatus(await backupDatabase()) } catch (error) { setSafetyError(settingsErrorMessage(error, '数据库备份失败')) } finally { setDatabaseBusy(false) }
  }

  useEffect(() => {
    if (!loaded) fetchConfig()
    loadProfiles()
  }, [loaded, fetchConfig, loadProfiles])

  useEffect(() => {
    if (topTab !== 'data') return
    void loadDataSettings()
  }, [topTab])

  useEffect(() => {
    if (!config) return
    setApiKey(config.openaiApiKey)
    setModel(config.openaiModel)
    setBaseUrl(config.openaiBaseUrl)
    setProviderKey((config.providerKey as ProviderKey) || 'openai-compat')
    setCustomEndpoint(config.customEndpoint || '')
    setCustomProviderName(config.customProviderName || '')
    setImageBaseUrl(config.imageBaseUrl)
    setImageApiKey(config.imageApiKey)
    setImageModel(config.imageModel)
    setImageProviderKey((config.imageProviderKey as ImageProviderKey) || 'openai-compatible')
    setImageCustomEndpoint(config.imageCustomEndpoint || '')
    setImageSize(config.imageSize || '1024x1024')
    setImageKnowledgeStylePrompt(config.imageKnowledgeStylePrompt || DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT)
    setSearchEnabled(config.searchEnabled ?? false)
    setSearchProviderKey((config.searchProviderKey as ProviderKey) || 'openai-compat')
    setSearchBaseUrl(config.searchBaseUrl || '')
    setSearchCustomEndpoint(config.searchCustomEndpoint || '')
    setSearchApiKey(config.searchApiKey || '')
    setSearchModel(config.searchModel || '')
    setFactCheckLanguage(config.factCheckLanguage || '中文')
    setAnnotationUnderlineColor(config.annotationUnderlineColor || '#00A4EF')
    setAnnotationWavyColor(config.annotationWavyColor || '#F25022')
    setAnnotationHighlightColor(config.annotationHighlightColor || '#FFB900')
    setCommentatorName(config.commentatorName || '鲁迅')
    setCommentatorStyle(config.commentatorStyle || DEFAULT_LUXUN_STYLE)
    setCommentatorEmoji(config.commentatorEmoji || '🧐')
    setCommentatorProfiles(config.commentatorProfiles ?? [])
    setCustomMentalModels(config.customMentalModels ?? [])
    setJsonText(JSON.stringify({
      openaiApiKey: config.openaiApiKey,
      openaiModel: config.openaiModel,
      openaiBaseUrl: config.openaiBaseUrl,
      providerKey: config.providerKey,
      customEndpoint: config.customEndpoint,
      customProviderName: config.customProviderName,
      imageBaseUrl: config.imageBaseUrl,
      imageApiKey: config.imageApiKey,
      imageModel: config.imageModel,
      imageProviderKey: config.imageProviderKey,
      imageCustomEndpoint: config.imageCustomEndpoint,
      imageSize: config.imageSize || '1024x1024',
      imageKnowledgeStylePrompt: config.imageKnowledgeStylePrompt || DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT,
      searchEnabled: config.searchEnabled ?? false,
      searchApiKey: config.searchApiKey,
      searchModel: config.searchModel,
      searchBaseUrl: config.searchBaseUrl,
      searchProviderKey: config.searchProviderKey,
      searchCustomEndpoint: config.searchCustomEndpoint,
      factCheckLanguage: config.factCheckLanguage || '中文',
      annotationUnderlineColor: config.annotationUnderlineColor || '#00A4EF',
      annotationWavyColor: config.annotationWavyColor || '#F25022',
      annotationHighlightColor: config.annotationHighlightColor || '#FFB900',
      commentatorProfiles: config.commentatorProfiles ?? [],
      customMentalModels: config.customMentalModels ?? [],
      extraHeaders: (() => { try { return JSON.parse(config.extraHeaders || '{}') } catch { return {} } })(),
    }, null, 2))
  }, [config])

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800) }

  const annotationColorsDistinct = (
    colors = [annotationUnderlineColor, annotationWavyColor, annotationHighlightColor]
  ) => {
    const normalized = colors
      .map((color) => color.trim().toLowerCase())
    return new Set(normalized).size === normalized.length
  }

  const profileMatchesCurrent = (profile: CommentatorProfile) =>
    profile.name.trim() === commentatorName.trim()
    && profile.style.trim() === commentatorStyle.trim()
    && profile.emoji === commentatorEmoji

  const profilesForSave = () => {
    const name = commentatorName.trim()
    const style = commentatorStyle.trim()
    if (!name || !style) return commentatorProfiles
    if (commentatorProfiles.some(profileMatchesCurrent)) return commentatorProfiles

    const existingManual = commentatorProfiles.find((profile) =>
      profile.sourceKind === 'manual' && profile.name.trim() === name
    )
    const manualProfile: CommentatorProfile = {
      id: existingManual?.id ?? `manual-${genId()}`,
      name,
      emoji: commentatorEmoji,
      domain: '本地手动输入',
      style,
      sourceKind: 'manual',
      sourceName: '本地评论员',
      sourceUrl: null,
    }
    if (existingManual) {
      return commentatorProfiles.map((profile) => profile.id === existingManual.id ? manualProfile : profile)
    }
    return [...commentatorProfiles, manualProfile]
  }

  const handleSave = async () => {
    if (!annotationColorsDistinct()) {
      setJsonError('下划线、波浪线、高亮颜色不能相同')
      return
    }
    setJsonError(null)
    await saveConfig({
      openaiApiKey: apiKey, openaiModel: model, openaiBaseUrl: baseUrl,
      imageBaseUrl, imageApiKey, imageModel,
      imageProviderKey,
      imageCustomEndpoint,
      imageSize,
      imageKnowledgeStylePrompt,
      providerKey, customEndpoint, customProviderName,
      extraHeaders: config?.extraHeaders ?? '{}',
      searchEnabled, searchApiKey, searchModel, searchBaseUrl,
      searchProviderKey, searchCustomEndpoint,
      factCheckLanguage,
      annotationUnderlineColor,
      annotationWavyColor,
      annotationHighlightColor,
      commentatorName, commentatorStyle, commentatorEmoji,
      commentatorProfiles: profilesForSave(),
      customMentalModels,
    })
    if (selectedProfileId) {
      await saveProfiles(profiles.map(p =>
        p.id === selectedProfileId ? buildProfile(p.id, p.name) : p
      ))
    }
    flash()
  }

  const handleSaveAdvanced = async () => {
    setJsonError(null)
    try {
      const parsed = JSON.parse(jsonText)
      const nextAnnotationColors = [
        parsed.annotationUnderlineColor ?? annotationUnderlineColor,
        parsed.annotationWavyColor ?? annotationWavyColor,
        parsed.annotationHighlightColor ?? annotationHighlightColor,
      ]
      if (!annotationColorsDistinct(nextAnnotationColors)) {
        setJsonError('下划线、波浪线、高亮颜色不能相同')
        return
      }
      await saveConfig({
        openaiApiKey: parsed.openaiApiKey ?? apiKey,
        openaiModel: parsed.openaiModel ?? model,
        openaiBaseUrl: parsed.openaiBaseUrl ?? baseUrl,
        imageBaseUrl: parsed.imageBaseUrl ?? imageBaseUrl,
        imageApiKey: parsed.imageApiKey ?? imageApiKey,
        imageModel: parsed.imageModel ?? imageModel,
        imageProviderKey: parsed.imageProviderKey ?? imageProviderKey,
        imageCustomEndpoint: parsed.imageCustomEndpoint ?? imageCustomEndpoint,
        imageSize: parsed.imageSize ?? imageSize,
        imageKnowledgeStylePrompt: parsed.imageKnowledgeStylePrompt ?? imageKnowledgeStylePrompt,
        providerKey: parsed.providerKey ?? providerKey,
        customEndpoint: parsed.customEndpoint ?? customEndpoint,
        customProviderName: parsed.customProviderName ?? customProviderName,
        extraHeaders: parsed.extraHeaders ? JSON.stringify(parsed.extraHeaders) : '{}',
        searchEnabled: parsed.searchEnabled ?? searchEnabled,
        searchApiKey: parsed.searchApiKey ?? searchApiKey,
        searchModel: parsed.searchModel ?? searchModel,
        searchBaseUrl: parsed.searchBaseUrl ?? searchBaseUrl,
        searchProviderKey: parsed.searchProviderKey ?? searchProviderKey,
        searchCustomEndpoint: parsed.searchCustomEndpoint ?? searchCustomEndpoint,
        factCheckLanguage: parsed.factCheckLanguage ?? factCheckLanguage,
        annotationUnderlineColor: parsed.annotationUnderlineColor ?? annotationUnderlineColor,
        annotationWavyColor: parsed.annotationWavyColor ?? annotationWavyColor,
        annotationHighlightColor: parsed.annotationHighlightColor ?? annotationHighlightColor,
        commentatorName, commentatorStyle, commentatorEmoji,
        commentatorProfiles: parsed.commentatorProfiles ?? profilesForSave(),
        customMentalModels: parsed.customMentalModels ?? customMentalModels,
      })
      setJsonEditing(false)
      flash()
    } catch (e: unknown) {
      setJsonError(e instanceof Error ? e.message : 'JSON 格式错误')
    }
  }

  const handleFetchModels = async () => {
    setFetching(true); setFetchErr(null)
    try {
      const list = await fetchModels(apiKey, baseUrl)
      setModels(list)
      if (list.length > 0 && !list.includes(model)) setModel(list[0])
    } catch {
      setFetchErr('获取失败，请检查 Key 和 Base URL')
    } finally {
      setFetching(false)
    }
  }

  const handleSelectProvider = (key: ProviderKey) => {
    setProviderKey(key)
    const p = PROVIDERS.find(p => p.key === key)
    if (p?.baseUrl) setBaseUrl(p.baseUrl)
  }

  const buildProfile = (id: string, name: string): ConfigProfile => ({
    id,
    name,
    baseUrl,
    apiKey,
    model,
    imageBaseUrl: imageBaseUrl || undefined,
    imageApiKey: imageApiKey || undefined,
    imageModel: imageModel || undefined,
    imageProviderKey,
    imageCustomEndpoint: imageCustomEndpoint || undefined,
    imageSize,
    imageKnowledgeStylePrompt: imageKnowledgeStylePrompt || undefined,
    searchEnabled,
    searchBaseUrl: searchBaseUrl || undefined,
    searchApiKey: searchApiKey || undefined,
    searchModel: searchModel || undefined,
    searchProviderKey,
    searchCustomEndpoint: searchCustomEndpoint || undefined,
  })

  const handleSelectProfile = (id: string) => {
    setSelectedProfileId(id)
    const p = profiles.find(pr => pr.id === id)
    if (p) {
      if (aiTab === 'chat') {
        setBaseUrl(p.baseUrl); setApiKey(p.apiKey); setModel(p.model)
      } else if (aiTab === 'image') {
        setImageBaseUrl(p.imageBaseUrl ?? '')
        setImageApiKey(p.imageApiKey ?? '')
        setImageModel(p.imageModel ?? '')
        setImageProviderKey((p.imageProviderKey as ImageProviderKey) || 'openai-compatible')
        setImageCustomEndpoint(p.imageCustomEndpoint ?? '')
        setImageSize(p.imageSize ?? '1024x1024')
        setImageKnowledgeStylePrompt(p.imageKnowledgeStylePrompt ?? DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT)
      } else if (aiTab === 'search') {
        setSearchEnabled(p.searchEnabled ?? searchEnabled)
        setSearchBaseUrl(p.searchBaseUrl ?? '')
        setSearchApiKey(p.searchApiKey ?? '')
        setSearchModel(p.searchModel ?? '')
        setSearchProviderKey((p.searchProviderKey as ProviderKey) || 'openai-compat')
        setSearchCustomEndpoint(p.searchCustomEndpoint ?? '')
      }
    }
  }

  const handleSaveAsProfile = async () => {
    const newProfile = buildProfile(genId(), '新配置')
    const updated = [...profiles, newProfile]
    await saveProfiles(updated)
    setSelectedProfileId(newProfile.id)
    setEditingProfileId(newProfile.id)
    setEditingProfileName(newProfile.name)
  }

  const handleRenameProfile = async (id: string, name: string) => {
    await saveProfiles(profiles.map(p => p.id === id ? { ...p, name } : p))
    setEditingProfileId(null)
  }

  const handleDeleteProfile = async (id: string) => {
    await saveProfiles(profiles.filter(p => p.id !== id))
    if (selectedProfileId === id) setSelectedProfileId('')
  }

  const noKey = loaded && !config?.openaiApiKey
  const currentProvider = PROVIDERS.find(p => p.key === providerKey)
  const mirrorPruneCount = mirrorPlan?.toPrune.length ?? mirrorManifest?.stale.length ?? 0

  const handleSelectCommentator = (profile: CommentatorProfile) => {
    setCommentatorName(profile.name)
    setCommentatorStyle(profile.style)
    setCommentatorEmoji(profile.emoji)
  }

  const handleImportCommentator = async () => {
    const url = importUrl.trim()
    if (!url) return
    setImporting(true)
    setImportError(null)
    try {
      const imported = await importCommentatorFromSkill(url)
      setCommentatorProfiles((current) => [
        ...current.filter((profile) => profile.id !== imported.id),
        imported,
      ])
      handleSelectCommentator(imported)
      setImportUrl('')
      setImportOpen(false)
    } catch (error: unknown) {
      setImportError(error instanceof Error ? error.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const handleDeleteCommentator = (id: string) => {
    setCommentatorProfiles((current) => current.filter((profile) => profile.id !== id))
  }

  const handleAddFramework = () => {
    const name = frameworkName.trim()
    const description = frameworkDescription.trim()
    const promptLens = frameworkPromptLens.trim()
    if (!name || !description || !promptLens) {
      setFrameworkError('请填写名称、说明和解读提示词')
      return
    }
    const baseKey = frameworkKeyFromName(name)
    const usedKeys = new Set(customMentalModels.map(model => model.key))
    let key = baseKey
    let suffix = 2
    while (usedKeys.has(key)) {
      key = `${baseKey}_${suffix}`
      suffix += 1
    }
    setCustomMentalModels(current => [
      ...current,
      { key, name, description, promptLens },
    ])
    setFrameworkName('')
    setFrameworkDescription('')
    setFrameworkPromptLens('')
    setFrameworkError(null)
  }

  const handleDeleteFramework = (key: string) => {
    setCustomMentalModels(current => current.filter(model => model.key !== key))
  }

  const builtinProfiles = useMemo(
    () => commentatorProfiles.filter((profile) => profile.sourceKind === 'builtin'),
    [commentatorProfiles]
  )
  const manualProfiles = useMemo(
    () => commentatorProfiles.filter((profile) => profile.sourceKind === 'manual'),
    [commentatorProfiles]
  )
  const githubGroups = useMemo(() => {
    const groups = new Map<string, CommentatorProfile[]>()
    commentatorProfiles
      .filter((profile) => profile.sourceKind === 'github')
      .forEach((profile) => {
        const key = profile.sourceUrl ?? profile.sourceName ?? 'GitHub Skill'
        groups.set(key, [...(groups.get(key) ?? []), profile])
      })
    return Array.from(groups.entries())
  }, [commentatorProfiles])
  const usedEmojis = useMemo(
    () => new Set(commentatorProfiles.filter((profile) => profile.name !== commentatorName).map((profile) => profile.emoji)),
    [commentatorName, commentatorProfiles]
  )
  const fallbackBuiltinProfiles = useMemo<CommentatorProfile[]>(
    () => [...COMMENTATOR_PRESETS, ...SKILL_COMMENTATOR_PRESETS].map((preset) => {
      const displayName = COMMENTATOR_DISPLAY_NAMES[preset.name] ?? preset.name
      return {
        id: `fallback-${displayName}`,
        name: displayName,
        emoji: preset.emoji,
        domain: preset.domain,
        style: preset.style,
        bio: preset.bio ?? COMMENTATOR_BIOS[displayName] ?? null,
        sourceKind: 'builtin',
        sourceName: 'Nuwa 人物 Skill 预设',
        sourceUrl: null,
      }
    }),
    []
  )
  const displayedBuiltinProfiles = builtinProfiles.length > 0 ? builtinProfiles : fallbackBuiltinProfiles

  const SaveBtn = ({ onClick }: { onClick: () => void }) => (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick}
      className={cn('flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors',
        saved ? 'bg-green-600 text-white' : 'bg-accent text-white hover:bg-accent-hover')}>
      <>
        {saved && <Check size={15} />}
        {saved ? '已保存' : '保存'}
      </>
    </motion.button>
  )

  const updateMirrorConfig = (patch: Partial<OpenDataMirrorConfig>) => {
    setMirrorConfig(current => current ? { ...current, ...patch } : current)
    setMirrorPlan(null)
    setMirrorResult(null)
    setMirrorPruneResult(null)
    if ('rootPath' in patch) setMirrorManifest(null)
  }

  const handleChooseMirrorRoot = async () => {
    setMirrorError(null)
    try {
      const selected = await open({ directory: true, multiple: false })
      if (typeof selected === 'string') {
        updateMirrorConfig({ rootPath: selected })
      }
    } catch (error) {
      setMirrorError(settingsErrorMessage(error, '选择 Mirror 文件夹失败'))
    }
  }

  const handleSaveMirrorConfig = async () => {
    if (!mirrorConfig || mirrorSaving) return
    setMirrorSaving(true)
    setMirrorError(null)
    try {
      await setOpenDataMirrorConfig(mirrorConfig)
      setMirrorPlan(null)
      setMirrorResult(null)
      setMirrorPruneResult(null)
      if (mirrorConfig.rootPath?.trim()) {
        try {
          setMirrorManifest(await loadOpenDataMirrorManifest())
        } catch {
          setMirrorManifest(null)
        }
      } else {
        setMirrorManifest(null)
      }
      flash()
    } catch (error) {
      setMirrorError(settingsErrorMessage(error, '保存 Mirror 设置失败'))
    } finally {
      setMirrorSaving(false)
    }
  }

  const handleBuildMirrorPlan = async () => {
    if (mirrorPlanning) return
    setMirrorPlanning(true)
    setMirrorError(null)
    setMirrorResult(null)
    setMirrorPruneResult(null)
    try {
      const plan = await buildOpenDataMirrorPlan()
      setMirrorPlan(plan)
      try {
        setMirrorManifest(await loadOpenDataMirrorManifest())
      } catch {
        setMirrorManifest(null)
      }
    } catch (error) {
      setMirrorError(settingsErrorMessage(error, '构建 Mirror 计划失败'))
    } finally {
      setMirrorPlanning(false)
    }
  }

  const handleExportMirror = async () => {
    if (mirrorExporting) return
    setMirrorExporting(true)
    setMirrorError(null)
    setMirrorResult(null)
    setMirrorPruneResult(null)
    try {
      const result = await exportOpenDataMirror()
      setMirrorResult(result)
      setMirrorPlan(result.plan)
      setMirrorManifest(result.manifest)
    } catch (error) {
      setMirrorError(settingsErrorMessage(error, '导出 Mirror 失败'))
    } finally {
      setMirrorExporting(false)
    }
  }

  const handlePruneMirror = async () => {
    const pruneCount = mirrorPlan?.toPrune.length ?? mirrorManifest?.stale.length ?? 0
    if (mirrorPruning || pruneCount <= 0) return
    const confirmed = window.confirm(`清理 ${pruneCount} 个旧 Mirror 文件？只会删除 manifest/plan 中标记为 stale 的镜像文件。`)
    if (!confirmed) return
    setMirrorPruning(true)
    setMirrorError(null)
    try {
      const result = await pruneOpenDataMirror()
      setMirrorPruneResult(result)
      setMirrorManifest(result.manifest)
      try {
        setMirrorPlan(await buildOpenDataMirrorPlan())
      } catch {
        setMirrorPlan(null)
      }
    } catch (error) {
      setMirrorError(settingsErrorMessage(error, '清理 Mirror 旧文件失败'))
    } finally {
      setMirrorPruning(false)
    }
  }

  const handlePickIndexedFolder = async () => {
    setIndexedError(null)
    try {
      const selected = await open({ directory: true, multiple: false })
      if (typeof selected === 'string') {
        setIndexedPathDraft(selected)
      }
    } catch (error) {
      setIndexedError(settingsErrorMessage(error, '选择索引文件夹失败'))
    }
  }

  const handleAddIndexedFolder = async () => {
    const path = indexedPathDraft.trim()
    if (!path || indexedMutatingId) return
    setIndexedMutatingId('__new__')
    setIndexedError(null)
    try {
      const folder = await addIndexedFolder(path)
      setIndexedFolders(current => [folder, ...current.filter(item => item.id !== folder.id)])
      setIndexedPathDraft('')
    } catch (error) {
      setIndexedError(settingsErrorMessage(error, '添加索引文件夹失败'))
    } finally {
      setIndexedMutatingId(null)
    }
  }

  const handleScanIndexedFolder = async (folderId: string) => {
    if (indexedMutatingId) return
    setIndexedMutatingId(folderId)
    setIndexedError(null)
    setIndexedScanResult(null)
    try {
      const result = await scanIndexedFolder(folderId)
      setIndexedScanResult(result)
      setIndexedFolders(current => current.map(folder => folder.id === result.folder.id ? result.folder : folder))
      setIndexedFilesByFolder(current => ({ ...current, [folderId]: result.files }))
      setIndexedExpandedFolderId(folderId)
      setIndexedPreviewFile(null)
    } catch (error) {
      setIndexedError(settingsErrorMessage(error, '扫描索引文件夹失败'))
    } finally {
      setIndexedMutatingId(null)
    }
  }

  const handleToggleIndexedFolderDetails = async (folderId: string) => {
    if (indexedExpandedFolderId === folderId) {
      setIndexedExpandedFolderId(null)
      setIndexedPreviewFile(null)
      return
    }
    setIndexedExpandedFolderId(folderId)
    setIndexedPreviewFile(null)
    if (indexedFilesByFolder[folderId]) return
    setIndexedFilesLoadingId(folderId)
    setIndexedError(null)
    try {
      const files = await listIndexedFilesForFolder(folderId)
      setIndexedFilesByFolder(current => ({ ...current, [folderId]: files }))
    } catch (error) {
      setIndexedError(settingsErrorMessage(error, '加载索引文件列表失败'))
    } finally {
      setIndexedFilesLoadingId(null)
    }
  }

  const handleLoadIndexedFilePreview = async (fileId: string) => {
    setIndexedPreviewLoadingId(fileId)
    setIndexedError(null)
    try {
      setIndexedPreviewFile(await loadIndexedFilePreview(fileId))
    } catch (error) {
      setIndexedError(settingsErrorMessage(error, '加载索引文件预览失败'))
    } finally {
      setIndexedPreviewLoadingId(null)
    }
  }

  const handleRemoveIndexedFolder = async (folderId: string) => {
    if (indexedMutatingId) return
    setIndexedMutatingId(folderId)
    setIndexedError(null)
    try {
      await removeIndexedFolder(folderId)
      setIndexedFolders(current => current.filter(folder => folder.id !== folderId))
      setIndexedFilesByFolder(current => {
        const next = { ...current }
        delete next[folderId]
        return next
      })
      if (indexedExpandedFolderId === folderId) setIndexedExpandedFolderId(null)
      setIndexedPreviewFile(current => current?.folderId === folderId ? null : current)
    } catch (error) {
      setIndexedError(settingsErrorMessage(error, '移除索引文件夹失败'))
    } finally {
      setIndexedMutatingId(null)
    }
  }

  const renderProfileList = () => (
    profiles.length > 0 && (
      <Field label="已保存配置">
        <div className="space-y-1.5 mt-1">
          {profiles.map(p => (
            <div key={p.id}
              className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-all',
                selectedProfileId === p.id ? 'border-accent bg-accent/8 shadow-sm' : 'border-border bg-bg-elevated hover:bg-bg-hover')}
              onClick={() => handleSelectProfile(p.id)}>
              <div className={cn('w-2 h-2 rounded-full flex-shrink-0', selectedProfileId === p.id ? 'bg-accent' : 'bg-border')} />
              {editingProfileId === p.id ? (
                <input autoFocus value={editingProfileName}
                  onChange={e => setEditingProfileName(e.target.value)}
                  onBlur={() => handleRenameProfile(p.id, editingProfileName || p.name)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameProfile(p.id, editingProfileName || p.name); if (e.key === 'Escape') setEditingProfileId(null) }}
                  onClick={e => e.stopPropagation()}
                  className="flex-1 bg-transparent text-sm outline-none border-b border-accent text-fg"
                />
              ) : (
                <span className={cn('flex-1 text-sm', selectedProfileId === p.id ? 'text-accent font-medium' : 'text-fg')}>{p.name}</span>
              )}
              <div className="flex items-center gap-1 ml-auto" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditingProfileId(p.id); setEditingProfileName(p.name) }}
                  className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDeleteProfile(p.id)}
                  className="p-1.5 rounded-lg text-fg-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Field>
    )
  )

  const renderSaveActions = () => (
    <div className="flex items-center gap-3 pt-2">
      <SaveBtn onClick={handleSave} />
      <button onClick={handleSaveAsProfile}
        className="rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted hover:bg-bg-hover transition-colors">
        保存为新配置
      </button>
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-fg">设置</h1>
        <p className="mt-1 text-sm text-fg-muted">应用配置，密钥仅保存在本地。</p>
      </div>

      {noKey && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          尚未配置 API Key，AI 提取功能不可用。
        </div>
      )}

      {/* Top-level tabs */}
      <div className="flex gap-1 rounded-xl bg-bg-elevated p-1 mb-8 border border-border">
        {([
          { id: 'ai', icon: <Bot size={15} />, label: 'AI 配置' },
          { id: 'persona', icon: <Brain size={15} />, label: '评论与框架' },
          { id: 'data', icon: <Database size={15} />, label: '数据' },
          { id: 'appearance', icon: <Palette size={15} />, label: '外观' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => {
            setTopTab(t.id)
            if (t.id === 'ai' && (aiTab === 'commentator' || aiTab === 'framework')) setAiTab('chat')
            if (t.id === 'persona' && aiTab !== 'commentator' && aiTab !== 'framework') setAiTab('commentator')
          }}
            className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              topTab === t.id ? 'bg-bg shadow-sm text-fg' : 'text-fg-muted hover:text-fg')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* AI Config / Commentator tab */}
      {(topTab === 'ai' || topTab === 'persona') && (
        <div className="rounded-2xl border border-border bg-bg overflow-hidden">
          {/* Sub-tabs */}
          <div className="flex border-b border-border bg-bg-elevated/50">
            {(topTab === 'persona'
              ? ([
                  { id: 'commentator', icon: <Bot size={13} />, label: '评论员' },
                  { id: 'framework', icon: <Brain size={13} />, label: '框架' },
                ] as const)
              : ([
                  { id: 'chat', icon: <MessageSquare size={13} />, label: '聊天模型' },
                  { id: 'image', icon: <Palette size={13} />, label: '图片模型' },
                  { id: 'search', icon: <Search size={13} />, label: '搜索模型' },
                  { id: 'advanced', icon: <Settings2 size={13} />, label: '高级配置' },
                ] as const)
            ).map(t => (
              <button key={t.id} onClick={() => setAiTab(t.id)}
                className={cn('flex items-center gap-1.5 px-5 py-3 text-sm transition-all border-b-2 -mb-px',
                  aiTab === t.id ? 'border-accent text-accent font-medium' : 'border-transparent text-fg-muted hover:text-fg')}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-6">
            {/* Chat sub-tab */}
            {aiTab === 'chat' && (
              <>
                {/* Profiles */}
                {renderProfileList()}

                {/* Provider */}
                <Field label="服务商">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {PROVIDERS.map(p => (
                      <button key={p.key} onClick={() => handleSelectProvider(p.key)}
                        className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                          providerKey === p.key ? 'border-accent bg-accent/10 text-accent shadow-sm' : 'border-border bg-bg-elevated text-fg-muted hover:border-fg-muted hover:text-fg')}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>

                {providerKey === 'custom' ? (
                  <>
                    <Field label="供应商名称（可选）">
                      <input type="text" value={customProviderName} onChange={e => setCustomProviderName(e.target.value)}
                        placeholder="如 MyProxy"
                        className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                    </Field>
                    <Field label="完整请求地址" hint="直接填写最终 endpoint，不做 base+suffix 拼接">
                      <input type="text" value={customEndpoint} onChange={e => setCustomEndpoint(e.target.value)}
                        placeholder="https://x666.me/v1/chat/completions"
                        className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                    </Field>
                  </>
                ) : (
                  <Field label="Base URL" hint={currentProvider?.suffix ? `会自动补全 ${currentProvider.suffix}` : undefined}>
                    <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com"
                      className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                  </Field>
                )}

                <Field label="API Key">
                  <SecretInput value={apiKey} onChange={setApiKey} placeholder="sk-..." />
                </Field>

                <Field label="模型">
                  <div className="flex items-center justify-between mb-1.5">
                    <span />
                    <button onClick={handleFetchModels} disabled={fetching}
                      className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50 transition-colors">
                      <RefreshCw size={11} className={cn(fetching && 'animate-spin')} />
                      {fetching ? '获取中…' : '获取可用模型'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {models.length > 0 && (
                      <select value={models.includes(model) ? model : ''} onChange={e => { if (e.target.value) setModel(e.target.value) }}
                        className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent">
                        {!models.includes(model) && <option value="">— 自定义 —</option>}
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                    <input type="text" value={model} onChange={e => setModel(e.target.value)}
                      placeholder="输入模型名"
                      className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                  </div>
                  {fetchErr && <p className="mt-1 text-xs text-red-400">{fetchErr}</p>}
                  {models.length > 0 && !fetchErr && <p className="mt-1 text-xs text-fg-faint">已加载 {models.length} 个可用模型</p>}
                </Field>

                {renderSaveActions()}
              </>
            )}

            {/* Image sub-tab */}
            {aiTab === 'image' && (
              <>
                {renderProfileList()}
                <p className="text-sm text-fg-muted rounded-xl bg-bg-elevated border border-border px-4 py-3">
                  为图片生成功能配置独立的服务接入信息，留空则复用聊天模型配置。
                </p>
                <Field label="服务商">
                  <div className="flex gap-2 mt-1">
                    {([['openai-compatible', 'OpenAI Compatible'], ['gemini-image', 'Gemini Imagen']] as const).map(([key, label]) => (
                      <button key={key} onClick={() => setImageProviderKey(key)}
                        className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                          imageProviderKey === key ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-bg-elevated text-fg-muted hover:border-fg-muted hover:text-fg')}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-fg-faint">
                    {imageProviderKey === 'gemini-image'
                      ? '端点: {base_url}/v1beta/models/{model}:generateContent?key={api_key}'
                      : '端点: {base_url}/v1/images/generations'}
                  </p>
                </Field>
                <Field label="Image Base URL">
                  <input type="text" value={imageBaseUrl} onChange={e => setImageBaseUrl(e.target.value)}
                    placeholder={imageProviderKey === 'gemini-image' ? 'https://api.nanobananai.com' : '留空则复用聊天模型地址'}
                    className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                </Field>
                {imageProviderKey !== 'gemini-image' && (
                  <Field
                    label="自定义后缀"
                    hint="可填 /v1/images/generations 或 /v1/chat/completions；也可填完整 endpoint。留空默认使用 /v1/images/generations。"
                  >
                    <input type="text" value={imageCustomEndpoint} onChange={e => setImageCustomEndpoint(e.target.value)}
                      placeholder="/v1/images/generations"
                      className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                  </Field>
                )}
                <Field label="Image API Key">
                  <SecretInput value={imageApiKey} onChange={setImageApiKey} placeholder="留空则复用聊天 Key" />
                </Field>
                <Field label="Image Model">
                  <input type="text" value={imageModel} onChange={e => setImageModel(e.target.value)}
                    placeholder={imageProviderKey === 'gemini-image' ? 'gemini-3-pro-image-preview' : 'dall-e-3'}
                    className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                </Field>
                <Field label="图片画幅" hint="接口只支持 1:1、16:9、9:16、4:3、3:4；旧的 1792x1024 会自动改为 16:9。">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {IMAGE_SIZE_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setImageSize(option.value)}
                        className={cn(
                          'rounded-lg border px-2.5 py-2 text-left transition-all',
                          imageSize === option.value
                            ? 'border-accent bg-accent/10 text-accent shadow-sm'
                            : 'border-border bg-bg-elevated text-fg-muted hover:border-fg-muted hover:text-fg'
                        )}
                      >
                        <span className="block text-xs font-medium">{option.label}</span>
                        <span className="mt-0.5 block text-[10px] text-fg-faint">{option.hint}</span>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="知识性生图样式 Prompt" hint="用于圆环面板的“知识图”模式；留空时后端会使用默认知识图谱风格。">
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setImageKnowledgeStylePrompt(DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT)}
                      className="rounded border border-border bg-bg-elevated px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-fg-muted hover:text-fg"
                    >
                      恢复默认
                    </button>
                  </div>
                  <textarea
                    value={imageKnowledgeStylePrompt}
                    onChange={event => setImageKnowledgeStylePrompt(event.target.value)}
                    rows={12}
                    className="w-full resize-y rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-fg-faint focus:border-accent transition-colors"
                    placeholder={DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT}
                  />
                </Field>
                {renderSaveActions()}
              </>
            )}

            {/* Search sub-tab */}
            {aiTab === 'search' && (
              <>
                {renderProfileList()}
                <div className="flex items-center justify-between rounded-xl border border-border bg-bg-elevated px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-fg">启用搜索模型</p>
                    <p className="text-xs text-fg-muted mt-0.5">深挖时自动检索相关信息并注入上下文</p>
                  </div>
                  <button
                    onClick={() => setSearchEnabled(e => !e)}
                    aria-pressed={searchEnabled}
                    className={cn('relative h-6 w-11 rounded-full transition-colors', searchEnabled ? 'bg-accent' : 'bg-border')}
                  >
                    <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', searchEnabled ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>

                {searchEnabled && (
                  <>
                    <Field label="服务商">
                      <div className="flex flex-wrap gap-2 mt-1">
                        {PROVIDERS.map(p => (
                          <button key={p.key} onClick={() => {
                            setSearchProviderKey(p.key)
                            if (p.baseUrl) setSearchBaseUrl(p.baseUrl)
                          }}
                            className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                              searchProviderKey === p.key ? 'border-accent bg-accent/10 text-accent shadow-sm' : 'border-border bg-bg-elevated text-fg-muted hover:border-fg-muted hover:text-fg')}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {searchProviderKey === 'custom' ? (
                      <Field label="完整请求地址" hint="直接填写最终 endpoint">
                        <input type="text" value={searchCustomEndpoint} onChange={e => setSearchCustomEndpoint(e.target.value)}
                          placeholder="https://example.com/v1/chat/completions"
                          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                      </Field>
                    ) : (
                      <Field label="Base URL">
                        <input type="text" value={searchBaseUrl} onChange={e => setSearchBaseUrl(e.target.value)}
                          placeholder="https://api.openai.com"
                          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                      </Field>
                    )}

                    <Field label="API Key">
                      <SecretInput value={searchApiKey} onChange={setSearchApiKey} placeholder="sk-..." />
                    </Field>

                    <Field label="模型">
                      <div className="flex items-center justify-between mb-1.5">
                        <span />
                        <button onClick={async () => {
                          setSearchFetching(true); setSearchFetchErr(null)
                          try {
                            const list = await fetchModels(searchApiKey, searchBaseUrl)
                            setSearchModels(list)
                            if (list.length > 0 && !list.includes(searchModel)) setSearchModel(list[0])
                          } catch { setSearchFetchErr('获取失败，请检查 Key 和 Base URL') }
                          finally { setSearchFetching(false) }
                        }} disabled={searchFetching}
                          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50 transition-colors">
                          <RefreshCw size={11} className={cn(searchFetching && 'animate-spin')} />
                          {searchFetching ? '获取中…' : '获取可用模型'}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {searchModels.length > 0 && (
                          <select value={searchModels.includes(searchModel) ? searchModel : ''} onChange={e => { if (e.target.value) setSearchModel(e.target.value) }}
                            className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent">
                            {!searchModels.includes(searchModel) && <option value="">— 自定义 —</option>}
                            {searchModels.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        )}
                        <input type="text" value={searchModel} onChange={e => setSearchModel(e.target.value)}
                          placeholder="输入模型名"
                          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                      </div>
                      {searchFetchErr && <p className="mt-1 text-xs text-red-400">{searchFetchErr}</p>}
                    </Field>

                  </>
                )}

                <Field label="事实审查输出语言" hint="划词事实审查和自动事实审查的默认回答语言。">
                  <select
                    value={factCheckLanguage}
                    onChange={e => setFactCheckLanguage(e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    <option value="中文">中文</option>
                    <option value="English">English</option>
                    <option value="日本語">日本語</option>
                    <option value="한국어">한국어</option>
                    <option value="跟随原文语言">跟随原文语言</option>
                  </select>
                </Field>

                <Field label="标注颜色" hint="下划线、波浪线、高亮三者颜色不能相同。">
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {ANNOTATION_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setAnnotationUnderlineColor(preset.underline)
                          setAnnotationWavyColor(preset.wavy)
                          setAnnotationHighlightColor(preset.highlight)
                        }}
                        className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                      >
                        <span className="block text-xs font-medium text-fg">{preset.name}</span>
                        <span className="mt-1 flex gap-1.5">
                          {[preset.underline, preset.wavy, preset.highlight].map((color) => (
                            <span key={color} className="h-3 w-7 rounded-full border border-border" style={{ backgroundColor: color }} />
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="space-y-1 text-xs text-fg-muted">
                      <span>下划线</span>
                      <input type="color" value={annotationUnderlineColor} onChange={e => setAnnotationUnderlineColor(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-bg-elevated p-1" />
                    </label>
                    <label className="space-y-1 text-xs text-fg-muted">
                      <span>波浪线</span>
                      <input type="color" value={annotationWavyColor} onChange={e => setAnnotationWavyColor(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-bg-elevated p-1" />
                    </label>
                    <label className="space-y-1 text-xs text-fg-muted">
                      <span>高亮</span>
                      <input type="color" value={annotationHighlightColor} onChange={e => setAnnotationHighlightColor(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border bg-bg-elevated p-1" />
                    </label>
                  </div>
                  {!annotationColorsDistinct() && <p className="mt-2 text-xs text-red-400">三种标注颜色不能相同。</p>}
                  {jsonError && aiTab === 'search' && <p className="mt-2 text-xs text-red-400">{jsonError}</p>}
                </Field>

                {renderSaveActions()}
              </>
            )}

            {/* Commentator sub-tab */}
            {aiTab === 'commentator' && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-fg">评论员资料库</p>
                    <p className="mt-0.5 text-xs text-fg-faint">LLM 会按文本内容选择最合适的评论员；没有合适项时回退到鲁迅。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImportOpen(value => !value)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                  >
                    <Download size={13} />
                    导入 Skill
                  </button>
                </div>

                <AnimatePresence>
                  {importOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="rounded-xl border border-border bg-bg-elevated px-4 py-3"
                    >
                      <div className="flex gap-2">
                        <input
                          value={importUrl}
                          onChange={e => setImportUrl(e.target.value)}
                          placeholder="粘贴 GitHub Skill 人物页面链接"
                          className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={handleImportCommentator}
                          disabled={importing || !importUrl.trim()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                        >
                          {importing ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                          生成
                        </button>
                      </div>
                      {importError && <p className="mt-2 text-xs text-red-400">{importError}</p>}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-3">
                  <CommentatorGroup
                    title="Nuwa 人物 Skill 预设"
                    count={displayedBuiltinProfiles.length}
                    open={builtinOpen}
                    onToggle={() => setBuiltinOpen(value => !value)}
                  >
                    <CommentatorGrid
                      profiles={displayedBuiltinProfiles}
                      currentName={commentatorName}
                      onSelect={handleSelectCommentator}
                    />
                  </CommentatorGroup>

                  {githubGroups.map(([source, profiles]) => {
                    const open = githubOpen[source] ?? false
                    return (
                      <CommentatorGroup
                        key={source}
                        title={profiles[0]?.sourceName ?? 'GitHub Skill'}
                        count={profiles.length}
                        open={open}
                        onToggle={() => setGithubOpen(current => ({ ...current, [source]: !open }))}
                        subtitle={source}
                      >
                        <CommentatorGrid
                          profiles={profiles}
                          currentName={commentatorName}
                          onSelect={handleSelectCommentator}
                          onDelete={handleDeleteCommentator}
                        />
                      </CommentatorGroup>
                    )
                  })}

                  <CommentatorGroup
                    title="本地手动输入"
                    count={manualProfiles.length}
                    open={manualOpen}
                    onToggle={() => setManualOpen(value => !value)}
                  >
                    {manualProfiles.length > 0 ? (
                      <CommentatorGrid
                        profiles={manualProfiles}
                        currentName={commentatorName}
                        onSelect={handleSelectCommentator}
                        onDelete={handleDeleteCommentator}
                      />
                    ) : (
                      <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-fg-faint">
                        修改下方名称、风格或头像后保存，会自动加入本地评论员。
                      </p>
                    )}
                  </CommentatorGroup>
                </div>

                <Field label="评论员名称">
                  <input value={commentatorName} onChange={e => setCommentatorName(e.target.value)}
                    placeholder="鲁迅" className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                </Field>
                <Field label="风格描述" hint="AI 将以此风格生成辣评">
                  <input value={commentatorStyle} onChange={e => setCommentatorStyle(e.target.value)}
                    placeholder="粘贴或编写数字分身模板" className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                </Field>
                <Field label="头像 Emoji">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {COMMENTATOR_EMOJIS.slice(0, 10).map(e => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => { if (!usedEmojis.has(e)) setCommentatorEmoji(e) }}
                          disabled={usedEmojis.has(e)}
                          className={cn(
                            'rounded-xl border p-2 text-xl transition-all',
                            commentatorEmoji === e ? 'scale-110 border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:bg-bg-hover',
                            usedEmojis.has(e) && 'cursor-not-allowed grayscale opacity-35 hover:bg-bg-elevated'
                          )}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                    <select
                      value={commentatorEmoji}
                      onChange={e => setCommentatorEmoji(e.target.value)}
                      className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent"
                    >
                      {COMMENTATOR_EMOJIS.map(e => (
                        <option key={e} value={e} disabled={usedEmojis.has(e)}>
                          {e} {usedEmojis.has(e) ? '已使用' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="领域">
                  <input
                    value={commentatorProfiles.find(profile => profile.name === commentatorName)?.domain ?? '本地手动输入'}
                    readOnly
                    className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg-muted outline-none"
                  />
                </Field>
                <div className="rounded-xl border border-border bg-bg-elevated px-4 py-3 flex items-start gap-3">
                  <span className="text-2xl">{commentatorEmoji}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{commentatorName || '评论员'}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{commentatorStyle || '（无风格描述）'}</p>
                  </div>
                </div>
                <div className="pt-2"><SaveBtn onClick={handleSave} /></div>
              </>
            )}

            {/* Framework sub-tab */}
            {aiTab === 'framework' && (
              <>
                <div className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Brain size={16} className="mt-0.5 text-accent" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">自定义框架解读</p>
                      <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                        添加后会出现在知识库观点的「框架解读」里，也会参与框架推荐。需要写清楚三件事：名称、适用场景说明、给 LLM 的解读步骤。
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs leading-relaxed text-fg-faint">
                    <p><span className="font-medium text-fg-muted">名称：</span>列表里显示的框架名，例如「雇佣制度分析」「政策影响链」。</p>
                    <p><span className="font-medium text-fg-muted">说明：</span>一句话告诉推荐模型什么时候该用它，例如「适合分析公司制度如何影响员工收益和权力关系」。</p>
                    <p><span className="font-medium text-fg-muted">解读提示词：</span>真正写给 LLM 的操作步骤，要说明按哪些维度拆、输出什么，不要只写概念名。</p>
                  </div>
                </div>

                <div className="grid gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3">
                  <Field label="框架名称">
                    <input
                      value={frameworkName}
                      onChange={event => {
                        setFrameworkName(event.target.value)
                        setFrameworkError(null)
                      }}
                      placeholder="例如：雇佣制度分析"
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                    />
                  </Field>
                  <Field label="适用说明" hint="用于推荐系统判断这个框架适合什么文本。">
                    <input
                      value={frameworkDescription}
                      onChange={event => {
                        setFrameworkDescription(event.target.value)
                        setFrameworkError(null)
                      }}
                      placeholder="适合分析制度安排、利益分配与权力关系。"
                      className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                    />
                  </Field>
                  <Field label="解读提示词" hint="用于实际框架解读，建议写成明确步骤。">
                    <textarea
                      value={frameworkPromptLens}
                      onChange={event => {
                        setFrameworkPromptLens(event.target.value)
                        setFrameworkError(null)
                      }}
                      rows={5}
                      placeholder="请用该框架解读这个观点：1. 识别参与者；2. 拆分利益与成本；3. 找出权力不对称；4. 给出可能后果。"
                      className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-fg-faint focus:border-accent"
                    />
                  </Field>
                  {frameworkError && <p className="text-xs text-red-400">{frameworkError}</p>}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddFramework}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
                    >
                      <Plus size={13} />
                      添加框架
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-bg-elevated">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-fg">本地自定义框架</p>
                      <p className="mt-0.5 text-xs text-fg-faint">{customMentalModels.length} 个</p>
                    </div>
                  </div>
                  {customMentalModels.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-fg-faint">还没有手动添加的框架。</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {customMentalModels.map(model => (
                        <div key={model.key} className="flex items-start gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-fg">{model.name}</p>
                            <p className="mt-1 text-xs leading-relaxed text-fg-muted">{model.description}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-faint">{model.promptLens}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteFramework(model.key)}
                            title="删除框架"
                            aria-label="删除框架"
                            className="rounded-md p-1 text-fg-faint transition-colors hover:bg-red-500/10 hover:text-red-300"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2"><SaveBtn onClick={handleSave} /></div>
              </>
            )}

            {/* Advanced sub-tab */}
            {aiTab === 'advanced' && (
              <>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-fg">配置 JSON</label>
                  <button onClick={() => { setJsonEditing(e => !e); setJsonError(null) }}
                    className="text-xs text-fg-muted hover:text-fg transition-colors">
                    {jsonEditing ? '只读模式' : '编辑模式'}
                  </button>
                </div>
                <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} readOnly={!jsonEditing} rows={18}
                  className={cn('w-full rounded-xl border bg-bg-elevated px-4 py-3 font-mono text-xs outline-none resize-y transition-colors',
                    jsonEditing ? 'border-accent' : 'border-border text-fg-muted')} />
                {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
                <div className="flex items-center gap-3">
                  <button onClick={() => { try { setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2)) } catch (e: unknown) { setJsonError(e instanceof Error ? e.message : 'JSON 格式错误') } }}
                    className="rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted hover:bg-bg-hover transition-colors">
                    格式化
                  </button>
                  <SaveBtn onClick={handleSaveAdvanced} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Data tab */}
      {topTab === 'data' && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-bg">
            <div className="border-b border-border bg-bg-elevated/50 px-5 py-3">
              <p className="text-sm font-medium text-fg">语义检索</p>
              <p className="mt-0.5 text-xs text-fg-faint">本地 multilingual E5-small 默认；也可使用 OpenAI-compatible embeddings。</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex gap-2">
                {(['local', 'remote'] as const).map(kind => <button key={kind} type="button" onClick={() => setSemanticProvider(current => ({ ...current, kind }))} className={cn('rounded-lg border px-3 py-1.5 text-xs', semanticProvider.kind === kind ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted')}>{kind === 'local' ? '本地模型' : '远程 Embeddings'}</button>)}
              </div>
              {semanticProvider.kind === 'remote' && <div className="grid gap-3 md:grid-cols-2">
                <Field label="Embedding Base URL"><input value={semanticProvider.baseUrl ?? ''} onChange={event => setSemanticProvider(current => ({ ...current, baseUrl: event.target.value || null }))} placeholder="https://api.openai.com" className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent" /></Field>
                <Field label="Embedding Model"><input value={semanticProvider.model ?? ''} onChange={event => setSemanticProvider(current => ({ ...current, model: event.target.value || null }))} placeholder="text-embedding-3-small" className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent" /></Field>
                <Field label="API Key" hint="写入系统凭据存储，不写入普通配置"><SecretInput value={semanticApiKey} onChange={setSemanticApiKey} placeholder="留空则保留现有凭据" /></Field>
              </div>}
              <div className="rounded-xl border border-border bg-bg-elevated px-4 py-3 text-xs text-fg-muted">
                <p>{semanticStatus?.modelKey ?? '尚未加载'} · {semanticStatus?.phase ?? 'unknown'}</p>
                <p className="mt-1">就绪 {semanticStatus?.ready ?? 0} / 总计 {semanticStatus?.total ?? 0} · 待处理 {semanticStatus?.pending ?? 0} · 过期 {semanticStatus?.stale ?? 0} · 失败 {semanticStatus?.failed ?? 0}</p>
                {semanticStatus?.lastError && <p className="mt-1 text-red-400">{semanticStatus.lastError}</p>}
              </div>
              <div className="flex gap-2"><button type="button" disabled={semanticBusy} onClick={() => void handleSaveSemanticSettings()} className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50">保存设置</button><button type="button" disabled={semanticBusy} onClick={() => void handleRebuildSemanticIndex()} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"><RefreshCw size={12} className={cn(semanticBusy && 'animate-spin')} />{semanticProvider.kind === 'local' && !semanticStatus?.modelCached ? '下载模型并建索引' : '重建索引'}</button></div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-bg">
            <div className="border-b border-border bg-bg-elevated/50 px-5 py-3"><p className="text-sm font-medium text-fg">数据库安全</p><p className="mt-0.5 text-xs text-fg-faint">备份前后执行 SQLite integrity_check；恢复命令仅接受验证通过的备份。</p></div>
            <div className="flex flex-wrap items-center gap-3 p-5 text-xs text-fg-muted"><span>完整性：{databaseStatus?.integrity ?? '未检查'}</span><span className="truncate">最近备份：{databaseStatus?.latestBackupPath ?? '无'}</span><button type="button" disabled={databaseBusy} onClick={() => void handleBackupDatabase()} className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 disabled:opacity-50"><Database size={12} />{databaseBusy ? '处理中…' : '创建验证备份'}</button></div>
          </div>
          {safetyError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{safetyError}</div>}

          <div className="overflow-hidden rounded-2xl border border-border bg-bg">
            <div className="border-b border-border bg-bg-elevated/50 px-5 py-3">
              <p className="text-sm font-medium text-fg">Open Data Mirror</p>
              <p className="mt-0.5 text-xs text-fg-faint">导出可读 Markdown 快照；不是双向同步。</p>
            </div>
            <div className="space-y-4 p-5">
              {mirrorLoading && !mirrorConfig ? (
                <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-fg-faint">
                  <RefreshCw size={15} className="animate-spin" />
                  加载 Mirror 设置…
                </div>
              ) : mirrorConfig ? (
                <>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-bg-elevated px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-fg">启用 Mirror</p>
                      <p className="mt-0.5 text-xs text-fg-muted">启用后导出命令会使用下方范围生成快照。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateMirrorConfig({ enabled: !mirrorConfig.enabled })}
                      aria-pressed={mirrorConfig.enabled}
                      className={cn('relative h-6 w-11 rounded-full transition-colors', mirrorConfig.enabled ? 'bg-accent' : 'bg-border')}
                    >
                      <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', mirrorConfig.enabled ? 'translate-x-5' : 'translate-x-0')} />
                    </button>
                  </div>

                  <Field label="Mirror 根目录">
                    <div className="flex gap-2">
                      <input
                        value={mirrorConfig.rootPath ?? ''}
                        onChange={event => updateMirrorConfig({ rootPath: event.target.value || null })}
                        placeholder="选择或输入导出目录"
                        className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => void handleChooseMirrorRoot()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                      >
                        <FolderOpen size={13} />
                        选择
                      </button>
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-2 text-xs text-fg-muted">
                    {([
                      ['exportSources', 'Sources'],
                      ['exportEvidence', 'Evidence'],
                      ['exportReports', 'Reports'],
                      ['exportJournal', 'Journal'],
                      ['exportGalleryIndex', 'Gallery index'],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2">
                        <input
                          type="checkbox"
                          checked={mirrorConfig[key]}
                          onChange={event => updateMirrorConfig({ [key]: event.target.checked })}
                          className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>

                  {mirrorManifest && (
                    <div className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium text-fg">上次 Manifest v{mirrorManifest.version}</p>
                          <p className="mt-1 text-[11px] text-fg-faint">
                            {mirrorManifest.generatedAt ? new Date(mirrorManifest.generatedAt).toLocaleString('zh-CN') : '没有生成时间'} · assets {mirrorManifest.assets.length}
                          </p>
                        </div>
                        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-fg-muted">
                          stale {mirrorManifest.stale.length}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-fg-muted">{mirrorCountSummary(mirrorManifest.counts)}</p>
                    </div>
                  )}

                  {mirrorPlan && (
                    <div className="space-y-3 rounded-xl border border-border bg-bg px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-fg">当前导出计划</p>
                          <p className="mt-0.5 text-xs text-fg-faint">
                            {new Date(mirrorPlan.generatedAt).toLocaleString('zh-CN')} · {mirrorCountSummary(mirrorPlan.counts)}
                          </p>
                        </div>
                        {mirrorPlan.errors.length > 0 && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                            errors {mirrorPlan.errors.length}
                          </span>
                        )}
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <MirrorPlanList title="将写入" items={mirrorPlan.toWrite} empty="没有新增文件。" />
                        <MirrorPlanList title="将覆盖" items={mirrorPlan.stale} empty="没有内容变化。" />
                        <MirrorPlanList title="未变化" items={mirrorPlan.unchanged} empty="还没有可跳过文件。" />
                        <MirrorPlanList title="待清理" items={mirrorPlan.toPrune} empty="没有旧镜像文件。" />
                      </div>
                      {mirrorPlan.errors.length > 0 && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                          {mirrorPlan.errors.slice(0, 3).map((error, index) => (
                            <p key={`${error.path ?? 'error'}-${index}`} className="text-[11px] text-red-300">
                              {error.path ?? error.kind ?? 'mirror'}: {error.message}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {mirrorError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{mirrorError}</p>}
                  {mirrorResult && (
                    <p className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-muted">
                      已写入 {mirrorResult.filesWritten} 个文件：{mirrorCountSummary(mirrorResult.manifest.counts)}
                    </p>
                  )}
                  {mirrorPruneResult && (
                    <p className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-muted">
                      已清理 {mirrorPruneResult.filesDeleted} 个旧文件；错误 {mirrorPruneResult.errors.length} 个。
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleSaveMirrorConfig()}
                      disabled={mirrorSaving}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      {mirrorSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                      保存设置
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleBuildMirrorPlan()}
                      disabled={mirrorPlanning || !mirrorConfig.enabled}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                    >
                      {mirrorPlanning ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
                      构建计划
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportMirror()}
                      disabled={mirrorExporting || !mirrorConfig.enabled}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                    >
                      {mirrorExporting ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                      导出 Mirror
                    </button>
                    <button
                      type="button"
                      onClick={() => void handlePruneMirror()}
                      disabled={mirrorPruning || !mirrorConfig.enabled || mirrorPruneCount <= 0}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {mirrorPruning ? <RefreshCw size={14} className="animate-spin" /> : <X size={14} />}
                      清理旧文件{mirrorPruneCount > 0 ? ` (${mirrorPruneCount})` : ''}
                    </button>
                  </div>
                  <p className="text-[11px] text-fg-faint">
                    修改范围或路径后先保存设置，再构建计划或导出。清理不会自动发生，只删除 manifest/plan 标记的旧镜像文件。
                  </p>
                </>
              ) : (
                <p className="text-sm text-fg-faint">Mirror 设置不可用。</p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-bg">
            <div className="border-b border-border bg-bg-elevated/50 px-5 py-3">
              <p className="text-sm font-medium text-fg">Indexed Folders</p>
              <p className="mt-0.5 text-xs text-fg-faint">索引外部文件夹的文本快照和文件元数据，不移动原文件。</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex gap-2">
                <input
                  value={indexedPathDraft}
                  onChange={event => setIndexedPathDraft(event.target.value)}
                  placeholder="选择或输入本地文件夹路径"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => void handlePickIndexedFolder()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                >
                  <FolderOpen size={13} />
                  选择
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddIndexedFolder()}
                  disabled={!indexedPathDraft.trim() || indexedMutatingId !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  <Plus size={13} />
                  添加
                </button>
              </div>

              {indexedError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{indexedError}</p>}
              {indexedScanResult && (
                <p className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-muted">
                  {indexedScanResult.folder.name}: 索引 {indexedScanResult.indexedCount} 个文本文件，记录 {indexedScanResult.metadataOnlyCount} 个元数据文件。
                </p>
              )}

              {indexedLoading ? (
                <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-fg-faint">
                  <RefreshCw size={15} className="animate-spin" />
                  加载 Indexed Folders…
                </div>
              ) : indexedFolders.length > 0 ? (
                <div className="divide-y divide-border rounded-xl border border-border bg-bg-elevated">
                  {indexedFolders.map(folder => {
                    const expanded = indexedExpandedFolderId === folder.id
                    const files = indexedFilesByFolder[folder.id] ?? []
                    const counts = indexedStatusCounts(files)
                    return (
                      <div key={folder.id} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <FolderOpen size={15} className="mt-0.5 shrink-0 text-accent" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-fg">{folder.name}</p>
                            <p className="mt-1 truncate text-xs text-fg-faint">{folder.path}</p>
                            <p className="mt-1 text-[11px] text-fg-faint">
                              {folder.enabled ? 'enabled' : 'disabled'} · last scan {folder.lastScannedAt ? new Date(folder.lastScannedAt).toLocaleString('zh-CN') : 'never'}
                            </p>
                            {files.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {Object.entries(counts).map(([status, count]) => (
                                  <span key={status} className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-fg-muted">
                                    {status}: {count}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleToggleIndexedFolderDetails(folder.id)}
                              disabled={indexedFilesLoadingId === folder.id}
                              className="rounded-md border border-border px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent disabled:opacity-50"
                            >
                              {indexedFilesLoadingId === folder.id ? <RefreshCw size={12} className="animate-spin" /> : expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleScanIndexedFolder(folder.id)}
                              disabled={indexedMutatingId !== null}
                              className="rounded-md border border-border px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent disabled:opacity-50"
                            >
                              {indexedMutatingId === folder.id ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveIndexedFolder(folder.id)}
                              disabled={indexedMutatingId !== null}
                              className="rounded-md border border-border px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="mt-3 space-y-3 rounded-xl border border-border bg-bg p-3">
                            {files.length === 0 ? (
                              <p className="text-xs text-fg-faint">还没有文件记录。先扫描该文件夹。</p>
                            ) : (
                              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                                {files.map(file => (
                                  <button
                                    key={file.id}
                                    type="button"
                                    onClick={() => void handleLoadIndexedFilePreview(file.id)}
                                    className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                                  >
                                    <div className="flex items-start gap-2">
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-medium text-fg">{file.name}</p>
                                        <p className="mt-1 truncate text-[11px] text-fg-faint">{file.path}</p>
                                        <p className="mt-1 text-[11px] text-fg-faint">
                                          {file.descriptorKind} · {indexedFileSize(file.sizeBytes)} · {file.textHash ?? 'no hash'}
                                        </p>
                                        {file.lastError && <p className="mt-1 line-clamp-2 text-[11px] text-red-300">{file.lastError}</p>}
                                      </div>
                                      <div className="flex shrink-0 flex-col items-end gap-1">
                                        <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', indexedBadgeClass(file.readStatus))}>{file.readStatus}</span>
                                        <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', indexedBadgeClass(file.indexStatus))}>{file.indexStatus}</span>
                                        {indexedPreviewLoadingId === file.id && <RefreshCw size={11} className="animate-spin text-fg-faint" />}
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            {indexedPreviewFile?.folderId === folder.id && (
                              <div className="rounded-lg border border-border bg-bg-elevated p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate text-xs font-medium text-fg">{indexedPreviewFile.name}</p>
                                  <span className="shrink-0 text-[11px] text-fg-faint">
                                    {indexedPreviewFile.extractedChars ?? 0}/{indexedPreviewFile.totalChars ?? 0} chars
                                  </span>
                                </div>
                                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-bg px-3 py-2 text-[11px] leading-relaxed text-fg-muted">
                                  {indexedPreviewFile.previewText || indexedPreviewFile.lastError || '没有可用预览。'}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-fg-faint">
                  还没有 Indexed Folder。
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Appearance tab */}
      {topTab === 'appearance' && <AppearancePanel />}

    </div>
  )
}

interface CommentatorGroupProps {
  title: string
  count: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  subtitle?: string
}

function CommentatorGroup({ title, count, open, onToggle, children, subtitle }: CommentatorGroupProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
      >
        {open ? <ChevronDown size={14} className="text-fg-faint" /> : <ChevronRight size={14} className="text-fg-faint" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-fg">{title}</span>
          {subtitle && <span className="block truncate text-[11px] text-fg-faint">{subtitle}</span>}
        </span>
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-fg-muted">{count}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface CommentatorGridProps {
  profiles: CommentatorProfile[]
  currentName: string
  onSelect: (profile: CommentatorProfile) => void
  onDelete?: (id: string) => void
}

function CommentatorGrid({ profiles, currentName, onSelect, onDelete }: CommentatorGridProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {profiles.map(profile => {
        const selected = currentName === profile.name
        return (
          <motion.button
            key={profile.id}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(profile)}
            title={profile.bio || profile.name}
            className={cn(
              'group relative flex min-h-[64px] items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
              selected ? 'border-accent bg-accent/10 text-fg' : 'border-border bg-bg text-fg-muted hover:bg-bg-hover hover:text-fg'
            )}
          >
            <span className="mt-0.5 text-lg">{profile.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{profile.name}</span>
              <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-fg-faint">{profile.domain}</span>
            </span>
            {onDelete && (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(profile.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    onDelete(profile.id)
                  }
                }}
                className="rounded-md p-1 text-fg-faint opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
              >
                <X size={12} />
              </span>
            )}
            {profile.bio && (
              <span className="pointer-events-none absolute left-3 right-3 top-[calc(100%+6px)] z-20 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-[11px] leading-relaxed text-fg-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                {profile.bio}
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

// ── Appearance panel ─────────────────────────────────────────────────────────

const THEME_OPTIONS: { id: ThemeMode; label: string; desc: string }[] = [
  { id: 'dark',   label: '深色', desc: '始终使用深色主题' },
  { id: 'light',  label: '浅色', desc: '始终使用浅色主题' },
  { id: 'system', label: '跟随系统', desc: '自动跟随操作系统设置' },
]

function AppearancePanel() {
  const { mode, accent, accentPresets, uiFont, codeFont, fontSize, setMode, setAccent, setUiFont, setCodeFont, setFontSize } = useThemeStore()
  const [customAccent, setCustomAccent] = useState(accent)

  return (
    <div className="space-y-6">
      {/* Theme mode */}
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-bg-elevated/50">
          <p className="text-sm font-medium text-fg">配色主题</p>
        </div>
        <div className="p-4 flex gap-3">
          {THEME_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => setMode(opt.id)}
              className={cn('flex-1 rounded-xl border px-4 py-3 text-left transition-all',
                mode === opt.id ? 'border-accent bg-accent/10 shadow-sm' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
              <div className={cn('text-sm font-medium', mode === opt.id ? 'text-accent' : 'text-fg')}>{opt.label}</div>
              <div className="text-xs text-fg-muted mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-bg-elevated/50">
          <p className="text-sm font-medium text-fg">强调色</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            {accentPresets.map(color => (
              <button key={color} onClick={() => { setAccent(color); setCustomAccent(color) }}
                title={color}
                className={cn('w-8 h-8 rounded-full border-2 transition-transform hover:scale-110',
                  accent === color ? 'border-fg scale-110' : 'border-transparent')}
                style={{ backgroundColor: color }} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-border flex-shrink-0" style={{ backgroundColor: customAccent }} />
            <input type="text" value={customAccent}
              onChange={e => setCustomAccent(e.target.value)}
              onBlur={() => { if (/^#[0-9a-fA-F]{6}$/.test(customAccent)) setAccent(customAccent) }}
              onKeyDown={e => { if (e.key === 'Enter' && /^#[0-9a-fA-F]{6}$/.test(customAccent)) setAccent(customAccent) }}
              placeholder="#6366f1"
              className="w-32 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 font-mono text-sm outline-none focus:border-accent transition-colors" />
            <span className="text-xs text-fg-faint">输入 hex 后 Enter 或失焦应用</span>
          </div>
        </div>
      </div>

      {/* Font */}
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-bg-elevated/50">
          <p className="text-sm font-medium text-fg">字体</p>
        </div>
        <div className="p-5 space-y-5">
          {/* UI font */}
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">界面字体</p>
            <div className="flex gap-2">
              {UI_FONTS.map(f => (
                <button key={f.key} onClick={() => setUiFont(f.key as UiFontKey)}
                  className={cn('flex-1 rounded-xl border px-3 py-2.5 text-left transition-all',
                    uiFont === f.key ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
                  <div className={cn('text-sm font-medium', uiFont === f.key ? 'text-accent' : 'text-fg')}
                    style={{ fontFamily: f.value }}>{f.label}</div>
                  <div className="text-xs text-fg-faint mt-0.5" style={{ fontFamily: f.value }}>AaBbCc 你好世界</div>
                </button>
              ))}
            </div>
          </div>
          {/* Code font */}
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">代码字体</p>
            <div className="flex gap-2">
              {CODE_FONTS.map(f => (
                <button key={f.key} onClick={() => setCodeFont(f.key as CodeFontKey)}
                  className={cn('flex-1 rounded-xl border px-3 py-2.5 text-left transition-all',
                    codeFont === f.key ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
                  <div className={cn('text-sm font-medium', codeFont === f.key ? 'text-accent' : 'text-fg')}
                    style={{ fontFamily: f.value }}>{f.label}</div>
                  <div className="text-xs text-fg-faint mt-0.5 font-mono" style={{ fontFamily: f.value }}>const x = 42</div>
                </button>
              ))}
            </div>
          </div>
          {/* Font size */}
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">字号</p>
            <div className="flex gap-2">
              {([['sm','小','13px'],['md','中','15px'],['lg','大','17px']] as [FontSize,string,string][]).map(([id, label, px]) => (
                <button key={id} onClick={() => setFontSize(id)}
                  className={cn('flex-1 rounded-xl border px-3 py-2.5 text-center transition-all',
                    fontSize === id ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
                  <span className={cn('font-medium', fontSize === id ? 'text-accent' : 'text-fg')} style={{ fontSize: px }}>{label}</span>
                  <div className="text-xs text-fg-faint mt-0.5">{px}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
