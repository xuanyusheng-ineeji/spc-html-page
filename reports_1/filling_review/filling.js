"use strict";
const M=JSON.parse(document.getElementById("filling-manifest").textContent),$=id=>document.getElementById(id);
const ko=document.documentElement.lang==="ko",T=(zh,kr)=>ko?kr:zh;
const L={item:["品目","품목"],order:["订单","작업지시"],model:["模型版本","모델 버전"],horizon:["显示内容","표시 항목"],weights:["逐件实际重量与预测重量","제품별 실제·예측 중량"],parameters:["订单全时段：四个实际设备参数","작업지시 전체 시간: 실제 설비 파라미터 4개"],records:["逐件记录","제품별 기록"],download:["下载当前订单CSV","현재 작업지시 CSV 다운로드"],overview:["品目与订单总览","품목·작업지시 전체 목록"],split:["数据归属","데이터 구분"],focus:["聚焦主体重量","주요 중량 범위 확대"],reset:["恢复完整订单","전체 작업지시 범위"],prev:["上一页","이전"],next:["下一页","다음"]};
Object.assign(L,{point:["点击填充点：查看未来20件","계량점 클릭: 향후 20개 확인"],pointPrev:["前一个填充点","이전 계량점"],pointNext:["后一个填充点","다음 계량점"],backWeight:["返回重量图","중량 그래프로 돌아가기"]});
document.querySelectorAll("[data-t]").forEach(el=>el.textContent=T(...L[el.dataset.t]));
const splitNames={train:T("训练 · 拟合内回看","학습 · 적합 내 조회"),valid:T("验证 · 最终拟合已使用","검증 · 최종 적합에 사용"),test:T("历史测试 · 未参与本轮拟合","과거 테스트 · 이번 적합에 미사용"),none:T("未进入数据集 · 仅实测","데이터셋 미포함 · 실제값만")};
const variantNames=ko?{per_task:"과제별 간소화 근접 최적",compact:"공통 간소화 구성",per_task_best:"과제별 검증 오차 최저",full:"전체 입력 우수 구성"}:M.variants;
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const finite=x=>typeof x==="number"&&Number.isFinite(x),F=(x,n=3)=>finite(x)?x.toLocaleString(ko?"ko-KR":"zh-CN",{maximumFractionDigits:n,minimumFractionDigits:n}):"—";
const q=new URLSearchParams(location.search),PLOT_CONFIG={responsive:true,displaylogo:false,toImageButtonOptions:{format:"png",scale:2}};
let current=null,currentSeries=null,page=0,version=0,range=null,syncing=false;
let selectedFill=null,queryPointConsumed=false;
let renderQueue=Promise.resolve();
window.FILLING_DATA=window.FILLING_DATA||{};
$("title").textContent=T("每次填充：实际重量与预测重量","제품별 충진: 실제 중량과 예측 중량");
document.title=$("title").textContent;
$("subtitle").textContent=T(`订单数最多的${M.items.length}个品目 · ${M.sourceOrderCount}个完整订单 · ${M.rawRows.toLocaleString()}条原始称重 · ${M.experiment}`,`작업지시 수 상위 ${M.items.length}개 품목 · 전체 작업지시 ${M.sourceOrderCount}건 · 원본 계량 ${M.rawRows.toLocaleString()}건 · ${M.experiment}`);
$("item").innerHTML='<option value="all">'+T("全部展示品目","표시 품목 전체")+'</option>'+M.items.map(item=>{const rank=M.topItems?.find(r=>r.item===item);return '<option value="'+item+'">'+esc(item+' · '+M.orders.find(o=>o.item===item).name+(rank?T(`（${rank.orderCount}单）`,`(${rank.orderCount}건)`):''))+'</option>';}).join("");
$("model").innerHTML=Object.keys(M.variants).map(v=>'<option value="'+v+'">'+variantNames[v]+'</option>').join("");
$("split").innerHTML='<option value="all">'+T("全部数据归属","전체 구분")+'</option>'+Object.keys(splitNames).map(k=>'<option value="'+k+'">'+splitNames[k]+'</option>').join("");
if(M.items.includes(q.get("item")))$("item").value=q.get("item");
if(Object.keys(M.variants).includes(q.get("model")))$("model").value=q.get("model");
if(["train","valid","test","none"].includes(q.get("split")))$("split").value=q.get("split");
const model=()=>$("model").value;
const decisionTime=(i,lead=1)=>current.time[i-lead];
const filtered=()=>M.orders.filter(o=>($("item").value==="all"||o.item===$("item").value)&&($("split").value==="all"||o.split===$("split").value));
function urlState(){const p=new URLSearchParams({item:$("item").value,split:$("split").value,order:$("order").value,model:model()});if(Number.isInteger(selectedFill))p.set('point',String(selectedFill+1));try{history.replaceState(null,"","?"+p);}catch(_){}$("language").href=(ko?"index.html":"index_ko.html")+"?"+p;$("language").textContent=ko?"中文":"한국어";}
function fillOrders(requested){const options=filtered(),old=requested??$("order").value;$("order").innerHTML=options.map(o=>'<option value="'+o.key+'">'+esc(o.order+' · '+o.item+' · '+o.start.slice(0,10))+'</option>').join("");if(options.some(o=>o.key===old))$("order").value=old;else if(options.length)$("order").value=(options.find(o=>o.split==="test")??options[0]).key;}
function metric(label,value,note){return '<div class="metric"><div class="label">'+label+'</div><div class="value">'+value+'</div><p>'+note+'</p></div>';}
function layout(extra={}){return Object.assign({paper_bgcolor:"white",plot_bgcolor:"white",font:{family:"Segoe UI,Microsoft YaHei,Malgun Gothic,sans-serif",size:12,color:"#425168"},margin:{l:75,r:30,t:50,b:45},hovermode:"closest",legend:{orientation:"h",y:1.13},xaxis:{type:"date",range:range,gridcolor:"#edf1f7",tickformat:"%H:%M<br>%m-%d"},yaxis:{gridcolor:"#edf1f7",zeroline:false},uirevision:current?.info.key},extra);}
function ensureData(info){if(window.FILLING_DATA[info.key])return Promise.resolve(window.FILLING_DATA[info.key]);return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=info.dataFile;s.onload=()=>{s.remove();if(!window.FILLING_DATA[info.key])reject(new Error("Order payload missing"));else resolve(window.FILLING_DATA[info.key]);};s.onerror=()=>{s.remove();reject(new Error(T("无法读取订单数据文件：","작업지시 데이터 파일을 읽을 수 없습니다: ")+info.dataFile));};document.head.appendChild(s);});}
function seriesArrays(data,series,lead=1){const x=[],actual=[],forecast=[],detail=[];data.time.forEach((time,i)=>{if(i&&new Date(time)-new Date(data.time[i-1])>300000){x.push(null);actual.push(null);forecast.push(null);detail.push(null);}x.push(time);actual.push(series.actual[i]);forecast.push(series.forecast[i]);detail.push([i+1,data.sourceRows[i],data.valid[i]?T("有效称重","유효 계량"):T("异常/无效原始值","이상/무효 원본값"),decisionTime(i,lead)??"—"]);});return {x,actual,forecast,detail};}
function weightTraces(){
 const actual=seriesArrays(current,{actual:current.actual,forecast:[]}),mean=seriesArrays(current,currentSeries,0);
 const traces=[{type:'scattergl',uid:'actual',mode:'markers',name:T('实际单件重量','실제 개별 중량'),x:actual.x,y:actual.actual,customdata:actual.detail,marker:{color:'#2463d3',size:4,opacity:.65},hovertemplate:T('记录 %{customdata[0]} · 源行 %{customdata[1]}<br>%{x}<br>实际 %{y:.3f}g<extra></extra>','기록 %{customdata[0]} · 원본 행 %{customdata[1]}<br>%{x}<br>실제 %{y:.3f}g<extra></extra>')}];
 [1,10,20].forEach((h,i)=>{const a=seriesArrays(current,{actual:current.actual,forecast:current.models[model()]['h'+h]},h);traces.push({type:'scattergl',uid:'h'+h,meta:{horizon:h},mode:'lines',name:T(`h${h} · 提前${h}件预测`,`h${h} · ${h}개 전 예측`),x:a.x,y:a.forecast,customdata:a.detail,line:{color:['#e77924','#865ac5','#168579'][i],width:1.7},connectgaps:false,hovertemplate:T('目标记录 %{customdata[0]}<br>%{x}<br>预测 %{y:.3f}g<br>决策时刻 %{customdata[3]}<extra></extra>','대상 기록 %{customdata[0]}<br>%{x}<br>예측 %{y:.3f}g<br>예측 결정 %{customdata[3]}<extra></extra>')});});
 traces.push({type:'scattergl',uid:'mean-actual',meta:{task:'mean'},mode:'lines',name:T('未来20件实际平均重量','향후 20개 실제 평균중량'),x:mean.x,y:mean.actual,customdata:mean.detail,line:{color:'#16417a',width:2.5,dash:'dot'},connectgaps:false,hovertemplate:T('决策记录 T=%{customdata[0]}<br>%{x}<br>T+1～T+20 实际均值 %{y:.3f}g<extra></extra>','결정 기록 T=%{customdata[0]}<br>%{x}<br>T+1~T+20 실제 평균 %{y:.3f}g<extra></extra>')});
 traces.push({type:'scattergl',uid:'mean-forecast',meta:{task:'mean'},mode:'lines',name:T('未来20件预测平均重量','향후 20개 예측 평균중량'),x:mean.x,y:mean.forecast,customdata:mean.detail,line:{color:'#cf3d88',width:2.5,dash:'dash'},connectgaps:false,hovertemplate:T('决策记录 T=%{customdata[0]}<br>%{x}<br>T+1～T+20 预测均值 %{y:.3f}g<br>决策时刻 %{customdata[3]}<extra></extra>','결정 기록 T=%{customdata[0]}<br>%{x}<br>T+1~T+20 예측 평균 %{y:.3f}g<br>예측 결정 %{customdata[3]}<extra></extra>')});
 const abnormal=current.actual.map((_,i)=>i).filter(i=>!current.valid[i]&&finite(current.actual[i]));
 traces.push({type:'scattergl',uid:'abnormal',mode:'markers',name:T('异常原始读数（保留）','이상 원본값(보존)'),x:abnormal.map(i=>current.time[i]),y:abnormal.map(i=>current.actual[i]),customdata:abnormal.map(i=>[i+1,current.sourceRows[i]]),marker:{color:'#ce3d49',size:6,symbol:'x'}});
 traces.forEach(trace=>trace.meta={...trace.meta,role:'weight'});return traces;
}
async function drawWeight(){
 const traces=weightTraces();
 const mainLayout=layout({height:480,margin:{l:100,r:100,t:100,b:55},xaxis:{type:'date',range,domain:[.09,.91],anchor:'y',gridcolor:'#edf1f7',tickformat:'%H:%M<br>%m-%d'},yaxis:{domain:[0,1],title:T("单件重量 (g)","개별 중량(g)"),gridcolor:"#edf1f7",zeroline:false}});
 mainLayout.legend={orientation:'h',x:.09,y:1.03,yanchor:'bottom',itemclick:'toggle',itemdoubleclick:'toggleothers',uirevision:'weight-combined'};
 const reference=FillingDetail.limits(current.info,ko);mainLayout.shapes=reference.shapes;mainLayout.annotations=reference.annotations;
 if(Number.isInteger(selectedFill))mainLayout.shapes.push({type:'line',xref:'x',yref:'paper',x0:current.time[selectedFill],x1:current.time[selectedFill],y0:0,y1:1,line:{color:'#188268',width:1.5,dash:'dot'}});
 await Plotly.react("weight-chart",traces,mainLayout,PLOT_CONFIG);
 bindZoom($("weight-chart"));bindPoint($("weight-chart"));
}
function bindPoint(el){if(el.__fillingPointBound)return;el.__fillingPointBound=true;el.on('plotly_click',event=>{for(const point of event.points??[]){const record=point.customdata??point.data?.customdata?.[point.pointIndex];if(Array.isArray(record)&&Number.isInteger(Number(record[0])))return selectPoint(Number(record[0])-1,true);}});}
function selectPoint(index,scroll=false){if(!current||!Number.isInteger(index)||index<0||index>=current.actual.length)return Promise.resolve();selectedFill=index;const key=current.info.key;const result=render();if(scroll)result.then(()=>{if(current?.info.key===key)$('point-review').scrollIntoView({behavior:'smooth',block:'start'});});return result;}
async function drawParameters(){const colors=["#7152ba","#168579","#d18b24","#5277b7"],positions=[.09,.09,.91,.91],shifts=[-90,0,0,90],traces=[];
 const l=layout({height:360,margin:{l:100,r:100,t:65,b:55},legend:{orientation:'h',x:.09,y:1.10,yanchor:'bottom',font:{size:11}},xaxis:{type:'date',range,domain:[.09,.91],anchor:'y',gridcolor:'#edf1f7',tickformat:'%H:%M<br>%m-%d'}});
 if(Number.isInteger(selectedFill))l.shapes=[{type:'line',xref:'x',yref:'paper',x0:current.time[selectedFill],x1:current.time[selectedFill],y0:0,y1:1,line:{color:'#188268',width:1.5,dash:'dot'}}];
 current.parameters.forEach((p,i)=>{const suffix=i?String(i+1):'',e=FillingDetail.parameterWindow(p,current.info.start,current.info.end),label=ko?p.labelKo:p.label;
 const states={carry:T('起点状态延续','시작 상태 유지'),raw:T('原始记录','원본 기록'),extend:T('状态延续，非新记录','상태 유지, 새 기록 아님')};
 traces.push({type:"scatter",mode:"lines+markers",meta:{role:'parameter',key:p.key},name:label,x:e.x,y:e.y,customdata:e.source.map(s=>[s[0],s[1],states[s[2]]]),xaxis:'x',yaxis:'y'+suffix,line:{color:colors[i],shape:"hv",width:1.5},marker:{size:3,color:colors[i]},connectgaps:false,hovertemplate:p.tag+"<br>%{x}<br>%{y}<br>"+T("原记录 %{customdata[0]} · 源行 %{customdata[1]}<br>%{customdata[2]}<extra></extra>","원본 %{customdata[0]} · 행 %{customdata[1]}<br>%{customdata[2]}<extra></extra>")});
 l['yaxis'+suffix]={domain:[0,1],anchor:'free',position:positions[i],shift:shifts[i],side:i<2?'left':'right',...(i?{overlaying:'y'}:{}),title:{text:label+'<br>'+p.tag,font:{size:10,color:colors[i]},standoff:6},tickfont:{color:colors[i],size:10},linecolor:colors[i],showline:true,ticks:'outside',showgrid:i===0,gridcolor:'#edf1f7',zeroline:false};
 });
 await Plotly.react('parameter-chart',traces,l,PLOT_CONFIG);bindZoom($('parameter-chart'));
 $("parameter-summary").textContent=current.parameters.map(p=>(ko?p.labelKo:p.label)+": "+p.periodRecords+T("条订单内原始记录","건 주문 내 원본 기록")+(p.carryInRecords?T("，含更早的起点状态"," · 이전 시작 상태 포함"):T("，无更早起点状态"," · 이전 시작 상태 없음"))).join(" · ");
}
function bindZoom(el){if(el.__fillingBound)return;el.__fillingBound=true;el.on("plotly_relayout",event=>{if(syncing||!current)return;let r=null;for(const key of Object.keys(event)){const match=key.match(/^xaxis\d*\.range\[0\]$/);if(match){const prefix=key.slice(0,-3);r=[event[key],event[prefix+"[1]"]];break;}if(/^xaxis\d*\.range$/.test(key)&&Array.isArray(event[key]))r=event[key];if(/^xaxis\d*\.autorange$/.test(key)&&event[key])r=[current.info.start,current.info.end];}if(r&&r[0]&&r[1])synchronize(r);});}
async function synchronize(r){if(syncing)return;syncing=true;range=r;try{await Promise.all(['weight-chart','parameter-chart'].map(id=>Plotly.relayout(id,{'xaxis.range':r})));}finally{syncing=false;}}
function allMetrics(info){return metric(T('完整订单原始称重','전체 작업지시 원본 계량'),info.rows.toLocaleString(),T('所有预测同时显示，点击图例可切换','모든 예측 동시 표시 · 범례 클릭으로 표시 전환'))+['h1','h10','h20','mean'].map(task=>{const s=info.scores[model()][task]??{pairs:0,mae:null,bias:null};return metric((task==='mean'?T('未来20件均值','향후 20개 평균'):task)+' MAE',F(s.mae)+' g',T(`有效配对 ${s.pairs.toLocaleString()} · 偏差 ${F(s.bias)}g`,`유효 대응 ${s.pairs.toLocaleString()} · 편향 ${F(s.bias)}g`));}).join('');}
function allTableRows(){const start=page*50,end=Math.min(current.actual.length,start+50),heads=current.models[model()];
 const labels=[T('记录序号','기록 번호'),T('称重／决策时刻 T','계량/예측 결정 시각 T'),T('实际/g','실제/g'),...[1,10,20].map(h=>'h'+h+T(' 预测/g',' 예측/g')),...[1,10,20].map(h=>'h'+h+T(' 误差/g',' 오차/g')),T('未来20件实际均值/g','향후 20개 실제 평균/g'),T('未来20件预测均值/g','향후 20개 예측 평균/g'),T('均值误差/g','평균 오차/g')];
 $('record-head').innerHTML='<tr>'+labels.map(v=>'<th>'+v+'</th>').join('')+'</tr>';
 let html='';for(let i=start;i<end;i++){const actual=current.actual[i],pred=[1,10,20].map(h=>heads['h'+h][i]),ma=currentSeries.actual[i],mp=currentSeries.forecast[i];html+='<tr class="'+(!current.valid[i]?'abnormal':'')+'">'+[i+1,current.time[i],F(actual),...pred.map(v=>F(v)),...pred.map(v=>finite(v)&&finite(actual)?F(v-actual):'—'),F(ma),F(mp),finite(ma)&&finite(mp)?F(mp-ma):'—'].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>';}
 $('record-body').innerHTML=html;$('page-note').textContent=current.actual.length?`${start+1}–${end} / ${current.actual.length.toLocaleString()}`:T('没有称重记录','계량 기록 없음');$('prev').disabled=page===0;$('next').disabled=end>=current.actual.length;
}
function allOverview(){const tasks=['h1','h10','h20','mean'],taskLabel=t=>t==='mean'?T('20件均值','20개 평균'):t,labels=[T('品目','품목'),T('订单','작업지시'),T('订单开始 → 结束','작업지시 시작 → 종료'),T('数据归属','데이터 구분'),T('原始称重数','원본 계량 수'),...tasks.flatMap(t=>[taskLabel(t)+T(' 配对数',' 대응 수'),taskLabel(t)+' MAE/g'])];
 $('overview-head').innerHTML='<tr>'+labels.map(v=>'<th>'+v+'</th>').join('')+'</tr>';
 $('overview-body').innerHTML=filtered().map(o=>'<tr data-order="'+o.key+'" class="'+(o.key===$('order').value?'selected':'')+'"><td>'+esc(o.item+' · '+o.name)+'</td><td><button class="link" data-key="'+o.key+'">'+esc(o.order)+'</button></td>'+[o.start+' → '+o.end,splitNames[o.split],o.rows.toLocaleString(),...tasks.flatMap(task=>{const s=o.scores[model()][task]??{pairs:0,mae:null};return [s.pairs.toLocaleString(),F(s.mae)];})].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('');
 $('overview-body').querySelectorAll('button[data-key]').forEach(b=>b.onclick=()=>{$('order').value=b.dataset.key;render();window.scrollTo({top:0,behavior:'smooth'});});
}
function downloadAll(){const heads=current.models[model()],rows=[['order','detail','item','split','source_row','fill_index','actual_fill_time','actual_weight_g','valid_actual','model',...[1,10,20].flatMap(h=>['predicted_h'+h+'_g','error_h'+h+'_g','decision_time_h'+h]),'actual_next20_mean_g','predicted_next20_mean_g','next20_mean_error_g','decision_time_mean','next20_status']];
 current.time.forEach((t,i)=>{const a=currentSeries.actual[i],p=currentSeries.forecast[i];rows.push([current.info.order,current.info.detail,current.info.item,current.info.split,current.sourceRows[i],i+1,t,current.actual[i],current.valid[i],model(),...[1,10,20].flatMap(h=>{const pred=heads['h'+h][i];return [pred,finite(pred)&&finite(current.actual[i])?pred-current.actual[i]:null,finite(pred)?decisionTime(i,h):null];}),a,p,finite(a)&&finite(p)?p-a:null,finite(p)?t:null,currentSeries.status[i]]);});
 const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"',blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=current.info.order+'_'+model()+'_h1_h10_h20_mean20.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function tableRows(){if(current)allTableRows();}
function overview(){allOverview();}
function render(){const stamp=++version;window.__fillingReady=false;renderQueue=renderQueue.catch(()=>{}).then(()=>renderCurrent(stamp));return renderQueue;}
async function renderCurrent(stamp){if(stamp!==version)return;window.__fillingReady=false;window.__fillingError=null;urlState();overview();const info=M.orders.find(o=>o.key===$("order").value);if(!info){current=null;selectedFill=null;$("status").textContent=T("当前筛选没有订单","현재 필터에 작업지시가 없습니다");$("metrics").innerHTML="";$("order-info").textContent="";$("record-body").innerHTML="";$('point-info').textContent='';$('point-status').textContent='';$('point-body').innerHTML='';$('quantile-body').innerHTML='';for(const id of ["weight-chart","parameter-chart","future-chart","distribution-hist","distribution-cdf"]){Plotly.purge(id);$(id).__fillingBound=false;$(id).__fillingPointBound=false;}document.body.classList.remove('loading');window.__fillingReady=true;return;}
 $("status").textContent=T("正在载入并绘图…","데이터 로드·그래프 작성 중…");document.body.classList.add("loading");
 try{const data=await ensureData(info);if(stamp!==version)return;const changed=!current||current.info.key!==data.info.key;current=data;if(changed){page=0;range=[info.start,info.end];const requested=Number(q.get('point'))-1;selectedFill=!queryPointConsumed&&q.has('point')&&Number.isInteger(requested)&&requested>=0&&requested<data.actual.length?requested:FillingDetail.choose(data);queryPointConsumed=true;}
 currentSeries=FillingDetail.meanSeries(current,model());$("order-info").innerHTML='<strong>'+esc(info.item+' · '+info.name+' / '+info.order)+'</strong><span class="badge '+info.split+'">'+splitNames[info.split]+'</span><span>'+esc(info.start+' → '+info.end)+'</span>';
 $("metrics").innerHTML=allMetrics(info);
 $("weight-note").textContent=T("全部同时显示，点击图例隐藏／恢复，双击单独查看。h1/h10/h20 对齐被预测产品，分别提前1/10/20件作出；两条均值曲线对齐当前时点T，比较T+1～T+20的实际均值与截至T的直接模型预测。未来不足20件、无效或跨中断时，实际均值留空，已有预测保留。","모두 동시에 표시합니다. 범례 클릭으로 숨기기/표시, 더블클릭으로 단독 표시합니다. h1/h10/h20은 대상 제품에 정렬된 1/10/20개 전 예측입니다. 두 평균 곡선은 현재 T에 정렬하여 T+1~T+20 실제 평균과 T까지의 직접 모델 예측을 비교합니다. 20개 미완료·무효·중단 시 실제 평균은 비우고 기존 예측은 유지합니다.");
 $("parameter-note").textContent=T("四参数叠加展示，各用独立Y轴，与上方重量共用X轴。目标值 = 下限值。保留完整订单原始OPC记录（含零值）；起点取更早状态，终点延续不是新增事件。","4개 파라미터를 각 Y축으로 겹쳐 표시하며 위 중량과 X축을 공유합니다. 목표값 = 하한값입니다. 작업지시 전체 원본 OPC 기록(0 포함)을 보존하며 이전 시작 상태·종료 연장은 새 이벤트가 아닙니다.");
 await drawWeight();if(stamp!==version)return;await drawParameters();if(stamp!==version)return;await FillingDetail.render(current,model(),selectedFill,ko,PLOT_CONFIG);if(stamp!==version)return;tableRows();overview();urlState();
 const keys=Object.keys(window.FILLING_DATA).filter(key=>key!==info.key);while(Object.keys(window.FILLING_DATA).length>3)delete window.FILLING_DATA[keys.shift()];
 $("status").textContent="";window.__fillingReady=true;
 }catch(error){window.__fillingError=String(error);$("status").textContent=String(error);console.error(error);}finally{if(stamp===version)document.body.classList.remove("loading");}}
$("method").textContent=T("仅展示原始订单数最多的前三品目，排名按唯一订单/明细计数，不按填充次数或预测窗口数。训练及验证订单都参与了最终拟合，不是新增独立测试。点击点是新的决策T，未来实际只用于事后展示。预测只读取截至T的80件和严格更早的设备状态；不足、异常和断档不补造有效对照。四参数仍覆盖完整订单时间，时间沿用原始记录。","원본 작업지시 수 상위 3개 품목만 표시합니다. 순위는 고유 작업지시/상세 건수 기준이며 계량·윈도우 수 기준이 아닙니다. 학습·검증 작업지시는 최종 적합에 사용되어 새 독립 테스트가 아닙니다. 클릭 지점이 새 결정시각 T이며 향후 실제값은 사후 표시에만 사용합니다. 예측은 T까지 80개와 엄격히 이전 설비 상태만 사용하며 부족·이상·중단 시 유효 비교를 만들지 않습니다. 4개 파라미터는 전체 작업지시 시간, 시각은 원본 기준입니다.");
$("item").onchange=()=>{fillOrders();render();};$("split").onchange=()=>{fillOrders();render();};$("order").onchange=render;$("model").onchange=render;
$("prev").onclick=()=>{page=Math.max(0,page-1);tableRows();};$("next").onclick=()=>{page++;tableRows();};
$('point-prev').onclick=()=>Number.isInteger(selectedFill)&&selectPoint(selectedFill-1);$('point-next').onclick=()=>Number.isInteger(selectedFill)&&selectPoint(selectedFill+1);$('back-to-weight').onclick=()=>$('weight-chart').scrollIntoView({behavior:'smooth',block:'center'});
$("reset-parameters").onclick=()=>current&&synchronize([current.info.start,current.info.end]);
$("reset").onclick=async()=>{if(!current)return;await synchronize([current.info.start,current.info.end]);await Plotly.relayout("weight-chart",{"yaxis.autorange":true});};
$("focus").onclick=()=>{if(!current)return;const values=current.actual.filter((v,i)=>finite(v)&&current.valid[i]).concat([1,10,20].flatMap(h=>current.models[model()]["h"+h]).filter(finite),currentSeries.actual.filter(finite),currentSeries.forecast.filter(finite)).sort((a,b)=>a-b);if(!values.length)return;const lo=Math.min(values[Math.floor((values.length-1)*.01)],finite(current.info.lcl)?current.info.lcl:Infinity),hi=Math.max(values[Math.ceil((values.length-1)*.99)],finite(current.info.ucl)?current.info.ucl:-Infinity),pad=Math.max(1,(hi-lo)*.12);Plotly.relayout("weight-chart",{"yaxis.range":[lo-pad,hi+pad]});};
$("download").onclick=()=>{if(current)downloadAll();};
fillOrders(q.get("order")??M.defaultOrder);render();
