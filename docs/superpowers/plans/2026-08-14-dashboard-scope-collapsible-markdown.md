# Dashboard Scope 折叠式 Markdown 实施计划

> **供 agentic worker 使用：** 必须使用 `superpowers:executing-plans` 或 `superpowers:subagent-driven-development` 按任务执行。每一步使用 checkbox 跟踪。

**目标：** 将 v4 `scope_text` 从裸露 Markdown 长正文改为默认折叠、展开后由 Obsidian 原生 Markdown renderer 呈现，同时保持空 Scope 预警与旧结构兼容。

**架构：** snapshot model 与 presentation 继续原样携带 `scope_text`，不建立四围栏 parser。Task renderer 新增小型文本 Scope renderer：非空文本创建 `<details>` 并调用 `MarkdownRenderer`，空文本显示静态预警；旧 `included/excluded` 继续走现有 `scopeRow`。

**技术栈：** TypeScript、Obsidian Plugin API `MarkdownRenderer`、原生 `<details>`、CSS、Node test runner、esbuild。

## 全局约束

- 只修改 Dashboard Scope 展示、展开状态与对应测试，不修改 producer。
- 不修改 `semanticStatus`、REQ、SCN、验收或其他 chip 的判定逻辑。
- `scope_text` 为空时不得回退旧数组，必须继续显示「Scope 待补充」。
- 明确 `legacy_v3` 或无 `scope_text` 的旧结构继续使用 `包含` / `不包含`。
- 文本模式只移除重复的底部 Scope chip；REQ、SCN 保持不变。
- 不安装插件、不执行 Obsidian 实机 smoke；用户自行更新插件。

---

### 任务 1：实现折叠式 Markdown Scope

**文件：**

- 修改：`src/dashboard-presentation.ts`
- 修改：`src/main.ts`
- 修改：`styles.css`
- 修改：`tests/dashboard-presentation.test.ts`
- 修改：`tests/scope-presentation.test.ts`
- 修改：`tests/fixtures/task-dashboard-baseline.json`

**接口：**

- 消费：`createDashboardScopePresentation(scope): DashboardScopePresentation`
- 新增状态：`DisclosureState.scopeOpen: boolean`
- renderer 消费：`DashboardScopePresentation`、当前 task path、`DisclosureState.scopeOpen`
- renderer 输出：文本模式的折叠详情或空 Scope 静态预警；结构化模式保持现有 DOM。

- [x] **步骤 1：写展开状态的失败测试**

在 `tests/dashboard-presentation.test.ts` 的默认状态断言中加入：

```ts
scopeOpen: false,
```

并在同 task 刷新样本中加入 `scopeOpen: true`，断言 `resolveDisclosureState(previous, false)` 保持该值。

- [x] **步骤 2：运行定向测试并确认 RED**

运行：

```bash
node tests/run-tests.mjs dashboard-presentation.test.ts
```

预期：默认 `DisclosureState` 缺少 `scopeOpen`，deep-equal 失败。

- [x] **步骤 3：实现 Scope 展开状态**

在 `src/dashboard-presentation.ts` 中扩展接口和默认值：

```ts
export interface DisclosureState {
  summaryOpen: boolean;
  fullOpen: boolean;
  scopeOpen: boolean;
  // 其余字段保持不变
}

return {
  summaryOpen: true,
  fullOpen: false,
  scopeOpen: false,
  // 其余默认值保持不变
};
```

- [x] **步骤 4：运行定向测试并确认 GREEN**

运行：

```bash
node tests/run-tests.mjs dashboard-presentation.test.ts
```

预期：PASS。

- [x] **步骤 5：写文本 Scope renderer 的失败 contract 测试**

更新 `tests/scope-presentation.test.ts`，断言：

```ts
assert.match(source, /MarkdownRenderer/);
assert.match(source, /class:\s*"flowdesk-contract-scope-details"/);
assert.match(source, /details\.open\s*=\s*this\.disclosureState\.scopeOpen/);
assert.match(source, /MarkdownRenderer\.render\(/);
assert.match(source, /model\.currentTask\.id/);
assert.match(source, /this\.disclosureState\.scopeOpen\s*=\s*details\.open/);
assert.doesNotMatch(source, /scopePresentation\.text\s*\?\s*\[scopePresentation\.text\]/);
```

同时断言文本模式只在空文本时显示 `Scope 待补充` 静态行，且底部 Scope chip 仅在 `structured` 模式创建；REQ/SCN chip 仍存在。

- [x] **步骤 6：运行 Scope 定向测试并确认 RED**

运行：

```bash
node tests/run-tests.mjs scope-presentation.test.ts
```

预期：FAIL，因为尚未导入或调用 `MarkdownRenderer`，也没有 Scope details DOM。

- [x] **步骤 7：实现最小文本 Scope renderer**

在 `src/main.ts` 的 Obsidian import 中加入 `MarkdownRenderer`。在 `FlowDeskDashboardView.renderDetails` 的 text 分支实现：

