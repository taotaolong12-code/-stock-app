# A股专业股票分析平台

React + TypeScript + Vite 移动端 PWA 股票分析应用。

## 当前实现

- 优先接入 Sina 实时报价接口，3 秒超时并定时刷新
- 接入腾讯财经 K 线接口：分时、5/15/30/60 分钟、日/周/月
- 搜索、自选、预警、浏览器通知、语音播报、MACD/KDJ/RSI 和模拟交易
- PWA Manifest、Service Worker 与浏览器本地持久化

公开行情接口可能受 CORS、网络和交易时段影响。接口失败时应用会使用明确的本地降级数据，不能将降级数据视为实时行情；模拟交易也不是真实券商交易。

```bash
npm install
npm run dev
npm run build
```
