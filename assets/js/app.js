const KEY='cc_compact_goals_v4';
const LEGACY_KEYS=['cc_compact_goals_v3','cc_simple_rebate_v2','cc_rebate_calculator_v1'];

function uid(){
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random());
}
function localDateStr(){
  const d=new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function localMonthStr(){return localDateStr().slice(0,7)}
function esc(s=''){
  return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function money(n){
  return '$'+Number(n||0).toLocaleString('en-HK',{minimumFractionDigits:0,maximumFractionDigits:2});
}
function capRate(t){return Math.max(0,Number(t?.rebateRate||0))}
function capAmounts(t){
  const rate=capRate(t),enabled=!!t?.capEnabled,amount=Math.max(0,Number(t?.capAmount||0));
  let spend=0,reward=0;
  if(enabled&&amount>0){
    if(t.capType==='reward'){reward=amount;spend=rate>0?reward/(rate/100):0}
    else if(t.capType==='spend'){spend=amount;reward=rate>0?spend*(rate/100):0}
  }
  return {spend,reward,rate};
}
function capInputValue(n){
  const x=Math.max(0,Number(n||0));if(!x)return '';
  return Number(x.toFixed(2)).toString();
}
function linkedCapSummary(t){
  const {spend,reward,rate}=capAmounts(t);
  if(!t?.capEnabled||(!spend&&!reward))return '';
  if(spend>0&&reward>0)return `達標簽賬上限 ${money(spend)} (回贈上限 ${money(reward)})`;
  if(t.capType==='spend'&&spend>0)return `達標簽賬上限 ${money(spend)}${rate<=0?'（未能換算回贈上限）':''}`;
  if(t.capType==='reward'&&reward>0)return `回贈上限 ${money(reward)}${rate<=0?'（未能換算簽賬上限）':''}`;
  return '';
}
function linkedCapFields(t,compact=false){
  const {spend,reward,rate}=capAmounts(t);
  const rateText=rate>0?`${Number(rate.toFixed(2))}%`:'尚未設定回贈率';
  const inputClass=compact?'':' wizard-name-input';
  return `<div class="linked-cap-fields ui-expandable" data-linked-cap-id="${t.id}"><div class="linked-cap-field"><label>簽賬上限 HK$</label><input class="${inputClass.trim()}" data-cap-link="spend" type="number" min="0" step="0.01" value="${capInputValue(spend)}" placeholder="例如 125000" oninput="syncLinkedCapInput(this,'${t.id}','spend')"></div><div class="linked-cap-field"><label>回贈上限 HK$</label><input class="${inputClass.trim()}" data-cap-link="reward" type="number" min="0" step="0.01" value="${capInputValue(reward)}" placeholder="例如 5000" oninput="syncLinkedCapInput(this,'${t.id}','reward')"></div><div class="linked-cap-hint">按回贈率 <b>${rateText}</b> 自動雙向換算；輸入任何一邊，另一邊會即時更新。</div></div>`;
}
function pct(a,b){return b ? Math.min(100,Math.max(0,Number(a)/Number(b)*100)) : 0}
function addDays(dateStr,days){
  const d=new Date(dateStr+'T00:00:00');
  d.setDate(d.getDate()+Math.max(1,Number(days)||1)-1);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function daysLeft(endStr){
  const a=new Date(localDateStr()+'T00:00:00');
  const b=new Date(endStr+'T00:00:00');
  return Math.max(0,Math.ceil((b-a)/86400000));
}
function monthEnd(month){
  const [y,m]=month.split('-').map(Number);
  const d=new Date(y,m,0);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function normalizeCardName(name=''){
  return String(name).trim().toLocaleLowerCase('zh-HK').replace(/\s+/g,' ');
}
let appNoticeTimer=null,appConfirmCallback=null;
function showNotice(message,type='error'){
  const el=document.getElementById('appNotice');if(!el)return;
  el.textContent=String(message||'');el.className=`app-notice ${type==='success'?'success':type==='warn'?'warn':''}`.trim();
  requestAnimationFrame(()=>el.classList.add('show'));clearTimeout(appNoticeTimer);
  appNoticeTimer=setTimeout(()=>el.classList.remove('show'),3000);
}
function askConfirm(message,onConfirm,title='確認操作'){
  const layer=document.getElementById('appConfirm'),msg=document.getElementById('appConfirmMessage'),ttl=document.getElementById('appConfirmTitle');if(!layer)return;
  if(msg)msg.textContent=String(message||'');if(ttl)ttl.textContent=title;appConfirmCallback=typeof onConfirm==='function'?onConfirm:null;
  layer.classList.add('show');layer.setAttribute('aria-hidden','false');document.getElementById('appConfirmCancel')?.focus();
}
function closeAppConfirm(){const layer=document.getElementById('appConfirm');layer?.classList.remove('show');layer?.setAttribute('aria-hidden','true');appConfirmCallback=null}
document.getElementById('appConfirmCancel')?.addEventListener('click',closeAppConfirm);
document.getElementById('appConfirmOk')?.addEventListener('click',()=>{const cb=appConfirmCallback;closeAppConfirm();cb?.()});
document.getElementById('appConfirm')?.addEventListener('click',e=>{if(e.target.id==='appConfirm')closeAppConfirm()});

function defaultTarget(type='rebate'){
  const isWelcome=type==='welcome';
  return {
    id:uid(),cardKey:uid(),name:'',targetType:isWelcome?'welcome':'rebate',
    offerTitle:'',mechanic:isWelcome?'milestone':'standard',
    eligibilityMode:'all',rebateCategories:[],minTransaction:0,minTransactionEnabled:false,
    periodType:isWelcome?'approval_window':'monthly',startDate:'',endDate:'',resetRule:isWelcome?'none':'period',
    rebateRate:0,spendRequirement:1500,spendCap:0,capEnabled:false,capType:'none',capAmount:0,
    tiers:[{threshold:0,rate:0.56,rewardType:'現金回贈',reward:0,rewardMode:'rate'},{threshold:15000,rate:1.2,rewardType:'現金回贈',reward:0,rewardMode:'rate'}],
    thresholdRewardMode:'rate',thresholdRewardCategories:[],
    milestones:isWelcome?[{threshold:12000,rewardType:'現金回贈',reward:1000,startDate:'',endDate:''}]:[{threshold:8000,rewardType:'現金回贈',reward:600,startDate:'',endDate:''}],
    milestoneDateMode:'cumulative',milestoneBonusEnabled:false,milestoneBonusSpend:0,milestoneBonusType:'現金回贈',milestoneBonus:0,
    recurringThreshold:800,recurringRewardType:'現金回贈',recurringReward:100,completionBonusType:'現金回贈',completionBonus:100,
    stampEarnMode:'per_txn',stampTransactionMin:500,stampsPerTxn:1,stampDailyCapEnabled:false,stampDailyCap:1,stampMode:'stages',stampRepeatEvery:5,stampRepeatRewardType:'現金回贈',stampRepeatReward:50,stampCap:0,stampRewardCap:0,stampMilestones:[{count:3,rewardType:'現金回贈',reward:50},{count:6,rewardType:'現金回贈',reward:100}],
    approvalDate:'',welcomeDays:90,welcomeRequirement:12000,welcomeRewardType:'現金回贈',welcomeReward:1000,
    rebateEndDate:'',createdAt:Date.now()
  };
}
function cleanRewardType(v='現金回贈'){if(v==='禮品')v='禮物';return ['現金回贈','飛行里數','積分','獎賞錢','禮物','自訂獎賞'].includes(v)?v:'現金回贈'}
function isTextRewardType(type){return type==='禮物'||type==='自訂獎賞'}
function normalizeRewardValue(type,value){return isTextRewardType(type)?String(value??'').trim():Math.max(0,Number(value||0))}
function hasRewardValue(type,value){return isTextRewardType(type)?String(value??'').trim().length>0:Number(value||0)>0}
function tierRewardInput(type,value){
  if(isTextRewardType(type))return `<input data-tier-reward type="text" value="${esc(String(value??''))}" placeholder="可輸入中文或英文，例如：咖啡券 Coffee Voucher">`;
  return `<input data-tier-reward type="number" min="0" value="${Math.max(0,Number(value||0))}">`;
}
function normalizeTarget(t){
  const type=t.targetType==='welcome'?'welcome':'rebate';
  const incomingMechanic=t.mechanic||'standard';
  const legacyWelcomeMilestone={threshold:Number(t.welcomeRequirement ?? t.welcomeSpend ?? 0),rewardType:cleanRewardType(t.welcomeRewardType||'現金回贈'),reward:Number(t.welcomeReward ?? t.welcomeCashback ?? 0),startDate:'',endDate:''};
  let rawMilestones=Array.isArray(t.milestones)&&t.milestones.length?t.milestones:(type==='welcome'?[legacyWelcomeMilestone]:[]);
  if(type!=='welcome'&&incomingMechanic==='recurring'){
    const months=campaignMonths(t.startDate||'',t.endDate||'');
    rawMilestones=(months.length?months:['']).map(m=>({threshold:Math.max(0,Number(t.recurringThreshold||0)),rewardType:cleanRewardType(t.recurringRewardType||'現金回贈'),reward:Math.max(0,Number(t.recurringReward||0)),startDate:m?`${m}-01`:'',endDate:m?monthEnd(m):''}));
  }
  const milestones=rawMilestones.map(x=>({threshold:Math.max(0,Number(x.threshold||0)),rewardType:cleanRewardType(x.rewardType),reward:Math.max(0,Number(x.reward||0)),startDate:x.startDate||'',endDate:x.endDate||''}));
  const hasStageDates=milestones.some(x=>x.startDate||x.endDate)||t.milestoneDateMode==='dated'||incomingMechanic==='recurring';
  const migrateCumulativeMilestone=type!=='welcome'&&['milestone','custom'].includes(incomingMechanic)&&!hasStageDates;
  let mechanic=type==='welcome'?'milestone':(['recurring','custom'].includes(incomingMechanic)?'milestone':incomingMechanic);
  if(migrateCumulativeMilestone)mechanic='tier_rate';
  const milestoneDateMode=type==='welcome'?'cumulative':'dated';
  const milestoneBonusEnabled=t.milestoneBonusEnabled!==undefined?!!t.milestoneBonusEnabled:(incomingMechanic==='recurring'&&Number(t.completionBonus||0)>0);
  const milestoneBonusSpend=Math.max(0,Number(t.milestoneBonusSpend||0));
  const milestoneBonusType=cleanRewardType(t.milestoneBonusType||(incomingMechanic==='recurring'?t.completionBonusType:'現金回贈'));
  const milestoneBonus=Math.max(0,Number(t.milestoneBonus ?? (incomingMechanic==='recurring'?t.completionBonus:0) ?? 0));
  const legacyTierMode=['rate','reward','category_rate'].includes(t.thresholdRewardMode)?t.thresholdRewardMode:'rate';
  let rawTiers;
  if(migrateCumulativeMilestone)rawTiers=milestones.map(x=>({threshold:x.threshold,rate:0,rewardType:x.rewardType,reward:x.reward,rewardMode:'reward'}));
  else rawTiers=Array.isArray(t.tiers)&&t.tiers.length?t.tiers:[{threshold:0,rate:Number(t.rebateRate||0),rewardType:'現金回贈',reward:0,rewardMode:legacyTierMode}];
  const tiers=rawTiers.map(x=>{const rewardType=cleanRewardType(x.rewardType||'現金回贈');return {threshold:Math.max(0,Number(x.threshold||0)),rate:Math.max(0,Number(x.rate||0)),rewardType,reward:normalizeRewardValue(rewardType,x.reward),rewardMode:['rate','reward','category_rate'].includes(x.rewardMode)?x.rewardMode:legacyTierMode}});
  const tierModes=new Set(tiers.map(x=>x.rewardMode));
  const thresholdRewardMode=tierModes.size===1?[...tierModes][0]:'mixed';
  const thresholdRewardCategories=Array.isArray(t.thresholdRewardCategories)?t.thresholdRewardCategories.filter(Boolean):[];
  const stampMilestones=(Array.isArray(t.stampMilestones)&&t.stampMilestones.length?t.stampMilestones:[{count:3,rewardType:'現金回贈',reward:50},{count:6,rewardType:'現金回贈',reward:100}]).map(x=>({count:Math.max(1,Number(x.count||1)),rewardType:cleanRewardType(x.rewardType),reward:Math.max(0,Number(x.reward||0))}));
  const periodType=type==='welcome'?'approval_window':(t.periodType==='approval_window'?'monthly':(t.periodType||'monthly'));
  return {
    id:t.id||uid(),cardKey:t.cardKey||uid(),name:t.name||'未命名信用卡',targetType:type,offerTitle:t.offerTitle||'',mechanic,
    eligibilityMode:t.eligibilityMode || ((Array.isArray(t.rebateCategories)&&t.rebateCategories.length)?'categories':'all'),
    rebateCategories:Array.isArray(t.rebateCategories)?t.rebateCategories.filter(Boolean):(t.selectedCategory?[t.selectedCategory]:[]),
    minTransaction:Math.max(0,Number(t.minTransaction||0)),
    minTransactionEnabled:t.minTransactionEnabled!==undefined?!!t.minTransactionEnabled:Number(t.minTransaction||0)>0,
    periodType,startDate:t.startDate||'',endDate:t.endDate||t.rebateEndDate||'',resetRule:t.resetRule||((type==='welcome')?'none':'period'),
    rebateRate:Math.max(0,Number(t.rebateRate ?? (Number(t.baseRate||0)+Number(t.bonusRate||0)) ?? 0)),
    spendRequirement:Math.max(0,Number(t.spendRequirement ?? t.monthlyThreshold ?? 0)),spendCap:Math.max(0,Number(t.spendCap ?? t.bonusSpendCap ?? 0)),
    capEnabled:t.capEnabled!==undefined?!!t.capEnabled:((t.capType&&t.capType!=='none')||Number(t.capAmount ?? t.spendCap ?? 0)>0),
    capType:t.capType||((Number(t.spendCap||0)>0)?'spend':'none'),capAmount:Math.max(0,Number(t.capAmount ?? t.spendCap ?? 0)),
    tiers,thresholdRewardMode,thresholdRewardCategories,milestones,milestoneDateMode,milestoneBonusEnabled,milestoneBonusSpend,milestoneBonusType,milestoneBonus,
    recurringThreshold:Math.max(0,Number(t.recurringThreshold ?? 800)),recurringRewardType:cleanRewardType(t.recurringRewardType||'現金回贈'),recurringReward:Math.max(0,Number(t.recurringReward ?? 100)),
    completionBonusType:cleanRewardType(t.completionBonusType||'現金回贈'),completionBonus:Math.max(0,Number(t.completionBonus ?? 0)),
    stampEarnMode:t.stampEarnMode==='cumulative'?'cumulative':'per_txn',stampTransactionMin:Math.max(0,Number(t.stampTransactionMin ?? 500)),stampsPerTxn:Math.max(1,Number(t.stampsPerTxn ?? 1)),
    stampDailyCapEnabled:t.stampDailyCapEnabled!==undefined?!!t.stampDailyCapEnabled:Number(t.stampDailyCap||0)>0,stampDailyCap:Math.max(1,Number(t.stampDailyCap||1)),
    stampMode:t.stampMode==='repeat'?'repeat':'stages',stampRepeatEvery:Math.max(1,Number(t.stampRepeatEvery??5)),stampRepeatRewardType:cleanRewardType(t.stampRepeatRewardType||'現金回贈'),stampRepeatReward:Math.max(0,Number(t.stampRepeatReward??50)),stampCap:Math.max(0,Number(t.stampCap||0)),stampRewardCap:Math.max(0,Number(t.stampRewardCap||0)),stampMilestones,
    rebateEndDate:t.rebateEndDate||t.endDate||'',approvalDate:t.approvalDate||'',welcomeDays:Math.max(1,Number(t.welcomeDays??90)),
    welcomeRequirement:Math.max(0,Number(t.welcomeRequirement ?? t.welcomeSpend ?? legacyWelcomeMilestone.threshold ?? 0)),welcomeRewardType:cleanRewardType(t.welcomeRewardType||legacyWelcomeMilestone.rewardType),welcomeReward:Math.max(0,Number(t.welcomeReward ?? t.welcomeCashback ?? legacyWelcomeMilestone.reward ?? 0)),
    themeSeed:String(t.themeSeed||t.cardKey||t.id||''),
    createdAt:Number(t.createdAt||0),...(t._temporary?{_temporary:true}:{})
  };
}
function mechanicLabel(t){
  return ({standard:'指定回贈',tier_rate:'門檻簽賬',milestone:'階段獎賞',recurring:'階段獎賞',stamp:'印花獎賞',custom:'階段獎賞'})[t.mechanic]||'優惠';
}
function rewardValueLabel(type,value){
  if(isTextRewardType(type))return String(value??'').trim()||(type==='禮物'?'禮物':'自訂獎賞');
  const n=Math.max(0,Number(value||0)),num=n.toLocaleString('en-HK',{maximumFractionDigits:2});
  if(type==='現金回贈')return `${money(n)}現金`;
  if(type==='飛行里數')return `${num}飛行里數`;
  if(type==='積分')return `${num}積分`;
  if(type==='獎賞錢')return `${num}獎賞錢`;
  return money(n);
}
function targetShortLabel(t){
  if(t.targetType==='welcome')return `迎新 · ${mechanicLabel(t)}`;
  if(t.mechanic==='standard')return `回贈 · ${Number(t.rebateRate||0).toFixed(Number.isInteger(Number(t.rebateRate||0))?0:1)}%`;
  if(t.mechanic==='tier_rate'){const modes=new Set((t.tiers||[]).map(x=>x.rewardMode||'rate'));return `回贈 · ${modes.size>1?'混合門檻獎賞':modes.has('reward')?'門檻獎賞':modes.has('category_rate')?'門檻解鎖類別回贈':'門檻回贈率'}`;}
  return `回贈 · ${mechanicLabel(t)}`;
}
function targetDetailLabel(t){
  const cats=t.eligibilityMode==='categories'&&t.rebateCategories.length?t.rebateCategories.join('、'):'所有合資格簽賬';
  const p=({monthly:'每月',quarterly:'每季度',campaign:'指定推廣期',yearly:'全年',approval_window:`批卡後 ${t.welcomeDays} 日`})[t.periodType]||'自訂週期';
  return `${cats} · ${p}${t.endDate?' · 至 '+t.endDate:''}`;
}

function migrateLegacyState(old){
  const legacyCards=Array.isArray(old?.cards)?old.cards:[];
  const targets=[];
  const sourceMap=new Map();
  const nameKeyMap=new Map();

  legacyCards.forEach((c,index)=>{
    const name=c.name || '未命名信用卡';
    const n=normalizeCardName(name) || `legacy-${index}`;
    if(!nameKeyMap.has(n)) nameKeyMap.set(n,c.cardKey || uid());
    const cardKey=nameKeyMap.get(n);
    const targetIds=[];

    const hasRebate=c.targetType ? c.targetType==='rebate' : (c.hasRebate ?? true);
    const hasWelcome=c.targetType ? c.targetType==='welcome' : !!(c.hasWelcome ?? (c.approvalDate || c.welcomeSpend || c.welcomeRequirement));

    if(hasRebate){
      const t=normalizeTarget({...c,id:c.targetType?c.id:`${c.id||uid()}__rebate`,cardKey,name,targetType:'rebate'});
      targets.push(t);targetIds.push({id:t.id,type:'rebate'});
    }
    if(hasWelcome){
      const t=normalizeTarget({...c,id:c.targetType?c.id:`${c.id||uid()}__welcome`,cardKey,name,targetType:'welcome'});
      // Avoid duplicate id if a malformed legacy item says both types while already targetType.
      if(targets.some(x=>x.id===t.id)) t.id=uid();
      targets.push(t);targetIds.push({id:t.id,type:'welcome'});
    }
    sourceMap.set(c.id,{cardKey,name,targetIds});
  });

  const transactions=(Array.isArray(old?.transactions)?old.transactions:[]).map(t=>{
    const src=sourceMap.get(t.cardId);
    let ids=[];
    if(src){
      src.targetIds.forEach(x=>{
        if(x.type==='rebate' && t.qualifiesRebate!==false) ids.push(x.id);
        if(x.type==='welcome' && t.qualifiesWelcome!==false) ids.push(x.id);
      });
    }
    const refs=ids.map(id=>{
      const target=targets.find(x=>x.id===id);
      return target?{id:target.id,type:target.targetType,label:targetShortLabel(target)}:null;
    }).filter(Boolean);
    return {
      id:t.id || uid(),
      cardKey:src?.cardKey || t.cardKey || uid(),
      cardName:src?.name || t.cardName || '已刪除信用卡',
      amount:Number(t.amount||0),
      category:t.category || '一般簽賬',
      targetIds:ids,
      targetRefs:refs,
      date:t.date || localDateStr(),
      createdAt:Number(t.createdAt||Date.now())
    };
  });

  return {cards:targets,transactions,month:old?.month || old?.selectedMonth || localMonthStr()};
}
function normalizeV4State(x){
  const cards=(Array.isArray(x?.cards)?x.cards:[]).map(normalizeTarget);
  const transactions=(Array.isArray(x?.transactions)?x.transactions:[]).map(t=>{
    const ids=Array.isArray(t.targetIds)?t.targetIds.filter(Boolean):[];
    const refs=Array.isArray(t.targetRefs)?t.targetRefs.filter(Boolean):ids.map(id=>{
      const target=cards.find(x=>x.id===id);
      return target?{id:target.id,type:target.targetType,label:targetShortLabel(target)}:null;
    }).filter(Boolean);
    return {
      id:t.id || uid(),
      cardKey:t.cardKey || cards.find(c=>c.id===t.cardId)?.cardKey || uid(),
      cardName:t.cardName || cards.find(c=>c.cardKey===t.cardKey)?.name || cards.find(c=>c.id===t.cardId)?.name || '已刪除信用卡',
      amount:Number(t.amount||0),
      category:t.category || '一般簽賬',
      targetIds:ids,
      targetRefs:refs,
      date:t.date || localDateStr(),
      createdAt:Number(t.createdAt||Date.now())
    };
  });
  return {cards,transactions,month:x?.month || localMonthStr()};
}
function load(){
  try{
    const current=JSON.parse(localStorage.getItem(KEY));
    if(current && Array.isArray(current.cards)) return normalizeV4State(current);
    for(const k of LEGACY_KEYS){
      const old=JSON.parse(localStorage.getItem(k));
      if(old && Array.isArray(old.cards)){
        const migrated=migrateLegacyState(old);
        localStorage.setItem(KEY,JSON.stringify(migrated));
        return migrated;
      }
    }
  }catch(e){console.warn('load failed',e)}
  return {cards:[],transactions:[],month:localMonthStr()};
}
let state=load();
function save(){localStorage.setItem(KEY,JSON.stringify(state))}

/* 主頁回贈目標排序：獨立儲存，避免改動優惠資料結構。 */
const GOAL_SORT_KEY=KEY+'_goal_sort';
const GOAL_SORT_DEFAULT_DIR={card:'asc',type:'asc',end:'asc',added:'asc',progress:'desc'};
function loadGoalSort(){
  try{
    const raw=JSON.parse(localStorage.getItem(GOAL_SORT_KEY)||'null');
    const key=['card','type','end','added','progress'].includes(raw?.key)?raw.key:'added';
    const dir=raw?.dir==='desc'?'desc':raw?.dir==='asc'?'asc':GOAL_SORT_DEFAULT_DIR[key];
    return {key,dir};
  }catch(e){return {key:'added',dir:'asc'}}
}
let goalSort=loadGoalSort();
function saveGoalSort(){localStorage.setItem(GOAL_SORT_KEY,JSON.stringify(goalSort))}
function goalSpendType(t){
  if(t.targetType==='welcome')return '迎新簽賬';
  if(t.eligibilityMode==='categories'&&Array.isArray(t.rebateCategories)&&t.rebateCategories.length){
    return t.rebateCategories.map(x=>String(x||'').trim()).filter(Boolean).join('／');
  }
  return '所有合資格簽賬';
}
function sortGoalRows(rows){
  const dir=goalSort.dir==='desc'?-1:1,key=goalSort.key;
  const compareText=(a,b)=>String(a||'').localeCompare(String(b||''),'zh-HK',{numeric:true,sensitivity:'base'});
  return rows.slice().sort((a,b)=>{
    let result=0;
    if(key==='card')result=compareText(a.sortCard,b.sortCard);
    else if(key==='type')result=compareText(a.sortType,b.sortType);
    else if(key==='end'){
      const aMissing=!a.sortEnd,bMissing=!b.sortEnd;
      if(aMissing!==bMissing)return aMissing?1:-1;
      result=compareText(a.sortEnd,b.sortEnd);
    }else if(key==='added')result=Number(a.sortAdded||0)-Number(b.sortAdded||0);
    else if(key==='progress')result=Number(a.progress||0)-Number(b.progress||0);
    if(result===0)result=Number(a.sortAdded||0)-Number(b.sortAdded||0);
    return result*dir;
  });
}
function updateGoalSortControls(){
  const select=document.getElementById('goalSortSelect'),btn=document.getElementById('goalSortDir');
  if(select)select.value=goalSort.key;
  if(btn){
    const asc=goalSort.dir==='asc';
    btn.textContent=asc?'↑':'↓';
    const label=select?.selectedOptions?.[0]?.textContent||'排序';
    const direction=asc?'由小至大／由早至遲':'由大至小／由遲至早';
    btn.title=`${label}：${direction}`;
    btn.setAttribute('aria-label',`切換排序方向，目前${direction}`);
  }
}
function captureGoalShufflePositions(){
  const map=new Map();
  document.querySelectorAll('#goals .goal[data-target-id]').forEach(el=>{
    const r=el.getBoundingClientRect();
    map.set(String(el.dataset.targetId||''),{left:r.left,top:r.top});
  });
  return map;
}
let goalShuffleTimer=0;
function renderGoalsWithShuffle(){
  /* 快速連續排序時，先清理上一輪收尾 timer，避免舊 timer 提早解除新一輪洗牌狀態。 */
  clearTimeout(goalShuffleTimer);
  document.getElementById('goals')?.classList.remove('is-shuffling');
  const before=captureGoalShufflePositions();
  renderGoals();
  if(!before.size||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  requestAnimationFrame(()=>{
    const box=document.getElementById('goals');
    const cards=[...document.querySelectorAll('#goals .goal[data-target-id]')];
    if(!box||!cards.length)return;
    box.classList.add('is-shuffling');
    let longest=0;
    cards.forEach((el,i)=>{
      const old=before.get(String(el.dataset.targetId||''));
      const now=el.getBoundingClientRect();
      const side=i%2===0?-1:1;
      const dx=old?old.left-now.left:side*14;
      const dy=old?old.top-now.top:0;
      const moved=Math.abs(dx)>.5||Math.abs(dy)>.5;
      const startX=moved?dx:side*10;
      const startY=moved?dy:0;
      const duration=680,delay=Math.min(i*34,190);
      longest=Math.max(longest,duration+delay);
      el.animate([
        {transform:`translate(${startX}px,${startY}px) scale(.982) rotate(${side*.45}deg)`,opacity:.74,offset:0},
        {transform:`translate(${side*9}px,${startY*.16}px) scale(.994) rotate(${-side*.22}deg)`,opacity:.94,offset:.58},
        {transform:'translate(0,0) scale(1) rotate(0deg)',opacity:1,offset:1}
      ],{duration,delay,easing:'cubic-bezier(.2,.78,.2,1)',fill:'both'});
    });
    goalShuffleTimer=window.setTimeout(()=>{
      box.classList.remove('is-shuffling');
      goalShuffleTimer=0;
    },longest+60);
  });
}
document.getElementById('goalSortSelect')?.addEventListener('change',e=>{
  goalSort.key=e.target.value;
  goalSort.dir=GOAL_SORT_DEFAULT_DIR[goalSort.key]||'asc';
  saveGoalSort();updateGoalSortControls();renderGoalsWithShuffle();
});
document.getElementById('goalSortDir')?.addEventListener('click',()=>{
  goalSort.dir=goalSort.dir==='asc'?'desc':'asc';
  saveGoalSort();updateGoalSortControls();renderGoalsWithShuffle();
});
updateGoalSortControls();

function getPhysicalCards(){
  const map=new Map();
  state.cards.filter(t=>!t._temporary).forEach(t=>{
    const key=t.cardKey || t.id;
    if(!map.has(key)) map.set(key,{cardKey:key,name:t.name,targets:[]});
    const card=map.get(key);
    if(t.name) card.name=t.name;
    card.targets.push(t);
  });
  return [...map.values()];
}
function cardByKey(cardKey){return getPhysicalCards().find(c=>c.cardKey===cardKey)||null}
function txIncludesTarget(t,targetId){return Array.isArray(t.targetIds)&&t.targetIds.includes(targetId)}
function dateInRange(date,start,end){return (!start||date>=start)&&(!end||date<=end)}
function quarterBounds(month){
  const [y,m]=month.split('-').map(Number),q=Math.floor((m-1)/3)*3+1,last=q+2;
  const start=`${y}-${String(q).padStart(2,'0')}-01`,d=new Date(y,last,0),end=`${y}-${String(last).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return {start,end};
}
function yearBounds(month){const y=String(month).slice(0,4);return {start:`${y}-01-01`,end:`${y}-12-31`}}
function offerBounds(t){
  if(t.mechanic==='milestone'&&t.targetType!=='welcome'&&t.milestoneDateMode==='dated'){
    const starts=(t.milestones||[]).map(x=>x.startDate).filter(Boolean).sort(),ends=(t.milestones||[]).map(x=>x.endDate).filter(Boolean).sort();
    if(starts.length||ends.length)return {start:starts[0]||'',end:ends.at(-1)||''};
  }
  if(t.periodType==='approval_window')return t.approvalDate?{start:t.approvalDate,end:addDays(t.approvalDate,t.welcomeDays)}:{start:'',end:''};
  if(t.periodType==='campaign')return {start:t.startDate||'',end:t.endDate||''};
  let b=t.periodType==='quarterly'?quarterBounds(state.month):t.periodType==='yearly'?yearBounds(state.month):{start:state.month+'-01',end:monthEnd(state.month)};
  if(t.startDate&&t.startDate>b.start)b.start=t.startDate;if(t.endDate&&t.endDate<b.end)b.end=t.endDate;return b;
}
function txForOffer(t,bounds=offerBounds(t)){
  return state.transactions.filter(tx=>txIncludesTarget(tx,t.id)&&dateInRange(tx.date,bounds.start,bounds.end));
}
function spendForOffer(t,bounds=offerBounds(t)){return txForOffer(t,bounds).reduce((s,tx)=>s+Number(tx.amount||0),0)}
/* 瀏覽月份只顯示當月實際可能存在的優惠。
   有明確開始日就以開始日為準；沒有開始日則以該優惠第一筆消費推斷，
   再沒有消費才以優惠建立日期作保底，避免優惠無限延伸到過往月份。 */
function firstOfferTransactionDate(t){
  return state.transactions
    .filter(tx=>txIncludesTarget(tx,t.id)&&/^\d{4}-\d{2}-\d{2}$/.test(String(tx.date||'')))
    .map(tx=>String(tx.date).slice(0,10))
    .sort()[0]||'';
}
function offerDisplayRange(t){
  let start='',end='';
  if(t.mechanic==='milestone'&&t.targetType!=='welcome'&&t.milestoneDateMode==='dated'){
    const starts=(t.milestones||[]).map(x=>String(x.startDate||'').slice(0,10)).filter(Boolean).sort();
    const ends=(t.milestones||[]).map(x=>String(x.endDate||'').slice(0,10)).filter(Boolean).sort();
    start=starts[0]||'';end=ends.at(-1)||'';
  }else if(t.periodType==='approval_window'){
    start=String(t.approvalDate||'').slice(0,10);
    end=start?addDays(start,t.welcomeDays):'';
  }else{
    start=String(t.startDate||'').slice(0,10);
    end=String(t.endDate||t.rebateEndDate||'').slice(0,10);
  }
  if(!start)start=firstOfferTransactionDate(t);
  if(!start&&Number(t.createdAt||0)>0){
    const d=new Date(Number(t.createdAt));
    if(!Number.isNaN(d.getTime()))start=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  return {start,end};
}
function offerVisibleInMonth(t,month=state.month){
  if(!/^\d{4}-\d{2}$/.test(String(month||'')))return true;
  const selectedStart=`${month}-01`,selectedEnd=monthEnd(month),range=offerDisplayRange(t);
  if(range.start&&selectedEnd<range.start)return false;
  if(range.end&&selectedStart>range.end)return false;
  return true;
}
function campaignMonths(start,end){
  if(!start||!end)return [];
  const out=[],a=new Date(start+'T00:00:00'),b=new Date(end+'T00:00:00');a.setDate(1);
  while(a<=b&&out.length<60){out.push(`${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}`);a.setMonth(a.getMonth()+1)}return out;
}
function rewardLabel(target){return rewardValueLabel(target.welcomeRewardType,target.welcomeReward)}
function offerEndStatus(t,bounds){
  const endRaw=String(bounds.end||'').trim();
  if(!endRaw)return {days:'進行中',daysLeft:null,dayClass:'',ended:false};

  /* 日期型優惠視為有效至該日 23:59:59；最後一日改用小時／分鐘倒數。 */
  const endDate=endRaw.slice(0,10),today=localDateStr();
  if(today>endDate)return {days:'已完結',daysLeft:0,dayClass:'bad',ended:true};
  if(today<endDate){
    const left=Math.max(1,daysLeft(endDate));
    return {days:`尚餘${left}日`,daysLeft:left,dayClass:'',ended:false};
  }

  let endAt;
  if(/^\d{4}-\d{2}-\d{2}$/.test(endRaw)){
    const [y,m,d]=endRaw.split('-').map(Number);
    endAt=new Date(y,m-1,d,23,59,59,999);
  }else{
    endAt=new Date(endRaw);
  }
  if(Number.isNaN(endAt.getTime()))return {days:'進行中',daysLeft:null,dayClass:'',ended:false};

  const remaining=endAt.getTime()-Date.now();
  if(remaining<=0)return {days:'已完結',daysLeft:0,dayClass:'bad',ended:true};
  const MINUTE=60*1000,HOUR=60*MINUTE;
  if(remaining<HOUR){
    const minutes=Math.max(1,Math.floor(remaining/MINUTE));
    return {days:`尚餘${minutes}分鐘`,daysLeft:0,dayClass:'',ended:false};
  }
  const hours=Math.max(1,Math.floor(remaining/HOUR));
  return {days:`尚餘${hours}小時`,daysLeft:0,dayClass:'',ended:false};
}
function remainingDayClass(time,completed){
  if(completed)return 'good';
  if(time.ended)return 'bad';
  if(time.daysLeft===null)return '';
  if(time.daysLeft<=5)return 'bad';
  if(time.daysLeft<=10)return 'warn';
  return 'good';
}
function remainingGoalClass(time,completed){
  return !completed&&!time.ended&&time.daysLeft!==null&&time.daysLeft>=0&&time.daysLeft<=10?'caution-tape':'';
}
function rebateProgressTitle(t,rate){
  const rateText=Number(rate||0).toFixed(Number.isInteger(Number(rate||0))?0:1);
  if(t.eligibilityMode==='categories'&&t.rebateCategories.length){
    const names=t.rebateCategories.map(cat=>{
      const label=String(cat||'').trim();
      return `${CATEGORY_EMOJI[label]||'🏷️'}${label}${label.endsWith('簽賬')?'':'簽賬'}`;
    }).join('／');
    return `${names} · 額外 ${rateText}%`;
  }
  return `💳所有合資格簽賬 · 額外 ${rateText}%`;
}
function offerMeta(t){
  const catText=t.eligibilityMode==='categories'&&t.rebateCategories.length?`限${t.rebateCategories.join('、')}`:'適用於所有合資格簽賬';
  const period=(t.mechanic==='milestone'&&t.targetType!=='welcome')?'按階段日期':(({monthly:'每月重置',quarterly:'每季度重置',campaign:'指定推廣期',yearly:'全年',approval_window:`批卡後 ${t.welcomeDays} 日`})[t.periodType]||'自訂週期');
  const parts=[catText,period];
  if(t.mechanic==='standard'&&Number(t.spendRequirement||0)>0)parts.push(`最低累積簽賬 ${money(t.spendRequirement)}`);
  if(Number(t.minTransaction||0)>0)parts.push(`每筆最低簽賬 ${money(t.minTransaction)}`);
  const capLine=linkedCapSummary(t);
  if(capLine)parts.push(capLine);
  return parts.join(' · ');
}
function homepageCampaignLine(t){
  if(t.targetType==='welcome'||t.periodType!=='campaign')return '';
  const end=String(t.endDate||t.rebateEndDate||'').trim();
  return end?`推廣期至 ${end}`:'';
}
function thresholdProgressTitle(t,done,total){
  let scope='所有合資格簽賬';
  if(t.eligibilityMode==='categories'&&t.rebateCategories.length){
    scope=t.rebateCategories.map(cat=>{const label=String(cat||'').trim();return label.endsWith('簽賬')?label:`${label}簽賬`}).join('／');
  }
  return `${scope} · 門檻進度 ${done}/${total}`;
}
function homepageTierRequirementLines(t){
  const lines=[],campaignLine=homepageCampaignLine(t);
  if(campaignLine)lines.push(campaignLine);
  if(Number(t.minTransaction||0)>0)lines.push(`每筆最低簽賬 ${money(t.minTransaction)}`);
  const capLine=linkedCapSummary(t);if(capLine)lines.push(capLine);
  if(!lines.length){
    const period=({monthly:'每月重置',quarterly:'每季度重置',yearly:'全年'})[t.periodType];
    if(period)lines.push(period);
  }
  return lines.slice(0,3);
}
function homepageRequirementLines(t){
  // 主頁只保留真正需要掃讀的簽賬要求；合資格類別已在標題顯示，不再重複「適用於／限…」。
  if(t.targetType==='welcome'){
    const first=[...(t.milestones||[])].sort((a,b)=>Number(a.threshold||0)-Number(b.threshold||0))[0];
    const threshold=Math.max(0,Number(first?.threshold ?? t.welcomeRequirement ?? 0));
    return threshold>0?[`批卡後 ${Math.max(1,Number(t.welcomeDays||1))} 日累積簽賬 ${money(threshold)}`]:[`批卡後 ${Math.max(1,Number(t.welcomeDays||1))} 日`];
  }
  if(t.mechanic==='standard'){
    const lines=[];
    const campaignLine=homepageCampaignLine(t);
    const req=Math.max(0,Number(t.spendRequirement||0));
    const periodPrefix=({monthly:'每月',quarterly:'每季度',yearly:'全年'})[t.periodType]||(t.periodType==='campaign'?'':'每期');
    if(campaignLine)lines.push(campaignLine);
    if(req>0)lines.push(`${periodPrefix}最低累積簽賬 ${money(req)}`);
    if(Number(t.minTransaction||0)>0)lines.push(`每筆最低簽賬 ${money(t.minTransaction)}`);
    const capLine=linkedCapSummary(t);
    if(capLine)lines.push(capLine);
    return lines.length?lines:[periodPrefix||'指定推廣期'];
  }
  return [offerMeta(t)];
}
function renderGoalMeta(lines){
  return (Array.isArray(lines)?lines:[lines]).filter(Boolean).map(x=>{
    const raw=String(x||'');
    let text=esc(raw);
    // 主頁要求列：金額一律加粗；迎新「批卡後 X 日」的日數亦加粗。
    text=text.replace(/(\$[0-9][0-9,]*(?:\.[0-9]+)?)/g,'<b>$1</b>');
    text=text.replace(/(批卡後\s+)([0-9]+)(\s+日)/g,'$1<b>$2</b>$3');
    // 印花條件的「每次獲得印花數量」同樣屬關鍵數值，與金額一樣加重顯示。
    text=text.replace(/(\s=\s)([0-9]+)(\s+個印花)/g,'$1<b>$2</b>$3');
    // 指定推廣期在主頁獨立顯示；「推廣期至」保持一般字重，只把日期加粗。
    const campaignMatch=raw.match(/^推廣期至\s+(\d{4}-\d{2}-\d{2})$/);
    if(campaignMatch)return `<span class="goal-meta-line">· 推廣期至 <b>${esc(campaignMatch[1])}</b></span>`;
    return `<span class="goal-meta-line">· ${text}</span>`;
  }).join('');
}
function renderGoalStatus(status){
  /* 先 escape，再只為 $ 金額加入 <b>，避免把狀態文字當 HTML 注入。 */
  return esc(status).replace(/(\$[0-9][0-9,]*(?:\.[0-9]+)?)/g,'<b>$1</b>');
}
function thresholdTierRewardLabel(tier,categories=[]){
  const mode=tier?.rewardMode||'rate';
  if(mode==='reward')return rewardValueLabel(tier.rewardType,tier.reward);
  if(mode==='category_rate'){
    const catText=(categories||[]).length?(categories||[]).map(x=>`${CATEGORY_EMOJI[x]||'🏷️'}${x}`).join('／'):'指定類別';
    return `${catText} ${Number(tier?.rate||0)}% 回贈`;
  }
  return `${Number(tier?.rate||0)}% 回贈`;
}
function stampEarnDescription(t){
  const amount=money(t.stampTransactionMin),qty=Math.max(1,Number(t.stampsPerTxn||1));
  const base=t.stampEarnMode==='cumulative'?`每累積簽賬 ${amount} = ${qty} 個印花`:`單筆簽賬達 ${amount} = ${qty} 個印花`;
  return `${base}${t.stampDailyCapEnabled?` · 每日最多 ${Math.max(1,Number(t.stampDailyCap||1))} 個`:''}`;
}
function stampGoalTitle(t){
  if(t.eligibilityMode==='categories'&&t.rebateCategories.length){
    const catsRaw=t.rebateCategories.map(cat=>String(cat||'').trim()).filter(Boolean);
    const labels=catsRaw.map(label=>label.endsWith('簽賬')?label:`${label}簽賬`);
    const cats=labels.join('／'),full=`${cats||'指定簽賬'} · 印花獎賞`;
    /* 多類別或標題過長時縮短；圖案仍保留，避免只剩純文字。 */
    if(labels.length>=3||Array.from(full).length>20)return `💳多類別簽賬 · 印花獎賞`;
    const icon=CATEGORY_EMOJI[catsRaw[0]]||'🔖';
    return `${icon}${full}`;
  }
  return `💳所有合資格簽賬 · 印花獎賞`;
}
function stampCountForOffer(t,bounds=offerBounds(t)){
  const txs=txForOffer(t,bounds).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
  const threshold=Math.max(0,Number(t.stampTransactionMin||0)),per=Math.max(1,Number(t.stampsPerTxn||1));
  const dailyEnabled=!!t.stampDailyCapEnabled,dailyCap=Math.max(1,Number(t.stampDailyCap||1));
  let stamps=0;
  if(t.stampEarnMode==='cumulative'){
    if(threshold<=0)return 0;
    if(!dailyEnabled){
      const total=txs.reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount||0)),0);
      stamps=Math.floor(total/threshold)*per;
    }else{
      const byDate=new Map();
      txs.forEach(tx=>{const d=tx.date||'';byDate.set(d,(byDate.get(d)||0)+Math.max(0,Number(tx.amount||0)))});
      let carry=0;
      [...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([,amount])=>{
        const pool=carry+amount,units=Math.floor(pool/threshold),raw=units*per;
        stamps+=Math.min(raw,dailyCap);
        carry=pool-units*threshold;
      });
    }
  }else{
    if(!dailyEnabled){
      stamps=txs.reduce((sum,tx)=>sum+(Number(tx.amount||0)>=threshold?per:0),0);
    }else{
      const byDate=new Map();
      txs.forEach(tx=>{if(Number(tx.amount||0)<threshold)return;const d=tx.date||'';byDate.set(d,(byDate.get(d)||0)+per)});
      stamps=[...byDate.values()].reduce((sum,n)=>sum+Math.min(n,dailyCap),0);
    }
  }
  const overallCap=Math.max(0,Number(t.stampCap||0));
  return overallCap>0?Math.min(stamps,overallCap):stamps;
}
/* ===== v21：門檻獎賞主頁顯示估算回贈 ===== */
function tierEstimatedRebate(t,spent,current,bounds=offerBounds(t)){
  if(!t||!current)return null;
  const mode=current.rewardMode||'rate',rate=Math.max(0,Number(current.rate||0));
  if(!['rate','category_rate'].includes(mode)||rate<=0)return null;
  let eligibleSpend=Math.max(0,Number(spent||0));
  if(mode==='category_rate'){
    const cats=new Set((t.thresholdRewardCategories||[]).map(x=>String(x||'').trim()).filter(Boolean));
    if(!cats.size)return null;
    eligibleSpend=txForOffer(t,bounds).reduce((sum,tx)=>cats.has(String(tx.category||'').trim())?sum+Math.max(0,Number(tx.amount||0)):sum,0);
  }
  const caps=capAmounts(t);
  if(caps.spend>0)eligibleSpend=Math.min(eligibleSpend,caps.spend);
  let estimate=eligibleSpend*rate/100;
  if(caps.reward>0)estimate=Math.min(estimate,caps.reward);
  return Math.max(0,estimate);
}
function getGoalRows(){
  const rows=[];
  state.cards.filter(t=>!t._temporary&&offerVisibleInMonth(t)).forEach(t=>{
    const b=offerBounds(t),time=offerEndStatus(t,b),spent=spendForOffer(t,b);let title='',status='',progress=0,percent='0%',completed=false,meta=offerMeta(t),metaLines=homepageRequirementLines(t),stampCurrent=0,stampTarget=0,stampMilestones=[],stageOverview=null;
    if(t.mechanic==='tier_rate'){
      const tiers=[...t.tiers].sort((a,b)=>a.threshold-b.threshold),done=tiers.filter(x=>spent>=x.threshold),current=[...done].at(-1)||null,next=tiers.find(x=>spent<x.threshold),highestThreshold=Math.max(0,Number(tiers.at(-1)?.threshold||0)),capSpend=Math.max(0,Number(capAmounts(t).spend||0)),target=capSpend>0?capSpend:highestThreshold;
      progress=target?pct(spent,target):(tiers.length?100:0);
      /* 無簽賬上限代表優惠仍可繼續累積，不把最高門檻誤當成整個優惠的 100% 完成點。 */
      completed=capSpend>0&&tiers.length>0&&spent>=capSpend;
      title=thresholdProgressTitle(t,done.length,tiers.length);
      metaLines=homepageTierRequirementLines(t);
      const estimatedRebate=tierEstimatedRebate(t,spent,current,b);
      const statusParts=[`已簽 ${money(spent)}`];
      if(next)statusParts.push(`尚欠 ${money(Math.max(0,next.threshold-spent))} 至下一門檻`);
      if(capSpend>0)statusParts.push(spent>=capSpend?'已達簽賬上限':`尚餘額度 ${money(Math.max(0,capSpend-spent))}`);
      if(estimatedRebate!==null)statusParts.push(`估算回贈 ${money(estimatedRebate)}`);
      status=statusParts.join(' ‧ ');
    }else if(t.mechanic==='milestone'||t.mechanic==='custom'){
      const dated=t.targetType!=='welcome',ms=dated?[...t.milestones].sort((a,b)=>String(a.startDate||'').localeCompare(String(b.startDate||''))):[...t.milestones].sort((a,b)=>a.threshold-b.threshold);
      if(dated){
        const today=localDateStr();
        const stageStats=ms.map(x=>{
          const stageSpent=spendForOffer(t,{start:x.startDate||'',end:x.endDate||''}),met=stageSpent>=Number(x.threshold||0);
          const expired=!!x.endDate&&today>x.endDate,future=!!x.startDate&&today<x.startDate,current=(!x.startDate||today>=x.startDate)&&(!x.endDate||today<=x.endDate);
          return {...x,stageSpent,met,expired,future,current};
        }),done=stageStats.filter(x=>x.met),next=stageStats.find(x=>!x.met),allStages=stageStats.length>0&&done.length===stageStats.length;
        const activeIndex=stageStats.findIndex(x=>x.current);
        const nextFutureIndex=stageStats.findIndex(x=>x.future&&!x.met);
        let focusIndex=activeIndex>=0?activeIndex:(nextFutureIndex>=0?nextFutureIndex:(next?stageStats.indexOf(next):Math.max(0,stageStats.length-1)));
        const focus=stageStats[focusIndex]||null;
        const stageStart=stageStats.map(x=>x.startDate).filter(Boolean).sort()[0]||b.start,stageEnd=stageStats.map(x=>x.endDate).filter(Boolean).sort().at(-1)||b.end,totalSpent=spendForOffer(t,{start:stageStart||'',end:stageEnd||''}),bonusNeed=Math.max(0,Number(t.milestoneBonusSpend||0)),bonusMet=!t.milestoneBonusEnabled||(allStages&&totalSpent>=bonusNeed);
        completed=allStages&&bonusMet;title=`簽賬 · 階段獎賞 ${done.length}/${stageStats.length}`;
        if(focus&&!allStages){
          progress=focus.threshold?pct(focus.stageSpent,focus.threshold):100;
          const idx=focusIndex+1;
          if(focus.future)status=`階段（${idx} / ${stageStats.length}）將於 ${focus.startDate} 開始；要求 ${money(focus.threshold)}${Number(focus.reward||0)>0?`，達標可得 ${rewardValueLabel(focus.rewardType,focus.reward)}`:''}`;
          else if(focus.expired&&!focus.met)status=`階段（${idx} / ${stageStats.length}）已結束，未能達標；已簽 ${money(focus.stageSpent)} / ${money(focus.threshold)}`;
          else status=`階段（${idx} / ${stageStats.length}）已簽 ${money(focus.stageSpent)}，尚欠 ${money(Math.max(0,focus.threshold-focus.stageSpent))}${Number(focus.reward||0)>0?`；達標可得 ${rewardValueLabel(focus.rewardType,focus.reward)}`:''}`;
        }else if(t.milestoneBonusEnabled&&!bonusMet){progress=bonusNeed?pct(totalSpent,bonusNeed):100;status=`全部階段已達標；全期已簽 ${money(totalSpent)}，尚欠 ${money(Math.max(0,bonusNeed-totalSpent))} 解鎖加碼 ${rewardValueLabel(t.milestoneBonusType,t.milestoneBonus)}`}
        else{progress=100;status=`全部 ${stageStats.length} 個階段已達標${t.milestoneBonusEnabled?`，並已解鎖加碼 ${rewardValueLabel(t.milestoneBonusType,t.milestoneBonus)}`:''}`}
        if(stageStats.length){
          const shownIndex=Math.max(0,Math.min(focusIndex,stageStats.length-1)),shown=stageStats[shownIndex];
          stageOverview={index:shownIndex+1,total:stageStats.length,startDate:shown?.startDate||'',endDate:shown?.endDate||'',previous:stageStats.slice(0,shownIndex).map((x,i)=>({index:i+1,state:x.met?'success':(x.expired?'fail':'pending')}))};
        }
        meta=`${meta} · ${stageStats.length} 個階段${t.milestoneBonusEnabled?` · 全部完成${bonusNeed>0?`且全期滿 ${money(bonusNeed)}`:''}再 ${rewardValueLabel(t.milestoneBonusType,t.milestoneBonus)}`:''}`;
      }else{
        const done=ms.filter(x=>spent>=x.threshold),next=ms.find(x=>spent<x.threshold),target=next?.threshold||ms.at(-1)?.threshold||0,allStages=!next&&ms.length>0,bonusNeed=Math.max(0,Number(t.milestoneBonusSpend||0)),bonusMet=!t.milestoneBonusEnabled||(allStages&&spent>=bonusNeed);
        progress=allStages&&t.milestoneBonusEnabled&&!bonusMet?(bonusNeed?pct(spent,bonusNeed):100):(target?pct(spent,target):0);completed=allStages&&bonusMet;
        if(t.targetType==='welcome'){
          const first=ms[0]||null;
          const reward=first&&Number(first.reward||0)>0?rewardValueLabel(first.rewardType,first.reward):rewardLabel(t);
          title=`🎁迎新獎賞 ${reward}`;
          status=next?`已簽賬 ${money(spent)}，尚欠 ${money(Math.max(0,next.threshold-spent))}`:`已簽賬 ${money(spent)}，迎新簽賬要求已達標`;
          metaLines=homepageRequirementLines(t);
        }else{
          title=`簽賬 · 階段獎賞 ${done.length}/${ms.length}`;
          const nextReward=next&&Number(next.reward||0)>0?`，完成後可得 ${rewardValueLabel(next.rewardType,next.reward)}`:'';
          status=next?`已簽 ${money(spent)}，尚欠 ${money(next.threshold-spent)}${nextReward}`:(!bonusMet?`全部階段已達標；尚欠 ${money(Math.max(0,bonusNeed-spent))} 解鎖加碼 ${rewardValueLabel(t.milestoneBonusType,t.milestoneBonus)}`:`已簽 ${money(spent)}，全部 ${ms.length} 個階段已解鎖${t.milestoneBonusEnabled?`，連同加碼獎賞`:''}`);
          meta=`${meta}${ms.length?` · ${ms.length} 個階段`:''}${t.milestoneBonusEnabled?` · 加碼門檻 ${money(bonusNeed)}`:''}`;
          metaLines=[meta];
        }
      }
    }else if(t.mechanic==='recurring'){
      const months=campaignMonths(t.startDate,t.endDate),selected=state.month,monthStart=selected+'-01',monthEndStr=monthEnd(selected),thisSpent=spendForOffer(t,{start:monthStart,end:monthEndStr}),threshold=Number(t.recurringThreshold||0);
      const achieved=months.filter(m=>spendForOffer(t,{start:m+'-01',end:monthEnd(m)})>=threshold).length,total=months.length||1;
      progress=threshold?pct(thisSpent,threshold):0;completed=months.length>0&&achieved===months.length;
      title=`簽賬 · 分期達標 ${achieved}/${total}`;
      status=thisSpent>=threshold?`${selected} 已達標 ${money(thisSpent)}；${months.length&&achieved===months.length&&t.completionBonus>0?'已解鎖完成獎賞 '+rewardValueLabel(t.completionBonusType,t.completionBonus):'每期獎賞 '+rewardValueLabel(t.recurringRewardType,t.recurringReward)}`:`${selected} 已簽 ${money(thisSpent)}，尚欠 ${money(Math.max(0,threshold-thisSpent))}`;
      meta=`${meta} · 每期 ${money(threshold)} → ${rewardValueLabel(t.recurringRewardType,t.recurringReward)}${t.completionBonus>0?` · 全期完成再 ${rewardValueLabel(t.completionBonusType,t.completionBonus)}`:''}`;
    }else if(t.mechanic==='stamp'){
      const stamps=stampCountForOffer(t,b),stampCap=Math.max(0,Number(t.stampCap||0));
      if(t.stampMode==='repeat'){
        const every=Math.max(1,Number(t.stampRepeatEvery||1)),rewardLimit=Math.max(0,Number(t.stampRewardCap||0)),earnedRaw=Math.floor(stamps/every),earnedRewards=rewardLimit>0?Math.min(earnedRaw,rewardLimit):earnedRaw;
        let target;if(rewardLimit>0)target=every*rewardLimit;else if(stampCap>0)target=stampCap;else target=(Math.floor(stamps/every)+1)*every;
        if(stampCap>0)target=Math.min(target,stampCap);target=Math.max(1,target);
        completed=rewardLimit>0?earnedRewards>=rewardLimit:(stampCap>0&&stamps>=stampCap);
        progress=pct(stamps,target);percent=`${stamps}/${target}`;stampCurrent=stamps;stampTarget=target;
        const markLimit=Math.min(60,target),repeatMarks=[];for(let x=every;x<=markLimit;x+=every)repeatMarks.push(x);stampMilestones=repeatMarks;
        title=stampGoalTitle(t);
        if(completed)status=`已達本期上限；共獲 ${earnedRewards} 次 ${rewardValueLabel(t.stampRepeatRewardType,t.stampRepeatReward)}`;
        else{const nextNeed=every-(stamps%every||0);status=`再 ${nextNeed} 個即可解鎖 ${rewardValueLabel(t.stampRepeatRewardType,t.stampRepeatReward)}${rewardLimit>0?` · 最多獎 ${rewardLimit} 次`:''}`}
        meta=`${meta} · ${stampEarnDescription(t)} · 集滿 ${every} 個印花發放一次獎賞${stampCap>0?` · 印花上限 ${stampCap}`:''}${rewardLimit>0?` · 獎勵上限 ${rewardLimit} 次`:''}`;
        metaLines=[stampEarnDescription(t)];
      }else{
        const ms=[...t.stampMilestones].sort((a,b)=>a.count-b.count),done=ms.filter(x=>stamps>=x.count),next=ms.find(x=>stamps<x.count),target=next?.count||ms.at(-1)?.count||0;
        progress=target?pct(stamps,target):0;completed=!next&&ms.length>0;percent=`${stamps}/${target||stamps||0}`;stampCurrent=stamps;stampTarget=target||stamps||0;stampMilestones=ms.map(x=>x.count);
        title=stampGoalTitle(t);
        status=next?`再 ${Math.max(0,next.count-stamps)} 個即可解鎖 ${rewardValueLabel(next.rewardType,next.reward)}`:`所有印花獎賞已解鎖`;
        meta=`${meta} · ${stampEarnDescription(t)} · ${ms.length} 個獎賞階段${stampCap>0?` · 印花上限 ${stampCap}`:''}`;
        metaLines=[stampEarnDescription(t)];
      }
    }else{
      const req=Number(t.spendRequirement||0),rate=Number(t.rebateRate||0),caps=capAmounts(t);let target=req;
      if(caps.spend>0)target=caps.spend;
      progress=target?pct(spent,target):(spent>0?100:0);
      /* 沒有簽賬上限時，達到最低門檻只代表已進入回贈區間，不代表優惠已完結。 */
      completed=caps.spend>0&&spent>=caps.spend;
      title=rebateProgressTitle(t,rate);
      metaLines=homepageRequirementLines(t);
      const est=spent>=req?spent*rate/100:0,capped=caps.reward>0?Math.min(est,caps.reward):est;
      const statusParts=[`已簽賬 ${money(spent)}`];
      if(spent<req)statusParts.push(`尚欠 ${money(Math.max(0,req-spent))} 進入門檻`);
      if(caps.spend>0)statusParts.push(spent>=caps.spend?'已達簽賬上限':`尚餘額度 ${money(Math.max(0,caps.spend-spent))}`);
      if(spent>=req)statusParts.push(`估算回贈 ${money(capped)}`);
      status=statusParts.join(' ‧ ');
    }
    if(percent==='0%')percent=`${Math.round(progress)}%`;
    if(t.mechanic!=='standard'&&t.targetType!=='welcome'&&t.mechanic!=='stamp'&&t.mechanic!=='tier_rate')metaLines=[meta];
    const campaignLine=homepageCampaignLine(t);
    if(campaignLine&&!metaLines.includes(campaignLine)&&metaLines.length<3)metaLines=[campaignLine,...metaLines];
    const titleHtml=(t.mechanic==='standard'||t.targetType==='welcome'||t.mechanic==='stamp'||t.mechanic==='tier_rate')?esc(title):`${esc(title)} <span class="mechanic-badge">${esc(mechanicLabel(t))}</span>`;
    rows.push({targetId:t.id,mechanic:t.mechanic,card:t.name,title:titleHtml,meta,metaLines,days:time.days,dayClass:remainingDayClass(time,completed),goalClass:remainingGoalClass(time,completed),progress,percent,status,completed,stampCurrent,stampTarget,stampMilestones,stageOverview,sortCard:t.name,sortType:goalSpendType(t),sortEnd:b.end||'',sortAdded:Number(t.createdAt||0)});
  });
  return sortGoalRows(rows);
}

const goalPalettes=[
  ['#5967ff','#8c72ff','rgba(89,103,255,.25)'],['#0f9f78','#42c99c','rgba(15,159,120,.22)'],
  ['#f08a24','#f6b44a','rgba(240,138,36,.22)'],['#d4528f','#ef7daf','rgba(212,82,143,.22)'],
  ['#3f8fd8','#63b2ef','rgba(63,143,216,.22)'],['#7b61c9','#ae8bea','rgba(123,97,201,.22)'],
  ['#cf5f4b','#ef8a6d','rgba(207,95,75,.22)'],['#3d8b7d','#6bb8a9','rgba(61,139,125,.22)']
];
function goalPalette(i){return goalPalettes[i%goalPalettes.length]}
function goalPaletteForTarget(target){
  /* v27：按「目標」分配色系，不再按信用卡分配。同卡不同目標會用不同顏色。 */
  const targetIndex=Array.isArray(state?.cards)?state.cards.findIndex(x=>x.id===target?.id):-1;
  if(targetIndex>=0)return goalPalette(targetIndex);
  const seed=String(target?.id||target?.themeSeed||target?.createdAt||'0');
  let hash=2166136261;
  for(const ch of seed){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)>>>0}
  return goalPalettes[hash%goalPalettes.length];
}
function goalThemeRgba(hex,alpha){
  const m=/^#([0-9a-f]{6})$/i.exec(String(hex||''));
  if(!m)return `rgba(89,103,255,${alpha})`;
  const n=parseInt(m[1],16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return `rgba(${r},${g},${b},${alpha})`;
}
function renderStampProgress(current,target,milestones=[]){
  const total=Math.max(1,Number(target||1)),cur=Math.max(0,Number(current||0));
  if(total>8){
    const earned=Math.min(cur,total);
    return `<div class="stamp-progress-row"><div class="stamp-track"><span class="stamp-bulk ${earned>0?'earned':''}">🔖 × ${earned}</span><span class="stamp-bulk">目標 🔖 × ${total}</span></div><div class="stamp-count-label">${cur}/${total} 個</div></div>`;
  }
  const milestoneSet=new Set((milestones||[]).map(Number));
  const marks=Array.from({length:total},(_,i)=>{const logical=i+1,isMilestone=milestoneSet.has(logical);return `<span class="stamp-mark ${i<cur?'earned':''} ${isMilestone?'milestone':''}" title="第 ${logical} 個印花${isMilestone?' · 獎賞節點':''}">🔖</span>`}).join('');
  return `<div class="stamp-progress-row"><div class="stamp-track">${marks}</div><div class="stamp-count-label">${cur}/${total} 個</div></div>`;
}
function renderStageOverview(info){
  if(!info||!info.total)return '';
  const previous=(info.previous||[]).map(x=>{
    const cls=x.state==='success'?'success':x.state==='fail'?'fail':'pending';
    const icon=x.state==='success'?'✓':x.state==='fail'?'✕':'•';
    const label=x.state==='success'?'成功達標':x.state==='fail'?'未能達標':'待確認';
    return `<span class="goal-stage-state ${cls}">${icon} 階段（${x.index} / ${info.total}）${label}</span>`;
  }).join('');
  return previous?`<div class="goal-stage-history goal-stage-history-only">${previous}</div>`:'';
}
function renderGoals(){
  updateGoalSortControls();
  const rows=getGoalRows();
  const goalSectionTitle=document.getElementById('goalSectionTitle');
  if(goalSectionTitle)goalSectionTitle.textContent=`進行中的回贈目標 ( ${rows.length} 個 )`;
  const box=document.getElementById('goals');
  if(!rows.length){box.innerHTML='<div class="empty">未設定任何目標</div>';return}
  box.innerHTML=rows.map((r,i)=>{
    const [barStart,barEnd,barGlow]=goalPalette(i),delay=Math.min(i*70,420);
    return `<div class="goal ${r.completed?'completed':''} ${r.goalClass||''}" data-target-id="${r.targetId}" style="--bar-start:${barStart};--bar-end:${barEnd};--bar-glow:${barGlow};--bar-delay:${delay}ms">
      <div class="goal-body">
        <div class="goal-card">${esc(r.card)}</div>
        <div class="goal-title">${r.title}${r.completed?'<span class="trophy" title="目標達成">🏆</span>':''}<span class="goal-days ${r.dayClass}">${esc(r.days)}</span></div>
        <div class="goal-meta">${renderGoalMeta(r.metaLines||[r.meta])}</div>
        ${r.stageOverview?renderStageOverview(r.stageOverview):''}
        <div class="goal-lower">
          ${r.mechanic==='stamp'?renderStampProgress(r.stampCurrent,r.stampTarget,r.stampMilestones):`<div class="goal-progress-row"><div class="progress"><div style="--target-width:${r.progress}%"></div></div><div class="goal-percent">${r.percent}</div></div>`}
          <div class="goal-status">${renderGoalStatus(r.status)}</div>
        </div>
      </div>
      <button class="goal-modify" type="button" aria-label="修改" title="修改">✎</button>
    </div>`;
  }).join('');
  bindGoalActions();
  scheduleGoalHeightEqualize();
}
let goalHeightRaf=0;
function equalizeGoalHeights(){
  // 額度卡採用 CSS 緊湊等高，不再以內容最高的一張把全部卡拉高。
  document.querySelectorAll('#goals .goal').forEach(g=>g.style.removeProperty('height'));
}
function scheduleGoalHeightEqualize(){cancelAnimationFrame(goalHeightRaf);goalHeightRaf=requestAnimationFrame(equalizeGoalHeights)}
function bindGoalActions(){
  document.querySelectorAll('.goal').forEach(row=>{
    const modify=row.querySelector('.goal-modify');
    row.addEventListener('click',e=>{
      if(e.target.closest('.goal-modify'))return;
      const wasOpen=row.classList.contains('open');
      document.querySelectorAll('.goal.open').forEach(x=>x.classList.remove('open'));
      if(!wasOpen)requestAnimationFrame(()=>row.classList.add('open'));
    });
    modify?.addEventListener('click',e=>{
      e.stopPropagation();
      const id=row.dataset.targetId;if(!id)return;
      editingTargetId=id;creatingNewTarget=false;listCreateMode=false;editingBackup=JSON.parse(JSON.stringify(state.cards.find(x=>x.id===id)));wizardStep=1;wizardEntering='';renderSettings();openModal('settingsModal');
    });
  });
}

let goalCountdownTimer=0;
function refreshGoalCountdowns(){
  const rows=getGoalRows(),byId=new Map(rows.map(r=>[String(r.targetId),r]));
  document.querySelectorAll('#goals .goal[data-target-id]').forEach(goal=>{
    const r=byId.get(String(goal.dataset.targetId||'')),badge=goal.querySelector('.goal-days');
    if(!r||!badge)return;
    badge.textContent=r.days;
    badge.className=`goal-days ${r.dayClass||''}`.trim();
    goal.classList.toggle('caution-tape',r.goalClass==='caution-tape');
  });
}
function startGoalCountdownClock(){
  clearInterval(goalCountdownTimer);
  goalCountdownTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshGoalCountdowns()},30000);
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshGoalCountdowns()});

function monthTransactions(month=state.month){
  return state.transactions.filter(t=>String(t.date).slice(0,7)===month).sort((a,b)=>{
    const byDate=String(b.date||'').localeCompare(String(a.date||''));
    return byDate||Number(b.createdAt||0)-Number(a.createdAt||0);
  });
}
function transactionRowHtml(t,editable=true){
  const currentCard=cardByKey(t.cardKey),refs=Array.isArray(t.targetRefs)?t.targetRefs:[];
  return `<div class="tx" data-id="${t.id}"><div class="tx-content"><div class="tx-card">${esc(currentCard?.name||t.cardName||'已刪除信用卡')}</div><div class="tx-sub"><span>${esc(t.date)}</span><span class="pill">${esc(t.category||'一般簽賬')}</span>${refs.map(r=>`<span class="tx-target ${r.type==='welcome'?'welcome':''}">${esc(r.label||'目標')}</span>`).join('')}</div></div><div class="tx-amount">${money(t.amount)}</div>${editable?'<button class="tx-edit" type="button" aria-label="修改消費" title="修改">✎</button>':''}</div>`;
}
function renderTransactions(){
  const allTx=monthTransactions(),tx=allTx.slice(0,10);
  document.getElementById('txCount').textContent=`${allTx.length} 筆`;
  const more=document.getElementById('viewMoreTx');if(more)more.textContent=allTx.length>10?'查看更多':'查看全部';
  const box=document.getElementById('txList');
  if(!tx.length){box.innerHTML='<div class="empty">暫時未有消費紀錄</div>';return}
  box.innerHTML=tx.map(t=>transactionRowHtml(t,true)).join('');
  bindTransactionActions(box);
}
function renderTransactionPage(){
  const picker=document.getElementById('historyMonthPicker'),box=document.getElementById('historyTxList');if(!picker||!box)return;
  picker.value=state.month;
  const tx=monthTransactions(),total=tx.reduce((sum,t)=>sum+Math.max(0,Number(t.amount||0)),0);
  document.getElementById('historyTxCount').textContent=`${tx.length} 筆`;
  document.getElementById('historyTxTotal').textContent=money(total);
  box.innerHTML=tx.length?tx.map(t=>transactionRowHtml(t,true)).join(''):'<div class="empty">呢個月份暫時未有消費紀錄</div>';
  if(tx.length)bindTransactionActions(box);
}
let routeAnimationDirection='';
let routeAnimationTimer=0;
let mainRouteScrollY=0;
let routeInitialized=false;
function clearRouteMotion(el){
  if(!el)return;
  el.classList.remove('route-enter-from-right','route-exit-to-left','route-enter-from-left','route-exit-to-right');
}
function setPageRouteImmediate(historyMode){
  const main=document.getElementById('mainApp'),history=document.getElementById('transactionPage'),bottom=document.getElementById('bottomBar');
  clearRouteMotion(main);clearRouteMotion(history);
  main?.classList.toggle('hidden',historyMode);
  history?.classList.toggle('hidden',!historyMode);
  bottom?.classList.toggle('hidden',historyMode);
  document.body.classList.toggle('history-route',historyMode);
  document.body.classList.remove('route-transitioning');
  if(historyMode)renderTransactionPage();
  routeInitialized=true;
}
function updatePageRoute(){
  const historyMode=location.hash==='#transactions';
  let direction=routeAnimationDirection;routeAnimationDirection='';
  const main=document.getElementById('mainApp'),history=document.getElementById('transactionPage'),bottom=document.getElementById('bottomBar');
  clearTimeout(routeAnimationTimer);
  if(!main||!history){setPageRouteImmediate(historyMode);return}
  if(routeInitialized&&!direction){
    const currentlyHistory=!history.classList.contains('hidden')&&main.classList.contains('hidden');
    if(historyMode&&!currentlyHistory)direction='forward';
    else if(!historyMode&&currentlyHistory)direction='back';
  }
  if(!routeInitialized||!direction){setPageRouteImmediate(historyMode);return}

  document.body.classList.add('route-transitioning');
  clearRouteMotion(main);clearRouteMotion(history);

  if(direction==='forward'&&historyMode){
    mainRouteScrollY=window.scrollY||document.documentElement.scrollTop||0;
    bottom?.classList.add('hidden');
    main.classList.remove('hidden');
    main.classList.add('route-exit-to-left');
    routeAnimationTimer=setTimeout(()=>{
      main.classList.add('hidden');clearRouteMotion(main);
      renderTransactionPage();history.classList.remove('hidden');
      document.body.classList.add('history-route');window.scrollTo(0,0);
      history.classList.add('route-enter-from-right');
      routeAnimationTimer=setTimeout(()=>{clearRouteMotion(history);document.body.classList.remove('route-transitioning')},285);
    },225);
    return;
  }
  if(direction==='back'&&!historyMode){
    history.classList.remove('hidden');
    history.classList.add('route-exit-to-right');
    routeAnimationTimer=setTimeout(()=>{
      history.classList.add('hidden');clearRouteMotion(history);
      main.classList.remove('hidden');bottom?.classList.remove('hidden');
      document.body.classList.remove('history-route');window.scrollTo(0,mainRouteScrollY||0);
      main.classList.add('route-enter-from-left');
      routeAnimationTimer=setTimeout(()=>{clearRouteMotion(main);document.body.classList.remove('route-transitioning')},285);
    },225);
    return;
  }
  setPageRouteImmediate(historyMode);
}

function bindTransactionActions(root=document){
  root.querySelectorAll('.tx').forEach(row=>{
    const edit=row.querySelector('.tx-edit');
    row.addEventListener('click',e=>{
      if(e.target.closest('.tx-edit'))return;
      const wasOpen=row.classList.contains('open');document.querySelectorAll('.tx.open').forEach(x=>x.classList.remove('open'));
      if(!wasOpen)requestAnimationFrame(()=>row.classList.add('open'));
    });
    edit?.addEventListener('click',e=>{
      e.stopPropagation();const id=row.dataset.id;if(!id)return;openTransactionEditor(id);
    });
  });
}

let txCardScrollFrame=0,txCardCommitTimer=0;
function txCardTone(cardKey=''){
  let hash=0;for(const ch of String(cardKey))hash=(hash*31+ch.charCodeAt(0))>>>0;return hash%6;
}
function renderCardOptions(preferredCardKey=''){
  const input=document.getElementById('txCard'),carousel=document.getElementById('txCardCarousel'),label=document.getElementById('txCardSelectedLabel');
  if(!input||!carousel)return;
  const cards=getPhysicalCards();
  if(!cards.length){
    input.value='';carousel.innerHTML='<div class="tx-card-empty">未有信用卡優惠<br><small>請先按「新增優惠」建立第一個優惠</small></div>';
    if(label){label.className='tx-card-selected-label';label.textContent=''}
    renderTxCategories();return;
  }
  carousel.innerHTML=cards.map((c,i)=>`<button class="tx-card-slide tone-${txCardTone(c.cardKey)}" type="button" data-card-key="${c.cardKey}" aria-label="選擇 ${esc(c.name)}">
    <div class="tx-wallet-card">
      <div class="tx-wallet-top"><span class="tx-wallet-chip"></span><span class="tx-wallet-type">CREDIT CARD</span></div>
      <div class="tx-wallet-name">${esc(c.name)}</div>
      <div class="tx-wallet-bottom"><span>${c.targets.length} 個目標</span><span>${i+1} / ${cards.length}</span></div>
    </div></button>`).join('');
  const chosen=cards.find(c=>c.cardKey===preferredCardKey)||cards[0];
  input.value=chosen.cardKey;
  if(label){label.className='tx-card-selected-label';label.textContent=''}
  carousel.scrollLeft=0;bindTxCardCarousel();renderTxCategories();
  requestAnimationFrame(()=>{
    const slide=carousel.querySelector(`.tx-card-slide[data-card-key="${CSS.escape(chosen.cardKey)}"]`);
    if(slide){carousel.scrollLeft=Math.max(0,slide.offsetLeft-(carousel.clientWidth-slide.offsetWidth)/2)}
    updateTxCardCarouselVisual(false);
  });
}
function selectedTxCard(){return cardByKey(document.getElementById('txCard')?.value||'')}
function updateTxCardCarouselVisual(commit=true){
  const carousel=document.getElementById('txCardCarousel'),input=document.getElementById('txCard'),label=document.getElementById('txCardSelectedLabel');
  if(!carousel||!input)return;
  const slides=[...carousel.querySelectorAll('.tx-card-slide')];if(!slides.length)return;
  const center=carousel.scrollLeft+carousel.clientWidth/2,maxDist=Math.max(1,carousel.clientWidth*.72);
  let nearest=slides[0],nearestDist=Infinity;
  slides.forEach(slide=>{
    const slideCenter=slide.offsetLeft+slide.offsetWidth/2,dist=Math.abs(slideCenter-center),ratio=Math.min(1,dist/maxDist);
    slide.style.setProperty('--card-scale',(1-ratio*.09).toFixed(3));slide.style.setProperty('--card-y',`${(ratio*8).toFixed(1)}px`);slide.style.setProperty('--card-opacity',(1-ratio*.56).toFixed(3));
    if(dist<nearestDist){nearestDist=dist;nearest=slide}
  });
  slides.forEach(slide=>slide.classList.toggle('is-active',slide===nearest));
  if(!commit)return;
  const key=nearest.dataset.cardKey||'',changed=input.value!==key;input.value=key;
  const card=cardByKey(key);if(label){label.classList.toggle('has-card',!!card);label.textContent=card?.name||''}
  if(changed)input.dispatchEvent(new Event('change',{bubbles:true}));
  else renderTxCategories();
}
function bindTxCardCarousel(){
  const carousel=document.getElementById('txCardCarousel');if(!carousel)return;
  carousel.querySelectorAll('.tx-card-slide').forEach(slide=>{
    slide.onclick=()=>{const target=slide.offsetLeft-(carousel.clientWidth-slide.offsetWidth)/2;carousel.scrollTo({left:target,behavior:'smooth'});clearTimeout(txCardCommitTimer);txCardCommitTimer=setTimeout(()=>updateTxCardCarouselVisual(true),220)};
  });
  carousel.onscroll=()=>{if(txCardScrollFrame)cancelAnimationFrame(txCardScrollFrame);txCardScrollFrame=requestAnimationFrame(()=>updateTxCardCarouselVisual(false));clearTimeout(txCardCommitTimer);txCardCommitTimer=setTimeout(()=>updateTxCardCarouselVisual(true),95)};
}

function renderTxCategories(){
  const card=selectedTxCard(),select=document.getElementById('txCategory');if(!select)return;
  if(!card){select.innerHTML='<option value="">請先新增信用卡優惠</option>';select.disabled=true;renderTxTargetPicks();return}
  select.disabled=false;
  const cats=[...new Set(card.targets.flatMap(t=>[...(Array.isArray(t.rebateCategories)?t.rebateCategories:[]),...(Array.isArray(t.thresholdRewardCategories)?t.thresholdRewardCategories:[])]).map(x=>String(x).trim()).filter(Boolean))];
  const options=cats.length?cats:['一般簽賬'];
  const desired=txInitialCategory;
  if(desired&&desired!=='其他簽賬'&&!options.includes(desired))options.push(desired);
  select.innerHTML=[...options.map(cat=>`<option value="${esc(cat)}">${esc(cat)}</option>`),'<option value="__other__">其他／不屬已設定類別</option>'].join('');
  if(desired){select.value=desired==='其他簽賬'?'__other__':desired;txInitialCategory=null}
  renderTxTargetPicks();
}
function targetAutoMatches(t,category,date=localDateStr(),amount=0){
  const b=offerBounds(t);if(b.start&&date<b.start)return false;if(b.end&&date>b.end)return false;
  if(t.mechanic==='milestone'&&t.targetType!=='welcome'&&t.milestoneDateMode==='dated'){
    const stages=(t.milestones||[]).filter(x=>x.startDate&&x.endDate);if(stages.length&&!stages.some(x=>dateInRange(date,x.startDate,x.endDate)))return false;
  }
  if(Number(t.minTransaction||0)>0&&Number(amount||0)<Number(t.minTransaction))return false;
  if(t.mechanic==='stamp'&&t.stampEarnMode!=='cumulative'&&Number(amount||0)<Number(t.stampTransactionMin||0))return false;
  const cats=Array.isArray(t.rebateCategories)?t.rebateCategories.filter(Boolean):[];
  if(t.eligibilityMode==='categories')return category!=='__other__'&&cats.includes(category);
  return category!=='__other__';
}

function renderTxTargetPicks(){
  const card=selectedTxCard(),box=document.getElementById('txTargetPicks'),summary=document.getElementById('txTargetSummary');if(!box||!summary)return;
  if(!card){box.innerHTML='';summary.className='tx-target-summary none';summary.textContent='';return}
  const category=document.getElementById('txCategory')?.value||'';
  const date=document.getElementById('txDate')?.value||localDateStr();
  const targets=card.targets;
  if(!targets.length){box.innerHTML='';summary.className='tx-target-summary none';summary.textContent='此信用卡暫時未有目標';return}
  let hit=0;const preferredIds=Array.isArray(txInitialTargetIds)?txInitialTargetIds:null;
  box.innerHTML=targets.map(t=>{
    const amount=parseFloat(document.getElementById('txAmount')?.value||0);const active=preferredIds?preferredIds.includes(t.id):targetAutoMatches(t,category,date,amount);if(active)hit++;
    return `<div class="target-pick ${t.targetType==='welcome'?'welcome':''} ${active?'active':''}" data-target-id="${t.id}" role="button" tabindex="0" aria-pressed="${active?'true':'false'}">
      <span class="target-dot"></span><span class="target-copy"><strong>${esc(targetShortLabel(t))}</strong><small>${esc(targetDetailLabel(t))}</small></span>
    </div>`;
  }).join('');
  box.querySelectorAll('.target-pick').forEach(el=>{
    const toggle=()=>{el.classList.toggle('active');el.setAttribute('aria-pressed',el.classList.contains('active')?'true':'false');updateTxTargetSummary()};
    el.addEventListener('click',toggle);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
  });
  if(preferredIds)txInitialTargetIds=null;
  summary.className=`tx-target-summary ${hit?'hit':'none'}`;
  summary.textContent=hit?`${editingTransactionId?'已載入':'系統自動命中'} ${hit} 個目標；可按下個別目標亮起／熄滅`:'系統未自動命中目標；如需要仍可手動按下亮起';
}
function updateTxTargetSummary(){
  const box=document.getElementById('txTargetPicks'),summary=document.getElementById('txTargetSummary');if(!box||!summary)return;
  const n=box.querySelectorAll('.target-pick.active').length;summary.className=`tx-target-summary ${n?'hit':'none'}`;summary.textContent=n?`今次消費會計入 ${n} 個目標`:'今次消費不會計入任何目標';
}

function render(){
  document.getElementById('monthPicker').value=state.month;renderGoals();renderTransactions();renderTransactionPage();
}
let editingTransactionId=null,txInitialCategory=null,txInitialTargetIds=null;
function resetTransactionEditor(){
  editingTransactionId=null;txInitialCategory=null;txInitialTargetIds=null;
  document.getElementById('addModal')?.classList.remove('is-editing');
  const title=document.getElementById('addModalTitle'),confirm=document.getElementById('confirmAdd'),del=document.getElementById('deleteTx'),dateInput=document.getElementById('txDate');
  if(title)title.textContent='新增消費';if(confirm)confirm.textContent='新增消費';if(del)del.classList.add('hidden');if(dateInput)dateInput.value=localDateStr();
}
function openTransactionEditor(id=null){
  const title=document.getElementById('addModalTitle'),confirm=document.getElementById('confirmAdd'),amountInput=document.getElementById('txAmount'),dateInput=document.getElementById('txDate'),modal=document.getElementById('addModal'),del=document.getElementById('deleteTx');
  if(id){
    const tx=state.transactions.find(t=>t.id===id);if(!tx)return;
    editingTransactionId=id;txInitialCategory=tx.category||'一般簽賬';txInitialTargetIds=[...(tx.targetIds||[])];
    if(title)title.textContent='修改消費';if(confirm)confirm.textContent='儲存修改';if(del)del.classList.remove('hidden');modal?.classList.add('is-editing');
    if(dateInput)dateInput.value=tx.date||localDateStr();
    amountInput.value=String(Number(tx.amount||0));amountInput.style.width=`${Math.min(10,Math.max(1,amountInput.value.length||1))}ch`;
    openModal('addModal');requestAnimationFrame(()=>renderCardOptions(tx.cardKey));
  }else{
    resetTransactionEditor();amountInput.value='';amountInput.style.width='1ch';if(dateInput)dateInput.value=localDateStr();
    openModal('addModal');requestAnimationFrame(()=>renderCardOptions());
  }
}
function syncModalScrollLock(){
  const locked=[...document.querySelectorAll('.modal.show')].some(m=>m.id==='settingsModal'||m.id==='addModal');
  document.documentElement.classList.toggle('modal-open',locked);document.body.classList.toggle('modal-open',locked);
}
function openModal(id){const el=document.getElementById(id);el.classList.remove('closing');el.classList.add('show');syncModalScrollLock()}
function closeModal(id){
  const el=document.getElementById(id);if(!el.classList.contains('show'))return;
  if(id==='settingsModal'&&creatingNewTarget&&editingTargetId){const unsaved=editingTargetId;state.cards=state.cards.filter(t=>t.id!==unsaved);creatingNewTarget=false;listCreateMode=false;editingTargetId=null;editingBackup=null}
  else if(id==='settingsModal'&&!creatingNewTarget&&editingTargetId&&editingBackup){const idx=state.cards.findIndex(t=>t.id===editingTargetId);if(idx>=0)state.cards[idx]=normalizeTarget(editingBackup);editingTargetId=null;editingBackup=null;render()}
  el.classList.add('closing');setTimeout(()=>{el.classList.remove('show','closing');if(id==='addModal')resetTransactionEditor();syncModalScrollLock()},id==='addModal'?230:190);
}
document.querySelectorAll('[data-close]').forEach(b=>{b.onclick=()=>closeModal(b.dataset.close)});
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));

document.getElementById('openAdd').onclick=()=>openTransactionEditor();
document.getElementById('amountEntry')?.addEventListener('click',()=>document.getElementById('txAmount')?.focus());
document.getElementById('txAmount')?.addEventListener('input',e=>{
  let v=String(e.target.value||'').replace(/[^0-9.]/g,'');const dot=v.indexOf('.');if(dot>=0)v=v.slice(0,dot+1)+v.slice(dot+1).replace(/\./g,'').slice(0,2);v=v.replace(/^0+(?=\d)/,'');e.target.value=v;e.target.style.width=`${Math.min(10,Math.max(1,v.length||1))}ch`;renderTxTargetPicks();
});
document.getElementById('txCard').addEventListener('change',renderTxCategories);
document.getElementById('txCategory').addEventListener('change',renderTxTargetPicks);
document.getElementById('txDate')?.addEventListener('change',renderTxTargetPicks);
document.getElementById('confirmAdd').onclick=()=>{
  const card=selectedTxCard(),amount=parseFloat(document.getElementById('txAmount').value),raw=document.getElementById('txCategory').value,date=document.getElementById('txDate')?.value||'';
  if(!card){showNotice('請先新增及選擇信用卡優惠');return}
  if(!(amount>0)){showNotice('請輸入消費金額');return}
  if(!date){showNotice('請選擇消費日期');return}
  const category=raw==='__other__'?'其他簽賬':raw;
  const selectedIds=[...document.querySelectorAll('#txTargetPicks .target-pick.active')].map(x=>x.dataset.targetId).filter(Boolean);
  const selectedTargets=selectedIds.map(id=>state.cards.find(t=>t.id===id)).filter(Boolean);
  const existing=editingTransactionId?state.transactions.find(t=>t.id===editingTransactionId):null;
  const record={
    id:existing?.id||uid(),cardKey:card.cardKey,cardName:card.name,amount,category,targetIds:selectedIds,
    targetRefs:selectedTargets.map(t=>({id:t.id,type:t.targetType,label:targetShortLabel(t)})),date,createdAt:existing?.createdAt||Date.now()
  };
  if(existing){const idx=state.transactions.findIndex(t=>t.id===existing.id);if(idx>=0)state.transactions[idx]=record}else state.transactions.push(record);
  state.month=date.slice(0,7);save();render();closeModal('addModal');
};
document.getElementById('deleteTx')?.addEventListener('click',()=>{
  const id=editingTransactionId;if(!id)return;const tx=state.transactions.find(t=>t.id===id);if(!tx)return;
  askConfirm(`刪除呢筆 ${money(tx.amount)} 消費紀錄？`,()=>{
    state.transactions=state.transactions.filter(t=>t.id!==id);save();render();closeModal('addModal');showNotice('消費紀錄已刪除','success');
  },'刪除消費');
});
document.getElementById('monthPicker').onchange=e=>{state.month=e.target.value||localMonthStr();save();render()};
document.getElementById('historyMonthPicker')?.addEventListener('change',e=>{state.month=e.target.value||localMonthStr();save();render()});
document.getElementById('viewMoreTx')?.addEventListener('click',()=>{routeAnimationDirection='forward';location.hash='transactions'});
document.getElementById('historyBack')?.addEventListener('click',()=>{routeAnimationDirection='back';location.hash=''});
window.addEventListener('hashchange',updatePageRoute);

let editingTargetId=null,creatingNewTarget=false,listCreateMode=false,wizardStep=1,wizardEntering='',editingBackup=null;
const WIZARD_TOTAL=9;
const PRESET_CATEGORIES=['一般零售','網上簽賬','手機支付','感應式支付','海外簽賬','外幣簽賬','餐飲','超市','便利店','旅遊商戶','酒店','航空公司','交通','八達通','娛樂','指定商戶'];
const CATEGORY_EMOJI={
  '一般零售':'🛍️','網上簽賬':'💻','手機支付':'📱','感應式支付':'📶','海外簽賬':'✈️','外幣簽賬':'💱',
  '餐飲':'🍽️','超市':'🛒','便利店':'🏪','旅遊商戶':'🧳','酒店':'🏨','航空公司':'🛫','交通':'🚆','八達通':'🐙','娛樂':'🎬','指定商戶':'🏷️'
};
const REWARD_TYPES=['現金回贈','飛行里數','積分','獎賞錢','禮物','自訂獎賞'];
const MECHANICS=[
  ['standard','💳','指定簽賬回贈','固定回贈率，可配最低簽賬、指定類別、每期或全年上限'],
  ['tier_rate','🎯','門檻簽賬','累積滿指定金額後，可提升回贈率、直接取得現金／里數等獎賞，或解鎖指定類別回贈'],
  ['milestone','🗓️','階段獎賞','按不同日期／階段分開達標；每階段可有獨立簽賬要求及獎賞，並可設全期加碼'],
  ['stamp','🔖','印花獎賞','每次符合條件取得印花，再按數量解鎖獎賞']
];

document.getElementById('settingsBtn').onclick=()=>{
  const t=defaultTarget('rebate');t._temporary=true;state.cards.push(t);editingTargetId=t.id;creatingNewTarget=true;listCreateMode=false;editingBackup=null;wizardStep=1;wizardEntering='';renderSettings();openModal('settingsModal');
};
function renderSettings(){
  const current=state.cards.find(t=>t.id===editingTargetId),title=document.getElementById('settingsTitle'),back=document.getElementById('wizardHeaderBack');
  if(title)title.textContent=creatingNewTarget?'新增優惠':'修改優惠';
  if(back)back.classList.toggle('is-hidden',!creatingNewTarget||(!listCreateMode&&wizardStep<=1));
  document.getElementById('settingsCards').innerHTML=current?(creatingNewTarget&&!listCreateMode?renderWizard(current,wizardEntering):renderEditList(current)):'';
  wizardEntering='';
}
function wizardProgress(){const pctv=Math.round(wizardStep/WIZARD_TOTAL*100);return `<div class="wizard-progress"><div class="wizard-progress-track"><div class="wizard-progress-fill" style="width:${pctv}%"></div></div><div class="wizard-progress-text">${wizardStep} / ${WIZARD_TOTAL}</div></div>`}
function optionButton(active,icon,title,desc,onclick,extra=''){return `<button class="wizard-option ${active?'active':''} ${extra}" type="button" onclick="${onclick}"><span class="wizard-option-icon">${icon}</span><span class="wizard-option-copy"><strong>${title}</strong><small>${desc}</small></span></button>`}
function rewardTypeOptions(selected){return REWARD_TYPES.map(x=>`<option value="${x}" ${selected===x?'selected':''}>${x}</option>`).join('')}
function renderWizard(t,enter=''){const cls=enter==='forward'?' enter-forward':enter==='back'?' enter-back':'';return `<div class="wizard-shell${cls}"><div class="settings-card" data-id="${t.id}">${wizardProgress()}${renderWizardStep(t)}</div></div>`}
function editSelectOptions(items,selected){return items.map(([v,label])=>`<option value="${v}" ${selected===v?'selected':''}>${label}</option>`).join('')}
function renderMilestoneRuleFields(t,showModeQuestion=true){
  const dated=t.targetType!=='welcome',bonus=!!t.milestoneBonusEnabled;
  const modeBlock=!showModeQuestion?'':t.targetType==='welcome'
    ? `<div class="wizard-section"><div class="wizard-section-title">階段計算方式</div><div class="edit-pill welcome">累積簽賬 · 迎新期限內達標</div><div class="wizard-mini-note">迎新優惠以批卡後指定日數內的累積簽賬計算。</div></div>`
    : `<div class="wizard-section"><div class="wizard-section-title">階段計算方式</div><div class="edit-pill">按日期／階段分開計算</div><div class="wizard-mini-note">「階段獎賞」只處理不同時間或階段各自達標；如果只是同一計算期內累積到不同金額，請使用「門檻簽賬」。</div></div>`;
  const rows=t.milestones.map((x,i)=>`<div class="wizard-row-card" data-milestone-row><div class="wizard-row-head"><span>階段（${i+1}）</span>${t.milestones.length>1?`<button class="wizard-row-remove" type="button" onclick="removeRuleRow('milestone',${i},this)">刪除</button>`:''}</div>${dated?`<div class="wizard-input-grid"><div class="wizard-big-field"><label>階段開始日期</label>${milestoneDatePartsInput(i,'start',x.startDate||'')}</div><div class="wizard-big-field"><label>階段結束日期</label>${milestoneDatePartsInput(i,'end',x.endDate||'')}</div></div>`:''}<div class="wizard-big-field" style="margin-top:${dated?'12':'0'}px"><label>最低累積簽賬 HK$</label><input data-ms-threshold type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(x.threshold||0))}" oninput="sanitizeNonNegativeInteger(this)"></div><div class="wizard-input-grid" style="margin-top:12px"><div class="wizard-big-field"><label>獎賞類型</label><select data-ms-type>${rewardTypeOptions(x.rewardType)}</select></div><div class="wizard-big-field"><label>今階段獎賞額／數量</label><input data-ms-reward type="number" min="0" value="${x.reward}"></div></div></div>`).join('');
  const bonusBlock=`<div class="wizard-section"><div class="wizard-big-field"><label class="limit-question-label">全部階段完成後有加碼獎賞嗎？</label><div class="cap-enabled-grid"><button type="button" class="cap-enabled-choice ${bonus?'active':''}" onclick="setMilestoneBonusEnabled(this,'${t.id}',true)">有</button><button type="button" class="cap-enabled-choice ${!bonus?'active':''}" onclick="setMilestoneBonusEnabled(this,'${t.id}',false)">沒有</button></div>${bonus?`<div class="limit-reveal"><div class="wizard-input-grid"><div class="wizard-big-field full"><label>全期最低累積簽賬 HK$</label><input data-k="milestoneBonusSpend" data-numeric="nonnegative" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(t.milestoneBonusSpend||0))}" oninput="sanitizeNonNegativeInteger(this)"><div class="wizard-mini-note">填 0 代表只需完成所有階段。</div></div><div class="wizard-big-field"><label>加碼獎賞類型</label><select data-k="milestoneBonusType">${rewardTypeOptions(t.milestoneBonusType)}</select></div><div class="wizard-big-field"><label>加碼獎賞額／數量</label><input data-k="milestoneBonus" type="number" min="0" value="${Math.max(0,Number(t.milestoneBonus||0))}"></div></div></div>`:''}</div></div>`;
  return `${modeBlock}<div class="wizard-section milestone-stage-table"><div class="wizard-section-title">階段要求及獎賞</div>${rows}</div><button class="wizard-add-row milestone-add-row" type="button" onclick="addRuleRow('milestone',this)">＋ 加入另一個階段</button>${bonusBlock}`;
}
function thresholdCategoryButton(cat,selected){
  const em=CATEGORY_EMOJI[cat]||'🏷️';
  return `<button class="wizard-category-btn threshold-category-btn ${selected?'active':''}" type="button" data-threshold-value="${esc(cat)}" onclick="toggleThresholdCategory(this)"><span class="emoji">${em}</span>${esc(cat)}</button>`;
}
function renderThresholdRuleFields(t){
  const selected=new Set(t.thresholdRewardCategories||[]),custom=[...selected].filter(x=>!PRESET_CATEGORIES.includes(x));
  const tiers=t.tiers||[];
  const hasCategoryRate=tiers.some(x=>(x.rewardMode||'rate')==='category_rate');
  const rows=tiers.map((x,i)=>{
    const mode=['rate','reward','category_rate'].includes(x.rewardMode)?x.rewardMode:'rate';
    const remove=tiers.length>1?`<button class="wizard-row-remove" type="button" onclick="removeRuleRow('tier',${i},this)">刪除</button>`:'';
    const rewardFields=mode==='reward'
      ? `<div class="wizard-input-grid" style="margin-top:12px"><div class="wizard-big-field"><label>達標獎賞類型</label><select data-tier-reward-type onchange="rewardTypeChanged(this,'${t.id}')">${rewardTypeOptions(x.rewardType)}</select></div><div class="wizard-big-field"><label>${isTextRewardType(x.rewardType)?'禮物／獎賞內容':'獎賞額／數量'}</label>${tierRewardInput(x.rewardType,x.reward)}</div></div>`
      : `<div class="wizard-big-field" style="margin-top:12px"><label>${mode==='category_rate'?'指定類別回贈率 %':'回贈率 %'}</label><input data-tier-rate type="number" min="0" step="0.01" value="${Math.max(0,Number(x.rate||0))}"></div>`;
    return `<div class="wizard-row-card" data-tier-row data-tier-mode="${mode}"><div class="wizard-row-head"><span>門檻 ${i+1}</span>${remove}</div><div class="wizard-big-field"><label class="limit-question-label">門檻 ${i+1} 達標後會得到什麼？</label><div class="threshold-mode-grid"><button type="button" class="threshold-mode-choice ${mode==='rate'?'active':''}" onclick="setTierRewardMode(this,'${t.id}',${i},'rate')"><strong>📈 回贈率</strong><small>達到呢個門檻後套用指定回贈率。</small></button><button type="button" class="threshold-mode-choice ${mode==='reward'?'active':''}" onclick="setTierRewardMode(this,'${t.id}',${i},'reward')"><strong>🎁 直接獎賞</strong><small>現金、里數、積分或其他指定獎賞。</small></button><button type="button" class="threshold-mode-choice ${mode==='category_rate'?'active':''}" onclick="setTierRewardMode(this,'${t.id}',${i},'category_rate')"><strong>🏷️ 指定類別回贈</strong><small>達標後解鎖指定類別回贈率。</small></button></div></div><div class="wizard-big-field" style="margin-top:14px"><label>累積簽滿 HK$</label><input data-tier-threshold type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(x.threshold||0))}" oninput="sanitizeNonNegativeInteger(this)"></div>${rewardFields}</div>`;
  }).join('');
  const categoryBlock=hasCategoryRate?`<div class="wizard-section"><div class="wizard-section-title">指定類別回贈適用類別</div><div class="wizard-chip-row">${PRESET_CATEGORIES.map(cat=>thresholdCategoryButton(cat,selected.has(cat))).join('')}</div><div class="custom-category-caption">其他自定義類別</div><div class="category-input-row"><input class="threshold-category-new" autocomplete="off" placeholder="輸入自定義類別"><button class="category-add" type="button" onclick="addThresholdCategoryTag(this)">＋</button></div><div class="threshold-custom-category-tags custom-category-tags">${custom.map(cat=>`<button class="cat-chip" type="button" data-threshold-category="${esc(cat)}" onclick="this.remove()">${esc(cat)} <span>×</span></button>`).join('')}</div><div class="threshold-category-note">只有揀了「指定類別回贈」的門檻會使用這組類別；其他門檻仍可各自設定回贈率或直接獎賞。</div></div>`:'';
  return `<div class="wizard-section threshold-tier-table"><div class="wizard-section-title">門檻要求及獎賞</div><div class="wizard-mini-note" style="margin-bottom:14px">每個門檻都可以用唔同獎賞方式，例如門檻 1 升回贈率、門檻 2 直接送里數。</div>${rows}</div><button class="wizard-add-row threshold-add-row" type="button" onclick="addRuleRow('tier',this)">＋ 加入另一個門檻</button>${categoryBlock}`;
}
function renderStampRuleFields(t){
  const repeat=t.stampMode==='repeat',cumulative=t.stampEarnMode==='cumulative',daily=!!t.stampDailyCapEnabled;
  const earnBlock=`<div class="wizard-section"><div class="wizard-big-field"><label class="limit-question-label">點樣取得印花？</label><div class="cap-enabled-grid"><button type="button" class="cap-enabled-choice ${!cumulative?'active':''}" onclick="setStampEarnMode(this,'${t.id}','per_txn')">每筆達標即獲印花</button><button type="button" class="cap-enabled-choice ${cumulative?'active':''}" onclick="setStampEarnMode(this,'${t.id}','cumulative')">累積簽賬換印花</button></div><div class="wizard-mini-note">「每筆達標」例如每筆滿 HK$30 就得 1 個；「累積簽賬」則幾筆消費可以累積，每滿 HK$30 就得 1 個。</div></div><div class="wizard-input-grid" style="margin-top:18px"><div class="wizard-big-field"><label>${cumulative?'每累積簽賬':'每筆簽滿'} HK$</label><input data-k="stampTransactionMin" type="number" min="${cumulative?'0.01':'0'}" step="0.01" value="${t.stampTransactionMin}"></div><div class="wizard-big-field"><label>${cumulative?'每達門檻獲得印花':'每次獲得印花'}</label><input data-k="stampsPerTxn" type="number" min="1" step="1" value="${t.stampsPerTxn}"></div></div></div>
  <div class="wizard-section"><div class="wizard-big-field"><label class="limit-question-label">每日設有印花上限嗎？</label><div class="cap-enabled-grid"><button type="button" class="cap-enabled-choice ${daily?'active':''}" onclick="setStampDailyCapEnabled(this,'${t.id}',true)">有</button><button type="button" class="cap-enabled-choice ${!daily?'active':''}" onclick="setStampDailyCapEnabled(this,'${t.id}',false)">沒有</button></div>${daily?`<div class="limit-reveal"><label>每日最多可獲印花</label><input data-k="stampDailyCap" type="number" min="1" step="1" value="${Math.max(1,Number(t.stampDailyCap||1))}"><div class="wizard-mini-note">例如每天只限取一次印花，就填 1。</div></div>`:''}</div></div>`;
  const modeBlock=`<div class="wizard-section"><div class="wizard-big-field"><label class="limit-question-label">印花獎賞點樣發放？</label><div class="cap-enabled-grid"><button type="button" class="cap-enabled-choice ${repeat?'active':''}" onclick="setStampMode(this,'${t.id}','repeat')">集滿指定印花數循環獎賞</button><button type="button" class="cap-enabled-choice ${!repeat?'active':''}" onclick="setStampMode(this,'${t.id}','stages')">逐個階段設定</button></div></div></div>`;
  if(repeat){
    return `${earnBlock}${modeBlock}<div class="wizard-section"><div class="wizard-section-title">循環印花獎賞</div><div class="wizard-input-grid"><div class="wizard-big-field"><label>集滿幾多個印花發放一次獎賞</label><input data-k="stampRepeatEvery" type="number" min="1" value="${Math.max(1,Number(t.stampRepeatEvery||1))}"></div><div class="wizard-big-field"><label>每次獎賞類型</label><select data-k="stampRepeatRewardType">${rewardTypeOptions(t.stampRepeatRewardType)}</select></div><div class="wizard-big-field"><label>每次獎賞額／數量</label><input data-k="stampRepeatReward" type="number" min="0" value="${Math.max(0,Number(t.stampRepeatReward||0))}"></div><div class="wizard-big-field"><label>印花上限（個）</label><input data-k="stampCap" type="number" min="0" value="${Math.max(0,Number(t.stampCap||0))}"><div class="wizard-mini-note">0 = 不設上限</div></div><div class="wizard-big-field"><label>獎勵上限（次）</label><input data-k="stampRewardCap" type="number" min="0" value="${Math.max(0,Number(t.stampRewardCap||0))}"><div class="wizard-mini-note">0 = 不設上限</div></div></div><div class="stamp-mode-note">例如集滿 5 個印花賞 HK$50，獎勵上限 3 次，即最多於 5／10／15 個印花各獎一次。</div></div>`;
  }
  return `${earnBlock}${modeBlock}<div class="wizard-section"><div class="wizard-section-title">逐個階段設定</div>${t.stampMilestones.map((x,i)=>`<div class="wizard-row-card" data-stamp-row><div class="wizard-row-head"><span>階段 ${i+1}</span>${t.stampMilestones.length>1?`<button class="wizard-row-remove" type="button" onclick="removeRuleRow('stamp',${i})">刪除</button>`:''}</div><div class="wizard-big-field"><label>集齊幾多個印花</label><input data-stamp-count type="number" min="1" value="${x.count}"></div><div class="wizard-input-grid" style="margin-top:12px"><div class="wizard-big-field"><label>獎賞類型</label><select data-stamp-type>${rewardTypeOptions(x.rewardType)}</select></div><div class="wizard-big-field"><label>今階段新增獎賞額</label><input data-stamp-reward type="number" min="0" value="${x.reward}"></div></div></div>`).join('')}<button class="wizard-add-row" type="button" onclick="addRuleRow('stamp')">＋ 加一個印花階段</button><div class="wizard-big-field" style="margin-top:14px"><label>印花上限（個，可選）</label><input data-k="stampCap" type="number" min="0" value="${Math.max(0,Number(t.stampCap||0))}"><div class="wizard-mini-note">0 = 不設上限</div></div></div>`;
}
function renderEditRuleFields(t){
  if(t.mechanic==='tier_rate')return renderThresholdRuleFields(t);
  if(t.mechanic==='milestone'||t.mechanic==='custom')return renderMilestoneRuleFields(t);
  if(t.mechanic==='recurring')return `<div class="wizard-section"><div class="wizard-section-title">每期達標</div><div class="wizard-big-field"><label>每期簽賬要求 HK$</label><input data-k="recurringThreshold" type="number" min="0" value="${t.recurringThreshold}"></div><div class="wizard-input-grid" style="margin-top:12px"><div class="wizard-big-field"><label>每期獎賞類型</label><select data-k="recurringRewardType">${rewardTypeOptions(t.recurringRewardType)}</select></div><div class="wizard-big-field"><label>每期獎賞額</label><input data-k="recurringReward" type="number" min="0" value="${t.recurringReward}"></div><div class="wizard-big-field"><label>全部完成額外獎賞</label><select data-k="completionBonusType">${rewardTypeOptions(t.completionBonusType)}</select></div><div class="wizard-big-field"><label>額外獎賞額</label><input data-k="completionBonus" type="number" min="0" value="${t.completionBonus}"></div></div><div class="wizard-mini-note">系統按每月分開計算，再判斷整段推廣期有冇全部完成。</div></div>`;
  if(t.mechanic==='stamp')return renderStampRuleFields(t);
  return `<div class="wizard-section"><div class="wizard-input-grid"><div class="wizard-big-field"><label>最低累積簽賬 HK$</label><input data-k="spendRequirement" data-numeric="nonnegative" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(t.spendRequirement||0))}" oninput="sanitizeNonNegativeInteger(this)"></div><div class="wizard-big-field"><label>回贈率 %</label><input data-k="rebateRate" type="number" min="0" step="0.1" value="${t.rebateRate}" oninput="syncCapAfterRateInput(this,'${t.id}')"></div></div></div>`;
}
function editYesNoToggle(id,enabled,handler){
  const on=!!enabled;
  return `<div class="edit-yn-toggle"><span class="${on?'active':''}">有</span><button class="edit-switch ${on?'on':''}" type="button" role="switch" aria-checked="${on?'true':'false'}" aria-label="${on?'目前：有；按一下改為沒有':'目前：沒有；按一下改為有'}" onclick="${handler}(this,'${id}',${on?'false':'true'})"><i></i></button><span class="${!on?'active':''}">沒有</span></div>`;
}
function renderListCreateRuleFields(t){
  if(t.mechanic==='standard'){
    const spendLabel=t.periodType==='monthly'?'每月最低累積簽賬':'最低累積簽賬';
    return `<div class="edit-row"><div class="edit-copy"><div class="edit-label">${spendLabel}</div><div class="edit-desc">達到呢個累積簽賬要求後計算回贈。</div></div><div class="edit-control"><input data-k="spendRequirement" data-numeric="nonnegative" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(t.spendRequirement||0))}" placeholder="HK$" oninput="sanitizeNonNegativeInteger(this)"></div></div><div class="edit-row"><div class="edit-copy"><div class="edit-label">回贈率</div><div class="edit-desc">輸入百分比；如已設上限，會同步更新簽賬／回贈上限換算。</div></div><div class="edit-control"><input data-k="rebateRate" type="number" min="0" step="0.1" value="${t.rebateRate}" placeholder="%" oninput="syncCapAfterRateInput(this,'${t.id}')"></div></div>`;
  }
  if(t.mechanic==='recurring'){
    return `<div class="edit-row"><div class="edit-copy"><div class="edit-label">每期簽賬要求</div></div><div class="edit-control"><input data-k="recurringThreshold" type="number" min="0" value="${t.recurringThreshold}" placeholder="HK$"></div></div><div class="edit-row"><div class="edit-copy"><div class="edit-label">每期獎賞類型</div></div><div class="edit-control"><select data-k="recurringRewardType">${rewardTypeOptions(t.recurringRewardType)}</select></div></div><div class="edit-row"><div class="edit-copy"><div class="edit-label">每期獎賞額</div></div><div class="edit-control"><input data-k="recurringReward" type="number" min="0" value="${t.recurringReward}"></div></div><div class="edit-row"><div class="edit-copy"><div class="edit-label">全部完成額外獎賞</div></div><div class="edit-control"><select data-k="completionBonusType">${rewardTypeOptions(t.completionBonusType)}</select><div class="limit-reveal"><input data-k="completionBonus" type="number" min="0" value="${t.completionBonus}" placeholder="獎賞額／數量"></div></div></div>`;
  }
  return renderEditRuleFields(t);
}
function renderEditList(t){
  const selected=new Set(t.rebateCategories||[]),custom=[...selected].filter(x=>!PRESET_CATEGORIES.includes(x));
  const typeLabel=t.targetType==='welcome'?'迎新優惠':'簽賬回贈';
  const stageDated=(t.mechanic==='milestone'||t.mechanic==='custom')&&t.targetType!=='welcome';
  const periodOptions=t.targetType==='welcome'?[['approval_window','批卡後指定日數']]:[['monthly','每月'],['yearly','全年'],['campaign','指定推廣期']];
  const mechanicOptions=MECHANICS.map(([k,,n])=>[k,n]);
  return `<div class="edit-shell list-create-shell"><div class="settings-card" data-id="${t.id}">
    <div class="edit-hero"><div class="edit-eyebrow">${creatingNewTarget?'＋ 清單式新增':'✎ 清單式修改'} · ${esc(typeLabel)}</div><h2 class="edit-title">${esc(t.name||'未命名信用卡')}</h2><p class="edit-subtitle">${creatingNewTarget?'一次過以清單形式填寫優惠目標所有設定；適合想直接查看全部欄位再逐項設定。':'修改優惠同樣使用清單形式：左面係描述，右面係輸入／選擇；有關欄位會以動畫展開及收埋。'}</p></div>

    <section class="edit-section"><div class="edit-section-head"><strong>基本資料</strong><small>信用卡、優惠大類同計算玩法。</small></div>
      <div class="edit-row"><div class="edit-copy"><div class="edit-label">信用卡</div><div class="edit-desc">輸入現有卡名可以移去同一張實體信用卡。</div></div><div class="edit-control"><input data-k="name" class="card-name-input wizard-name-input" autocomplete="off" value="${esc(t.name)}"></div></div>
      <div class="edit-row"><div class="edit-copy"><div class="edit-label">優惠類別</div><div class="edit-desc">簽賬回贈或迎新優惠。</div></div><div class="edit-control"><select data-k="targetType" onchange="editListRefresh('${t.id}','targetType',this)"><option value="rebate" ${t.targetType==='rebate'?'selected':''}>簽賬回贈</option><option value="welcome" ${t.targetType==='welcome'?'selected':''}>迎新優惠</option></select></div></div>
      <div class="edit-row"><div class="edit-copy"><div class="edit-label">達標形式</div><div class="edit-desc">${t.targetType==='welcome'?'迎新優惠固定以累積簽賬計算。':'改變玩法後，下方「達標規則」會即時轉成相應清單。'}</div></div><div class="edit-control">${t.targetType==='welcome'?`<div class="edit-pill welcome">階段獎賞 · 累積簽賬</div>`:`<select data-k="mechanic" onchange="editListRefresh('${t.id}','mechanic',this)">${editSelectOptions(mechanicOptions,t.mechanic)}</select>`}</div></div>
    </section>

    <section class="edit-section"><div class="edit-section-head"><strong>合資格簽賬</strong><small>決定邊啲交易可以計入呢個優惠。</small></div>
      <div class="edit-row"><div class="edit-copy"><div class="edit-label">合資格簽賬範圍</div><div class="edit-desc">所有合資格簽賬，或者只限指定類別。</div></div><div class="edit-control"><select data-k="eligibilityMode" onchange="editListRefresh('${t.id}','eligibilityMode',this)"><option value="all" ${t.eligibilityMode==='all'?'selected':''}>所有合資格簽賬</option><option value="categories" ${t.eligibilityMode==='categories'?'selected':''}>指定類別</option></select>${t.eligibilityMode==='categories'?`<div class="edit-categories ui-expandable"><div class="wizard-chip-row">${PRESET_CATEGORIES.map(cat=>categoryButton(cat,selected.has(cat))).join('')}</div><div class="custom-category-caption">其他自定義類別</div><div class="category-input-row"><input class="category-new" autocomplete="off" placeholder="輸入自定義類別"><button class="category-add" type="button" onclick="addCategoryTag(this)">＋</button></div><div class="custom-category-tags">${custom.map(cat=>`<button class="cat-chip" type="button" data-value="${esc(cat)}" onclick="this.remove()">${esc(cat)} <span>×</span></button>`).join('')}</div></div>`:''}</div></div>
      <div class="edit-row"><div class="edit-copy"><div class="edit-label">設有每筆最低簽賬嗎</div><div class="edit-desc">開啟後可輸入每筆最低簽賬金額。</div></div><div class="edit-control">${editYesNoToggle(t.id,t.minTransactionEnabled,'setMinTransactionEnabled')}${t.minTransactionEnabled?`<div class="limit-reveal ui-expandable"><input data-k="minTransaction" type="number" min="0" value="${t.minTransaction}" placeholder="每筆最低簽賬 HK$"></div>`:''}</div></div>
    </section>

    <section class="edit-section"><div class="edit-section-head"><strong>達標規則</strong><small>${esc(mechanicLabel(t))} 專用設定。</small></div><div class="edit-rule-block ui-expandable">${renderListCreateRuleFields(t)}</div></section>

    <section class="edit-section"><div class="edit-section-head"><strong>簽賬上限及週期</strong><small>優惠簽賬／回贈上限、計算週期及有效日期。</small></div>
      <div class="edit-row"><div class="edit-copy"><div class="edit-label">設有簽賬或回贈上限嗎</div><div class="edit-desc">開啟後，可輸入簽賬上限或回贈上限；另一邊會按回贈率自動換算。</div></div><div class="edit-control">${editYesNoToggle(t.id,t.capEnabled,'setCapEnabled')}${t.capEnabled?linkedCapFields(t,true):''}</div></div>
      ${stageDated?`<div class="edit-row edit-dynamic-row ui-expandable"><div class="edit-copy"><div class="edit-label">計算週期</div><div class="edit-desc">每個階段自己設定開始及結束日期，所以毋須再設定另一個週期。</div></div><div class="edit-control"><div class="edit-pill">按階段日期計算</div></div></div>`:`<div class="edit-row"><div class="edit-copy"><div class="edit-label">幾耐重置一次</div><div class="edit-desc">修改後會按新週期重新判斷交易進度。</div></div><div class="edit-control"><select data-k="periodType" onchange="editListRefresh('${t.id}','periodType',this)">${editSelectOptions(periodOptions,t.periodType)}</select></div></div>${t.periodType==='approval_window'?`<div class="edit-row edit-dynamic-row ui-expandable"><div class="edit-copy"><div class="edit-label">批卡日期及有效日數</div><div class="edit-desc">由批卡日起計指定日數。</div></div><div class="edit-control"><div class="edit-grid2">${datePartsInput('approvalDate',t.approvalDate)}<input data-k="welcomeDays" type="number" min="1" value="${t.welcomeDays}"></div></div></div>`:`<div class="edit-row edit-dynamic-row ui-expandable"><div class="edit-copy"><div class="edit-label">推廣日期</div><div class="edit-desc">兩者都可以留空。</div></div><div class="edit-control"><div class="edit-date-stack"><div><div class="edit-label" style="margin-bottom:8px">推廣開始日期（可選）</div>${datePartsInput('startDate',t.startDate)}</div><div><div class="edit-label" style="margin-bottom:8px">推廣結束日期（可選）</div>${datePartsInput('endDate',t.endDate)}</div></div></div></div>`}`}
    </section>

    <div class="edit-actions"><button class="edit-save" type="button" onclick="saveTarget('${t.id}')">${creatingNewTarget?'新增優惠目標':'儲存修改'}</button>${creatingNewTarget?`<button class="edit-danger" type="button" onclick="closeModal('settingsModal')">取消新增</button>`:`<button class="edit-danger" type="button" onclick="removeTarget('${t.id}')">刪除呢個優惠</button>`}</div>
  </div></div>`;
}
function rerenderEditPreserveScroll(){
  const shell=document.querySelector('#settingsCards .edit-shell'),y=shell?.scrollTop||0;
  renderSettings();requestAnimationFrame(()=>{const next=document.querySelector('#settingsCards .edit-shell');if(next)next.scrollTop=y});
}
function rerenderWizardPreserveScroll(){
  const shell=document.querySelector('#settingsCards .wizard-shell'),y=shell?.scrollTop||0;
  renderSettings();requestAnimationFrame(()=>{const next=document.querySelector('#settingsCards .wizard-shell');if(next)next.scrollTop=y});
}
function animateUiCollapse(elements,done){
  const list=[...new Set((Array.isArray(elements)?elements:[elements]).filter(Boolean))];
  if(!list.length){done?.();return}
  list.forEach(el=>{
    el.style.setProperty('--ui-collapse-height',`${Math.max(el.scrollHeight,el.offsetHeight,1)}px`);
    el.classList.remove('ui-expandable');
    void el.offsetWidth;
    el.classList.add('ui-collapsing');
  });
  setTimeout(()=>done?.(),250);
}
function setEditSwitchVisual(btn,on){
  if(!btn?.classList?.contains('edit-switch'))return false;
  btn.classList.toggle('on',!!on);btn.setAttribute('aria-checked',on?'true':'false');
  btn.setAttribute('aria-label',on?'目前：有；按一下改為沒有':'目前：沒有；按一下改為有');
  const wrap=btn.closest('.edit-yn-toggle'),labels=wrap?[...wrap.querySelectorAll(':scope > span')]:[];
  labels[0]?.classList.toggle('active',!!on);labels[1]?.classList.toggle('active',!on);
  return true;
}
function rerenderForCurrentEditor(){
  creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll();
}
function commitToggleWithMotion(btn,on,commit,collapseSelector){
  const isSwitch=setEditSwitchVisual(btn,on),scope=btn?.closest('.edit-control,.wizard-big-field,.wizard-section')||document;
  const reveal=!on&&collapseSelector?scope.querySelector(collapseSelector):null;
  const finish=()=>{commit();rerenderForCurrentEditor()};
  if(reveal){animateUiCollapse(reveal,finish);return}
  if(isSwitch){setTimeout(finish,230);return}
  finish();
}
window.editListRefresh=(id,field,source)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;
  const root=source?.closest('.settings-card')||document.querySelector(`.settings-card[data-id="${id}"]`);
  const collapse=[];
  if(field==='eligibilityMode')root?.querySelector('.edit-categories')&&collapse.push(root.querySelector('.edit-categories'));
  if(field==='mechanic')root?.querySelector('.edit-rule-block')&&collapse.push(root.querySelector('.edit-rule-block'));
  if(field==='periodType')root?.querySelector('.edit-dynamic-row')&&collapse.push(root.querySelector('.edit-dynamic-row'));
  if(field==='targetType')root?.querySelectorAll('.edit-rule-block,.edit-dynamic-row').forEach(x=>collapse.push(x));
  const apply=()=>{
    syncEditorDraft(id);
    if(field==='targetType'&&t.targetType==='welcome'){t.mechanic='milestone';if(t.periodType==='monthly')t.periodType='approval_window'}
    if(field==='capType'&&t.capType==='none'){t.capEnabled=false;t.capAmount=0}
    rerenderEditPreserveScroll();
  };
  collapse.length?animateUiCollapse(collapse,apply):apply();
};

