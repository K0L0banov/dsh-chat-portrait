# dsh-peak-valley 本地补丁

`dsh-peak-valley` 是第三方插件（v0.1.0），在输入框上方显示峰/谷时段条。
本机对它的 `lib/client.js` 打了**两处**小补丁。

> ⚠️ 改在 `node_modules` 里，**升级或重装插件会被覆盖**，到时照本文重做一遍即可。

## 补丁 1：阶段名改成「梁文峰 / 梁文谷」

位置：`lib/client.js` 第 451 行

```js
// 改前
h("span", { className: "pv-phase" }, run.phase === "peak" ? "峰" : "谷")

// 改后
h("span", { className: "pv-phase" }, run.phase === "peak" ? "梁文峰" : "梁文谷")
```

## 补丁 2：条高固定，减少打字时对话乱跳

位置：`lib/client.js` 第 579 行（`.pv-bar` 的 `--pv-band`）

```css
/* 改前 */
--pv-band: calc(1em + 14px);

/* 改后 */
--pv-band: 26px;
```

**原因**：`1em` 随父级字号浮动，打字时一抖就把条的高度带着变，下面的负 margin 堆叠位置随之变化，
上面的对话区就被顶得来回跳。固定 26px 后视觉高度不变（就是 16px 基准下的原值）。

**现状**：还有**偶尔**的轻微跳动，剩余部分来自输入框自身「单行 → 多行」时的高度变化，暂未处理。

## 笔记本对接步骤

```bash
# 1. 拉本仓库（立绘插件在 chat-portrait/）
git pull

# 2. 装好 dsh-peak-valley 之后，改它的 client.js
#    路径：<profile>/node_modules/dsh-peak-valley/lib/client.js
#    改上面两处，改完 node --check 一遍

# 3. 刷新 Harness 页面（Ctrl+R）即可看到「梁文峰 / 梁文谷」
```

## 为什么不把补丁放进仓库

`node_modules` 是装出来的产物，不是仓库内容。想长期保住，有两条路：

1. **每次升级后手动重打**（当前做法，本文就是操作手册）
2. **把插件复制成本地包**（如 `@local/dsh-peak-valley`）再改，升级不影响

第 2 种更稳，但要多维护一份包；暂时没做。
