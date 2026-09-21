import { useEffect, useMemo, useState } from 'react';
import { buildHistoricalSeries, buildMarketStocks, computeIndicatorSummary, fetchStockCandles, fetchStockQuotesWithSource, searchStocks, type AlertRule, type PeriodKey, type StockItem } from './data/stocks';

type Tab = 'market' | 'favorites' | 'search' | 'trade' | 'settings';
type Source = 'sina' | 'tencent' | 'fallback';
const periods: Array<{ key: PeriodKey; label: string }> = [{key:'1m',label:'分时'},{key:'5m',label:'5分'},{key:'15m',label:'15分'},{key:'30m',label:'30分'},{key:'60m',label:'60分'},{key:'120m',label:'120分'},{key:'day',label:'日K'},{key:'week',label:'周K'},{key:'month',label:'月K'},{key:'year',label:'年K'}];
const labels: Record<Tab,string> = {market:'行情',favorites:'自选',search:'搜索',trade:'交易',settings:'设置'};
const sourceLabels: Record<Source,string> = {sina:'新浪免费接口',tencent:'腾讯免费接口',fallback:'本地降级数据'};

function App() {
  const seed = useMemo(() => buildMarketStocks(), []);
  const [tab,setTab] = useState<Tab>('market');
  const [stocks,setStocks] = useState<StockItem[]>(seed);
  const [selected,setSelected] = useState('sh600519');
  const [period,setPeriod] = useState<PeriodKey>('day');
  const [series,setSeries] = useState<Array<{close:number;time:string}>>([]);
  const [query,setQuery] = useState('');
  const [favorites,setFavorites] = useState<string[]>(() => JSON.parse(localStorage.getItem('stock-app:favorites') || '[]'));
  const [alerts,setAlerts] = useState<Record<string,AlertRule>>(() => JSON.parse(localStorage.getItem('stock-app:alerts') || '{}'));
  const [source,setSource] = useState<Source>('fallback');
  const [loading,setLoading] = useState(true);
  const [voice,setVoice] = useState(true);
  const stock = useMemo(() => stocks.find(item => item.code === selected) || stocks[0], [stocks,selected]);
  const summary = useMemo(() => computeIndicatorSummary(series.length ? series : buildHistoricalSeries(stock,period)), [series,stock,period]);
  const results = useMemo(() => searchStocks(query,stocks), [query,stocks]);
  const watchlist = useMemo(() => stocks.filter(item => favorites.includes(item.code)), [stocks,favorites]);

  useEffect(() => { localStorage.setItem('stock-app:favorites',JSON.stringify(favorites)); },[favorites]);
  useEffect(() => { localStorage.setItem('stock-app:alerts',JSON.stringify(alerts)); },[alerts]);
  useEffect(() => {
    let cancelled=false;
    const refresh=async()=>{ const result=await fetchStockQuotesWithSource(); if(cancelled)return; setStocks(result.stocks); setSource(result.source); setLoading(false); };
    refresh().catch(()=>{if(!cancelled){setStocks(seed);setSource('fallback');setLoading(false);}});
    const timer=window.setInterval(refresh,30000); return()=>{cancelled=true;window.clearInterval(timer);};
  },[seed]);
  useEffect(() => { let cancelled=false; setSeries([]); fetchStockCandles(stock.code,period).then(data=>{if(!cancelled)setSeries(data);}).catch(()=>{if(!cancelled)setSeries(buildHistoricalSeries(stock,period));}); return()=>{cancelled=true;}; },[stock.code,period]);
  useEffect(() => {
    watchlist.forEach(item=>{ const rule=alerts[item.code]; const hit=rule && ((rule.priceAbove !== undefined && item.price >= rule.priceAbove)||(rule.priceBelow !== undefined && item.price <= rule.priceBelow)||(rule.changeAbove !== undefined && item.percent >= rule.changeAbove)||(rule.changeBelow !== undefined && item.percent <= rule.changeBelow));
      if(hit && !rule.lastTriggered){const text=`${item.name}${item.percent>=0?'上涨':'下跌'}${Math.abs(item.percent).toFixed(2)}%，现价${item.price.toFixed(2)}`; if('Notification' in window && Notification.permission==='granted')new Notification('A股预警',{body:text}); if(voice && 'speechSynthesis' in window)window.speechSynthesis.speak(new SpeechSynthesisUtterance(text)); setAlerts(old=>({...old,[item.code]:{...old[item.code],lastTriggered:true}}));}
    });
  },[watchlist,alerts,voice]);
  const toggle=(code:string)=>setFavorites(old=>old.includes(code)?old.filter(x=>x!==code):[...old,code]);
  const choose=(code:string)=>{setSelected(code);setTab('market');};
  const updateAlert=(code:string,key:'priceAbove'|'priceBelow',value:string)=>setAlerts(old=>({...old,[code]:{...old[code], [key]:value?Number(value):undefined,lastTriggered:false}}));
  const values=series.map(x=>x.close); const min=Math.min(...values,stock.price*.94); const max=Math.max(...values,stock.price*1.06); const path=values.map((value,i)=>`${i?'L':'M'} ${(i/Math.max(values.length-1,1))*340} ${220-((value-min)/Math.max(max-min,1))*220}`).join(' ');
  const list=(items:StockItem[]) => <div className="search-results">{items.map(item=><div className="search-item" key={item.code} onClick={()=>choose(item.code)}><div><strong>{item.name}</strong><small>{item.code}</small></div><div><span>{item.price.toFixed(2)}</span><span className={item.percent>=0?'up':'down'}>{item.percent>=0?'+':''}{item.percent.toFixed(2)}%</span></div><button className="mini-button" onClick={e=>{e.stopPropagation();toggle(item.code);}}>{favorites.includes(item.code)?'已加':'自选'}</button></div>)}</div>;
  return <div className="app-shell"><header className="topbar"><div><p className="eyebrow">A股专业股票分析平台 · {sourceLabels[source]}</p><h1>智能行情助手</h1></div><span className="status-pill">{loading?'同步中':sourceLabels[source]}</span></header><nav className="tabbar">{(Object.keys(labels) as Tab[]).map(key=><button className={tab===key?'tab active':'tab'} key={key} onClick={()=>setTab(key)}>{labels[key]}</button>)}</nav>
    {tab==='market'&&<main className="page"><section className="index-grid">{stocks.filter(x=>x.code.includes('000001')||x.code.includes('399001')||x.code.includes('399006')).map(item=><div className="card index-card" key={item.code}><span>{item.name}</span><strong>{item.price.toFixed(2)}</strong><small className={item.change>=0?'up':'down'}>{item.change>=0?'+':''}{item.change.toFixed(2)} ({item.percent.toFixed(2)}%)</small></div>)}</section><section className="card section-card"><h2>市场排行</h2>{list([...stocks].sort((a,b)=>b.percent-a.percent).slice(0,8))}</section><section className="card section-card"><div className="detail-header"><div><small>{stock.code}</small><h2>{stock.name}</h2></div><button className="mini-button" onClick={()=>toggle(stock.code)}>{favorites.includes(stock.code)?'已关注':'关注'}</button></div><div className="price-strip"><strong>{stock.price.toFixed(2)}</strong><span className={stock.change>=0?'up':'down'}>{stock.change>=0?'+':''}{stock.change.toFixed(2)} ({stock.percent>=0?'+':''}{stock.percent.toFixed(2)}%)</span></div><div className="period-tabs">{periods.map(item=><button className={period===item.key?'tab-chip active':'tab-chip'} key={item.key} onClick={()=>setPeriod(item.key)}>{item.label}</button>)}</div><svg viewBox="0 0 340 220" className="chart-svg"><path d={path} fill="none" stroke="#f97316" strokeWidth="2.5"/></svg><div className="signal-row">{summary.buySignals.map(x=><span className="signal-pill buy" key={x}>{x}</span>)}{summary.sellSignals.map(x=><span className="signal-pill sell" key={x}>{x}</span>)}</div><div className="indicator-panel"><div className="metric-box"><span>MACD</span><strong>{summary.macd.toFixed(2)}</strong></div><div className="metric-box"><span>形态判断</span><strong>{summary.pattern}</strong></div></div></section></main>}
    {tab==='favorites'&&<main className="page"><section className="card section-card"><div className="section-header"><h2>自选股</h2><button className="ghost-button" onClick={()=>setTab('search')}>添加</button></div>{watchlist.length?list(watchlist):<p className="empty-card">暂无自选股</p>}</section></main>}
    {tab==='search'&&<main className="page"><section className="card section-card"><h2>免费行情搜索</h2><input className="search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="代码 / 名称 / 拼音"/>{list(results)}</section></main>}
    {tab==='trade'&&<main className="page"><section className="card section-card"><h2>模拟交易</h2><p>当前标的：{stock.name}，价格：{stock.price.toFixed(2)}</p><p>模拟账户初始资金：5000000 元</p><p className="empty-card">交易模块保持本地模拟，不连接真实券商。</p></section></main>}
    {tab==='settings'&&<main className="page"><section className="card section-card"><h2>设置与预警</h2><label className="toggle-row"><span>语音播报</span><input type="checkbox" checked={voice} onChange={()=>setVoice(!voice)}/></label><button className="ghost-button" onClick={()=>'Notification' in window&&Notification.requestPermission()}>请求通知权限</button>{watchlist.map(item=><div className="card-inner alert-setting" key={item.code}><strong>{item.name}</strong><div className="alert-inputs"><input type="number" placeholder="价格高于" defaultValue={alerts[item.code]?.priceAbove||''} onBlur={e=>updateAlert(item.code,'priceAbove',e.target.value)}/><input type="number" placeholder="价格低于" defaultValue={alerts[item.code]?.priceBelow||''} onBlur={e=>updateAlert(item.code,'priceBelow',e.target.value)}/></div></div>)}</section></main>}
  </div>;
}
export default App;