window.rewardTypeChanged=(select,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;
  syncEditorDraft(id);
  rerenderForCurrentEditor();
};
function transitionWizard(nextStep,direction='forward',syncCurrent=true){
  const t=state.cards.find(x=>x.id===editingTargetId);if(syncCurrent&&t)syncEditorDraft(t.id);
  const target=Math.max(1,Math.min(WIZARD_TOTAL,nextStep));if(target===wizardStep)return;
  const shell=document.querySelector('#settingsCards .wizard-shell');const finish=()=>{wizardStep=target;wizardEntering=direction;renderSettings()};
  if(!shell){finish();return}shell.classList.add(direction==='back'?'exit-back':'exit-forward');setTimeout(finish,260);
}
function flashThen(btn,callback){
  if(!btn){callback();return}btn.disabled=true;btn.classList.add('is-confirming');setTimeout(()=>{callback()},420);
}
function answerAdvance(btn,mutate,next=wizardStep+1){const t=state.cards.find(x=>x.id===editingTargetId);if(!t)return;syncEditorDraft(t.id);mutate?.(t);flashThen(btn,()=>transitionWizard(next,'forward',false))}
function splitDateParts(value){
  const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?[m[1],m[2],m[3]]:['','',''];
}
function datePartsInput(key,value,compact=false){
  const [y,m,d]=splitDateParts(value),cls=compact?'date-parts compact':'date-parts';
  return `<div class="${cls}" data-date-key="${esc(key)}"><input class="date-part" data-date-part="year" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="年" aria-label="年份" value="${y}" oninput="handleDatePartInput(this)" onblur="handleDatePartBlur(this)" onkeydown="handleDatePartKeydown(event,this)"><span class="date-sep">/</span><input class="date-part" data-date-part="month" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="月" aria-label="月份" value="${m}" oninput="handleDatePartInput(this)" onblur="handleDatePartBlur(this)" onkeydown="handleDatePartKeydown(event,this)"><span class="date-sep">/</span><input class="date-part" data-date-part="day" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="日" aria-label="日份" value="${d}" oninput="handleDatePartInput(this)" onblur="handleDatePartBlur(this)" onkeydown="handleDatePartKeydown(event,this)"></div>`;
}
function milestoneDatePartsInput(index,edge,value){
  const [y,m,d]=splitDateParts(value);
  return `<div class="date-parts compact" data-ms-date="${edge}" data-ms-index="${index}"><input class="date-part" data-date-part="year" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="年" aria-label="年份" value="${y}" oninput="handleDatePartInput(this)" onblur="handleDatePartBlur(this)" onkeydown="handleDatePartKeydown(event,this)"><span class="date-sep">/</span><input class="date-part" data-date-part="month" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="月" aria-label="月份" value="${m}" oninput="handleDatePartInput(this)" onblur="handleDatePartBlur(this)" onkeydown="handleDatePartKeydown(event,this)"><span class="date-sep">/</span><input class="date-part" data-date-part="day" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="日" aria-label="日份" value="${d}" oninput="handleDatePartInput(this)" onblur="handleDatePartBlur(this)" onkeydown="handleDatePartKeydown(event,this)"></div>`;
}
function validDateParts(y,m,d){
  if(!/^\d{4}$/.test(y)||!/^\d{2}$/.test(m)||!/^\d{2}$/.test(d))return false;
  const yy=Number(y),mm=Number(m),dd=Number(d),dt=new Date(yy,mm-1,dd);
  return mm>=1&&mm<=12&&dd>=1&&dd<=31&&dt.getFullYear()===yy&&dt.getMonth()===mm-1&&dt.getDate()===dd;
}
function validateDateGroup(group,strict=false){
  if(!group)return true;
  const y=group.querySelector('[data-date-part="year"]')?.value||'',m=group.querySelector('[data-date-part="month"]')?.value||'',d=group.querySelector('[data-date-part="day"]')?.value||'';
  const any=!!(y||m||d),full=/^\d{4}$/.test(y)&&/^\d{2}$/.test(m)&&/^\d{2}$/.test(d);
  const impossibleMonth=/^\d{2}$/.test(m)&&(Number(m)<1||Number(m)>12),impossibleDay=/^\d{2}$/.test(d)&&(Number(d)<1||Number(d)>31);
  const invalid=any&&(impossibleMonth||impossibleDay||(full&&!validDateParts(y,m,d))||(strict&&!full));
  group.classList.toggle('is-invalid',invalid);group.querySelectorAll('.date-part').forEach(x=>x.setAttribute('aria-invalid',invalid?'true':'false'));
  return !invalid;
}
function normalizeDatePartValue(el){
  if(!el)return;
  const part=el.dataset.datePart;
  if((part==='month'||part==='day')&&/^\d$/.test(el.value))el.value=String(el.value).padStart(2,'0');
}
function normalizeDateGroup(group){if(!group)return;group.querySelectorAll('.date-part').forEach(normalizeDatePartValue)}
function validateVisibleDateInputs(container=document,focusFirst=true){
  const groups=[...container.querySelectorAll('.date-parts')].filter(g=>g.offsetParent!==null);groups.forEach(normalizeDateGroup);
  const bad=groups.filter(g=>!validateDateGroup(g,true));
  if(bad.length&&focusFirst)bad[0].querySelector('.date-part')?.focus();
  return bad.length===0;
}
window.handleDatePartInput=el=>{
  const max=el.dataset.datePart==='year'?4:2;el.value=String(el.value||'').replace(/\D/g,'').slice(0,max);
  const group=el.closest('.date-parts');validateDateGroup(group,false);
  if(el.value.length===max){const parts=[...group.querySelectorAll('.date-part')],i=parts.indexOf(el);if(i>=0&&i<parts.length-1){parts[i+1].focus();parts[i+1].select?.()}}
};
window.handleDatePartBlur=el=>{normalizeDatePartValue(el);validateDateGroup(el.closest('.date-parts'),false)};
window.sanitizeNonNegativeInteger=el=>{el.value=String(el.value||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'')};
window.handleDatePartKeydown=(e,el)=>{
  if(e.key!=='Backspace'||el.value)return;const parts=[...el.closest('.date-parts').querySelectorAll('.date-part')],i=parts.indexOf(el);if(i>0){e.preventDefault();parts[i-1].focus();parts[i-1].setSelectionRange?.(parts[i-1].value.length,parts[i-1].value.length)}
};
function renderLimitSettings(t,buttonText='套用呢個限制設定',buttonAction=`finishLimits(this,'${t.id}')`){
  const minEnabled=t.minTransactionEnabled!==undefined?!!t.minTransactionEnabled:Number(t.minTransaction||0)>0;
  return `<div class="wizard-section"><div class="limit-fields">
    <div class="wizard-big-field"><label class="limit-question-label">設有每筆最低簽賬嗎</label><div class="cap-enabled-grid"><button type="button" class="cap-enabled-choice ${minEnabled?'active':''}" onclick="setMinTransactionEnabled(this,'${t.id}',true)">有</button><button type="button" class="cap-enabled-choice ${!minEnabled?'active':''}" onclick="setMinTransactionEnabled(this,'${t.id}',false)">沒有</button></div>${minEnabled?`<div class="limit-reveal"><label>每筆最低簽賬 HK$</label><input data-k="minTransaction" type="number" min="0" value="${t.minTransaction}" placeholder="HK$"></div>`:''}</div>
    <div class="wizard-big-field"><label class="limit-question-label">設有簽賬或回贈上限嗎</label><div class="cap-enabled-grid"><button type="button" class="cap-enabled-choice ${t.capEnabled?'active':''}" onclick="setCapEnabled(this,'${t.id}',true)">有</button><button type="button" class="cap-enabled-choice ${!t.capEnabled?'active':''}" onclick="setCapEnabled(this,'${t.id}',false)">沒有</button></div></div>
    ${t.capEnabled?`<div class="wizard-big-field limit-cap-amount"><label>上限金額（可輸入任何一邊）</label>${linkedCapFields(t)}</div>`:''}
  </div></div><button class="wizard-answer" type="button" onclick="${buttonAction}">${buttonText}</button>`;
}

