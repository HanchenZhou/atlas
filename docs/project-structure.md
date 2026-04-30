# 项目目录结构

> **维护规则**：每次新增/删除/重命名顶层或重要目录后，必须同步更新此文件。
> 增删单个源文件、临时文件、构建产物**不**需要更新。
> 触发条件详见根 `CLAUDE.md`。

## 当前结构

```
atlas/
├── CLAUDE.md                   # 项目级 agent 指令（auto-load）
├── package.json                # workspaces 根
├── turbo.json                  # Turborepo pipeline 配置
├── tsconfig.base.json          # 共享 tsconfig
├── .gitignore
├── .claude/                    # Claude Code 项目级配置
│   └── skills/
│       ├── git-workflow/       # commit / push / PR / issue 规范
│       │   └── SKILL.md
│       └── tdd/                # 测试驱动开发流程与规范
│           └── SKILL.md
├── apps/
│   ├── daemon/                 # 后端 daemon（Bun + Hono）
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts        # buildApp + createDefaultRegistry（不带 IO 副作用）
│   │       ├── server.ts       # Bun.serve 启动入口；解析 config 并装配 IO 依赖
│   │       ├── config/         # ATLAS_HOME / config.json 解析；派生 sessions/credentials 路径
│   │       ├── http/           # HTTP 路由：/chat、/providers、/sessions、SSE 编码
│   │       ├── agent/          # native agent loop（Vercel AI SDK），非 Claude 路径用
│   │       │   └── loop.ts
│   │       ├── providers/      # provider 抽象 + 凭据存储 + 各家 adapter
│   │       │   ├── types.ts
│   │       │   ├── registry.ts
│   │       │   ├── credentials.ts
│   │       │   └── adapters/   # 每家 provider 一个文件：claude-cli.ts / openai.ts / kimi.ts
│   │       ├── roles/          # 多 agent 角色解析（defaults + role 覆盖）
│   │       ├── tasks/          # 单次 LLM 调用任务（title 等）：runOneShot 助手 + 各任务实现
│   │       └── sessions/       # 会话存储；当前仅 FileSessionStore（一会话一 JSON）
│   └── desktop/                # 桌面端（Electron + Vite + React）
│       ├── electron.vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main/           # Electron main process（窗口、生命周期）
│           ├── preload/        # contextBridge 占位（v1 不用 IPC）
│           └── renderer/       # React 渲染端
│               ├── App.tsx     # 根组件，编排 Sidebar / Chat / Composer / SettingsSheet
│               ├── styles.css  # monotone tokens（CSS vars，跟随系统色）
│               ├── client/     # daemon HTTP/SSE 客户端
│               ├── components/ # 视图组件
│               └── state/      # useReducer-based store
└── docs/                       # 项目文档
    ├── CLAUDE.md               # docs/ 职责说明（工作目录在 docs/ 下时自动加载）
    ├── architecture/
    │   ├── background.md       # 项目背景与目标
    │   └── overview.md         # 架构总览、模块、技术决策
    └── project-structure.md    # 本文件
```

## 顶层目录说明

| 目录 | 职责 |
|------|------|
| `apps/daemon/` | 后端 daemon HTTP 服务；将承载 HTTP API、Agent Loop、Tool Registry、RAG、Ingest |
| `apps/desktop/` | Electron 桌面端；通过 `localhost:3001` 调 daemon |
| `.claude/skills/` | Claude Code 项目级 skills；当前包含 `git-workflow`、`tdd` |
| `docs/` | 项目文档；维护规则参考 `docs/CLAUDE.md` |

## 应用数据目录（运行时，仓库外）

| 路径 | 内容 |
|------|------|
| `~/.atlas/config.json` | 应用配置：daemon port、默认 provider/model、`sessions.dir` |
| `~/.atlas/credentials.json` | provider 凭据（0600） |
| `~/.atlas/sessions/<id>.json` | 会话历史（一会话一文件） |

整个 root 可由 `ATLAS_HOME` 环境变量覆盖；`sessions.dir` 还可在 `config.json` 里单独指向别处。

## 后续会出现的目录

按当前架构判断会出现的目录（**不是承诺**，到需要时再落地并更新本文件）：

| 预期目录 | 预期职责 |
|---------|---------|
| `apps/web/` | Next.js Web 端，调用 daemon HTTP API |
| `packages/shared/` | 客户端与 daemon 共用的类型、协议定义 |
| `tools/` | 独立 CLI 工具，例如复杂文档预处理脚本 |
