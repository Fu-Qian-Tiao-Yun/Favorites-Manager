# 部署到 Cloudflare Pages

本项目前端使用 Vite 构建，B 站封面提取依赖 `functions/` 目录下的
Cloudflare Pages Functions（`/api/extract-cover`、`/api/cover-img`）。

## 常见问题：接口返回 HTML 而不是 JSON

如果浏览器控制台出现：

```
Auto cover extraction failed: SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```

说明 `/api/extract-cover` 请求被 SPA 回退到了 `index.html`，
**Pages Functions 没有被部署**。按下面步骤检查。

## Pages 构建配置

在 Cloudflare Dashboard → Workers & Pages → 你的 Pages 项目 →
Settings → Build & deployments → Build configuration：

| 配置项 | 值 |
| --- | --- |
| Framework preset | None |
| Build command | `cd favourite-js && npm install && npm run build` |
| Build output directory | `favourite-js/dist` |
| Root directory（高级设置里） | 留空（仓库根目录） |

**重要**：`functions/` 目录必须位于 Pages 项目的 **部署根目录** 下。
因为本仓库把应用放在 `favourite-js/` 子目录而仓库根才是 Pages 项目根，
所以 `favourite-js/functions/` 需要作为 `functions/` 出现在仓库根，
Cloudflare 才能识别并部署这些 Functions。

两种做法任选其一：

1. **推荐**：在 Pages 项目设置里把 Root directory（高级）设为 `/`，
   然后确保仓库根存在 `functions/`（可以是软链/复制/CI 拷贝自 `favourite-js/functions/`）。
2. 在部署前用构建命令把函数目录复制到仓库根：
   ```
   cd favourite-js && npm install && npm run build && cp -r functions ../functions
   ```

## 验证部署是否成功

部署完成后访问：

```
https://你的域名/api/extract-cover?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1ykKN66EsZ
```

- 返回 JSON（`{"cover":"https://..."}`）→ Functions 正常。
- 返回 HTML（`<!doctype html>`）→ Functions 未部署，检查上面的目录要求。

## 本地开发

本地 `npm run dev` 时由 `vite-plugins/coverPlugin.ts` 提供同样的
`/api/extract-cover`、`/api/cover-img` 接口，无需 wrangler。