function categoryButton(cat,selected){const em=CATEGORY_EMOJI[cat]||'🏷️';return `<button class="wizard-category-btn ${selected?'active':''}" type="button" data-value="${esc(cat)}" onclick="togglePresetCategory(this)"><span class="emoji">${em}</span>${esc(cat)}</button>`}

function cardBankGroup(name=''){
  const n=String(name||'').toLocaleLowerCase('zh-HK');
  const groups=[
    [/citi|花旗/,'Citi 花旗'],[/渣打|standard chartered/,'渣打'],[/dbs|星展/,'DBS 星展'],
    [/信銀國際|中信銀行\(國際\)|中信銀行（國際）|citic/,'中信銀行（國際）'],[/mox/,'Mox'],[/^sim |sim credit|sim world/,'sim'],
    [/滙豐|匯豐|hsbc/,'滙豐'],[/恒生|hang seng/,'恒生'],[/airwallex|雲匯/,'Airwallex'],
    [/美國運通|american express|amex/,'美國運通'],[/中銀|boc/,'中銀香港'],[/富邦|fubon/,'富邦'],
    [/安信|primecredit/,'安信'],[/大新|dah sing/,'大新'],[/aeon/,'AEON']
  ];
  for(const [re,label] of groups)if(re.test(n))return label;
  return '其他信用卡';
}
function wizardCardSuggestionNames(){
  const existing=getPhysicalCards().map(c=>c.name).filter(Boolean);
  const preset=[...document.querySelectorAll('#cardNameSuggestions option')].map(o=>o.value).filter(Boolean);
  return [...new Set([...existing,...preset])].sort((a,b)=>{const ga=cardBankGroup(a),gb=cardBankGroup(b),g=ga.localeCompare(gb,'zh-HK');return g||a.localeCompare(b,'zh-HK')});
}
function renderWizardCardPicker(t,excludeExisting=false){
  const existing=getPhysicalCards(),keyByName=new Map(existing.map(c=>[normalizeCardName(c.name),c.cardKey]));
  const existingNames=new Set(existing.map(c=>normalizeCardName(c.name)));
  const names=wizardCardSuggestionNames().filter(name=>!excludeExisting||!existingNames.has(normalizeCardName(name)));
  const grouped=new Map();names.forEach(name=>{const bank=cardBankGroup(name);if(!grouped.has(bank))grouped.set(bank,[]);grouped.get(bank).push(name)});
  const groups=[...grouped.entries()].map(([bank,cards])=>`<div class="wizard-card-bank-group" data-card-bank-group><div class="wizard-card-bank-title">${esc(bank)}</div>${cards.map(name=>{const key=keyByName.get(normalizeCardName(name))||'';return `<button type="button" class="wizard-card-picker-option ${key?'is-existing':''}" data-card-search="${esc((bank+' '+name).toLocaleLowerCase('zh-HK'))}" onclick="pickWizardCardSuggestion(this,'${encodeURIComponent(name).replace(/'/g,'%27')}','${encodeURIComponent(key).replace(/'/g,'%27')}')">${esc(name)}</button>`}).join('')}</div>`).join('');
  return `<div class="wizard-card-picker"><button type="button" class="wizard-card-picker-toggle" onclick="toggleWizardCardPicker(this)"><span>${t.name?esc(t.name):'選擇信用卡'}</span><span class="picker-chevron">⌄</span></button><div class="wizard-card-picker-panel hidden"><input class="wizard-card-picker-search" type="search" autocomplete="off" placeholder="搜尋銀行或信用卡" oninput="filterWizardCardPicker(this)"><div class="wizard-card-picker-options">${groups}</div><div class="wizard-card-picker-empty hidden">搵唔到；可以喺下面直接輸入新卡名。</div></div></div>`;
}
function renderWizardStep(t){
  if(wizardStep===1){
    const existing=getPhysicalCards();
    const existingBlock=existing.length?`<div class="wizard-existing-cards"><div class="wizard-existing-cards-title">已有回贈目標嘅信用卡</div><div class="wizard-existing-card-grid">${existing.map(c=>`<button type="button" class="wizard-existing-card ${t.cardKey===c.cardKey||normalizeCardName(t.name)===normalizeCardName(c.name)?'active':''}" onclick="chooseWizardCard(this,'${encodeURIComponent(c.cardKey)}','${encodeURIComponent(c.name)}')"><strong>${esc(c.name)}</strong><small>${c.targets.length} 個現有目標 · 直接新增優惠</small></button>`).join('')}</div></div>`:'';
    return `<div class="wizard-question">你想為邊張信用卡新增優惠？</div>
      ${existingBlock}
      ${existing.length?'<div class="wizard-or-divider"><span>或</span></div>':''}
      <div class="wizard-card-step-label">從清單中選擇信用卡</div>${renderWizardCardPicker(t,true)}
      <div class="wizard-or-divider"><span>或</span></div>
      <div class="wizard-card-step-label">自行輸入信用卡名稱</div>
      <div class="wizard-name-wrap"><input data-k="name" class="card-name-input wizard-name-input" autocomplete="off" placeholder="輸入信用卡名稱" value="${esc(t.name)}"><button class="wizard-answer" type="button" onclick="useWizardCardName(this,'${t.id}')">使用呢張信用卡</button></div>`;
  }
  if(wizardStep===2)return `<div class="wizard-question">呢個係咩優惠？</div><div class="wizard-help">按答案後會自動進入下一題。</div><div class="wizard-options">
    ${optionButton(t.targetType==='rebate','💰','簽賬回贈','日常或推廣期簽賬取得現金、里數、積分或額外回贈',`selectTargetType(this,'${t.id}','rebate')`)}
    ${optionButton(t.targetType==='welcome','🎁','迎新優惠','新卡批核後指定期限內完成一個或多個簽賬階段',`selectTargetType(this,'${t.id}','welcome')`,'welcome')}
    </div>`;
  if(wizardStep===3)return `<div class="wizard-question">呢個優惠點樣達標？</div><div class="wizard-help">按實際計算方式揀，唔需要理會銀行用咩 marketing 名稱。</div><div class="wizard-options">${MECHANICS.map(([k,i,n,d])=>optionButton(t.mechanic===k,i,n,d,`selectMechanic(this,'${t.id}','${k}')`,t.targetType==='welcome'?'welcome':'')).join('')}${optionButton(false,'☷','以清單形式新增優惠目標','一次過查看全部設定，以清單形式直接新增優惠目標。',`startListCreate(this,'${t.id}')`,'list-create-option')}</div>`;
  if(wizardStep===4){
    const selected=new Set(t.rebateCategories||[]),custom=[...selected].filter(x=>!PRESET_CATEGORIES.includes(x));
    return `<div class="wizard-question">邊啲簽賬先計入？</div><div class="wizard-help">無論揀「所有合資格簽賬」或「指定類別」，下方都會再問有冇每筆最低簽賬，以及有冇簽賬／回贈上限。</div><div class="wizard-options">
      ${optionButton(t.eligibilityMode==='all','✅','所有合資格簽賬','一般合資格簽賬都可以計入',`selectEligibility(this,'${t.id}','all')`)}
      ${optionButton(t.eligibilityMode==='categories','🏷️','指定類別','只計餐飲、網購、海外、交通等你指定嘅簽賬',`openCategoryPicker(this,'${t.id}')`)}
      </div>
      ${t.eligibilityMode==='categories'?`<div class="wizard-section"><div class="wizard-section-title">要計入嘅指定類別</div><div class="wizard-chip-row">${PRESET_CATEGORIES.map(cat=>categoryButton(cat,selected.has(cat))).join('')}</div><div class="custom-category-caption">其他自定義類別</div><div class="category-input-row"><input class="category-new" autocomplete="off" placeholder="輸入自定義類別"><button class="category-add" type="button" onclick="addCategoryTag(this)">＋</button></div><div class="custom-category-tags">${custom.map(cat=>`<button class="cat-chip" type="button" data-value="${esc(cat)}" onclick="this.remove()">${esc(cat)} <span>×</span></button>`).join('')}</div></div>${renderLimitSettings(t,'使用指定類別及限制並繼續',`finishEligibilityLimits(this,'${t.id}')`)}`:renderLimitSettings(t,'使用以上設定並繼續',`finishEligibilityLimits(this,'${t.id}')`)}`;
  }
  if(wizardStep===5)return `<div class="wizard-question">簽賬限制</div><div class="wizard-help">先回答有冇每筆最低簽賬，再回答有冇簽賬／回贈上限。</div>${renderLimitSettings(t)}`;
  if(wizardStep===6){
    if((t.mechanic==='milestone'||t.mechanic==='custom')&&t.targetType!=='welcome')return `<div class="wizard-question">階段獎賞會按階段日期分開計算</div><div class="wizard-help">階段獎賞專門處理不同時間／階段各自達標；如果只是同一計算期內累積到不同金額，應使用「門檻簽賬」。</div><div class="wizard-choice-stack">${optionButton(true,'🗓️','設定階段日期及要求','每個階段輸入開始／結束日期、最低累積簽賬及獎賞；全部完成亦可另設加碼獎賞',`selectMilestoneModeAndAdvance(this,'${t.id}','dated')`)}</div>`;
    return `<div class="wizard-question">幾耐重置一次？</div><div class="wizard-help">決定進度幾時歸零再重新計；「指定推廣期」放最底，適合整段指定日期只累積一次。</div><div class="wizard-options">
    ${[['monthly','🗓️','每月','每月重新計算'],['yearly','🧾','全年','按曆年重新計算'],['campaign','⏳','指定推廣期','由指定開始日至結束日累積，不中途重置']].map(([k,i,n,d])=>optionButton(t.periodType===k,i,n,d,`selectPeriod(this,'${t.id}','${k}')`)).join('')}</div>`;
  }
  if(wizardStep===7){
    if(t.targetType==='welcome'&&t.periodType==='approval_window'){
      const welcomeThreshold=Number(t.welcomeRequirement||t.milestones?.[0]?.threshold||0);
      return `<div class="wizard-question">輸入迎新簽賬要求</div><div class="wizard-help">迎新優惠固定使用「階段獎賞」，並以累積簽賬計算。已替你選定「所有合資格簽賬」、「沒有額外限制」及「批卡後指定日數」。填好簽賬要求及達標獎賞即可。</div><div class="wizard-section"><div class="wizard-input-grid"><div class="wizard-big-field"><label>批卡日期</label>${datePartsInput('approvalDate',t.approvalDate)}</div><div class="wizard-big-field"><label>簽賬限期（日）</label><input data-k="welcomeDays" type="number" min="1" value="${t.welcomeDays}"></div><div class="wizard-big-field full"><label>累積簽賬額 HK$</label><input data-k="welcomeRequirement" type="number" min="0" value="${welcomeThreshold}"></div><div class="wizard-big-field"><label>達標獎賞類型</label><select data-k="welcomeRewardType">${rewardTypeOptions(t.welcomeRewardType)}</select></div><div class="wizard-big-field"><label>獎賞額／數量</label><input data-k="welcomeReward" type="number" min="0" value="${Math.max(0,Number(t.welcomeReward||0))}"></div></div></div><button class="wizard-answer" type="button" onclick="finishWelcomeBasics(this,'${t.id}')">確認迎新簽賬要求</button>`;
    }
    return `<div class="wizard-question">推廣期由幾時到幾時？</div><div class="wizard-help">開始及結束日期會分兩行輸入；如果銀行冇指定日期，可以直接略過。</div><div class="wizard-choice-stack">${optionButton(!t.startDate&&!t.endDate,'—','沒有指定推廣日期','保留空白，不限制開始及結束日期',`clearDatesAndAdvance(this,'${t.id}')`)}</div><div class="wizard-section"><div class="wizard-input-grid"><div class="wizard-big-field full"><label>推廣開始日期（可選）</label>${datePartsInput('startDate',t.startDate)}</div><div class="wizard-big-field full"><label>推廣結束日期（可選）</label>${datePartsInput('endDate',t.endDate)}</div></div></div><button class="wizard-answer" type="button" onclick="finishDates(this,'${t.id}')">套用推廣日期</button>`;
  }
  if(wizardStep===8)return renderRuleStep(t);
  return renderSummaryStep(t);
}
function renderRuleStep(t){
  let html=`<div class="wizard-question">達標條件同獎賞係點？</div><div class="wizard-help">只顯示你揀咗嗰種玩法需要嘅欄位。</div>`;
  if(t.mechanic==='tier_rate')html+=renderThresholdRuleFields(t);
  else if(t.mechanic==='milestone'||t.mechanic==='custom')html+=renderMilestoneRuleFields(t,false);
  else if(t.mechanic==='recurring')html+=`<div class="wizard-section"><div class="wizard-section-title">每期達標</div><div class="wizard-big-field"><label>每期簽賬要求 HK$</label><input data-k="recurringThreshold" type="number" min="0" value="${t.recurringThreshold}"></div><div class="wizard-input-grid" style="margin-top:12px"><div class="wizard-big-field"><label>每期獎賞類型</label><select data-k="recurringRewardType">${rewardTypeOptions(t.recurringRewardType)}</select></div><div class="wizard-big-field"><label>每期獎賞額</label><input data-k="recurringReward" type="number" min="0" value="${t.recurringReward}"></div><div class="wizard-big-field"><label>全部完成額外獎賞</label><select data-k="completionBonusType">${rewardTypeOptions(t.completionBonusType)}</select></div><div class="wizard-big-field"><label>額外獎賞額</label><input data-k="completionBonus" type="number" min="0" value="${t.completionBonus}"></div></div><div class="wizard-mini-note">系統會按每個月分開計算，再判斷整段推廣期有冇全部完成。</div></div>`;
  else if(t.mechanic==='stamp')html+=renderStampRuleFields(t);
  else html+=`<div class="wizard-section"><div class="wizard-input-grid"><div class="wizard-big-field"><label>最低累積簽賬 HK$</label><input data-k="spendRequirement" data-numeric="nonnegative" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(t.spendRequirement||0))}" oninput="sanitizeNonNegativeInteger(this)"></div><div class="wizard-big-field"><label>回贈率 %</label><input data-k="rebateRate" type="number" min="0" step="0.1" value="${t.rebateRate}" oninput="syncCapAfterRateInput(this,'${t.id}')"></div></div></div>`;
  return html+`<button class="wizard-answer" type="button" onclick="finishRules(this,'${t.id}')">完成達標規則</button>`;
}
function renderSummaryStep(t){
  const cats=t.eligibilityMode==='categories'&&t.rebateCategories.length?t.rebateCategories.join('、'):'所有合資格簽賬',period=(t.mechanic==='milestone'&&t.targetType!=='welcome')?'按階段日期':(({monthly:'每月',quarterly:'每季度',campaign:'指定推廣期',yearly:'全年',approval_window:`批卡後 ${t.welcomeDays} 日`})[t.periodType]||'自訂');
  let rule='';if(t.mechanic==='standard')rule=`累積簽滿 ${money(t.spendRequirement)} 後，回贈 ${t.rebateRate}%`;
  else if(t.mechanic==='tier_rate'){const tiers=[...t.tiers].sort((a,b)=>a.threshold-b.threshold);rule=tiers.map(x=>`${money(x.threshold)} → ${thresholdTierRewardLabel(x,t.thresholdRewardCategories)}`).join('；')}
  else if(t.mechanic==='milestone'||t.mechanic==='custom'){
    if(t.targetType==='welcome'){const first=[...t.milestones].sort((a,b)=>a.threshold-b.threshold)[0];rule=`累積簽滿 ${money(first?.threshold||t.welcomeRequirement)} → ${rewardValueLabel(first?.rewardType||t.welcomeRewardType,first?.reward??t.welcomeReward)}`}
    else rule=[...(t.milestones||[])].sort((a,b)=>String(a.startDate||'').localeCompare(String(b.startDate||''))).map((x,i)=>`階段（${i+1}）${x.startDate&&x.endDate?` ${x.startDate} 至 ${x.endDate}`:''}：最低累積簽賬 ${money(x.threshold)} → ${rewardValueLabel(x.rewardType,x.reward)}`).join('；')+(t.milestoneBonusEnabled?`；全部階段完成${Number(t.milestoneBonusSpend||0)>0?`兼全期累積簽滿 ${money(t.milestoneBonusSpend)}`:''} → 加碼 ${rewardValueLabel(t.milestoneBonusType,t.milestoneBonus)}`:'');
  }
  else if(t.mechanic==='recurring')rule=`每期簽滿 ${money(t.recurringThreshold)} → ${rewardValueLabel(t.recurringRewardType,t.recurringReward)}${t.completionBonus>0?`；全部完成再 ${rewardValueLabel(t.completionBonusType,t.completionBonus)}`:''}`;
  else if(t.mechanic==='stamp')rule=t.stampMode==='repeat'?`${stampEarnDescription(t)}；集滿 ${t.stampRepeatEvery} 個印花 → ${rewardValueLabel(t.stampRepeatRewardType,t.stampRepeatReward)}${t.stampCap>0?`；印花上限 ${t.stampCap} 個`:''}${t.stampRewardCap>0?`；獎勵上限 ${t.stampRewardCap} 次`:''}`:`${stampEarnDescription(t)}；`+[...t.stampMilestones].sort((a,b)=>a.count-b.count).map(x=>`${x.count} 個 → ${rewardValueLabel(x.rewardType,x.reward)}`).join('；');
  return `<div class="wizard-question">確認優惠</div><div class="wizard-summary"><h4>${esc(t.name||'未命名信用卡')} · ${esc(t.targetType==='welcome'?'迎新優惠':'簽賬回贈')}</h4><div class="wizard-summary-line"><b>玩法：</b>${esc(mechanicLabel(t))}</div>${t.targetType==='welcome'?'<div class="wizard-summary-line"><b>計算方式：</b>累積簽賬</div>':''}<div class="wizard-summary-line"><b>合資格：</b>${esc(cats)}${t.minTransaction>0?`；每筆至少 ${money(t.minTransaction)}`:''}</div><div class="wizard-summary-line"><b>計算週期：</b>${esc(period)}${t.approvalDate?`；批卡日期 ${esc(t.approvalDate)}`:''}${t.startDate?`；${t.startDate} 起`:''}${t.endDate?` 至 ${t.endDate}`:''}</div><div class="wizard-summary-line"><b>達標規則：</b>${esc(rule||'—')}</div><div class="wizard-summary-line"><b>上限：</b>${!t.capEnabled||!t.capAmount?'沒有另外設定':esc(linkedCapSummary(t))}</div></div><button class="wizard-answer" type="button" onclick="saveTarget('${t.id}')">確認新增／儲存</button>${creatingNewTarget?'':`<button class="wizard-danger" type="button" onclick="removeTarget('${t.id}')">刪除呢個優惠</button>`}`;
}
function syncEditorDraft(id){
  const panel=document.querySelector(`.settings-card[data-id="${id}"]`),t=state.cards.find(x=>x.id===id);if(!panel||!t)return;
  panel.querySelectorAll('[data-k]').forEach(el=>{const k=el.dataset.k;if(el.type==='number'||el.dataset.numeric==='nonnegative')t[k]=Math.max(0,parseFloat(el.value)||0);else t[k]=el.value});
  panel.querySelectorAll('.date-parts[data-date-key]').forEach(group=>{const key=group.dataset.dateKey,y=group.querySelector('[data-date-part="year"]')?.value||'',m=group.querySelector('[data-date-part="month"]')?.value||'',d=group.querySelector('[data-date-part="day"]')?.value||'';t[key]=validDateParts(y,m,d)?`${y}-${m}-${d}`:''});
  const name=panel.querySelector('.card-name-input');if(name)t.name=name.value;
  const active=[...panel.querySelectorAll('.wizard-category-btn.active:not(.threshold-category-btn)')].map(x=>x.dataset.value),custom=[...panel.querySelectorAll('.custom-category-tags:not(.threshold-custom-category-tags) .cat-chip')].map(x=>x.dataset.value);if(panel.querySelector('.wizard-category-btn:not(.threshold-category-btn)'))t.rebateCategories=[...new Set([...active,...custom].filter(Boolean))];
  const thresholdActive=[...panel.querySelectorAll('.threshold-category-btn.active')].map(x=>x.dataset.thresholdValue),thresholdCustom=[...panel.querySelectorAll('.threshold-custom-category-tags .cat-chip')].map(x=>x.dataset.thresholdCategory);if(panel.querySelector('.threshold-category-btn'))t.thresholdRewardCategories=[...new Set([...thresholdActive,...thresholdCustom].filter(Boolean))];
  const tierRows=[...panel.querySelectorAll('[data-tier-row]')];if(tierRows.length){t.tiers=tierRows.map(r=>{const rewardType=cleanRewardType(r.querySelector('[data-tier-reward-type]')?.value||'現金回贈');return {threshold:Math.max(0,Number(r.querySelector('[data-tier-threshold]')?.value||0)),rate:Math.max(0,Number(r.querySelector('[data-tier-rate]')?.value||0)),rewardType,reward:normalizeRewardValue(rewardType,r.querySelector('[data-tier-reward]')?.value),rewardMode:['rate','reward','category_rate'].includes(r.dataset.tierMode)?r.dataset.tierMode:'rate'}});const modes=new Set(t.tiers.map(x=>x.rewardMode));t.thresholdRewardMode=modes.size===1?[...modes][0]:'mixed';}
  const msRows=[...panel.querySelectorAll('[data-milestone-row]')];if(msRows.length)t.milestones=msRows.map(r=>{const readStageDate=edge=>{const g=r.querySelector(`[data-ms-date="${edge}"]`);if(!g)return '';normalizeDateGroup(g);const y=g.querySelector('[data-date-part="year"]')?.value||'',m=g.querySelector('[data-date-part="month"]')?.value||'',d=g.querySelector('[data-date-part="day"]')?.value||'';return validDateParts(y,m,d)?`${y}-${m}-${d}`:''};return {threshold:Math.max(0,Number(r.querySelector('[data-ms-threshold]')?.value||0)),rewardType:cleanRewardType(r.querySelector('[data-ms-type]')?.value),reward:Math.max(0,Number(r.querySelector('[data-ms-reward]')?.value||0)),startDate:readStageDate('start'),endDate:readStageDate('end')}});
  const stampRows=[...panel.querySelectorAll('[data-stamp-row]')];if(stampRows.length)t.stampMilestones=stampRows.map(r=>({count:Math.max(1,Number(r.querySelector('[data-stamp-count]')?.value||1)),rewardType:cleanRewardType(r.querySelector('[data-stamp-type]')?.value),reward:Math.max(0,Number(r.querySelector('[data-stamp-reward]')?.value||0))}));
}
function validateWizardStep(t,step=wizardStep){
  if(step===1&&!String(t.name||'').trim()){showNotice('請先選擇或輸入信用卡名稱');return false}
  if(step===4&&t.eligibilityMode==='categories'&&!(t.rebateCategories||[]).length){showNotice('請至少選擇一個簽賬類別');return false}
  if(step===7&&t.periodType==='approval_window'&&!t.approvalDate){showNotice('請輸入批卡日期');return false}
  if(step===8&&t.mechanic==='recurring'&&(!t.startDate||!t.endDate)){showNotice('分期／連續達標需要設定推廣開始及結束日期');return false}
  return true;
}
window.wizardBack=()=>{if(!creatingNewTarget)return;if(listCreateMode){syncEditorDraft(editingTargetId);listCreateMode=false;wizardStep=3;wizardEntering='back';renderSettings();return}if(wizardStep<=1)return;const t=state.cards.find(x=>x.id===editingTargetId);if(t?.targetType==='welcome'&&wizardStep===7){transitionWizard(2,'back',true);return}if(t?.targetType==='welcome'&&wizardStep===9){transitionWizard(7,'back',true);return}if(t?.targetType==='rebate'&&wizardStep===6){transitionWizard(4,'back',true);return}if((t?.mechanic==='milestone'||t?.mechanic==='custom')&&t?.milestoneDateMode==='dated'&&wizardStep===8){transitionWizard(4,'back',true);return}transitionWizard(wizardStep-1,'back',true)};
window.toggleWizardCardPicker=btn=>{
  const root=btn.closest('.wizard-card-picker'),panel=root?.querySelector('.wizard-card-picker-panel');if(!root||!panel)return;
  const opening=panel.classList.contains('hidden');panel.classList.toggle('hidden',!opening);root.classList.toggle('open',opening);
  if(opening)setTimeout(()=>root.querySelector('.wizard-card-picker-search')?.focus(),30);
};
window.filterWizardCardPicker=input=>{
  const panel=input.closest('.wizard-card-picker-panel'),q=String(input.value||'').trim().toLocaleLowerCase('zh-HK');if(!panel)return;
  let shown=0;panel.querySelectorAll('.wizard-card-picker-option').forEach(btn=>{const hit=!q||String(btn.dataset.cardSearch||'').includes(q);btn.classList.toggle('hidden',!hit);if(hit)shown++});
  panel.querySelectorAll('[data-card-bank-group]').forEach(group=>{const hasVisible=[...group.querySelectorAll('.wizard-card-picker-option')].some(btn=>!btn.classList.contains('hidden'));group.classList.toggle('hidden',!hasVisible)});
  panel.querySelector('.wizard-card-picker-empty')?.classList.toggle('hidden',shown>0);
};
window.pickWizardCardSuggestion=(btn,name,key)=>{
  const t=state.cards.find(x=>x.id===editingTargetId);if(!t)return;
  t.name=decodeURIComponent(name);if(key)t.cardKey=decodeURIComponent(key);
  flashThen(btn,()=>transitionWizard(2,'forward',false));
};
window.chooseWizardCard=(btn,key,name)=>{const t=state.cards.find(x=>x.id===editingTargetId);if(!t)return;t.cardKey=decodeURIComponent(key);t.name=decodeURIComponent(name);flashThen(btn,()=>transitionWizard(2,'forward',false))};
window.useWizardCardName=(btn,id)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.name=String(t.name||'').trim();const existing=getPhysicalCards().find(c=>normalizeCardName(c.name)===normalizeCardName(t.name));if(existing)t.cardKey=existing.cardKey;if(!validateWizardStep(t,1))return;flashThen(btn,()=>transitionWizard(2,'forward',false))};
window.selectTargetType=(btn,id,type)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);
  if(type==='welcome'){
    t.targetType='welcome';t.mechanic='milestone';t.eligibilityMode='all';t.rebateCategories=[];
    t.minTransaction=0;t.minTransactionEnabled=false;t.capEnabled=false;t.capType='none';t.capAmount=0;t.periodType='approval_window';t.startDate='';t.endDate='';
    t.milestoneDateMode='cumulative';t.milestoneBonusEnabled=false;t.milestoneBonusSpend=0;t.milestoneBonus=0;
    t.welcomeReward=0;t.milestones=[{threshold:Number(t.welcomeRequirement||12000),rewardType:'現金回贈',reward:0,startDate:'',endDate:''}];
    flashThen(btn,()=>transitionWizard(7,'forward',false));
    return;
  }
  t.targetType='rebate';flashThen(btn,()=>transitionWizard(3,'forward',false));
};
window.startListCreate=(btn,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);
  const shell=document.querySelector('#settingsCards .wizard-shell');
  const finish=()=>{listCreateMode=true;wizardEntering='';renderSettings();requestAnimationFrame(()=>document.querySelector('#settingsCards .list-create-shell')?.classList.add('list-enter-forward'))};
  if(!shell){finish();return}
  btn&&(btn.disabled=true);shell.classList.add('exit-forward');setTimeout(finish,260);
};
window.selectMechanic=(btn,id,k)=>answerAdvance(btn,t=>{t.mechanic=MECHANICS.some(x=>x[0]===k)?k:'standard';if(t.mechanic==='tier_rate'){t.thresholdRewardMode=t.thresholdRewardMode||'rate';t.thresholdRewardCategories=t.thresholdRewardCategories||[];if(!t.tiers.length)t.tiers=[{threshold:0,rate:0,rewardType:'現金回贈',reward:0,rewardMode:'rate'}]}if((t.mechanic==='custom'||t.mechanic==='milestone')&&!t.milestones.length)t.milestones=[{threshold:0,rewardType:'現金回贈',reward:0,startDate:'',endDate:''}]},4);
window.selectEligibility=(btn,id,m)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.eligibilityMode=m==='categories'?'categories':'all';flashThen(btn,()=>renderSettings())};
window.openCategoryPicker=(btn,id)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.eligibilityMode='categories';flashThen(btn,()=>renderSettings())};
window.finishCategories=(btn,id)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);if(!validateWizardStep(t,4))return;flashThen(btn,()=>transitionWizard(5,'forward',false))};
function validateCapSettings(t){
  if(!t.capEnabled){t.capType='none';t.capAmount=0;return true}
  if(!['reward','spend'].includes(t.capType)){showNotice('請選擇「回贈上限」或「簽賬上限」');return false}
  if(Number(t.capAmount||0)<=0){showNotice('請輸入上限金額');return false}
  return true
}
function validateLimitSettings(t){
  if(!t.minTransactionEnabled)t.minTransaction=0;
  else if(Number(t.minTransaction||0)<=0){showNotice('請輸入每筆最低簽賬金額');return false}
  return validateCapSettings(t);
}
function validateThresholdRules(t){
  if(t.mechanic!=='tier_rate')return true;
  if(!(t.tiers||[]).length){showNotice('請至少新增一個門檻');return false}
  const hasCategory=(t.tiers||[]).some(x=>(x.rewardMode||'rate')==='category_rate');
  if(hasCategory&&!(t.thresholdRewardCategories||[]).length){showNotice('請至少選擇一個「指定類別回贈」適用類別');return false}
  for(let i=0;i<t.tiers.length;i++){
    const x=t.tiers[i],mode=x.rewardMode||'rate';
    if(mode==='reward'&&!hasRewardValue(x.rewardType,x.reward)){showNotice(`請輸入門檻 ${i+1} 的獎賞內容`);return false}
    if((mode==='rate'||mode==='category_rate')&&Number(x.rate||0)<=0){showNotice(`請輸入門檻 ${i+1} 的回贈率`);return false}
  }
  return true;
}
function validateStampRules(t){
  if(t.mechanic!=='stamp')return true;
  if(t.stampEarnMode==='cumulative'&&Number(t.stampTransactionMin||0)<=0){showNotice('累積簽賬換印花需要輸入大於 0 的簽賬金額');return false}
  if(Number(t.stampsPerTxn||0)<1){showNotice('每次獲得印花最少要 1 個');return false}
  if(t.stampDailyCapEnabled&&Number(t.stampDailyCap||0)<1){showNotice('每日印花上限最少要 1 個');return false}
  if(t.stampMode==='repeat'){
    if(Number(t.stampRepeatEvery||0)<1){showNotice('請輸入集滿幾多個印花發放一次獎賞');return false}
    if(Number(t.stampRepeatReward||0)<=0){showNotice('請輸入每次印花獎賞額／數量');return false}
  }else{
    if(!(t.stampMilestones||[]).length){showNotice('請至少新增一個印花階段');return false}
    for(let i=0;i<t.stampMilestones.length;i++)if(Number(t.stampMilestones[i].count||0)<1||Number(t.stampMilestones[i].reward||0)<=0){showNotice(`請檢查印花階段 ${i+1} 的印花數及獎賞`);return false}
  }
  return true;
}
function validateMilestoneRules(t){
  if(!['milestone','custom'].includes(t.mechanic))return true;
  if(!(t.milestones||[]).length){showNotice('請至少新增一個階段');return false}
  if(t.targetType==='welcome'){const first=[...t.milestones].sort((a,b)=>a.threshold-b.threshold)[0];if(Number(first?.threshold||0)<=0){showNotice('請輸入累積簽賬額');return false}if(Number(first?.reward||0)<=0){showNotice('請輸入迎新達標獎賞額／數量');return false}}
  if(t.targetType!=='welcome'&&t.milestoneDateMode==='dated'){
    for(let i=0;i<t.milestones.length;i++){
      const x=t.milestones[i];
      if(!x.startDate||!x.endDate){showNotice(`請輸入階段（${i+1}）的開始及結束日期`);return false}
      if(x.endDate<x.startDate){showNotice(`階段（${i+1}）的結束日期不可早過開始日期`);return false}
    }
  }
  if(t.milestoneBonusEnabled&&Number(t.milestoneBonus||0)<=0){showNotice('請輸入加碼獎賞額／數量');return false}
  return true;
}
window.finishEligibilityLimits=(btn,id)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);if(!validateWizardStep(t,4))return;if(!validateLimitSettings(t))return;const datedMilestone=(t.mechanic==='milestone'||t.mechanic==='custom')&&t.targetType!=='welcome';if(datedMilestone){t.milestoneDateMode='dated';t.periodType='campaign';flashThen(btn,()=>transitionWizard(8,'forward',false));return}flashThen(btn,()=>transitionWizard(6,'forward',false))};
window.syncLinkedCapInput=(el,id,kind)=>{
  const t=state.cards.find(x=>x.id===id);if(!t||!['spend','reward'].includes(kind))return;
  syncEditorDraft(id);
  const value=Math.max(0,Number(el.value||0));t.capEnabled=true;t.capType=kind;t.capAmount=value;
  const scope=el.closest('.linked-cap-fields'),otherKind=kind==='spend'?'reward':'spend',other=scope?.querySelector(`[data-cap-link="${otherKind}"]`),caps=capAmounts(t);
  if(other)other.value=capInputValue(otherKind==='spend'?caps.spend:caps.reward);
  const hint=scope?.querySelector('.linked-cap-hint'),rate=caps.rate;
  if(hint)hint.innerHTML=`按回贈率 <b>${rate>0?`${Number(rate.toFixed(2))}%`:'尚未設定回贈率'}</b> 自動雙向換算；輸入任何一邊，另一邊會即時更新。`;
};
window.syncCapAfterRateInput=(el,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;
  t.rebateRate=Math.max(0,Number(el.value||0));
  const scope=document.querySelector(`.settings-card[data-id="${id}"] .linked-cap-fields`);if(!scope)return;
  const caps=capAmounts(t),spend=scope.querySelector('[data-cap-link="spend"]'),reward=scope.querySelector('[data-cap-link="reward"]'),hint=scope.querySelector('.linked-cap-hint');
  if(spend)spend.value=capInputValue(caps.spend);if(reward)reward.value=capInputValue(caps.reward);
  if(hint)hint.innerHTML=`按回贈率 <b>${caps.rate>0?`${Number(caps.rate.toFixed(2))}%`:'尚未設定回贈率'}</b> 自動雙向換算；輸入任何一邊，另一邊會即時更新。`;
};
window.setMinTransactionEnabled=(btn,id,enabled)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);commitToggleWithMotion(btn,!!enabled,()=>{t.minTransactionEnabled=!!enabled;if(!t.minTransactionEnabled)t.minTransaction=0},'.limit-reveal')};
window.setCapEnabled=(btn,id,enabled)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);commitToggleWithMotion(btn,!!enabled,()=>{t.capEnabled=!!enabled;if(!t.capEnabled){t.capType='none';t.capAmount=0}},'.linked-cap-fields,.limit-reveal,.cap-type-block')};
window.setCapType=(btn,id,type)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.capEnabled=true;t.capType=['reward','spend'].includes(type)?type:'none';creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll()};
window.setThresholdRewardMode=(btn,id,mode)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);const m=['rate','reward','category_rate'].includes(mode)?mode:'rate';t.tiers=(t.tiers||[]).map(x=>({...x,rewardMode:m}));t.thresholdRewardMode=m;creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll()};
window.setTierRewardMode=(btn,id,index,mode)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);const m=['rate','reward','category_rate'].includes(mode)?mode:'rate';if(!t.tiers[index])return;t.tiers[index].rewardMode=m;const modes=new Set(t.tiers.map(x=>x.rewardMode||'rate'));t.thresholdRewardMode=modes.size===1?[...modes][0]:'mixed';creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll()};
window.setStampEarnMode=(btn,id,mode)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.stampEarnMode=mode==='cumulative'?'cumulative':'per_txn';creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll()};
window.setStampDailyCapEnabled=(btn,id,enabled)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);commitToggleWithMotion(btn,!!enabled,()=>{t.stampDailyCapEnabled=!!enabled;if(t.stampDailyCapEnabled&&Number(t.stampDailyCap||0)<1)t.stampDailyCap=1},'.limit-reveal')};
window.setStampMode=(btn,id,mode)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.stampMode=mode==='repeat'?'repeat':'stages';creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll()};
window.toggleThresholdCategory=btn=>btn.classList.toggle('active');
window.addThresholdCategoryTag=btn=>{const panel=btn.closest('.settings-card'),input=panel?.querySelector('.threshold-category-new');if(!input)return;const value=input.value.trim();if(!value)return;const preset=[...panel.querySelectorAll('.threshold-category-btn')].find(x=>x.dataset.thresholdValue===value);if(preset){preset.classList.add('active');input.value='';return}const tags=panel.querySelector('.threshold-custom-category-tags'),exists=[...tags.querySelectorAll('.cat-chip')].some(x=>x.dataset.thresholdCategory===value);if(!exists){const chip=document.createElement('button');chip.type='button';chip.className='cat-chip';chip.dataset.thresholdCategory=value;chip.innerHTML=`${esc(value)} <span>×</span>`;chip.onclick=()=>chip.remove();tags.appendChild(chip)}input.value=''};
window.setMilestoneDateMode=(btn,id,mode)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.milestoneDateMode=t.targetType==='welcome'?'cumulative':'dated';creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll()};
window.setMilestoneBonusEnabled=(btn,id,enabled)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);commitToggleWithMotion(btn,!!enabled,()=>{t.milestoneBonusEnabled=!!enabled;if(!t.milestoneBonusEnabled){t.milestoneBonusSpend=0;t.milestoneBonus=0}},'.limit-reveal')};
window.clearLimitsAndAdvance=(btn,id)=>answerAdvance(btn,t=>{t.minTransaction=0;t.minTransactionEnabled=false;t.capEnabled=false;t.capType='none';t.capAmount=0},6);
window.finishLimits=(btn,id)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);if(!validateLimitSettings(t))return;flashThen(btn,()=>transitionWizard(6,'forward',false))};
window.selectMilestoneModeAndAdvance=(btn,id,mode)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.milestoneDateMode='dated';t.periodType='campaign';flashThen(btn,()=>transitionWizard(8,'forward',false))};
window.selectPeriod=(btn,id,p)=>answerAdvance(btn,t=>{const allowed=t.targetType==='welcome'?['approval_window']:['monthly','campaign','yearly'];t.periodType=allowed.includes(p)?p:allowed[0]},7);
window.clearDatesAndAdvance=(btn,id)=>answerAdvance(btn,t=>{t.startDate='';t.endDate=''},8);
window.finishWelcomeBasics=(btn,id)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;const panel=document.querySelector(`.settings-card[data-id="${id}"]`);if(panel&&!validateVisibleDateInputs(panel)){showNotice('請檢查日期是否正確');return}syncEditorDraft(id);if(!t.approvalDate){showNotice('請輸入批卡日期');return}if(Number(t.welcomeDays||0)<1){showNotice('請輸入簽賬限期（日）');return}if(Number(t.welcomeRequirement||0)<=0){showNotice('請輸入累積簽賬額');return}if(Number(t.welcomeReward||0)<=0){showNotice('請輸入獎賞額／數量');return}t.welcomeRewardType=cleanRewardType(t.welcomeRewardType);t.eligibilityMode='all';t.rebateCategories=[];t.minTransaction=0;t.minTransactionEnabled=false;t.capEnabled=false;t.capType='none';t.capAmount=0;t.periodType='approval_window';t.mechanic='milestone';if(!t.milestones.length)t.milestones=[{threshold:0,rewardType:t.welcomeRewardType,reward:Number(t.welcomeReward||0),startDate:'',endDate:''}];t.milestones[0].threshold=Number(t.welcomeRequirement||0);t.milestones[0].rewardType=t.welcomeRewardType;t.milestones[0].reward=Number(t.welcomeReward||0);flashThen(btn,()=>transitionWizard(9,'forward',false))};
window.finishDates=(btn,id)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;const panel=document.querySelector(`.settings-card[data-id="${id}"]`);if(panel&&!validateVisibleDateInputs(panel)){showNotice('請檢查日期是否正確');return}syncEditorDraft(id);if(!validateWizardStep(t,7))return;flashThen(btn,()=>transitionWizard(8,'forward',false))};
window.finishRules=(btn,id)=>{const t=state.cards.find(x=>x.id===id);if(!t)return;const panel=document.querySelector(`.settings-card[data-id="${id}"]`);if(panel&&!validateVisibleDateInputs(panel)){showNotice('請檢查日期是否正確');return}syncEditorDraft(id);if(!validateWizardStep(t,8)||!validateThresholdRules(t)||!validateMilestoneRules(t)||!validateStampRules(t))return;flashThen(btn,()=>transitionWizard(9,'forward',false))};
window.togglePresetCategory=btn=>btn.classList.toggle('active');
window.addCategoryTag=btn=>{const panel=btn.closest('.settings-card'),input=panel?.querySelector('.category-new');if(!input)return;const value=input.value.trim();if(!value)return;const preset=[...panel.querySelectorAll('.wizard-category-btn')].find(x=>x.dataset.value===value);if(preset){preset.classList.add('active');input.value='';return}const tags=panel.querySelector('.custom-category-tags'),exists=[...tags.querySelectorAll('.cat-chip')].some(x=>x.dataset.value===value);if(!exists){const chip=document.createElement('button');chip.type='button';chip.className='cat-chip';chip.dataset.value=value;chip.innerHTML=`${esc(value)} <span>×</span>`;chip.onclick=()=>chip.remove();tags.appendChild(chip)}input.value=''};
function animateAddedRuleRow(kind){
  const selector=kind==='tier'?'[data-tier-row]':kind==='milestone'?'[data-milestone-row]':'';
  if(!selector)return;
  const rows=[...document.querySelectorAll(`#settingsCards ${selector}`)],row=rows.at(-1);
  if(!row)return;
  row.classList.remove('row-added');
  row.style.setProperty('--rule-row-height',`${row.offsetHeight}px`);
  void row.offsetWidth;
  row.classList.add('row-added');
  let done=false;
  const clear=()=>{
    if(done)return;done=true;
    row.classList.remove('row-added');
    row.style.removeProperty('--rule-row-height');
    row.removeEventListener('animationend',onEnd);
  };
  const onEnd=e=>{if(e.target===row)clear()};
  row.addEventListener('animationend',onEnd);
  setTimeout(clear,820);
}
window.addRuleRow=(kind,btn)=>{const t=state.cards.find(x=>x.id===editingTargetId);if(!t)return;syncEditorDraft(t.id);if(kind==='tier')t.tiers.push({threshold:0,rate:0,rewardType:'現金回贈',reward:0,rewardMode:'rate'});if(kind==='milestone')t.milestones.push({threshold:0,rewardType:'現金回贈',reward:0,startDate:'',endDate:''});if(kind==='stamp')t.stampMilestones.push({count:1,rewardType:'現金回贈',reward:0});creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll();animateAddedRuleRow(kind)};
window.removeRuleRow=(kind,i,btn)=>{
  const t=state.cards.find(x=>x.id===editingTargetId);if(!t)return;
  syncEditorDraft(t.id);
  const arr=kind==='tier'?t.tiers:kind==='stamp'?t.stampMilestones:t.milestones;
  if(arr.length<=1)return;
  const commit=()=>{
    arr.splice(i,1);
    creatingNewTarget&&!listCreateMode?rerenderWizardPreserveScroll():rerenderEditPreserveScroll();
  };
  if((kind==='milestone'||kind==='tier')&&btn){
    const row=btn.closest('.wizard-row-card');
    if(row&&!row.classList.contains('row-removing')){
      row.style.setProperty('--rule-row-height',`${row.offsetHeight}px`);
      void row.offsetHeight;
      row.classList.add('row-removing');btn.disabled=true;
      let done=false;
      const finish=e=>{
        if(e&&e.target!==row)return;
        if(done)return;done=true;
        row.removeEventListener('animationend',finish);commit();
      };
      row.addEventListener('animationend',finish);
      setTimeout(()=>{if(document.body.contains(row))finish()},470);
      return;
    }
  }
  commit();
};
function resolveCardKeyForTarget(t,name){const norm=normalizeCardName(name),sameName=state.cards.find(x=>!x._temporary&&x.id!==t.id&&normalizeCardName(x.name)===norm);if(sameName)return sameName.cardKey;const siblings=state.cards.filter(x=>!x._temporary&&x.id!==t.id&&x.cardKey===t.cardKey);if(!t.cardKey)return uid();if(siblings.length&&siblings.some(x=>normalizeCardName(x.name)!==norm))return uid();return t.cardKey}
window.saveTarget=id=>{
  const panel=document.querySelector(`.settings-card[data-id="${id}"]`);if(panel&&!validateVisibleDateInputs(panel)){showNotice('請檢查日期是否正確');return}
  syncEditorDraft(id);const t=state.cards.find(x=>x.id===id);if(!t)return;t.name=String(t.name||'').trim();if(!t.name){wizardStep=1;renderSettings();showNotice('請輸入或選擇信用卡名稱');return}
  if(t.periodType==='approval_window'&&!t.approvalDate){wizardStep=7;renderSettings();showNotice('請輸入批卡日期');return}
  if(t.mechanic==='recurring'&&(!t.startDate||!t.endDate)){wizardStep=7;renderSettings();showNotice('請設定分期優惠開始及結束日期');return}
  if(!validateLimitSettings(t)||!validateThresholdRules(t)||!validateMilestoneRules(t)||!validateStampRules(t))return;
  if(t.targetType==='welcome')t.mechanic='milestone';if(!t.capEnabled||t.capType==='none'){t.capEnabled=false;t.capType='none';t.capAmount=0}else t.capEnabled=true;t.rebateEndDate=t.endDate||'';if(t.milestones.length){const first=[...t.milestones].sort((a,b)=>a.threshold-b.threshold)[0];t.welcomeRequirement=first.threshold;t.welcomeRewardType=first.rewardType;t.welcomeReward=first.reward}
  t.cardKey=resolveCardKeyForTarget(t,t.name);delete t._temporary;save();creatingNewTarget=false;listCreateMode=false;editingTargetId=null;editingBackup=null;wizardStep=1;render();renderSettings();closeModal('settingsModal');
};
window.removeTarget=id=>{const t=state.cards.find(x=>x.id===id);if(!t)return;askConfirm(`刪除「${t.name}」呢個優惠？\n消費紀錄會保留。`,()=>{state.cards=state.cards.filter(x=>x.id!==id);state.transactions.forEach(tx=>{tx.targetIds=(tx.targetIds||[]).filter(x=>x!==id);tx.targetRefs=(tx.targetRefs||[]).filter(x=>x.id!==id)});save();editingTargetId=null;creatingNewTarget=false;listCreateMode=false;editingBackup=null;wizardStep=1;render();renderSettings();closeModal('settingsModal');showNotice('優惠已刪除','success')},'刪除優惠');};

