---
name: git-workflow
description: Use when creating commits, pushes, GitHub PRs, or issues for the Atlas project. Enforces Conventional Commits, PR/issue message templates, and gh CLI usage. Trigger any git/gh operation that produces a message (commit, PR title/body, issue body, comment) or modifies repo state.
---

# Atlas Git Workflow

所有 GitHub 相关动作走 `gh` CLI；commit / push / branch 等本地操作用 `git`。

## 工具分工

| 操作 | 工具 |
|------|------|
| status / diff / log / commit / push / branch | `git` |
| issue 创建/查看/评论/关闭 | `gh issue ...` |
| PR 创建/查看/合并/评论/checkout | `gh pr ...` |
| repo / release / workflow / API | `gh ...` |

> 不要用 `git push` 之外的方式触发远程。**永远不要**自动 `gh pr merge`，merge 是用户的决定。

---

## Issue-Driven 开发流程（默认流程）

**所有非 trivial 改动都应该从一个 issue 开始**。流程如下：

### 1. 确认或创建 issue

```bash
gh issue view <num>          # 已有 issue，先看一遍 scope
# 或
gh issue create --title "..." --body "$(cat <<'EOF' ... EOF)"
```

### 2. 从 main 拉开发分支

**必须从 main 拉**，不要从其他 feature 分支派生。

```bash
git checkout main
git pull --ff-only origin main
git checkout -b <type>/<issue-number>-<slug>
```

### 3. 分支命名

```
<type>/<issue-number>-<slug>
```

- `<type>`：同 commit type（`feat` / `fix` / `docs` / `refactor` / ...）
- `<issue-number>`：对应 issue 号
- `<slug>`：3-5 个单词的 kebab-case 描述

例：
- ✅ `feat/42-chat-endpoint`
- ✅ `fix/87-health-500-on-startup`
- ✅ `docs/12-architecture-update`
- ❌ `feature-branch` / `cheney-dev` / `temp` — 看不出在做什么

无 issue 的 trivial 改动（typo / 文档微调）可以省掉 `<issue-number>`，例 `docs/fix-typo`。

### 4. 开发 + commit + push

