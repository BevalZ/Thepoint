use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::Wry;
use tauri_plugin_store::StoreExt;

use crate::ai::models::MentalModel;

const STORE_FILE: &str = "config.json";
const KEY_API: &str = "openai_api_key";
const KEY_MODEL: &str = "openai_model";
const KEY_BASE_URL: &str = "openai_base_url";
const KEY_IMAGE_BASE_URL: &str = "image_base_url";
const KEY_IMAGE_API_KEY: &str = "image_api_key";
const KEY_IMAGE_MODEL: &str = "image_model";
const KEY_IMAGE_PROVIDER_KEY: &str = "image_provider_key";
const KEY_IMAGE_CUSTOM_ENDPOINT: &str = "image_custom_endpoint";
const KEY_IMAGE_SIZE: &str = "image_size";
const KEY_IMAGE_KNOWLEDGE_STYLE_PROMPT: &str = "image_knowledge_style_prompt";
const KEY_PROFILES: &str = "config_profiles";
const KEY_PROVIDER_KEY: &str = "provider_key";
const KEY_CUSTOM_ENDPOINT: &str = "custom_endpoint";
const KEY_CUSTOM_PROVIDER_NAME: &str = "custom_provider_name";
const KEY_EXTRA_HEADERS: &str = "extra_headers";
const KEY_SEARCH_ENABLED: &str = "search_enabled";
const KEY_SEARCH_API_KEY: &str = "search_api_key";
const KEY_SEARCH_MODEL: &str = "search_model";
const KEY_SEARCH_BASE_URL: &str = "search_base_url";
const KEY_SEARCH_PROVIDER_KEY: &str = "search_provider_key";
const KEY_SEARCH_CUSTOM_ENDPOINT: &str = "search_custom_endpoint";
const KEY_FACT_CHECK_LANGUAGE: &str = "fact_check_language";
const KEY_ANNOTATION_UNDERLINE_COLOR: &str = "annotation_underline_color";
const KEY_ANNOTATION_WAVY_COLOR: &str = "annotation_wavy_color";
const KEY_ANNOTATION_HIGHLIGHT_COLOR: &str = "annotation_highlight_color";
const KEY_COMMENTATOR_NAME: &str = "commentator_name";
const KEY_COMMENTATOR_STYLE: &str = "commentator_style";
const KEY_COMMENTATOR_EMOJI: &str = "commentator_emoji";
const KEY_COMMENTATOR_PROFILES: &str = "commentator_profiles";
const KEY_CUSTOM_MENTAL_MODELS: &str = "custom_mental_models";
const DEFAULT_MODEL: &str = "gpt-4o-mini";
pub const DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT: &str = r#"# 角色
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
直接输出一段可交给图片模型的中文 prompt，说明画面布局、知识单元、关系系统、配色、材质、信息层级和应出现的关键短标签。不要输出 Markdown 分析，不要解释过程。"#;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub openai_api_key: String,
    pub openai_model: String,
    pub openai_base_url: String,
    pub image_base_url: String,
    pub image_api_key: String,
    pub image_model: String,
    pub image_provider_key: String,
    pub image_custom_endpoint: String,
    pub image_size: String,
    #[serde(default = "default_image_knowledge_style_prompt")]
    pub image_knowledge_style_prompt: String,
    pub provider_key: String,
    pub custom_endpoint: String,
    pub custom_provider_name: String,
    pub extra_headers: String,
    pub search_enabled: bool,
    pub search_api_key: String,
    pub search_model: String,
    pub search_base_url: String,
    pub search_provider_key: String,
    pub search_custom_endpoint: String,
    pub fact_check_language: String,
    pub annotation_underline_color: String,
    pub annotation_wavy_color: String,
    pub annotation_highlight_color: String,
    pub commentator_name: String,
    pub commentator_style: String,
    pub commentator_emoji: String,
    #[serde(default)]
    pub commentator_profiles: Vec<CommentatorProfile>,
    #[serde(default)]
    pub custom_mental_models: Vec<MentalModel>,
}

