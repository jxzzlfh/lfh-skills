---
name: lfh-wechat-article
description: 读取当前目录下所有参考素材文档（txt、docx、xlsx、pptx、pdf、md等），按妙笔生花爆文引擎36种风格智能匹配创作微信公众号爆款文章，使用火山引擎doubao-seedream-5-0-260128自动生成封面图和正文配图，图片自动上传PicList图床获取CDN链接，调用bm.md渲染为微信HTML，最终通过微信API自动推送到公众号草稿箱。Use when user asks to "创作公众号文章", "写公众号爆款", "生成图文并茂的微信文章", "lfh-wechat-article", or wants to create illustrated WeChat articles from reference materials.
---

# LFH WeChat Article Creator

读取当前目录参考素材 → 创作公众号爆款文章 → 生成图片 → 上传图床 → 替换CDN链接 → 渲染为微信HTML → 推送草稿箱。

## 固定路径

```
SKILL_DIR  = C:/Users/lifenghua/.cursor/skills/lfh-wechat-article
IMAGE_GEN  = C:/Users/lifenghua/.cursor/skills/lfh-image-gen/scripts/main.ts
ENV_FILE   = C:/Users/lifenghua/.cursor/skills/lfh-wechat-article/.env
```

## 工作流程

```
- [ ] Step 1: 扫描并读取当前目录所有参考素材（epub/azw3/mobi 先转换再读取）
- [ ] Step 2: 按妙笔生花爆文引擎创作文章（含3个备选标题 + 完整正文，≥5000字，选最佳标题）
- [ ] Step 3: 根据文章内容自动匹配封面风格，生成封面图（精确2.35:1） → 上传PicList → 替换为CDN链接，插入正文顶部
- [ ] Step 4: 根据文章内容自动匹配配图风格，生成2-4张配图（16:9或4:3） → 每张生成后立即上传PicList → 替换为CDN链接，插入对应段落
- [ ] Step 5: 保存完整Markdown文章（所有图片均为CDN URL）
- [ ] Step 6: 调用 bm.md 将 Markdown 渲染为微信HTML，保存到当前目录
- [ ] Step 7: 调用 wechat-api.ts 将 wechat-fragment.html 推送到公众号草稿箱
```

---

### Step 1：读取素材

用 Shell 列出当前目录所有文件，按格式调用对应工具读取：

| 格式 | 读取方式 |
|------|----------|
| `.txt` / `.md` | Read 工具直接读取 |
| `.docx` | 调用 `docx` skill |
| `.pdf` | 调用 `pdf` skill |
| `.xlsx` | 调用 `xlsx` skill |
| `.pptx` | 调用 `pptx` skill |
| `.epub` / `.azw3` / `.mobi` | **先调用 `lfh-ebook-convert` skill 转换**，再读取转换结果 |

**电子书格式转换流程**（`.epub` / `.azw3` / `.mobi`）：

```powershell
# 调用 lfh-ebook-convert 将电子书转为 txt（速度最快，适合提取文字内容）
python "C:/Users/lifenghua/.cursor/skills/lfh-ebook-convert/scripts/convert.py" `
  "<电子书文件名>" txt

# 转换后生成同名 .txt 文件，用 Read 工具读取即可
# 若 txt 转换失败，改用 pdf：
python "C:/Users/lifenghua/.cursor/skills/lfh-ebook-convert/scripts/convert.py" `
  "<电子书文件名>" pdf
# 然后调用 pdf skill 读取
```