document.addEventListener('click',e=>{if(!e.target.closest('.card-name-picker'))document.querySelectorAll('.card-name-menu').forEach(x=>x.classList.add('hidden'))});
window.addEventListener('scroll',()=>document.querySelector('.top')?.classList.toggle('is-scrolled',window.scrollY>6),{passive:true});
window.addEventListener('resize',scheduleGoalHeightEqualize,{passive:true});


/* ===== v16：清單模式局部更新；避免每次選擇都重建整頁 ===== */
function v16ListCard(id){return document.querySelector(`#settingsCards .list-create-shell .settings-card[data-id="${id}"]`)}
function v16IsListEditor(id){return !!v16ListCard(id)}
function v16RuleLast(t){return ['stamp','milestone','custom'].includes(t.mechanic)}
function v16ListRow(label,desc,control,extra=''){
  return `<div class="edit-row ${extra}"><div class="edit-copy"><div class="edit-label">${label}</div>${desc?`<div class="edit-desc">${desc}</div>`:''}</div><div class="edit-control">${control}</div></div>`;
}
function v16AnimateOpen(el){
  if(!el)return;const h=Math.max(el.scrollHeight,el.offsetHeight,1);el.classList.add('v16-animating');
  el.style.height='0px';el.style.opacity='.55';el.style.transform='translateY(-5px)';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{el.style.transition='height .28s cubic-bezier(.22,.78,.22,1), opacity .22s ease, transform .28s cubic-bezier(.22,.78,.22,1)';el.style.height=`${h}px`;el.style.opacity='1';el.style.transform='translateY(0)'}));
  setTimeout(()=>{el.classList.remove('v16-animating');el.style.height='';el.style.opacity='';el.style.transform='';el.style.transition=''},330);
}
function v16AnimateClose(el,done){
  if(!el){done?.();return}const h=Math.max(el.getBoundingClientRect().height,el.scrollHeight,1);el.classList.add('v16-animating');el.style.height=`${h}px`;el.style.opacity='1';el.style.transform='translateY(0)';
  requestAnimationFrame(()=>{el.style.transition='height .24s cubic-bezier(.4,0,.2,1), opacity .18s ease, transform .24s cubic-bezier(.4,0,.2,1)';el.style.height='0px';el.style.opacity='0';el.style.transform='translateY(-6px)'});
  setTimeout(()=>{done?.();},260);
}
function v16MorphInner(el,html){
  if(!el)return;const oldH=Math.max(el.getBoundingClientRect().height,1);el.style.height=`${oldH}px`;el.style.overflow='hidden';el.innerHTML=html;const newH=Math.max(el.scrollHeight,1);el.classList.add('v16-animating');
  requestAnimationFrame(()=>{el.style.transition='height .28s cubic-bezier(.22,.78,.22,1)';el.style.height=`${newH}px`});
  setTimeout(()=>{el.classList.remove('v16-animating');el.style.height='';el.style.overflow='';el.style.transition=''},320);
}
function v16MorphElement(oldEl,newHtml){
  if(!oldEl)return null;const temp=document.createElement('div');temp.innerHTML=newHtml.trim();const next=temp.firstElementChild;if(!next)return null;
  const oldH=Math.max(oldEl.getBoundingClientRect().height,1);next.style.height=`${oldH}px`;next.style.overflow='hidden';oldEl.replaceWith(next);const newH=Math.max(next.scrollHeight,1);next.classList.add('v16-animating');
  requestAnimationFrame(()=>{next.style.transition='height .28s cubic-bezier(.22,.78,.22,1)';next.style.height=`${newH}px`});
  setTimeout(()=>{next.classList.remove('v16-animating');next.style.height='';next.style.overflow='';next.style.transition=''},320);return next;
}
function v16SetSlot(slot,html,open){
  if(!slot)return;if(open){slot.innerHTML=html;const child=slot.firstElementChild;if(child)v16AnimateOpen(child);return}
  const child=slot.firstElementChild;if(!child){slot.innerHTML='';return}v16AnimateClose(child,()=>{slot.innerHTML=''})
}
function v16RewardModeOptions(mode){
  return `<option value="rate" ${mode==='rate'?'selected':''}>回贈率</option><option value="reward" ${mode==='reward'?'selected':''}>直接獎賞</option><option value="category_rate" ${mode==='category_rate'?'selected':''}>指定類別回贈</option>`;
}
function v16StampEarnOptions(mode){return `<option value="per_txn" ${mode!=='cumulative'?'selected':''}>每筆達標即獲印花</option><option value="cumulative" ${mode==='cumulative'?'selected':''}>累積簽賬換印花</option>`}
function v16StampModeOptions(mode){return `<option value="repeat" ${mode==='repeat'?'selected':''}>集滿指定印花數循環獎賞</option><option value="stages" ${mode!=='repeat'?'selected':''}>逐個階段設定</option>`}

