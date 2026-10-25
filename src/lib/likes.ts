import 'server-only'; // 标记此文件只有服务端组件可以引用
import { promises as fs } from "node:fs";
import path from "node:path";

// 数据文件放在项目根目录的 data/ 下，dev 和 build 都以项目根为 cwd
const FILE = path.join(process.cwd(), "data", "likes.json");

type LikeMap = Record<string, number>;

async function readAll(): Promise<LikeMap> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as LikeMap;
  } catch {
    // 文件不存在 = 还没有人点过赞
    return {};
  }
}

async function writeAll(data: LikeMap) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), "utf8");
}

export async function getLikeCount(slug: string): Promise<number> {
  const all = await readAll();
  return all[slug] ?? 0;
}

// 批量读取：列表页一次拿走所有文章的点赞数，避免 N 次读文件
export async function getAllLikes(): Promise<LikeMap> {
  return readAll();
}

export async function incrementLike(slug: string): Promise<number> {
  const all = await readAll();
  all[slug] = (all[slug] ?? 0) + 1;
  await writeAll(all);
  return all[slug];
}
