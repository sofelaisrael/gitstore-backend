import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const SAFE_SCHEMA = {
  ...defaultSchema,
  attributes: { ...defaultSchema.attributes, '*': ['className'], a: ['href', 'title'], img: ['src', 'alt', 'title'] },
  protocols: { href: ['https', 'http', 'mailto'], src: ['https'] },
};

export async function sanitizeReadme(markdown) {
  if (!markdown) return null;
  try {
    const file = await unified()
      .use(remarkParse)
      .use(remarkRehype, { allowDangerousHtml: false })
      .use(rehypeSanitize, SAFE_SCHEMA)
      .use(rehypeStringify)
      .process(markdown);
    let html = String(file);
    html = html.replace(/src="(https?:\/\/[^"]+)"/g, (_, url) => `src="/api/proxy/image?url=${encodeURIComponent(url)}"`);
    return html;
  } catch (error) {
    return null;
  }
}