function v16RenderTierGroup(t,x,i){
  const mode=['rate','reward','category_rate'].includes(x.rewardMode)?x.rewardMode:'rate';
  const remove=(t.tiers||[]).length>1?`<button class="list-rule-delete" type="button" onclick="removeRuleRow('tier',${i},this)">刪除</button>`:'';
  let reward='';
  if(mode==='reward'){
    reward=v16ListRow('達標獎賞類型','現金、里數、積分、獎賞錢或禮物。',`<select data-tier-reward-type onchange="rewardTypeChanged(this,'${t.id}')">${rewardTypeOptions(x.rewardType)}</select>`)+v16ListRow(isTextRewardType(x.rewardType)?'禮物／獎賞內容':'獎賞額／數量',isTextRewardType(x.rewardType)?'可直接輸入中文或英文，例如：咖啡券 Coffee Voucher。':'輸入今個門檻直接取得的獎賞。',tierRewardInput(x.rewardType,x.reward));
  }else{
    reward=v16ListRow(mode==='category_rate'?'指定類別回贈率':'回贈率','達到呢個門檻後套用的百分比。',`<input data-tier-rate type="number" min="0" step="0.01" value="${Math.max(0,Number(x.rate||0))}" placeholder="%">`);
  }
  return `<div class="list-rule-group" data-tier-row data-tier-mode="${mode}" data-rule-index="${i}"><div class="list-rule-group-head"><div><strong>門檻 ${i+1}</strong><small>　獨立設定要求及獎賞</small></div>${remove}</div>${v16ListRow('達標後獎賞','每個門檻可以使用不同獎賞方式。',`<select onchange="setTierRewardMode(this,'${t.id}',${i},this.value)">${v16RewardModeOptions(mode)}</select>`)}${v16ListRow('累積簽滿','達到呢個累積簽賬金額後解鎖。',`<input data-tier-threshold type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(x.threshold||0))}" placeholder="HK$" oninput="sanitizeNonNegativeInteger(this)">`)}${reward}</div>`;
}
function v16RenderThresholdList(t){
  const selected=new Set(t.thresholdRewardCategories||[]),custom=[...selected].filter(x=>!PRESET_CATEGORIES.includes(x));
  const tiers=t.tiers||[],rows=tiers.map((x,i)=>v16RenderTierGroup(t,x,i)).join('');
  const hasCategory=tiers.some(x=>(x.rewardMode||'rate')==='category_rate');
  const category=hasCategory?`<div class="list-rule-group" data-threshold-category-group><div class="list-rule-group-head"><strong>指定類別回贈</strong></div>${v16ListRow('適用簽賬類別','只有選擇「指定類別回贈」的門檻會使用。',`<div class="list-category-panel"><div class="wizard-chip-row">${PRESET_CATEGORIES.map(cat=>thresholdCategoryButton(cat,selected.has(cat))).join('')}</div><div class="custom-category-caption">其他自定義類別</div><div class="category-input-row"><input class="threshold-category-new" autocomplete="off" placeholder="輸入自定義類別"><button class="category-add" type="button" onclick="addThresholdCategoryTag(this)">＋</button></div><div class="threshold-custom-category-tags custom-category-tags">${custom.map(cat=>`<button class="cat-chip" type="button" data-threshold-category="${esc(cat)}" onclick="this.remove()">${esc(cat)} <span>×</span></button>`).join('')}</div></div>`)}</div>`:'';
  return `<div class="list-rule-note">每個門檻都可以獨立選擇回贈率、直接獎賞或指定類別回贈。</div>${rows}<button class="list-rule-add" type="button" onclick="addRuleRow('tier',this)">＋ 加入另一個門檻</button>${category}`;
}
function v16RenderMilestoneGroup(t,x,i){
  const dated=t.targetType!=='welcome',remove=(t.milestones||[]).length>1?`<button class="list-rule-delete" type="button" onclick="removeRuleRow('milestone',${i},this)">刪除</button>`:'';
  return `<div class="list-rule-group" data-milestone-row data-rule-index="${i}"><div class="list-rule-group-head"><div><strong>階段（${i+1}）</strong><small>${dated?'　按階段日期獨立計算':'　迎新累積簽賬'}</small></div>${remove}</div>${dated?v16ListRow('階段開始日期','今個階段由呢日開始計算。',milestoneDatePartsInput(i,'start',x.startDate||''))+v16ListRow('階段結束日期','到呢日完結。',milestoneDatePartsInput(i,'end',x.endDate||'')):''}${v16ListRow('最低累積簽賬','今個階段要累積簽滿的金額。',`<input data-ms-threshold type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(x.threshold||0))}" placeholder="HK$" oninput="sanitizeNonNegativeInteger(this)">`)}${v16ListRow('獎賞類型','達標後取得的獎賞種類。',`<select data-ms-type>${rewardTypeOptions(x.rewardType)}</select>`)}${v16ListRow('今階段獎賞額／數量','輸入達標後取得的獎賞。',`<input data-ms-reward type="number" min="0" value="${Math.max(0,Number(x.reward||0))}">`)}</div>`;
}
function v16MilestoneBonusRows(t){
  return `<div data-v16-reveal="milestone-bonus">${v16ListRow('全期最低累積簽賬','填 0 代表只需完成所有階段。',`<input data-k="milestoneBonusSpend" data-numeric="nonnegative" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(t.milestoneBonusSpend||0))}" placeholder="HK$" oninput="sanitizeNonNegativeInteger(this)">`)}${v16ListRow('加碼獎賞類型','全部階段完成後額外取得。',`<select data-k="milestoneBonusType">${rewardTypeOptions(t.milestoneBonusType)}</select>`)}${v16ListRow('加碼獎賞額／數量','輸入額外獎賞。',`<input data-k="milestoneBonus" type="number" min="0" value="${Math.max(0,Number(t.milestoneBonus||0))}">`)}</div>`;
}
function v16RenderMilestoneList(t){
  const rows=(t.milestones||[]).map((x,i)=>v16RenderMilestoneGroup(t,x,i)).join('');
  return `<div class="list-rule-note">${t.targetType==='welcome'?'迎新優惠以期限內累積簽賬計算。':'每個階段按自己的開始／結束日期分開計算。'}</div>${rows}<button class="list-rule-add" type="button" onclick="addRuleRow('milestone',this)">＋ 加入另一個階段</button>${v16ListRow('全部階段完成後有加碼獎賞嗎','開啟後可再設定全期門檻及額外獎賞。',editYesNoToggle(t.id,!!t.milestoneBonusEnabled,'setMilestoneBonusEnabled'))}<div class="list-slot" data-v16-slot="milestone-bonus">${t.milestoneBonusEnabled?v16MilestoneBonusRows(t):''}</div>`;
}
function v16StampDailyRows(t){return `<div data-v16-reveal="stamp-daily">${v16ListRow('每日最多可獲印花','例如每天只限取一次，就填 1。',`<input data-k="stampDailyCap" type="number" min="1" step="1" value="${Math.max(1,Number(t.stampDailyCap||1))}">`)}</div>`}
function v16RenderStampList(t){
  const cumulative=t.stampEarnMode==='cumulative',repeat=t.stampMode==='repeat';
  let award='';
  if(repeat){
    award=v16ListRow('集滿幾多個印花發放一次獎賞','達到指定印花數後循環發放。',`<input data-k="stampRepeatEvery" type="number" min="1" value="${Math.max(1,Number(t.stampRepeatEvery||1))}">`)+v16ListRow('每次獎賞類型','每次解鎖時發放的獎賞。',`<select data-k="stampRepeatRewardType">${rewardTypeOptions(t.stampRepeatRewardType)}</select>`)+v16ListRow('每次獎賞額／數量','輸入每次解鎖的獎賞。',`<input data-k="stampRepeatReward" type="number" min="0" value="${Math.max(0,Number(t.stampRepeatReward||0))}">`)+v16ListRow('印花上限','0 代表不設上限。',`<input data-k="stampCap" type="number" min="0" value="${Math.max(0,Number(t.stampCap||0))}">`)+v16ListRow('獎勵上限','0 代表不設上限。',`<input data-k="stampRewardCap" type="number" min="0" value="${Math.max(0,Number(t.stampRewardCap||0))}">`);
  }else{
    const rows=(t.stampMilestones||[]).map((x,i)=>`<div class="list-rule-group" data-stamp-row data-rule-index="${i}"><div class="list-rule-group-head"><strong>印花階段 ${i+1}</strong>${(t.stampMilestones||[]).length>1?`<button class="list-rule-delete" type="button" onclick="removeRuleRow('stamp',${i},this)">刪除</button>`:''}</div>${v16ListRow('集齊幾多個印花','到呢個印花數解鎖獎賞。',`<input data-stamp-count type="number" min="1" value="${Math.max(1,Number(x.count||1))}">`)}${v16ListRow('獎賞類型','今個印花階段的獎賞。',`<select data-stamp-type>${rewardTypeOptions(x.rewardType)}</select>`)}${v16ListRow('今階段新增獎賞額','輸入今個階段新增的獎賞。',`<input data-stamp-reward type="number" min="0" value="${Math.max(0,Number(x.reward||0))}">`)}</div>`).join('');
    award=`${rows}<button class="list-rule-add" type="button" onclick="addRuleRow('stamp',this)">＋ 加一個印花階段</button>${v16ListRow('印花上限','0 代表不設上限。',`<input data-k="stampCap" type="number" min="0" value="${Math.max(0,Number(t.stampCap||0))}">`)}`;
  }
  return `${v16ListRow('印花取得方式','每筆達標，或者累積簽賬換印花。',`<select onchange="setStampEarnMode(this,'${t.id}',this.value)">${v16StampEarnOptions(t.stampEarnMode)}</select>`)}${v16ListRow(cumulative?'每累積簽賬':'每筆簽滿',cumulative?'多筆交易可以累積，每達門檻就取得印花。':'單筆交易達到呢個金額先取得印花。',`<input data-k="stampTransactionMin" type="number" min="${cumulative?'0.01':'0'}" step="0.01" value="${Math.max(0,Number(t.stampTransactionMin||0))}" placeholder="HK$">`)}${v16ListRow(cumulative?'每達門檻獲得印花':'每次獲得印花','每次符合條件取得幾多個印花。',`<input data-k="stampsPerTxn" type="number" min="1" step="1" value="${Math.max(1,Number(t.stampsPerTxn||1))}">`)}${v16ListRow('每日設有印花上限嗎','開啟後限制每日最多可獲印花。',editYesNoToggle(t.id,!!t.stampDailyCapEnabled,'setStampDailyCapEnabled'))}<div class="list-slot" data-v16-slot="stamp-daily">${t.stampDailyCapEnabled?v16StampDailyRows(t):''}</div>${v16ListRow('印花獎賞發放方式','循環獎賞或逐個階段設定。',`<select onchange="setStampMode(this,'${t.id}',this.value)">${v16StampModeOptions(t.stampMode)}</select>`)}${award}`;
}

