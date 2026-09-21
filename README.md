# 看盘股票 Web 应用

移动端优先的 A 股行情与技术分析 Web/PWA 应用。

## Web / PWA 输出

```bash
npm install
npm run build
npm run preview
```

生产文件输出在 `dist/`。将构建后的站点部署到 HTTPS 域名后，Android Chrome 或桌面 Chrome/Edge 会提供“安装应用”入口；iPhone/iPad 可在 Safari 中使用“添加到主屏幕”。Service Worker 需要 HTTPS（本机 `localhost` 除外）。

PWA 已配置：

- 应用名：看盘股票 Web 应用
- 独立窗口启动
- 竖屏优先
- 深色主题 `#0e1117`
- PWA Manifest、图标和离线 Service Worker

## Android App 规划

下一阶段使用 Capacitor 将同一套 Web 代码封装为 Android App。需要在本地安装 Android Studio、Android SDK 和 JDK，然后执行：

```bash
npm install
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "看盘股票" "com.stockwatch.app" --web-dir dist
npx cap add android
npx cap sync android
npx cap open android
```

说明：Android 原生工程和 APK 需要在具备 Android SDK/JDK 的环境中生成，不能仅靠浏览器或 GitHub 文件编辑接口直接产出可签名 APK。模拟交易仍是本地模拟，不连接真实券商。

## 数据说明

行情优先使用免费公开数据源；公开接口可能受 CORS、交易时段、访问频率和网络限制影响。全部接口失败时显示明确的降级/缓存状态，不将本地数据冒充实时行情。