```ts
if (scopePresentation.mode === "text") {
  if (scopePresentation.text) {
    const details = contract.createEl("details", {
      cls: "flowdesk-contract-scope-details",
    });
    details.open = this.disclosureState.scopeOpen;
    details.addEventListener("toggle", () => {
      this.disclosureState.scopeOpen = details.open;
    });
    const summary = details.createEl("summary");
    summary.createSpan({ text: "范围" });
    summary.createSpan({
      cls: "flowdesk-contract-scope-status",
      text: "已提供",
    });
    const markdown = details.createDiv({
      cls: "flowdesk-contract-scope-markdown markdown-rendered",
    });
    void MarkdownRenderer.render(
      this.app,
      scopePresentation.text,
      markdown,
      model.currentTask.id,
      this
    );
  } else {
    const row = contract.createDiv({ cls: "flowdesk-contract-scope-empty" });
    row.createSpan({ text: "范围" });
    row.createSpan({ text: "Scope 待补充" });
  }
} else {
  scopeRow(contract, "包含", scopePresentation.included);
  scopeRow(contract, "不包含", scopePresentation.excluded);
}
```

创建 chip 时始终保留 REQ、SCN；只有 `scopePresentation.mode === "structured"` 时创建原 Scope 状态 chip。

- [x] **步骤 8：增加局部 CSS**

在 `styles.css` 中移除仅为原文转储服务的 `.flowdesk-contract-scope-row > span:last-child { white-space: pre-wrap; }`，新增：

```css
.flowdesk-contract-scope-details {
  margin-top: 5px;
  border-radius: 6px;
}

.flowdesk-contract-scope-details > summary,
.flowdesk-contract-scope-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  padding: 5px 0;
  font-size: 12px;
}

.flowdesk-contract-scope-status,
.flowdesk-contract-scope-empty > span:last-child {
  color: var(--text-muted);
  font-size: 10.5px;
  white-space: nowrap;
}

.flowdesk-contract-scope-markdown {
  min-width: 0;
  padding: 4px 0 2px 16px;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.5;
}

.flowdesk-contract-scope-markdown > :first-child { margin-top: 0; }
.flowdesk-contract-scope-markdown > :last-child { margin-bottom: 0; }
.flowdesk-contract-scope-markdown ul,
.flowdesk-contract-scope-markdown ol { padding-inline-start: 20px; }
.flowdesk-contract-scope-markdown code { white-space: break-spaces; }
```

如现有 `details > summary` 全局规则需要避让，只增加 `.flowdesk-contract-scope-*` 范围内的覆盖，不修改其他 section。

- [x] **步骤 9：补 CSS contract 并确认 GREEN**

在 `tests/scope-presentation.test.ts` 中断言上述局部 class、`overflow-wrap: anywhere`、列表缩进与 code 换行规则存在，然后运行：

```bash
node tests/run-tests.mjs scope-presentation.test.ts dashboard-presentation.test.ts
```

预期：PASS。

- [x] **步骤 10：运行完整验证**

运行：

```bash
npm test
npx tsc --noEmit
npm run build
node -c main.js
git diff --check
```

预期：全部 exit 0；`npm test` 无新增失败。

- [x] **步骤 11：提交功能改动**

```bash
git add src/dashboard-presentation.ts src/main.ts styles.css tests/dashboard-presentation.test.ts tests/scope-presentation.test.ts tests/fixtures/task-dashboard-baseline.json docs/superpowers/plans/2026-08-14-dashboard-scope-collapsible-markdown.md
git commit -m "fix: 优化 Dashboard Scope 展示"
```

---

### 任务 2：合并并发布 v0.1.25

**文件：**

- 修改：`package.json`
- 修改：`package-lock.json`
- 修改：`manifest.json`
- 修改：`versions.json`
- 生成并提交：`main.js`

**接口：**

- 输入：任务 1 的功能提交与通过的完整验证。
- 输出：合并到 `main` 的功能 PR、release PR、annotated tag `v0.1.25`、成功的 GitHub Release 及五项已核验资产。

- [ ] **步骤 1：推送功能分支并创建 PR**

功能 PR 必须基于当前 `origin/main`，只包含任务 1 的文件。等待 GitHub Actions 成功后合并，并核对 merge commit 与 `origin/main`。

- [ ] **步骤 2：建立 release 分支并 bump v0.1.25**

从合并后的 `main` 创建 release 分支，将 `package.json`、`package-lock.json`、`manifest.json` 更新为 `0.1.25`，并在 `versions.json` 增加：

```json
"0.1.25": "1.5.0"
```

- [ ] **步骤 3：运行 canonical release gate**

```bash
npm run release:prepare
git diff --check
```

预期：tests、build、typecheck、syntax、release verify、package 全部通过，生成 `release/flowdesk-dashboard-0.1.25.zip`。

- [ ] **步骤 4：提交并合并 release PR**

```bash
git add main.js package.json package-lock.json manifest.json versions.json
git commit -m "chore: 发布 Dashboard 0.1.25"
```

推送 release 分支，创建非 Draft PR；CI 成功后合并，并在最终 `main` 再跑一次 `npm run release:prepare`。

- [ ] **步骤 5：创建并推送 annotated tag**

```bash
git tag -a v0.1.25 -m "FlowDesk Dashboard 0.1.25"
git push origin v0.1.25
```

确认 tag object 类型为 `tag`，且远端 `v0.1.25^{}` 精确指向最终 `origin/main`。

- [ ] **步骤 6：核验 GitHub Release 与发布资产**

等待 Build and Release workflow 成功，确认 Release 非 draft、非 prerelease，且包含：

- `flowdesk-dashboard-0.1.25.zip`
- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`

下载全部资产，核验 GitHub digest、下载文件 SHA-256、ZIP 完整性，并逐字节比较单独资产、ZIP 内文件与最终 `main` 输出。

- [ ] **步骤 7：最终对账**

确认：

```text
HEAD = origin/main = v0.1.25 peel
git status --short 为空
```

交付中明确：未安装插件、未执行 Obsidian 实机 smoke、未修改 producer。
