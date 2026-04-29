---
name: tdd
description: Use when implementing new features, fixing bugs, or doing behavior-changing refactors in Atlas. Enforces test-driven development: write a failing test first, make it pass, then refactor. Trigger on any change to logic in apps/ or packages/. Skip for pure docs, config, CI, dependency bumps, or typo fixes.
---

# TDD（测试驱动开发）

Atlas 默认 TDD：**测试先于实现**。新功能 / bug 修复 / 行为变更的重构都遵循红-绿-重构循环。

## 何时遵守

| 场景 | TDD |
|------|-----|
| 新功能 / 新接口 | ✅ 必须 |
| Bug 修复 | ✅ 必须（先写复现测试再修） |
| 行为变更的重构 | ✅ 必须 |
| 纯文档 / 配置 / CI / 依赖升级 | ❌ 不需要 |
| typo / 注释调整 | ❌ 不需要 |
| 探索性 spike | ❌ 暂不（spike 落地时再补） |

## 红-绿-重构循环

1. **Red** — 写失败测试，描述**期望行为**；跑 `bun test` 看到红
2. **Green** — 用**最少代码**让测试通过（先丑后美无所谓）
3. **Refactor** — 在绿灯保护下整理代码；每改一步重跑测试

**一次只 Red 一个 case**。看不到 Red 就走 Green = 没验证测试本身。

## 测试栈

- **Runner**：`bun test`（内置，jest-like）
- **断言**：`import { describe, it, expect } from 'bun:test'`
- **HTTP**：Hono 的 `app.request(path, init)` 返回 `Response`，直接断言；不用启真 server

## 文件组织

测试与源码**同目录、同名 `.test.ts`**：

```
apps/daemon/src/
├── routes/
│   ├── chat.ts
│   └── chat.test.ts
└── agent/
    ├── loop.ts
    └── loop.test.ts
```

不建独立 `tests/` 目录。

## 命令

```bash
bun test                                       # 当前 workspace 全部
bun test apps/daemon/src/routes/chat.test.ts   # 单文件
bun test --watch                               # watch 模式
bun test -t "returns 400"                      # 名字过滤
bun run test                                   # 走 turbo，所有 workspace
```

## 写什么 / 不写什么

### ✅ 测行为
- `POST /chat 返回 SSE 流`
- `query 缺失返回 400`
- `agent loop 在工具失败时回退到无工具响应`

### ❌ 不测
- 第三方库行为（Hono / AI SDK / Drizzle 自带测试）
- 实现细节（"调用了 streamText 函数"——重构就挂）
- 私有函数（通过公开接口验证）
- trivial getter / setter
- 不可能发生的错误分支（这种代码按「不过度设计」原则本就不该写）

## 示例：新增 /chat 端点

**1. Red** — `apps/daemon/src/routes/chat.test.ts`：

```typescript
import { describe, it, expect } from 'bun:test';
import { app } from '../index';

describe('POST /chat', () => {
  it('returns 400 when query is missing', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });
});
```

跑 `bun test`，**确认失败**（路由还没注册）。

**2. Green** — 最少代码：

```typescript
app.post('/chat', async (c) => {
  const body = await c.req.json();
  if (!body.query) return c.json({ error: 'query required' }, 400);
  // ...
});
```

跑 `bun test`，确认绿。

**3. Refactor** — 在绿灯下整理（抽 schema、抽 handler 函数等）。每改一步重跑。

**4. 下一轮 Red** — 加 `it('returns 200 with SSE stream when query provided', ...)`，循环。

## bug 修复流程

1. 写一个**能复现 bug** 的失败测试
2. 跑测试，确认失败的颜色与错误信息和 bug 现象一致
3. 改代码让它变绿
4. commit：测试 + 修复可以同一个 commit（`fix(scope): ...`）

复现测试本身就是 reproduction，不要再单独贴日志到 issue。

## 反模式（避免）

- ❌ **写完代码再补测试** — 容易写"为现有实现量身定做"的废测试
- ❌ **一次写 10 个测试** — Red-Green 要小步快跑
- ❌ **跳过 Red 直接 Green** — 没看到失败状态 = 没验证测试本身
- ❌ **Mock 一切** — 进程内 / 本地用真东西（真 SQLite、真 fs）测得更准；只对**外部网络 API**（OpenAI / Ollama）做 mock
- ❌ **追求覆盖率数字** — 覆盖关键行为即可，不刷指标
- ❌ **测私有函数** — 改私有 = 改实现；改了行为没变就不该挂

## 与「不过度设计」原则一致

TDD 不是为了写测试而写测试。判断标准：

> **这个行为坏了，有人会察觉吗？**

没人察觉就别写。一个 PR 里测试代码量没必要硬等于实现代码量。

## AI 不确定输出怎么测

测**结构与契约**：响应格式、错误处理、流式分片是否合规、tool call schema 是否符合 zod。
**不测内容质量**——内容质量靠 eval / 人工 review，不是单元测试。
