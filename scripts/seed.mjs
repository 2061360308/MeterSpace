// 创建首个管理员用户（自托管引导）。
// 用法: ADMIN_USERNAME=admin ADMIN_PASSWORD=xxx DATABASE_URL=xxx node scripts/seed.mjs
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL);

const username = process.env.ADMIN_USERNAME ?? "admin";
const password = process.env.ADMIN_PASSWORD;

if (!password) {
  console.error("请设置 ADMIN_PASSWORD 环境变量");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);

await sql`
  INSERT INTO users (username, password)
  VALUES (${username}, ${hash})
  ON CONFLICT (username) DO NOTHING
`;

console.log(`用户 "${username}" 已就绪。`);