renderListCreateRuleFields=function(t){
  if(t.mechanic==='tier_rate')return v16RenderThresholdList(t);
  if(t.mechanic==='milestone'||t.mechanic==='custom')return v16RenderMilestoneList(t);
  if(t.mechanic==='stamp')return v16RenderStampList(t);
  if(t.mechanic==='recurring')return v16ListRow('每期簽賬要求','每一期要達到的簽賬金額。',`<input data-k="recurringThreshold" type="number" min="0" value="${t.recurringThreshold}" placeholder="HK$">`)+v16ListRow('每期獎賞類型','每期達標後取得。',`<select data-k="recurringRewardType">${rewardTypeOptions(t.recurringRewardType)}</select>`)+v16ListRow('每期獎賞額','輸入每期獎賞。',`<input data-k="recurringReward" type="number" min="0" value="${t.recurringReward}">`)+v16ListRow('全部完成額外獎賞','完成所有期數後額外取得。',`<div class="list-control-stack"><select data-k="completionBonusType">${rewardTypeOptions(t.completionBonusType)}</select><input data-k="completionBonus" type="number" min="0" value="${t.completionBonus}" placeholder="獎賞額／數量"></div>`);
  const spendLabel=t.periodType==='monthly'?'每月最低累積簽賬':'最低累積簽賬';
  return v16ListRow(spendLabel,'達到呢個累積簽賬要求後計算回贈。',`<input data-k="spendRequirement" data-numeric="nonnegative" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(t.spendRequirement||0))}" placeholder="HK$" oninput="sanitizeNonNegativeInteger(this)">`)+v16ListRow('回贈率','請先輸入回贈率；設定後，下方簽賬／回贈上限先會啟用雙向換算。',`<input data-k="rebateRate" type="number" min="0" step="0.1" value="${t.rebateRate}" placeholder="%" oninput="syncCapAfterRateInput(this,'${t.id}')">`);
};

