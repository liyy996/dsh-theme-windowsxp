# 上架到插件市场：要给的东西都在这儿

目标仓库是 **[awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)**，不是 `dsh-market/dsh-market`。后者的 README 原话：

> **这个仓库是市场应用本身，不是插件目录。** 市场里的插件列表来自精选列表 awesome-dsh-plugin——想让你的插件上架，请去**那边**提 PR（在列表里加一条即可，站点和本市场会自动收录，通常一天内生效）。请不要往本仓库提插件条目。

市场（`dshmarket`）**实时读** `https://awesome-dsh-plugin.com/plugins.json`，而且**只允许安装精选列表内的来源**，所以进列表是唯一正路。

---

## 一、提交闸门（三个硬条件）

| # | 条件 | 现在 |
|---|---|---|
| 1 | 声明了 `dsh.bundle` | ✅ `dsh.bundle.patch` → `cordis.patch.yml`，`insert` 带 `id: ui-skin-windowsxp` |
| 2 | 仓库**创建满 24 小时**（按 `created_at`，UTC） | ⬜ 建完仓库才开始算 |
| 3 | 仓库 **≥ 10 个提交** | ⬜ |

第 2 条几乎必踩红灯（`repository is X.X days old (needs 1)`），**那不是你的问题**。官方 `regate.yml` 每 6 小时自动重跑；想立刻变绿就往 PR 分支推一个空提交。

第 3 条的官方说明：**不要用空提交凑数**（README / SECURITY / CHANGELOG / CONTRIBUTING 都算真实提交）。

查资格时间：

```sh
gh api repos/<owner>/dsh-theme-windowsxp --jq .created_at   # 建仓时间
# 可提交时间 = created_at + 24h（UTC）
```

---

## 二、PR 条目：字段照着填

`plugins.json` 的字段是 CI 从「条目 + 仓库元数据」生成的，所以 PR 里给出下面这些即可。
**下面的 `<owner>` 全部替换成你的 GitHub 用户名。**

| 字段 | 值 |
|---|---|
| `name` | `dsh-theme-windowsxp` |
| `owner` | `<owner>` |
| `url` | `https://github.com/<owner>/dsh-theme-windowsxp` |
| `category` | **`theme`** ← 这个分类确实存在（「主题与外观」） |
| `npm` | `dsh-theme-windowsxp`（发到 npm 的话；**市场优先从 npm 装**） |

### description.en

```
Windows XP (Luna) for the DeepSeek Harness web GUI: beige Luna panels, gradient buttons, #7F9DB9 fields, rounded blue scrollbars and the Bliss desktop, plus a chime when a turn finishes and a clearly different cue when the agent stops to ask for your approval. Ships without Microsoft assets and falls back to a pure-CSS desktop and a synthesised bell.
```

### description.zh

```
把 DSH 换成 Windows XP：Luna 蓝皮肤（米色面板、渐变按钮、#7F9DB9 输入框、圆角蓝色滚动条、Bliss 桌面壁纸），外加一轮跑完的提示音，以及智能体停下来等你批准时的另一种提示音。整包通过 --dsw-* 设计 token 注入，不含微软版权素材，缺失时自动退回纯 CSS 桌面与合成钟声。
```

### 截图（可选）

market 会从 README 里自动抽取，所以**不是必须**。要策展的话，把图片提交进仓库，然后用 GitHub 图床直链：

```
https://raw.githubusercontent.com/<owner>/dsh-theme-windowsxp/HEAD/docs/screenshot-1.png
```

> 注意：截图**不要**拍进 Bliss 壁纸或别人可识别的版权内容 —— 那等于换个方式再分发一次。

---

## 三、发布前必须做的事

### 1. `assets/` 绝对不能进版本库

`assets/bliss.jpg`（© Microsoft / Charles O'Rear）和 `assets/chime.wav`（© Microsoft）都是第三方版权素材，本包的 MIT **不覆盖**它们。`.gitignore` 已经把 `assets/` 排掉了，**别用 `git add -f` 绕过** —— 公开仓库就是再分发。

缺了它们功能照样完整：壁纸退回纯 CSS 复刻（`--xp-wallpaper-fallback`），提示音退回合成钟声（`playSynth`）。

### 2. `package.json` 的发布字段

`license` / `version` / `files`（含 `lib` 构建产物）已经就位。还缺 `repository`、`homepage`、`author`、`keywords`。

### 3. 构建产物已提交

`lib/client.js` 是构建产物且已提交进 `files` 白名单，所以别人 `dsh plugin add` 之后**不需要构建**就能用 —— 这是维护者最常退回的原因之一（「`files` 只列了 `src/`」），我们没问题。

---

## 四、其它目录（可选，但更快被看见）

`find_dsh_plugins` 一共查 7 个源：`dsh.so` · `dsh.works` · 岚叔目录(radar) · `awesome-dsh-plugin` · GitHub `dsh-plugin` topic · npm。

- 给仓库打上 **`dsh-plugin` topic** → 好几个目录会自动索引（有一个每 2 小时刷一次）
- **发到 npm**（`keywords` 带上 `dsh-plugin`）→ npm 源命中，且市场优先从 npm 安装

安装顺序：验证过的 npm 包 → 作者提供的 GitHub Release tarball → 整仓源码下载。

---

## 五、一条龙命令（你自己跑）

```powershell
# 1. 建 GitHub 仓库（gh 会问你要不要设 remote）
gh repo create dsh-theme-windowsxp --public --source . --remote origin --push

# 2. 等满 24 小时，再确认提交数
gh api repos/<owner>/dsh-theme-windowsxp --jq '{created_at, commits: .size}'

# 3. fork 精选列表并提 PR（在 README 里加一条）
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
#   ...编辑 README.md / README.zh.md 各加一条...
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin
```

`contributing.md` 里那一行的**确切写法**本机读不到（`github.com` 和 `raw.githubusercontent.com` 都没法直连），照 README 里已有条目复制一行改字段就行。
