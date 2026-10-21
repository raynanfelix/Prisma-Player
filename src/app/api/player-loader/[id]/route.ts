import { NextResponse } from "next/server";

/**
 * Loader embed servido por /api/player-loader/[id]. Carrega os pixels de
 * browser (Meta/Google/TikTok) usando apenas os IDs públicos - tokens nunca
 * entram aqui. Em conversões, o transaction_id viaja como eventID (Meta) /
 * event_id (TikTok): a MESMA chave que o CAPI server-side
 * (services/ads/server-events) envia, para as plataformas deduplicarem
 * browser + server e cada venda contar uma única vez.
 */
export function buildPlayerLoaderScript(playerId: string) {
  return `(()=>{
const PLAYER_ID=${JSON.stringify(playerId)};
const currentScript=document.currentScript;
const loaderOrigin=new URL(currentScript.src).origin;
const integrationsKey='prisma-player:pixel-integrations:'+PLAYER_ID;
const analyticsKey='prisma-player:analytics-context:'+PLAYER_ID;
const consentKey='prisma-player:advertising-consent:v1';
const consentConfigKey='prisma-player:consent-config:'+PLAYER_ID;
const frames=[];
try{const preconnect=document.createElement('link');preconnect.rel='preconnect';preconnect.href=loaderOrigin;(document.head||document.documentElement).appendChild(preconnect)}catch{}
const eventNames={
  meta:{impression:'ViewContent',play:'PrismaVideoPlay',progress:'PrismaVideoProgress',complete:'PrismaVideoComplete',cta_click:'Lead',conversion:'Purchase'},
  google:{impression:'view_item',play:'video_start',progress:'video_progress',complete:'video_complete',cta_click:'generate_lead',conversion:'purchase'},
  tiktok:{impression:'ViewContent',play:'PrismaVideoPlay',progress:'PrismaVideoProgress',complete:'PrismaVideoComplete',cta_click:'ClickButton',conversion:'Purchase'}
};
const cleanIntegrations=(value)=>Array.isArray(value)?value.filter(item=>item&&['meta','google','tiktok'].includes(item.provider)&&typeof item.id==='string').map(item=>({provider:item.provider,id:item.id.slice(0,120),conversionDestination:typeof item.conversionDestination==='string'?item.conversionDestination.slice(0,120):''})):[];
const cleanText=(value,fallback,max)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):fallback;
const cleanConsent=(value)=>({mode:value?.mode==='external'?'external':'banner',title:cleanText(value?.title,'Sua privacidade importa',80),description:cleanText(value?.description,'Usamos tecnologias de publicidade para medir resultados e melhorar sua experiência.',240),acceptLabel:cleanText(value?.acceptLabel,'Aceitar',32),rejectLabel:cleanText(value?.rejectLabel,'Recusar',32),privacyUrl:typeof value?.privacyUrl==='string'&&/^https:\\/\\//i.test(value.privacyUrl)?value.privacyUrl.slice(0,500):''});
const readIntegrations=()=>{try{return cleanIntegrations(JSON.parse(sessionStorage.getItem(integrationsKey)||'[]'))}catch{return[]}};
const rememberIntegrations=(value)=>{const clean=cleanIntegrations(value);try{sessionStorage.setItem(integrationsKey,JSON.stringify(clean))}catch{}return clean};
const rememberAnalytics=(value)=>{if(!value||typeof value.videoId!=='string'||typeof value.sessionId!=='string'||typeof value.eventToken!=='string')return;try{sessionStorage.setItem(analyticsKey,JSON.stringify({videoId:value.videoId,sessionId:value.sessionId,eventToken:value.eventToken}))}catch{}};
let consentConfig=(()=>{try{return cleanConsent(JSON.parse(sessionStorage.getItem(consentConfigKey)||'null'))}catch{return cleanConsent(null)}})();
let pendingProviderEvents=[];
const readConsent=()=>{try{const value=localStorage.getItem(consentKey);return value==='granted'||value==='denied'?value:null}catch{return null}};
const rememberConsentConfig=(value)=>{consentConfig=cleanConsent(value);try{sessionStorage.setItem(consentConfigKey,JSON.stringify(consentConfig))}catch{}return consentConfig};
const loadedTags=new Set();
const appendScript=(key,src)=>{if(loadedTags.has(key)||document.querySelector('script[data-prisma-tag="'+key+'"]'))return;loadedTags.add(key);const script=document.createElement('script');script.async=true;script.src=src;script.dataset.prismaTag=key;(document.head||document.documentElement).appendChild(script)};
const ensureMeta=(id)=>{if(!window.fbq){const fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments)};fbq.push=fbq;fbq.loaded=true;fbq.version='2.0';fbq.queue=[];window.fbq=fbq;window._fbq=fbq;appendScript('meta-base','https://connect.facebook.net/en_US/fbevents.js')}if(!loadedTags.has('meta:'+id)){loadedTags.add('meta:'+id);window.fbq('init',id)}};
const ensureGoogle=(id)=>{window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};if(!loadedTags.has('google:'+id)){loadedTags.add('google:'+id);window.gtag('js',new Date());window.gtag('config',id);appendScript('google-script:'+id,'https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id))}};
const ensureTikTok=(id)=>{if(!window.ttq){const ttq=window.ttq=[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent'];ttq.setAndDefer=(target,method)=>{target[method]=function(){target.push([method].concat([].slice.call(arguments)))}};for(const method of ttq.methods)ttq.setAndDefer(ttq,method);ttq.instance=pixelId=>{ttq._i=ttq._i||{};const instance=ttq._i[pixelId]||[];for(const method of ttq.methods)ttq.setAndDefer(instance,method);return instance};ttq.load=pixelId=>{ttq._i=ttq._i||{};ttq._i[pixelId]=ttq._i[pixelId]||[];ttq._i[pixelId]._u='https://analytics.tiktok.com/i18n/pixel/events.js';appendScript('tiktok:'+pixelId,ttq._i[pixelId]._u+'?sdkid='+encodeURIComponent(pixelId)+'&lib=ttq')}}if(!loadedTags.has('tiktok-init:'+id)){loadedTags.add('tiktok-init:'+id);window.ttq.load(id)}};
const ensureProviders=(configured)=>{for(const integration of cleanIntegrations(configured)){if(integration.provider==='meta')ensureMeta(integration.id);else if(integration.provider==='google')ensureGoogle(integration.id);else if(integration.provider==='tiktok')ensureTikTok(integration.id)}};
const sendToProviders=(eventType,detail,configured)=>{
  ensureProviders(configured);
  for(const integration of cleanIntegrations(configured)){
    const name=eventNames[integration.provider]?.[eventType];if(!name)continue;
    if(integration.provider==='meta'&&typeof window.fbq==='function'){
      const custom=name.startsWith('Prisma');const dedupeId=detail.transaction_id||'';window.fbq(custom?'trackSingleCustom':'trackSingle',integration.id,name,detail,dedupeId?{eventID:dedupeId}:undefined);
    }else if(integration.provider==='google'&&typeof window.gtag==='function'){
      const destination=eventType==='conversion'&&integration.conversionDestination?integration.conversionDestination:integration.id;const googleDetail=eventType==='conversion'?{...detail,items:[{item_id:detail.player_id,item_name:'Prisma Player VSL',price:detail.value,quantity:1}]}:detail;
      window.gtag('event',name,{...googleDetail,send_to:destination});
    }else if(integration.provider==='tiktok'&&window.ttq){
      const tracker=typeof window.ttq.instance==='function'?window.ttq.instance(integration.id):window.ttq;
      if(tracker&&typeof tracker.track==='function')tracker.track(name,detail,detail.transaction_id||undefined);
    }
  }
};
const removeConsentBanner=()=>document.getElementById('prisma-player-consent')?.remove();
const flushProviderEvents=()=>{const queued=pendingProviderEvents.splice(0);for(const item of queued)sendToProviders(item.eventType,item.detail,item.integrations)};
const setConsent=(granted)=>{const state=granted?'granted':'denied';try{localStorage.setItem(consentKey,state)}catch{}removeConsentBanner();if(granted)flushProviderEvents();else pendingProviderEvents=[];window.dispatchEvent(new CustomEvent('prisma-player:consent',{detail:{advertising:granted,state}}));return state};
const renderConsentBanner=(settings)=>{if(settings.mode!=='banner'||readConsent()||document.getElementById('prisma-player-consent'))return;const root=document.createElement('section');root.id='prisma-player-consent';root.setAttribute('role','dialog');root.setAttribute('aria-label','Preferências de privacidade');root.style.cssText='position:fixed;z-index:2147483647;left:16px;right:16px;bottom:16px;max-width:560px;margin:auto;padding:18px;border:1px solid rgba(0,0,0,.12);border-radius:18px;background:rgba(255,255,255,.96);color:#1d1d1f;box-shadow:0 18px 60px rgba(0,0,0,.2);backdrop-filter:blur(20px);font:14px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';const title=document.createElement('strong');title.textContent=settings.title;title.style.cssText='display:block;font-size:16px;margin-bottom:5px';const description=document.createElement('p');description.textContent=settings.description;description.style.cssText='margin:0;color:#515154';const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:14px';const reject=document.createElement('button');reject.type='button';reject.textContent=settings.rejectLabel;reject.style.cssText='min-height:40px;padding:0 16px;border:1px solid rgba(0,0,0,.15);border-radius:999px;background:#fff;color:#1d1d1f;font:600 13px inherit;cursor:pointer';reject.onclick=()=>setConsent(false);const accept=document.createElement('button');accept.type='button';accept.textContent=settings.acceptLabel;accept.style.cssText='min-height:40px;padding:0 18px;border:0;border-radius:999px;background:#0066cc;color:#fff;font:600 13px inherit;cursor:pointer';accept.onclick=()=>setConsent(true);actions.append(reject,accept);if(settings.privacyUrl){const link=document.createElement('a');link.href=settings.privacyUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Política de privacidade';link.style.cssText='align-self:center;margin-right:auto;color:#0066cc;text-decoration:none;font-size:12px';actions.prepend(link)}root.append(title,description,actions);document.body.appendChild(root)};
const publish=(eventType,detail,integrations,settings=consentConfig)=>{window.dispatchEvent(new CustomEvent('prisma-player:event',{detail:{...detail,event_type:eventType}}));const state=readConsent();if(state==='granted'){sendToProviders(eventType,detail,integrations);return}if(state==='denied')return;pendingProviderEvents.push({eventType,detail,integrations});if(pendingProviderEvents.length>100)pendingProviderEvents.shift();renderConsentBanner(settings)};
addEventListener('message',event=>{
  const frame=frames.find(item=>item.frame.contentWindow===event.source);if(!frame||event.origin!==loaderOrigin||event.data?.playerId!==frame.playerId)return;
  if(event.data?.type==='prisma-player:resize'){const height=Number(event.data.height);if(Number.isFinite(height)&&height>0){frame.root.style.paddingTop='0';frame.root.style.height=Math.ceil(height)+'px'}return}
  if(event.data?.type!=='prisma-player:pixel-event')return;
  const d=event.data;const integrations=rememberIntegrations(d.integrations);const settings=rememberConsentConfig(d.consent);rememberAnalytics(d.analyticsContext);const detail={video_id:String(d.videoId||''),player_id:String(d.playerId||''),progress_percent:Number(d.progressPercent)||0,pixel_name:String(d.pixelName||''),value:Number(d.value)||undefined,currency:String(d.currency||'').toUpperCase()||undefined,transaction_id:String(d.transactionId||'')||undefined};publish(String(d.eventType||''),detail,integrations,settings);
},false);
for(const root of [...document.querySelectorAll('[data-prisma-player="'+PLAYER_ID+'"]')].filter(element=>!element.dataset.prismaMounted)){
  root.dataset.prismaMounted='true';root.style.background='transparent';root.style.border='0';root.style.boxShadow='none';root.style.overflow='hidden';root.style.lineHeight='0';
  const mobile=root.dataset.mobilePlayer;const selected=mobile&&matchMedia('(max-width: 767px)').matches?mobile:PLAYER_ID;const mode=root.dataset.mode==='ab'?'/embed/ab/':'/embed/';const frame=document.createElement('iframe');frame.src=loaderOrigin+mode+selected;frame.title=root.dataset.title||'Prisma Player';frame.loading=root.dataset.loading||'lazy';try{frame.fetchPriority='high'}catch{}frame.allow='autoplay; fullscreen; picture-in-picture';frame.allowFullscreen=true;frame.scrolling='no';frame.referrerPolicy='strict-origin-when-cross-origin';frame.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0;display:block;overflow:hidden;background:transparent;color-scheme:normal';frames.push({root,frame,playerId:selected});root.replaceChildren(frame);
}
const previous=window.PrismaPlayer&&typeof window.PrismaPlayer==='object'?window.PrismaPlayer:{};
window.PrismaPlayer={...previous,getConsent(){return readConsent()},setConsent(input={}){const granted=input===true||input?.advertising===true;return setConsent(granted)},resetConsent(){try{localStorage.removeItem(consentKey)}catch{}pendingProviderEvents=[];removeConsentBanner();return null},trackConversion(input={}){
  const selected=String(input.playerId||PLAYER_ID);if(selected!==PLAYER_ID)return false;
  const value=Number(input.value);const currency=/^[A-Z]{3}$/.test(String(input.currency||'').toUpperCase())?String(input.currency).toUpperCase():'BRL';const transactionId=String(input.transactionId||'').trim().slice(0,120);if(!transactionId||!Number.isFinite(value)||value<0)return false;
  const dedupeKey='prisma-player:conversion:'+PLAYER_ID+':'+transactionId;try{if(localStorage.getItem(dedupeKey)==='1')return true;localStorage.setItem(dedupeKey,'1')}catch{}
  const detail={player_id:PLAYER_ID,value,currency,transaction_id:transactionId};const integrations=readIntegrations();publish('conversion',detail,integrations);
  const advertisingConsent=readConsent()==='granted';try{const context=JSON.parse(sessionStorage.getItem(analyticsKey)||'null');if(context?.videoId&&context?.sessionId&&context?.eventToken)fetch(loaderOrigin+'/api/analytics-events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({videoId:context.videoId,sessionId:context.sessionId,eventType:'conversion',progressPercent:0,watchedSeconds:0,eventToken:context.eventToken,pageUrl:location.href,transactionId,value,currency,advertisingConsent}),keepalive:true}).catch(()=>{})}catch{}
  for(const item of frames)item.frame.contentWindow?.postMessage({type:'prisma-player:track-conversion',playerId:item.playerId,value,currency,transactionId,advertisingConsent},loaderOrigin);
  return integrations.length>0;
}};
})();`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return new NextResponse("/* Prisma Player: invalid id */", { status: 400, headers: { "content-type": "application/javascript; charset=utf-8" } });
  return new NextResponse(buildPlayerLoaderScript(id), { headers: {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
    "x-content-type-options": "nosniff",
  } });
}
