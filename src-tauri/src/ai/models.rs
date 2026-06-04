use serde::{Deserialize, Serialize};

/// A thinking framework / mental model. `prompt_lens` is backend-only (the LLM
/// instruction); it is skipped when serialized to the frontend.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MentalModel {
    pub key: String,
    pub name: String,
    pub description: String,
    #[serde(skip)]
    pub prompt_lens: String,
}

fn m(key: &str, name: &str, description: &str, prompt_lens: &str) -> MentalModel {
    MentalModel {
        key: key.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        prompt_lens: prompt_lens.to_string(),
    }
}

/// All mental models in the library. Add a model = add one row here.
pub fn all() -> Vec<MentalModel> {
    let mut v = Vec::new();
    v.extend(consulting());
    v.extend(munger());
    v.extend(learning());
    v.extend(process());
    v
}

/// Look up a single model by key.
pub fn by_key(key: &str) -> Option<MentalModel> {
    all().into_iter().find(|m| m.key == key)
}

/// 结构化 / 咨询（麦肯锡系）
fn consulting() -> Vec<MentalModel> {
    vec![
        m(
            "mece",
            "MECE",
            "相互独立、完全穷尽地拆分问题。",
            "请用 MECE 原则重新拆解这个观点：把它分解为若干相互独立、完全穷尽的子要点，确保不重叠、不遗漏。",
        ),
        m(
            "pyramid",
            "金字塔原理",
            "结论先行，自上而下表达（Minto）。",
            "请用金字塔原理重组这个观点：先给出核心结论，再列出支撑它的几条平行论据，每条论据下可附依据。",
        ),
        m(
            "logic_tree",
            "逻辑树 / 议题树",
            "把核心议题层层分解为可解的子问题。",
            "请把这个观点作为根议题，构建一棵逻辑树：逐层分解为更小、可独立分析的子议题。",
        ),
        m(
            "hypothesis_driven",
            "假设驱动",
            "先立假设，再设计验证。",
            "请用假设驱动法分析这个观点：提出 1-2 个核心假设，并指出验证或证伪每个假设需要的关键证据。",
        ),
        m(
            "scqa",
            "SCQA",
            "情境-冲突-问题-答案的叙事结构。",
            "请用 SCQA 框架重述这个观点：依次给出情境(Situation)、冲突(Complication)、问题(Question)、答案(Answer)。",
        ),
        m(
            "pareto",
            "80/20 帕累托",
            "找出贡献最大结果的少数关键因素。",
            "请用 80/20 帕累托法则分析这个观点：识别出真正起决定作用的少数关键因素，并说明为什么其余因素影响有限。",
        ),
        m(
            "swot",
            "SWOT",
            "优势-劣势-机会-威胁四象限分析。",
            "请用 SWOT 框架分析这个观点：分别列出其优势(S)、劣势(W)、机会(O)、威胁(T)。",
        ),
        m(
            "five_forces",
            "波特五力",
            "从五种竞争力量评估行业格局。",
            "请用波特五力模型分析这个观点涉及的竞争格局：现有竞争、新进入者、替代品、供方议价、买方议价。",
        ),
        m(
            "value_chain",
            "价值链分析",
            "拆解创造价值的各个活动环节。",
            "请用价值链分析这个观点：拆解出创造价值的关键活动环节，并指出价值在哪些环节产生或流失。",
        ),
    ]
}

