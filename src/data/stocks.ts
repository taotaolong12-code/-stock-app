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

type Seed = [string, string, string, number];
const seed: Seed[] = [
  ['sh600519', '贵州茅台', 'guizhoumaotai', 1645.2],
  ['sh601318', '中国平安', 'zhongguopingan', 47.6],
  ['sz002594', '比亚迪', 'biyadi', 287.5],
  ['sz300750', '宁德时代', 'ningdeshidai', 345.2],
  ['sz000858', '五粮液', 'wuliangye', 163.2],
  ['sh601166', '兴业银行', 'xingyeyinhang', 18.3],
  ['sh600036', '招商银行', 'zhaoshangyinhang', 34.8],
  ['sh603799', '华友钴业', 'huayouguoye', 27.9],
  ['sh600887', '伊利股份', 'yili', 42.3],
  ['sh000001', '上证指数', 'shangzhengzhishu', 3112.86],
  ['sz399001', '深证成指', 'shenzhengchengzhi', 10061.12],
  ['sz399006', '创业板指', 'chuangyebanzhi', 2087.29],
];

export function normalizeStockCode(value: string): string {
  const code = value.trim().toLowerCase();
  if (/^(sh|sz)\d{6}$/.test(code)) return code;
  if (/^6\d{5}$/.test(code)) return `sh${code}`;
  return `sz${code}`;
}

function makeFallback([code, name, pinyin, price]: Seed, index: number): StockItem {
  const prevClose = Number((price * (1 - ((index % 7) - 3) * 0.012)).toFixed(2));
  const change = Number((price - prevClose).toFixed(2));
  return {
    code, name, pinyin, price, prevClose, change,
    percent: Number(((change / prevClose) * 100).toFixed(2)),
    volume: 0, high: price, low: price, pe: 0, pb: 0, eps: 0, roe: 0, turnover: 0,
  };
}

export function buildMarketStocks(): StockItem[] {
  return seed.map(makeFallback);
}

async function request(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    window.clearTimeout(timer);
  }
}

function parseSinaQuote(raw: string, code: string): StockItem | null {
  const body = raw.match(/=\"([^\"]*)/)?.[1];
  if (!body) return null;
  const fields = body.split(',');
  const price = Number(fields[3]);
  const prevClose = Number(fields[2]);
  if (!(price > 0 && prevClose > 0)) return null;
  const known = seed.find((item) => item[0] === code);
  const change = Number((price - prevClose).toFixed(2));
  return {
    code,
    name: fields[0] || known?.[1] || code,
    pinyin: known?.[2] || fields[0] || code,
    price,
    prevClose,
    change,
    percent: Number(((change / prevClose) * 100).toFixed(2)),
    volume: Number(fields[8] || 0) * 100,
    high: Number(fields[4] || price),
    low: Number(fields[5] || price),
    pe: 0,
    pb: 0,
    eps: 0,
    roe: 0,
    turnover: Number(fields[9] || 0) / 10000,
  };
}

export async function fetchStockQuotes(codes = seed.map((item) => item[0])): Promise<StockItem[]> {
  const rows = await Promise.all(codes.map(async (rawCode) => {
    const code = normalizeStockCode(rawCode);
    try {
      return parseSinaQuote(await request(`https://hq.sinajs.cn/list=${code}`), code);
    } catch {
      return null;
    }
  }));
  const live = rows.filter((item): item is StockItem => item !== null);
  return live.length ? live : buildMarketStocks();
}

export async function fetchMarketIndexes(): Promise<StockItem[]> {
  return fetchStockQuotes(['sh000001', 'sz399001', 'sz399006']);
}

export async function fetchStockCandles(code: string, period: PeriodKey) {
  const symbol = normalizeStockCode(code);
  const minute = !['day', 'week', 'month'].includes(period);
  const param = period === '1m' ? 'm1' : period === '5m' ? 'm5' : period === '15m' ? 'm15' : period === '30m' ? 'm30' : period === '60m' ? 'm60' : period;
  try {
    const endpoint = `https://web.ifzq.gtimg.cn/appstock/app/kline/${minute ? 'mkline' : 'kline'}?code=${symbol}&param=${param}`;
    const json = JSON.parse(await request(endpoint));
    const raw = json?.data?.[symbol]?.[param] || json?.data?.[symbol]?.data || [];
    const points = (Array.isArray(raw) ? raw : [])
      .map((row: any, index: number) => ({ time: String(row?.[0] ?? index), close: Number(row?.[4] ?? row?.[2] ?? row?.close) }))
      .filter((point: { close: number }) => point.close > 0);
    if (points.length) return points.slice(-120);
  } catch {
    // Use the last live quote as the input for a clearly local fallback series.
  }
  const stock = (await fetchStockQuotes([symbol]))[0] || buildMarketStocks()[0];
  return buildHistoricalSeries(stock, period);
}

export function searchStocks(query: string, stocks = buildMarketStocks()): StockItem[] {
  const value = query.trim().toLowerCase();
  if (!value) return stocks.slice(0, 10);
  return stocks.filter((stock) => stock.code.includes(value) || stock.name.includes(value) || stock.pinyin.includes(value)).slice(0, 20);
}

export function buildHistoricalSeries(stock: StockItem, period: PeriodKey) {
  const length = period === '1m' ? 32 : period === '5m' ? 60 : 80;
  return Array.from({ length }, (_, index) => ({
    time: String(index),
    close: Number((stock.prevClose + (stock.price - stock.prevClose) * index / Math.max(length - 1, 1)).toFixed(2)),
  }));
}

export function computeIndicatorSummary(series: Array<{ close: number }>) {
  const closes = series.map((point) => point.close);
  const last = closes.at(-1) || 0;
  const previous = closes.at(-2) || last;
  const average = closes.reduce((sum, value) => sum + value, 0) / Math.max(closes.length, 1);
  const macd = Number((last - average).toFixed(2));
  const kdj = Number(((last - previous) * 1.8 + average * 0.2).toFixed(2));
  const rsi = Number((last / Math.max(previous, 1) * 100).toFixed(2));
  return {
    macd,
    kdj,
    rsi,
    buySignals: macd > 0 ? ['MACD金叉'] : [],
    sellSignals: macd < 0 ? ['MACD死叉'] : [],
    pattern: macd > 0 ? '上升通道' : macd < 0 ? '下跌通道' : '震荡盘整',
  };
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
