# 贡献指南 —— Deep Explorer

> 更新：2026-06-03

欢迎任何形式的贡献：Bug 修复、新功能、文档改进、翻译等。

---

## 提交流程

1. Fork 本仓库
2. 从 `main` 创建功能分支：`git checkout -b feat/your-feature`
3. 提交变更，遵循 [Conventional Commits](https://www.conventionalcommits.org/)
4. 确保通过本地测试
5. 提交 Pull Request，描述清楚变更内容和动机

---

## 代码规范

| 层 | 工具 |
|----|------|
| 前端 (TypeScript/React) | ESLint + Prettier |
| 后端 (Python) | Black + isort |
| 提交前 | pre-commit hooks |

---

## 待开发功能（欢迎认领）

以下功能在设计上已预留接口，欢迎通过 PR 实现：

### 输入源扩展
- [ ] **网页链接抓取**：给定 URL 自动提取正文（建议使用 `trafilatura` 或 `newspaper3k`）
- [ ] **YouTube 转录**：通过 `yt-dlp` 下载字幕或音频转文字，附时间戳 Point
- [ ] **微信公众号**：需处理登录态，建议实现浏览器插件辅助导出
- [ ] **扫描版 PDF OCR**：集成 Tesseract，在 UI 中增加"OCR 处理"选项

### AI 与搜索
- [ ] **向量语义检索**：用 `sentence-transformers` + `faiss` 替换 FTS5 的"查找相似 Point"
- [ ] **插件式搜索源**：允许用户编写 Python 搜索适配器（继承 `SearchAdapter` 基类）

### 知识库管理
- [ ] **云端加密备份**：支持 WebDAV 或 S3 兼容存储
- [ ] **多用户/团队模式**：需引入账号系统，超出本地应用范围

### 国际化
- [ ] **英文界面**：i18n 框架已预留，需翻译 `frontend/src/locales/en.json`
- [ ] **日文界面**

---

## 目录约定

### 后端搜索适配器
新增搜索来源时，在 `backend/search/` 下创建文件，实现：

```python
class YourSearchAdapter:
    async def search(self, query: str, limit: int = 10) -> list[SearchResult]: ...
```

然后在 `backend/search/__init__.py` 的 `ADAPTERS` 字典中注册。

### 前端组件
放在 `frontend/src/components/`，遵循项目现有的 TypeScript + 函数组件风格。

---

## 问题反馈

- Bug：提交 GitHub Issue，标注复现步骤和环境信息
- 需求讨论：使用 GitHub Discussions
- 安全漏洞：邮件联系维护者，不要公开提 Issue