/// 芒格思维格栅（Mental Models）
fn munger() -> Vec<MentalModel> {
    vec![
        m(
            "first_principles",
            "第一性原理",
            "回到最基本的事实重新推导。",
            "请用第一性原理分析这个观点：剥离一切假设和类比，回到最基本、不可再分的事实，从头重新推导结论。",
        ),
        m(
            "occam",
            "奥卡姆剃刀",
            "如无必要，勿增实体。",
            "请用奥卡姆剃刀审视这个观点：找出最简洁、假设最少的解释，剔除不必要的复杂性。",
        ),
        m(
            "inversion",
            "反演思维",
            "反过来想，从失败倒推。",
            "请用反演思维分析这个观点：不去想如何成功，而是反过来想——什么会导致它彻底失败？据此倒推应避免什么。",
        ),
        m(
            "second_order",
            "二阶思维",
            "再然后呢？追问后续连锁后果。",
            "请用二阶思维分析这个观点：在直接结果之后，继续追问“然后呢”，揭示更长链条的连锁后果。",
        ),
        m(
            "opportunity_cost",
            "机会成本",
            "选择的代价是放弃的最优替代。",
            "请用机会成本视角分析这个观点：采纳它意味着放弃了哪些更优的替代选择？这些放弃的代价是什么？",
        ),
        m(
            "sunk_cost",
            "沉没成本谬误",
            "已付出的成本不应左右当下决策。",
            "请用沉没成本谬误检视这个观点：是否存在因已投入而不愿放弃的倾向？剥离沉没成本后，理性选择是什么？",
        ),
        m(
            "bayesian",
            "概率 / 贝叶斯思维",
            "用先验和新证据动态更新信念。",
            "请用贝叶斯思维分析这个观点：给出合理的先验判断，再说明哪些新证据会如何更新这个判断的可信度。",
        ),
        m(
            "systems",
            "系统思维",
            "关注要素间的反馈与整体结构。",
            "请用系统思维分析这个观点：识别其中的关键要素、相互反馈回路，以及可能的杠杆点和延迟效应。",
        ),
        m(
            "compounding",
            "复利思维",
            "微小持续的积累带来指数效应。",
            "请用复利思维分析这个观点：其中是否存在可随时间持续累积、产生指数级回报（或代价）的因素？",
        ),
        m(
            "hanlon",
            "汉隆剃刀",
            "能用愚蠢解释的，不要归咎恶意。",
            "请用汉隆剃刀审视这个观点：在归因时，是否把可由无知、疏忽解释的现象错误地归为了恶意？",
        ),
        m(
            "antifragile",
            "反脆弱",
            "在波动和压力中反而获益。",
            "请用反脆弱视角分析这个观点：它在不确定性和冲击下是会受损、保持不变，还是反而能从中获益？如何增强其反脆弱性？",
        ),
    ]
}

/// 学习 / 理解法
fn learning() -> Vec<MentalModel> {
    vec![
        m(
            "feynman",
            "费曼学习法",
            "用最简单的话讲清楚，暴露理解漏洞。",
            "请用费曼学习法解读这个观点：用最朴素、连小白都能懂的语言重新讲一遍，并指出其中最容易卡壳、需要补强的概念。",
        ),
        m(
            "socratic",
            "苏格拉底诘问",
            "连环追问，暴露背后的前提。",
            "请用苏格拉底诘问法分析这个观点：通过一连串追问，逐步暴露它隐含的前提假设和可能的逻辑漏洞。",
        ),
        m(
            "five_whys",
            "5 Whys 五问法",
            "连问五个为什么，追到根因。",
            "请用 5 Whys 五问法分析这个观点：连续追问“为什么”，逐层深入，直到触及根本原因。",
        ),
        m(
            "analogy",
            "类比迁移",
            "借已知领域的结构理解新问题。",
            "请用类比迁移法解读这个观点：找一个用户熟悉的领域作类比，借其结构帮助理解，并指出类比成立与失效的边界。",
        ),
    ]
}

/// 流程 / 分析框架
fn process() -> Vec<MentalModel> {
    vec![
        m(
            "5w2h",
            "5W2H",
            "What/Why/Who/When/Where/How/How much 全面提问。",
            "请用 5W2H 框架分析这个观点：依次回答是什么、为什么、谁、何时、何地、怎么做、代价多少。",
        ),
        m(
            "pdca",
            "PDCA",
            "计划-执行-检查-改进的循环。",
            "请用 PDCA 循环解读这个观点：把它落到计划(Plan)、执行(Do)、检查(Check)、改进(Act)四个阶段。",
        ),
        m(
            "ooda",
            "OODA 循环",
            "观察-调整-决策-行动的快速迭代。",
            "请用 OODA 循环分析这个观点：拆解为观察(Observe)、调整(Orient)、决策(Decide)、行动(Act)，并指出迭代速度的关键。",
        ),
        m(
            "fishbone",
            "鱼骨图",
            "因果图，系统归类问题成因（石川）。",
            "请用鱼骨图(因果图)分析这个观点：把它视为结果，从人、机、料、法、环等维度系统归类其可能成因。",
        ),
        m(
            "smart",
            "SMART 目标",
            "具体/可衡量/可达成/相关/有时限。",
            "请用 SMART 原则重述这个观点中蕴含的目标：使其具体、可衡量、可达成、相关且有明确时限。",
        ),
        m(
            "decision_matrix",
            "决策矩阵",
            "按加权标准对多个选项打分排序。",
            "请用决策矩阵分析这个观点：列出相关选项与评估标准，给标准加权并对选项打分，得出排序。",
        ),
        m(
            "pros_cons",
            "利弊权衡",
            "罗列利弊并界定适用边界。",
            "请用利弊权衡法分析这个观点：分别列出利与弊，并说明它在什么条件下成立、什么条件下不再适用。",
        ),
    ]
}
