# Step 7: 深挖动作（解释/反驳/追问/框架解读 → 子 Point）

## 目标
让用户对任意 Point 触发 AI 深挖动作，生成**子 Point**，形成无限层级的树状观点。
这是产品「主动引导深度思考」理念的核心交互，把单向提取升级为可交互探索。

## 背景
- Step 4 已有 `ai/openai.rs::extract_points`（reqwest chat completions，json_object，bearer_auth，完整 anyhow 错误处理）。深挖动作复用同一套 OpenAI 调用模式，区别只在 system prompt + 是否要求结构化输出。
- Step 6 已有 `points` 表（id/content/tag_type/source_doc_name/created_at）+ `commands/library.rs`（save_points/list_points）+ 知识库页。
- 探索页 `Explore.tsx` 展示提取出的 Point；知识库页 `Library.tsx` 展示已存 Point；二者都用 `components/PointCard.tsx`。
- 完整 schema 在 `docs/database-schema.md`（points 含 parent_id、explore_actions 表）——本步实现其 MVP 子集。

## 设计决策（已与用户对齐）
- **展示**：树状缩进，子 Point 在父下方缩进嵌套，可无限层级。
- **持久化**：子 Point 入库（points 表加 `parent_id`）+ 记 `explore_actions`（供后续行为统计）。
- **触发入口**：探索页 + 知识库页都能深挖。

## 动作集

### A 类 · 基础深挖（纯 LLM，每个动作 = 一个固定 system prompt）
1. **延伸解释** —— 把这个观点讲得更深入透彻。
2. **反方观点** —— 生成对立/质疑视角。
3. **生成追问** —— 产出 3-5 个延伸问题（每个问题 = 一个子 Point，tagType="待验证疑问"）。
4. **查找相似** —— 在本地知识库找语义相近的 Point。**MVP 实现**：先用关键词/LIKE 粗匹配（从 Point content 取关键词，SQL `LIKE` 检索其他 points），不引入 embedding 向量。结果作为"相似 Point 引用"展示，可选挂为子 Point。后续可升级语义向量。

### B 类 · 思维框架解读（纯 LLM + 思维模型库 + 智能推荐）
触发「框架解读」时：
1. LLM 先分析该 Point，从**思维模型库**中**自动推荐 3 个最匹配**的模型（附一句话推荐理由）。
2. 用户从 3 个推荐里选，或点「其他」展开详细面板 → 检索/浏览**全部思维模型库** → 自由选一个。
3. 选定模型后，用该模型对应的视角 prompt 生成子 Point。

#### 思维模型库（写入后端常量表，每项含 key / 名称 / 一句话定义 / LLM 视角 prompt）

**结构化 / 咨询（麦肯锡系）**
- MECE（相互独立完全穷尽）
- 金字塔原理（Minto，结论先行）
- 逻辑树 / 议题树
- 假设驱动（先立假设再验证）
- SCQA（情境-冲突-问题-答案）
- 80/20 帕累托
- SWOT
- 波特五力
- 价值链分析

**芒格思维格栅（Mental Models）**
- 第一性原理
- 奥卡姆剃刀（如无必要勿增实体）
- 反演思维（Inversion，反过来想）
- 二阶思维（再然后呢）
- 机会成本
- 沉没成本谬误
- 概率/贝叶斯思维
- 系统思维
- 复利思维
- 汉隆剃刀
- 反脆弱

**学习 / 理解法**
- 费曼学习法（用最简单的话教会小白）
- 苏格拉底诘问（连环追问暴露前提）
- 5 Whys（五问法，追根因）
- 类比迁移

**流程 / 分析框架**
- 5W2H
- PDCA
- OODA 循环
- 鱼骨图（石川/因果图）
- SMART 目标
- 决策矩阵
- 利弊权衡（Pros/Cons + 适用边界）

> 库可后续扩充，加新模型只需加一行常量 + 视角 prompt，工程量极小。

## 非目标（本步不做）
- 联网搜索 / 学术检索（需外部 API，后续步骤）。
- embedding 语义向量（查找相似先用关键词粗匹配）。
- 行为统计图表（explore_actions 本步只**记录**，可视化后续做）。
- 中途诱导提示、探索结束报告、会话/项目库。
- Point 的合并/拆分/手动编辑。

---

## 技术实现设计

### 数据库变更（重要：与现有代码对齐）
现状：Step 6 的 `db/mod.rs::init_db` 用 inline `CREATE TABLE IF NOT EXISTS points (...)`，无 migrations 目录、无 schema_version、每命令 `Connection::open` 开连接。`database-guidelines.md` 描述的 migrations/AppState 架构尚未落地——**本步沿用 Step 6 的实际模式（inline init + open-per-command），不引入 migrations 框架**，保持一致、避免过度工程。

`init_db` 内做幂等迁移：
1. 建表 SQL 给 points 加列：`parent_id TEXT`（root Point 为 NULL）。
2. 对已存在的旧库：`init_db` 里额外跑 `ALTER TABLE points ADD COLUMN parent_id TEXT`，用「检测列是否存在」或忽略 duplicate-column 错误的方式保证幂等（rusqlite 可查 `PRAGMA table_info(points)` 判断，或捕获 ALTER 的 error 字符串含 "duplicate column"）。
3. 新建 `explore_actions` 表（MVP 精简）：
   ```sql
   CREATE TABLE IF NOT EXISTS explore_actions (
       id           INTEGER PRIMARY KEY AUTOINCREMENT,
       point_id     TEXT NOT NULL,
       action_type  TEXT NOT NULL,   -- explain|counter|followup|similar|framework:<key>
       detail       TEXT,            -- 框架 key 或附加信息
       created_at   TEXT NOT NULL
   );
   ```