> ⚠️ 需要系统已安装 [Calibre](https://calibre-ebook.com/)（提供 `ebook-convert` 命令）。

⛔ **必须读完所有文件再开始写作**。重点提取：核心观点、关键数据、真实人名、具体案例、量化数字。

---

### Step 2：创作文章

参照 [写作规则](#写作规则) 章节完成创作。输出包含：
1. **3个备选标题**（含风格说明）
2. **风格拆解 + 素材提炼 + 关键词**
3. **完整正文**（Markdown，全程中文标点符号）

**字数要求**：正文不少于 **5000字**，内容充实丰满，每个主体段落深度展开，避免点到为止。

**标题决策**：3个备选标题生成后，综合评估以下维度，选出**最佳标题**作为最终文章标题：
- 悬念/反差/痛点强度
- 关键词吸引力
- 与文章内容的契合度
- 公众号传播潜力

在正文最顶部标注：`> 最终标题选择：【标题X】——[一句话选择理由]`（此行仅用于创作记录，保存 Markdown 时删除）。

---

### Step 3：生成封面图 → 上传图床 → 替换链接

读取 ENV_FILE 获取配置，生成封面图后立即上传 PicList 获取 CDN URL。

**规格**：精确 `2350x1000` 像素（严格等于 2.35:1），文字仅用简体中文，禁止英文文字出现在图中。

> ⚠️ **比例说明**：VolcEngine provider 的 `--ar` 参数会被内部忽略，必须用 `--size 2350x1000` 明确指定像素尺寸，才能保证生成图片真正为 2.35:1 比例。

**封面风格自动匹配**（根据文章内容选择最匹配的一种）：

| 文章类型 | 封面视觉风格描述 |
|----------|------------------|
| 科技 / AI / 编程 | 深蓝/紫色科技感、数字粒子流、电路板光效、霓虹线条 |
| 职场 / 商业 / 效率 | 简约商务风、冷色调几何线条、扁平插画、白底专业感 |
| 社会评论 / 深度观点 | 强对比色、黑白+重点色、新闻质感、象征性视觉冲击 |
| 生活方式 / 美食 / 旅行 | 暖色调、自然光感、柔和渐变、烟火生活场景 |
| 情感 / 心理 / 治愈 | 柔和粉暖色系、水彩晕染、氤氲光晕、治愈系手绘质感 |
| 历史 / 文化 / 传统 | 国风水墨、复古纸质感、传统纹样、古朴色调 |
| 哲思 / 极简 / 禅意 | 大面积留白、极简线条、素净冷灰色调、意境构图 |
| 娱乐 / 造梗 / 节日热点 | 高饱和撞色、波普艺术感、活泼插画、热闹视觉张力 |

**封面 Prompt 设计原则**：
- 优先呈现与文章主题直接相关的视觉符号/场景
- 可含文章核心主题关键词（简体中文文字）
- 构图简洁，主体突出，留白适当
- 禁止真实人脸，可有人物剪影、图标、场景、象征性元素

**完整命令**（PowerShell，生成 + 上传一体）：

```powershell
# 1. 读取配置
$envLines = Get-Content "C:/Users/lifenghua/.cursor/skills/lfh-wechat-article/.env"
$apiKey = ($envLines | Where-Object { $_ -match "^VOLCENGINE_API_KEY=" }) -replace "VOLCENGINE_API_KEY=", ""
$env:VOLCENGINE_API_KEY = $apiKey
$piclistPath = ($envLines | Where-Object { $_ -match "^PICLIST_PATH=" }) -replace "PICLIST_PATH=", ""

# 2. 确保 PicList 在后台运行（若未运行则启动，等待3秒让服务就绪）
$running = Get-Process -Name "PicList" -ErrorAction SilentlyContinue
if (-not $running) {
    Start-Process $piclistPath
    Start-Sleep -Seconds 3
}

# 3. 生成封面图（用 --size 2350x1000 确保精确 2.35:1 比例）
$coverFile = "cover-[slug].png"
npx -y bun "C:/Users/lifenghua/.cursor/skills/lfh-image-gen/scripts/main.ts" `
  --prompt "<封面prompt>" `
  --image $coverFile `
  --provider volcengine `
  --model doubao-seedream-5-0-260128 `
  --size 2350x1000

# 4. 上传到 PicList（PicGo-Server 协议，端口 36677）
$absPath = (Resolve-Path $coverFile).Path
$uploadBody = @{ list = @($absPath) } | ConvertTo-Json
$uploadResult = Invoke-RestMethod -Uri "http://127.0.0.1:36677/upload" `
    -Method POST -ContentType "application/json" -Body $uploadBody
$coverCdnUrl = $uploadResult.result[0]
Write-Host "封面图CDN: $coverCdnUrl"
```

上传成功后，在正文最顶部插入 CDN URL：
```markdown
![封面图]($coverCdnUrl)
```

**上传失败处理**：若 PicList API 返回失败或超时，先用本地路径占位 `![封面图](cover-[slug].png)`，在 Step 5 保存后提示用户手动上传。

---

### Step 4：正文配图 → 上传图床 → 替换链接

**配图数量**：每2-3个大段落配1张图，全文共 **2-4张**配图。

**配图风格与尺寸自动匹配**（根据文章类型和段落内容综合决策）：

| 文章类型 | 配图视觉风格 | 推荐尺寸 |
|----------|-------------|----------|
| 科技 / AI / 编程干货 | 蓝紫科技感、信息图表、扁平化UI插画、数据可视化风格 | `1920x1080`（16:9） |
| 职场 / 商业 / 效率工具 | 商务简约、场景插画、工作流程图、冷色系 | `1920x1080`（16:9） |
| 生活方式 / 美食 / 旅行 | 温暖水彩、自然场景、生活感照片风、暖色调 | `1600x1200`（4:3） |
| 人生哲思 / 情感 / 治愈 | 留白禅意、水墨意境、极简插画、柔和渐变 | `1600x1200`（4:3） |
| 社会评论 / 深度观点 | 强对比构图、象征性视觉、新闻插画风、黑白+重点色 | `1920x1080`（16:9） |
| 历史 / 文化 / 传统 | 国风水墨、复古书卷感、传统纹样装饰 | `1600x1200`（4:3） |
| 娱乐 / 造梗 / 节日 | 高饱和撞色、波普感、活泼卡通插画 | `1920x1080`（16:9） |

> 决策原则：科技/商业/评论类 → 优先 16:9；生活/情感/文化类 → 优先 4:3。同一篇文章所有配图保持统一比例。

**配图 Prompt 要求**：
- 画面内容与该段落主旨直接相关
- 风格与封面图保持视觉一致
- 图中可见文字仅用简体中文（prompt 中注明：`text labels in Simplified Chinese only`）
- 禁止真实人脸，可用人物剪影

**每张配图：生成 → 立即上传 → 获取CDN URL**（用 `--size` 指定精确像素，勿用 `--ar`）：

```powershell
# 生成配图（16:9 示例，4:3 则改为 --size 1600x1200）
$imgFile = "img-[N]-[slug].png"
npx -y bun "C:/Users/lifenghua/.cursor/skills/lfh-image-gen/scripts/main.ts" `
  --prompt "<配图prompt>" `
  --image $imgFile `
  --provider volcengine `
  --model doubao-seedream-5-0-260128 `
  --size 1920x1080

# 上传到 PicList
$absPath = (Resolve-Path $imgFile).Path
$uploadBody = @{ list = @($absPath) } | ConvertTo-Json
$uploadResult = Invoke-RestMethod -Uri "http://127.0.0.1:36677/upload" `
    -Method POST -ContentType "application/json" -Body $uploadBody
$imgCdnUrl = $uploadResult.result[0]
Write-Host "配图[N] CDN: $imgCdnUrl"
```

每张配图获得 CDN URL 后，插入对应段落末尾：
```markdown
![配图描述]($imgCdnUrl)
```

**失败处理**：生成或上传失败自动重试一次；两次均失败则用本地路径占位，标注 `[此处建议手动上传配图]`，继续完成后续步骤。

---

### Step 5：保存 Markdown 文章

文件命名：`微信公众号文章-[主题关键词]-YYYYMMDD.md`

最终文章结构（所有图片应为 CDN URL）：
```markdown
![封面图](https://cdn.example.com/cover-[slug].png)

# 文章标题

正文开篇...

段落内容...

![配图1](https://cdn.example.com/img-1-[slug].png)

段落内容...

![配图2](https://cdn.example.com/img-2-[slug].png)

...结尾...
```

保存到当前工作目录（参考素材所在目录）。

---

### Step 6：调用 bm.md 渲染为微信 HTML

将保存好的 Markdown 文章通过 bm.md API 渲染为带内联样式的微信公众号 HTML，保存到当前目录。

#### 6.1 根据文章内容自动决策渲染风格

执行渲染前，**先阅读文章正文**，依据以下决策矩阵选出最匹配的 `markdownStyle` 和 `codeTheme`，然后将所选值填入 6.2 的渲染命令中。

**决策矩阵（按优先级从高到低匹配，命中第一条即止）**：

| 判断条件（正文特征） | markdownStyle | codeTheme | 适用说明 |
|---|---|---|---|
| 含大量代码块 / 命令行 / 技术命令，且风格硬核极客 | `terminal` | `tokyo-night-dark` | 程序员向、开发工具类 |
| 科技 / AI / 编程干货，风格专业严谨，代码块中等 | `professional` | `tokyo-night-dark` | 技术科普、产品评测 |
| 科技 / AI / 编程干货，风格活泼有设计感 | `blueprint` | `catppuccin-mocha` | 科技感强的可视化风格 |
| 职场 / 商业 / 管理 / 效率工具 | `professional` | `catppuccin-latte` | 浅色主题显商务感 |
| 社会评论 / 深度观点 / 批判性内容 | `neo-brutalism` | `panda-syntax-dark` | 视觉冲击大，观点鲜明 |
| 新闻资讯 / 事件报道 / 时事解读 | `newsprint` | `kimbie-dark` | 报纸质感，可信度高 |
| 生活方式 / 美食 / 旅行 / 自然 | `botanical` | `rose-pine-dawn` | 柔和自然，浅色温馨 |
| 情感 / 心理 / 治愈 / 人生感悟 | `organic` | `rose-pine-dawn` | 有机温暖，亲近感强 |
| 历史 / 文化 / 传统 / 文学 | `retro` | `kimbie-dark` | 复古人文气质 |
| 创意 / 设计 / 艺术 / 潮流 | `playful-geometric` | `panda-syntax-light` | 活泼几何，年轻感 |
| 极简 / 禅意 / 冥想 / 哲思 | `sketch` | `paraiso-light` | 素描留白，意境感 |
| 节日 / 热点 / 娱乐 / 造梗 | `maximalism` | `catppuccin-frappe` | 热闹丰富，视觉抓眼 |
| 以上均不明确匹配（通用兜底） | `ayu-light` | `kimbie-light` | 清新淡雅，适配所有场景 |

> **决策时同时考虑**：①文章主题领域 ②写作风格基调（严肃/活泼/温暖/犀利）③代码块数量（多→偏深色 codeTheme，无→可选浅色）

#### 6.2 渲染命令

将 6.1 决策出的 `markdownStyle` 和 `codeTheme` 填入下方 `STYLE` 和 `CODE_THEME` 变量，执行渲染：

```powershell
# 将 md 文件复制为 ASCII 文件名（规避 PowerShell 中文路径问题）
Copy-Item "微信公众号文章-[主题关键词]-YYYYMMDD.md" "_article_tmp.md"

$pyScript = @'
import json, urllib.request

# ← 由 Step 6.1 决策填入
STYLE      = "professional"      # 替换为决策出的 markdownStyle
CODE_THEME = "tokyo-night-dark"  # 替换为决策出的 codeTheme

with open("_article_tmp.md", encoding="utf-8") as f:
    md = f.read()

payload = {
    "markdown": md,
    "markdownStyle": STYLE,
    "codeTheme": CODE_THEME,
    "platform": "wechat",
    "enableFootnoteLinks": False,
    "openLinksInNewWindow": False
}

data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(
    "https://bm.md/api/markdown/render",
    data=data,
    headers={
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, */*",
        "Origin": "https://bm.md",
        "Referer": "https://bm.md/",
    },
    method="POST"
)

with urllib.request.urlopen(req, timeout=30) as resp:
    result = json.loads(resp.read().decode("utf-8")).get("result", "")

with open("wechat-fragment.html", "w", encoding="utf-8") as f:
    f.write(result)

print(f"[bm.md] style={STYLE} codeTheme={CODE_THEME}")
print(f"wechat-fragment.html 已生成，长度: {len(result):,} chars")
'@

$pyScript | python -
Remove-Item "_article_tmp.md" -ErrorAction SilentlyContinue
```

**输出文件**：`wechat-fragment.html`（保存在当前工作目录）

---

### Step 7：推送草稿箱

调用 `lfh-post-to-wechat` skill 的 `wechat-api.ts`，将 `wechat-fragment.html` 通过微信 API 推送到公众号草稿箱。

#### 7.1 准备参数

从已完成的步骤中收集以下信息：

| 参数 | 来源 |
|------|------|
| `TITLE` | Step 2 最终选定的文章标题 |
| `COVER_FILE` | Step 3 生成的封面文件名，如 `cover-[slug].png` |
| `SUMMARY` | 从正文第一段（去掉图片行后）提取，截断至 **120字以内** |

> `author` 无需传入，脚本自动从 `~/.lfh-skills/lfh-post-to-wechat/EXTEND.md` 的 `default_author` 读取（当前为 **李丰华**）。

#### 7.2 推送命令

```powershell
# 变量由 7.1 填入
$TITLE      = "文章标题"                    # Step 2 最终标题
$COVER_FILE = "cover-[slug].png"           # Step 3 封面文件名
$SUMMARY    = "摘要，不超过120字"            # 正文第一段精炼

npx -y bun "C:/Users/lifenghua/.cursor/skills/lfh-post-to-wechat/scripts/wechat-api.ts" `
  wechat-fragment.html `
  --title $TITLE `
  --cover $COVER_FILE `
  --summary $SUMMARY
```

> **注意**：脚本会自动将内容图片中的 WebP 格式转换为 JPEG 再上传微信 CDN，无需手动处理。封面使用本地 PNG 文件直接上传。

#### 7.3 成功输出示例

```json
{
  "success": true,
  "media_id": "xxxxxx",
  "title": "文章标题",
  "articleType": "news"
}
```

成功后在草稿箱管理：[mp.weixin.qq.com](https://mp.weixin.qq.com) → 内容管理 → 草稿箱 → 预览 → 发表。

#### 7.4 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| `40164: invalid ip` | 本机出口 IP 未加白名单 | 登录公众号后台 → 开发 → 基本配置 → IP白名单，添加错误信息中显示的 IP |
| `40113: unsupported file type` | 封面格式不支持（极少见） | 改用 `cover-[slug].jpg`，或确认文件是有效 PNG |
| `Access token error` | AppID/Secret 配置有误 | 检查 `~/.lfh-skills/.env` 中 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` |
| 封面上传失败 | 封面文件不存在 | 确认 Step 3 封面已保存到当前目录 |

---

## 写作规则（妙笔生花爆文引擎）

### 角色定位

资深微信公众号内容创作专家。精通36种写作风格，智能匹配最适合的风格组合。极度厌恶AI味表达，坚持从素材中提取鲜活细节，绝不凭空捏造。

### 风格自动匹配

| 素材类型 | 推荐风格组合 |
|----------|-------------|
| 科技 / AI干货 | 硬核降维型 + 知识科普型 + 数据案例型 |
| 职场技能 | 干货清单型 + 职场干货型 + 情绪嘴替型 |
| 社会热点 | 借古讽今型 / 理性开炮型 + 深度洞察型 |
| 生活美学 | 平淡如话型 + 美学生活型 + 岁月怀旧型 |
| 人生感悟 | 哲思温暖型 + 情感共鸣型 + 温暖治愈型 |

### 36种风格速查

**社会评论类（9种）**：借古讽今型、理性开炮型、黑色幽默型、知识分子批判型、理性感性融合型、真挚犀利型、反常识冲击型、深度洞察型、悬念设问型

**生活美学类（7种）**：平淡如话型、禅意抒情型、美学生活型、浪漫真诚型、诙谐人间型、亲切对话型、温暖治愈型

**哲思洞察类（5种）**：克制悲怆型、哲思温暖型、哲理温润型、狂放不羁型、情感共鸣型

**知识传递类（5种）**：干货清单型、知识科普型、职场干货型、数据案例型、书评影评型

**叙事故事类（4种）**：故事叙述型、真实经历型、东北叙事型、民间志怪型

**互动对话类（2种）**：对话访谈型、极简叙事型

**网感流行类（4种）**：情绪嘴替型、硬核降维型、造梗狂欢型、岁月怀旧型

### 创作标准

**4大必含元素**：
1. **硬核干货**：从素材提炼可落地的方法 / 观点 / 细节事实，拒绝假大空
2. **金句布局**：全文均匀分布，**加粗**标识，像血液一样流淌，绝不扎堆结尾
3. **启发思考**：让读者产生认知升级的顿悟感
4. **行动指南**：结尾自然融入叙事，不单列序号

**文章结构**：
```
【标题】关键词 + 悬念/反差/痛点
    ↓
【开篇黄金区】反常识观点 / 戏剧冲突 / 核心痛点直切（严禁虚构故事！）
    第一句金句出现
    ↓
【过渡引申】抛出从素材提炼的核心主张
    ↓
【主体段落（2-4层）】带关键词小标题 + 素材案例/数据/细节 + 风格拆解 + 各层金句
    ↓
【结尾区】具体行动建议（融入叙事）+ 金句点睛 + 1-2个开放式问题引导留言
```

**⚠️ 反AI底线（必须死守）**：
- ❌ 严禁脱离素材捏造虚构人物、不存在的案例、无根据的故事
- ❌ 拒绝"首先、其次、最后"、"综上所述"、"在这个瞬息万变的时代"等八股滥词
- ❌ 拒绝"深入人心"、"不言而喻"、"希望对你有帮助"等废话
- ❌ 拒绝无情感的纯列表堆砌，必须用过渡句自然连接
- ❌ 严禁虚构故事型开头（除非素材中明确有真实个人经历）

**标题优化**：3个备选，包含核心关键词，制造悬念或反差，拒绝低级标题党。格式参考：反常识陈述 / 身份标签+痛点+解决方案 / 核心概念降维打击。

**标点符号**：全文使用中文标点（，。？！：；（）""【】），禁止在中文正文中使用英文标点。代码、URL、文件路径等技术内容除外。

---

## .env 配置

在 `C:/Users/lifenghua/.cursor/skills/lfh-wechat-article/.env` 中配置：

```
# 火山引擎豆包图片生成 API Key
VOLCENGINE_API_KEY=你的火山引擎API密钥

# PicList 可执行文件路径（Windows）
PICLIST_PATH=C:\Program Files\PicList\PicList.exe
```

**VOLCENGINE_API_KEY** 获取途径：[火山引擎控制台](https://console.volcengine.com/) → API密钥管理

**PICLIST_PATH** 说明：
- PicList 基于 PicGo 开发，启动后在本地 `36677` 端口提供 PicGo-Server 上传 API
- 上传接口：`POST http://127.0.0.1:36677/upload`，Body：`{"list": ["绝对路径"]}`
- 返回格式：`{"success": true, "result": ["https://cdn.example.com/image.png"]}`
- 使用前请在 PicList 中配置好图床（如又拍云、七牛云、阿里OSS等），并确认上传测试通过
