"use strict";
/* The selected raw filling is decision T, not the origin of the old plotted line. */
window.FillingDetail=(()=>{
 const probabilities=[.05,.10,.25,.50,.75,.90,.95],keys=['q05','q10','q25','q50','q75','q90','q95'];
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function quantile(values,q){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),p=(a.length-1)*q,l=Math.floor(p);return a[l]+(a[Math.min(l+1,a.length-1)]-a[l])*(p-l);}
 function slot(data,index){const indices=data.decisionIndices??[];let lo=0,hi=indices.length;while(lo<hi){const mid=(lo+hi)>>1;if(indices[mid]<index)lo=mid+1;else hi=mid;}return indices[lo]===index?lo:-1;}
 function inspect(data,index,variant){
  if(!Number.isInteger(index)||index<0||index>=data.actual.length)return null;
  const position=slot(data,index),heads=data.decisionModels?.[variant],forecast={};
  for(const name of ['mean','h1','h10','h20','std',...keys])forecast[name]=position>=0&&finite(heads?.[name]?.[position])?heads[name][position]:null;
  const future=data.actual.slice(index+1,index+21),valid=data.valid.slice(index+1,index+21),times=data.time.slice(index+1,index+21);
  const status=h=>{if(future.length<h)return 'incomplete';let previous=data.time[index];for(let j=0;j<h;j++){if(new Date(times[j])-new Date(previous)>300000)return 'gap';previous=times[j];}return 'ok';};
  let batchStatus=status(20);if(batchStatus==='ok'&&(!valid.every(Boolean)||!future.every(finite)))batchStatus='invalid';
  const mean=batchStatus==='ok'?future.reduce((a,b)=>a+b,0)/20:null;
  const std=finite(mean)?Math.sqrt(future.reduce((a,b)=>a+(b-mean)**2,0)/19):null;
  const actual={mean,std},pointStatus={};
  for(const h of [1,10,20]){actual['h'+h]=finite(future[h-1])?future[h-1]:null;pointStatus['h'+h]=status(h);if(pointStatus['h'+h]==='ok'&&(!valid[h-1]||!finite(actual['h'+h])))pointStatus['h'+h]='invalid';}
  for(let j=0;j<keys.length;j++)actual[keys[j]]=batchStatus==='ok'?quantile(future,probabilities[j]):null;
  return {index,slot:position,forecast,actual,batchStatus,pointStatus,future,valid,times,observed:future.length,finiteFuture:future.filter(finite),hasForecast:finite(forecast.mean)};
 }
 function choose(data){const indices=data.decisionIndices??[];for(const i of indices){const view=inspect(data,i,Object.keys(data.models)[0]);if(view?.batchStatus==='ok')return i;}return indices[0]??(data.actual.length?0:null);}
 // Both series are aligned to decision T; the actual batch excludes T itself.
 function meanSeries(data,variant){
  const actual=Array(data.actual.length).fill(null),forecast=Array(data.actual.length).fill(null),status=Array(data.actual.length).fill('incomplete');
  const times=data.time.map(t=>new Date(t).getTime());
  for(let i=0;i+20<data.actual.length;i++){
   let sum=0,invalid=false,gap=false;
   for(let j=i+1;j<=i+20;j++){gap=gap||times[j]-times[j-1]>300000;invalid=invalid||!data.valid[j]||!finite(data.actual[j]);sum+=finite(data.actual[j])?data.actual[j]:0;}
   status[i]=gap?'gap':invalid?'invalid':'ok';if(status[i]==='ok')actual[i]=sum/20;
  }
  const means=data.decisionModels?.[variant]?.mean??[];
  (data.decisionIndices??[]).forEach((index,slot)=>{if(finite(means[slot]))forecast[index]=means[slot];});
  return {actual,forecast,status};
 }
 function limits(info,ko){
  const shapes=[],annotations=[];
  for(const [value,color,label] of [[info.lcl,'#188268',ko?'하한 = 목표값':'下限 = 目标值'],[info.ucl,'#c44952',ko?'상한':'上限']]){
   if(!finite(value))continue;
   shapes.push({type:'line',xref:'x domain',yref:'y',x0:0,x1:1,y0:value,y1:value,line:{color,width:1.5,dash:'dash'}});
   annotations.push({xref:'x domain',yref:'y',x:1,y:value,text:`${label} ${value} g`,showarrow:false,xanchor:'right',yanchor:value===info.lcl?'top':'bottom',yshift:value===info.lcl?-3:3,font:{size:11,color},bgcolor:'rgba(255,255,255,.88)'});
  }
  return {shapes,annotations};
 }
 function contextWindow(data,index){
  const first=Math.max(0,index-60),last=Math.min(data.actual.length-1,index+40),x=[],y=[],detail=[],valid=[];
  for(let i=first;i<=last;i++){
   if(i>first&&new Date(data.time[i])-new Date(data.time[i-1])>300000){x.push(null);y.push(null);detail.push(null);valid.push(false);}
   x.push(data.time[i]);y.push(data.actual[i]);detail.push([i+1,i-index,data.sourceRows[i]]);valid.push(data.valid[i]);
  }
  return {first,last,x,y,detail,valid,range:[data.time[first],data.time[last]]};
 }
 function parameterWindow(parameter,start,end){
  const x=[],y=[],source=[];
  if(!parameter)return {x,y,source};
  let before=-1;
  for(let i=0;i<parameter.time.length;i++){if(parameter.time[i]<start)before=i;else break;}
  const add=(i,t,state)=>{x.push(t);y.push(parameter.value[i]);source.push([parameter.time[i],parameter.sourceRows[i],state]);};
  if(before>=0)add(before,start,'carry');
  for(let i=before+1;i<parameter.time.length&&parameter.time[i]<=end;i++)add(i,parameter.time[i],'raw');
  if(x.length&&x.at(-1)<end){x.push(end);y.push(y.at(-1));source.push([source.at(-1)[0],source.at(-1)[1],'extend']);}
  return {x,y,source};
 }
 async function render(data,variant,index,ko,config){
  const $=id=>document.getElementById(id),T=(zh,kr)=>ko?kr:zh;
  const F=x=>finite(x)?x.toLocaleString(ko?'ko-KR':'zh-CN',{minimumFractionDigits:3,maximumFractionDigits:3}):'—';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const view=inspect(data,index,variant);
  const statuses={ok:T('完整有效对照','완전한 유효 비교'),incomplete:T('未来实际记录不足','향후 실제 기록 부족'),gap:T('跨生产断档，不计算误差','생산 중단 포함, 오차 미계산'),invalid:T('含异常/缺失原始值，不计算误差','이상/결측 원본값 포함, 오차 미계산')};
  $('point-prev').disabled=!view||index<=0;$('point-next').disabled=!view||index>=data.actual.length-1;
  if(!view){$('point-info').textContent=T('此订单没有称重记录','이 작업지시에는 계량 기록이 없습니다');$('point-status').textContent='';$('point-body').innerHTML='';$('quantile-body').innerHTML='';for(const id of ['future-chart','distribution-hist','distribution-cdf'])Plotly.purge(id);window.__fillingSelected=null;return;}
  $('point-info').textContent=T(`第${index+1}条填充记录为T · ${data.time[index]} · 当前实测 ${F(data.actual[index])}g。输入截至T的80件，输出为其后的第1～20件。`,`기록 ${index+1}번이 T · ${data.time[index]} · 현재 실제 ${F(data.actual[index])}g. T까지 80개를 입력하고 이후 1~20개를 예측합니다.`);
  $('point-info').textContent+=T(` 图中显示此前${Math.min(60,index)}件、当前点及此后${Math.min(40,data.actual.length-1-index)}件实际重量，订单边界处按已有记录截取。`,` 그래프에는 이전 ${Math.min(60,index)}개·현재점·이후 ${Math.min(40,data.actual.length-1-index)}개 실제 중량을 표시하며 작업지시 경계에서 관측 기록까지만 표시합니다.`);
  $('point-status').dataset.state=view.hasForecast&&view.batchStatus==='ok'?'ready':'partial';
  $('point-status').textContent=(view.hasForecast?T('已有截至该点的原生模型预测。','이 시점까지의 실제 모델 예측이 있습니다.'):T('该点没有有效的80件预测输入或不在模型准入范围，预测保持空白。','이 시점은 유효한 80개 입력 또는 모델 적용 범위가 없어 예측을 비웁니다.'))+' '+T(`已观测后续${view.observed}/20件；`,`이후 ${view.observed}/20개 관측; `)+statuses[view.batchStatus];
  $('point-head').innerHTML='<tr>'+[T('预测任务','예측 과제'),T('在T作出的预测/g','T 시점 예측/g'),T('事后实际/g','사후 실제/g'),T('预测−实际/g','예측−실제/g'),T('实际对照状态','실제 비교 상태')].map(x=>'<th>'+x+'</th>').join('')+'</tr>';
  const labels={mean:T('未来20件平均重量','향후 20개 평균중량'),h1:T('未来第1件重量','향후 1번째 중량'),h10:T('未来第10件重量','향후 10번째 중량'),h20:T('未来第20件重量','향후 20번째 중량'),std:T('未来20件标准差','향후 20개 표준편차')};
  $('point-body').innerHTML=['mean','h1','h10','h20','std'].map(k=>{const state=k in view.pointStatus?view.pointStatus[k]:view.batchStatus,p=view.forecast[k],a=view.actual[k],error=state==='ok'&&finite(p)&&finite(a)?p-a:null;return '<tr>'+[labels[k],F(p),F(a),F(error),statuses[state]].map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>';}).join('');
  const base=(title,xTitle,yTitle)=>({title:{text:title,font:{size:14},x:.03,y:.99,yanchor:'top'},paper_bgcolor:'white',plot_bgcolor:'white',font:{family:'Segoe UI,Microsoft YaHei,Malgun Gothic,sans-serif',size:12,color:'#425168'},margin:{l:65,r:20,t:85,b:50},legend:{orientation:'h',y:1.08,yanchor:'bottom',font:{size:10}},xaxis:{title:xTitle,gridcolor:'#edf1f7'},yaxis:{title:yTitle,gridcolor:'#edf1f7'},uirevision:data.info.key+'|'+index+'|'+variant});
  const p=view.forecast,q05=p.q05,q95=p.q95,traces=[],context=contextWindow(data,index),t=data.time[index];
  const t1=data.time[index+1],t20=data.time[index+20];
  if(finite(q05)&&finite(q95)&&t1&&t20){
   traces.push({type:'scatter',mode:'lines',name:T('预测90%单件范围','예측 90% 개별중량 범위'),x:[t1,t20,t20,t1,t1],y:[q05,q05,q95,q95,q05],fill:'toself',fillcolor:'rgba(230,140,48,.12)',line:{width:0},hoverinfo:'skip'});
  }
  traces.push({type:'scatter',mode:'markers+lines',meta:{role:'context-weight'},name:T('实际重量 T−60～T+40','실제 중량 T−60~T+40'),x:context.x,y:context.y,customdata:context.detail,hovertemplate:T('记录 %{customdata[0]} · 相对T %{customdata[1]}件<br>%{x}<br>实际 %{y:.3f}g · 源行 %{customdata[2]}<extra></extra>','기록 %{customdata[0]} · T 기준 %{customdata[1]}개<br>%{x}<br>실제 %{y:.3f}g · 원본 행 %{customdata[2]}<extra></extra>'),marker:{size:5,color:context.valid.map(v=>v?'#2463d3':'#ce3d49')},line:{color:'#729bd3',width:1.5},connectgaps:false});
  [1,10,20].forEach((h,i)=>traces.push({type:'scatter',mode:'markers',uid:'detail-h'+h,name:T(`h${h} · 未来第${h}件预测`,`h${h} · 이후 ${h}번째 예측`),x:[data.time[index+h]??null],y:[p['h'+h]],marker:{size:11,color:['#e77924','#865ac5','#168579'][i],symbol:'diamond'}}));
  if(finite(p.mean)&&t1&&t20)traces.push({type:'scatter',mode:'lines',name:T('预测20件均值（参考线）','예측 20개 평균(참고선)'),x:[t1,t20],y:[p.mean,p.mean],line:{color:'#df7b29',dash:'dash',width:1.5}});
  if(finite(view.actual.mean))traces.push({type:'scatter',mode:'lines',name:T('实际20件均值','실제 20개 평균'),x:[t1,t20],y:[view.actual.mean,view.actual.mean],line:{color:'#2463d3',dash:'dot',width:1.5}});
  traces.push({type:'scatter',mode:'markers',name:T('当前称重点 T','현재 계량점 T'),x:[t],y:[data.actual[index]],marker:{size:11,color:'#188268',symbol:'circle-open',line:{width:2}}});
  const pump=data.parameters?.find(parameter=>parameter.key==='pump_sv'),pumpSeries=parameterWindow(pump,...context.range);
  const stateLabels={carry:T('起点状态延续','시작 상태 유지'),raw:T('原始记录','원본 기록'),extend:T('状态延续，非新记录','상태 유지, 새 기록 아님')};
  traces.push({type:'scatter',mode:'lines+markers',meta:{role:'context-pump'},name:'Pump INV · R10227:WU',x:pumpSeries.x,y:pumpSeries.y,customdata:pumpSeries.source.map(s=>[...s,stateLabels[s[2]]]),yaxis:'y2',showlegend:false,line:{color:'#7152ba',shape:'hv',width:1.8},marker:{size:4},connectgaps:false,hovertemplate:'Pump INV · R10227:WU<br>%{x}<br>%{y}<br>'+T('原记录 %{customdata[0]} · 源行 %{customdata[1]}','원본 %{customdata[0]} · 행 %{customdata[1]}')+'<br>%{customdata[3]}<extra></extra>'});
  const futureLayout=base(T('当前点 T：过去60件至未来40件','현재 T: 이전 60개~이후 40개'),T('实际时间（重量与 Pump INV 共用）','실제 시간(중량·Pump INV 공통)'),T('重量 (g)','중량(g)'));
  Object.assign(futureLayout.legend,{itemclick:'toggle',itemdoubleclick:'toggleothers',uirevision:'detail-visibility'});
  futureLayout.height=640;futureLayout.margin={l:90,r:45,t:115,b:55};
  futureLayout.xaxis={...futureLayout.xaxis,type:'date',range:context.range,anchor:'y2',tickformat:'%H:%M:%S<br>%m-%d',domain:[0,1]};
  futureLayout.yaxis.domain=[.40,1];futureLayout.yaxis2={domain:[0,.20],anchor:'x',title:'Pump INV',gridcolor:'#edf1f7',zeroline:false};
  const reference=limits(data.info,ko);futureLayout.shapes=[...reference.shapes,{type:'line',xref:'x',yref:'paper',x0:t,x1:t,y0:0,y1:1,line:{color:'#188268',width:1.5,dash:'dot'}}];
  futureLayout.annotations=[...reference.annotations,{xref:'paper',yref:'paper',x:0,y:.27,text:'Pump INV · R10227:WU',showarrow:false,xanchor:'left',font:{size:13,color:'#7152ba'}},{xref:'x',yref:'paper',x:t,y:1,text:'T',showarrow:false,yanchor:'bottom',font:{color:'#188268'}}];
  if(!pumpSeries.x.length)futureLayout.annotations.push({xref:'paper',yref:'paper',x:.5,y:.1,text:T('此时间范围没有可用 Pump INV 记录','이 시간 범위에 Pump INV 기록이 없습니다'),showarrow:false});
  await Plotly.react('future-chart',traces,futureLayout,config);
  const histLayout=base(T(`实际重量分布：已观测${view.observed}/20件`,`실제 중량분포: ${view.observed}/20개 관측`),T('重量 (g)','중량(g)'),T('原始观测比例','원본 관측 비율'));
  const extent=view.finiteFuture.concat(keys.map(k=>p[k]).filter(finite));if(extent.length){const lo=Math.min(...extent),hi=Math.max(...extent),pad=Math.max(.5,(hi-lo)*.1);histLayout.xaxis.range=[lo-pad,hi+pad];}
  if(finite(q05)&&finite(q95))histLayout.shapes=[{type:'rect',xref:'x',yref:'paper',x0:q05,x1:q95,y0:0,y1:1,fillcolor:'rgba(230,140,48,.12)',line:{width:0},layer:'below'},{type:'line',xref:'x',yref:'paper',x0:p.q50,x1:p.q50,y0:0,y1:1,line:{color:'#df7b29',dash:'dash'}}];
  await Plotly.react('distribution-hist',[{type:'histogram',name:T('已观测原始重量','관측된 원본 중량'),x:view.finiteFuture,histnorm:'probability',nbinsx:10,marker:{color:'#6696d4'},opacity:.8}],histLayout,config);
  const empirical=[...view.finiteFuture].sort((a,b)=>a-b),cdf=[];
  if(empirical.length)cdf.push({type:'scatter',mode:'lines+markers',name:T(`已观测${view.observed}/20件经验CDF`,`관측 ${view.observed}/20개 경험 CDF`),x:[empirical[0],...empirical],y:[0,...empirical.map((_,i)=>(i+1)/empirical.length)],line:{shape:'hv',color:'#2463d3'},marker:{size:4}});
  if(view.hasForecast)cdf.push({type:'scatter',mode:'lines+markers',name:T('预测条件CDF（七分位数）','예측 조건부 CDF(7개 분위수)'),x:keys.map(k=>p[k]),y:probabilities,line:{color:'#df7b29'},marker:{size:6}});
  const cdfLayout=base(T('预测分布与实际经验分布','예측분포와 실제 경험분포'),T('重量 (g)','중량(g)'),T('累计比例','누적 비율'));cdfLayout.yaxis.range=[0,1];
  await Plotly.react('distribution-cdf',cdf,cdfLayout,config);
  $('distribution-note').textContent=T('预测分布是未来20个位置混合的单件条件分布：q05～q95连接七个分位数，不合成20个有序预测，也不是均值置信区间。阴影为90%单件范围，不保证20件同时覆盖。实际直方图/CDF保留已观测的有限原始值（含异常）；完整20件不足、含无效值或跨断档时，不填造批次均值、标准差或经验分位数。','예측분포는 향후 20개 위치를 혼합한 개별중량 조건부분포입니다. q05~q95의 7개 분위수를 연결하며 20개 순서별 예측이나 평균 신뢰구간이 아닙니다. 음영은 개별중량 90% 범위이며 20개 동시 포함을 보장하지 않습니다. 실제 히스토그램/CDF는 이상값을 포함한 관측 원본 유한값을 보존합니다. 20개 미완료·무효값·생산 중단 시 배치 평균·표준편차·경험 분위수를 채우지 않습니다.');
  $('quantile-head').innerHTML='<tr><th>'+T('分位数对照','분위수 비교')+'</th>'+keys.map(k=>'<th>'+k+'</th>').join('')+'</tr>';
  $('quantile-body').innerHTML='<tr><td>'+T('预测单件条件分位数/g','예측 개별중량 조건부 분위수/g')+'</td>'+keys.map(k=>'<td>'+F(p[k])+'</td>').join('')+'</tr><tr><td>'+T('实际20件经验分位数/g','실제 20개 경험 분위수/g')+'</td>'+keys.map(k=>'<td>'+F(view.actual[k])+'</td>').join('')+'</tr>';
  window.__fillingSelected={order:data.info.key,index,model:variant,slot:view.slot,observed:view.observed,batchStatus:view.batchStatus,hasForecast:view.hasForecast};
  return view;
 }
 return {slot,inspect,choose,meanSeries,limits,contextWindow,parameterWindow,render,probabilities,quantile};
})();
