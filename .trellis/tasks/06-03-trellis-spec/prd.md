# PRD — Deep Explorer MVP

## 核心用户
研究员 / 行业分析师（专业知识工作者，每天处理大量文档）

## MVP 范围（已确认）

### 功能
- 上传文档 → AI 提取 Point（段落级，20–40个/文档）→ 展示 → 直接入总库
- Point 自动生成 tag（事实陈述 / 作者观点 / 待验证疑问），同一 prompt 完成

### 页面
| 页面 | 内容 |
|------|------|
| 探索页（Explore） | 文件上传、提取进度、Point 卡片列表、一键保存 |
| 设置页（Settings） | OpenAI API Key 输入、模型选择（默认 gpt-4o-mini） |
| 总库页（Library） | Point 列表，按时间倒序，无搜索 |

### 文档格式
- ✅ PDF（lopdf）
- ✅ 纯文本 / Markdown（原生）
- ❌ Word / PPT → 第二阶段

### LLM
- ✅ OpenAI API（gpt-4o-mini 默认）
- ❌ Ollama → 第二阶段

### 数据
- SQLite，Point 提取后直接入总库，无会话/项目概念

### UI 风格
- Linear 风格：暗色优先、高密度、精致动效
- 技术：shadcn/ui + TailwindCSS + Framer Motion

## 不在 MVP 内
- 会话库、项目库、归档/唤醒
- 深挖动作（延伸解释、反方观点、学术检索等）
- 行为统计、雷达图
- 总库搜索
- Ollama / Word / PPT

## 第二阶段候选
1. 深挖动作（延伸解释 → 反方观点 → 学术检索）
2. 会话/项目库
3. Ollama 支持
4. Word/PPT 解析
5. 总库全文搜索（FTS5）
6. 行为统计与可视化