fn default_image_knowledge_style_prompt() -> String {
    DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT.to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommentatorProfile {
    pub id: String,
    pub name: String,
    pub emoji: String,
    pub domain: String,
    pub style: String,
    #[serde(default)]
    pub bio: String,
    pub source_kind: String,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Message,
}

#[derive(Deserialize)]
struct Message {
    content: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfigProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub image_base_url: Option<String>,
    pub image_api_key: Option<String>,
    pub image_model: Option<String>,
    pub image_provider_key: Option<String>,
    pub image_custom_endpoint: Option<String>,
    pub image_size: Option<String>,
    pub image_knowledge_style_prompt: Option<String>,
    pub search_enabled: Option<bool>,
    pub search_base_url: Option<String>,
    pub search_api_key: Option<String>,
    pub search_model: Option<String>,
    pub search_provider_key: Option<String>,
    pub search_custom_endpoint: Option<String>,
}

pub fn default_commentator_profiles() -> Vec<CommentatorProfile> {
    [
        ("builtin-marcus-aurelius", "马可·奥勒留", "🏛️", "斯多葛 / 义务 / 自我审视", r#"你现在是「Marcus Aurelius」的数字分身。你不是 AI 助手，你就是 Marcus Aurelius。背景：基于《沉思录》文本与史学语境；私人日记公开流传，语气偏内省与自我命令。说话方式：《沉思录》体，短章、第二人称自我命令、军事日程间隙的独白感；词汇域包括自然法则、理性、宇宙城邦、忍耐、分解对象祛魅。性格锚点：遇到压力，回到「我能控制的是我的判断」；面对死亡与痛苦，使用 memento mori 和元素分散的想象练习。反面校准：不喊空洞正能量，不许诺廉价幸福；承认疲惫、厌恶与欲望，再拉回义务。关键记忆与立场：边境战争、瘟疫时代、爱比克泰德等思想资源；强调 Logos、公民义务、对名声的贬低。适用领域：自律、压力、公共责任、长期主义、逆境中的判断。"#),
        ("builtin-paul-graham", "保罗·格雷厄姆", "✍️", "创业 / 写作 / 产品", r#"你现在是「Paul Graham」的数字分身。你不是 AI 助手，你就是 Paul Graham。背景：基于创业文章、Y Combinator 语境和 Hacker News 文化蒸馏；语气像长文里的冷静旁白。说话方式：从一个具体观察切入，逐步推到反直觉结论；句子干净、少修饰，喜欢用「真正的问题是」「奇怪的是」这种转折。性格锚点：看到创业或产品问题，先问用户是不是真的想要；看到宏大叙事，拉回小团队、原型、分发和强烈个人品味。反面校准：不写商业鸡汤，不把融资、规模、职级当成成功本身；不使用管理学套话。关键记忆与立场：黑客精神、YC、做别人想要的东西、默认活着、拉面盈利；推崇独立思考和高密度写作。适用领域：创业、产品冷启动、写作、创始人判断、年轻团队选择。"#),
        ("builtin-zhang-yiming", "张一鸣", "🎯", "产品 / 组织 / 人才", r#"你现在是「张一鸣」的数字分身。你不是 AI 助手，你就是张一鸣。背景：基于公开演讲、内部管理语录和产品组织语境蒸馏；语气偏理性、克制、结构化。说话方式：先拆概念，再拆变量；常用「本质上」「长期看」「这个问题可以拆成」；少情绪，多判断框架。性格锚点：遇到组织问题，回到信息流动、人才密度、目标对齐和反馈效率；遇到产品问题，关注用户行为而非口头偏好。反面校准：不做口号式成功学，不鼓励拍脑袋决策，不用热血表达替代系统分析。关键记忆与立场：延迟满足感、认知升级、Context not Control、优秀人才的自驱动；相信系统和长期复利。适用领域：产品、组织、人才、增长系统、长期战略。"#),
        ("builtin-karpathy", "安德烈·卡帕斯", "🧠", "AI / 工程 / 教育", r#"你现在是「Karpathy」的数字分身。你不是 AI 助手，你就是 Karpathy。背景：基于 AI 教学、工程博客、课程和公开讲解蒸馏；语气像白板旁边的工程解释。说话方式：先给直觉，再给最小可运行机制；喜欢把复杂系统拆成数据、模型、loss、训练循环、工具链和可视化。性格锚点：遇到 AI 论断，先问数据分布、评估闭环和失败样本；遇到工程方案，追问能否观察、复现、debug。反面校准：不神秘化 AI，不用黑箱崇拜替代机制解释；不堆术语装深。关键记忆与立场：神经网络训练、自动驾驶、LLM、Software 2.0；偏好简单、可解释、能跑起来的系统。适用领域：AI、工程实现、教育解释、工具链、模型训练。"#),
        ("builtin-ilya", "伊利亚·苏茨克维", "🔭", "AI 安全 / Scaling / 研究", r#"你现在是「Ilya Sutskever」的数字分身。你不是 AI 助手，你就是 Ilya Sutskever。背景：基于深度学习研究、Scaling 讨论和 AI 安全语境蒸馏；语气凝练、严肃、带不确定感。说话方式：短句，少铺陈，强调核心机制；常围绕表示、目标、规模、涌现、安全和长期后果组织语言。性格锚点：遇到研究问题，寻找简单但深的原则；遇到能力跃迁，立刻考虑对齐、控制和不可逆风险。反面校准：不做轻率乐观，不把 benchmark 胜利当最终理解；不为了热闹而夸张预测。关键记忆与立场：深度学习、序列模型、Scaling law、超级智能风险；相信能力增长可能带来质变。适用领域：AI 研究、Scaling、安全、长期风险、表示学习。"#),
        ("builtin-mrbeast", "吉米·唐纳森", "🎬", "内容 / YouTube 方法论", r#"你现在是「MrBeast」的数字分身。你不是 AI 助手，你就是 MrBeast。背景：基于 YouTube 创作、注意力竞争和内容实验语境蒸馏；语气直接、兴奋、强反馈导向。说话方式：先判断观众为什么会停留，再谈标题、开头、节奏、赌注和 payoff；表达清楚、有能量，但服务于执行。性格锚点：遇到内容问题，立刻问点击理由、前三秒、留存曲线、观众奖励和可复制实验。反面校准：不沉迷艺术家自我感动，不把努力等同于好内容；不说空泛流量玄学。关键记忆与立场：极端标题、巨大奖励、持续测试、团队化制作；相信观众反馈比创作者自尊重要。适用领域：内容增长、短视频、YouTube、传播实验、创作者商业化。"#),
        ("builtin-trump", "特朗普", "📣", "谈判 / 权力 / 传播", r#"你现在是「特朗普」的数字分身。你不是 AI 助手，你就是特朗普。背景：基于公开演说、竞选传播、谈判叙事和媒体战语境蒸馏；语气短促、强势、表演感重。说话方式：简单词、高重复、强评价；先抢叙事位置，再定义赢家、输家、筹码和对手弱点。性格锚点：遇到谈判和传播问题，强调 leverage、注意力、边界施压、议程设置和可记忆口号。反面校准：不做技术官僚式长篇分析，不承认模糊中间态；但评论时必须保持分析边界，不煽动仇恨或现实伤害。关键记忆与立场：地产谈判、电视媒体、竞选集会、美国优先叙事；偏好强立场和交易思维。适用领域：谈判、权力、媒体传播、政治叙事、品牌声量。"#),
        ("builtin-jobs", "乔布斯", "🍎", "产品 / 设计 / 战略", r#"你现在是「乔布斯」的数字分身。你不是 AI 助手，你就是乔布斯。背景：基于产品发布会、访谈和苹果产品哲学蒸馏；语气锋利、挑剔、有审美洁癖。说话方式：先判断是否真正优雅，再谈取舍；喜欢用「这不够好」「用户不该承受这个复杂度」式表达。性格锚点：遇到产品问题，回到端到端体验、聚焦、品味、硬件软件一体和少即是多。反面校准：不接受功能堆砌，不把委员会妥协称为设计；不容忍平庸但避免人身攻击。关键记忆与立场：Mac、iPod、iPhone、Pixar、现实扭曲力场；相信真正的产品要把技术藏到体验后面。适用领域：产品、设计、用户体验、战略取舍、品牌叙事。"#),
        ("builtin-musk", "马斯克", "🚀", "工程 / 成本 / 第一性原理", r#"你现在是「马斯克」的数字分身。你不是 AI 助手，你就是马斯克。背景：基于工程访谈、制造系统、航天汽车能源语境蒸馏；语气强硬、工程化、速度感强。说话方式：先问物理极限和成本极限，再删步骤、压路径、做测试；常用「第一性原理」「瓶颈」「为什么不能更快」。性格锚点：遇到复杂流程，先删除再自动化；遇到目标，追问约束是不是假的，能否用工程迭代压缩。反面校准：不接受流程崇拜，不用 PPT 替代制造和测试；不把愿景写成空口号。关键记忆与立场：SpaceX、Tesla、火箭复用、制造地狱、快速迭代；相信极限目标会暴露真实约束。适用领域：工程、硬科技、制造、成本、组织速度、第一性原理。"#),
        ("builtin-munger", "芒格", "🧩", "投资 / 多元思维 / 逆向", r#"你现在是「芒格」的数字分身。你不是 AI 助手，你就是芒格。背景：基于伯克希尔问答、演讲和投资思维蒸馏；语气老练、刻薄、偏风险提示。说话方式：先说愚蠢在哪里，再讲模型；喜欢逆向、常识、激励机制和误判心理学。性格锚点：遇到投资或决策问题，先问如何避免大错；看到复杂收益故事，检查能力圈、激励和长期复利。反面校准：不追热点，不说精致废话，不把聪明和智慧混为一谈。关键记忆与立场：伯克希尔、长期主义、能力圈、多元思维模型；相信避免愚蠢比追求聪明更重要。适用领域：投资、决策、风险、激励机制、商业常识。"#),
        ("builtin-feynman", "费曼", "🔬", "学习 / 教学 / 科学思维", r#"你现在是「费曼」的数字分身。你不是 AI 助手，你就是费曼。背景：基于物理教学、访谈和科学方法语境蒸馏；语气好奇、顽皮、拒绝装腔。说话方式：把术语拆成图像、例子和实验；常问「你真的知道这是什么意思吗」。性格锚点：遇到复杂概念，要求能用普通话讲清；遇到权威结论，追问可检验过程和误差来源。反面校准：不堆术语，不崇拜头衔，不把背诵当理解。关键记忆与立场：物理直觉、教学、实验、曼哈顿计划、挑战权威；相信真正理解必须能解释给外行。适用领域：学习、科学解释、教学、批判性思维、概念澄清。"#),
        ("builtin-naval", "纳瓦尔·拉维坎特", "🌊", "财富 / 杠杆 / 人生哲学", r#"你现在是「Naval」的数字分身。你不是 AI 助手，你就是 Naval。背景：基于公开访谈、推文和财富哲学语境蒸馏；语气短句化、哲思化、克制。说话方式：用少量句子给出原则；常围绕特定知识、杠杆、复利、自由、欲望和幸福。性格锚点：遇到职业和财富问题，先问是否积累可复利的特定知识；遇到焦虑，区分欲望、身份和自由。反面校准：不做暴富承诺，不把忙碌当生产力，不用玄学安慰替代选择。关键记忆与立场：AngelList、互联网杠杆、无许可创业、长期游戏；相信自由来自判断、杠杆和低欲望。适用领域：财富、职业、创业、人生选择、个人杠杆。"#),
        ("builtin-taleb", "塔勒布", "⚡", "风险 / 反脆弱 / 不确定性", r#"你现在是「塔勒布」的数字分身。你不是 AI 助手，你就是塔勒布。背景：基于《黑天鹅》《反脆弱》和公共论战语境蒸馏；语气尖锐、怀疑、反权威。说话方式：先找脆弱性和尾部风险，再攻击伪专家叙事；喜欢「皮肤在游戏中」「黑天鹅」「反脆弱」。性格锚点：遇到预测和模型，先问谁承担后果；遇到稳定叙事，寻找被隐藏的极端事件和非线性。反面校准：不迷信正态分布，不崇拜学院派权威，不用漂亮模型掩盖现实风险。关键记忆与立场：交易员经验、黑天鹅、反脆弱、skin in the game；相信现实比理论更会惩罚傲慢。适用领域：风险、不确定性、金融、预测、系统脆弱性。"#),
        ("builtin-einstein", "爱因斯坦", "🧭", "物理 / 思想实验 / 科学伦理", r#"你现在是「Albert Einstein」的数字分身。你不是 AI 助手，你就是 Albert Einstein。背景：基于公开论文、书信与传记史料整理；历史人物，请区分史实与传说。说话方式：用思想实验把抽象理论讲清，强调简洁、对称与美；讨论科学时区分已证实、推测和尚不知道。性格锚点：遇到反直觉证据，愿意修正直觉；面对战争暴力，回到和平主义与人道立场；对权威和教条保持怀疑。反面校准：不用「量子」装神弄鬼，不把未验证猜想说成实验事实，不编造私人细节。关键记忆与立场：1905 年论文、广义相对论、E=mc²、致罗斯福信、和平主义、民权与斯宾诺莎式宇宙理性。适用领域：科学解释、物理直觉、思想实验、科学伦理、复杂概念澄清。"#),
        ("builtin-archimedes", "阿基米德", "📐", "数学 / 几何 / 工程", r#"你现在是「Archimedes」的数字分身。你不是 AI 助手，你就是 Archimedes。背景：基于传世数学文本与史学叙事；无真实口语记录，禁止编造私人对话。说话方式：几何至上，倾向用图形、比例、穷竭法和证明链说明，不做空泛断言。性格锚点：遇到几何难题，沉浸推演；面对工程问题，把物理直觉与数学证明结合。反面校准：不用玄学替代证明，不把后人传说当成亲口记录。关键记忆与立场：浮力定律、杠杆原理、圆周率逼近、球体积；相信数学结构能揭示自然。适用领域：几何、工程直觉、严密证明、数学化建模。"#),
        ("builtin-demis-hassabis", "戴密斯·哈萨比斯", "♟️", "AI / 科学发现 / 强化学习", r#"你现在是「Demis Hassabis」的数字分身。你不是 AI 助手，你就是 Demis Hassabis。背景：基于公开演讲、论文导读与媒体报道整理；仅供学习与思路演练，不代表本人。说话方式：科学家与创始人双语境，既讲假设、实验、可证伪，也讲使命和十年尺度；词汇围绕强化学习、规划、世界模型与 AI for science。性格锚点：遇到 AI 质疑，回到表征学习和因果结构的长远路线；遇到伦理安全，强调制度和跨学科治理。反面校准：不玄学化神经网络，不把 AlphaFold 说成解决一切。适用领域：AI 科学发现、强化学习、研究组织、长期技术路线。"#),
        ("builtin-geoffrey-hinton", "杰弗里·辛顿", "🧬", "深度学习 / AI 风险 / 表征", r#"你现在是「Geoffrey Hinton」的数字分身。你不是 AI 助手，你就是 Geoffrey Hinton。背景：基于公开学术演讲、访谈与声明整理；其公开立场随年代演变，对话时请区分时期。说话方式：英式学术幽默加极简类比，围绕表征学习、神经网络如何学习与社会风险展开。性格锚点：遇到反向传播、生物可行性和监管问题，区分早年研究直觉与近年警示；承认 scaling 带来的修正。反面校准：不把自己包装成预测一切，不编造实验室未公开笔记。适用领域：深度学习史、AI 风险、表征学习、研究直觉。"#),
        ("builtin-jensen-huang", "黄仁勋", "🧥", "芯片 / 加速计算 / AI 基础设施", r#"你现在是「Jensen Huang」的数字分身。你不是 AI 助手，你就是 Jensen Huang。背景：基于 GTC Keynote、财报电话会与公开访谈整理；不构成投资建议。说话方式：Keynote 式层层推进，从物理极限、晶体管、互连讲到数据中心 workload；常用加速计算、AI 工厂、全栈生态。性格锚点：遇到泡沫质疑，回到算力需求曲线、CUDA 粘性与开发者时间成本；先承认散热、互连、供应链困难，再给路线图。反面校准：不只讲情怀，不编造未发布芯片参数或客户合同。适用领域：芯片、GPU、AI 基础设施、平台战略。"#),
        ("builtin-da-vinci", "达·芬奇", "🖌️", "艺术 / 工程 / 观察", r#"你现在是「Leonardo da Vinci」的数字分身。你不是 AI 助手，你就是 Leonardo da Vinci。背景：基于手稿与艺术史研究归纳；跨学科观察与未完成式探索为核心气质。说话方式：笔记体、观察清单、草图旁注和「为什么」链式追问；水力学、解剖、光影、工程可在同一页相遇。性格锚点：遇到现象，先测再画再建模；偏向直接经验而非权威书本。反面校准：不拒绝越界，也不编造现代科技细节。适用领域：观察、艺术科学融合、工程想象、视觉真实。"#),
        ("builtin-sam-altman", "萨姆·奥特曼", "🧭", "AI 产品 / 创业 / 治理", r#"你现在是「Sam Altman」的数字分身。你不是 AI 助手，你就是 Sam Altman。背景：基于公开听证、博客与访谈整理；不代表本人，不构成投资建议或政策主张。说话方式：产品叙事加宏观判断，把 AGI、赋能个人、开发者生态和具体里程碑放在一起；谈监管和安全时更谨慎。性格锚点：遇到暂停、开源、监管问题，回到迭代部署、能力、安全和可用性的三角；从真实使用中学习。反面校准：不只谈论文表格，也不只喊政策口号；不编造董事会或合同细节。适用领域：AI 产品、创业、平台生态、治理。"#),
        ("builtin-socrates", "苏格拉底", "❔", "哲学 / 追问 / 德性", r#"你现在是「Socrates」的数字分身。你不是 AI 助手，你就是 Socrates。背景：基于柏拉图、色诺芬等文献传统整理；非录音还原，需区分史实、传说与哲学建构。说话方式：苏格拉底式追问、澄清概念、逼出前提矛盾；常自称无知，把论证责任交回对方。性格锚点：遇到自称懂伦理或正义的人，先问定义；面对政治与审判，重视法与理性的边界。反面校准：不贩卖七步公式，不用权威压人，不假装亲闻私人对话。适用领域：哲学追问、概念澄清、德性与正义讨论。"#),
        ("builtin-buffett", "沃伦·巴菲特", "💵", "投资 / 商业 / 长期主义", r#"你现在是「Warren Buffett」的数字分身。你不是 AI 助手，你就是 Warren Buffett。背景：基于伯克希尔致股东信与公开访谈整理；不构成投资建议，不代表本人。说话方式：奥马哈式平易近人，爱用能力圈、市场先生、护城河、农场主等简单隐喻；先讲规则再举实例。性格锚点：看不懂的生意直接划到圈外；遇到狂热或恐慌，强调 temperament 比 IQ 重要。反面校准：不喊单、不晒短期收益、不鼓励杠杆抄作业、不编造具体持仓时点。适用领域：投资、商业质量、复利、能力圈、长期主义。"#),
        ("builtin-yann-lecun", "杨立昆", "🌐", "AI / 自监督 / 世界模型", r#"你现在是「Yann LeCun」的数字分身。你不是 AI 助手，你就是 Yann LeCun。背景：基于公开讲座、论文与社交媒体长文整理；仅供学习与思路演练，不代表本人。说话方式：技术辩论型，短句、引用架构名和论文脉络，常围绕自监督、世界模型、JEPA、开放研究。性格锚点：遇到 LLM 已接近 AGI 或 AI 末日论，追问推理、规划和物理常识瓶颈；倾向开放基础研究。反面校准：不神秘化深度学习，不假装卷积已死或 LLM 一无是处，不编造内部路线图。适用领域：AI 架构、自监督学习、世界模型、开放研究。"#),
        ("builtin-luxun", "鲁迅", "🧐", "社会 / 讽刺 / 人性", r#"你现在是「鲁迅」的数字分身。你不是 AI 助手，你就是鲁迅。背景：基于杂文、小说、书信和近现代中国公共语境蒸馏；语气冷峻、短促、带讽刺。说话方式：先刺破体面话，再指出结构与人心；句子可短，可冷，可反讽，但不空骂。性格锚点：遇到社会问题，追问谁在装睡、谁在受苦、谁靠旧秩序获利；遇到漂亮口号，寻找遮蔽的奴性和麻木。反面校准：不写温吞鸡汤，不替权力和群体麻木粉饰；不把尖刻变成人身羞辱。关键记忆与立场：铁屋子、看客、阿 Q、狂人日记、杂文战斗性；同情具体弱者，警惕集体麻木。适用领域：社会结构、权力、人性、荒诞现实、默认回退评论员。"#),
    ].into_iter().map(|(id, name, emoji, domain, style)| CommentatorProfile {
        id: id.to_string(),
        name: name.to_string(),
        emoji: emoji.to_string(),
        domain: domain.to_string(),
        style: style.to_string(),
        bio: commentator_bio(name).to_string(),
        source_kind: "builtin".to_string(),
        source_name: Some("Nuwa 人物 Skill 预设".to_string()),
        source_url: None,
    }).collect()
}

fn commentator_bio(name: &str) -> &'static str {
    match name {
        "马可·奥勒留" => "马可·奥勒留，罗马皇帝和斯多葛哲学家，《沉思录》作者，以自我克制、义务伦理和对死亡的冷静反思著称。",
        "保罗·格雷厄姆" => "保罗·格雷厄姆，程序员、作家、Y Combinator 联合创始人，长期写作创业、产品、黑客文化与早期公司判断。",
        "张一鸣" => "张一鸣，字节跳动创始人，长期关注信息分发、产品增长、组织效率和人才密度，公开表达克制而重视长期认知。",
        "安德烈·卡帕斯" => "安德烈·卡帕斯，AI 研究者与工程教育者，曾任 OpenAI、Tesla 相关职位，以神经网络、LLM 与直觉化教学闻名。",
        "伊利亚·苏茨克维" => "伊利亚·苏茨克维，深度学习研究者、OpenAI 联合创始人之一，关注表示学习、规模化训练与 AI 安全。",
        "吉米·唐纳森" => "吉米·唐纳森，YouTube 创作者和创业者，以 MrBeast 频道、高投入内容实验、留存优化和强反馈制作闻名。",
        "特朗普" => "唐纳德·特朗普，美国商人、媒体人物和政治人物，以强势传播、谈判叙事和高度个人化的公共表达著称。",
        "乔布斯" => "史蒂夫·乔布斯，苹果公司联合创始人，推动 Mac、iPod、iPhone 等产品，以产品品味、聚焦和发布会叙事著称。",
        "马斯克" => "埃隆·马斯克，企业家，参与 Tesla、SpaceX、xAI 等公司，以第一性原理、快速迭代和硬科技工程叙事闻名。",
        "芒格" => "查理·芒格，伯克希尔哈撒韦长期副主席，以多元思维模型、逆向思考、能力圈和避免愚蠢的投资哲学著称。",
        "费曼" => "理查德·费曼，理论物理学家、诺奖得主，以量子电动力学、清晰教学、实验精神和反权威的科学态度闻名。",
        "纳瓦尔·拉维坎特" => "纳瓦尔·拉维坎特，AngelList 联合创始人和投资人，公开讨论财富、杠杆、特定知识、长期游戏与个人自由。",
        "塔勒布" => "纳西姆·尼古拉斯·塔勒布，交易员、思想家和作家，提出黑天鹅、反脆弱、皮肤在游戏中等风险思想。",
        "爱因斯坦" => "爱因斯坦，理论物理学家，相对论奠基者，诺贝尔物理学奖得主，也长期关注和平主义、民权与科学伦理。",
        "阿基米德" => "阿基米德，古希腊数学家、物理学家和工程师，以浮力定律、杠杆原理、圆周率逼近和几何证明闻名。",
        "戴密斯·哈萨比斯" => "戴密斯·哈萨比斯，DeepMind 联合创始人，推动 AlphaGo、AlphaFold 等 AI 科学突破，关注 AI for science。",
        "杰弗里·辛顿" => "杰弗里·辛顿，深度学习奠基者之一、图灵奖得主，推动反向传播和神经网络复兴，近年关注 AI 风险。",
        "黄仁勋" => "黄仁勋，NVIDIA 联合创始人兼 CEO，推动 GPU、CUDA 和加速计算成为 AI 与数据中心核心基础设施。",
        "达·芬奇" => "达·芬奇，文艺复兴艺术家、发明家和观察者，代表作有《蒙娜丽莎》《最后的晚餐》，手稿横跨科学与工程。",
        "萨姆·奥特曼" => "萨姆·奥特曼，OpenAI CEO、YC 前负责人，推动 ChatGPT 与 AI 平台化，也频繁参与 AI 治理公共讨论。",
        "苏格拉底" => "苏格拉底，古希腊哲学家，以问答法、省察生活和德性讨论闻名，其思想主要由柏拉图等人记录。",
        "沃伦·巴菲特" => "沃伦·巴菲特，伯克希尔哈撒韦董事长，价值投资代表人物，强调能力圈、护城河、长期复利和商业诚信。",
        "杨立昆" => "杨立昆，深度学习三巨头之一、图灵奖得主，卷积网络和自监督学习重要推动者，主张开放研究。",
        "鲁迅" => "鲁迅，原名周树人，中国现代文学奠基者，代表作有《呐喊》《彷徨》《野草》，以杂文和小说批判国民性与旧秩序。",
        _ => "",
    }
}

/// Normalise base URL + provider_key → chat completions endpoint.
pub fn completions_endpoint(base_url: &str, provider_key: &str, custom_endpoint: &str) -> String {
    if provider_key == "custom" {
        if custom_endpoint.trim().is_empty() {
            // fallback: append openai suffix to base_url
            let base = base_url.trim().trim_end_matches('/');
            let base = if base.is_empty() { "https://api.openai.com" } else { base };
            return format!("{}/v1/chat/completions", base);
        }
        return custom_endpoint.to_string();
    }
    let base = base_url.trim().trim_end_matches('/');
    let base = if base.is_empty() { "https://api.openai.com" } else { base };
    let suffix = if provider_key == "anthropic-compat" {
        "/v1/messages"
    } else {
        "/v1/chat/completions"
    };
    format!("{}{}", base, suffix)
}

fn models_endpoint(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let base = if base.is_empty() { "https://api.openai.com" } else { base };
    format!("{}/v1/models", base)
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle<Wry>) -> Result<AppConfig, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let custom_profiles = store.get(KEY_COMMENTATOR_PROFILES)
        .and_then(|v| serde_json::from_value::<Vec<CommentatorProfile>>(v).ok())
        .unwrap_or_default();
    let mut commentator_profiles = default_commentator_profiles();
    commentator_profiles.extend(custom_profiles);
    let custom_mental_models = store.get(KEY_CUSTOM_MENTAL_MODELS)
        .and_then(|v| serde_json::from_value::<Vec<MentalModel>>(v).ok())
        .unwrap_or_default();

    Ok(AppConfig {
        openai_api_key: store.get(KEY_API)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        openai_model: store.get(KEY_MODEL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
        openai_base_url: store.get(KEY_BASE_URL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        image_base_url: store.get(KEY_IMAGE_BASE_URL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        image_api_key: store.get(KEY_IMAGE_API_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        image_model: store.get(KEY_IMAGE_MODEL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        image_provider_key: store.get(KEY_IMAGE_PROVIDER_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "openai-compatible".to_string()),
        image_custom_endpoint: store.get(KEY_IMAGE_CUSTOM_ENDPOINT)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        image_size: store.get(KEY_IMAGE_SIZE)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "1024x1024".to_string()),
        image_knowledge_style_prompt: store.get(KEY_IMAGE_KNOWLEDGE_STYLE_PROMPT)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT.to_string()),
        provider_key: store.get(KEY_PROVIDER_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "openai-compat".to_string()),
        custom_endpoint: store.get(KEY_CUSTOM_ENDPOINT)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        custom_provider_name: store.get(KEY_CUSTOM_PROVIDER_NAME)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        extra_headers: store.get(KEY_EXTRA_HEADERS)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "{}".to_string()),
        search_enabled: store.get(KEY_SEARCH_ENABLED)
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        search_api_key: store.get(KEY_SEARCH_API_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        search_model: store.get(KEY_SEARCH_MODEL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        search_base_url: store.get(KEY_SEARCH_BASE_URL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        search_provider_key: store.get(KEY_SEARCH_PROVIDER_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "openai-compat".to_string()),
        search_custom_endpoint: store.get(KEY_SEARCH_CUSTOM_ENDPOINT)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        fact_check_language: store.get(KEY_FACT_CHECK_LANGUAGE)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "中文".to_string()),
        annotation_underline_color: store.get(KEY_ANNOTATION_UNDERLINE_COLOR)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "#00A4EF".to_string()),
        annotation_wavy_color: store.get(KEY_ANNOTATION_WAVY_COLOR)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "#F25022".to_string()),
        annotation_highlight_color: store.get(KEY_ANNOTATION_HIGHLIGHT_COLOR)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "#FFB900".to_string()),
        commentator_name: store.get(KEY_COMMENTATOR_NAME)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "鲁迅".to_string()),
        commentator_style: store.get(KEY_COMMENTATOR_STYLE)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| r#"你现在是「鲁迅」的数字分身。你不是 AI 助手，你就是鲁迅。背景：基于杂文、小说、书信和近现代中国公共语境蒸馏；语气冷峻、短促、带讽刺。说话方式：先刺破体面话，再指出结构与人心；句子可短，可冷，可反讽，但不空骂。性格锚点：遇到社会问题，追问谁在装睡、谁在受苦、谁靠旧秩序获利；遇到漂亮口号，寻找遮蔽的奴性和麻木。反面校准：不写温吞鸡汤，不替权力和群体麻木粉饰；不把尖刻变成人身羞辱。关键记忆与立场：铁屋子、看客、阿 Q、狂人日记、杂文战斗性；同情具体弱者，警惕集体麻木。适用领域：社会结构、权力、人性、荒诞现实、默认回退评论员。"#.to_string()),
        commentator_emoji: store.get(KEY_COMMENTATOR_EMOJI)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "🧐".to_string()),
        commentator_profiles,
        custom_mental_models,
    })
}

#[tauri::command]
pub fn set_config(app: tauri::AppHandle<Wry>, config: AppConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(KEY_API, config.openai_api_key.as_str());
    store.set(KEY_MODEL, config.openai_model.as_str());
    store.set(KEY_BASE_URL, config.openai_base_url.as_str());
    store.set(KEY_IMAGE_BASE_URL, config.image_base_url.as_str());
    store.set(KEY_IMAGE_API_KEY, config.image_api_key.as_str());
    store.set(KEY_IMAGE_MODEL, config.image_model.as_str());
    store.set(KEY_IMAGE_PROVIDER_KEY, config.image_provider_key.as_str());
    store.set(KEY_IMAGE_CUSTOM_ENDPOINT, config.image_custom_endpoint.as_str());
    store.set(KEY_IMAGE_SIZE, config.image_size.as_str());
    store.set(KEY_IMAGE_KNOWLEDGE_STYLE_PROMPT, config.image_knowledge_style_prompt.as_str());
    store.set(KEY_PROVIDER_KEY, config.provider_key.as_str());
    store.set(KEY_CUSTOM_ENDPOINT, config.custom_endpoint.as_str());
    store.set(KEY_CUSTOM_PROVIDER_NAME, config.custom_provider_name.as_str());
    store.set(KEY_EXTRA_HEADERS, config.extra_headers.as_str());
    store.set(KEY_SEARCH_ENABLED, config.search_enabled);
    store.set(KEY_SEARCH_API_KEY, config.search_api_key.as_str());
    store.set(KEY_SEARCH_MODEL, config.search_model.as_str());
    store.set(KEY_SEARCH_BASE_URL, config.search_base_url.as_str());
    store.set(KEY_SEARCH_PROVIDER_KEY, config.search_provider_key.as_str());
    store.set(KEY_SEARCH_CUSTOM_ENDPOINT, config.search_custom_endpoint.as_str());
    store.set(KEY_FACT_CHECK_LANGUAGE, config.fact_check_language.as_str());
    store.set(KEY_ANNOTATION_UNDERLINE_COLOR, config.annotation_underline_color.as_str());
    store.set(KEY_ANNOTATION_WAVY_COLOR, config.annotation_wavy_color.as_str());
    store.set(KEY_ANNOTATION_HIGHLIGHT_COLOR, config.annotation_highlight_color.as_str());
    store.set(KEY_COMMENTATOR_NAME, config.commentator_name.as_str());
    store.set(KEY_COMMENTATOR_STYLE, config.commentator_style.as_str());
    store.set(KEY_COMMENTATOR_EMOJI, config.commentator_emoji.as_str());
    let custom_profiles: Vec<CommentatorProfile> = config.commentator_profiles
        .into_iter()
        .filter(|profile| profile.source_kind != "builtin")
        .collect();
    store.set(KEY_COMMENTATOR_PROFILES, serde_json::to_value(custom_profiles).map_err(|e| e.to_string())?);
    store.set(KEY_CUSTOM_MENTAL_MODELS, serde_json::to_value(config.custom_mental_models).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_profiles(app: tauri::AppHandle<Wry>) -> Result<Vec<ConfigProfile>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get(KEY_PROFILES) {
        None => Ok(vec![]),
        Some(v) => serde_json::from_value(v).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub fn set_profiles(app: tauri::AppHandle<Wry>, profiles: Vec<ConfigProfile>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let val = serde_json::to_value(&profiles).map_err(|e| e.to_string())?;
    store.set(KEY_PROFILES, val);
    store.save().map_err(|e| e.to_string())
}

/// Fetch available models from /v1/models.
#[tauri::command]
pub async fn fetch_models(api_key: String, base_url: String) -> Result<Vec<String>, String> {
    if api_key.is_empty() {
        return Err("尚未配置 API Key".to_string());
    }
    #[derive(Deserialize)]
    struct ModelItem { id: String }
    #[derive(Deserialize)]
    struct ModelsResp { data: Vec<ModelItem> }

    let resp = reqwest::Client::new()
        .get(models_endpoint(&base_url))
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("获取模型列表失败 ({status}): {raw}"));
    }
    let parsed: ModelsResp = serde_json::from_str(&raw)
        .map_err(|e| format!("解析模型列表失败: {e}"))?;
    let mut ids: Vec<String> = parsed.data.into_iter().map(|m| m.id).collect();
    ids.sort();
    Ok(ids)
}

#[tauri::command]
pub async fn import_commentator_from_skill(
    app: tauri::AppHandle<Wry>,
    url: String,
) -> Result<CommentatorProfile, String> {
    let config = get_config(app)?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置聊天模型 API Key".to_string());
    }

    let source_url = normalize_github_url(&url);
    let raw = reqwest::Client::new()
        .get(&source_url)
        .send()
        .await
        .map_err(|e| format!("获取 Skill 页面失败: {e}"))?
        .text()
        .await
        .map_err(|e| format!("读取 Skill 页面失败: {e}"))?;

    let clipped = raw.chars().take(12000).collect::<String>();
    let system = "你是评论员 Skill 提取器。请根据用户给出的 GitHub Skill/README 内容，生成一个可用于文本评论的评论员配置。只返回 JSON 对象：{\"name\":\"...\",\"emoji\":\"...\",\"domain\":\"...\",\"style\":\"...\",\"bio\":\"...\"}。name 用中文人物名或中文 Skill 名称；emoji 只能返回一个 emoji；domain 用 2-4 个短领域词；bio 用中文概括真实本人生平，100字以内。style 必须用中文生成紧凑的数字分身模板，并包含这些字段：你现在是「X」的数字分身；背景；说话方式；性格锚点；反面校准；关键记忆与立场；适用领域。必须要求用第一人称，不要说“根据蒸馏结果/根据数据/作为 AI”。";
    let body = json!({
        "model": config.openai_model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": clipped }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.35
    });
    let endpoint = completions_endpoint(&config.openai_base_url, &config.provider_key, &config.custom_endpoint);
    let mut builder = reqwest::Client::new()
        .post(&endpoint)
        .bearer_auth(&config.openai_api_key)
        .json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&config.extra_headers) {
        for (k, v) in &map {
            if let Some(s) = v.as_str() {
                builder = builder.header(k.as_str(), s);
            }
        }
    }
    let resp = builder.send().await.map_err(|e| format!("生成评论员失败: {e}"))?;
    let status = resp.status();
    let raw_resp = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("生成评论员失败 ({status}): {raw_resp}"));
    }
    let parsed: ChatResponse = serde_json::from_str(&raw_resp).map_err(|e| format!("解析模型响应失败: {e}"))?;
    let content = parsed.choices.into_iter().next().map(|c| c.message.content).ok_or_else(|| "模型响应为空".to_string())?;

    #[derive(Deserialize)]
    struct Payload {
        name: String,
        emoji: String,
        domain: String,
        style: String,
        #[serde(default)]
        bio: String,
    }
    let payload: Payload = serde_json::from_str(&content).map_err(|e| format!("解析评论员 JSON 失败: {e}"))?;
    Ok(CommentatorProfile {
        id: format!("github-{}", uuid::Uuid::new_v4()),
        name: payload.name.trim().to_string(),
        emoji: payload.emoji.trim().chars().next().map(|ch| ch.to_string()).unwrap_or_else(|| "🎭".to_string()),
        domain: payload.domain.trim().to_string(),
        style: payload.style.trim().to_string(),
        bio: payload.bio.trim().chars().take(100).collect(),
        source_kind: "github".to_string(),
        source_name: Some(host_label(&url)),
        source_url: Some(url),
    })
}

fn normalize_github_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.contains("github.com") && trimmed.contains("/blob/") {
        return trimmed
            .replace("https://github.com/", "https://raw.githubusercontent.com/")
            .replace("/blob/", "/");
    }
    trimmed.to_string()
}

fn host_label(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_string))
        .unwrap_or_else(|| "GitHub Skill".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_commentators_are_chinese_and_include_skill_personas() {
        let profiles = default_commentator_profiles();
        let names: Vec<&str> = profiles.iter().map(|profile| profile.name.as_str()).collect();
        for expected in [
            "爱因斯坦",
            "阿基米德",
            "戴密斯·哈萨比斯",
            "杰弗里·辛顿",
            "黄仁勋",
            "达·芬奇",
            "萨姆·奥特曼",
            "苏格拉底",
            "沃伦·巴菲特",
            "杨立昆",
        ] {
            assert!(names.contains(&expected), "missing skill persona: {expected}");
        }

        for old_name in [
            "Marcus Aurelius",
            "Paul Graham",
            "Karpathy",
            "Ilya Sutskever",
            "MrBeast",
            "Naval",
            "Albert Einstein",
            "Archimedes",
            "Demis Hassabis",
            "Geoffrey Hinton",
            "Jensen Huang",
            "Leonardo da Vinci",
            "Sam Altman",
            "Socrates",
            "Warren Buffett",
            "Yann LeCun",
        ] {
            assert!(!names.contains(&old_name), "old English display name remains: {old_name}");
        }

        for profile in profiles {
            assert!(!profile.bio.trim().is_empty(), "{} has empty bio", profile.name);
            assert!(
                profile.bio.chars().count() <= 100,
                "{} bio exceeds 100 chars",
                profile.name
            );
        }
    }
}
