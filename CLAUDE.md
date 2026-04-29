# Atlas

知识库检索 + 联网检索 agent，提供桌面端（Electron）与 Web 端（Next.js）访问。
核心逻辑收敛在 TypeScript daemon HTTP 服务里，桌面端只是 Electron 壳。

## 文档入口

- `docs/CLAUDE.md` — 文档体系职责说明（在 docs/ 下工作时自动加载）
- `docs/architecture/background.md` — 项目背景与目标
- `docs/architecture/overview.md` — 架构总览与技术选型
- `docs/project-structure.md` — 顶层目录结构

## 维护规则（vibe coding 必须遵守）

通过 Claude Code 进行 vibe coding，agent 负责保持文档与代码同步。

### 1. 目录变动 → 更新 `docs/project-structure.md`

**触发**：新增/删除/重命名顶层或重要目录、新增模块、模块边界调整
**不触发**：增删单个源文件、临时产物、构建输出

### 2. 架构变动 → 更新 `docs/architecture/overview.md`

**触发**：技术选型变化、模块拆分/合并、对外协议或接口大改、引入或移除核心依赖（向量库、模型服务、运行时框架等）
**不触发**：内部实现重构、bug 修复、参数调整

### 3. 文档与代码同提交

文档改动应该和触发它的代码改动出现在同一次 commit 里，方便回溯。

### 4. 删除胜过保留过期内容

宁可删掉一段也不要留陈旧描述。文档要么对，要么不存在。

## 开发规范

- **TDD 默认** — 新功能 / bug 修复 / 行为变更的重构必须先写失败测试再写实现。详见 `.claude/skills/tdd/SKILL.md`。
- **Issue-driven** — 非 trivial 改动从 issue 开始；分支从 main 拉；PR body 含 `Closes #N` 让 GitHub 自动关 issue。详见 `.claude/skills/git-workflow/SKILL.md`。

## 设计原则：不过度设计

**所有设计与实现保持「够用即可」**。新加任何东西前，先停下问自己：现在真的需要吗？

- **不预先抽象** — 3 段相似代码胜过过早的通用接口；少于 3 个调用方不抽出
- **不预留未来扩展** — YAGNI；等需求真的出现再做，不为「以后可能要」写代码
- **不写防御性代码** — 内部调用和框架契约可信任，不要兜底「不可能发生」的情况
- **不轻易引依赖** — 标准库 / 已有依赖能搞定就不上新库；50 行手写胜过 50KB 包
- **不做兼容层** — 早期项目直接改；不留 backward-compat 适配、不留 `_unused` / `// removed` 之类痕迹
- **不留半成品** — 要做就完整做，不写 TODO 占位、不写 stub 函数

适用于代码、目录结构、模块拆分、配置项、文档——所有设计层面。

> 引入新依赖、抽通用模块、加配置项、加错误分支**之前**，先用一句话写下「现在为什么需要」。说不出来就别做。

## 技术栈基线

- **后端 daemon**：Bun + Hono（TypeScript）
- **Monorepo**：Turborepo（pnpm workspaces 由 Bun 内置 workspaces 替代）
- **前端**：Next.js + React（Web）；Electron 壳（桌面，**当前阶段暂缓**）
- **模型服务**：外部 HTTP（Ollama / TEI / OpenAI 等可配置）
- **向量库**：待定（实现 RAG 时再选）

详见 `docs/architecture/overview.md`。