function v16CategoryReveal(t){
  const selected=new Set(t.rebateCategories||[]),custom=[...selected].filter(x=>!PRESET_CATEGORIES.includes(x));
  return `<div class="edit-categories" data-v16-reveal="categories"><div class="wizard-chip-row">${PRESET_CATEGORIES.map(cat=>categoryButton(cat,selected.has(cat))).join('')}</div><div class="custom-category-caption">其他自定義類別</div><div class="category-input-row"><input class="category-new" autocomplete="off" placeholder="輸入自定義類別"><button class="category-add" type="button" onclick="addCategoryTag(this)">＋</button></div><div class="custom-category-tags">${custom.map(cat=>`<button class="cat-chip" type="button" data-value="${esc(cat)}" onclick="this.remove()">${esc(cat)} <span>×</span></button>`).join('')}</div></div>`;
}
function v16MinReveal(t){return `<div data-v16-reveal="min-transaction">${v16ListRow('每筆最低簽賬','符合呢個最低金額先計入優惠。',`<input data-k="minTransaction" type="number" min="0" value="${t.minTransaction}" placeholder="HK$">`)}</div>`}
function v16CapReveal(t){return `<div data-v16-reveal="cap">${v16ListRow('上限金額','輸入簽賬上限或回贈上限其中一邊。',linkedCapFields(t,true))}</div>`}
function v16MechanicRowInner(t){
  const mechanicOptions=MECHANICS.map(([k,,n])=>[k,n]);
  return `<div class="edit-copy"><div class="edit-label">達標形式</div><div class="edit-desc">${t.targetType==='welcome'?'迎新優惠固定以累積簽賬計算。':'改變玩法後，只會局部更新下方規則，不會再閃屏或跳位。'}</div></div><div class="edit-control">${t.targetType==='welcome'?`<div class="edit-pill welcome">階段獎賞 · 累積簽賬</div>`:`<select data-k="mechanic" onchange="editListRefresh('${t.id}','mechanic',this)">${editSelectOptions(mechanicOptions,t.mechanic)}</select>`}</div>`;
}
function v16RenderEligibilitySection(t){
  return `<section class="edit-section" data-list-section="eligibility"><div class="edit-section-head"><strong>合資格簽賬</strong><small>決定邊啲交易可以計入呢個優惠。</small></div>${v16ListRow('合資格簽賬範圍','所有合資格簽賬，或者只限指定類別。',`<select data-k="eligibilityMode" onchange="editListRefresh('${t.id}','eligibilityMode',this)"><option value="all" ${t.eligibilityMode==='all'?'selected':''}>所有合資格簽賬</option><option value="categories" ${t.eligibilityMode==='categories'?'selected':''}>指定類別</option></select><div class="list-slot" data-v16-slot="categories">${t.eligibilityMode==='categories'?v16CategoryReveal(t):''}</div>`)}${v16ListRow('設有每筆最低簽賬嗎','開啟後可輸入每筆最低簽賬金額。',editYesNoToggle(t.id,t.minTransactionEnabled,'setMinTransactionEnabled'))}<div class="list-slot" data-v16-slot="min-transaction">${t.minTransactionEnabled?v16MinReveal(t):''}</div></section>`;
}
function v16RenderPeriodDynamic(t){
  const stageDated=(t.mechanic==='milestone'||t.mechanic==='custom')&&t.targetType!=='welcome';
  if(stageDated)return v16ListRow('計算週期','每個階段自己設定開始及結束日期。','<div class="edit-pill">按階段日期計算</div>','edit-dynamic-row');
  if(t.periodType==='approval_window')return v16ListRow('批卡日期及有效日數','由批卡日起計指定日數。',`<div class="edit-grid2">${datePartsInput('approvalDate',t.approvalDate)}<input data-k="welcomeDays" type="number" min="1" value="${t.welcomeDays}"></div>`,'edit-dynamic-row');
  return v16ListRow('推廣日期','開始及結束日期都可以留空。',`<div class="edit-date-stack"><div><div class="edit-label" style="margin-bottom:8px">推廣開始日期（可選）</div>${datePartsInput('startDate',t.startDate)}</div><div><div class="edit-label" style="margin-bottom:8px">推廣結束日期（可選）</div>${datePartsInput('endDate',t.endDate)}</div></div>`,'edit-dynamic-row');
}
function v16RenderLimitsSection(t){
  const stageDated=(t.mechanic==='milestone'||t.mechanic==='custom')&&t.targetType!=='welcome';
  const periodOptions=t.targetType==='welcome'?[['approval_window','批卡後指定日數']]:[['monthly','每月'],['yearly','全年'],['campaign','指定推廣期']];
  const periodRow=stageDated?'':v16ListRow('幾耐重置一次','修改後會按新週期重新判斷交易進度。',`<select data-k="periodType" onchange="editListRefresh('${t.id}','periodType',this)">${editSelectOptions(periodOptions,t.periodType)}</select>`,'list-period-select-row');
  return `<section class="edit-section" data-list-section="limits"><div class="edit-section-head"><strong>簽賬上限及週期</strong><small>優惠簽賬／回贈上限、計算週期及有效日期。</small></div>${v16ListRow('設有簽賬或回贈上限嗎','先設定回贈率，再輸入簽賬上限或回贈上限；另一邊會自動換算。',editYesNoToggle(t.id,t.capEnabled,'setCapEnabled'))}<div class="list-slot" data-v16-slot="cap">${t.capEnabled?v16CapReveal(t):''}</div>${periodRow}<div data-list-period-dynamic>${v16RenderPeriodDynamic(t)}</div></section>`;
}
function v16RenderRuleSection(t){return `<section class="edit-section" data-list-section="rules"><div class="edit-section-head"><strong>達標規則</strong><small>${esc(mechanicLabel(t))} 專用設定。</small></div><div class="edit-rule-block" data-list-rule-content>${renderListCreateRuleFields(t)}</div></section>`}

renderEditList=function(t){
  const typeLabel=t.targetType==='welcome'?'迎新優惠':'簽賬回贈';
  const mechanicOptions=MECHANICS.map(([k,,n])=>[k,n]);
  const basic=`<section class="edit-section" data-list-section="basic"><div class="edit-section-head"><strong>基本資料</strong><small>信用卡、優惠大類同計算玩法。</small></div>${v16ListRow('信用卡','輸入現有卡名可以移去同一張實體信用卡。',`<input data-k="name" class="card-name-input wizard-name-input" autocomplete="off" value="${esc(t.name)}">`)}${v16ListRow('優惠類別','簽賬回贈或迎新優惠。',`<select data-k="targetType" onchange="editListRefresh('${t.id}','targetType',this)"><option value="rebate" ${t.targetType==='rebate'?'selected':''}>簽賬回贈</option><option value="welcome" ${t.targetType==='welcome'?'selected':''}>迎新優惠</option></select>`)}<div class="edit-row" data-list-row="mechanic">${v16MechanicRowInner(t)}</div></section>`;
  const rules=v16RenderRuleSection(t),limits=v16RenderLimitsSection(t),rulesLast=v16RuleLast(t);
  return `<div class="edit-shell list-create-shell"><div class="settings-card" data-id="${t.id}"><div class="edit-hero"><div class="edit-eyebrow" data-list-eyebrow>${creatingNewTarget?'＋ 清單式新增':'✎ 清單式修改'} · ${esc(typeLabel)}</div><h2 class="edit-title">${esc(t.name||'未命名信用卡')}</h2><p class="edit-subtitle">${creatingNewTarget?'一次過以清單形式填寫優惠目標所有設定；所有玩法都使用左面描述、右面輸入／選擇。':'修改優惠同樣使用清單形式；所有玩法都用同一套左右欄，選擇時只局部更新。'}</p></div>${basic}${v16RenderEligibilitySection(t)}${rulesLast?'':rules}${limits}${rulesLast?rules:''}<div class="edit-actions"><button class="edit-save" type="button" onclick="saveTarget('${t.id}')">${creatingNewTarget?'新增優惠目標':'儲存修改'}</button>${creatingNewTarget?`<button class="edit-danger" type="button" onclick="closeModal('settingsModal')">取消新增</button>`:`<button class="edit-danger" type="button" onclick="removeTarget('${t.id}')">刪除呢個優惠</button>`}</div></div></div>`;
};

function v16PlaceRuleSection(t){
  const card=v16ListCard(t.id),rule=card?.querySelector('[data-list-section="rules"]'),limits=card?.querySelector('[data-list-section="limits"]'),actions=card?.querySelector('.edit-actions');if(!card||!rule||!limits)return;
  if(v16RuleLast(t)){if(actions&&rule.nextElementSibling!==actions)card.insertBefore(rule,actions)}else if(rule.nextElementSibling!==limits)card.insertBefore(rule,limits);
}
function v16PatchRules(t){
  const card=v16ListCard(t.id),section=card?.querySelector('[data-list-section="rules"]'),content=section?.querySelector('[data-list-rule-content]');if(!section||!content)return;
  const small=section.querySelector('.edit-section-head small');if(small)small.textContent=`${mechanicLabel(t)} 專用設定。`;v16MorphInner(content,renderListCreateRuleFields(t));v16PlaceRuleSection(t);
}
function v16PatchMechanicRow(t){const row=v16ListCard(t.id)?.querySelector('[data-list-row="mechanic"]');if(row)v16MorphInner(row,v16MechanicRowInner(t))}
function v16PatchLimits(t){const old=v16ListCard(t.id)?.querySelector('[data-list-section="limits"]');if(old)v16MorphElement(old,v16RenderLimitsSection(t));v16PlaceRuleSection(t)}
function v16PatchPeriod(t){const slot=v16ListCard(t.id)?.querySelector('[data-list-period-dynamic]');if(slot)v16MorphInner(slot,v16RenderPeriodDynamic(t))}
function v16PatchEligibility(t){
  const card=v16ListCard(t.id),slot=card?.querySelector('[data-v16-slot="categories"]');if(!slot)return;
  if(t.eligibilityMode==='categories'){v16SetSlot(slot,v16CategoryReveal(t),true)}else v16SetSlot(slot,'',false);
}
window.editListRefresh=(id,field,source)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);
  if(field==='targetType'){
    t.targetType=source?.value==='welcome'?'welcome':'rebate';
    if(t.targetType==='welcome'){t.mechanic='milestone';t.periodType='approval_window';t.eligibilityMode='all'}else if(t.periodType==='approval_window')t.periodType='monthly';
    const eyebrow=v16ListCard(id)?.querySelector('[data-list-eyebrow]');if(eyebrow)eyebrow.textContent=`${creatingNewTarget?'＋ 清單式新增':'✎ 清單式修改'} · ${t.targetType==='welcome'?'迎新優惠':'簽賬回贈'}`;
    v16PatchMechanicRow(t);v16PatchRules(t);v16PatchLimits(t);v16PatchEligibility(t);return;
  }
  if(field==='mechanic'){
    t.mechanic=MECHANICS.some(x=>x[0]===source?.value)?source.value:'standard';
    if(t.mechanic==='tier_rate'){t.thresholdRewardCategories=t.thresholdRewardCategories||[];if(!(t.tiers||[]).length)t.tiers=[{threshold:0,rate:0,rewardType:'現金回贈',reward:0,rewardMode:'rate'}]}
    if((t.mechanic==='milestone'||t.mechanic==='custom')&&!(t.milestones||[]).length)t.milestones=[{threshold:0,rewardType:'現金回贈',reward:0,startDate:'',endDate:''}];
    if(t.mechanic==='stamp'&&!(t.stampMilestones||[]).length)t.stampMilestones=[{count:1,rewardType:'現金回贈',reward:0}];
    v16PatchRules(t);v16PatchLimits(t);return;
  }
  if(field==='eligibilityMode'){t.eligibilityMode=source?.value==='categories'?'categories':'all';v16PatchEligibility(t);return}
  if(field==='periodType'){t.periodType=source?.value||t.periodType;v16PatchPeriod(t);const ruleContent=v16ListCard(id)?.querySelector('[data-list-rule-content]');if(t.mechanic==='standard'&&ruleContent)v16MorphInner(ruleContent,renderListCreateRuleFields(t));return}
};

/* 回贈率先行：未輸入有效回贈率，上限欄只顯示提示並鎖定。 */
linkedCapFields=function(t,compact=false){
  const {spend,reward,rate}=capAmounts(t),ready=rate>0,inputClass=compact?'':' wizard-name-input';
  const primarySpend=!ready&&t.capType==='spend'?Math.max(0,Number(t.capAmount||0)):spend;
  const primaryReward=!ready&&t.capType==='reward'?Math.max(0,Number(t.capAmount||0)):reward;
  const dis=ready?'':' disabled aria-disabled="true"';
  const hint=ready?`按回贈率 <b>${Number(rate.toFixed(2))}%</b> 自動雙向換算；輸入任何一邊，另一邊會即時更新。`:`請先在「達標規則」輸入 <b>回贈率</b>；設定有效百分比後，簽賬上限／回贈上限才會啟用雙向換算。`;
  return `<div class="linked-cap-fields ${ready?'':'cap-rate-pending'}" data-linked-cap-id="${t.id}"><div class="linked-cap-field"><label>簽賬上限 HK$</label><input class="${inputClass.trim()}" data-cap-link="spend" type="number" min="0" step="0.01" value="${capInputValue(primarySpend)}" placeholder="例如 125000" oninput="syncLinkedCapInput(this,'${t.id}','spend')"${dis}></div><div class="linked-cap-field"><label>回贈上限 HK$</label><input class="${inputClass.trim()}" data-cap-link="reward" type="number" min="0" step="0.01" value="${capInputValue(primaryReward)}" placeholder="例如 5000" oninput="syncLinkedCapInput(this,'${t.id}','reward')"${dis}></div><div class="linked-cap-hint ${ready?'':'cap-rate-pending'}">${hint}</div></div>`;
};
window.syncLinkedCapInput=(el,id,kind)=>{
  const t=state.cards.find(x=>x.id===id);if(!t||!['spend','reward'].includes(kind))return;const rate=capRate(t);if(rate<=0)return;
  syncEditorDraft(id);const value=Math.max(0,Number(el.value||0));t.capEnabled=true;t.capType=kind;t.capAmount=value;
  const scope=el.closest('.linked-cap-fields'),otherKind=kind==='spend'?'reward':'spend',other=scope?.querySelector(`[data-cap-link="${otherKind}"]`),caps=capAmounts(t);if(other)other.value=capInputValue(otherKind==='spend'?caps.spend:caps.reward);
};
window.syncCapAfterRateInput=(el,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;t.rebateRate=Math.max(0,Number(el.value||0));const scope=v16ListCard(id)?.querySelector('.linked-cap-fields')||document.querySelector(`.settings-card[data-id="${id}"] .linked-cap-fields`);if(!scope)return;
  const ready=t.rebateRate>0,caps=capAmounts(t),spend=scope.querySelector('[data-cap-link="spend"]'),reward=scope.querySelector('[data-cap-link="reward"]'),hint=scope.querySelector('.linked-cap-hint');
  scope.classList.toggle('cap-rate-pending',!ready);[spend,reward].forEach(x=>{if(!x)return;x.disabled=!ready;x.setAttribute('aria-disabled',ready?'false':'true')});
  if(ready){if(spend)spend.value=capInputValue(caps.spend);if(reward)reward.value=capInputValue(caps.reward);if(hint){hint.classList.remove('cap-rate-pending');hint.innerHTML=`按回贈率 <b>${Number(caps.rate.toFixed(2))}%</b> 自動雙向換算；輸入任何一邊，另一邊會即時更新。`}}
  else{if(spend)spend.value=t.capType==='spend'?capInputValue(t.capAmount):'';if(reward)reward.value=t.capType==='reward'?capInputValue(t.capAmount):'';if(hint){hint.classList.add('cap-rate-pending');hint.innerHTML='請先在「達標規則」輸入 <b>回贈率</b>；設定有效百分比後，簽賬上限／回贈上限才會啟用雙向換算。'}}
};

const v16OldSetMinTransactionEnabled=window.setMinTransactionEnabled;
const v16OldSetCapEnabled=window.setCapEnabled;
const v16OldSetTierRewardMode=window.setTierRewardMode;
const v16OldSetStampEarnMode=window.setStampEarnMode;
const v16OldSetStampDailyCapEnabled=window.setStampDailyCapEnabled;
const v16OldSetStampMode=window.setStampMode;
const v16OldSetMilestoneBonusEnabled=window.setMilestoneBonusEnabled;
const v16OldAddRuleRow=window.addRuleRow;
const v16OldRemoveRuleRow=window.removeRuleRow;

window.setMinTransactionEnabled=(btn,id,enabled)=>{
  if(!v16IsListEditor(id))return v16OldSetMinTransactionEnabled(btn,id,enabled);const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.minTransactionEnabled=!!enabled;if(!enabled)t.minTransaction=0;setEditSwitchVisual(btn,!!enabled);
  const slot=v16ListCard(id)?.querySelector('[data-v16-slot="min-transaction"]');v16SetSlot(slot,enabled?v16MinReveal(t):'',!!enabled);
};
window.setCapEnabled=(btn,id,enabled)=>{
  if(!v16IsListEditor(id))return v16OldSetCapEnabled(btn,id,enabled);const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.capEnabled=!!enabled;if(!enabled){t.capType='none';t.capAmount=0}setEditSwitchVisual(btn,!!enabled);
  const slot=v16ListCard(id)?.querySelector('[data-v16-slot="cap"]');v16SetSlot(slot,enabled?v16CapReveal(t):'',!!enabled);
};
window.setTierRewardMode=(btn,id,index,mode)=>{
  if(!v16IsListEditor(id))return v16OldSetTierRewardMode(btn,id,index,mode);const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);const m=['rate','reward','category_rate'].includes(mode)?mode:'rate';if(!t.tiers[index])return;t.tiers[index].rewardMode=m;const modes=new Set(t.tiers.map(x=>x.rewardMode||'rate'));t.thresholdRewardMode=modes.size===1?[...modes][0]:'mixed';
  const content=v16ListCard(id)?.querySelector('[data-list-rule-content]');if(content)v16MorphInner(content,v16RenderThresholdList(t));
};
window.setStampEarnMode=(btn,id,mode)=>{
  if(!v16IsListEditor(id))return v16OldSetStampEarnMode(btn,id,mode);const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.stampEarnMode=mode==='cumulative'?'cumulative':'per_txn';v16PatchRules(t);
};
window.setStampDailyCapEnabled=(btn,id,enabled)=>{
  if(!v16IsListEditor(id))return v16OldSetStampDailyCapEnabled(btn,id,enabled);const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.stampDailyCapEnabled=!!enabled;if(enabled&&Number(t.stampDailyCap||0)<1)t.stampDailyCap=1;setEditSwitchVisual(btn,!!enabled);const slot=v16ListCard(id)?.querySelector('[data-v16-slot="stamp-daily"]');v16SetSlot(slot,enabled?v16StampDailyRows(t):'',!!enabled);
};
window.setStampMode=(btn,id,mode)=>{
  if(!v16IsListEditor(id))return v16OldSetStampMode(btn,id,mode);const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.stampMode=mode==='repeat'?'repeat':'stages';v16PatchRules(t);
};
window.setMilestoneBonusEnabled=(btn,id,enabled)=>{
  if(!v16IsListEditor(id))return v16OldSetMilestoneBonusEnabled(btn,id,enabled);const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.milestoneBonusEnabled=!!enabled;if(!enabled){t.milestoneBonusSpend=0;t.milestoneBonus=0}setEditSwitchVisual(btn,!!enabled);const slot=v16ListCard(id)?.querySelector('[data-v16-slot="milestone-bonus"]');v16SetSlot(slot,enabled?v16MilestoneBonusRows(t):'',!!enabled);
};
window.addRuleRow=(kind,btn)=>{
  if(!editingTargetId||!v16IsListEditor(editingTargetId))return v16OldAddRuleRow(kind,btn);const t=state.cards.find(x=>x.id===editingTargetId);if(!t)return;syncEditorDraft(t.id);
  if(kind==='tier')t.tiers.push({threshold:0,rate:0,rewardType:'現金回贈',reward:0,rewardMode:'rate'});if(kind==='milestone')t.milestones.push({threshold:0,rewardType:'現金回贈',reward:0,startDate:'',endDate:''});if(kind==='stamp')t.stampMilestones.push({count:1,rewardType:'現金回贈',reward:0});
  const content=v16ListCard(t.id)?.querySelector('[data-list-rule-content]');if(content){v16MorphInner(content,renderListCreateRuleFields(t));setTimeout(()=>content.querySelectorAll('[data-tier-row],[data-milestone-row],[data-stamp-row]')?.item(content.querySelectorAll('[data-tier-row],[data-milestone-row],[data-stamp-row]').length-1)?.classList.add('v16-new-row'),20)}
};
window.removeRuleRow=(kind,i,btn)=>{
  if(!editingTargetId||!v16IsListEditor(editingTargetId))return v16OldRemoveRuleRow(kind,i,btn);const t=state.cards.find(x=>x.id===editingTargetId);if(!t)return;syncEditorDraft(t.id);const arr=kind==='tier'?t.tiers:kind==='stamp'?t.stampMilestones:t.milestones;if(arr.length<=1)return;
  const row=btn?.closest('[data-tier-row],[data-milestone-row],[data-stamp-row]');const commit=()=>{arr.splice(i,1);const content=v16ListCard(t.id)?.querySelector('[data-list-rule-content]');if(content)v16MorphInner(content,renderListCreateRuleFields(t))};if(row)v16AnimateClose(row,commit);else commit();
};



/* ===== v17 runtime patches ===== */
/* 1) 真正 state-aware Toggle：每次 click 都按畫面當刻 on/off 反轉，不再把第一次 render 時的布林值寫死。 */
editYesNoToggle=function(id,on,handler){
  return `<div class="edit-yn-toggle"><span class="${on?'active':''}">有</span><button class="edit-switch ${on?'on':''}" type="button" role="switch" aria-checked="${on?'true':'false'}" aria-label="${on?'目前：有；按一下改為沒有':'目前：沒有；按一下改為有'}" onclick="${handler}(this,'${id}',!this.classList.contains('on'))"><i></i></button><span class="${!on?'active':''}">沒有</span></div>`;
};

/* 2) 清單模式：合資格簽賬範圍改為全闊 category chips，不再用左描述／右下拉。 */
function v17EligibilitySet(t){
  return t.eligibilityMode==='all'?new Set(PRESET_CATEGORIES):new Set(t.rebateCategories||[]);
}
function v17EligibilityStatus(t){
  if(t.eligibilityMode==='all')return '目前：所有合資格簽賬';
  const n=(t.rebateCategories||[]).length;return n?`目前：已選 ${n} 個簽賬範圍`:'目前：未選擇簽賬範圍';
}
function v17EligibilityChip(t,cat,selected){
  const em=CATEGORY_EMOJI[cat]||'🏷️',enc=encodeURIComponent(cat).replace(/'/g,'%27');
  return `<button class="eligibility-chip ${selected?'active':''}" type="button" data-eligibility-value="${esc(cat)}" onclick="v17ToggleEligibilityCategory(this,'${t.id}','${enc}')"><span class="emoji">${em}</span>${esc(cat)}</button>`;
}
function v17RenderEligibilityScope(t){
  const selected=v17EligibilitySet(t),custom=(t.eligibilityMode==='categories'?(t.rebateCategories||[]):[]).filter(x=>!PRESET_CATEGORIES.includes(x));
  return `<div class="list-eligibility-scope"><div class="list-eligibility-scope-head"><div><div class="list-eligibility-scope-title">合資格簽賬範圍</div><div class="list-eligibility-scope-status" data-v17-eligibility-status>${esc(v17EligibilityStatus(t))}</div></div><button class="list-eligibility-all" type="button" onclick="v17SelectAllEligibility(this,'${t.id}')">全部合資格</button></div><div class="list-eligibility-chip-grid">${PRESET_CATEGORIES.map(cat=>v17EligibilityChip(t,cat,selected.has(cat))).join('')}</div><div class="list-eligibility-custom"><div class="custom-category-caption">其他自定義類別</div><div class="category-input-row"><input class="v17-eligibility-custom-new" autocomplete="off" placeholder="輸入自定義類別"><button class="category-add" type="button" onclick="v17AddEligibilityCustom(this,'${t.id}')">＋</button></div><div class="custom-category-tags" data-v17-eligibility-custom>${custom.map(cat=>`<button class="cat-chip list-eligibility-custom-chip" type="button" data-eligibility-custom="${esc(cat)}" onclick="v17RemoveEligibilityCustom(this,'${t.id}')">${esc(cat)} <span>×</span></button>`).join('')}</div></div></div>`;
}
function v17RefreshEligibilityVisual(id){
  const t=state.cards.find(x=>x.id===id),card=v16ListCard(id);if(!t||!card)return;
  const status=card.querySelector('[data-v17-eligibility-status]');if(status)status.textContent=v17EligibilityStatus(t);
}
window.v17ToggleEligibilityCategory=(btn,id,encoded)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);
  const cat=decodeURIComponent(encoded),selected=v17EligibilitySet(t);
  if(selected.has(cat))selected.delete(cat);else selected.add(cat);
  const custom=(t.eligibilityMode==='categories'?(t.rebateCategories||[]):[]).filter(x=>!PRESET_CATEGORIES.includes(x));
  const allPreset=PRESET_CATEGORIES.every(x=>selected.has(x));
  if(allPreset&&!custom.length){t.eligibilityMode='all';t.rebateCategories=[]}
  else{t.eligibilityMode='categories';t.rebateCategories=[...PRESET_CATEGORIES.filter(x=>selected.has(x)),...custom]}
  btn.classList.toggle('active',selected.has(cat));v17RefreshEligibilityVisual(id);
};
window.v17SelectAllEligibility=(btn,id)=>{
  const t=state.cards.find(x=>x.id===id),card=v16ListCard(id);if(!t||!card)return;
  t.eligibilityMode='all';t.rebateCategories=[];
  card.querySelectorAll('.eligibility-chip').forEach(x=>x.classList.add('active'));
  const custom=card.querySelector('[data-v17-eligibility-custom]');if(custom)custom.innerHTML='';
  v17RefreshEligibilityVisual(id);
};
window.v17AddEligibilityCustom=(btn,id)=>{
  const t=state.cards.find(x=>x.id===id),card=v16ListCard(id),input=btn?.closest('.category-input-row')?.querySelector('.v17-eligibility-custom-new');if(!t||!card||!input)return;
  const value=String(input.value||'').trim();if(!value)return;
  const preset=PRESET_CATEGORIES.find(x=>x===value);if(preset){const chip=[...card.querySelectorAll('.eligibility-chip')].find(x=>x.dataset.eligibilityValue===preset);if(chip&&!chip.classList.contains('active'))v17ToggleEligibilityCategory(chip,id,encodeURIComponent(preset));input.value='';return}
  const selected=v17EligibilitySet(t),custom=t.eligibilityMode==='categories'?(t.rebateCategories||[]).filter(x=>!PRESET_CATEGORIES.includes(x)):[];
  if(!custom.includes(value))custom.push(value);
  t.eligibilityMode='categories';t.rebateCategories=[...PRESET_CATEGORIES.filter(x=>selected.has(x)),...custom];
  const tags=card.querySelector('[data-v17-eligibility-custom]');if(tags&&!tags.querySelector(`[data-eligibility-custom="${CSS.escape(value)}"]`)){const chip=document.createElement('button');chip.type='button';chip.className='cat-chip list-eligibility-custom-chip';chip.dataset.eligibilityCustom=value;chip.innerHTML=`${esc(value)} <span>×</span>`;chip.onclick=()=>v17RemoveEligibilityCustom(chip,id);tags.appendChild(chip)}
  input.value='';v17RefreshEligibilityVisual(id);
};
window.v17RemoveEligibilityCustom=(btn,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;const value=btn?.dataset.eligibilityCustom||'';
  t.rebateCategories=(t.rebateCategories||[]).filter(x=>x!==value);btn?.remove();
  const selected=v17EligibilitySet(t),hasCustom=(t.rebateCategories||[]).some(x=>!PRESET_CATEGORIES.includes(x));
  if(PRESET_CATEGORIES.every(x=>selected.has(x))&&!hasCustom){t.eligibilityMode='all';t.rebateCategories=[]}
  else t.eligibilityMode='categories';
  v17RefreshEligibilityVisual(id);
};

v16RenderEligibilitySection=function(t){
  return `<section class="edit-section" data-list-section="eligibility"><div class="edit-section-head"><strong>合資格簽賬</strong><small>直接點選合資格簽賬範圍；呢一項會用全闊排列。</small></div>${v17RenderEligibilityScope(t)}${v16ListRow('設有每筆最低簽賬嗎','開啟後可輸入每筆最低簽賬金額。',editYesNoToggle(t.id,!!t.minTransactionEnabled,'setMinTransactionEnabled'))}<div class="list-slot" data-v16-slot="min-transaction">${t.minTransactionEnabled?v16MinReveal(t):''}</div></section>`;
};

/* 3) 問卷流程跟清單邏輯：一般／門檻先填達標規則（包括回贈率），之後先問上限。印花／階段仍把達標規則放後面。 */
const v17RenderWizardStepBase=renderWizardStep;
function v17WizardRulesLast(t){return ['stamp','milestone','custom'].includes(t.mechanic)}
function v17RenderWizardEligibility(t){
  const selected=new Set(t.rebateCategories||[]),custom=[...selected].filter(x=>!PRESET_CATEGORIES.includes(x));
  return `<div class="wizard-question">邊啲簽賬先計入？</div><div class="wizard-help">先設定合資格簽賬；達標規則同簽賬／回贈上限會按正確次序之後再問。</div><div class="wizard-options">${optionButton(t.eligibilityMode==='all','✅','所有合資格簽賬','一般合資格簽賬都可以計入',`selectEligibility(this,'${t.id}','all')`)}${optionButton(t.eligibilityMode==='categories','🏷️','指定類別','只計你指定的簽賬類別',`openCategoryPicker(this,'${t.id}')`)}</div>${t.eligibilityMode==='categories'?`<div class="wizard-section"><div class="wizard-section-title">要計入嘅指定類別</div><div class="wizard-chip-row">${PRESET_CATEGORIES.map(cat=>categoryButton(cat,selected.has(cat))).join('')}</div><div class="custom-category-caption">其他自定義類別</div><div class="category-input-row"><input class="category-new" autocomplete="off" placeholder="輸入自定義類別"><button class="category-add" type="button" onclick="addCategoryTag(this)">＋</button></div><div class="custom-category-tags">${custom.map(cat=>`<button class="cat-chip" type="button" data-value="${esc(cat)}" onclick="this.remove()">${esc(cat)} <span>×</span></button>`).join('')}</div></div>`:''}<button class="wizard-answer" type="button" onclick="finishCategories(this,'${t.id}')">確認合資格簽賬並繼續</button>`;
}
function v17RenderPeriodQuestion(t){
  return `<div class="wizard-question">幾耐重置一次？</div><div class="wizard-help">決定進度幾時歸零再重新計；「指定推廣期」適合整段指定日期只累積一次。</div><div class="wizard-options">${[['monthly','🗓️','每月','每月重新計算'],['yearly','🧾','全年','按曆年重新計算'],['campaign','⏳','指定推廣期','由指定開始日至結束日累積，不中途重置']].map(([k,i,n,d])=>optionButton(t.periodType===k,i,n,d,`selectPeriod(this,'${t.id}','${k}')`)).join('')}</div>`;
}
function v17RenderDateQuestion(t){
  return `<div class="wizard-question">推廣期由幾時到幾時？</div><div class="wizard-help">開始及結束日期可以留空；如玩法需要指定推廣期，請填完整日期。</div><div class="wizard-choice-stack">${optionButton(!t.startDate&&!t.endDate,'—','沒有指定推廣日期','保留空白，不限制開始及結束日期',`clearDatesAndAdvance(this,'${t.id}')`)}</div><div class="wizard-section"><div class="wizard-input-grid"><div class="wizard-big-field full"><label>推廣開始日期（可選）</label>${datePartsInput('startDate',t.startDate)}</div><div class="wizard-big-field full"><label>推廣結束日期（可選）</label>${datePartsInput('endDate',t.endDate)}</div></div></div><button class="wizard-answer" type="button" onclick="finishDates(this,'${t.id}')">套用推廣日期</button>`;
}
function v17RenderLimitQuestion(t){
  return `<div class="wizard-question">簽賬限制</div><div class="wizard-help">先設定每筆最低簽賬，再設定簽賬／回贈上限。指定簽賬回贈會先完成回贈率，所以到呢一步先啟用雙向換算。</div>${renderLimitSettings(t)}`;
}
renderWizardStep=function(t){
  if(t.targetType==='welcome'||wizardStep<=3)return v17RenderWizardStepBase(t);
  if(wizardStep===4)return v17RenderWizardEligibility(t);
  const rulesLast=v17WizardRulesLast(t),milestone=(t.mechanic==='milestone'||t.mechanic==='custom');
  if(wizardStep===5)return rulesLast?v17RenderLimitQuestion(t):renderRuleStep(t);
  if(wizardStep===6){if(milestone)return renderRuleStep(t);return rulesLast?v17RenderPeriodQuestion(t):v17RenderLimitQuestion(t)}
  if(wizardStep===7)return rulesLast?v17RenderDateQuestion(t):v17RenderPeriodQuestion(t);
  if(wizardStep===8)return rulesLast?renderRuleStep(t):v17RenderDateQuestion(t);
  return renderSummaryStep(t);
};

