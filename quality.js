/* Afiliate Miner v2.7 — preço confiável: não confundir parcela, preço antigo ou desconto. */
(function (root) {
'use strict';
const EXCLUDED = 's,del,.poly-price__old,.ui-search-price__part--original,.ui-pdp-price__part--original,[class*="original" i],[class*="old-price" i],[class*="strike" i],[class*="through" i],[class*="installment" i],[class*="parcel" i],[class*="shipping" i],[class*="frete" i],[class*="credit-card" i],[class*="discount" i]';
const OLD = 's,del,.poly-price__old,.ui-search-price__part--original,.ui-pdp-price__part--original,[class*="price-original" i],[class*="original-price" i],[class*="price-before" i],[class*="line-through" i]';
const ML = ['.poly-price__current .andes-money-amount','.poly-component__price .andes-money-amount','.ui-search-price__second-line .andes-money-amount','.ui-pdp-price__main-container .andes-money-amount','.ui-pdp-price__part--medium .andes-money-amount','.andes-money-amount'];
const SHOPEE = ['[data-sqe="price"]','.shopee-item-card__current-price','[data-testid="price"]','[data-e2e="price"]','[class*="current-price" i]','.flex.items-baseline','[class*="price"]'];
const valid = n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 10000000;
function parseBrl(value, allowBare = false) {
 const t=String(value||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
 if (!t || /(?:\d+\s*x\s*(?:de\s*)?R\$|parcel|sem juros)/i.test(t)) return null;
 const m=t.match(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/i) ||
   (allowBare ? t.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/) : null);
 if (!m) return null;
 const n=Number(m[1].replace(/\./g,'')) + (m[2] ? Number(m[2].padEnd(2,'0'))/100 : 0);
 return valid(n)?n:null;
}
function nodePrice(el, bare=false) {
 if(!el)return null;
 const fraction=el.querySelector?.('.andes-money-amount__fraction');
 if(fraction) {
   const integer=Number((fraction.textContent||'').replace(/\D/g,''));
   const centsEl=el.querySelector('.andes-money-amount__cents');
   const cents=centsEl ? Number((centsEl.textContent||'').replace(/\D/g,'').slice(0,2).padEnd(2,'0'))/100:0;
   if(valid(integer+cents))return integer+cents;
 }
 const aria=parseBrl(el.getAttribute?.('aria-label'));
 if(aria)return aria;
 let n=el;
 if(el.querySelector?.(EXCLUDED)) {n=el.cloneNode(true);n.querySelectorAll(EXCLUDED).forEach(x=>x.remove());}
 const parts=[...n.querySelectorAll('span')].map(x=>(x.textContent||'').trim()).filter(Boolean);
 const ix=parts.findIndex(x=>x==='R$');
 if(ix>=0 && /^\d{1,6}$/.test(parts[ix+1]||'')) {
   const cents=/^\d{2}$/.test(parts[ix+2]||'') ? Number(parts[ix+2])/100:0;
   const n=Number(parts[ix+1])+cents;
   if(valid(n))return n;
 }
 return parseBrl(n.textContent,bare);
}
function jsonLdPdpPrice(scope) {
 for(const script of scope.querySelectorAll('script[type="application/ld+json"]')) {
  try {
    const data=JSON.parse(script.textContent);
    const items=Array.isArray(data)?data:[data];
    for(const item of items) {
      const p=item['@type']==='Product'?item:item['@graph']?.find(x=>x['@type']==='Product');
      if(!p)continue;
      const offers=Array.isArray(p.offers)?p.offers[0]:p.offers;
      const currency=offers?.priceCurrency||offers?.priceSpecification?.priceCurrency;
      if(currency && currency!=='BRL')continue;
      const number=Number(offers?.price || offers?.lowPrice || offers?.priceSpecification?.price);
      if(valid(number))return {price:number,source:'json-ld'};
    }
  }catch(_){}
 }
 return null;
}
function extract(scope,platform,isPdp=false) {
 if(!scope?.querySelectorAll || !['mercadolivre','shopee'].includes(platform))return null;
 let found=null;
 const selectors=platform==='mercadolivre'?ML:SHOPEE;
 for(const sel of selectors){
   for(const node of scope.querySelectorAll(sel)){
    if(node.closest(EXCLUDED))continue;
    const amount=nodePrice(node,node.matches('.shopee-item-card__current-price,[data-sqe="price"],[data-testid="price"],[data-e2e="price"]'));
    if(amount){found={price:amount,source:sel};break;}
   }
   if(found)break;
 }
 if(!found && isPdp) found=jsonLdPdpPrice(scope);
 if(!found)return null;
 let oldPrice=0;
 for(const node of scope.querySelectorAll(OLD)){
  const amount=nodePrice(node);
  if(amount && amount>found.price && (!oldPrice || amount<oldPrice))oldPrice=amount;
 }
 const rawDiscount=oldPrice?Math.round((oldPrice-found.price)/oldPrice*100):0;
 const discount=rawDiscount>0&&rawDiscount<=95?rawDiscount:0;
 return {...found,oldPrice,discount};
}
function isValidProduct(p){
 return !!String(p?.title||'').trim() && valid(Number(p?.pixPrice)) &&
 /^https?:\/\//i.test(String(p?.original_link||p?.link||''));
}
const api={extract,parseBrl,nodePrice,isValidProduct};
root.AfiliateQualityParser=api;
if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
