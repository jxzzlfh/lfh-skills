# lfh-skills

个人 Claude Code 技能集，专注于微信公众号内容创作工作流。

## 项目结构

```
lfh-skills/
├── .lfh-skills/          # 环境变量配置
├── lfh-ebook-convert/    # 电子书格式转换
├── lfh-image-gen/        # AI 图片生成
├── lfh-post-to-wechat/   # 公众号发布
└── lfh-wechat-article/  # 公众号文章创作（完整工作流）
```

## 技能模块

### lfh-image-gen

AI 图片生成，支持多种提供商：

- **OpenAI** (DALL-E)
- **Google** (Gemini/Imagen)
- **DashScope** (阿里通义万象)
- **VolcEngine** (火山引擎豆包)

主要功能：
- 文本生成图片
- 参考图生成（Google multimodal / OpenAI edits）
- 多种比例支持（1:1, 16:9, 9:16, 4:3, 2.35:1）
- 质量预设（normal, 2k）

环境变量：`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `VOLCENGINE_API_KEY`

---

### lfh-post-to-wechat

发布内容到微信公众号，支持两种方式：

| 方式 | 用途 | 速度 | 依赖 |
|------|------|------|------|
| API | 文章发布 | 快 | AppID/AppSecret |
| Browser | 图文/文章 | 慢 | Chrome 浏览器 |

主要功能：
- Markdown/HTML/纯文本 → 公众号文章
- 多种主题样式（default, grace, simple）
- 自动生成摘要、封面
- 评论控制

环境变量：`WECHAT_APP_ID`, `WECHAT_APP_SECRET`

---

### lfh-wechat-article

从参考素材创作公众号爆款文章的完整工作流。

**工作流程**：
```
读取素材 → 创作文章 → 生成封面图 → 生成配图 → 上传图床 →
渲染HTML → 推送草稿箱
```

核心功能：
- 支持格式：txt, md, docx, pdf, xlsx, pptx, epub, azw3, mobi
- AI 创作：36 种写作风格智能匹配
- 图片生成：火山引擎豆包 (doubao-seedream-5-0-260128)
- 自动配图：根据文章类型匹配视觉风格
- 图床上传：PicList (PicGo-Server)
- HTML 渲染：bm.md API

环境变量：`VOLCENGINE_API_KEY`, `PICLIST_PATH`, `WECHAT_APP_ID`, `WECHAT_APP_SECRET`

---

### lfh-ebook-convert

电子书格式转换，基于 Calibre 的 `ebook-convert` 命令。

支持格式：
- 输入：epub, azw3, mobi, pdf 等
- 输出：txt, pdf, html 等

依赖：系统已安装 [Calibre](https://calibre-ebook.com/)

---

## 快速开始

### 1. 配置环境变量

在项目根目录或用户目录创建 `.lfh-skills/.env`：

```bash
# 图片生成（至少配置一个）
OPENAI_API_KEY=sk-xxx
GOOGLE_API_KEY=xxx
DASHSCOPE_API_KEY=xxx
VOLCENGINE_API_KEY=xxx

# 微信公众号
WECHAT_APP_ID=wx_xxx
WECHAT_APP_SECRET=xxx
```

### 2. 使用技能

在 Claude Code 中直接使用自然语言调用：

- "生成一张科技感封面图"
- "把这篇文章发布到公众号"
- "用这个PDF创作一篇公众号文章"

---

## 扩展配置

部分技能支持 `EXTEND.md` 配置文件：

| 技能 | 路径 |
|------|------|
| lfh-image-gen | `.lfh-skills/lfh-image-gen/EXTEND.md` 或 `~/.lfh-skills/lfh-image-gen/EXTEND.md` |
| lfh-post-to-wechat | `.lfh-skills/lfh-post-to-wechat/EXTEND.md` 或 `~/.lfh-skills/lfh-post-to-wechat/EXTEND.md` |

配置优先级：CLI 参数 > frontmatter > EXTEND.md > 环境变量
