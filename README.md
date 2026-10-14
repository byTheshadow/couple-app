# 我们的小世界（情侣 PWA）

第一轮范围：密码登录（自动识别 u1 / u2）、主页（TA 的实时状态 + 收到的信 + 戳一戳）、状态编辑页（两层状态 + 四种悄悄话解锁）、亮/暗主题。

## 一、配置 Supabase（约 10 分钟）

1. 到 supabase.com 新建项目（免费版即可）。
2. 打开 **SQL Editor**，把 `supabase/schema.sql` 整段粘进去运行。
3. 打开 **Authentication → Providers → Email**：关闭 *Confirm email*；再到 **Authentication → Sign In / Providers** 里关闭 *Allow new users to sign up*（这样站点永远只有你们两个人）。
4. 打开 **Authentication → Users → Add user → Create new user**，创建两个账号并勾选 *Auto Confirm User*：
   - `u1@couple.app`，密码 = 你的登录密码（至少 6 位）
   - `u2@couple.app`，密码 = TA 的登录密码（至少 6 位）
   - 邮箱前缀必须是 `u1` / `u2`，其它前缀会被数据库拒绝。
5. **Project Settings → API**：复制 *Project URL* 和 *anon public key*。
6. 本地：`cp .env.example .env`，把两个值填进去。

## 二、本地运行

```bash
npm install
npm run dev        # 手机和电脑在同一 Wi-Fi 时，用 --host 可以让手机访问
npm run build      # 产物在 dist/，是纯静态文件，可放 GitHub Pages / Cloudflare Pages / 你的云服务器
```

## 三、登录是怎么工作的

站点只有两个 Supabase 账号。登录页只有一个密码框：先用 u1 的邮箱试，不对再用 u2 的邮箱试，匹配到谁就是谁。密码校验、加盐哈希、防暴力破解都在 Supabase 服务端完成，前端代码里没有任何密码。名字可以在「状态」页自己改。

## 四、已知边界（刻意的）

- **悄悄话的锁是"仪式感"，不是安全边界**：内容对方的客户端本来就能取到。需要真正保密的内容，用信箱里的时间胶囊（正文由服务端检查时间后才返回）。
- 刮刮乐目前是点按擦开，手指涂抹的 canvas 版放到精修轮。
- 状态图标目前是内联线性图标，Lordicon / Lottie 动态图标之后只需要改 `src/components/Icon.jsx`。
- 发信（便签/涂鸦/时间胶囊/阅后即焚）、画板、实时聊天、系统推送、APK 都还没做；目前信件可以用 `schema.sql` 末尾的测试语句造几封来看效果。

## 五、目录

```
src/App.jsx              路由；每页 = 懒加载 + 独立错误边界（一页崩了不影响别页）
src/lib/auth.jsx         登录 / 会话
src/lib/hooks.js         实时状态、信件、戳一戳
src/lib/theme.js         亮/暗主题（加新配色：在 styles.css 里加一组 [data-theme]）
src/pages/               Login / Home / StatusEditor
src/components/          Whisper（四种解锁）/ LetterModal / TabBar / Icon / PageBoundary
supabase/schema.sql      表结构 + RLS + 实时 + 拆信 RPC
```
