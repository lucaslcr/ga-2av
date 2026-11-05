/* Sincronização do progresso: usuário + PIN, guardado no D1 via /api */
(function(){
var AKEY='ga2av-auth';
var UI=['tab','mod','theme','tmode','tgrp','tfil','qtab','open'];
var IC={
 cloud:'<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
 user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
 out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
 x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};
function svg(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[k]+'</svg>';}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function getA(){try{return JSON.parse(localStorage.getItem(AKEY)||'null');}catch(e){return null;}}
function setA(a){try{if(a)localStorage.setItem(AKEY,JSON.stringify(a));else localStorage.removeItem(AKEY);}catch(e){}}
var A=getA(),status=A?'wait':'none',timer=null,busy=false,lastSent=null;

function payload(S){var o={};for(var k in S){if(UI.indexOf(k)<0)o[k]=S[k];}return o;}
function hasProgress(o){if(!o)return false;var n=0;['done','train','cards'].forEach(function(k){if(o[k])n+=Object.keys(o[k]).length;});return n>0||!!o.diag||!!o.simBest||!!o.quizBest;}
function isObj(x){return x&&typeof x==='object'&&!Array.isArray(x);}
function merge(srv,loc){
  var out={},k;for(k in loc)out[k]=loc[k];
  for(k in srv){if(UI.indexOf(k)>=0)continue;var a=srv[k],b=loc[k];
    if(b===undefined)out[k]=a;
    else if(isObj(a)&&isObj(b)){var o={},kk;for(kk in a)o[kk]=a[kk];for(kk in b){o[kk]=(typeof a[kk]==='number'&&typeof b[kk]==='number')?Math.max(a[kk],b[kk]):b[kk];}out[k]=o;}
    else if(typeof a==='number'&&typeof b==='number')out[k]=Math.max(a,b);}
  return out;
}
function withUI(data,S){var o={},k;for(k in data)o[k]=data[k];UI.forEach(function(u){if(S[u]!==undefined)o[u]=S[u];});return o;}

function api(path,opt){
  opt=opt||{};var h={'content-type':'application/json'};if(A&&A.token)h.authorization='Bearer '+A.token;
  return fetch('/api/'+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined,keepalive:!!opt.keepalive})
    .then(function(r){return r.json().catch(function(){return {};}).then(function(j){j._status=r.status;return j;});});
}
function setStatus(s){status=s;paint();}
function expired(){setA(null);A=null;status='none';paint();if(window.GA)GA.toast('Sua sessão expirou. Entre de novo para sincronizar.','bad','alert');}

function push(keep){
  if(!A||busy||!window.GA)return;
  var data=payload(GA.S());var str=JSON.stringify(data);
  if(!A.pending&&str===lastSent)return setStatus('ok');
  busy=true;setStatus('wait');data._ts=Date.now();
  api('progress',{method:'PUT',body:{data:data},keepalive:keep}).then(function(j){busy=false;
    if(j._status===401)return expired();
    if(j.ok){lastSent=str;A.pending=false;A.ts=j.ts;setA(A);setStatus('ok');}else{setStatus('off');}
  }).catch(function(){busy=false;setStatus('off');});
}
function dirty(){
  if(!A||!window.GA)return;
  var str=JSON.stringify(payload(GA.S()));if(str===lastSent&&!A.pending)return;
  A.pending=true;setA(A);if(status!=='wait')setStatus('wait');
  clearTimeout(timer);timer=setTimeout(function(){push(false);},2500);
}
function pull(){
  if(!A||!window.GA)return;setStatus('wait');
  api('progress').then(function(j){
    if(j._status===401)return expired();
    if(j._status!==200)return setStatus('off');
    if(j.name&&j.name!==A.name){A.name=j.name;setA(A);}
    var S=GA.S(),loc=payload(S);
    if(j.data&&j.ts>(A.ts||0)){
      var next=A.pending?merge(j.data,loc):j.data;
      A.ts=j.ts;setA(A);GA.setS(withUI(next,S));
      lastSent=A.pending?null:JSON.stringify(payload(GA.S()));
      if(A.pending)push(false);else setStatus('ok');
    }else{lastSent=A.pending?null:JSON.stringify(loc);if(A.pending||!j.data)push(false);else setStatus('ok');}
  }).catch(function(){setStatus('off');});
}
function afterAuth(j,mode){
  A={token:j.token,user:j.username,name:j.name,ts:0,pending:false};
  var S=GA.S(),loc=payload(S);
  if(mode==='login'){
    var next;
    if(j.data&&hasProgress(loc))next=merge(j.data,loc);
    else if(j.data)next=j.data;
    else next=loc;
    A.ts=j.ts||0;A.pending=true;setA(A);GA.setS(withUI(next,S));lastSent=null;push(false);
  }else{A.pending=false;A.ts=j.ts||0;setA(A);lastSent=JSON.stringify(loc);setStatus('ok');GA.render();}
}

/* ---------- interface ---------- */
function first(n){return String(n||'').trim().split(/\s+/)[0]||'';}
function initial(n){return (first(n)[0]||'?').toUpperCase();}
function label(){
  if(!A)return 'Progresso salvo neste navegador';
  return {ok:'Salvo na sua conta',wait:'Salvando na sua conta…',off:'Sem conexão, salvo neste aparelho'}[status]||'Salvo na sua conta';
}
function paint(){
  var side=document.getElementById('acct'),top=document.getElementById('acct2');
  if(side){
    if(!A){side.innerHTML='<button class="abtn" type="button">'+svg('cloud')+'<span>Salvar em qualquer aparelho</span></button>';side.firstChild.onclick=function(){openM('new');};}
    else{side.innerHTML='<div class="who"><span class="av">'+esc(initial(A.name))+'</span><div><b>'+esc(A.name)+'</b><span><i class="sdot '+(status==='ok'?'':status)+'"></i>@'+esc(A.user)+'</span></div><button class="out" type="button" data-tip="Sair" aria-label="Sair">'+svg('out')+'</button></div>';
      side.querySelector('.out').onclick=logout;}
  }
  if(top){
    top.innerHTML=A?'<span class="av">'+esc(initial(A.name))+'</span>':svg('user');
    top.setAttribute('aria-label',A?'Conta de '+A.name:'Entrar ou criar conta');
    top.onclick=function(){if(A)openWho();else openM('new');};
  }
  var sp=document.querySelector('#sprog span');if(sp)sp.textContent=label();
}
function after(pg){
  paint();
  if(A&&window.GA&&GA.S().tab==='mapa'){var e=pg.querySelector('.phead .eyebrow');if(e)e.textContent='Olá, '+first(A.name);}
}
function logout(){
  if(!A)return;var a=A;
  api('logout',{method:'POST'}).catch(function(){});
  setA(null);A=null;status='none';lastSent=null;closeM();paint();GA.render();
  GA.toast('Você saiu. O progresso continua salvo na conta @'+a.user+'.','', 'ok');
}
var M=null;
function closeM(){if(M){M.remove();M=null;document.removeEventListener('keydown',escK);}}
function escK(e){if(e.key==='Escape')closeM();}
function shell(inner){
  closeM();M=document.createElement('div');M.className='mback';
  M.innerHTML='<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mt"><button class="mx" type="button" aria-label="Fechar">'+svg('x')+'</button>'+inner+'</div>';
  M.addEventListener('click',function(e){if(e.target===M)closeM();});
  M.querySelector('.mx').onclick=closeM;document.addEventListener('keydown',escK);
  document.body.appendChild(M);return M.querySelector('.mbox');
}
function openWho(){
  var b=shell('<h2 id="mt">'+esc(A.name)+'</h2><p class="ms">Usuário <b>@'+esc(A.user)+'</b>. '+esc(label())+'.<br>Em outro aparelho, toque em “Entrar” e use esse usuário e o seu PIN.</p><button class="btn" type="button" id="mout">'+svg('out')+' Sair desta conta</button>');
  b.querySelector('#mout').onclick=logout;
}
function openM(mode){
  var isNew=mode==='new';
  var b=shell('<h2 id="mt">'+(isNew?'Criar conta':'Entrar')+'</h2>'+
   '<p class="ms">'+(isNew?'Seu progresso fica salvo e aparece em qualquer aparelho. Sem e-mail e sem senha longa: só um usuário e um PIN de 4 números.':'Use o usuário e o PIN que você criou.')+'</p>'+
   '<div class="mtabs" role="tablist"><button type="button" class="'+(isNew?'on':'')+'" data-m="new">Criar conta</button><button type="button" class="'+(isNew?'':'on')+'" data-m="in">Já tenho conta</button></div>'+
   '<form novalidate>'+
   (isNew?'<div class="mf"><label for="fn">Seu nome</label><input id="fn" autocomplete="name" maxlength="40" placeholder="Ana Souza"><small>Aparece só na tela. Pode repetir o de um colega.</small></div>':'')+
   '<div class="mf"><label for="fu">Usuário</label><input id="fu" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="21" placeholder="ana.souza"><small id="fuh">'+(isNew?'Único. De 3 a 20 caracteres: letras minúsculas, números, ponto ou _.':'&nbsp;')+'</small></div>'+
   '<div class="mf"><label for="fp">PIN de 4 números</label><input id="fp" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="'+(isNew?'new-password':'current-password')+'" placeholder="••••">'+(isNew?'<small>Escolha um que você vá lembrar. Não use 1234.</small>':'')+'</div>'+
   '<div class="merr" hidden></div>'+
   '<button class="btn pri" type="submit">'+(isNew?'Criar conta e salvar progresso':'Entrar')+'</button></form>');
  b.querySelectorAll('.mtabs button').forEach(function(t){t.onclick=function(){openM(t.getAttribute('data-m'));};});
  var fu=b.querySelector('#fu'),fp=b.querySelector('#fp'),fn=b.querySelector('#fn'),fuh=b.querySelector('#fuh'),er=b.querySelector('.merr'),sb=b.querySelector('button[type=submit]');
  fp.addEventListener('input',function(){fp.value=fp.value.replace(/\D/g,'').slice(0,4);});
  fu.addEventListener('input',function(){var v=fu.value.toLowerCase().replace(/\s/g,'');if(v!==fu.value)fu.value=v;});
  if(isNew){var ct=null;fu.addEventListener('input',function(){clearTimeout(ct);var v=fu.value.replace(/^@/,'');
    if(!/^[a-z0-9._]{3,20}$/.test(v)){fuh.className='';fuh.textContent='Único. De 3 a 20 caracteres: letras minúsculas, números, ponto ou _.';return;}
    ct=setTimeout(function(){api('check?u='+encodeURIComponent(v)).then(function(j){if(fu.value.replace(/^@/,'')!==v)return;
      if(j.ok){fuh.className='ok';fuh.textContent='@'+v+' está livre.';}else{fuh.className='bad';fuh.textContent=j.reason==='taken'?'@'+v+' já está em uso. Tente outro, como '+v+'2 ou '+v+'.'+(new Date().getFullYear()%100)+'.':'Usuário inválido.';}}).catch(function(){});},350);});}
  (fn||fu).focus();
  b.querySelector('form').onsubmit=function(e){e.preventDefault();er.hidden=true;
    var body={username:fu.value.replace(/^@/,''),pin:fp.value};
    if(isNew){body.name=fn.value.trim();if(!body.name){er.textContent='Escreva seu nome.';er.hidden=false;return;}}
    if(!/^\d{4}$/.test(body.pin)){er.textContent='O PIN tem que ter 4 números.';er.hidden=false;return;}
    if(isNew)body.data=(function(){var d=payload(GA.S());d._ts=Date.now();return d;})();
    sb.disabled=true;sb.textContent=isNew?'Criando…':'Entrando…';
    api(isNew?'register':'login',{method:'POST',body:body}).then(function(j){
      if(!j.token){er.textContent=j.error||'Não deu certo. Tente de novo.';er.hidden=false;sb.disabled=false;sb.textContent=isNew?'Criar conta e salvar progresso':'Entrar';return;}
      closeM();afterAuth(j,isNew?'new':'login');
      GA.toast(isNew?'Conta criada. Seu progresso agora fica salvo em @'+j.username+'.':'Olá, '+first(j.name)+'. Progresso carregado.','ok','ok');
    }).catch(function(){er.textContent='Sem conexão com o servidor. Tente de novo.';er.hidden=false;sb.disabled=false;sb.textContent=isNew?'Criar conta e salvar progresso':'Entrar';});
  };
}

window.GASync={dirty:dirty,after:after,label:label};
window.addEventListener('online',function(){if(A&&A.pending)push(false);});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&A&&A.pending){clearTimeout(timer);push(true);}else if(document.visibilityState==='visible'&&A)pull();});
setInterval(function(){if(A&&A.pending&&status==='off')push(false);},30000);
function boot(){if(!window.GA)return setTimeout(boot,50);paint();if(A)pull();}
boot();
})();
