import { useEffect, useMemo, useState } from 'react';
import { buildHistoricalSeries, buildMarketStocks, computeIndicatorSummary, fetchMarketIndexes, fetchStockCandles, fetchStockQuotesWithSource, searchStocks, type AlertRule, type PeriodKey, type StockItem } from './data/stocks';

type Tab = 'market' | 'favorites' | 'search' | 'trade' | 'settings';
type DataSource = 'sina' | 'tencent' | 'eastmoney' | 'fallback';

type Trade = {
  cash: number;
  holdings: { code: string; name: string; qty: number; avgPrice: number }[];
  history: { side: '买入' | '卖出'; name: string; qty: number; price: number; time: string }[];
};

const seed = buildMarketStocks();
const initialTrade: Trade = { cash: 5000000, holdings: [], history: [] };
const periods: Array<{ key: PeriodKey; label: string }> = [
  { key: '1m', label: '分时' },
  { key: '5m', label: '5分' },
  { key: '15m', label: '15分' },
  { key: '30m', label: '30分' },
  { key: '60m', label: '60分' },
  { key: '120m', label: '120分' },
  { key: 'day', label: '日K' },
  { key: 'week', label: '周K' },
  { key: 'month', label: '月K' },
  { key: 'year', label: '年K' }
];

const sourceLabels: Record<DataSource, string> = {
  sina: '新浪实时',
  tencent: '腾讯实时',
  eastmoney: '东方财富',
  fallback: '本地降级'
};

