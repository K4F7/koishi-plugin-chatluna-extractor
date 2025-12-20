# koishi-plugin-chatluna-extractor

[![npm](https://img.shields.io/npm/v/koishi-plugin-chatluna-extractor?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-chatluna-extractor)

提取 chatluna-character 回复中的 XML 标签内容，并通过自定义指令输出。

## 功能介绍

当使用 [koishi-plugin-chatluna-character](https://www.npmjs.com/package/koishi-plugin-chatluna-character) 时，AI 模型的回复通常包含多种 XML 标签，例如 `<think>`（思考过程）、`<memory>`（记忆）、`<relationship>`（关系）等。这些标签内容在最终发送给用户时会被过滤掉。

本插件可以：
- 拦截并提取这些标签内容
- 通过自定义指令查看 AI 的"内心想法"
- 灵活组合多个标签内容进行输出

## 前置依赖

- [koishi-plugin-chatluna-character](https://www.npmjs.com/package/koishi-plugin-chatluna-character)

## 配置说明

### 标签列表

定义要提取的 XML 标签，每个标签会成为可用变量。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| tags | string[] | `['think', 'memory', 'relationship']` | 要提取的 XML 标签列表 |

### 指令列表

定义自定义指令，每个指令可以使用所有标签变量。

| 字段 | 说明 |
|------|------|
| name | 指令名称 |
| format | 输出格式，支持多行 |

### 可用变量

| 变量 | 说明 |
|------|------|
| `{name}` | 角色名称 |
| `{标签名}` | 对应标签提取的内容，如 `{think}`、`{memory}` |

## 使用示例

假设 AI 模型返回了如下内容：

```xml
<think>
用户在和我打招呼，我应该友好地回复。
</think>

<memory>
1.[临时] 用户第一次和我说话
</memory>

<relationship>
陌生人
</relationship>

<output>
<message>你好呀！很高兴认识你~</message>
</output>
```

用户只会看到"你好呀！很高兴认识你~"，但可以通过指令查看更多内容：

- 发送 `think` → 查看 AI 的思考过程
- 发送 `extract` → 查看完整的思考、记忆和关系信息

## 内置指令

| 指令 | 说明 |
|------|------|
| `extractor.tags` | 查看当前配置的所有标签变量 |
| `extractor.commands` | 查看当前配置的所有指令 |

## 许可证

MIT
