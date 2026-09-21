export type PeriodKey = '1m' | '5m' | '15m' | '30m' | '60m' | 'day' | 'week' | 'month';

export type StockItem = {
  code: string;
  name: string;
  pinyin: string;
  price: number;
  prevClose: number;
  change: number;
  percent: number;
  volume: number;
  high: number;
  low: number;
  pe: number;
  pb: number;
  eps: number;
  roe: number;
  turnover: number;
};

export type AlertRule = {
  priceAbove?: number;
  priceBelow?: number;
  changeAbove?: number;
  changeBelow?: number;
  lastTriggered?: boolean;
};

const stockBase = [
  { code: '600519', name: '贵州茅台', pinyin: 'guizhoumaotai', price: 1645.2 },
  { code: '000001', name: '平安银行', pinyin: 'pinganyinhang', price: 11.48 },
  { code: '000858', name: '五粮液', pinyin: 'wuliangye', price: 163.2 },
  { code: '002594', name: '比亚迪', pinyin: 'biyadi', price: 287.5 },
  { code: '300750', name: '宁德时代', pinyin: 'ningdeshidai', price: 345.2 },
  { code: '601166', name: '兴业银行', pinyin: 'xingyeyinhang', price: 18.3 },
  { code: '601318', name: '中国平安', pinyin: 'zhongguopingan', price: 47.6 },
  { code: '601012', name: '隆基绿能', pinyin: 'longjilv neng', price: 29.1 },
  { code: '688981', name: '中芯国际', pinyin: 'zhongxinguoji', price: 41.25 },
  { code: '000333', name: '美的集团', pinyin: 'meidejituan', price: 64.5 },
  { code: '600036', name: '招商银行', pinyin: 'zhaoshangyinhang', price: 34.8 },
  { code: '603799', name: '华友钴业', pinyin: 'huayouguoye', price: 27.9 },
  { code: '600900', name: '长江电力', pinyin: 'changjiangdianli', price: 34.7 },
  { code: '000776', name: '广发证券', pinyin: 'guangfazhengquan', price: 13.4 },
  { code: '601857', name: '中国石油', pinyin: 'zhongguoshiyou', price: 7.9 },
  { code: '002049', name: '紫光国微', pinyin: 'ziguangguowei', price: 98.4 },
  { code: '300015', name: '爱尔眼科', pinyin: 'aieryanke', price: 32.8 },
  { code: '600030', name: '中信证券', pinyin: 'zhongxinzq', price: 22.12 },
  { code: '000625', name: '长安汽车', pinyin: 'changanqiche', price: 19.5 },
  { code: '002230', name: '科大讯飞', pinyin: 'kedaxunfei', price: 60.4 },
  { code: '600104', name: '上汽集团', pinyin: 'shangqijituan', price: 8.7 },
  { code: '600887', name: '伊利股份', pinyin: 'yili', price: 42.3 },
  { code: '000725', name: '京东方A', pinyin: 'jingdongfang', price: 5.8 },
  { code: '300274', name: '阳光电源', pinyin: 'yangguangdianyuan', price: 56.2 },
  { code: '600276', name: '恒瑞医药', pinyin: 'hengruiyaoye', price: 38.9 },
  { code: '600050', name: '中国联通', pinyin: 'zhongguolian tong', price: 6.7 },
];

export function buildMarketStocks(): StockItem[] {
  return stockBase.map((item, index) => {
    const prevClose = Number((item.price * (1 - ((index % 7) - 3) * 0.012)).toFixed(2));
    const change = Number((item.price - prevClose).toFixed(2));
    const percent = Number(((change / prevClose) * 100).toFixed(2));

    return {
      ...item,
      prevClose,
      change,
      percent,
      volume: 2000000 + index * 380000,
      high: Number((item.price * 1.04).toFixed(2)),
      low: Number((item.price * 0.96).toFixed(2)),
      pe: Number((18 + index * 1.7).toFixed(2)),
      pb: Number((2.4 + index * 0.2).toFixed(2)),
      eps: Number((1.43 + index * 0.08).toFixed(2)),
      roe: Number((14 + index * 0.8).toFixed(2)),
      turnover: Number((1.2 + index * 0.2).toFixed(2)),
    };
  });
}

export function buildHistoricalSeries(stock: StockItem, period: PeriodKey) {
  const length = period === '1m' ? 32 : period === '5m' ? 40 : period === '15m' ? 48 : period === '30m' ? 52 : period === '60m' ? 58 : 36;
  const points: Array<{ close: number; time: string }> = [];
  let current = stock.prevClose;

  for (let i = 0; i < length; i += 1) {
    const wave = Math.sin((i + 1) / 5) * (stock.price * 0.02);
    const drift = (Math.random() - 0.5) * stock.price * 0.015;
    current = Number((current + wave + drift).toFixed(2));
    points.push({ close: current, time: `${i + 1}` });
  }

  return points;
}

export function computeIndicatorSummary(series: Array<{ close: number }>) {
  const closes = series.map((point) => point.close);
  const last = closes[closes.length - 1] ?? 0;
  const prev = closes[closes.length - 2] ?? last;
  const avg = closes.reduce((sum, item) => sum + item, 0) / Math.max(closes.length, 1);
  const macd = Number((last - avg).toFixed(2));
  const kdj = Number(((last - prev) * 1.8 + avg * 0.2).toFixed(2));
  const rsi = Number(((last / Math.max(prev, 1)) * 100).toFixed(2));

  const buySignals = [] as string[];
  const sellSignals = [] as string[];

  if (macd > 0) buySignals.push('MACD金叉');
  if (macd < 0) sellSignals.push('MACD死叉');
  if (kdj > 0) buySignals.push('KDJ金叉');
  if (rsi > 70) sellSignals.push('RSI超买');
  if (rsi < 30) buySignals.push('RSI超卖');

  const pattern =
    macd > 0 && kdj > 0 ? '上升通道' :
    macd < 0 && kdj < 0 ? '下跌通道' :
    '震荡盘整';

  return {
    macd,
    kdj,
    rsi,
    buySignals,
    sellSignals,
    pattern,
  };
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
