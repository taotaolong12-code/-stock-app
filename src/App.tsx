import { useEffect, useMemo, useState } from 'react';
import { buildHistoricalSeries, buildMarketStocks, computeIndicatorSummary, formatMoney, type AlertRule, type PeriodKey, type StockItem } from './data/stocks';

type AppTab = 'market' | 'favorites' | 'search' | 'trade' | 'settings';

type AlertMap = Record<string, AlertRule>;

type TradeHolding = {
  code: string;
  name: string;
  qty: number;
  avgPrice: number;
};

type TradeState = {
  cash: number;
  holdings: TradeHolding[];
  history: Array<{ code: string; name: string; side: 'buy' | 'sell'; qty: number; price: number; time: string }>;
};

type VoicePrefs = {
  enabled: boolean;
  rate: number;
  pitch: number;
};

const tabs: { key: AppTab; label: string }[] = [
  { key: 'market', label: '行情' },
  { key: 'favorites', label: '自选' },
  { key: 'search', label: '搜索' },
  { key: 'trade', label: '交易' },
  { key: 'settings', label: '设置' },
];

const defaultSettings: VoicePrefs = { enabled: true, rate: 1, pitch: 1 };

const defaultTradeState: TradeState = {
  cash: 5000000,
  holdings: [],
  history: [],
};

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('market');
  const [selectedCode, setSelectedCode] = useState('600519');
  const [searchText, setSearchText] = useState('');
  const [detailPeriod, setDetailPeriod] = useState<PeriodKey>('day');
  const [indicatorTab, setIndicatorTab] = useState<'macd' | 'kdj' | 'rsi'>('macd');
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(defaultSettings);
  const [alerts, setAlerts] = useState<AlertMap>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [tradeState, setTradeState] = useState<TradeState>(defaultTradeState);
  const [marketStocks, setMarketStocks] = useState<StockItem[]>(() => buildMarketStocks());
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const currentStock = useMemo(
    () => marketStocks.find((stock) => stock.code === selectedCode) ?? marketStocks[0],
    [marketStocks, selectedCode]
  );

  const favoriteStocks = useMemo(
    () => marketStocks.filter((stock) => favorites.includes(stock.code)),
    [favorites, marketStocks]
  );

  const searchResults = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return marketStocks.slice(0, 8);
    return marketStocks.filter((stock) =>
      stock.code.toLowerCase().includes(q) ||
      stock.name.toLowerCase().includes(q) ||
      stock.pinyin.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [marketStocks, searchText]);

  const detailSeries = useMemo(() => buildHistoricalSeries(currentStock, detailPeriod), [currentStock, detailPeriod]);
  const indicatorSummary = useMemo(() => computeIndicatorSummary(detailSeries), [detailSeries]);

  useEffect(() => {
    const savedFavorites = localStorage.getItem('stock-app:favorites');
    const savedAlerts = localStorage.getItem('stock-app:alerts');
    const savedTrade = localStorage.getItem('stock-app:trade');
    const savedVoice = localStorage.getItem('stock-app:voice');

    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));
    if (savedAlerts) setAlerts(JSON.parse(savedAlerts));
    if (savedTrade) setTradeState(JSON.parse(savedTrade));
    if (savedVoice) setVoicePrefs({ ...defaultSettings, ...JSON.parse(savedVoice) });
  }, []);

  useEffect(() => {
    localStorage.setItem('stock-app:favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('stock-app:alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    localStorage.setItem('stock-app:trade', JSON.stringify(tradeState));
  }, [tradeState]);

  useEffect(() => {
    localStorage.setItem('stock-app:voice', JSON.stringify(voicePrefs));
  }, [voicePrefs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMarketStocks((prev) => prev.map((stock) => {
        const drift = (Math.random() - 0.45) * stock.price * 0.02;
        const nextPrice = Number((stock.price + drift).toFixed(2));
        const delta = Number((nextPrice - stock.prevClose).toFixed(2));
        const changePercent = Number(((delta / stock.prevClose) * 100).toFixed(2));

        return {
          ...stock,
          price: nextPrice,
          change: delta,
          percent: changePercent,
          high: Math.max(stock.high, nextPrice),
          low: Math.min(stock.low, nextPrice),
          volume: stock.volume + (Math.random() * 900000 + 50000),
        };
      }));
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall as EventListener);
  }, []);

  useEffect(() => {
    favoriteStocks.forEach((stock) => {
      const rule = alerts[stock.code];
      if (!rule) return;

      const triggered =
        (typeof rule.priceAbove === 'number' && stock.price >= rule.priceAbove) ||
        (typeof rule.priceBelow === 'number' && stock.price <= rule.priceBelow) ||
        (typeof rule.changeAbove === 'number' && stock.percent >= rule.changeAbove) ||
        (typeof rule.changeBelow === 'number' && stock.percent <= rule.changeBelow);

      if (triggered && !rule.lastTriggered) {
        const detail = `股票 ${stock.name} ${stock.percent >= 0 ? '上涨' : '下跌'} ${Math.abs(stock.percent).toFixed(2)}%，当前价 ${stock.price.toFixed(2)}`;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('A股预警', { body: detail });
        }

        if (voicePrefs.enabled && 'speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(detail);
          utterance.rate = voicePrefs.rate;
          utterance.pitch = voicePrefs.pitch;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        }

        setAlerts((prev) => ({
          ...prev,
          [stock.code]: { ...prev[stock.code], lastTriggered: true },
        }));
      }

      const recovered =
        (typeof rule.priceAbove === 'number' && stock.price < rule.priceAbove * 0.995) ||
        (typeof rule.priceBelow === 'number' && stock.price > rule.priceBelow * 1.005) ||
        (typeof rule.changeAbove === 'number' && stock.percent < rule.changeAbove * 0.9) ||
        (typeof rule.changeBelow === 'number' && stock.percent > rule.changeBelow * -0.9);

      if (rule.lastTriggered && recovered) {
        setAlerts((prev) => ({
          ...prev,
          [stock.code]: { ...prev[stock.code], lastTriggered: false },
        }));
      }
    });
  }, [alerts, favoriteStocks, voicePrefs]);

  const indexCards = [
    { name: '上证指数', value: 3112.86, change: 18.4, percent: 0.59 },
    { name: '深证成指', value: 10061.12, change: -52.1, percent: -0.51 },
    { name: '创业板指', value: 2087.29, change: 26.1, percent: 1.27 },
  ];

  const topGainers = [...marketStocks].sort((a, b) => b.percent - a.percent).slice(0, 5);
  const topLosers = [...marketStocks].sort((a, b) => a.percent - b.percent).slice(0, 5);
  const hotBoards = [
    { name: '半导体', change: 2.95 },
    { name: '人工智能', change: 1.92 },
    { name: '电池材料', change: -1.38 },
  ];

  const toggleFavorite = (code: string) => {
    setFavorites((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  };

  const addAlert = (code: string, nextRule: Partial<AlertRule>) => {
    setAlerts((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] ?? {}),
        ...nextRule,
        lastTriggered: false,
      },
    }));
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const buyTrade = () => {
    if (!currentStock) return;
    const qty = 100;
    const cost = qty * currentStock.price * 1.00025 + 5;
    if (tradeState.cash < cost) {
      alert('可用资金不足，无法完成买入。');
      return;
    }

    setTradeState((prev) => {
      const nextCash = prev.cash - cost;
      const existing = prev.holdings.find((h) => h.code === currentStock.code);
      const holding = existing
        ? { ...existing, qty: existing.qty + qty, avgPrice: (existing.avgPrice * existing.qty + currentStock.price * qty) / (existing.qty + qty) }
        : { code: currentStock.code, name: currentStock.name, qty, avgPrice: currentStock.price };

      const nextHoldings = existing
        ? prev.holdings.map((h) => (h.code === currentStock.code ? holding : h))
        : [...prev.holdings, holding];

      return {
        cash: nextCash,
        holdings: nextHoldings,
        history: [{ code: currentStock.code, name: currentStock.name, side: 'buy', qty, price: currentStock.price, time: new Date().toLocaleTimeString() }, ...prev.history].slice(0, 10),
      };
    });
  };

  const sellTrade = () => {
    if (!currentStock) return;
    const holding = tradeState.holdings.find((h) => h.code === currentStock.code);
    if (!holding || holding.qty <= 0) {
      alert('当前持仓不足，无法卖出。');
      return;
    }

    const qty = Math.min(100, holding.qty);
    const amount = qty * currentStock.price * 0.9985 - 5;
    setTradeState((prev) => ({
      cash: prev.cash + amount,
      holdings: prev.holdings
        .map((h) => h.code === currentStock.code ? { ...h, qty: h.qty - qty } : h)
        .filter((h) => h.qty > 0),
      history: [{ code: currentStock.code, name: currentStock.name, side: 'sell', qty, price: currentStock.price, time: new Date().toLocaleTimeString() }, ...prev.history].slice(0, 10),
    }));
  };

  const totalHoldingValue = tradeState.holdings.reduce((sum, holding) => {
    const stock = marketStocks.find((item) => item.code === holding.code);
    return sum + (stock ? stock.price * holding.qty : 0);
  }, 0);

  const totalAsset = tradeState.cash + totalHoldingValue;
  const profit = totalHoldingValue - tradeState.holdings.reduce((sum, holding) => sum + holding.avgPrice * holding.qty, 0);

  const feed = currentStock ? buildHistoricalSeries(currentStock, detailPeriod) : [];
  const chartWidth = 340;
  const chartHeight = 220;
  const values = feed.map((item) => item.close);
  const minValue = Math.min(...values, currentStock.price * 0.94);
  const maxValue = Math.max(...values, currentStock.price * 1.06);
  const linePath = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * chartWidth;
      const y = chartHeight - ((value - minValue) / (maxValue - minValue || 1)) * chartHeight;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const installApp = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const signalSummary = indicatorSummary;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">A股专业股票分析平台</p>
          <h1>智能行情助手</h1>
        </div>
        <button className="ghost-button" onClick={installApp}>安装应用</button>
      </header>

      <nav className="tabbar" aria-label="主导航">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'market' && (
        <main className="page market-page">
          <section className="index-grid">
            {indexCards.map((card) => (
              <div key={card.name} className="card index-card">
                <span>{card.name}</span>
                <strong>{card.value.toFixed(2)}</strong>
                <small className={card.change >= 0 ? 'up' : 'down'}>
                  {card.change >= 0 ? '+' : ''}{card.change.toFixed(2)} ({card.percent >= 0 ? '+' : ''}{card.percent.toFixed(2)}%)
                </small>
              </div>
            ))}
          </section>

          <section className="card section-card">
            <div className="section-header">
              <h2>涨跌排行</h2>
            </div>
            <div className="two-column">
              <div>
                <h3>涨幅榜</h3>
                {topGainers.map((stock) => (
                  <button key={stock.code} className="rank-row" onClick={() => { setSelectedCode(stock.code); setActiveTab('search'); }}>
                    <span>{stock.name}</span>
                    <span className="up">+{stock.percent.toFixed(2)}%</span>
                  </button>
                ))}
              </div>
              <div>
                <h3>跌幅榜</h3>
                {topLosers.map((stock) => (
                  <button key={stock.code} className="rank-row" onClick={() => { setSelectedCode(stock.code); setActiveTab('search'); }}>
                    <span>{stock.name}</span>
                    <span className="down">{stock.percent.toFixed(2)}%</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="card section-card">
            <div className="section-header">
              <h2>板块热点</h2>
            </div>
            <div className="sector-list">
              {hotBoards.map((board) => (
                <div key={board.name} className="sector-item">
                  <span>{board.name}</span>
                  <span className={board.change >= 0 ? 'up' : 'down'}>{board.change >= 0 ? '+' : ''}{board.change.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {activeTab === 'favorites' && (
        <main className="page">
          <section className="card section-card">
            <div className="section-header">
              <h2>自选股列表</h2>
              <button className="ghost-button" onClick={() => setActiveTab('search')}>添加股票</button>
            </div>
            <div className="favorites-list">
              {favoriteStocks.length === 0 && <p className="empty-card">暂无自选股，请在搜索页添加。</p>}
              {favoriteStocks.map((stock) => (
                <div key={stock.code} className="favorite-item" onClick={() => setSelectedCode(stock.code)}>
                  <div>
                    <strong>{stock.name}</strong>
                    <small>{stock.code}</small>
                  </div>
                  <div className="favorite-meta">
                    <span>{stock.price.toFixed(2)}</span>
                    <span className={stock.percent >= 0 ? 'up' : 'down'}>{stock.percent >= 0 ? '+' : ''}{stock.percent.toFixed(2)}%</span>
                  </div>
                  <button className="mini-button" onClick={(event) => { event.stopPropagation(); toggleFavorite(stock.code); }}>移除</button>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {activeTab === 'search' && (
        <main className="page">
          <section className="card section-card">
            <div className="section-header">
              <h2>股票搜索</h2>
            </div>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索代码 / 名称 / 拼音"
              className="search-input"
            />
            <div className="search-results">
              {searchResults.map((stock) => (
                <button key={stock.code} className="search-item" onClick={() => { setSelectedCode(stock.code); setActiveTab('market'); }}>
                  <div>
                    <strong>{stock.name}</strong>
                    <small>{stock.code}</small>
                  </div>
                  <div>
                    <span>{stock.price.toFixed(2)}</span>
                    <span className={stock.percent >= 0 ? 'up' : 'down'}>{stock.percent >= 0 ? '+' : ''}{stock.percent.toFixed(2)}%</span>
                  </div>
                  <button className="mini-button" onClick={(event) => { event.stopPropagation(); toggleFavorite(stock.code); }}>
                    {favorites.includes(stock.code) ? '已加' : '自选'}
                  </button>
                </button>
              ))}
            </div>
          </section>
        </main>
      )}

      {activeTab === 'trade' && (
        <main className="page">
          <section className="summary-grid">
            <div className="card summary-card">
              <span>可用资金</span>
              <strong>{tradeState.cash.toFixed(2)}</strong>
            </div>
            <div className="card summary-card">
              <span>总资产</span>
              <strong>{totalAsset.toFixed(2)}</strong>
            </div>
            <div className="card summary-card">
              <span>持仓盈亏</span>
              <strong className={profit >= 0 ? 'up' : 'down'}>{profit >= 0 ? '+' : ''}{profit.toFixed(2)}</strong>
            </div>
          </section>

          <section className="card section-card">
            <div className="section-header">
              <h2>模拟交易</h2>
            </div>
            {currentStock && (
              <div className="trade-panel">
                <div className="trade-stock">
                  <strong>{currentStock.name}</strong>
                  <span>{currentStock.code}</span>
                  <em>{currentStock.price.toFixed(2)}</em>
                </div>
                <div className="trade-actions">
                  <button onClick={buyTrade} className="buy-button">买入</button>
                  <button onClick={sellTrade} className="sell-button">卖出</button>
                </div>
              </div>
            )}

            <div className="trade-history">
              {tradeState.history.length === 0 && <p className="empty-card">暂无交易记录。</p>}
              {tradeState.history.map((item, index) => (
                <div key={`${item.code}-${item.time}-${index}`} className="history-row">
                  <span>{item.side === 'buy' ? '买入' : '卖出'}</span>
                  <span>{item.name}</span>
                  <span>{item.qty}股</span>
                  <span>{item.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {activeTab === 'settings' && (
        <main className="page">
          <section className="card section-card">
            <div className="section-header">
              <h2>预警与设置</h2>
            </div>

            <div className="settings-block">
              <label className="toggle-row">
                <span>语音播报</span>
                <input type="checkbox" checked={voicePrefs.enabled} onChange={() => setVoicePrefs((prev) => ({ ...prev, enabled: !prev.enabled }))} />
              </label>
              <label className="slider-row">
                <span>语速</span>
                <input type="range" min="0.5" max="1.5" step="0.1" value={voicePrefs.rate} onChange={(e) => setVoicePrefs((prev) => ({ ...prev, rate: Number(e.target.value) }))} />
              </label>
              <label className="slider-row">
                <span>音调</span>
                <input type="range" min="0.5" max="2" step="0.1" value={voicePrefs.pitch} onChange={(e) => setVoicePrefs((prev) => ({ ...prev, pitch: Number(e.target.value) }))} />
              </label>
            </div>

            <div className="settings-block">
              <button className="ghost-button" onClick={requestNotificationPermission}>通知授权</button>
              <button className="ghost-button" onClick={() => setActiveTab('favorites')}>管理预警规则</button>
            </div>

            {favoriteStocks.map((stock) => {
              const rule = alerts[stock.code] ?? { lastTriggered: false };
              return (
                <div key={stock.code} className="alert-setting card-inner">
                  <div>
                    <strong>{stock.name}</strong>
                    <small>{stock.code}</small>
                  </div>
                  <div className="alert-inputs">
                    <input type="number" placeholder="价格高于" defaultValue={rule.priceAbove ?? ''} onBlur={(event) => addAlert(stock.code, { priceAbove: event.target.value ? Number(event.target.value) : undefined })} />
                    <input type="number" placeholder="价格低于" defaultValue={rule.priceBelow ?? ''} onBlur={(event) => addAlert(stock.code, { priceBelow: event.target.value ? Number(event.target.value) : undefined })} />
                    <input type="number" placeholder="涨幅超" defaultValue={rule.changeAbove ?? ''} onBlur={(event) => addAlert(stock.code, { changeAbove: event.target.value ? Number(event.target.value) : undefined })} />
                    <input type="number" placeholder="跌幅超" defaultValue={rule.changeBelow ?? ''} onBlur={(event) => addAlert(stock.code, { changeBelow: event.target.value ? Number(event.target.value) : undefined })} />
                  </div>
                  <span className="status-pill">{rule.lastTriggered ? '已触发' : '待触发'}</span>
                </div>
              );
            })}
          </section>
        </main>
      )}

      {!['market','favorites','search','trade','settings'].includes(activeTab as string) && (
        <main className="page detail-page">
          <section className="card section-card">
            <div className="detail-header">
              <div>
                <p>{currentStock.code}</p>
                <h2>{currentStock.name}</h2>
              </div>
              <button className="mini-button" onClick={() => toggleFavorite(currentStock.code)}>{favorites.includes(currentStock.code) ? '已关注' : '关注'}</button>
            </div>

            <div className="price-strip">
              <strong>{currentStock.price.toFixed(2)}</strong>
              <span className={currentStock.change >= 0 ? 'up' : 'down'}>
                {currentStock.change >= 0 ? '+' : ''}{currentStock.change.toFixed(2)}
                ({currentStock.percent >= 0 ? '+' : ''}{currentStock.percent.toFixed(2)}%)
              </span>
            </div>

            <div className="period-tabs">
              {(['1m','5m','15m','30m','60m','day','week','month'] as PeriodKey[]).map((period) => (
                <button key={period} className={detailPeriod === period ? 'tab-chip active' : 'tab-chip'} onClick={() => setDetailPeriod(period)}>
                  {period === '1m' ? '分时' : period === 'day' ? '日K' : period === 'week' ? '周K' : period === 'month' ? '月K' : `${period}分`}
                </button>
              ))}
            </div>

            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="chart-svg">
              <path d={linePath} fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
            </svg>

            <div className="signal-row">
              {signalSummary.buySignals.map((signal) => (
                <span key={signal} className="signal-pill buy">{signal}</span>
              ))}
              {signalSummary.sellSignals.map((signal) => (
                <span key={signal} className="signal-pill sell">{signal}</span>
              ))}
            </div>

            <div className="indicator-tabs">
              <button className={indicatorTab === 'macd' ? 'tab-chip active' : 'tab-chip'} onClick={() => setIndicatorTab('macd')}>MACD</button>
              <button className={indicatorTab === 'kdj' ? 'tab-chip active' : 'tab-chip'} onClick={() => setIndicatorTab('kdj')}>KDJ</button>
              <button className={indicatorTab === 'rsi' ? 'tab-chip active' : 'tab-chip'} onClick={() => setIndicatorTab('rsi')}>RSI</button>
            </div>

            <div className="indicator-panel">
              <div className="metric-box">
                <span>{indicatorTab.toUpperCase()} 值</span>
                <strong>{signalSummary[indicatorTab].toFixed(2)}</strong>
              </div>
              <div className="metric-box">
                <span>形态识别</span>
                <strong>{signalSummary.pattern}</strong>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
