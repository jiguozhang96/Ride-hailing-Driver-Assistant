# 网约车跑单规划助手 · 桌面版（Electron）

本地桌面程序，复用 `app/` 前端 + `proxy-server.js` 代理（REST key 只存本机，不随源码外发）。

## 使用

```bash
cd electron
npm install        # 首次安装依赖
npm start          # 本地启动（或双击「启动桌面版.bat」）
npm run build:dir  # 生成绿色版目录 dist/win-unpacked/（可直接压缩分发）
```

> 打包说明：`--win portable` 单文件打包依赖 Windows 代码签名工具（需开发者模式/管理员权限创建符号链接），
> 若报 `Cannot create symbolic link` 或签名错误，改用 `--dir` 生成绿色版目录，或直接使用已生成的
> `dist/网约车跑单规划助手-绿色版.zip`（解压后双击「网约车跑单规划助手.exe」即用）。

## 密钥配置

优先级：**环境变量** > `electron/config.json`。

| 变量 | 说明 |
|---|---|
| `QW_HOST` | 和风 API Host |
| `QW_KEY` | 和风 API Key |
| `AMAP_WS_KEY` | 高德 Web服务 key |

示例（`electron/config.json`）：

```json
{
  "qwHost": "k778m3x5d2.re.qweatherapi.com",
  "qwKey": "你的和风key",
  "amapWsKey": "你的高德Web服务key"
}
```

## 说明

- 高德「Web端 JS API」key + jscode 仍需前端加载（JS SDK 限制），在 `app/js/storage.js` 配置，防护靠高德域名白名单。
- 桌面程序 key 存本机（环境变量/config.json），仅本地使用，不联网外发。