按 [Commit 规范](#commit-规范conventional-commits) 提交。
push：

```bash
git push -u origin <branch>
```

### 5. 创建 PR，正文必须含 `Closes #<num>`

PR body 里加上 `Closes #<num>`（或 `Fixes #<num>` / `Resolves #<num>`，都等效），
GitHub 会在 PR 合并到默认分支时**自动关闭对应 issue**。

```bash
gh pr create --title "feat(daemon): add /chat endpoint" --body "$(cat <<'EOF'
## Summary
...

## Changes
- ...

## Test plan
- [ ] ...

## Related
Closes #42
EOF
)"
```

关多个 issue：每个 issue 写一行 `Closes #N`，或一行多个 `Closes #1, closes #2`。

### 6. Merge 后

- Issue 由 GitHub 自动关闭（前提：PR 合并到 default branch + body 有 `Closes #N`）
- 不需要手动 `gh issue close`
- 本地清理：`git checkout main && git pull && git branch -d <branch>`

### 流程红线

- ❌ 不从其他 feature 分支拉分支（除非明确依赖关系，并经用户同意）
- ❌ 不直接在 main 上 commit
- ❌ PR body 缺 `Closes #N` —— issue 不会自动关，留尾巴
- ❌ 用 `Related #N` / `See #N` 等不触发关闭的关键词代替 `Closes`（除非真的只是相关而非关闭）

---

## Commit 规范（Conventional Commits）

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### type（必填，小写）

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `docs` | 仅文档（含 README、CLAUDE.md、docs/） |
| `refactor` | 行为不变的重构 |
| `perf` | 性能优化 |
| `test` | 仅测试相关 |
| `chore` | 杂项（依赖升级、配置） |
| `build` | 构建系统、打包 |
| `ci` | CI 配置 |

### scope（可选，小写）

Atlas 当前合法 scope（按 `apps/` 和模块边界）：

- `daemon` — `apps/daemon/`
- `web` — `apps/web/`（暂未落地）
- `desktop` — `apps/desktop/`（暂缓）
- `shared` — `packages/shared/`
- `agent` — Agent Loop / Tool Registry
- `rag` — RAG / Retrieve
- `ingest` — Ingest Pipeline
- `docs` — `docs/` 文档
- `repo` — 根级配置（package.json / turbo.json / tsconfig）

新增模块时同步扩展此表。

### subject（必填）

- 祈使句、动词开头：`add` / `fix` / `update` / `remove`，不是 `added` / `adds`
- **小写开头**、句末无标点
- 不超过 **72** 字符

### body（推荐）

- 用空行与 subject 分隔
- 解释**为什么**（决策、约束、权衡），不复述 diff 显示的内容
- 多段用空行分隔；行宽 72-100 字符

### footer（按需）

- `BREAKING CHANGE: <说明>`
- `Closes #123` / `Refs #123`

### ❌ 不要加 Co-Authored-By trailer

**Atlas 项目特例**：commit message 里**不**加 `Co-Authored-By: Claude ...` 行。

理由：GitHub 把 trailer 渲染成共同作者并排显示，会让 commit 看起来像 Claude 主导而不是用户主导。归属信息不需要写进 commit 历史。

> 这条覆盖 Claude Code 的默认行为。即使其他指引提示要加，本项目下也**不加**。

### 示例

✅ 好：
```
feat(daemon): add /chat endpoint with SSE streaming

POST /chat takes { query, conversationId } and streams agent loop
output via SSE. Chose SSE over WebSocket because the protocol is
unidirectional server→client and SSE works in browsers without
extra deps.
```

❌ 不好：
- `update some files` — 没说做了什么
- `fix bug` — 太模糊
- `[daemon] Add /chat` — 不符合 Conventional Commits
- `feat: added /chat endpoint and refactored agent loop and bumped deps` — 一个 commit 干太多事

### 创建 commit 的硬性要求

- 用 HEREDOC 传 message，保证格式不被 shell 吞：
  ```bash
  git commit -m "$(cat <<'EOF'
  feat(daemon): add /chat endpoint

  POST /chat ...
  EOF
  )"
  ```
- **永不**用 `--no-verify`、`--no-gpg-sign` 跳过 hook；hook 失败就修，再创建新 commit
- **永不**用 `--amend` 改已 push 的 commit；fix 用新 commit
- **永不**用 `git add -A` 或 `git add .`；按文件名加，避免误提交 `.env` / 大文件
- 不提交 `.env` / `credentials.json` / 私钥 / 大二进制

### 一条 commit 的边界

一个 commit 只做一件可独立描述的事。如果 subject 里有「and」，多半要拆。

---

## Push 规范

- 第一次推 branch 用 `git push -u origin <branch>` 设置上游
- **永不**对 `main` / `master` force push
- 一般场景下不需要 force；必须 force 时用 `--force-with-lease` 而不是 `--force`
- 不要 commit 后自动 push；除非用户明确说「push」

---

## PR 规范

### 标题

格式同 commit 标题：`<type>(<scope>): <subject>`，**70 字符内**。
PR 是多 commit 的归纳，标题反映整体而非某一 commit。

### 正文模板

PR body 必须包含以下小节，按此顺序：

```markdown
## Summary
1-3 句说清楚做了什么、为什么。读者只看这段也能理解 PR 价值。

## Changes
- 关键改动 1（按模块/文件分组）
- 关键改动 2
- ...

## Test plan
- [ ] 验证步骤 1（具体到命令或操作）
- [ ] 验证步骤 2
- [ ] ...

## Related
Closes #<num>
```

`## Related` 规则：

- **issue-driven 改动（默认）**：必须有 `Closes #<num>` 触发自动关闭
- **多 issue**：每个一行 `Closes #N`，或 `Closes #1, closes #2`
- **只是相关、不应关闭**：用 `Refs #N` 而不是 `Closes #N`
- **无 issue 的 trivial 改动**：整段 `## Related` 可以省略

### 创建命令

```bash
gh pr create --title "feat(daemon): add /chat endpoint" --body "$(cat <<'EOF'
## Summary
为 daemon 增加首个对话端点 /chat，使用 SSE 流式返回 agent loop 输出。
为后续接入 Web / 桌面端打基础。

## Changes
- `apps/daemon/src/routes/chat.ts`: 新增 POST /chat
- `apps/daemon/src/agent/loop.ts`: 抽出 agent loop 包装 streamText
- 添加 hono streamSSE helper

## Test plan
- [ ] `bun --cwd apps/daemon dev` 启动
- [ ] `curl -N -X POST localhost:3001/chat -d '{"query":"hi"}'` 看到流式输出
- [ ] `bun run check` 通过
EOF
)"
```

### 操作要点

- 推之前确认 branch 状态干净、commit 历史合理
- 默认创建普通 PR，不是 draft；要 draft 用户会明说
- **不**自动 `gh pr merge`；merge 由用户决策（squash / rebase / merge 也由用户挑）
- 多 commit 的 PR 不 amend；新改动用追加 commit
- 用户改 PR 描述用 `gh pr edit <num> --body "$(cat <<'EOF' ... EOF)"`

---

## Issue 规范

### 标题

- bug：`<场景>下 <行为> 异常` — 例 `daemon /health returns 500 on first start`
- feature：`add <功能>` / `support <能力>` — 例 `add bge-reranker support to RAG`
- task：动词开头 — 例 `wire ingest pipeline to LanceDB`

短、可搜索；不超过 80 字符。

### Bug 模板

```markdown
## Reproduction
1. ...
2. ...
3. ...

## Expected
...

## Actual
...

## Environment
- OS:
- Bun:
- branch / commit:

## Logs / screenshots
（如有）
```

### Feature 模板

```markdown
## Motivation
为什么需要？解决什么用户问题？

## Proposal
具体做什么、API 长啥样、行为如何。

## Alternatives
考虑过的其他方案，及为什么不选。

## Out of scope
明确不做的部分。
```

### Task 模板

```markdown
## Goal
一句话说清交付物。

## Steps
- [ ] 步骤 1
- [ ] 步骤 2

## Done when
可观察的完成判定（命令、行为、文档变化）。
```

### 创建命令

```bash
gh issue create --title "add bge-reranker support to RAG" --body "$(cat <<'EOF'
## Motivation
...

## Proposal
...

## Alternatives
...
EOF
)"
```

---

## 常用 gh 命令速查

```bash
# 列表
gh pr list
gh issue list

# 查看
gh pr view <num>
gh issue view <num>

# 评论
gh pr comment <num> --body "..."
gh issue comment <num> --body "..."

# CI 状态
gh pr checks <num>

# 拉 PR 到本地
gh pr checkout <num>

# 关闭 issue
gh issue close <num> --reason completed

# 看 PR 的 review comments（不只是 issue comments）
gh api repos/<owner>/<repo>/pulls/<num>/comments
```

---

## 安全红线

- 永不修改 `git config`
- 永不未授权运行：`push --force` / `reset --hard` / `branch -D` / `checkout .` / `clean -f` / `rm -rf .git`
- 永不跳 hook：`--no-verify` / `--no-gpg-sign`
- 永不提交 secrets：`.env*` / `*credentials*` / `*.pem` / `id_rsa*`
- pre-commit hook 失败 → **创建新 commit** 而不是 `--amend`（hook 失败时上个 commit 没成功，amend 会改错对象）
