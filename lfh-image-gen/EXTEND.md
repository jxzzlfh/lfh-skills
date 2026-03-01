---
# baoyu-image-gen 默认配置
version: 1

# 默认图片生成服务
# 可选: google, openai, dashscope, volcengine
default_provider: volcengine

# 默认质量
# 可选: normal, 2k
default_quality: 2k

# 默认宽高比
# 可选: 1:1, 16:9, 9:16, 4:3, 3:4, 2.35:1
default_aspect_ratio: 16:9

# 默认图片大小
# 可选: 1K, 2K, 4K
default_image_size: 2K

# 各服务的默认模型
default_model:
  google: gemini-3-pro-image-preview
  openai: gpt-image-1.5
  dashscope: z-image-turbo
  volcengine: doubao-seedream-5-0-260128
