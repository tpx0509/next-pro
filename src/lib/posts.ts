import 'server-only'; // 只有服务端组件能引用它，浏览器包不会误打进来
import { prisma } from './prisma';
import type { Prisma } from '@/generated/prisma/client';

// 类型从 schema 推导，不手写。
// 哪天给 Post 加了一列并加进下面的 select，这个类型会自动跟着变，
// 手写 type 则会悄悄和数据库漂移。
export type Post = Prisma.PostGetPayload<{
  select: { slug: true; title: true; body: true, likeCount: true };
}>;

// 三个页面都按这个字段清单取，保持一致
const postSelect = { slug: true, title: true, body: true, likeCount: true } as const;

/// 列表页用。先按更新时间倒序（最近改过的在前），时间相同的再按 position 升序。
/// position 现在退居 tiebreaker：批量导入/迁移出来的几行 updatedAt 可能完全一致，
/// 那时必须有第二个字段兜底，否则顺序由数据库自己决定（第 3 块踩过这个坑）。
export async function getPosts(): Promise<Post[]> {
  return prisma.post.findMany({
    orderBy: [{ updatedAt: 'desc' }, { position: 'asc' }],
    select: postSelect,
  });
}

/// 详情页用。没这篇文章就返回 null，由调用方决定是 404 还是别的。
export async function getPost(slug: string): Promise<Post | null> {
  return prisma.post.findUnique({
    where: { slug },
    select: postSelect,
  });
}

/// 把标题变成 URL 里能用的 slug。
/// 英文数字转小写连字符；纯中文标题转不出来（会被整段替换掉），
/// 退化成 post-<时间戳><随机>，保证一定拿得到一个可访问的地址。
/// 为什么不用中文当 slug：/blog/%E7%AC%AC%E4%B8%80%E7%AF%87 这种复制分享容易出错，
/// 而 slug 一旦发出去就是永久地址，改不动（它是主键）。
function slugify(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii) return ascii;
  return `post-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/// 主键不能重复。标题撞了就让路：第一篇叫 hello，第二篇叫 hello-2。
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let n = 2;
  while (
    await prisma.post.findUnique({ where: { slug: candidate }, select: { slug: true } })
  ) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export type CreatePostInput = { title: string; body: string };

/// 新建一篇文章。校验放这里而不是只放表单上：
/// 表单的 required 只约束「用这个表单的人」，Server Action 是可以被直接调用的。
export async function createPost(input: CreatePostInput): Promise<Post> {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) throw new Error('标题不能为空');
  if (!body) throw new Error('内容不能为空');
  if (title.length > 80) throw new Error('标题最多 80 个字');

  const slug = await uniqueSlug(title);

  // 排序位取「当前最小值 - 1」。
  // 列表现在以 updatedAt desc 为主序，新文章的 updatedAt 天然最新、本来就排第一，
  // position 只在 updatedAt 撞车的极端情况下（同一毫秒连发两篇）才起决定作用。
  // 即便如此也不能用 @default(0)：那会和已有的第一篇并列，谁先谁后
  // 就交给数据库自己决定了 —— 和第 3 块那个「顺序漂移」是同一个坑。
  const first = await prisma.post.findFirst({
    orderBy: { position: 'asc' },
    select: { position: true },
  });
  const position = (first?.position ?? 0) - 1;

  return prisma.post.create({
    data: { slug, title, body, position },
    select: postSelect,
  });
}

/// 只取 slug，给 generateStaticParams / sitemap 这类只需要地址的场景用。
/// 单独写一个是为了不把 body 那几百字一起读出来。
export async function getAllPostSlugs(): Promise<string[]> {
  const rows = await prisma.post.findMany({
    orderBy: { position: 'asc' },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}