/* 清晰驗證：需要雙向換算時，先有有效回贈率。 */
const v17ValidateCapSettingsBase=validateCapSettings;
validateCapSettings=function(t){
  if(t.capEnabled&&t.mechanic==='standard'&&capRate(t)<=0){showNotice('請先在達標規則輸入回贈率，再設定簽賬／回贈上限');return false}
  return v17ValidateCapSettingsBase(t);
};

window.finishRules=(btn,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;const panel=document.querySelector(`.settings-card[data-id="${id}"]`);
  if(panel&&!validateVisibleDateInputs(panel)){showNotice('請檢查日期是否正確');return}syncEditorDraft(id);
  if(!validateThresholdRules(t)||!validateMilestoneRules(t)||!validateStampRules(t))return;
  const next=v17WizardRulesLast(t)?9:6;flashThen(btn,()=>transitionWizard(next,'forward',false));
};
window.finishLimits=(btn,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);if(!validateLimitSettings(t))return;
  const next=v17WizardRulesLast(t)?6:7;flashThen(btn,()=>transitionWizard(next,'forward',false));
};
window.selectPeriod=(btn,id,p)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);const allowed=['monthly','campaign','yearly'];t.periodType=allowed.includes(p)?p:'monthly';
  const next=v17WizardRulesLast(t)?7:8;flashThen(btn,()=>transitionWizard(next,'forward',false));
};
window.clearDatesAndAdvance=(btn,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;syncEditorDraft(id);t.startDate='';t.endDate='';
  const next=v17WizardRulesLast(t)?8:9;flashThen(btn,()=>transitionWizard(next,'forward',false));
};
window.finishDates=(btn,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;const panel=document.querySelector(`.settings-card[data-id="${id}"]`);
  if(panel&&!validateVisibleDateInputs(panel)){showNotice('請檢查日期是否正確');return}syncEditorDraft(id);
  if(t.mechanic==='recurring'&&(!t.startDate||!t.endDate)){showNotice('分期／連續達標需要設定推廣開始及結束日期');return}
  const next=v17WizardRulesLast(t)?8:9;flashThen(btn,()=>transitionWizard(next,'forward',false));
};

const v17WizardBackBase=window.wizardBack;
window.wizardBack=()=>{
  if(!creatingNewTarget)return;if(listCreateMode){
    syncEditorDraft(editingTargetId);const shell=document.querySelector('#settingsCards .list-create-shell');
    const finish=()=>{listCreateMode=false;wizardStep=3;wizardEntering='back';renderSettings()};
    if(shell){shell.classList.add('list-exit-back');setTimeout(finish,260)}else finish();
    return
  }
  const t=state.cards.find(x=>x.id===editingTargetId);if(!t||t.targetType==='welcome'){v17WizardBackBase();return}
  if(wizardStep<=1)return;
  if(wizardStep===9&&(t.mechanic==='milestone'||t.mechanic==='custom')){transitionWizard(6,'back',true);return}
  transitionWizard(wizardStep-1,'back',true);
};



/* ===== v18 runtime patches ===== */
/* 清單：合資格簽賬範圍回復「所有／指定」下拉式；指定時才向下展開類別選擇。 */
v16RenderEligibilitySection=function(t){
  return `<section class="edit-section" data-list-section="eligibility"><div class="edit-section-head"><strong>合資格簽賬</strong><small>決定邊啲交易可以計入呢個優惠。</small></div>${v16ListRow('合資格簽賬範圍','所有合資格簽賬，或者只限指定類別。',`<select data-k="eligibilityMode" onchange="editListRefresh('${t.id}','eligibilityMode',this)"><option value="all" ${t.eligibilityMode==='all'?'selected':''}>所有合資格簽賬</option><option value="categories" ${t.eligibilityMode==='categories'?'selected':''}>指定類別</option></select>`)}<div class="list-slot" data-v16-slot="categories">${t.eligibilityMode==='categories'?v16CategoryReveal(t):''}</div>${v16ListRow('設有每筆最低簽賬嗎','開啟後可輸入每筆最低簽賬金額。',editYesNoToggle(t.id,!!t.minTransactionEnabled,'setMinTransactionEnabled'))}<div class="list-slot" data-v16-slot="min-transaction">${t.minTransactionEnabled?v16MinReveal(t):''}</div></section>`;
};

/* 清單：「簽賬上限」及「週期」拆成兩個獨立 section。 */
function v18RenderCapSection(t){
  return `<section class="edit-section" data-list-section="cap"><div class="edit-section-head"><strong>簽賬上限</strong><small>設定優惠簽賬／回贈上限；如適用，會按回贈率雙向換算。</small></div>${v16ListRow('設有簽賬或回贈上限嗎','先設定回贈率，再輸入簽賬上限或回贈上限；另一邊會自動換算。',editYesNoToggle(t.id,!!t.capEnabled,'setCapEnabled'))}<div class="list-slot" data-v16-slot="cap">${t.capEnabled?v16CapReveal(t):''}</div></section>`;
}
function v18RenderPeriodSection(t){
  const stageDated=(t.mechanic==='milestone'||t.mechanic==='custom')&&t.targetType!=='welcome';
  const periodOptions=t.targetType==='welcome'?[['approval_window','批卡後指定日數']]:[['monthly','每月'],['yearly','全年'],['campaign','指定推廣期']];
  const periodRow=stageDated?'':v16ListRow('幾耐重置一次','修改後會按新週期重新判斷交易進度。',`<select data-k="periodType" onchange="editListRefresh('${t.id}','periodType',this)">${editSelectOptions(periodOptions,t.periodType)}</select>`,'list-period-select-row');
  return `<section class="edit-section" data-list-section="period"><div class="edit-section-head"><strong>週期</strong><small>設定計算週期及優惠有效日期。</small></div>${periodRow}<div data-list-period-dynamic>${v16RenderPeriodDynamic(t)}</div></section>`;
}

/* 清單固定次序：基本資料 → 合資格簽賬 → 達標規則 → 簽賬上限 → 週期。 */
renderEditList=function(t){
  const typeLabel=t.targetType==='welcome'?'迎新優惠':'簽賬回贈';
  const mechanicOptions=MECHANICS.map(([k,,n])=>[k,n]);
  const basic=`<section class="edit-section" data-list-section="basic"><div class="edit-section-head"><strong>基本資料</strong><small>信用卡、優惠大類同計算玩法。</small></div>${v16ListRow('信用卡','輸入現有卡名可以移去同一張實體信用卡。',`<input data-k="name" class="card-name-input wizard-name-input" autocomplete="off" value="${esc(t.name)}">`)}${v16ListRow('優惠類別','簽賬回贈或迎新優惠。',`<select data-k="targetType" onchange="editListRefresh('${t.id}','targetType',this)"><option value="rebate" ${t.targetType==='rebate'?'selected':''}>簽賬回贈</option><option value="welcome" ${t.targetType==='welcome'?'selected':''}>迎新優惠</option></select>`)}<div class="edit-row" data-list-row="mechanic">${v16MechanicRowInner(t)}</div></section>`;
  return `<div class="edit-shell list-create-shell"><div class="settings-card" data-id="${t.id}"><div class="edit-hero"><div class="edit-eyebrow" data-list-eyebrow>${creatingNewTarget?'＋ 清單式新增':'✎ 清單式修改'} · ${esc(typeLabel)}</div><h2 class="edit-title">${esc(t.name||'未命名信用卡')}</h2><p class="edit-subtitle">${creatingNewTarget?'一次過以清單形式填寫優惠目標所有設定；選擇相關選項時會局部平滑展開。':'修改優惠同樣使用清單形式；選擇時只局部更新，不會重建整頁。'}</p></div>${basic}${v16RenderEligibilitySection(t)}${v16RenderRuleSection(t)}${v18RenderCapSection(t)}${v18RenderPeriodSection(t)}<div class="edit-actions"><button class="edit-save" type="button" onclick="saveTarget('${t.id}')">${creatingNewTarget?'新增優惠目標':'儲存修改'}</button>${creatingNewTarget?`<button class="edit-danger" type="button" onclick="closeModal('settingsModal')">取消新增</button>`:`<button class="edit-danger" type="button" onclick="removeTarget('${t.id}')">刪除呢個優惠</button>`}</div></div></div>`;
};

/* v16/v17 的局部 patch 改為配合拆開後的兩個 section。 */
v16PlaceRuleSection=function(t){
  const card=v16ListCard(t.id),rule=card?.querySelector('[data-list-section="rules"]'),cap=card?.querySelector('[data-list-section="cap"]');
  if(card&&rule&&cap&&rule.nextElementSibling!==cap)card.insertBefore(rule,cap);
};
v16PatchLimits=function(t){
  const card=v16ListCard(t.id);if(!card)return;
  const cap=card.querySelector('[data-list-section="cap"]'),period=card.querySelector('[data-list-section="period"]');
  if(cap)v16MorphElement(cap,v18RenderCapSection(t));
  if(period)v16MorphElement(period,v18RenderPeriodSection(t));
  v16PlaceRuleSection(t);
};
v16PatchPeriod=function(t){
  const card=v16ListCard(t.id),period=card?.querySelector('[data-list-section="period"]');
  if(!period)return;
  const fresh=document.createElement('template');fresh.innerHTML=v18RenderPeriodSection(t).trim();
  const next=fresh.content.firstElementChild;if(next)v16MorphElement(period,next.outerHTML);
};



/* ===== v19 runtime patches ===== */
/* 門檻獎賞的上限換算：只有最高門檻本身是百分比回贈時，才用該百分比換算。
   不論有沒有回贈率，簽賬上限都可以直接輸入。 */
capRate=function(t){
  if(!t)return 0;
  if(t.mechanic==='tier_rate'){
    const tiers=[...(t.tiers||[])].sort((a,b)=>Number(a.threshold||0)-Number(b.threshold||0));
    const top=tiers.at(-1);
    if(top&&['rate','category_rate'].includes(top.rewardMode||'rate'))return Math.max(0,Number(top.rate||0));
    return 0;
  }
  return Math.max(0,Number(t.rebateRate||0));
};
function v19CapRateCopy(t,rate){
  if(t?.mechanic==='tier_rate'){
    const tiers=[...(t.tiers||[])].sort((a,b)=>Number(a.threshold||0)-Number(b.threshold||0)),top=tiers.at(-1);
    if(rate>0)return `按最高門檻回贈率 <b>${Number(rate.toFixed(2))}%</b> 自動雙向換算；輸入任何一邊，另一邊會即時更新。`;
    if(top&&(top.rewardMode||'rate')==='reward')return '最高門檻使用 <b>直接獎賞</b>，所以沒有百分比可換算回贈上限；你仍可直接輸入簽賬上限。';
    return '簽賬上限可直接輸入；最高門檻輸入有效 <b>回贈率</b> 後，才會同時啟用回贈上限雙向換算。';
  }
  return rate>0?`按回贈率 <b>${Number(rate.toFixed(2))}%</b> 自動雙向換算；輸入任何一邊，另一邊會即時更新。`:'簽賬上限可直接輸入；要使用回贈上限雙向換算，請先在「達標規則」輸入有效 <b>回贈率</b>。';
}
linkedCapFields=function(t,compact=false){
  const {spend,reward,rate}=capAmounts(t),inputClass=compact?'':' wizard-name-input';
  const primarySpend=t.capType==='spend'?Math.max(0,Number(t.capAmount||0)):spend;
  const primaryReward=t.capType==='reward'?Math.max(0,Number(t.capAmount||0)):reward;
  const rewardDisabled=rate<=0?' disabled aria-disabled="true"':'';
  return `<div class="linked-cap-fields" data-linked-cap-id="${t.id}"><div class="linked-cap-field"><label>簽賬上限 HK$</label><input class="${inputClass.trim()}" data-cap-link="spend" type="number" min="0" step="0.01" value="${capInputValue(primarySpend)}" placeholder="例如 125000" oninput="syncLinkedCapInput(this,'${t.id}','spend')"></div><div class="linked-cap-field"><label>回贈上限 HK$</label><input class="${inputClass.trim()}" data-cap-link="reward" type="number" min="0" step="0.01" value="${capInputValue(primaryReward)}" placeholder="例如 5000" oninput="syncLinkedCapInput(this,'${t.id}','reward')"${rewardDisabled}></div><div class="linked-cap-hint ${rate>0?'':'cap-rate-pending'}">${v19CapRateCopy(t,rate)}</div></div>`;
};
window.syncLinkedCapInput=(el,id,kind)=>{
  const t=state.cards.find(x=>x.id===id);if(!t||!['spend','reward'].includes(kind))return;
  syncEditorDraft(id);const rate=capRate(t);if(kind==='reward'&&rate<=0)return;
  const value=Math.max(0,Number(el.value||0));t.capEnabled=true;t.capType=kind;t.capAmount=value;
  const scope=el.closest('.linked-cap-fields'),otherKind=kind==='spend'?'reward':'spend',other=scope?.querySelector(`[data-cap-link="${otherKind}"]`),caps=capAmounts(t);
  if(other){if(otherKind==='reward'&&rate<=0)other.value='';else other.value=capInputValue(otherKind==='spend'?caps.spend:caps.reward)}
};
function v19RefreshCapFields(id){
  const t=state.cards.find(x=>x.id===id);if(!t)return;const scope=v16ListCard(id)?.querySelector('.linked-cap-fields')||document.querySelector(`.settings-card[data-id="${id}"] .linked-cap-fields`);if(!scope)return;
  const rate=capRate(t),caps=capAmounts(t),spend=scope.querySelector('[data-cap-link="spend"]'),reward=scope.querySelector('[data-cap-link="reward"]'),hint=scope.querySelector('.linked-cap-hint');
  if(spend){spend.disabled=false;spend.setAttribute('aria-disabled','false');spend.value=capInputValue(t.capType==='spend'?t.capAmount:caps.spend)}
  if(reward){reward.disabled=rate<=0;reward.setAttribute('aria-disabled',rate>0?'false':'true');reward.value=rate>0?capInputValue(t.capType==='reward'?t.capAmount:caps.reward):(t.capType==='reward'?capInputValue(t.capAmount):'')}
  if(hint){hint.classList.toggle('cap-rate-pending',rate<=0);hint.innerHTML=v19CapRateCopy(t,rate)}
}
window.syncCapAfterRateInput=(el,id)=>{
  const t=state.cards.find(x=>x.id===id);if(!t)return;t.rebateRate=Math.max(0,Number(el.value||0));v19RefreshCapFields(id);
};
window.v19TierRateInput=(el,id,index)=>{
  const t=state.cards.find(x=>x.id===id);if(!t||!t.tiers?.[index])return;
  t.tiers[index].rate=Math.max(0,Number(el.value||0));v19RefreshCapFields(id);
};
/* 門檻 rate 欄加入即時通知上限區，避免「有」已開但上限仍鎖住。 */
v16RenderTierGroup=function(t,x,i){
  const mode=['rate','reward','category_rate'].includes(x.rewardMode)?x.rewardMode:'rate';
  const remove=(t.tiers||[]).length>1?`<button class="list-rule-delete" type="button" onclick="removeRuleRow('tier',${i},this)">刪除</button>`:'';
  let reward='';
  if(mode==='reward'){
    reward=v16ListRow('達標獎賞類型','現金、里數、積分、獎賞錢或禮物。',`<select data-tier-reward-type onchange="rewardTypeChanged(this,'${t.id}')">${rewardTypeOptions(x.rewardType)}</select>`)+v16ListRow(isTextRewardType(x.rewardType)?'禮物／獎賞內容':'獎賞額／數量',isTextRewardType(x.rewardType)?'可直接輸入中文或英文，例如：咖啡券 Coffee Voucher。':'輸入今個門檻直接取得的獎賞。',tierRewardInput(x.rewardType,x.reward));
  }else{
    reward=v16ListRow(mode==='category_rate'?'指定類別回贈率':'回贈率','達到呢個門檻後套用的百分比。',`<input data-tier-rate type="number" min="0" step="0.01" value="${Math.max(0,Number(x.rate||0))}" placeholder="%" oninput="v19TierRateInput(this,'${t.id}',${i})">`);
  }
  return `<div class="list-rule-group" data-tier-row data-tier-mode="${mode}" data-rule-index="${i}"><div class="list-rule-group-head"><div><strong>門檻 ${i+1}</strong><small>　獨立設定要求及獎賞</small></div>${remove}</div>${v16ListRow('達標後獎賞','每個門檻可以使用不同獎賞方式。',`<select onchange="setTierRewardMode(this,'${t.id}',${i},this.value)">${v16RewardModeOptions(mode)}</select>`)}${v16ListRow('累積簽滿','達到呢個累積簽賬金額後解鎖。',`<input data-tier-threshold type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(0,Number(x.threshold||0))}" placeholder="HK$" oninput="sanitizeNonNegativeInteger(this)">`)}${reward}</div>`;
};
/* 切換門檻獎賞方式後同步更新 cap 可否換算。 */
const v19SetTierRewardModeBase=window.setTierRewardMode;
window.setTierRewardMode=(btn,id,index,mode)=>{v19SetTierRewardModeBase(btn,id,index,mode);setTimeout(()=>v19RefreshCapFields(id),20)};
/* cap section 文案按門檻玩法調整。 */
v18RenderCapSection=function(t){
  const desc=t.mechanic==='tier_rate'?'門檻獎賞可直接設定簽賬上限；如最高門檻為百分比回贈，亦可雙向換算回贈上限。':'先設定回贈率，再輸入簽賬上限或回贈上限；另一邊會自動換算。';
  return `<section class="edit-section" data-list-section="cap"><div class="edit-section-head"><strong>簽賬上限</strong><small>設定優惠簽賬／回贈上限；此項屬可選設定。</small></div>${v16ListRow('設有簽賬或回贈上限嗎',desc,editYesNoToggle(t.id,!!t.capEnabled,'setCapEnabled'))}<div class="list-slot" data-v16-slot="cap">${t.capEnabled?v16CapReveal(t):''}</div></section>`;
};

/* 主頁門檻進度：一般以最高門檻為終點；如另設更高的「簽賬上限」，track 會延伸至該上限。
   簽賬上限只作為進度條尺度終點，不另外顯示金額文字；門檻標籤仍只顯示真正的獎賞門檻。 */
function v19TierMarkerReward(tier){
  const mode=tier?.rewardMode||'rate';
  if(mode==='reward')return esc(rewardValueLabel(tier.rewardType,tier.reward));
  const rate=Math.max(0,Number(tier?.rate||0));return `<b>額外</b> ${Number(rate.toFixed(2))}%`;
}

/* v20：相近進度節點自動分配不同高度，避免文字重疊。 */
function v20MarkerLanes(positions,minGap=22){
  const last=[-999,-999,-999];
  return positions.map(p=>{
    let lane=last.findIndex(x=>p-x>=minGap);
    if(lane<0)lane=last.indexOf(Math.min(...last));
    last[lane]=p;return lane;
  });
}
function v20MarkerEdge(p){return p<9?'edge-start':p>91?'edge-end':''}

/* v27：以實際文字寬度判斷是否重疊。非重疊標記全部維持同一高度。 */
function v27LayoutSpendMarkerLanes(){
  document.querySelectorAll('.spend-progress-shell').forEach(shell=>{
    const markers=[...shell.querySelectorAll('.spend-progress-marker')];
    if(!markers.length)return;
    const shellWidth=shell.clientWidth||1;
    const gap=6;
    const laneRight=[-Infinity,-Infinity,-Infinity];
    const ordered=markers.sort((a,b)=>parseFloat(a.style.getPropertyValue('--marker-pos'))-parseFloat(b.style.getPropertyValue('--marker-pos')));

    /* 每次重新量度前先清走上一輪避讓值，避免 resize 後累積偏移。 */
    ordered.forEach(marker=>{
      marker.style.setProperty('--route-shift','0px');
      marker.style.setProperty('--route-left','0px');
      marker.style.setProperty('--route-width','0px');
    });

    /* 第一步：仍然按「實際文字寬度」分 lane。 */
    ordered.forEach(marker=>{
      marker.classList.remove('lane-0','lane-1','lane-2');
      marker.classList.add('lane-0');
      const title=marker.querySelector('.spend-marker-title');
      const pos=Math.max(0,Math.min(100,parseFloat(marker.style.getPropertyValue('--marker-pos'))||0));
      const x=shellWidth*pos/100;
      const w=title?title.getBoundingClientRect().width:0;
      let left=x-w/2,right=x+w/2;
      if(marker.classList.contains('edge-start')){left=x;right=x+w}
      if(marker.classList.contains('edge-end')){left=x-w;right=x}
      let lane=laneRight.findIndex(last=>left>=last+gap);
      if(lane<0)lane=laneRight.indexOf(Math.min(...laneRight));
      marker.classList.remove('lane-0','lane-1','lane-2');
      marker.classList.add(`lane-${lane}`);
      laneRight[lane]=right;
    });

    /*
       第二步：高 lane 的垂直線若會穿過較低 lane 的文字，便把 connector
       橫向移到最近的空位。底部用一小段橫線由「真實門檻 x」接到新 x，
       所以用家仍清楚知道它對應進度條上的哪一點。
    */
    const placed=[];
    const laneOf=m=>m.classList.contains('lane-2')?2:(m.classList.contains('lane-1')?1:0);
    const titleBounds=(routeX,w,m)=>{
      if(m.classList.contains('edge-start'))return [routeX,routeX+w];
      if(m.classList.contains('edge-end'))return [routeX-w,routeX];
      return [routeX-w/2,routeX+w/2];
    };
    [...ordered].sort((a,b)=>laneOf(a)-laneOf(b)||parseFloat(a.style.getPropertyValue('--marker-pos'))-parseFloat(b.style.getPropertyValue('--marker-pos'))).forEach(marker=>{
      const lane=laneOf(marker);
      const title=marker.querySelector('.spend-marker-title');
      const pos=Math.max(0,Math.min(100,parseFloat(marker.style.getPropertyValue('--marker-pos'))||0));
      const x=shellWidth*pos/100;
      const w=title?title.getBoundingClientRect().width:0;
      const lower=placed.filter(p=>p.lane<lane);
      const same=placed.filter(p=>p.lane===lane);
      const routeClear=rx=>lower.every(p=>rx<p.left-gap||rx>p.right+gap);
      const labelClear=rx=>{
        const [l,r]=titleBounds(rx,w,marker);
        if(l<2||r>shellWidth-2)return false;
        return same.every(p=>r<p.left-gap||l>p.right+gap);
      };
      let routeX=x;
      if(lane>0 && (!routeClear(routeX)||!labelClear(routeX))){
        const prefer=(x>shellWidth*.72)?-1:(x<shellWidth*.28?1:(lane%2?1:-1));
        const maxShift=Math.min(110,Math.max(36,shellWidth*.24));
        let found=false;
        for(let d=8;d<=maxShift;d+=4){
          for(const sign of [prefer,-prefer]){
            const candidate=x+sign*d;
            if(candidate<2||candidate>shellWidth-2)continue;
            if(routeClear(candidate)&&labelClear(candidate)){
              routeX=candidate;found=true;break;
            }
          }
          if(found)break;
        }
      }
      const shift=Math.round((routeX-x)*10)/10;
      marker.style.setProperty('--route-shift',`${shift}px`);
      marker.style.setProperty('--route-left',`${Math.min(0,shift)}px`);
      marker.style.setProperty('--route-width',`${Math.abs(shift)}px`);
      const [left,right]=titleBounds(routeX,w,marker);
      placed.push({lane,left,right,routeX,marker});
    });
  });
}
let v27MarkerLayoutRAF=0;
function v27ScheduleMarkerLayout(){
  cancelAnimationFrame(v27MarkerLayoutRAF);
  v27MarkerLayoutRAF=requestAnimationFrame(()=>requestAnimationFrame(v27LayoutSpendMarkerLanes));
}
window.addEventListener('resize',v27ScheduleMarkerLayout,{passive:true});

function v20ProgressMarker({pos,lane=0,title='',amount='',kind='',reached=false}){
  return `<span class="spend-progress-marker lane-${lane} ${v20MarkerEdge(pos)} ${kind} ${reached?'reached':''}" style="--marker-pos:${pos}%"><span class="spend-marker-title">${title}</span>${amount?`<span class="spend-marker-amount">${amount}</span>`:''}</span>`;
}
function v20RenderStandardProgress(target,row){
  const req=Math.max(0,Number(target?.spendRequirement||0)),capSpend=Math.max(0,Number(capAmounts(target).spend||0));
  const unlimited=capSpend<=0;
  /* 無上限時把最低門檻放在約 82% 位置，留下明確的「仍可繼續」尾段。 */
  const base=req>0?req:Math.max(1,spendForOffer(target,offerBounds(target))||1);
  const scaleMax=capSpend>0?capSpend:base/.82;
  const spent=spendForOffer(target,offerBounds(target)),fill=scaleMax?pct(spent,scaleMax):Number(row.progress||0),percent=unlimited?'∞':`${Math.round(fill)}%`;
  const specs=[];
  if(req>0){
    const p=Math.max(0,Math.min(100,req/scaleMax*100));
    specs.push({pos:p,title:'最低簽賬',amount:money(req),kind:'minimum',reached:spent>=req});
  }
  const lanes=v20MarkerLanes(specs.map(x=>x.pos),26);
  const markers=specs.map((x,i)=>v20ProgressMarker({...x,lane:lanes[i]})).join('');
  if(!markers)return `<div class="goal-progress-row ${unlimited?'is-unlimited':''}"><div class="progress ${unlimited?'unlimited-progress':''}"><div style="--target-width:${fill}%"></div></div><div class="goal-percent ${unlimited?'goal-percent-infinite':''}">${percent}</div></div>`;
  return `<div class="spend-progress-row ${unlimited?'is-unlimited':''}"><div class="spend-progress-shell"><div class="progress ${unlimited?'unlimited-progress':''}"><div style="--target-width:${fill}%"></div></div>${markers}</div><div class="goal-percent ${unlimited?'goal-percent-infinite':''}">${percent}</div></div>`;
}
function v19RenderTierProgress(target,row){
  const tiers=[...(target?.tiers||[])].filter(x=>Number(x.threshold||0)>0).sort((a,b)=>Number(a.threshold||0)-Number(b.threshold||0));
  if(!tiers.length)return v20RenderStandardProgress(target,row);
  const highestThreshold=Math.max(1,...tiers.map(x=>Number(x.threshold||0)));
  const capSpend=Math.max(0,Number(capAmounts(target).spend||0));
  const unlimited=capSpend<=0;
  /* 無上限時最高門檻不是終點：放在 82%，右側保留無限延伸尾段。 */
  const scaleMax=capSpend>0?capSpend:highestThreshold/.82;
  const spent=spendForOffer(target,offerBounds(target)),fill=pct(spent,scaleMax),percent=unlimited?'∞':`${Math.round(fill)}%`;
  const specs=tiers.map((x,i)=>({
    pos:Math.max(0,Math.min(100,Number(x.threshold||0)/scaleMax*100)),
    title:v19TierMarkerReward(x),
    amount:money(x.threshold),kind:'tier',reached:spent>=Number(x.threshold||0)
  }));
  specs.sort((a,b)=>a.pos-b.pos);
  const lanes=v20MarkerLanes(specs.map(x=>x.pos),14);
  const markers=specs.map((x,i)=>v20ProgressMarker({...x,lane:lanes[i]})).join('');
  return `<div class="spend-progress-row tier-progress-row ${unlimited?'is-unlimited':''}"><div class="spend-progress-shell tier-progress-shell"><div class="progress ${unlimited?'unlimited-progress':''}"><div style="--target-width:${fill}%"></div></div>${markers}</div><div class="goal-percent ${unlimited?'goal-percent-infinite':''}">${percent}</div></div>`;
}
renderGoals=function(){
  updateGoalSortControls();const rows=getGoalRows();const goalSectionTitle=document.getElementById('goalSectionTitle');if(goalSectionTitle)goalSectionTitle.textContent=`進行中的回贈目標 ( ${rows.length} 個 )`;const box=document.getElementById('goals');if(!rows.length){box.innerHTML='<div class="empty">未設定任何目標</div>';return}
  box.innerHTML=rows.map((r,i)=>{const target=state.cards.find(x=>x.id===r.targetId),[barStart,barEnd,barGlow]=goalPaletteForTarget(target),themeSoft=goalThemeRgba(barStart,.09),themeFade=goalThemeRgba(barEnd,.04),themeSoftHover=goalThemeRgba(barStart,.12),themeFadeHover=goalThemeRgba(barEnd,.06),delay=Math.min(i*70,420);const progressHtml=r.mechanic==='stamp'?renderStampProgress(r.stampCurrent,r.stampTarget,r.stampMilestones):(r.mechanic==='tier_rate'?v19RenderTierProgress(target,r):(r.mechanic==='standard'?v20RenderStandardProgress(target,r):`<div class="goal-progress-row"><div class="progress"><div style="--target-width:${r.progress}%"></div></div><div class="goal-percent">${r.percent}</div></div>`));return `<div class="goal ${r.completed?'completed':''} ${r.goalClass||''}" data-target-id="${r.targetId}" style="--bar-start:${barStart};--bar-end:${barEnd};--bar-glow:${barGlow};--theme-soft:${themeSoft};--theme-fade:${themeFade};--theme-soft-hover:${themeSoftHover};--theme-fade-hover:${themeFadeHover};--bar-delay:${delay}ms"><div class="goal-body"><div class="goal-card">${esc(r.card)}</div><div class="goal-title">${r.title}${r.completed?'<span class="trophy" title="目標達成">🏆</span>':''}<span class="goal-days ${r.dayClass}">${esc(r.days)}</span></div><div class="goal-meta">${renderGoalMeta(r.metaLines||[r.meta])}</div>${r.stageOverview?renderStageOverview(r.stageOverview):''}<div class="goal-lower">${progressHtml}<div class="goal-status">${renderGoalStatus(r.status)}</div></div></div><button class="goal-modify" type="button" aria-label="修改" title="修改">✎</button></div>`}).join('');bindGoalActions();scheduleGoalHeightEqualize();v27ScheduleMarkerLayout();
};


render();
updatePageRoute();
startGoalCountdownClock();
