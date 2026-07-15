import type { AppConfig, CapabilityScorecard, CapabilityScorecardItem } from '@/api/types'

const ZH_ITEMS: Record<number, Pick<CapabilityScorecardItem, 'capability' | 'nextStep'>> = {
  1: { capability: '搜索评估基准', nextStep: '在调整排名前扩展 MRR/NDCG 指标。' },
  2: { capability: '只读智能体检索上下文', nextStep: '作为未来智能体/RAG 的上下文契约。' },
  3: { capability: '反向链接与未链接提及建议', nextStep: '创建关系前加入 UI 审核。' },
  4: { capability: '引用质量仪表盘', nextStep: '在报告维护界面展示仪表盘。' },
  5: { capability: '已保存搜索 / 智能集合', nextStep: '将已保存搜索暴露为知识库集合。' },
  6: { capability: '快速捕获收件箱', nextStep: '添加紧凑收件箱界面和复习队列交接。' },
  7: { capability: '基于模板的报告/调查起草', nextStep: '允许界面从模板启动调查。' },
  8: { capability: '低质量资产重处理队列', nextStep: '将队列项连接到明确的重处理操作。' },
  9: { capability: '重复/近似重复资产检测', nextStep: '仅在明确确认后提供合并/忽略流程。' },
  10: { capability: '图谱邻域预览', nextStep: '渲染图谱邻域面板。' },
  11: { capability: '命令面板清单', nextStep: '基于清单构建实际命令面板界面。' },
  12: { capability: '工作区范围检索配置', nextStep: '允许调查生成选择检索配置。' },
  13: { capability: '自动化建议', nextStep: '添加用户确认的操作执行日志。' },
  14: { capability: '导入诊断台账', nextStep: '在索引文件夹旁展示导入诊断。' },
  15: { capability: '排名可解释性', nextStep: '仅在扩展评估指标后调整排名。' },
  16: { capability: '块级引用', nextStep: '在知识库/报告界面渲染块引用卡片。' },
  17: { capability: '画布/看板快照导出', nextStep: '使用节点和边构建未来的看板快照界面。' },
  18: { capability: '本地优先同步/导出审计', nextStep: '在镜像导出/清理前显示审计结果。' },
  19: { capability: '多文档问答评估样例', nextStep: '将评估结果作为调查功能的回归门禁。' },
  20: { capability: '能力评分卡', nextStep: '使用该评分卡选择下一批路线图项目。' },
}

const ZH_RECOMMENDATIONS = [
  '在添加更多写入流程前，先将只读诊断提升为 UI 面板。',
  '在更改排名或调查生成前，使用第 01 轮和第 19 轮评估作为门禁。',
  '将可写切片置于明确确认和审计日志之后。',
  '下一批应聚焦 UI 集成：命令面板、诊断面板和块引用卡片。',
]

export function localizeCapabilityScorecard(
  scorecard: CapabilityScorecard,
  language: AppConfig['uiLanguage']
): CapabilityScorecard {
  if (language === 'en-US') return scorecard
  return {
    ...scorecard,
    items: scorecard.items.map((item) => ({ ...item, ...(ZH_ITEMS[item.round] ?? {}) })),
    recommendations: scorecard.recommendations.map((value, index) => ZH_RECOMMENDATIONS[index] ?? value),
    sourceInspiration: '跨项目能力炼化评分卡 · Thepoint 第 20 轮',
  }
}