function App() {
  const [tab, setTab] = useState<Tab>('market');
  const [stocks, setStocks] = useState<StockItem[]>(seed);
  const [indexes, setIndexes] = useState<StockItem[]>([]);
  const [selectedCode, setSelectedCode] = useState('sh600519');
  const [period, setPeriod] = useState<PeriodKey>('day');
  const [series, setSeries] = useState<Array<{ close: number; time: string }>>([]);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>(() => JSON.parse(localStorage.getItem('stock-app:favorites') || '[]'));
  const [alerts, setAlerts] = useState<Record<string, AlertRule>>(() => JSON.parse(localStorage.getItem('stock-app:alerts') || '{}'));
  const [trade, setTrade] = useState<Trade>(() => JSON.parse(localStorage.getItem('stock-app:trade') || JSON.stringify(initialTrade)));
  const [source, setSource] = useState<DataSource>('fallback');
  const [loading, setLoading] = useState(true);
  const [voice, setVoice] = useState(true);

  const stock = useMemo(() => stocks.find(item => item.code === selectedCode) || stocks[0] || seed[0], [stocks, selectedCode]);
  const results = useMemo(() => searchStocks(query, stocks), [query, stocks]);
  const watchlist = useMemo(() => stocks.filter(item => favorites.includes(item.code)), [stocks, favorites]);
  const summary = useMemo(() => computeIndicatorSummary(series.length ? series : buildHistoricalSeries(stock, period)), [series, stock, period]);

  useEffect(() => {
    localStorage.setItem('stock-app:favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('stock-app:alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem('stock-app:trade', JSON.stringify(trade));
  }, [trade]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [quotes, market] = await Promise.all([fetchStockQuotesWithSource(), fetchMarketIndexes()]);
        if (cancelled) return;
        setStocks(quotes.stocks);
        setSource(quotes.source);
        setIndexes(market);
      } catch {
        if (!cancelled) {
          setStocks(seed);
          setSource('fallback');
          setIndexes(seed.slice(9));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSeries([]);
    fetchStockCandles(stock.code, period)
      .then(data => {
        if (!cancelled) setSeries(data || buildHistoricalSeries(stock, period));
      })
      .catch(() => {
        if (!cancelled) setSeries(buildHistoricalSeries(stock, period));
      });

    return () => {
      cancelled = true;
    };
  }, [stock.code, period]);

  useEffect(() => {
    watchlist.forEach(item => {
      const rule = alerts[item.code];
      const trigger = rule && (
        (rule.priceAbove !== undefined && item.price >= rule.priceAbove) ||
        (rule.priceBelow !== undefined && item.price <= rule.priceBelow) ||
        (rule.changeAbove !== undefined && item.percent >= rule.changeAbove) ||
        (rule.changeBelow !== undefined && item.percent <= rule.changeBelow)
      );

      if (trigger && !rule.lastTriggered) {
        const spoken = `${item.name} ${item.percent >= 0 ? '上涨' : '下跌'} ${Math.abs(item.percent).toFixed(2)}%, 当前价 ${item.price.toFixed(2)}`;
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('看盘股票预警', { body: spoken });
        }
        if (voice && 'speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(spoken);
          window.speechSynthesis.speak(utterance);
        }
        setAlerts(old => ({ ...old, [item.code]: { ...old[item.code], lastTriggered: true } }));
      }
    });
  }, [watchlist, alerts, voice]);

  const toggleFavorite = (code: string) => {
    setFavorites(old => old.includes(code) ? old.filter(item => item !== code) : [...old, code]);
  };

  const goStock = (code: string) => {
    setSelectedCode(code);
    setTab('market');
  };

  const buy = () => {
    const qty = 100;
    const cost = stock.price * qty + Math.max(5, stock.price * qty * 0.00025);
    if (trade.cash < cost) {
      alert('可用资金不足');
      return;
    }
    setTrade(old => {
      const existing = old.holdings.find(item => item.code === stock.code);
      const nextHoldings = existing
        ? old.holdings.map(item => item.code === stock.code ? { ...item, qty: item.qty + qty, avgPrice: ((item.avgPrice * item.qty) + (stock.price * qty)) / (item.qty + qty) } : item)
        : [...old.holdings, { code: stock.code, name: stock.name, qty, avgPrice: stock.price }];

      return {
        cash: old.cash - cost,
        holdings: nextHoldings,
        history: [{ side: '买入', name: stock.name, qty, price: stock.price, time: new Date().toLocaleString() }, ...old.history].slice(0, 20)
      };
    });
  };

  const sell = () => {
    const holding = trade.holdings.find(item => item.code === stock.code);
    if (!holding) {
      alert('当前没有该股票持仓');
      return;
    }
    const qty = Math.min(100, holding.qty);
    const amount = stock.price * qty - Math.max(5, stock.price * qty * 0.00025);
    setTrade(old => ({
      cash: old.cash + amount,
      holdings: old.holdings.filter(item => item.code !== stock.code).concat(
        qty < holding.qty ? [{ ...holding, qty: holding.qty - qty }] : []
      ),
      history: [{ side: '卖出', name: stock.name, qty, price: stock.price, time: new Date().toLocaleString() }, ...old.history].slice(0, 20)
    }));
  };

  const updateAlert = (code: string, key: 'priceAbove' | 'priceBelow', value: string) => {
    setAlerts(old => ({
      ...old,
      [code]: {
        ...old[code],
        [key]: value === '' ? undefined : Number(value),
        lastTriggered: false,
      }
    }));
  };

  const values = series.map(x => x.close);
  const min = Math.min(...values, stock.price * 0.94);
  const max = Math.max(...values, stock.price * 1.06);
  const path = values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${(index / Math.max(values.length - 1, 1)) * 340} ${220 - ((value - min) / Math.max(max - min, 1)) * 220}`).join(' ');

  const list = (items: StockItem[]) => (
    <div className="search-results">
      {items.map(item => (
        <div className="search-item" key={item.code} onClick={() => goStock(item.code)}>
          <div>
            <strong>{item.name}</strong>
            <small>{item.code}</small>
          </div>
          <div className="favorite-meta">
            <span>{item.price.toFixed(2)}</span>
            <span className={item.percent >= 0 ? 'up' : 'down'}>
              {item.percent >= 0 ? '+' : ''}{item.percent.toFixed(2)}%
            </span>
          </div>
          <button className="mini-button" onClick={e => { e.stopPropagation(); toggleFavorite(item.code); }}>
            {favorites.includes(item.code) ? '已关注' : '关注'}
          </button>
        </div>
      ))}
    </div>
  );

  const tradeValue = trade.holdings.reduce((sum, item) => {
    const live = stocks.find(x => x.code === item.code)?.price || item.avgPrice;
    return sum + live * item.qty;
  }, 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">看盘股票 Web 应用 · {sourceLabels[source]}</p>
          <h1>看盘股票</h1>
        </div>
        <span className="status-pill">{loading ? '同步中' : '在线'}</span>
      </header>

      <nav className="tabbar">
        {(['market', 'favorites', 'search', 'trade', 'settings'] as Tab[]).map(key => (
          <button className={tab === key ? 'tab active' : 'tab'} key={key} onClick={() => setTab(key)}>
            {key === 'market' ? '行情' : key === 'favorites' ? '���选' : key === 'search' ? '搜索' : key === 'trade' ? '交易' : '设置'}
          </button>
        ))}
      </nav>

      {tab === 'market' && (
        <main className="page">
          <section className="index-grid">
            {(indexes.length ? indexes : seed.slice(9)).map(item => (
              <div className="card index-card" key={item.code}>
                <span>{item.name}</span>
                <strong>{item.price.toFixed(2)}</strong>
                <small className={item.change >= 0 ? 'up' : 'down'}>
                  {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)} ({item.percent >= 0 ? '+' : ''}{item.percent.toFixed(2)}%)
                </small>
              </div>
            ))}
          </section>

          <section className="card section-card">
            <div className="section-header">
              <h2>今日行情</h2>
              <button className="ghost-button" onClick={() => setTab('search')}>搜索</button>
            </div>
            {list(stocks.slice(0, 6))}
          </section>

          <section className="card section-card">
            <div className="detail-header">
              <div>
                <small>{stock.code}</small>
                <h2>{stock.name}</h2>
              </div>
              <button className="mini-button" onClick={() => toggleFavorite(stock.code)}>
                {favorites.includes(stock.code) ? '已关注' : '关注'}
              </button>
            </div>

            <div className="price-strip">
              <strong>{stock.price.toFixed(2)}</strong>
              <span className={stock.change >= 0 ? 'up' : 'down'}>
                {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)} ({stock.percent >= 0 ? '+' : ''}{stock.percent.toFixed(2)}%)
              </span>
            </div>

            <div className="period-tabs">
              {periods.map(item => (
                <button className={period === item.key ? 'tab-chip active' : 'tab-chip'} key={item.key} onClick={() => setPeriod(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>

            <svg className="chart-svg" viewBox="0 0 340 220" preserveAspectRatio="none">
              <path d={path} fill="none" stroke="#f97316" strokeWidth="2.5" />
            </svg>

            <div className="signal-row">
              {summary.buySignals.map(item => <span className="signal-pill buy" key={item}>{item}</span>)}
              {summary.sellSignals.map(item => <span className="signal-pill sell" key={item}>{item}</span>)}
            </div>

            <div className="indicator-panel">
              <div className="metric-box">
                <span>MACD</span>
                <strong>{summary.macd.toFixed(2)}</strong>
              </div>
              <div className="metric-box">
                <span>形态</span>
                <strong>{summary.pattern}</strong>
              </div>
            </div>
          </section>
        </main>
      )}

      {tab === 'favorites' && (
        <main className="page">
          <section className="card section-card">
            <div className="section-header">
              <h2>自选股</h2>
              <button className="ghost-button" onClick={() => setTab('search')}>添加</button>
            </div>
            {watchlist.length ? list(watchlist) : <p className="empty-card">暂无自选股</p>}
          </section>
        </main>
      )}

      {tab === 'search' && (
        <main className="page">
          <section className="card section-card">
            <h2>搜索</h2>
            <input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="代码 / 名称 / 拼音" />
            {list(results)}
          </section>
        </main>
      )}

      {tab === 'trade' && (
        <main className="page">
          <section className="summary-grid">
            <div className="card summary-card">
              <span>可用资金</span>
              <strong>{trade.cash.toFixed(2)}</strong>
            </div>
            <div className="card summary-card">
              <span>持仓市值</span>
              <strong>{tradeValue.toFixed(2)}</strong>
            </div>
            <div className="card summary-card">
              <span>持仓成本</span>
              <strong>{trade.holdings.reduce((sum, item) => sum + item.avgPrice * item.qty, 0).toFixed(2)}</strong>
            </div>
          </section>

          <section className="card section-card">
            <div className="trade-stock">
              <div>
                <small>{stock.code}</small>
                <h2>{stock.name}</h2>
              </div>
              <div className="favorite-meta">
                <strong>{stock.price.toFixed(2)}</strong>
                <span className={stock.change >= 0 ? 'up' : 'down'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}</span>
              </div>
            </div>
            <div className="trade-panel">
              <button className="buy-button" onClick={buy}>买入 100 股</button>
              <button className="sell-button" onClick={sell}>卖出 100 股</button>
            </div>
          </section>

          <section className="card section-card">
            <h2>交易记录</h2>
            <div className="trade-history">
              {trade.history.length ? trade.history.map((row, index) => (
                <div className="history-row" key={`${row.time}-${index}`}>
                  <div>
                    <strong>{row.side}</strong>
                    <small>{row.name}</small>
                  </div>
                  <div className="favorite-meta">
                    <span>{row.qty}股</span>
                    <span>{row.price.toFixed(2)}</span>
                  </div>
                </div>
              )) : <p className="empty-card">暂无交易记录</p>}
            </div>
          </section>
        </main>
      )}

      {tab === 'settings' && (
        <main className="page">
          <section className="card section-card">
            <h2>设置</h2>
            <div className="settings-block">
              <div className="toggle-row">
                <span>语音播报</span>
                <input type="checkbox" checked={voice} onChange={() => setVoice(v => !v)} />
              </div>
              <button className="ghost-button" onClick={() => {
                if ('Notification' in window && Notification.permission === 'default') {
                  Notification.requestPermission();
                }
              }}>
                允许通知权限
              </button>
            </div>

            {watchlist.map(item => (
              <div className="card-inner alert-setting" key={item.code}>
                <strong>{item.name}</strong>
                <div className="alert-inputs">
                  <input type="number" defaultValue={alerts[item.code]?.priceAbove ?? ''} placeholder="价格高于" onBlur={e => updateAlert(item.code, 'priceAbove', e.target.value)} />
                  <input type="number" defaultValue={alerts[item.code]?.priceBelow ?? ''} placeholder="价格低于" onBlur={e => updateAlert(item.code, 'priceBelow', e.target.value)} />
                </div>
              </div>
            ))}
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
