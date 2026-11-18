// Pure parser for server-rendered Premium lottery history.
const ORIGIN = 'https://p-bandai.jp';
function decode(value) {
  const names = {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(all,key)=>{
    if(key[0]!=='#')return names[key.toLowerCase()];
    const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
    return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'\ufffd';
  });
}
function clean(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
}
function text(html) { return decode(String(html || '').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim(); }
function attrs(tag) {
  const result={};
  const pattern=/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;while((m=pattern.exec(tag)))result[m[1].toLowerCase()]=decode(m[2]===undefined?m[3]===undefined?m[4]:m[3]:m[2]);
  return result;
}
function hasLogin(html) {
  return (clean(html).match(/<input\b[^>]*>/gi)||[]).some(tag=>{const a=attrs(tag);return a.id==='login_id'||a.name==='login_id';});
}
function statusOf(raw) {
  const value=String(raw || '').replace(/\s+/g,'');
  if(['当選','当選しました'].includes(value))return 'WON';
  if(['落選','落選しました'].includes(value))return 'LOST';
  if(['未抽選','抽選前','結果発表前','抽選結果待ち','結果待ち','抽選中','未発表'].includes(value))return 'PENDING';
  if(['キャンセル','応募取消','申込取消','取消済み'].includes(value))return 'CANCELLED';
  return 'UNKNOWN';
}
function productIds(value) {
  const values=String(value || '').trim().split(/[,\s]+/).filter(Boolean);
  if(!values.length||values.some(id=>!/^\d+$/.test(id)))throw new Error('PREMIUM_RESULT_PRODUCT_ID_INVALID');
  return Array.from(new Set(values));
}
function parseHistory(html) {
  const source=clean(html);
  if(hasLogin(source))throw new Error('PREMIUM_RESULT_LOGIN_REQUIRED');
  const plain=text(source).replace(/\s+/g,'');
  if(!plain.includes('抽選販売応募履歴の確認')&&!plain.includes('抽選販売の応募履歴、結果の確認'))throw new Error('PREMIUM_RESULT_PAGE_UNEXPECTED');
  const records=[];
  const tables=/<table\b([^>]*)>([\s\S]*?)<\/table\s*>/gi;
  let table;
  while((table=tables.exec(source))){
    if(!(attrs('<table '+table[1]+'>').class||'').split(/\s+/).includes('myp-table'))continue;
    const values={};let row;
    const rows=/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
    while((row=rows.exec(table[2]))){
      const heading=/<th\b[^>]*>([\s\S]*?)<\/th\s*>/i.exec(row[1]);
      const cell=/<td\b[^>]*>([\s\S]*?)<\/td\s*>/i.exec(row[1]);
      if(heading&&cell)values[text(heading[1]).replace(/\s+/g,'')]=cell[1];
    }
    if(!values['商品名']||!values['応募日']||values['結果']===undefined)throw new Error('PREMIUM_RESULT_RECORD_UNEXPECTED');
    const ids=[];
    const anchors=values['商品名'].match(/<a\b[^>]*>/gi)||[];
    for(const tag of anchors){
      const href=attrs(tag).href||'';
      const m=/^(?:https:\/\/p-bandai\.jp)?\/item\/item-(\d+)\/(?:[?#].*)?$/.exec(href);
      if(m)ids.push(m[1]);
    }
    const distinct=Array.from(new Set(ids));
    if(distinct.length>1||(!distinct.length&&anchors.length))throw new Error('PREMIUM_RESULT_PRODUCT_LINK_UNEXPECTED');
    const rawStatus=text(values['結果']);
    records.push({productId:distinct[0]||null,productName:text(values['商品名']),appliedDate:text(values['応募日']),announcementDate:text(values['結果発表']),rawStatus,status:statusOf(rawStatus)});
  }
  if(!records.length&&!/応募(?:履歴|された商品|情報).{0,30}(?:ありません|ございません|登録されていません)/.test(plain))throw new Error('PREMIUM_RESULT_EMPTY_PAGE_UNCONFIRMED');
  const pageLinks=[];
  for(const tag of source.match(/<a\b[^>]*>/gi)||[]){
    const href=attrs(tag).href||'';
    const m=/^(?:https:\/\/p-bandai\.jp)?(\/mylotsale\/(?:\?[^#]*)?)(?:#.*)?$/.exec(href);
    if(m)pageLinks.push(ORIGIN+m[1]);
    else if(/^\?[^#]+/.test(href))pageLinks.push(ORIGIN+'/mylotsale/'+href.split('#')[0]);
  }
  return {records,pageLinks:Array.from(new Set(pageLinks))};
}

module.exports={productIds,statusOf,parseHistory,hasLogin,attrs,decode};
