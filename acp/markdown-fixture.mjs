// Markdown 渲染审计 fixture：纯数据，不依赖 React/浏览器。
export const RICH_MARKDOWN = `# 一级标题
## 二级标题

普通段落，**粗体**、*斜体*、\`inline code\`、[链接](https://example.com)。

- 无序一
- 无序二

1. 有序一
2. 有序二

> 引用块
> 第二行

| 名称 | 值 |
| --- | ---: |
| 中文 | 😀 |
| 标点 | “引号”、…… |
| 长行 | ${'A'.repeat(96)} |

\`\`\`js
const longLine = "${'x'.repeat(180)}"; // 超长代码行
console.log("你好 😀");
\`\`\`

空行测试：上一段结束后空一行。

这一行后面有两个空格。  
这是下一行。

超长中文与 emoji 混排：${'中文标点，。！？😀'.repeat(18)}`;

export const STREAM_PARTIAL_FENCE = `前言
\`\`\`js
const a = 1;`;

export const STREAM_PARTIAL_TABLE = `| 名称 | 值 |
| --- | --- |`;

export const STREAM_PARTIAL_INLINE = `这是**粗体
以及 [链接](https://example.com`;