### 后端
- `ai/mod.rs`：复用 `ExtractedPoint`。新增思维模型库常量（`MentalModel { key, name, description, prompt_lens }` 列表 + 返回全部/按 key 查的函数）。
- `ai/openai.rs` 或新建 `ai/explore.rs`：
  - `deepen(api_key, model, action, point_content) -> Vec<ExtractedPoint>`：按 action 选 system prompt 调 OpenAI。延伸解释/反方观点返回 1 条；生成追问返回 3-5 条（json_object `{"points":[...]}`，复用现有 PointsPayload 解析）。
  - `recommend_models(api_key, model, point_content) -> Vec<{key, reason}>`：LLM 从库里推荐 3 个 key + 理由（json_object）。
  - `apply_framework(api_key, model, model_key, point_content) -> Vec<ExtractedPoint>`：用该模型的 prompt_lens 生成解读子 Point。
- 新建 `commands/explore.rs`（注意：现有 `commands/extract.rs` 已存在，勿混淆；本文件聚焦深挖动作）：
  - `list_mental_models() -> Vec<MentalModel>`（同步返回常量，供「其他」面板检索）。
  - `recommend_frameworks(app, point_content) -> Vec<{key,name,reason}>`。
  - `deepen_point(app, parent_id: Option<String>, parent_content, action_type, framework_key: Option<String>) -> Result<Vec<StoredPoint>, String>`：调对应 ai 函数生成子 Point → 每条生成 uuid + parent_id 写入 points（事务）→ 记一条 explore_actions → 返回写入的 StoredPoint（带 id/parent_id）。
  - `find_similar(app, point_id, content) -> Result<Vec<StoredPoint>, String>`：关键词 LIKE 匹配库中其他 points（排除自己及其子孙），记 explore_action，返回匹配项（不自动入库，前端决定是否挂载）。
- `db/mod.rs`：`StoredPoint` 加 `parent_id: Option<String>` 字段（camelCase parentId）。`list_points` 的 SELECT 带上 parent_id。新增插入子 Point、记 explore_action 的查询函数（>3 行的放函数里，符合 spec）。
- `commands/mod.rs` 注册 `pub mod explore;`；`lib.rs` 注册所有新命令。
- Tauri command 返回 `Result<T,String>`，内部 anyhow + `.map_err`；阻塞 DB/网络放 `spawn_blocking`（注意 OpenAI 调用本身是 async reqwest，不放 spawn_blocking；DB 写入放 spawn_blocking 或用 async 包装）。无 unwrap/panic。

### 前端
- `api/types.ts`：`StoredPoint` 加 `parentId: string | null`。新增 `MentalModel { key; name; description }`、`FrameworkRecommendation { key; name; reason }`。`ExploreAction` 联合类型（'explain'|'counter'|'followup'|'similar'|'framework'）。
- `api/index.ts`：新增 `listMentalModels()`、`recommendFrameworks(content)`、`deepenPoint(...)`、`findSimilar(...)` 包装。
- 树状展示：把扁平的 `StoredPoint[]`（含 parentId）在前端构建成树（按 parentId 分组），递归渲染缩进。可新建 `components/PointTree.tsx` 或让 `PointCard` 支持 children 递归 + depth 缩进。
- `PointCard`：加深挖动作栏（4 个基础动作按钮 + 「框架解读」按钮）。点框架解读 → 调 recommendFrameworks → 弹出 3 个推荐（名称+理由）+「其他」→ 「其他」展开面板列出 listMentalModels 全库（可搜索框过滤）→ 选定后 deepenPoint。动作进行中 loading 态。
- 深挖成功后把返回的子 Point 插入本地树并展开显示。查找相似的结果单独提示（可「挂为子 Point」按钮）。
- store：探索页/知识库页都要支持树+深挖。建议在 `store/index.ts` 加 `useDeepenStore` 或扩展现有 store，管理 mental models 缓存、各 Point 的深挖 loading 态。
- 探索页：当前提取的 Point 还没入库就深挖的话，需先有 parent_id——MVP 简化：探索页深挖前要求 Point 已「保存到知识库」（拿到 id），或深挖动作自动先存父 Point 再挂子。实现时择一，PRD 倾向「深挖即自动入库父 Point」以体验顺滑。

### 验收标准
- `cargo check` 通过（MSVC 环境：`cmd /c "vcvars64.bat && cd /d D:\Github_repos\Thepoint\src-tauri && cargo check"`）。
- `npx tsc --noEmit` 通过，无 any。
- 运行 app：知识库页对某 Point 点「延伸解释/反方观点/生成追问」→ 看到子 Point 缩进挂在父下方；点「框架解读」→ 看到 3 个推荐 + 「其他」全库检索 → 选费曼/奥卡姆等 → 生成对应视角子 Point；重启后子 Point 及层级仍在。
- explore_actions 表有对应记录（可用 sqlite 验证或日志）。
- 所有自定义 invoke 经 api/index.ts；类型在 api/types.ts；parentId 前后端 camelCase 对齐；用 cn()；暗色风格一致。
