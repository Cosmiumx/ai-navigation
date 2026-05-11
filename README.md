# AI Navigation

把骑行路线接口 JSON 转成高德地图可预览、可分享的骑行路线页面。

## 功能

- 粘贴接口返回 JSON，读取 `data.steps[].path`
- 默认将 `BD-09` 坐标转换为高德 `GCJ-02`
- 在高德地图上预览路线、起点和终点
- 生成 `m.amap.com/navigation/ridemap/__r=...` 骑行分享链接
- 自动抽样最多 16 个途经点，让高德 App 尽量贴近原路线

## 本地启动

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

访问：`http://localhost:3000`

`.env.local` 需要填写：

```bash
NEXT_PUBLIC_AMAP_KEY="你的高德 Web 端 Key"
NEXT_PUBLIC_AMAP_SECURITY_CODE="你的高德安全密钥"
```

## 注意

- 高德前端 Key 会暴露在浏览器里，生产环境必须配置域名白名单。
- 高德分享链接是用途经点重新规划路线，不是完整导入原始轨迹。
