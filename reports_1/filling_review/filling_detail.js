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
 async function render(data,variant,index,ko,config){
  const $=id=>document.getElementById(id),T=(zh,kr)=>ko?kr:zh;
  const F=x=>finite(x)?x.toLocaleString(ko?'ko-KR':'zh-CN',{minimumFractionDigits:3,maximumFractionDigits:3}):'—';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const view=inspect(data,index,variant);
  const statuses={ok:T('完整有效对照','완전한 유효 비교'),incomplete:T('未来实际记录不足','향후 실제 기록 부족'),gap:T('跨生产断档，不计算误差','생산 중단 포함, 오차 미계산'),invalid:T('含异常/缺失原始值，不计算误差','이상/결측 원본값 포함, 오차 미계산')};
  $('point-prev').disabled=!view||index<=0;$('point-next').disabled=!view||index>=data.actual.length-1;
  if(!view){$('point-info').textContent=T('此订单没有称重记录','이 작업지시에는 계량 기록이 없습니다');$('point-status').textContent='';$('point-body').innerHTML='';$('quantile-body').innerHTML='';for(const id of ['future-chart','distribution-hist','distribution-cdf'])Plotly.purge(id);window.__fillingSelected=null;return;}
  $('point-info').textContent=T(`第${index+1}条填充记录为T · ${data.time[index]} · 当前实测 ${F(data.actual[index])}g。输入截至T的80件，输出为其后的第1～20件。`,`기록 ${index+1}번이 T · ${data.time[index]} · 현재 실제 ${F(data.actual[index])}g. T까지 80개를 입력하고 이후 1~20개를 예측합니다.`);
  $('point-status').dataset.state=view.hasForecast&&view.batchStatus==='ok'?'ready':'partial';
  $('point-status').textContent=(view.hasForecast?T('已有截至该点的原生模型预测。','이 시점까지의 실제 모델 예측이 있습니다.'):T('该点没有有效的80件预测输入或不在模型准入范围，预测保持空白。','이 시점은 유효한 80개 입력 또는 모델 적용 범위가 없어 예측을 비웁니다.'))+' '+T(`已观测后续${view.observed}/20件；`,`이후 ${view.observed}/20개 관측; `)+statuses[view.batchStatus];
  $('point-head').innerHTML='<tr>'+[T('预测任务','예측 과제'),T('在T作出的预测/g','T 시점 예측/g'),T('事后实际/g','사후 실제/g'),T('预测−实际/g','예측−실제/g'),T('实际对照状态','실제 비교 상태')].map(x=>'<th>'+x+'</th>').join('')+'</tr>';
  const labels={mean:T('未来20件平均重量','향후 20개 평균중량'),h10:T('未来第10件重量','향후 10번째 중량'),h20:T('未来第20件重量','향후 20번째 중량'),std:T('未来20件标准差','향후 20개 표준편차')};
  $('point-body').innerHTML=['mean','h10','h20','std'].map(k=>{const state=k==='h10'||k==='h20'?view.pointStatus[k]:view.batchStatus,p=view.forecast[k],a=view.actual[k],error=state==='ok'&&finite(p)&&finite(a)?p-a:null;return '<tr>'+[labels[k],F(p),F(a),F(error),statuses[state]].map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>';}).join('');
  const base=(title,xTitle,yTitle)=>({title:{text:title,font:{size:14},x:.03,y:.99,yanchor:'top'},paper_bgcolor:'white',plot_bgcolor:'white',font:{family:'Segoe UI,Microsoft YaHei,Malgun Gothic,sans-serif',size:12,color:'#425168'},margin:{l:65,r:20,t:85,b:50},legend:{orientation:'h',y:1.08,yanchor:'bottom',font:{size:10}},xaxis:{title:xTitle,gridcolor:'#edf1f7'},yaxis:{title:yTitle,gridcolor:'#edf1f7'},uirevision:data.info.key+'|'+index+'|'+variant});
  const p=view.forecast,q05=p.q05,q95=p.q95,traces=[];
  if(finite(q05)&&finite(q95)){
   traces.push({type:'scatter',mode:'lines',name:T('预测90%单件范围','예측 90% 개별중량 범위'),x:[1,20,20,1,1],y:[q05,q05,q95,q95,q05],fill:'toself',fillcolor:'rgba(230,140,48,.12)',line:{width:0},hoverinfo:'skip'});
  }
  traces.push({type:'scatter',mode:'markers+lines',name:T(`后续实测（${view.observed}/20）`,`이후 실제(${view.observed}/20)`),x:view.future.map((_,i)=>i+1),y:view.future,customdata:view.times,hovertemplate:T('未来第%{x}件<br>%{customdata}<br>实际 %{y:.3f}g<extra></extra>','향후 %{x}번째<br>%{customdata}<br>실제 %{y:.3f}g<extra></extra>'),marker:{size:7,color:view.valid.map(v=>v?'#2463d3':'#ce3d49')},line:{color:'#98b5df',width:1},connectgaps:false});
  traces.push({type:'scatter',mode:'markers',name:T('独立单件预测 h1/h10/h20','독립 개별 예측 h1/h10/h20'),x:[1,10,20],y:[p.h1,p.h10,p.h20],marker:{size:11,color:'#df7b29',symbol:'diamond'}});
  if(finite(p.mean))traces.push({type:'scatter',mode:'lines',name:T('预测20件均值（参考线）','예측 20개 평균(참고선)'),x:[1,20],y:[p.mean,p.mean],line:{color:'#df7b29',dash:'dash',width:1.5}});
  if(finite(view.actual.mean))traces.push({type:'scatter',mode:'lines',name:T('实际20件均值','실제 20개 평균'),x:[1,20],y:[view.actual.mean,view.actual.mean],line:{color:'#2463d3',dash:'dot',width:1.5}});
  const futureLayout=base(T('从当前填充点T向后看的20件','현재 계량점 T 이후 20개'),T('未来第几件','향후 제품 순서'),T('重量 (g)','중량(g)'));
  futureLayout.xaxis.range=[.5,20.5];futureLayout.xaxis.tickmode='array';futureLayout.xaxis.tickvals=[1,5,10,15,20];
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
 return {slot,inspect,choose,render,probabilities,quantile};
})();
