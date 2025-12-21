import { Context, Schema, Session } from 'koishi'

export const name = 'chatluna-extractor'

export const inject = ['chatluna_character']

export const usage = `
提取 chatluna-character 回复中的 XML 标签内容，并通过自定义指令输出。

## 配置步骤

**1. 定义标签** → 设置要提取的 XML 标签（如 \`think\`、\`memory\`）

**2. 创建指令** → 为每个指令设置名称和输出格式

## 可用变量

| 变量 | 说明 |
|------|------|
| \`{name}\` | 角色名称 |
| \`{标签名}\` | 对应标签的内容 |

## 示例

配置标签：\`think\`, \`memory\`

| 指令 | 格式 | 输出 |
|------|------|------|
| 思考 | \`{name}在想：{think}\` | syn在想：嗯？新人？ |
| 记忆 | \`{name}的记忆：{memory}\` | syn的记忆：1.[临时] 群友打招呼 |
`

// 指令配置
export interface CommandConfig {
    name: string
    format: string
}

export interface Config {
    characterName: string
    tags: string[]
    commands: CommandConfig[]
    showLogs: boolean
}

export const Config: Schema<Config> = Schema.object({
    characterName: Schema.string()
        .default('AI')
        .description('角色名称，可在格式中使用 {name} 引用'),
    tags: Schema.array(Schema.string())
        .default(['think', 'memory', 'relationship'])
        .description('要提取的 XML 标签列表（不包含尖括号）。每个标签会成为可用变量，如 {think}'),
    commands: Schema.array(Schema.object({
        name: Schema.string()
            .required()
            .description('指令名称'),
        format: Schema.string()
            .role('textarea')
            .default('{name}在想：\n{think}')
            .description('输出格式。可用变量：{name}（角色名）以及所有已定义的标签如 {think}'),
    })).default([
        { name: 'think', format: '{name}在想：\n{think}' },
        { name: 'extract', format: '{name}在想：\n{think}\n记忆是：\n{memory}\n我们现在的关系是：\n{relationship}' }
    ]).description('指令列表'),
    showLogs: Schema.boolean()
        .default(false)
        .description('是否在控制台显示提取日志'),
})

// 扩展 Context 类型
declare module 'koishi' {
    interface Context {
        chatluna_character: {
            collect: (callback: (session: Session, messages: any[]) => Promise<void>) => void
            logger: {
                debug: (...args: any[]) => void
                info: (...args: any[]) => void
                warn: (...args: any[]) => void
                error: (...args: any[]) => void
            }
        }
    }
}

export function apply(ctx: Context, config: Config) {
    const logger = ctx.logger('chatluna-extractor')

    // 存储最新提取的内容，按群组 ID 分组，每个标签只保留最新值
    const extractedContents = new Map<string, Map<string, string | null>>()

    // 解析 XML 标签内容
    function extractTagContent(text: string, tag: string): string | null {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi')
        const matches: string[] = []
        let match: RegExpExecArray | null

        while ((match = regex.exec(text)) !== null) {
            matches.push(match[1].trim())
        }

        return matches.length > 0 ? matches.join('\n\n') : null
    }

    // 处理模型响应，提取所有配置的标签内容
    function processModelResponse(guildId: string, response: string): void {
        // 重置该群组的提取内容
        const guildContents = new Map<string, string | null>()
        extractedContents.set(guildId, guildContents)

        for (const tag of config.tags) {
            const tagContent = extractTagContent(response, tag)

            if (tagContent) {
                if (config.showLogs) {
                    logger.info(`[${guildId}] 提取到 <${tag}> 标签内容: ${tagContent.substring(0, 100)}...`)
                }
                guildContents.set(tag, tagContent)
            }
        }
    }

    // 当前正在处理的群组 ID
    let currentGuildId: string | null = null

    // 使用 chatluna_character.collect 来追踪当前处理的群组
    ctx.chatluna_character.collect(async (session) => {
        currentGuildId = session.guildId
        if (config.showLogs) {
            logger.info(`[collect] 开始处理群组: ${currentGuildId}`)
        }
    })

    // 拦截 chatluna_character.logger 的 debug 输出
    const characterService = ctx.chatluna_character as any
    const characterLogger = characterService.logger

    if (characterLogger && typeof characterLogger.debug === 'function') {
        const originalDebug = characterLogger.debug.bind(characterLogger)

        characterLogger.debug = (...args: any[]) => {
            // 调用原始的 debug 方法
            originalDebug(...args)

            // 检查是否是模型响应日志
            const message = args[0]
            if (typeof message === 'string' && message.startsWith('model response: ')) {
                const response = message.substring('model response: '.length)

                if (currentGuildId) {
                    if (config.showLogs) {
                        logger.info(`[拦截] 捕获到模型响应，群组: ${currentGuildId}`)
                    }
                    processModelResponse(currentGuildId, response)
                }
            }
        }

        // 清理函数
        ctx.on('dispose', () => {
            characterLogger.debug = originalDebug
        })

        logger.info('chatluna-extractor 插件已启动')
    } else {
        logger.warn('无法拦截 chatluna_character.logger，logger 不存在或 debug 方法不可用')
    }

    // 格式化输出内容，替换所有变量
    function formatOutput(format: string, guildContents: Map<string, string | null>): string {
        let result = format.replace('{name}', config.characterName)

        // 替换所有标签变量
        for (const tag of config.tags) {
            const content = guildContents.get(tag) || `（无${tag}内容）`
            result = result.replace(new RegExp(`\\{${tag}\\}`, 'g'), content)
        }

        return result
    }

    // 为每个自定义指令注册
    for (const cmd of config.commands) {
        ctx.command(cmd.name)
            .action(({ session }) => {
                if (!session) return '无法获取会话信息'

                const guildId = session.guildId
                const guildContents = extractedContents.get(guildId)

                if (!guildContents || guildContents.size === 0) {
                    return '当前没有可用的标签内容'
                }

                return formatOutput(cmd.format, guildContents)
            })
    }

    // 注册查看所有标签的指令
    ctx.command('extractor.tags', '查看当前配置的所有标签')
        .action(() => {
            if (config.tags.length === 0) {
                return '当前没有配置任何标签。'
            }

            return `当前配置的标签变量：\n${config.tags.map((t) => `- {${t}}`).join('\n')}`
        })

    // 注册查看所有指令的指令
    ctx.command('extractor.commands', '查看当前配置的所有指令')
        .action(() => {
            if (config.commands.length === 0) {
                return '当前没有配置任何指令。'
            }

            return `当前配置的指令：\n${config.commands.map((c) => `- ${c.name}：${c.format}`).join('\n')}`
        })
}
