import{a as u,b as p,c as v,d as mo,e as Wt,f as go,h as wo}from"./chunk-PYYDOBSC.js";import{A as P,B as z,C as Y,D as d,F as ho,J as fo,l as rt,o as c,p as Re,s as It,t as po,u as f,w as y}from"./chunk-IU2BIVBP.js";import"./chunk-VSAGZTWV.js";import{A as V,B as W,C as S,D as De,E as co,F as g,G as Ee,H as U,M as uo,O as w,U as J,V as ot,a as Me,f as Ze,p as et,q as ao,r as b,u as B,v as ne,x as tt,z as Tt}from"./chunk-MBNYTZQ4.js";import"./chunk-JQ2KLFSX.js";import"./chunk-ZV2OZMVR.js";import"./chunk-TM3WUGH4.js";import"./chunk-Q44F5DLA.js";import{b as E,e as oi}from"./chunk-66WNERIQ.js";var Io=E((Rl,To)=>{To.exports=function(){return typeof Promise=="function"&&Promise.prototype&&Promise.prototype.then}});var le=E(ge=>{var Pt,li=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706];ge.getSymbolSize=function(e){if(!e)throw new Error('"version" cannot be null or undefined');if(e<1||e>40)throw new Error('"version" should be in range from 1 to 40');return e*4+17};ge.getSymbolTotalCodewords=function(e){return li[e]};ge.getBCHDigit=function(t){let e=0;for(;t!==0;)e++,t>>>=1;return e};ge.setToSJISFunction=function(e){if(typeof e!="function")throw new Error('"toSJISFunc" is not a valid function.');Pt=e};ge.isKanjiModeEnabled=function(){return typeof Pt<"u"};ge.toSJIS=function(e){return Pt(e)}});var at=E(H=>{H.L={bit:1};H.M={bit:0};H.Q={bit:3};H.H={bit:2};function ai(t){if(typeof t!="string")throw new Error("Param is not a string");switch(t.toLowerCase()){case"l":case"low":return H.L;case"m":case"medium":return H.M;case"q":case"quartile":return H.Q;case"h":case"high":return H.H;default:throw new Error("Unknown EC Level: "+t)}}H.isValid=function(e){return e&&typeof e.bit<"u"&&e.bit>=0&&e.bit<4};H.from=function(e,o){if(H.isValid(e))return e;try{return ai(e)}catch{return o}}});var Po=E((Al,Lo)=>{function Wo(){this.buffer=[],this.length=0}Wo.prototype={get:function(t){let e=Math.floor(t/8);return(this.buffer[e]>>>7-t%8&1)===1},put:function(t,e){for(let o=0;o<e;o++)this.putBit((t>>>e-o-1&1)===1)},getLengthInBits:function(){return this.length},putBit:function(t){let e=Math.floor(this.length/8);this.buffer.length<=e&&this.buffer.push(0),t&&(this.buffer[e]|=128>>>this.length%8),this.length++}};Lo.exports=Wo});var ko=E((Tl,Bo)=>{function ze(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}ze.prototype.set=function(t,e,o,r){let n=t*this.size+e;this.data[n]=o,r&&(this.reservedBit[n]=!0)};ze.prototype.get=function(t,e){return this.data[t*this.size+e]};ze.prototype.xor=function(t,e,o){this.data[t*this.size+e]^=o};ze.prototype.isReserved=function(t,e){return this.reservedBit[t*this.size+e]};Bo.exports=ze});var No=E(ct=>{var ci=le().getSymbolSize;ct.getRowColCoords=function(e){if(e===1)return[];let o=Math.floor(e/7)+2,r=ci(e),n=r===145?26:Math.ceil((r-13)/(2*o-2))*2,i=[r-7];for(let s=1;s<o-1;s++)i[s]=i[s-1]-n;return i.push(6),i.reverse()};ct.getPositions=function(e){let o=[],r=ct.getRowColCoords(e),n=r.length;for(let i=0;i<n;i++)for(let s=0;s<n;s++)i===0&&s===0||i===0&&s===n-1||i===n-1&&s===0||o.push([r[i],r[s]]);return o}});var Do=E(Mo=>{var ui=le().getSymbolSize,Oo=7;Mo.getPositions=function(e){let o=ui(e);return[[0,0],[o-Oo,0],[0,o-Oo]]}});var Uo=E(A=>{A.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var we={N1:3,N2:3,N3:40,N4:10};A.isValid=function(e){return e!=null&&e!==""&&!isNaN(e)&&e>=0&&e<=7};A.from=function(e){return A.isValid(e)?parseInt(e,10):void 0};A.getPenaltyN1=function(e){let o=e.size,r=0,n=0,i=0,s=null,l=null;for(let a=0;a<o;a++){n=i=0,s=l=null;for(let h=0;h<o;h++){let m=e.get(a,h);m===s?n++:(n>=5&&(r+=we.N1+(n-5)),s=m,n=1),m=e.get(h,a),m===l?i++:(i>=5&&(r+=we.N1+(i-5)),l=m,i=1)}n>=5&&(r+=we.N1+(n-5)),i>=5&&(r+=we.N1+(i-5))}return r};A.getPenaltyN2=function(e){let o=e.size,r=0;for(let n=0;n<o-1;n++)for(let i=0;i<o-1;i++){let s=e.get(n,i)+e.get(n,i+1)+e.get(n+1,i)+e.get(n+1,i+1);(s===4||s===0)&&r++}return r*we.N2};A.getPenaltyN3=function(e){let o=e.size,r=0,n=0,i=0;for(let s=0;s<o;s++){n=i=0;for(let l=0;l<o;l++)n=n<<1&2047|e.get(s,l),l>=10&&(n===1488||n===93)&&r++,i=i<<1&2047|e.get(l,s),l>=10&&(i===1488||i===93)&&r++}return r*we.N3};A.getPenaltyN4=function(e){let o=0,r=e.data.length;for(let i=0;i<r;i++)o+=e.data[i];return Math.abs(Math.ceil(o*100/r/5)-10)*we.N4};function di(t,e,o){switch(t){case A.Patterns.PATTERN000:return(e+o)%2===0;case A.Patterns.PATTERN001:return e%2===0;case A.Patterns.PATTERN010:return o%3===0;case A.Patterns.PATTERN011:return(e+o)%3===0;case A.Patterns.PATTERN100:return(Math.floor(e/2)+Math.floor(o/3))%2===0;case A.Patterns.PATTERN101:return e*o%2+e*o%3===0;case A.Patterns.PATTERN110:return(e*o%2+e*o%3)%2===0;case A.Patterns.PATTERN111:return(e*o%3+(e+o)%2)%2===0;default:throw new Error("bad maskPattern:"+t)}}A.applyMask=function(e,o){let r=o.size;for(let n=0;n<r;n++)for(let i=0;i<r;i++)o.isReserved(i,n)||o.xor(i,n,di(e,i,n))};A.getBestMask=function(e,o){let r=Object.keys(A.Patterns).length,n=0,i=1/0;for(let s=0;s<r;s++){o(s),A.applyMask(s,e);let l=A.getPenaltyN1(e)+A.getPenaltyN2(e)+A.getPenaltyN3(e)+A.getPenaltyN4(e);A.applyMask(s,e),l<i&&(i=l,n=s)}return n}});var kt=E(Bt=>{var ae=at(),ut=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],dt=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430];Bt.getBlocksCount=function(e,o){switch(o){case ae.L:return ut[(e-1)*4+0];case ae.M:return ut[(e-1)*4+1];case ae.Q:return ut[(e-1)*4+2];case ae.H:return ut[(e-1)*4+3];default:return}};Bt.getTotalCodewordsCount=function(e,o){switch(o){case ae.L:return dt[(e-1)*4+0];case ae.M:return dt[(e-1)*4+1];case ae.Q:return dt[(e-1)*4+2];case ae.H:return dt[(e-1)*4+3];default:return}}});var jo=E(ht=>{var qe=new Uint8Array(512),pt=new Uint8Array(256);(function(){let e=1;for(let o=0;o<255;o++)qe[o]=e,pt[e]=o,e<<=1,e&256&&(e^=285);for(let o=255;o<512;o++)qe[o]=qe[o-255]})();ht.log=function(e){if(e<1)throw new Error("log("+e+")");return pt[e]};ht.exp=function(e){return qe[e]};ht.mul=function(e,o){return e===0||o===0?0:qe[pt[e]+pt[o]]}});var zo=E(Fe=>{var Nt=jo();Fe.mul=function(e,o){let r=new Uint8Array(e.length+o.length-1);for(let n=0;n<e.length;n++)for(let i=0;i<o.length;i++)r[n+i]^=Nt.mul(e[n],o[i]);return r};Fe.mod=function(e,o){let r=new Uint8Array(e);for(;r.length-o.length>=0;){let n=r[0];for(let s=0;s<o.length;s++)r[s]^=Nt.mul(o[s],n);let i=0;for(;i<r.length&&r[i]===0;)i++;r=r.slice(i)}return r};Fe.generateECPolynomial=function(e){let o=new Uint8Array([1]);for(let r=0;r<e;r++)o=Fe.mul(o,new Uint8Array([1,Nt.exp(r)]));return o}});var Vo=E((Nl,Fo)=>{var qo=zo();function Ot(t){this.genPoly=void 0,this.degree=t,this.degree&&this.initialize(this.degree)}Ot.prototype.initialize=function(e){this.degree=e,this.genPoly=qo.generateECPolynomial(this.degree)};Ot.prototype.encode=function(e){if(!this.genPoly)throw new Error("Encoder not initialized");let o=new Uint8Array(e.length+this.degree);o.set(e);let r=qo.mod(o,this.genPoly),n=this.degree-r.length;if(n>0){let i=new Uint8Array(this.degree);return i.set(r,n),i}return r};Fo.exports=Ot});var Mt=E(Ho=>{Ho.isValid=function(e){return!isNaN(e)&&e>=1&&e<=40}});var Dt=E(oe=>{var Ko="[0-9]+",pi="[A-Z $%*+\\-./:]+",Ve="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";Ve=Ve.replace(/u/g,"\\u");var hi="(?:(?![A-Z0-9 $%*+\\-./:]|"+Ve+`)(?:.|[\r
]))+`;oe.KANJI=new RegExp(Ve,"g");oe.BYTE_KANJI=new RegExp("[^A-Z0-9 $%*+\\-./:]+","g");oe.BYTE=new RegExp(hi,"g");oe.NUMERIC=new RegExp(Ko,"g");oe.ALPHANUMERIC=new RegExp(pi,"g");var fi=new RegExp("^"+Ve+"$"),mi=new RegExp("^"+Ko+"$"),gi=new RegExp("^[A-Z0-9 $%*+\\-./:]+$");oe.testKanji=function(e){return fi.test(e)};oe.testNumeric=function(e){return mi.test(e)};oe.testAlphanumeric=function(e){return gi.test(e)}});var ce=E(N=>{var wi=Mt(),Ut=Dt();N.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]};N.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]};N.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]};N.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]};N.MIXED={bit:-1};N.getCharCountIndicator=function(e,o){if(!e.ccBits)throw new Error("Invalid mode: "+e);if(!wi.isValid(o))throw new Error("Invalid version: "+o);return o>=1&&o<10?e.ccBits[0]:o<27?e.ccBits[1]:e.ccBits[2]};N.getBestModeForData=function(e){return Ut.testNumeric(e)?N.NUMERIC:Ut.testAlphanumeric(e)?N.ALPHANUMERIC:Ut.testKanji(e)?N.KANJI:N.BYTE};N.toString=function(e){if(e&&e.id)return e.id;throw new Error("Invalid mode")};N.isValid=function(e){return e&&e.bit&&e.ccBits};function bi(t){if(typeof t!="string")throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return N.NUMERIC;case"alphanumeric":return N.ALPHANUMERIC;case"kanji":return N.KANJI;case"byte":return N.BYTE;default:throw new Error("Unknown mode: "+t)}}N.from=function(e,o){if(N.isValid(e))return e;try{return bi(e)}catch{return o}}});var Xo=E(be=>{var ft=le(),yi=kt(),Go=at(),ue=ce(),jt=Mt(),Jo=7973,Qo=ft.getBCHDigit(Jo);function xi(t,e,o){for(let r=1;r<=40;r++)if(e<=be.getCapacity(r,o,t))return r}function Yo(t,e){return ue.getCharCountIndicator(t,e)+4}function Ci(t,e){let o=0;return t.forEach(function(r){let n=Yo(r.mode,e);o+=n+r.getBitsLength()}),o}function vi(t,e){for(let o=1;o<=40;o++)if(Ci(t,o)<=be.getCapacity(o,e,ue.MIXED))return o}be.from=function(e,o){return jt.isValid(e)?parseInt(e,10):o};be.getCapacity=function(e,o,r){if(!jt.isValid(e))throw new Error("Invalid QR Code version");typeof r>"u"&&(r=ue.BYTE);let n=ft.getSymbolTotalCodewords(e),i=yi.getTotalCodewordsCount(e,o),s=(n-i)*8;if(r===ue.MIXED)return s;let l=s-Yo(r,e);switch(r){case ue.NUMERIC:return Math.floor(l/10*3);case ue.ALPHANUMERIC:return Math.floor(l/11*2);case ue.KANJI:return Math.floor(l/13);case ue.BYTE:default:return Math.floor(l/8)}};be.getBestVersionForData=function(e,o){let r,n=Go.from(o,Go.M);if(Array.isArray(e)){if(e.length>1)return vi(e,n);if(e.length===0)return 1;r=e[0]}else r=e;return xi(r.mode,r.getLength(),n)};be.getEncodedBits=function(e){if(!jt.isValid(e)||e<7)throw new Error("Invalid QR Code version");let o=e<<12;for(;ft.getBCHDigit(o)-Qo>=0;)o^=Jo<<ft.getBCHDigit(o)-Qo;return e<<12|o}});var or=E(tr=>{var zt=le(),er=1335,$i=21522,Zo=zt.getBCHDigit(er);tr.getEncodedBits=function(e,o){let r=e.bit<<3|o,n=r<<10;for(;zt.getBCHDigit(n)-Zo>=0;)n^=er<<zt.getBCHDigit(n)-Zo;return(r<<10|n)^$i}});var ir=E((zl,rr)=>{var Ei=ce();function Ie(t){this.mode=Ei.NUMERIC,this.data=t.toString()}Ie.getBitsLength=function(e){return 10*Math.floor(e/3)+(e%3?e%3*3+1:0)};Ie.prototype.getLength=function(){return this.data.length};Ie.prototype.getBitsLength=function(){return Ie.getBitsLength(this.data.length)};Ie.prototype.write=function(e){let o,r,n;for(o=0;o+3<=this.data.length;o+=3)r=this.data.substr(o,3),n=parseInt(r,10),e.put(n,10);let i=this.data.length-o;i>0&&(r=this.data.substr(o),n=parseInt(r,10),e.put(n,i*3+1))};rr.exports=Ie});var sr=E((ql,nr)=>{var Ri=ce(),qt=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function We(t){this.mode=Ri.ALPHANUMERIC,this.data=t}We.getBitsLength=function(e){return 11*Math.floor(e/2)+6*(e%2)};We.prototype.getLength=function(){return this.data.length};We.prototype.getBitsLength=function(){return We.getBitsLength(this.data.length)};We.prototype.write=function(e){let o;for(o=0;o+2<=this.data.length;o+=2){let r=qt.indexOf(this.data[o])*45;r+=qt.indexOf(this.data[o+1]),e.put(r,11)}this.data.length%2&&e.put(qt.indexOf(this.data[o]),6)};nr.exports=We});var ar=E((Fl,lr)=>{"use strict";lr.exports=function(e){for(var o=[],r=e.length,n=0;n<r;n++){var i=e.charCodeAt(n);if(i>=55296&&i<=56319&&r>n+1){var s=e.charCodeAt(n+1);s>=56320&&s<=57343&&(i=(i-55296)*1024+s-56320+65536,n+=1)}if(i<128){o.push(i);continue}if(i<2048){o.push(i>>6|192),o.push(i&63|128);continue}if(i<55296||i>=57344&&i<65536){o.push(i>>12|224),o.push(i>>6&63|128),o.push(i&63|128);continue}if(i>=65536&&i<=1114111){o.push(i>>18|240),o.push(i>>12&63|128),o.push(i>>6&63|128),o.push(i&63|128);continue}o.push(239,191,189)}return new Uint8Array(o).buffer}});var ur=E((Vl,cr)=>{var _i=ar(),Si=ce();function Le(t){this.mode=Si.BYTE,typeof t=="string"&&(t=_i(t)),this.data=new Uint8Array(t)}Le.getBitsLength=function(e){return e*8};Le.prototype.getLength=function(){return this.data.length};Le.prototype.getBitsLength=function(){return Le.getBitsLength(this.data.length)};Le.prototype.write=function(t){for(let e=0,o=this.data.length;e<o;e++)t.put(this.data[e],8)};cr.exports=Le});var pr=E((Hl,dr)=>{var Ai=ce(),Ti=le();function Pe(t){this.mode=Ai.KANJI,this.data=t}Pe.getBitsLength=function(e){return e*13};Pe.prototype.getLength=function(){return this.data.length};Pe.prototype.getBitsLength=function(){return Pe.getBitsLength(this.data.length)};Pe.prototype.write=function(t){let e;for(e=0;e<this.data.length;e++){let o=Ti.toSJIS(this.data[e]);if(o>=33088&&o<=40956)o-=33088;else if(o>=57408&&o<=60351)o-=49472;else throw new Error("Invalid SJIS character: "+this.data[e]+`
Make sure your charset is UTF-8`);o=(o>>>8&255)*192+(o&255),t.put(o,13)}};dr.exports=Pe});var hr=E((Kl,Ft)=>{"use strict";var He={single_source_shortest_paths:function(t,e,o){var r={},n={};n[e]=0;var i=He.PriorityQueue.make();i.push(e,0);for(var s,l,a,h,m,I,x,j,D;!i.empty();){s=i.pop(),l=s.value,h=s.cost,m=t[l]||{};for(a in m)m.hasOwnProperty(a)&&(I=m[a],x=h+I,j=n[a],D=typeof n[a]>"u",(D||j>x)&&(n[a]=x,i.push(a,x),r[a]=l))}if(typeof o<"u"&&typeof n[o]>"u"){var R=["Could not find a path from ",e," to ",o,"."].join("");throw new Error(R)}return r},extract_shortest_path_from_predecessor_list:function(t,e){for(var o=[],r=e,n;r;)o.push(r),n=t[r],r=t[r];return o.reverse(),o},find_path:function(t,e,o){var r=He.single_source_shortest_paths(t,e,o);return He.extract_shortest_path_from_predecessor_list(r,o)},PriorityQueue:{make:function(t){var e=He.PriorityQueue,o={},r;t=t||{};for(r in e)e.hasOwnProperty(r)&&(o[r]=e[r]);return o.queue=[],o.sorter=t.sorter||e.default_sorter,o},default_sorter:function(t,e){return t.cost-e.cost},push:function(t,e){var o={value:t,cost:e};this.queue.push(o),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return this.queue.length===0}}};typeof Ft<"u"&&(Ft.exports=He)});var Cr=E(Be=>{var $=ce(),gr=ir(),wr=sr(),br=ur(),yr=pr(),Ke=Dt(),mt=le(),Ii=hr();function fr(t){return unescape(encodeURIComponent(t)).length}function Ge(t,e,o){let r=[],n;for(;(n=t.exec(o))!==null;)r.push({data:n[0],index:n.index,mode:e,length:n[0].length});return r}function xr(t){let e=Ge(Ke.NUMERIC,$.NUMERIC,t),o=Ge(Ke.ALPHANUMERIC,$.ALPHANUMERIC,t),r,n;return mt.isKanjiModeEnabled()?(r=Ge(Ke.BYTE,$.BYTE,t),n=Ge(Ke.KANJI,$.KANJI,t)):(r=Ge(Ke.BYTE_KANJI,$.BYTE,t),n=[]),e.concat(o,r,n).sort(function(s,l){return s.index-l.index}).map(function(s){return{data:s.data,mode:s.mode,length:s.length}})}function Vt(t,e){switch(e){case $.NUMERIC:return gr.getBitsLength(t);case $.ALPHANUMERIC:return wr.getBitsLength(t);case $.KANJI:return yr.getBitsLength(t);case $.BYTE:return br.getBitsLength(t)}}function Wi(t){return t.reduce(function(e,o){let r=e.length-1>=0?e[e.length-1]:null;return r&&r.mode===o.mode?(e[e.length-1].data+=o.data,e):(e.push(o),e)},[])}function Li(t){let e=[];for(let o=0;o<t.length;o++){let r=t[o];switch(r.mode){case $.NUMERIC:e.push([r,{data:r.data,mode:$.ALPHANUMERIC,length:r.length},{data:r.data,mode:$.BYTE,length:r.length}]);break;case $.ALPHANUMERIC:e.push([r,{data:r.data,mode:$.BYTE,length:r.length}]);break;case $.KANJI:e.push([r,{data:r.data,mode:$.BYTE,length:fr(r.data)}]);break;case $.BYTE:e.push([{data:r.data,mode:$.BYTE,length:fr(r.data)}])}}return e}function Pi(t,e){let o={},r={start:{}},n=["start"];for(let i=0;i<t.length;i++){let s=t[i],l=[];for(let a=0;a<s.length;a++){let h=s[a],m=""+i+a;l.push(m),o[m]={node:h,lastCount:0},r[m]={};for(let I=0;I<n.length;I++){let x=n[I];o[x]&&o[x].node.mode===h.mode?(r[x][m]=Vt(o[x].lastCount+h.length,h.mode)-Vt(o[x].lastCount,h.mode),o[x].lastCount+=h.length):(o[x]&&(o[x].lastCount=h.length),r[x][m]=Vt(h.length,h.mode)+4+$.getCharCountIndicator(h.mode,e))}}n=l}for(let i=0;i<n.length;i++)r[n[i]].end=0;return{map:r,table:o}}function mr(t,e){let o,r=$.getBestModeForData(t);if(o=$.from(e,r),o!==$.BYTE&&o.bit<r.bit)throw new Error('"'+t+'" cannot be encoded with mode '+$.toString(o)+`.
 Suggested mode is: `+$.toString(r));switch(o===$.KANJI&&!mt.isKanjiModeEnabled()&&(o=$.BYTE),o){case $.NUMERIC:return new gr(t);case $.ALPHANUMERIC:return new wr(t);case $.KANJI:return new yr(t);case $.BYTE:return new br(t)}}Be.fromArray=function(e){return e.reduce(function(o,r){return typeof r=="string"?o.push(mr(r,null)):r.data&&o.push(mr(r.data,r.mode)),o},[])};Be.fromString=function(e,o){let r=xr(e,mt.isKanjiModeEnabled()),n=Li(r),i=Pi(n,o),s=Ii.find_path(i.map,"start","end"),l=[];for(let a=1;a<s.length-1;a++)l.push(i.table[s[a]].node);return Be.fromArray(Wi(l))};Be.rawSplit=function(e){return Be.fromArray(xr(e,mt.isKanjiModeEnabled()))}});var $r=E(vr=>{var wt=le(),Ht=at(),Bi=Po(),ki=ko(),Ni=No(),Oi=Do(),Qt=Uo(),Jt=kt(),Mi=Vo(),gt=Xo(),Di=or(),Ui=ce(),Kt=Cr();function ji(t,e){let o=t.size,r=Oi.getPositions(e);for(let n=0;n<r.length;n++){let i=r[n][0],s=r[n][1];for(let l=-1;l<=7;l++)if(!(i+l<=-1||o<=i+l))for(let a=-1;a<=7;a++)s+a<=-1||o<=s+a||(l>=0&&l<=6&&(a===0||a===6)||a>=0&&a<=6&&(l===0||l===6)||l>=2&&l<=4&&a>=2&&a<=4?t.set(i+l,s+a,!0,!0):t.set(i+l,s+a,!1,!0))}}function zi(t){let e=t.size;for(let o=8;o<e-8;o++){let r=o%2===0;t.set(o,6,r,!0),t.set(6,o,r,!0)}}function qi(t,e){let o=Ni.getPositions(e);for(let r=0;r<o.length;r++){let n=o[r][0],i=o[r][1];for(let s=-2;s<=2;s++)for(let l=-2;l<=2;l++)s===-2||s===2||l===-2||l===2||s===0&&l===0?t.set(n+s,i+l,!0,!0):t.set(n+s,i+l,!1,!0)}}function Fi(t,e){let o=t.size,r=gt.getEncodedBits(e),n,i,s;for(let l=0;l<18;l++)n=Math.floor(l/3),i=l%3+o-8-3,s=(r>>l&1)===1,t.set(n,i,s,!0),t.set(i,n,s,!0)}function Gt(t,e,o){let r=t.size,n=Di.getEncodedBits(e,o),i,s;for(i=0;i<15;i++)s=(n>>i&1)===1,i<6?t.set(i,8,s,!0):i<8?t.set(i+1,8,s,!0):t.set(r-15+i,8,s,!0),i<8?t.set(8,r-i-1,s,!0):i<9?t.set(8,15-i-1+1,s,!0):t.set(8,15-i-1,s,!0);t.set(r-8,8,1,!0)}function Vi(t,e){let o=t.size,r=-1,n=o-1,i=7,s=0;for(let l=o-1;l>0;l-=2)for(l===6&&l--;;){for(let a=0;a<2;a++)if(!t.isReserved(n,l-a)){let h=!1;s<e.length&&(h=(e[s]>>>i&1)===1),t.set(n,l-a,h),i--,i===-1&&(s++,i=7)}if(n+=r,n<0||o<=n){n-=r,r=-r;break}}}function Hi(t,e,o){let r=new Bi;o.forEach(function(a){r.put(a.mode.bit,4),r.put(a.getLength(),Ui.getCharCountIndicator(a.mode,t)),a.write(r)});let n=wt.getSymbolTotalCodewords(t),i=Jt.getTotalCodewordsCount(t,e),s=(n-i)*8;for(r.getLengthInBits()+4<=s&&r.put(0,4);r.getLengthInBits()%8!==0;)r.putBit(0);let l=(s-r.getLengthInBits())/8;for(let a=0;a<l;a++)r.put(a%2?17:236,8);return Ki(r,t,e)}function Ki(t,e,o){let r=wt.getSymbolTotalCodewords(e),n=Jt.getTotalCodewordsCount(e,o),i=r-n,s=Jt.getBlocksCount(e,o),l=r%s,a=s-l,h=Math.floor(r/s),m=Math.floor(i/s),I=m+1,x=h-m,j=new Mi(x),D=0,R=new Array(s),C=new Array(s),O=0,_=new Uint8Array(t.buffer);for(let $e=0;$e<s;$e++){let At=$e<a?m:I;R[$e]=_.slice(D,D+At),C[$e]=j.encode(R[$e]),D+=At,O=Math.max(O,At)}let M=new Uint8Array(r),L=0,k,te;for(k=0;k<O;k++)for(te=0;te<s;te++)k<R[te].length&&(M[L++]=R[te][k]);for(k=0;k<x;k++)for(te=0;te<s;te++)M[L++]=C[te][k];return M}function Gi(t,e,o,r){let n;if(Array.isArray(t))n=Kt.fromArray(t);else if(typeof t=="string"){let h=e;if(!h){let m=Kt.rawSplit(t);h=gt.getBestVersionForData(m,o)}n=Kt.fromString(t,h||40)}else throw new Error("Invalid data");let i=gt.getBestVersionForData(n,o);if(!i)throw new Error("The amount of data is too big to be stored in a QR Code");if(!e)e=i;else if(e<i)throw new Error(`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: `+i+`.
`);let s=Hi(e,o,n),l=wt.getSymbolSize(e),a=new ki(l);return ji(a,e),zi(a),qi(a,e),Gt(a,o,0),e>=7&&Fi(a,e),Vi(a,s),isNaN(r)&&(r=Qt.getBestMask(a,Gt.bind(null,a,o))),Qt.applyMask(r,a),Gt(a,o,r),{modules:a,version:e,errorCorrectionLevel:o,maskPattern:r,segments:n}}vr.create=function(e,o){if(typeof e>"u"||e==="")throw new Error("No input text");let r=Ht.M,n,i;return typeof o<"u"&&(r=Ht.from(o.errorCorrectionLevel,Ht.M),n=gt.from(o.version),i=Qt.from(o.maskPattern),o.toSJISFunc&&wt.setToSJISFunction(o.toSJISFunc)),Gi(e,n,r,i)}});var Yt=E(ye=>{function Er(t){if(typeof t=="number"&&(t=t.toString()),typeof t!="string")throw new Error("Color should be defined as hex string");let e=t.slice().replace("#","").split("");if(e.length<3||e.length===5||e.length>8)throw new Error("Invalid hex color: "+t);(e.length===3||e.length===4)&&(e=Array.prototype.concat.apply([],e.map(function(r){return[r,r]}))),e.length===6&&e.push("F","F");let o=parseInt(e.join(""),16);return{r:o>>24&255,g:o>>16&255,b:o>>8&255,a:o&255,hex:"#"+e.slice(0,6).join("")}}ye.getOptions=function(e){e||(e={}),e.color||(e.color={});let o=typeof e.margin>"u"||e.margin===null||e.margin<0?4:e.margin,r=e.width&&e.width>=21?e.width:void 0,n=e.scale||4;return{width:r,scale:r?4:n,margin:o,color:{dark:Er(e.color.dark||"#000000ff"),light:Er(e.color.light||"#ffffffff")},type:e.type,rendererOpts:e.rendererOpts||{}}};ye.getScale=function(e,o){return o.width&&o.width>=e+o.margin*2?o.width/(e+o.margin*2):o.scale};ye.getImageWidth=function(e,o){let r=ye.getScale(e,o);return Math.floor((e+o.margin*2)*r)};ye.qrToImageData=function(e,o,r){let n=o.modules.size,i=o.modules.data,s=ye.getScale(n,r),l=Math.floor((n+r.margin*2)*s),a=r.margin*s,h=[r.color.light,r.color.dark];for(let m=0;m<l;m++)for(let I=0;I<l;I++){let x=(m*l+I)*4,j=r.color.light;if(m>=a&&I>=a&&m<l-a&&I<l-a){let D=Math.floor((m-a)/s),R=Math.floor((I-a)/s);j=h[i[D*n+R]?1:0]}e[x++]=j.r,e[x++]=j.g,e[x++]=j.b,e[x]=j.a}}});var Rr=E(bt=>{var Xt=Yt();function Qi(t,e,o){t.clearRect(0,0,e.width,e.height),e.style||(e.style={}),e.height=o,e.width=o,e.style.height=o+"px",e.style.width=o+"px"}function Ji(){try{return document.createElement("canvas")}catch{throw new Error("You need to specify a canvas element")}}bt.render=function(e,o,r){let n=r,i=o;typeof n>"u"&&(!o||!o.getContext)&&(n=o,o=void 0),o||(i=Ji()),n=Xt.getOptions(n);let s=Xt.getImageWidth(e.modules.size,n),l=i.getContext("2d"),a=l.createImageData(s,s);return Xt.qrToImageData(a.data,e,n),Qi(l,i,s),l.putImageData(a,0,0),i};bt.renderToDataURL=function(e,o,r){let n=r;typeof n>"u"&&(!o||!o.getContext)&&(n=o,o=void 0),n||(n={});let i=bt.render(e,o,n),s=n.type||"image/png",l=n.rendererOpts||{};return i.toDataURL(s,l.quality)}});var Ar=E(Sr=>{var Yi=Yt();function _r(t,e){let o=t.a/255,r=e+'="'+t.hex+'"';return o<1?r+" "+e+'-opacity="'+o.toFixed(2).slice(1)+'"':r}function Zt(t,e,o){let r=t+e;return typeof o<"u"&&(r+=" "+o),r}function Xi(t,e,o){let r="",n=0,i=!1,s=0;for(let l=0;l<t.length;l++){let a=Math.floor(l%e),h=Math.floor(l/e);!a&&!i&&(i=!0),t[l]?(s++,l>0&&a>0&&t[l-1]||(r+=i?Zt("M",a+o,.5+h+o):Zt("m",n,0),n=0,i=!1),a+1<e&&t[l+1]||(r+=Zt("h",s),s=0)):n++}return r}Sr.render=function(e,o,r){let n=Yi.getOptions(o),i=e.modules.size,s=e.modules.data,l=i+n.margin*2,a=n.color.light.a?"<path "+_r(n.color.light,"fill")+' d="M0 0h'+l+"v"+l+'H0z"/>':"",h="<path "+_r(n.color.dark,"stroke")+' d="'+Xi(s,i,n.margin)+'"/>',m='viewBox="0 0 '+l+" "+l+'"',x='<svg xmlns="http://www.w3.org/2000/svg" '+(n.width?'width="'+n.width+'" height="'+n.width+'" ':"")+m+' shape-rendering="crispEdges">'+a+h+`</svg>
`;return typeof r=="function"&&r(null,x),x}});var Ir=E(Qe=>{var Zi=Io(),eo=$r(),Tr=Rr(),en=Ar();function to(t,e,o,r,n){let i=[].slice.call(arguments,1),s=i.length,l=typeof i[s-1]=="function";if(!l&&!Zi())throw new Error("Callback required as last argument");if(l){if(s<2)throw new Error("Too few arguments provided");s===2?(n=o,o=e,e=r=void 0):s===3&&(e.getContext&&typeof n>"u"?(n=r,r=void 0):(n=r,r=o,o=e,e=void 0))}else{if(s<1)throw new Error("Too few arguments provided");return s===1?(o=e,e=r=void 0):s===2&&!e.getContext&&(r=o,o=e,e=void 0),new Promise(function(a,h){try{let m=eo.create(o,r);a(t(m,e,r))}catch(m){h(m)}})}try{let a=eo.create(o,r);n(null,t(a,e,r))}catch(a){n(a)}}Qe.create=eo.create;Qe.toCanvas=to.bind(null,Tr.render);Qe.toDataURL=to.bind(null,Tr.renderToDataURL);Qe.toString=to.bind(null,function(t,e,o){return en.render(t,o)})});var _e=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},pe=class extends f{constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=U.state.connectors,this.count=S.state.count,this.filteredCount=S.state.filteredWallets.length,this.isFetchingRecommendedWallets=S.state.isFetchingRecommendedWallets,this.unsubscribe.push(U.subscribeKey("connectors",e=>this.connectors=e),S.subscribeKey("count",e=>this.count=e),S.subscribeKey("filteredWallets",e=>this.filteredCount=e.length),S.subscribeKey("isFetchingRecommendedWallets",e=>this.isFetchingRecommendedWallets=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){let e=this.connectors.find(h=>h.id==="walletConnect"),{allWallets:o}=B.state;if(!e||o==="HIDE"||o==="ONLY_MOBILE"&&!b.isMobile())return null;let r=S.state.featured.length,n=this.count+r,i=n<10?n:Math.floor(n/10)*10,s=this.filteredCount>0?this.filteredCount:i,l=`${s}`;this.filteredCount>0?l=`${this.filteredCount}`:s<n&&(l=`${s}+`);let a=w.hasAnyConnection(Me.CONNECTOR_ID.WALLET_CONNECT);return c`
      <wui-list-wallet
        name="Search Wallet"
        walletIcon="search"
        showAllWallets
        @click=${this.onAllWallets.bind(this)}
        tagLabel=${l}
        tagVariant="info"
        data-testid="all-wallets"
        tabIdx=${v(this.tabIdx)}
        .loading=${this.isFetchingRecommendedWallets}
        ?disabled=${a}
        size="sm"
      ></wui-list-wallet>
    `}onAllWallets(){W.sendEvent({type:"track",event:"CLICK_ALL_WALLETS"}),g.push("AllWallets",{redirectView:g.state.data?.redirectView})}};_e([u()],pe.prototype,"tabIdx",void 0);_e([p()],pe.prototype,"connectors",void 0);_e([p()],pe.prototype,"count",void 0);_e([p()],pe.prototype,"filteredCount",void 0);_e([p()],pe.prototype,"isFetchingRecommendedWallets",void 0);pe=_e([d("w3m-all-wallets-widget")],pe);var bo=y`
  :host {
    margin-top: ${({spacing:t})=>t[1]};
  }
  wui-separator {
    margin: ${({spacing:t})=>t[3]} calc(${({spacing:t})=>t[3]} * -1)
      ${({spacing:t})=>t[2]} calc(${({spacing:t})=>t[3]} * -1);
    width: calc(100% + ${({spacing:t})=>t[3]} * 2);
  }
`;var Se=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},se=class extends f{constructor(){super(),this.unsubscribe=[],this.explorerWallets=S.state.explorerWallets,this.connections=w.state.connections,this.connectorImages=Tt.state.connectorImages,this.loadingTelegram=!1,this.unsubscribe.push(w.subscribeKey("connections",e=>this.connections=e),Tt.subscribeKey("connectorImages",e=>this.connectorImages=e),S.subscribeKey("explorerFilteredWallets",e=>{this.explorerWallets=e?.length?e:S.state.explorerWallets}),S.subscribeKey("explorerWallets",e=>{this.explorerWallets?.length||(this.explorerWallets=e)})),b.isTelegram()&&b.isIos()&&(this.loadingTelegram=!w.state.wcUri,this.unsubscribe.push(w.subscribeKey("wcUri",e=>this.loadingTelegram=!e)))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){return c`
      <wui-flex flexDirection="column" gap="2"> ${this.connectorListTemplate()} </wui-flex>
    `}connectorListTemplate(){return co.connectorList().map((e,o)=>e.kind==="connector"?this.renderConnector(e,o):this.renderWallet(e,o))}getConnectorNamespaces(e){return e.subtype==="walletConnect"?[]:e.subtype==="multiChain"?e.connector.connectors?.map(o=>o.chain)||[]:[e.connector.chain]}renderConnector(e,o){let r=e.connector,n=V.getConnectorImage(r)||this.connectorImages[r?.imageId??""],s=(this.connections.get(r.chain)??[]).some(I=>ho.isLowerCaseMatch(I.connectorId,r.id)),l,a;e.subtype==="walletConnect"?(l="qr code",a="accent"):e.subtype==="injected"||e.subtype==="announced"?(l=s?"connected":"installed",a=s?"info":"success"):(l=void 0,a=void 0);let h=w.hasAnyConnection(Me.CONNECTOR_ID.WALLET_CONNECT),m=e.subtype==="walletConnect"||e.subtype==="external"?h:!1;return c`
      <w3m-list-wallet
        displayIndex=${o}
        imageSrc=${v(n)}
        .installed=${!0}
        name=${r.name??"Unknown"}
        .tagVariant=${a}
        tagLabel=${v(l)}
        data-testid=${`wallet-selector-${r.id.toLowerCase()}`}
        size="sm"
        @click=${()=>this.onClickConnector(e)}
        tabIdx=${v(this.tabIdx)}
        ?disabled=${m}
        rdnsId=${v(r.explorerWallet?.rdns||void 0)}
        walletRank=${v(r.explorerWallet?.order)}
        .namespaces=${this.getConnectorNamespaces(e)}
      >
      </w3m-list-wallet>
    `}onClickConnector(e){let o=g.state.data?.redirectView;if(e.subtype==="walletConnect"){U.setActiveConnector(e.connector),b.isMobile()?g.push("AllWallets"):g.push("ConnectingWalletConnect",{redirectView:o});return}if(e.subtype==="multiChain"){U.setActiveConnector(e.connector),g.push("ConnectingMultiChain",{redirectView:o});return}if(e.subtype==="injected"){U.setActiveConnector(e.connector),g.push("ConnectingExternal",{connector:e.connector,redirectView:o,wallet:e.connector.explorerWallet});return}if(e.subtype==="announced"){if(e.connector.id==="walletConnect"){b.isMobile()?g.push("AllWallets"):g.push("ConnectingWalletConnect",{redirectView:o});return}g.push("ConnectingExternal",{connector:e.connector,redirectView:o,wallet:e.connector.explorerWallet});return}g.push("ConnectingExternal",{connector:e.connector,redirectView:o})}renderWallet(e,o){let r=e.wallet,n=V.getWalletImage(r),s=w.hasAnyConnection(Me.CONNECTOR_ID.WALLET_CONNECT),l=this.loadingTelegram,a=e.subtype==="recent"?"recent":void 0,h=e.subtype==="recent"?"info":void 0;return c`
      <w3m-list-wallet
        displayIndex=${o}
        imageSrc=${v(n)}
        name=${r.name??"Unknown"}
        @click=${()=>this.onClickWallet(e)}
        size="sm"
        data-testid=${`wallet-selector-${r.id}`}
        tabIdx=${v(this.tabIdx)}
        ?loading=${l}
        ?disabled=${s}
        rdnsId=${v(r.rdns||void 0)}
        walletRank=${v(r.order)}
        tagLabel=${v(a)}
        .tagVariant=${h}
      >
      </w3m-list-wallet>
    `}onClickWallet(e){let o=g.state.data?.redirectView,r=J.state.activeChain;if(e.subtype==="featured"){U.selectWalletConnector(e.wallet);return}if(e.subtype==="recent"){if(this.loadingTelegram)return;U.selectWalletConnector(e.wallet);return}if(e.subtype==="custom"){if(this.loadingTelegram)return;g.push("ConnectingWalletConnect",{wallet:e.wallet,redirectView:o});return}if(this.loadingTelegram)return;let n=r?U.getConnector({id:e.wallet.id,namespace:r}):void 0;n?g.push("ConnectingExternal",{connector:n,redirectView:o}):g.push("ConnectingWalletConnect",{wallet:e.wallet,redirectView:o})}};se.styles=bo;Se([u({type:Number})],se.prototype,"tabIdx",void 0);Se([p()],se.prototype,"explorerWallets",void 0);Se([p()],se.prototype,"connections",void 0);Se([p()],se.prototype,"connectorImages",void 0);Se([p()],se.prototype,"loadingTelegram",void 0);se=Se([d("w3m-connector-list")],se);var yo=y`
  :host {
    flex: 1;
    height: 100%;
  }

  button {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: ${({spacing:t})=>t[1]} ${({spacing:t})=>t[2]};
    column-gap: ${({spacing:t})=>t[1]};
    color: ${({tokens:t})=>t.theme.textSecondary};
    border-radius: ${({borderRadius:t})=>t[20]};
    background-color: transparent;
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color;
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  button[data-active='true'] {
    color: ${({tokens:t})=>t.theme.textPrimary};
    background-color: ${({tokens:t})=>t.theme.foregroundTertiary};
  }

  button:hover:enabled:not([data-active='true']),
  button:active:enabled:not([data-active='true']) {
    wui-text,
    wui-icon {
      color: ${({tokens:t})=>t.theme.textPrimary};
    }
  }
`;var Ue=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},ri={lg:"lg-regular",md:"md-regular",sm:"sm-regular"},ii={lg:"md",md:"sm",sm:"sm"},he=class extends f{constructor(){super(...arguments),this.icon="mobile",this.size="md",this.label="",this.active=!1}render(){return c`
      <button data-active=${this.active}>
        ${this.icon?c`<wui-icon size=${ii[this.size]} name=${this.icon}></wui-icon>`:""}
        <wui-text variant=${ri[this.size]}> ${this.label} </wui-text>
      </button>
    `}};he.styles=[P,z,yo];Ue([u()],he.prototype,"icon",void 0);Ue([u()],he.prototype,"size",void 0);Ue([u()],he.prototype,"label",void 0);Ue([u({type:Boolean})],he.prototype,"active",void 0);he=Ue([d("wui-tab-item")],he);var xo=y`
  :host {
    display: inline-flex;
    align-items: center;
    background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    border-radius: ${({borderRadius:t})=>t[32]};
    padding: ${({spacing:t})=>t["01"]};
    box-sizing: border-box;
  }

  :host([data-size='sm']) {
    height: 26px;
  }

  :host([data-size='md']) {
    height: 36px;
  }
`;var je=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},fe=class extends f{constructor(){super(...arguments),this.tabs=[],this.onTabChange=()=>null,this.size="md",this.activeTab=0}render(){return this.dataset.size=this.size,this.tabs.map((e,o)=>{let r=o===this.activeTab;return c`
        <wui-tab-item
          @click=${()=>this.onTabClick(o)}
          icon=${e.icon}
          size=${this.size}
          label=${e.label}
          ?active=${r}
          data-active=${r}
          data-testid="tab-${e.label?.toLowerCase()}"
        ></wui-tab-item>
      `})}onTabClick(e){this.activeTab=e,this.onTabChange(e)}};fe.styles=[P,z,xo];je([u({type:Array})],fe.prototype,"tabs",void 0);je([u()],fe.prototype,"onTabChange",void 0);je([u()],fe.prototype,"size",void 0);je([p()],fe.prototype,"activeTab",void 0);fe=je([d("wui-tabs")],fe);var Lt=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},it=class extends f{constructor(){super(...arguments),this.platformTabs=[],this.unsubscribe=[],this.platforms=[],this.onSelectPlatfrom=void 0}disconnectCallback(){this.unsubscribe.forEach(e=>e())}render(){let e=this.generateTabs();return c`
      <wui-flex justifyContent="center" .padding=${["0","0","4","0"]}>
        <wui-tabs .tabs=${e} .onTabChange=${this.onTabChange.bind(this)}></wui-tabs>
      </wui-flex>
    `}generateTabs(){let e=this.platforms.map(o=>o==="browser"?{label:"Browser",icon:"extension",platform:"browser"}:o==="mobile"?{label:"Mobile",icon:"mobile",platform:"mobile"}:o==="qrcode"?{label:"Mobile",icon:"mobile",platform:"qrcode"}:o==="web"?{label:"Webapp",icon:"browser",platform:"web"}:o==="desktop"?{label:"Desktop",icon:"desktop",platform:"desktop"}:{label:"Browser",icon:"extension",platform:"unsupported"});return this.platformTabs=e.map(({platform:o})=>o),e}onTabChange(e){let o=this.platformTabs[e];o&&this.onSelectPlatfrom?.(o)}};Lt([u({type:Array})],it.prototype,"platforms",void 0);Lt([u()],it.prototype,"onSelectPlatfrom",void 0);it=Lt([d("w3m-connecting-header")],it);var Co=y`
  :host {
    display: block;
    width: 100px;
    height: 100px;
  }

  svg {
    width: 100px;
    height: 100px;
  }

  rect {
    fill: none;
    stroke: ${t=>t.colors.accent100};
    stroke-width: 3px;
    stroke-linecap: round;
    animation: dash 1s linear infinite;
  }

  @keyframes dash {
    to {
      stroke-dashoffset: 0px;
    }
  }
`;var vo=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},nt=class extends f{constructor(){super(...arguments),this.radius=36}render(){return this.svgLoaderTemplate()}svgLoaderTemplate(){let e=this.radius>50?50:this.radius,r=36-e,n=116+r,i=245+r,s=360+r*1.75;return c`
      <svg viewBox="0 0 110 110" width="110" height="110">
        <rect
          x="2"
          y="2"
          width="106"
          height="106"
          rx=${e}
          stroke-dasharray="${n} ${i}"
          stroke-dashoffset=${s}
        />
      </svg>
    `}};nt.styles=[P,Co];vo([u({type:Number})],nt.prototype,"radius",void 0);nt=vo([d("wui-loading-thumbnail")],nt);var $o=y`
  wui-flex {
    width: 100%;
    height: 52px;
    box-sizing: border-box;
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[5]};
    padding-left: ${({spacing:t})=>t[3]};
    padding-right: ${({spacing:t})=>t[3]};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${({spacing:t})=>t[6]};
  }

  wui-text {
    color: ${({tokens:t})=>t.theme.textSecondary};
  }

  wui-icon {
    width: 12px;
    height: 12px;
  }
`;var st=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Ae=class extends f{constructor(){super(...arguments),this.disabled=!1,this.label="",this.buttonLabel=""}render(){return c`
      <wui-flex justifyContent="space-between" alignItems="center">
        <wui-text variant="lg-regular" color="inherit">${this.label}</wui-text>
        <wui-button variant="accent-secondary" size="sm">
          ${this.buttonLabel}
          <wui-icon name="chevronRight" color="inherit" size="inherit" slot="iconRight"></wui-icon>
        </wui-button>
      </wui-flex>
    `}};Ae.styles=[P,z,$o];st([u({type:Boolean})],Ae.prototype,"disabled",void 0);st([u()],Ae.prototype,"label",void 0);st([u()],Ae.prototype,"buttonLabel",void 0);Ae=st([d("wui-cta-button")],Ae);var Eo=y`
  :host {
    display: block;
    padding: 0 ${({spacing:t})=>t[5]} ${({spacing:t})=>t[5]};
  }
`;var Ro=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},lt=class extends f{constructor(){super(...arguments),this.wallet=void 0}render(){if(!this.wallet)return this.style.display="none",null;let{name:e,app_store:o,play_store:r,chrome_store:n,homepage:i}=this.wallet,s=b.isMobile(),l=b.isIos(),a=b.isAndroid(),h=[o,r,i,n].filter(Boolean).length>1,m=Y.getTruncateString({string:e,charsStart:12,charsEnd:0,truncate:"end"});return h&&!s?c`
        <wui-cta-button
          label=${`Don't have ${m}?`}
          buttonLabel="Get"
          @click=${()=>g.push("Downloads",{wallet:this.wallet})}
        ></wui-cta-button>
      `:!h&&i?c`
        <wui-cta-button
          label=${`Don't have ${m}?`}
          buttonLabel="Get"
          @click=${this.onHomePage.bind(this)}
        ></wui-cta-button>
      `:o&&l?c`
        <wui-cta-button
          label=${`Don't have ${m}?`}
          buttonLabel="Get"
          @click=${this.onAppStore.bind(this)}
        ></wui-cta-button>
      `:r&&a?c`
        <wui-cta-button
          label=${`Don't have ${m}?`}
          buttonLabel="Get"
          @click=${this.onPlayStore.bind(this)}
        ></wui-cta-button>
      `:(this.style.display="none",null)}onAppStore(){this.wallet?.app_store&&b.openHref(this.wallet.app_store,"_blank")}onPlayStore(){this.wallet?.play_store&&b.openHref(this.wallet.play_store,"_blank")}onHomePage(){this.wallet?.homepage&&b.openHref(this.wallet.homepage,"_blank")}};lt.styles=[Eo];Ro([u({type:Object})],lt.prototype,"wallet",void 0);lt=Ro([d("w3m-mobile-download-links")],lt);var _o=y`
  @keyframes shake {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(3px);
    }
    50% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
    100% {
      transform: translateX(0);
    }
  }

  wui-flex:first-child:not(:only-child) {
    position: relative;
  }

  wui-wallet-image {
    width: 56px;
    height: 56px;
  }

  wui-loading-thumbnail {
    position: absolute;
  }

  wui-icon-box {
    position: absolute;
    right: calc(${({spacing:t})=>t[1]} * -1);
    bottom: calc(${({spacing:t})=>t[1]} * -1);
    opacity: 0;
    transform: scale(0.5);
    transition-property: opacity, transform;
    transition-duration: ${({durations:t})=>t.lg};
    transition-timing-function: ${({easings:t})=>t["ease-out-power-2"]};
    will-change: opacity, transform;
  }

  wui-text[align='center'] {
    width: 100%;
    padding: 0px ${({spacing:t})=>t[4]};
  }

  [data-error='true'] wui-icon-box {
    opacity: 1;
    transform: scale(1);
  }

  [data-error='true'] > wui-flex:first-child {
    animation: shake 250ms ${({easings:t})=>t["ease-out-power-2"]} both;
  }

  [data-retry='false'] wui-link {
    display: none;
  }

  [data-retry='true'] wui-link {
    display: block;
    opacity: 1;
  }

  w3m-mobile-download-links {
    padding: 0px;
    width: 100%;
  }
`;var X=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},T=class extends f{constructor(){super(),this.wallet=g.state.data?.wallet,this.connector=g.state.data?.connector,this.timeout=void 0,this.secondaryBtnIcon="refresh",this.onConnect=void 0,this.onRender=void 0,this.onAutoConnect=void 0,this.isWalletConnect=!0,this.unsubscribe=[],this.imageSrc=V.getConnectorImage(this.connector)??V.getWalletImage(this.wallet),this.name=this.wallet?.name??this.connector?.name??"Wallet",this.isRetrying=!1,this.uri=w.state.wcUri,this.error=w.state.wcError,this.ready=!1,this.showRetry=!1,this.label=void 0,this.secondaryBtnLabel="Try again",this.secondaryLabel="Accept connection request in the wallet",this.isLoading=!1,this.isMobile=!1,this.onRetry=void 0,this.unsubscribe.push(w.subscribeKey("wcUri",e=>{this.uri=e,this.isRetrying&&this.onRetry&&(this.isRetrying=!1,this.onConnect?.())}),w.subscribeKey("wcError",e=>this.error=e)),(b.isTelegram()||b.isSafari())&&b.isIos()&&w.state.wcUri&&this.onConnect?.()}firstUpdated(){this.onAutoConnect?.(),this.showRetry=!this.onAutoConnect}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),w.setWcError(!1),clearTimeout(this.timeout)}render(){this.onRender?.(),this.onShowRetry();let e=this.error?"Connection can be declined if a previous request is still active":this.secondaryLabel,o="";return this.label?o=this.label:(o=`Continue in ${this.name}`,this.error&&(o="Connection declined")),c`
      <wui-flex
        data-error=${v(this.error)}
        data-retry=${this.showRetry}
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="6"
      >
        <wui-flex gap="2" justifyContent="center" alignItems="center">
          <wui-wallet-image size="lg" imageSrc=${v(this.imageSrc)}></wui-wallet-image>

          ${this.error?null:this.loaderTemplate()}

          <wui-icon-box
            color="error"
            icon="close"
            size="sm"
            border
            borderColor="wui-color-bg-125"
          ></wui-icon-box>
        </wui-flex>

        <wui-flex flexDirection="column" alignItems="center" gap="6"> <wui-flex
          flexDirection="column"
          alignItems="center"
          gap="2"
          .padding=${["2","0","0","0"]}
        >
          <wui-text align="center" variant="lg-medium" color=${this.error?"error":"primary"}>
            ${o}
          </wui-text>
          <wui-text align="center" variant="lg-regular" color="secondary">${e}</wui-text>
        </wui-flex>

        ${this.secondaryBtnLabel?c`
                <wui-button
                  variant="neutral-secondary"
                  size="md"
                  ?disabled=${this.isRetrying||this.isLoading}
                  @click=${this.onTryAgain.bind(this)}
                  data-testid="w3m-connecting-widget-secondary-button"
                >
                  <wui-icon
                    color="inherit"
                    slot="iconLeft"
                    name=${this.secondaryBtnIcon}
                  ></wui-icon>
                  ${this.secondaryBtnLabel}
                </wui-button>
              `:null}
      </wui-flex>

      ${this.isWalletConnect?c`
              <wui-flex .padding=${["0","5","5","5"]} justifyContent="center">
                <wui-link
                  @click=${this.onCopyUri}
                  variant="secondary"
                  icon="copy"
                  data-testid="wui-link-copy"
                >
                  Copy link
                </wui-link>
              </wui-flex>
            `:null}

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links></wui-flex>
      </wui-flex>
    `}onShowRetry(){this.error&&!this.showRetry&&(this.showRetry=!0,this.shadowRoot?.querySelector("wui-button")?.animate([{opacity:0},{opacity:1}],{fill:"forwards",easing:"ease"}))}onTryAgain(){w.setWcError(!1),this.onRetry?(this.isRetrying=!0,this.onRetry?.()):this.onConnect?.()}loaderTemplate(){let e=Ee.state.themeVariables["--w3m-border-radius-master"],o=e?parseInt(e.replace("px",""),10):4;return c`<wui-loading-thumbnail radius=${o*9}></wui-loading-thumbnail>`}onCopyUri(){try{this.uri&&(b.copyToClopboard(this.uri),ne.showSuccess("Link copied"))}catch{ne.showError("Failed to copy")}}};T.styles=_o;X([p()],T.prototype,"isRetrying",void 0);X([p()],T.prototype,"uri",void 0);X([p()],T.prototype,"error",void 0);X([p()],T.prototype,"ready",void 0);X([p()],T.prototype,"showRetry",void 0);X([p()],T.prototype,"label",void 0);X([p()],T.prototype,"secondaryBtnLabel",void 0);X([p()],T.prototype,"secondaryLabel",void 0);X([p()],T.prototype,"isLoading",void 0);X([u({type:Boolean})],T.prototype,"isMobile",void 0);X([u()],T.prototype,"onRetry",void 0);var ni=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},So=class extends T{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-browser: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onAutoConnect=this.onConnectProxy.bind(this),W.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:g.state.view}})}async onConnectProxy(){try{this.error=!1;let{connectors:e}=U.state,o=e.find(r=>r.type==="ANNOUNCED"&&r.info?.rdns===this.wallet?.rdns||r.type==="INJECTED"||r.name===this.wallet?.name);if(o)await w.connectExternal(o,o.chain);else throw new Error("w3m-connecting-wc-browser: No connector found");ot.close()}catch(e){e instanceof tt&&e.originalName===Ze.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?W.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:e.message}}):W.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:e?.message??"Unknown"}}),this.error=!0}}};So=ni([d("w3m-connecting-wc-browser")],So);var si=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Ao=class extends T{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-desktop: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onRender=this.onRenderProxy.bind(this),W.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"desktop",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:g.state.view}})}onRenderProxy(){!this.ready&&this.uri&&(this.ready=!0,this.onConnect?.())}onConnectProxy(){if(this.wallet?.desktop_link&&this.uri)try{this.error=!1;let{desktop_link:e,name:o}=this.wallet,{redirect:r,href:n}=b.formatNativeUrl(e,this.uri);w.setWcLinking({name:o,href:n}),w.setRecentWallet(this.wallet),b.openHref(r,"_blank")}catch{this.error=!0}}};Ao=si([d("w3m-connecting-wc-desktop")],Ao);var Te=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},me=class extends T{constructor(){if(super(),this.btnLabelTimeout=void 0,this.redirectDeeplink=void 0,this.redirectUniversalLink=void 0,this.target=void 0,this.preferUniversalLinks=B.state.experimental_preferUniversalLinks,this.isLoading=!0,this.onConnect=()=>{uo.onConnectMobile(this.wallet)},!this.wallet)throw new Error("w3m-connecting-wc-mobile: No wallet provided");this.secondaryBtnLabel="Open",this.secondaryLabel=et.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.onHandleURI(),this.unsubscribe.push(w.subscribeKey("wcUri",()=>{this.onHandleURI()})),W.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"mobile",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:g.state.view}})}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.btnLabelTimeout)}onHandleURI(){this.isLoading=!this.uri,!this.ready&&this.uri&&(this.ready=!0,this.onConnect?.())}onTryAgain(){w.setWcError(!1),this.onConnect?.()}};Te([p()],me.prototype,"redirectDeeplink",void 0);Te([p()],me.prototype,"redirectUniversalLink",void 0);Te([p()],me.prototype,"target",void 0);Te([p()],me.prototype,"preferUniversalLinks",void 0);Te([p()],me.prototype,"isLoading",void 0);me=Te([d("w3m-connecting-wc-mobile")],me);var Lr=oi(Ir(),1);var tn=.1,Wr=2.5,re=7;function oo(t,e,o){return t===e?!1:(t-e<0?e-t:t-e)<=o+tn}function on(t,e){let o=Array.prototype.slice.call(Lr.default.create(t,{errorCorrectionLevel:e}).modules.data,0),r=Math.sqrt(o.length);return o.reduce((n,i,s)=>(s%r===0?n.push([i]):n[n.length-1].push(i))&&n,[])}var Pr={generate({uri:t,size:e,logoSize:o,padding:r=8,dotColor:n="var(--apkt-colors-black)"}){let s=[],l=on(t,"Q"),a=(e-2*r)/l.length,h=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];h.forEach(({x:R,y:C})=>{let O=(l.length-re)*a*R+r,_=(l.length-re)*a*C+r,M=.45;for(let L=0;L<h.length;L+=1){let k=a*(re-L*2);s.push(Re`
            <rect
              fill=${L===2?"var(--apkt-colors-black)":"var(--apkt-colors-white)"}
              width=${L===0?k-10:k}
              rx= ${L===0?(k-10)*M:k*M}
              ry= ${L===0?(k-10)*M:k*M}
              stroke=${n}
              stroke-width=${L===0?10:0}
              height=${L===0?k-10:k}
              x= ${L===0?_+a*L+10/2:_+a*L}
              y= ${L===0?O+a*L+10/2:O+a*L}
            />
          `)}});let m=Math.floor((o+25)/a),I=l.length/2-m/2,x=l.length/2+m/2-1,j=[];l.forEach((R,C)=>{R.forEach((O,_)=>{if(l[C][_]&&!(C<re&&_<re||C>l.length-(re+1)&&_<re||C<re&&_>l.length-(re+1))&&!(C>I&&C<x&&_>I&&_<x)){let M=C*a+a/2+r,L=_*a+a/2+r;j.push([M,L])}})});let D={};return j.forEach(([R,C])=>{D[R]?D[R]?.push(C):D[R]=[C]}),Object.entries(D).map(([R,C])=>{let O=C.filter(_=>C.every(M=>!oo(_,M,a)));return[Number(R),O]}).forEach(([R,C])=>{C.forEach(O=>{s.push(Re`<circle cx=${R} cy=${O} fill=${n} r=${a/Wr} />`)})}),Object.entries(D).filter(([R,C])=>C.length>1).map(([R,C])=>{let O=C.filter(_=>C.some(M=>oo(_,M,a)));return[Number(R),O]}).map(([R,C])=>{C.sort((_,M)=>_<M?-1:1);let O=[];for(let _ of C){let M=O.find(L=>L.some(k=>oo(_,k,a)));M?M.push(_):O.push([_])}return[R,O.map(_=>[_[0],_[_.length-1]])]}).forEach(([R,C])=>{C.forEach(([O,_])=>{s.push(Re`
              <line
                x1=${R}
                x2=${R}
                y1=${O}
                y2=${_}
                stroke=${n}
                stroke-width=${a/(Wr/2)}
                stroke-linecap="round"
              />
            `)})}),s}};var Br=y`
  :host {
    position: relative;
    user-select: none;
    display: block;
    overflow: hidden;
    aspect-ratio: 1 / 1;
    width: 100%;
    height: 100%;
    background-color: ${({colors:t})=>t.white};
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
  }

  :host {
    border-radius: ${({borderRadius:t})=>t[4]};
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :host([data-clear='true']) > wui-icon {
    display: none;
  }

  svg:first-child,
  wui-image,
  wui-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translateY(-50%) translateX(-50%);
    background-color: ${({tokens:t})=>t.theme.backgroundPrimary};
    box-shadow: inset 0 0 0 4px ${({tokens:t})=>t.theme.backgroundPrimary};
    border-radius: ${({borderRadius:t})=>t[6]};
  }

  wui-image {
    width: 25%;
    height: 25%;
    border-radius: ${({borderRadius:t})=>t[2]};
  }

  wui-icon {
    width: 100%;
    height: 100%;
    color: #3396ff !important;
    transform: translateY(-50%) translateX(-50%) scale(0.25);
  }

  wui-icon > svg {
    width: inherit;
    height: inherit;
  }
`;var de=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Z=class extends f{constructor(){super(...arguments),this.uri="",this.size=500,this.theme="dark",this.imageSrc=void 0,this.alt=void 0,this.arenaClear=void 0,this.farcaster=void 0}render(){return this.dataset.theme=this.theme,this.dataset.clear=String(this.arenaClear),c`<wui-flex
      alignItems="center"
      justifyContent="center"
      class="wui-qr-code"
      direction="column"
      gap="4"
      width="100%"
      style="height: 100%"
    >
      ${this.templateVisual()} ${this.templateSvg()}
    </wui-flex>`}templateSvg(){return Re`
      <svg viewBox="0 0 ${this.size} ${this.size}" width="100%" height="100%">
        ${Pr.generate({uri:this.uri,size:this.size,logoSize:this.arenaClear?0:this.size/4})}
      </svg>
    `}templateVisual(){return this.imageSrc?c`<wui-image src=${this.imageSrc} alt=${this.alt??"logo"}></wui-image>`:this.farcaster?c`<wui-icon
        class="farcaster"
        size="inherit"
        color="inherit"
        name="farcaster"
      ></wui-icon>`:c`<wui-icon size="inherit" color="inherit" name="walletConnect"></wui-icon>`}};Z.styles=[P,Br];de([u()],Z.prototype,"uri",void 0);de([u({type:Number})],Z.prototype,"size",void 0);de([u()],Z.prototype,"theme",void 0);de([u()],Z.prototype,"imageSrc",void 0);de([u()],Z.prototype,"alt",void 0);de([u({type:Boolean})],Z.prototype,"arenaClear",void 0);de([u({type:Boolean})],Z.prototype,"farcaster",void 0);Z=de([d("wui-qr-code")],Z);var kr=y`
  wui-shimmer {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: ${({borderRadius:t})=>t[4]};
  }

  wui-qr-code {
    opacity: 0;
    animation-duration: ${({durations:t})=>t.xl};
    animation-timing-function: ${({easings:t})=>t["ease-out-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;var Nr=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},yt=class extends T{constructor(){super(),this.basic=!1}firstUpdated(){this.basic||W.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet?.name??"WalletConnect",platform:"qrcode",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:g.state.view}})}disconnectedCallback(){super.disconnectedCallback(),this.unsubscribe?.forEach(e=>e())}render(){return this.onRenderProxy(),c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["0","5","5","5"]}
        gap="5"
      >
        <wui-shimmer width="100%"> ${this.qrCodeTemplate()} </wui-shimmer>
        <wui-text variant="lg-medium" color="primary"> Scan this QR Code with your phone </wui-text>
        ${this.copyTemplate()}
      </wui-flex>
      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}onRenderProxy(){!this.ready&&this.uri&&(this.ready=!0)}qrCodeTemplate(){if(!this.uri||!this.ready)return null;let e=this.wallet?this.wallet.name:void 0;w.setWcLinking(void 0),w.setRecentWallet(this.wallet);let o=Ee.state.themeVariables["--apkt-qr-color"]??Ee.state.themeVariables["--w3m-qr-color"];return c` <wui-qr-code
      theme=${Ee.state.themeMode}
      uri=${this.uri}
      imageSrc=${v(V.getWalletImage(this.wallet))}
      color=${v(o)}
      alt=${v(e)}
      data-testid="wui-qr-code"
    ></wui-qr-code>`}copyTemplate(){let e=!this.uri||!this.ready;return c`<wui-button
      .disabled=${e}
      @click=${this.onCopyUri}
      variant="neutral-secondary"
      size="sm"
      data-testid="copy-wc2-uri"
    >
      Copy link
      <wui-icon size="sm" color="inherit" name="copy" slot="iconRight"></wui-icon>
    </wui-button>`}};yt.styles=kr;Nr([u({type:Boolean})],yt.prototype,"basic",void 0);yt=Nr([d("w3m-connecting-wc-qrcode")],yt);var rn=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Or=class extends f{constructor(){if(super(),this.wallet=g.state.data?.wallet,!this.wallet)throw new Error("w3m-connecting-wc-unsupported: No wallet provided");W.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:g.state.view}})}render(){return c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="5"
      >
        <wui-wallet-image
          size="lg"
          imageSrc=${v(V.getWalletImage(this.wallet))}
        ></wui-wallet-image>

        <wui-text variant="md-regular" color="primary">Not Detected</wui-text>
      </wui-flex>

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}};Or=rn([d("w3m-connecting-wc-unsupported")],Or);var Mr=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},ro=class extends T{constructor(){if(super(),this.isLoading=!0,!this.wallet)throw new Error("w3m-connecting-wc-web: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.secondaryBtnLabel="Open",this.secondaryLabel=et.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.updateLoadingState(),this.unsubscribe.push(w.subscribeKey("wcUri",()=>{this.updateLoadingState()})),W.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"web",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:g.state.view}})}updateLoadingState(){this.isLoading=!this.uri}onConnectProxy(){if(this.wallet?.webapp_link&&this.uri)try{this.error=!1;let{webapp_link:e,name:o}=this.wallet,{redirect:r,href:n}=b.formatUniversalUrl(e,this.uri);w.setWcLinking({name:o,href:n}),w.setRecentWallet(this.wallet),b.openHref(r,"_blank")}catch{this.error=!0}}};Mr([p()],ro.prototype,"isLoading",void 0);ro=Mr([d("w3m-connecting-wc-web")],ro);var Dr=y`
  :host([data-mobile-fullscreen='true']) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :host([data-mobile-fullscreen='true']) wui-ux-by-reown {
    margin-top: auto;
  }
`;var xe=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},ie=class extends f{constructor(){super(),this.wallet=g.state.data?.wallet,this.unsubscribe=[],this.platform=void 0,this.platforms=[],this.isSiwxEnabled=!!B.state.siwx,this.remoteFeatures=B.state.remoteFeatures,this.displayBranding=!0,this.basic=!1,this.determinePlatforms(),this.initializeConnection(),this.unsubscribe.push(B.subscribeKey("remoteFeatures",e=>this.remoteFeatures=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){return B.state.enableMobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),c`
      ${this.headerTemplate()}
      <div class="platform-container">${this.platformTemplate()}</div>
      ${this.reownBrandingTemplate()}
    `}reownBrandingTemplate(){return!this.remoteFeatures?.reownBranding||!this.displayBranding?null:c`<wui-ux-by-reown></wui-ux-by-reown>`}async initializeConnection(e=!1){if(!(this.platform==="browser"||B.state.manualWCControl&&!e))try{let{wcPairingExpiry:o,status:r}=w.state,{redirectView:n}=g.state.data??{};if(e||B.state.enableEmbedded||b.isPairingExpired(o)||r==="connecting"){let i=w.getConnections(J.state.activeChain),s=this.remoteFeatures?.multiWallet,l=i.length>0;await w.connectWalletConnect({cache:"never"}),this.isSiwxEnabled||(l&&s?(g.replace("ProfileWallets"),ne.showSuccess("New Wallet Added")):n?g.replace(n):ot.close())}}catch(o){if(o instanceof Error&&o.message.includes("An error occurred when attempting to switch chain")&&!B.state.enableNetworkSwitch&&J.state.activeChain){J.setActiveCaipNetwork(fo.getUnsupportedNetwork(`${J.state.activeChain}:${J.state.activeCaipNetwork?.id}`)),J.showUnsupportedChainUI();return}o instanceof tt&&o.originalName===Ze.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?W.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:o.message}}):W.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:o?.message??"Unknown"}}),w.setWcError(!0),ne.showError(o.message??"Connection error"),w.resetWcConnection(),g.goBack()}}determinePlatforms(){if(!this.wallet){this.platforms.push("qrcode"),this.platform="qrcode";return}if(this.platform)return;let{mobile_link:e,desktop_link:o,webapp_link:r,injected:n,rdns:i}=this.wallet,s=n?.map(({injected_id:D})=>D).filter(Boolean),l=[...i?[i]:s??[]],a=B.state.isUniversalProvider?!1:l.length,h=e,m=r,I=w.checkInstalled(l),x=a&&I,j=o&&!b.isMobile();x&&!J.state.noAdapters&&this.platforms.push("browser"),h&&this.platforms.push(b.isMobile()?"mobile":"qrcode"),m&&this.platforms.push("web"),j&&this.platforms.push("desktop"),!x&&a&&!J.state.noAdapters&&this.platforms.push("unsupported"),this.platform=this.platforms[0]}platformTemplate(){switch(this.platform){case"browser":return c`<w3m-connecting-wc-browser></w3m-connecting-wc-browser>`;case"web":return c`<w3m-connecting-wc-web></w3m-connecting-wc-web>`;case"desktop":return c`
          <w3m-connecting-wc-desktop .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-desktop>
        `;case"mobile":return c`
          <w3m-connecting-wc-mobile isMobile .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-mobile>
        `;case"qrcode":return c`<w3m-connecting-wc-qrcode ?basic=${this.basic}></w3m-connecting-wc-qrcode>`;default:return c`<w3m-connecting-wc-unsupported></w3m-connecting-wc-unsupported>`}}headerTemplate(){return this.platforms.length>1?c`
      <w3m-connecting-header
        .platforms=${this.platforms}
        .onSelectPlatfrom=${this.onSelectPlatform.bind(this)}
      >
      </w3m-connecting-header>
    `:null}async onSelectPlatform(e){let o=this.shadowRoot?.querySelector("div");o&&(await o.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.platform=e,o.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}};ie.styles=Dr;xe([p()],ie.prototype,"platform",void 0);xe([p()],ie.prototype,"platforms",void 0);xe([p()],ie.prototype,"isSiwxEnabled",void 0);xe([p()],ie.prototype,"remoteFeatures",void 0);xe([u({type:Boolean})],ie.prototype,"displayBranding",void 0);xe([u({type:Boolean})],ie.prototype,"basic",void 0);ie=xe([d("w3m-connecting-wc-view")],ie);var io=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},xt=class extends f{constructor(){super(),this.unsubscribe=[],this.isMobile=b.isMobile(),this.remoteFeatures=B.state.remoteFeatures,this.unsubscribe.push(B.subscribeKey("remoteFeatures",e=>this.remoteFeatures=e))}disconnectedCallback(){this.unsubscribe.forEach(e=>e())}render(){if(this.isMobile){let{featured:e,recommended:o}=S.state,{customWallets:r}=B.state,n=ao.getRecentWallets(),i=e.length||o.length||r?.length||n.length;return c`<wui-flex flexDirection="column" gap="2" .margin=${["1","3","3","3"]}>
        ${i?c`<w3m-connector-list></w3m-connector-list>`:null}
        <w3m-all-wallets-widget></w3m-all-wallets-widget>
      </wui-flex>`}return c`<wui-flex flexDirection="column" .padding=${["0","0","4","0"]}>
        <w3m-connecting-wc-view ?basic=${!0} .displayBranding=${!1}></w3m-connecting-wc-view>
        <wui-flex flexDirection="column" .padding=${["0","3","0","3"]}>
          <w3m-all-wallets-widget></w3m-all-wallets-widget>
        </wui-flex>
      </wui-flex>
      ${this.reownBrandingTemplate()} `}reownBrandingTemplate(){return this.remoteFeatures?.reownBranding?c` <wui-flex flexDirection="column" .padding=${["1","0","1","0"]}>
      <wui-ux-by-reown></wui-ux-by-reown>
    </wui-flex>`:null}};io([p()],xt.prototype,"isMobile",void 0);io([p()],xt.prototype,"remoteFeatures",void 0);xt=io([d("w3m-connecting-wc-basic-view")],xt);var{I:Sc}=po;var Ur=t=>t.strings===void 0;var Je=(t,e)=>{let o=t._$AN;if(o===void 0)return!1;for(let r of o)r._$AO?.(e,!1),Je(r,e);return!0},Ct=t=>{let e,o;do{if((e=t._$AM)===void 0)break;o=e._$AN,o.delete(t),t=e}while(o?.size===0)},jr=t=>{for(let e;e=t._$AM;t=e){let o=e._$AN;if(o===void 0)e._$AN=o=new Set;else if(o.has(t))break;o.add(t),ln(e)}};function nn(t){this._$AN!==void 0?(Ct(this),this._$AM=t,jr(this)):this._$AM=t}function sn(t,e=!1,o=0){let r=this._$AH,n=this._$AN;if(n!==void 0&&n.size!==0)if(e)if(Array.isArray(r))for(let i=o;i<r.length;i++)Je(r[i],!1),Ct(r[i]);else r!=null&&(Je(r,!1),Ct(r));else Je(this,t)}var ln=t=>{t.type==mo.CHILD&&(t._$AP??(t._$AP=sn),t._$AQ??(t._$AQ=nn))},vt=class extends go{constructor(){super(...arguments),this._$AN=void 0}_$AT(e,o,r){super._$AT(e,o,r),jr(this),this.isConnected=e._$AU}_$AO(e,o=!0){e!==this.isConnected&&(this.isConnected=e,e?this.reconnected?.():this.disconnected?.()),o&&(Je(this,e),Ct(this))}setValue(e){if(Ur(this._$Ct))this._$Ct._$AI(e,this);else{let o=[...this._$Ct._$AH];o[this._$Ci]=e,this._$Ct._$AI(o,this,0)}}disconnected(){}reconnected(){}};var ke=()=>new so,so=class{},no=new WeakMap,Ne=Wt(class extends vt{render(t){return It}update(t,[e]){let o=e!==this.G;return o&&this.rt(void 0),(o||this.lt!==this.ct)&&(this.G=e,this.ht=t.options?.host,this.rt(this.ct=t.element)),It}rt(t){if(this.G!==void 0)if(this.isConnected||(t=void 0),typeof this.G=="function"){let e=this.ht??globalThis,o=no.get(e);o===void 0&&(o=new WeakMap,no.set(e,o)),o.get(this.G)!==void 0&&this.G.call(this.ht,void 0),o.set(this.G,t),t!==void 0&&this.G.call(this.ht,t)}else this.G.value=t}get lt(){return typeof this.G=="function"?no.get(this.ht??globalThis)?.get(this.G):this.G?.value}disconnected(){this.lt===this.ct&&this.rt(void 0)}reconnected(){this.rt(this.ct)}});var zr=y`
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  label {
    position: relative;
    display: inline-block;
    user-select: none;
    transition:
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      border ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      box-shadow ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      width ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      height ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      transform ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      opacity ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  input {
    width: 0;
    height: 0;
    opacity: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${({colors:t})=>t.neutrals300};
    border-radius: ${({borderRadius:t})=>t.round};
    border: 1px solid transparent;
    will-change: border;
    transition:
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      border ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      box-shadow ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      width ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      height ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]},
      transform ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-2"]},
      opacity ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  span:before {
    content: '';
    position: absolute;
    background-color: ${({colors:t})=>t.white};
    border-radius: 50%;
  }

  /* -- Sizes --------------------------------------------------------- */
  label[data-size='lg'] {
    width: 48px;
    height: 32px;
  }

  label[data-size='md'] {
    width: 40px;
    height: 28px;
  }

  label[data-size='sm'] {
    width: 32px;
    height: 22px;
  }

  label[data-size='lg'] > span:before {
    height: 24px;
    width: 24px;
    left: 4px;
    top: 3px;
  }

  label[data-size='md'] > span:before {
    height: 20px;
    width: 20px;
    left: 4px;
    top: 3px;
  }

  label[data-size='sm'] > span:before {
    height: 16px;
    width: 16px;
    left: 3px;
    top: 2px;
  }

  /* -- Focus states --------------------------------------------------- */
  input:focus-visible:not(:checked) + span,
  input:focus:not(:checked) + span {
    border: 1px solid ${({tokens:t})=>t.core.iconAccentPrimary};
    background-color: ${({tokens:t})=>t.theme.textTertiary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  input:focus-visible:checked + span,
  input:focus:checked + span {
    border: 1px solid ${({tokens:t})=>t.core.iconAccentPrimary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  /* -- Checked states --------------------------------------------------- */
  input:checked + span {
    background-color: ${({tokens:t})=>t.core.iconAccentPrimary};
  }

  label[data-size='lg'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='md'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='sm'] > input:checked + span:before {
    transform: translateX(calc(100% - 7px));
  }

  /* -- Hover states ------------------------------------------------------- */
  label:hover > input:not(:checked):not(:disabled) + span {
    background-color: ${({colors:t})=>t.neutrals400};
  }

  label:hover > input:checked:not(:disabled) + span {
    background-color: ${({colors:t})=>t.accent080};
  }

  /* -- Disabled state --------------------------------------------------- */
  label:has(input:disabled) {
    pointer-events: none;
    user-select: none;
  }

  input:not(:checked):disabled + span {
    background-color: ${({colors:t})=>t.neutrals700};
  }

  input:checked:disabled + span {
    background-color: ${({colors:t})=>t.neutrals700};
  }

  input:not(:checked):disabled + span::before {
    background-color: ${({colors:t})=>t.neutrals400};
  }

  input:checked:disabled + span::before {
    background-color: ${({tokens:t})=>t.theme.textTertiary};
  }
`;var $t=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Oe=class extends f{constructor(){super(...arguments),this.inputElementRef=ke(),this.checked=!1,this.disabled=!1,this.size="md"}render(){return c`
      <label data-size=${this.size}>
        <input
          ${Ne(this.inputElementRef)}
          type="checkbox"
          ?checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.dispatchChangeEvent.bind(this)}
        />
        <span></span>
      </label>
    `}dispatchChangeEvent(){this.dispatchEvent(new CustomEvent("switchChange",{detail:this.inputElementRef.value?.checked,bubbles:!0,composed:!0}))}};Oe.styles=[P,z,zr];$t([u({type:Boolean})],Oe.prototype,"checked",void 0);$t([u({type:Boolean})],Oe.prototype,"disabled",void 0);$t([u()],Oe.prototype,"size",void 0);Oe=$t([d("wui-toggle")],Oe);var qr=y`
  :host {
    height: auto;
  }

  :host > wui-flex {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    column-gap: ${({spacing:t})=>t[2]};
    padding: ${({spacing:t})=>t[2]} ${({spacing:t})=>t[3]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[4]};
    box-shadow: inset 0 0 0 1px ${({tokens:t})=>t.theme.foregroundPrimary};
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
    will-change: background-color;
    cursor: pointer;
  }

  wui-switch {
    pointer-events: none;
  }
`;var Fr=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Et=class extends f{constructor(){super(...arguments),this.checked=!1}render(){return c`
      <wui-flex>
        <wui-icon size="xl" name="walletConnectBrown"></wui-icon>
        <wui-toggle
          ?checked=${this.checked}
          size="sm"
          @switchChange=${this.handleToggleChange.bind(this)}
        ></wui-toggle>
      </wui-flex>
    `}handleToggleChange(e){e.stopPropagation(),this.checked=e.detail,this.dispatchSwitchEvent()}dispatchSwitchEvent(){this.dispatchEvent(new CustomEvent("certifiedSwitchChange",{detail:this.checked,bubbles:!0,composed:!0}))}};Et.styles=[P,z,qr];Fr([u({type:Boolean})],Et.prototype,"checked",void 0);Et=Fr([d("wui-certified-switch")],Et);var Vr=y`
  :host {
    position: relative;
    width: 100%;
    display: inline-flex;
    flex-direction: column;
    gap: ${({spacing:t})=>t[3]};
    color: ${({tokens:t})=>t.theme.textPrimary};
    caret-color: ${({tokens:t})=>t.core.textAccentPrimary};
  }

  .wui-input-text-container {
    position: relative;
    display: flex;
  }

  input {
    width: 100%;
    border-radius: ${({borderRadius:t})=>t[4]};
    color: inherit;
    background: transparent;
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
    caret-color: ${({tokens:t})=>t.core.textAccentPrimary};
    padding: ${({spacing:t})=>t[3]} ${({spacing:t})=>t[3]}
      ${({spacing:t})=>t[3]} ${({spacing:t})=>t[10]};
    font-size: ${({textSize:t})=>t.large};
    line-height: ${({typography:t})=>t["lg-regular"].lineHeight};
    letter-spacing: ${({typography:t})=>t["lg-regular"].letterSpacing};
    font-weight: ${({fontWeight:t})=>t.regular};
    font-family: ${({fontFamily:t})=>t.regular};
  }

  input[data-size='lg'] {
    padding: ${({spacing:t})=>t[4]} ${({spacing:t})=>t[3]}
      ${({spacing:t})=>t[4]} ${({spacing:t})=>t[10]};
  }

  @media (hover: hover) and (pointer: fine) {
    input:hover:enabled {
      border: 1px solid ${({tokens:t})=>t.theme.borderSecondary};
    }
  }

  input:disabled {
    cursor: unset;
    border: 1px solid ${({tokens:t})=>t.theme.borderPrimary};
  }

  input::placeholder {
    color: ${({tokens:t})=>t.theme.textSecondary};
  }

  input:focus:enabled {
    border: 1px solid ${({tokens:t})=>t.theme.borderSecondary};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    -webkit-box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
    -moz-box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
    box-shadow: 0px 0px 0px 4px ${({tokens:t})=>t.core.foregroundAccent040};
  }

  div.wui-input-text-container:has(input:disabled) {
    opacity: 0.5;
  }

  wui-icon.wui-input-text-left-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    left: ${({spacing:t})=>t[4]};
    color: ${({tokens:t})=>t.theme.iconDefault};
  }

  button.wui-input-text-submit-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:t})=>t[3]};
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: ${({borderRadius:t})=>t[2]};
    color: ${({tokens:t})=>t.core.textAccentPrimary};
  }

  button.wui-input-text-submit-button:disabled {
    opacity: 1;
  }

  button.wui-input-text-submit-button.loading wui-icon {
    animation: spin 1s linear infinite;
  }

  button.wui-input-text-submit-button:hover {
    background: ${({tokens:t})=>t.core.foregroundAccent010};
  }

  input:has(+ .wui-input-text-submit-button) {
    padding-right: ${({spacing:t})=>t[12]};
  }

  input[type='number'] {
    -moz-appearance: textfield;
  }

  input[type='search']::-webkit-search-decoration,
  input[type='search']::-webkit-search-cancel-button,
  input[type='search']::-webkit-search-results-button,
  input[type='search']::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }

  /* -- Keyframes --------------------------------------------------- */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;var K=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},q=class extends f{constructor(){super(...arguments),this.inputElementRef=ke(),this.disabled=!1,this.loading=!1,this.placeholder="",this.type="text",this.value="",this.size="md"}render(){return c` <div class="wui-input-text-container">
        ${this.templateLeftIcon()}
        <input
          data-size=${this.size}
          ${Ne(this.inputElementRef)}
          data-testid="wui-input-text"
          type=${this.type}
          enterkeyhint=${v(this.enterKeyHint)}
          ?disabled=${this.disabled}
          placeholder=${this.placeholder}
          @input=${this.dispatchInputChangeEvent.bind(this)}
          @keydown=${this.onKeyDown}
          .value=${this.value||""}
        />
        ${this.templateSubmitButton()}
        <slot class="wui-input-text-slot"></slot>
      </div>
      ${this.templateError()} ${this.templateWarning()}`}templateLeftIcon(){return this.icon?c`<wui-icon
        class="wui-input-text-left-icon"
        size="md"
        data-size=${this.size}
        color="inherit"
        name=${this.icon}
      ></wui-icon>`:null}templateSubmitButton(){return this.onSubmit?c`<button
        class="wui-input-text-submit-button ${this.loading?"loading":""}"
        @click=${this.onSubmit?.bind(this)}
        ?disabled=${this.disabled||this.loading}
      >
        ${this.loading?c`<wui-icon name="spinner" size="md"></wui-icon>`:c`<wui-icon name="chevronRight" size="md"></wui-icon>`}
      </button>`:null}templateError(){return this.errorText?c`<wui-text variant="sm-regular" color="error">${this.errorText}</wui-text>`:null}templateWarning(){return this.warningText?c`<wui-text variant="sm-regular" color="warning">${this.warningText}</wui-text>`:null}dispatchInputChangeEvent(){this.dispatchEvent(new CustomEvent("inputChange",{detail:this.inputElementRef.value?.value,bubbles:!0,composed:!0}))}};q.styles=[P,z,Vr];K([u()],q.prototype,"icon",void 0);K([u({type:Boolean})],q.prototype,"disabled",void 0);K([u({type:Boolean})],q.prototype,"loading",void 0);K([u()],q.prototype,"placeholder",void 0);K([u()],q.prototype,"type",void 0);K([u()],q.prototype,"value",void 0);K([u()],q.prototype,"errorText",void 0);K([u()],q.prototype,"warningText",void 0);K([u()],q.prototype,"onSubmit",void 0);K([u()],q.prototype,"size",void 0);K([u({attribute:!1})],q.prototype,"onKeyDown",void 0);q=K([d("wui-input-text")],q);var Hr=y`
  :host {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  wui-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:t})=>t[3]};
    color: ${({tokens:t})=>t.theme.iconDefault};
    cursor: pointer;
    padding: ${({spacing:t})=>t[2]};
    background-color: transparent;
    border-radius: ${({borderRadius:t})=>t[4]};
    transition: background-color ${({durations:t})=>t.lg}
      ${({easings:t})=>t["ease-out-power-2"]};
  }

  @media (hover: hover) {
    wui-icon:hover {
      background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    }
  }
`;var Kr=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Rt=class extends f{constructor(){super(...arguments),this.inputComponentRef=ke(),this.inputValue=""}render(){return c`
      <wui-input-text
        ${Ne(this.inputComponentRef)}
        placeholder="Search wallet"
        icon="search"
        type="search"
        enterKeyHint="search"
        size="sm"
        @inputChange=${this.onInputChange}
      >
        ${this.inputValue?c`<wui-icon
              @click=${this.clearValue}
              color="inherit"
              size="sm"
              name="close"
            ></wui-icon>`:null}
      </wui-input-text>
    `}onInputChange(e){this.inputValue=e.detail||""}clearValue(){let o=this.inputComponentRef.value?.inputElementRef.value;o&&(o.value="",this.inputValue="",o.focus(),o.dispatchEvent(new Event("input")))}};Rt.styles=[P,Hr];Kr([u()],Rt.prototype,"inputValue",void 0);Rt=Kr([d("wui-search-bar")],Rt);var Gr=y`
  :host {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 104px;
    width: 104px;
    row-gap: ${({spacing:t})=>t[2]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: ${({borderRadius:t})=>t[5]};
    position: relative;
  }

  wui-shimmer[data-type='network'] {
    border: none;
    -webkit-clip-path: var(--apkt-path-network);
    clip-path: var(--apkt-path-network);
  }

  svg {
    position: absolute;
    width: 48px;
    height: 54px;
    z-index: 1;
  }

  svg > path {
    stroke: ${({tokens:t})=>t.theme.foregroundSecondary};
    stroke-width: 1px;
  }

  @media (max-width: 350px) {
    :host {
      width: 100%;
    }
  }
`;var Qr=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},_t=class extends f{constructor(){super(...arguments),this.type="wallet"}render(){return c`
      ${this.shimmerTemplate()}
      <wui-shimmer width="80px" height="20px"></wui-shimmer>
    `}shimmerTemplate(){return this.type==="network"?c` <wui-shimmer data-type=${this.type} width="48px" height="54px"></wui-shimmer>
        ${wo}`:c`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}};_t.styles=[P,z,Gr];Qr([u()],_t.prototype,"type",void 0);_t=Qr([d("wui-card-select-loader")],_t);var Jr=rt`
  :host {
    display: grid;
    width: inherit;
    height: inherit;
  }
`;var G=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},F=class extends f{render(){return this.style.cssText=`
      grid-template-rows: ${this.gridTemplateRows};
      grid-template-columns: ${this.gridTemplateColumns};
      justify-items: ${this.justifyItems};
      align-items: ${this.alignItems};
      justify-content: ${this.justifyContent};
      align-content: ${this.alignContent};
      column-gap: ${this.columnGap&&`var(--apkt-spacing-${this.columnGap})`};
      row-gap: ${this.rowGap&&`var(--apkt-spacing-${this.rowGap})`};
      gap: ${this.gap&&`var(--apkt-spacing-${this.gap})`};
      padding-top: ${this.padding&&Y.getSpacingStyles(this.padding,0)};
      padding-right: ${this.padding&&Y.getSpacingStyles(this.padding,1)};
      padding-bottom: ${this.padding&&Y.getSpacingStyles(this.padding,2)};
      padding-left: ${this.padding&&Y.getSpacingStyles(this.padding,3)};
      margin-top: ${this.margin&&Y.getSpacingStyles(this.margin,0)};
      margin-right: ${this.margin&&Y.getSpacingStyles(this.margin,1)};
      margin-bottom: ${this.margin&&Y.getSpacingStyles(this.margin,2)};
      margin-left: ${this.margin&&Y.getSpacingStyles(this.margin,3)};
    `,c`<slot></slot>`}};F.styles=[P,Jr];G([u()],F.prototype,"gridTemplateRows",void 0);G([u()],F.prototype,"gridTemplateColumns",void 0);G([u()],F.prototype,"justifyItems",void 0);G([u()],F.prototype,"alignItems",void 0);G([u()],F.prototype,"justifyContent",void 0);G([u()],F.prototype,"alignContent",void 0);G([u()],F.prototype,"columnGap",void 0);G([u()],F.prototype,"rowGap",void 0);G([u()],F.prototype,"gap",void 0);G([u()],F.prototype,"padding",void 0);G([u()],F.prototype,"margin",void 0);F=G([d("wui-grid")],F);var Yr=y`
  button {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    width: 104px;
    row-gap: ${({spacing:t})=>t[2]};
    padding: ${({spacing:t})=>t[3]} ${({spacing:t})=>t[0]};
    background-color: ${({tokens:t})=>t.theme.foregroundPrimary};
    border-radius: clamp(0px, ${({borderRadius:t})=>t[4]}, 20px);
    transition:
      color ${({durations:t})=>t.lg} ${({easings:t})=>t["ease-out-power-1"]},
      background-color ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-1"]},
      border-radius ${({durations:t})=>t.lg}
        ${({easings:t})=>t["ease-out-power-1"]};
    will-change: background-color, color, border-radius;
    outline: none;
    border: none;
  }

  button > wui-flex > wui-text {
    color: ${({tokens:t})=>t.theme.textPrimary};
    max-width: 86px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    justify-content: center;
  }

  button > wui-flex > wui-text.certified {
    max-width: 66px;
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled {
      background-color: ${({tokens:t})=>t.theme.foregroundSecondary};
    }
  }

  button:disabled > wui-flex > wui-text {
    color: ${({tokens:t})=>t.core.glass010};
  }

  [data-selected='true'] {
    background-color: ${({colors:t})=>t.accent020};
  }

  @media (hover: hover) and (pointer: fine) {
    [data-selected='true']:hover:enabled {
      background-color: ${({colors:t})=>t.accent010};
    }
  }

  [data-selected='true']:active:enabled {
    background-color: ${({colors:t})=>t.accent010};
  }

  @media (max-width: 350px) {
    button {
      width: 100%;
    }
  }
`;var ee=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Q=class extends f{constructor(){super(),this.observer=new IntersectionObserver(()=>{}),this.visible=!1,this.imageSrc=void 0,this.imageLoading=!1,this.isImpressed=!1,this.explorerId="",this.walletQuery="",this.certified=!1,this.displayIndex=0,this.wallet=void 0,this.observer=new IntersectionObserver(e=>{e.forEach(o=>{o.isIntersecting?(this.visible=!0,this.fetchImageSrc(),this.sendImpressionEvent()):this.visible=!1})},{threshold:.01})}firstUpdated(){this.observer.observe(this)}disconnectedCallback(){this.observer.disconnect()}render(){let e=this.wallet?.badge_type==="certified";return c`
      <button>
        ${this.imageTemplate()}
        <wui-flex flexDirection="row" alignItems="center" justifyContent="center" gap="1">
          <wui-text
            variant="md-regular"
            color="inherit"
            class=${v(e?"certified":void 0)}
            >${this.wallet?.name}</wui-text
          >
          ${e?c`<wui-icon size="sm" name="walletConnectBrown"></wui-icon>`:null}
        </wui-flex>
      </button>
    `}imageTemplate(){return!this.visible&&!this.imageSrc||this.imageLoading?this.shimmerTemplate():c`
      <wui-wallet-image
        size="lg"
        imageSrc=${v(this.imageSrc)}
        name=${v(this.wallet?.name)}
        .installed=${this.wallet?.installed??!1}
        badgeSize="sm"
      >
      </wui-wallet-image>
    `}shimmerTemplate(){return c`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}async fetchImageSrc(){this.wallet&&(this.imageSrc=V.getWalletImage(this.wallet),!this.imageSrc&&(this.imageLoading=!0,this.imageSrc=await V.fetchWalletImage(this.wallet.image_id),this.imageLoading=!1))}sendImpressionEvent(){!this.wallet||this.isImpressed||(this.isImpressed=!0,W.sendWalletImpressionEvent({name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.explorerId,view:g.state.view,query:this.walletQuery,certified:this.certified,displayIndex:this.displayIndex}))}};Q.styles=Yr;ee([p()],Q.prototype,"visible",void 0);ee([p()],Q.prototype,"imageSrc",void 0);ee([p()],Q.prototype,"imageLoading",void 0);ee([p()],Q.prototype,"isImpressed",void 0);ee([u()],Q.prototype,"explorerId",void 0);ee([u()],Q.prototype,"walletQuery",void 0);ee([u()],Q.prototype,"certified",void 0);ee([u()],Q.prototype,"displayIndex",void 0);ee([u({type:Object})],Q.prototype,"wallet",void 0);Q=ee([d("w3m-all-wallets-list-item")],Q);var Xr=y`
  wui-grid {
    max-height: clamp(360px, 400px, 80vh);
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  w3m-all-wallets-list-item {
    opacity: 0;
    animation-duration: ${({durations:t})=>t.xl};
    animation-timing-function: ${({easings:t})=>t["ease-inout-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  wui-loading-spinner {
    padding-top: ${({spacing:t})=>t[4]};
    padding-bottom: ${({spacing:t})=>t[4]};
    justify-content: center;
    grid-column: 1 / span 4;
  }
`;var Ye=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},Zr="local-paginator",Ce=class extends f{constructor(){super(),this.unsubscribe=[],this.paginationObserver=void 0,this.loading=!S.state.wallets.length,this.wallets=S.state.wallets,this.mobileFullScreen=B.state.enableMobileFullScreen,this.unsubscribe.push(S.subscribeKey("wallets",e=>this.wallets=e))}firstUpdated(){this.initialFetch(),this.createPaginationObserver()}disconnectedCallback(){this.unsubscribe.forEach(e=>e()),this.paginationObserver?.disconnect()}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),c`
      <wui-grid
        data-scroll=${!this.loading}
        .padding=${["0","3","3","3"]}
        gap="2"
        justifyContent="space-between"
      >
        ${this.loading?this.shimmerTemplate(16):this.walletsTemplate()}
        ${this.paginationLoaderTemplate()}
      </wui-grid>
    `}async initialFetch(){this.loading=!0;let e=this.shadowRoot?.querySelector("wui-grid");e&&(await S.fetchWalletsByPage({page:1}),await e.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.loading=!1,e.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}shimmerTemplate(e,o){return[...Array(e)].map(()=>c`
        <wui-card-select-loader type="wallet" id=${v(o)}></wui-card-select-loader>
      `)}walletsTemplate(){return De.getWalletConnectWallets(this.wallets).map((e,o)=>c`
        <w3m-all-wallets-list-item
          data-testid="wallet-search-item-${e.id}"
          @click=${()=>this.onConnectWallet(e)}
          .wallet=${e}
          explorerId=${e.id}
          certified=${this.badge==="certified"}
          displayIndex=${o}
        ></w3m-all-wallets-list-item>
      `)}paginationLoaderTemplate(){let{wallets:e,recommended:o,featured:r,count:n,mobileFilteredOutWalletsLength:i}=S.state,s=window.innerWidth<352?3:4,l=e.length+o.length,h=Math.ceil(l/s)*s-l+s;return h-=e.length?r.length%s:0,n===0&&r.length>0?null:n===0||[...r,...e,...o].length<n-(i??0)?this.shimmerTemplate(h,Zr):null}createPaginationObserver(){let e=this.shadowRoot?.querySelector(`#${Zr}`);e&&(this.paginationObserver=new IntersectionObserver(([o])=>{if(o?.isIntersecting&&!this.loading){let{page:r,count:n,wallets:i}=S.state;i.length<n&&S.fetchWalletsByPage({page:r+1})}}),this.paginationObserver.observe(e))}onConnectWallet(e){U.selectWalletConnector(e)}};Ce.styles=Xr;Ye([p()],Ce.prototype,"loading",void 0);Ye([p()],Ce.prototype,"wallets",void 0);Ye([p()],Ce.prototype,"badge",void 0);Ye([p()],Ce.prototype,"mobileFullScreen",void 0);Ce=Ye([d("w3m-all-wallets-list")],Ce);var ei=rt`
  wui-grid,
  wui-loading-spinner,
  wui-flex {
    height: 360px;
  }

  wui-grid {
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
    height: auto;
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  wui-loading-spinner {
    justify-content: center;
    align-items: center;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;var Xe=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},ve=class extends f{constructor(){super(...arguments),this.prevQuery="",this.prevBadge=void 0,this.loading=!0,this.mobileFullScreen=B.state.enableMobileFullScreen,this.query=""}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),this.onSearch(),this.loading?c`<wui-loading-spinner color="accent-primary"></wui-loading-spinner>`:this.walletsTemplate()}async onSearch(){(this.query.trim()!==this.prevQuery.trim()||this.badge!==this.prevBadge)&&(this.prevQuery=this.query,this.prevBadge=this.badge,this.loading=!0,await S.searchWallet({search:this.query,badge:this.badge}),this.loading=!1)}walletsTemplate(){let{search:e}=S.state,o=De.markWalletsAsInstalled(e),r=De.filterWalletsByWcSupport(o);return r.length?c`
      <wui-grid
        data-testid="wallet-list"
        .padding=${["0","3","3","3"]}
        rowGap="4"
        columngap="2"
        justifyContent="space-between"
      >
        ${r.map((n,i)=>c`
            <w3m-all-wallets-list-item
              @click=${()=>this.onConnectWallet(n)}
              .wallet=${n}
              data-testid="wallet-search-item-${n.id}"
              explorerId=${n.id}
              certified=${this.badge==="certified"}
              walletQuery=${this.query}
              displayIndex=${i}
            ></w3m-all-wallets-list-item>
          `)}
      </wui-grid>
    `:c`
        <wui-flex
          data-testid="no-wallet-found"
          justifyContent="center"
          alignItems="center"
          gap="3"
          flexDirection="column"
        >
          <wui-icon-box size="lg" color="default" icon="wallet"></wui-icon-box>
          <wui-text data-testid="no-wallet-found-text" color="secondary" variant="md-medium">
            No Wallet found
          </wui-text>
        </wui-flex>
      `}onConnectWallet(e){U.selectWalletConnector(e)}};ve.styles=ei;Xe([p()],ve.prototype,"loading",void 0);Xe([p()],ve.prototype,"mobileFullScreen",void 0);Xe([u()],ve.prototype,"query",void 0);Xe([u()],ve.prototype,"badge",void 0);ve=Xe([d("w3m-all-wallets-search")],ve);var lo=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},St=class extends f{constructor(){super(...arguments),this.search="",this.badge=void 0,this.onDebouncedSearch=b.debounce(e=>{this.search=e})}render(){let e=this.search.length>=2;return c`
      <wui-flex .padding=${["1","3","3","3"]} gap="2" alignItems="center">
        <wui-search-bar @inputChange=${this.onInputChange.bind(this)}></wui-search-bar>
        <wui-certified-switch
          ?checked=${this.badge==="certified"}
          @certifiedSwitchChange=${this.onCertifiedSwitchChange.bind(this)}
          data-testid="wui-certified-switch"
        ></wui-certified-switch>
        ${this.qrButtonTemplate()}
      </wui-flex>
      ${e||this.badge?c`<w3m-all-wallets-search
            query=${this.search}
            .badge=${this.badge}
          ></w3m-all-wallets-search>`:c`<w3m-all-wallets-list .badge=${this.badge}></w3m-all-wallets-list>`}
    `}onInputChange(e){this.onDebouncedSearch(e.detail)}onCertifiedSwitchChange(e){e.detail?(this.badge="certified",ne.showSvg("Only WalletConnect certified",{icon:"walletConnectBrown",iconColor:"accent-100"})):this.badge=void 0}qrButtonTemplate(){return b.isMobile()?c`
        <wui-icon-box
          size="xl"
          iconSize="xl"
          color="accent-primary"
          icon="qrCode"
          border
          borderColor="wui-accent-glass-010"
          @click=${this.onWalletConnectQr.bind(this)}
        ></wui-icon-box>
      `:null}onWalletConnectQr(){g.push("ConnectingWalletConnect")}};lo([p()],St.prototype,"search",void 0);lo([p()],St.prototype,"badge",void 0);St=lo([d("w3m-all-wallets-view")],St);var an=function(t,e,o,r){var n=arguments.length,i=n<3?e:r===null?r=Object.getOwnPropertyDescriptor(e,o):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(t,e,o,r);else for(var l=t.length-1;l>=0;l--)(s=t[l])&&(i=(n<3?s(i):n>3?s(e,o,i):s(e,o))||i);return n>3&&i&&Object.defineProperty(e,o,i),i},ti=class extends f{constructor(){super(...arguments),this.wallet=g.state.data?.wallet}render(){if(!this.wallet)throw new Error("w3m-downloads-view");return c`
      <wui-flex gap="2" flexDirection="column" .padding=${["3","3","4","3"]}>
        ${this.chromeTemplate()} ${this.iosTemplate()} ${this.androidTemplate()}
        ${this.homepageTemplate()}
      </wui-flex>
    `}chromeTemplate(){return this.wallet?.chrome_store?c`<wui-list-item
      variant="icon"
      icon="chromeStore"
      iconVariant="square"
      @click=${this.onChromeStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Chrome Extension</wui-text>
    </wui-list-item>`:null}iosTemplate(){return this.wallet?.app_store?c`<wui-list-item
      variant="icon"
      icon="appStore"
      iconVariant="square"
      @click=${this.onAppStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">iOS App</wui-text>
    </wui-list-item>`:null}androidTemplate(){return this.wallet?.play_store?c`<wui-list-item
      variant="icon"
      icon="playStore"
      iconVariant="square"
      @click=${this.onPlayStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Android App</wui-text>
    </wui-list-item>`:null}homepageTemplate(){return this.wallet?.homepage?c`
      <wui-list-item
        variant="icon"
        icon="browser"
        iconVariant="square-blue"
        @click=${this.onHomePage.bind(this)}
        chevron
      >
        <wui-text variant="md-medium" color="primary">Website</wui-text>
      </wui-list-item>
    `:null}openStore(e){e.href&&this.wallet&&(W.sendEvent({type:"track",event:"GET_WALLET",properties:{name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.wallet.id,type:e.type}}),b.openHref(e.href,"_blank"))}onChromeStore(){this.wallet?.chrome_store&&this.openStore({href:this.wallet.chrome_store,type:"chrome_store"})}onAppStore(){this.wallet?.app_store&&this.openStore({href:this.wallet.app_store,type:"app_store"})}onPlayStore(){this.wallet?.play_store&&this.openStore({href:this.wallet.play_store,type:"play_store"})}onHomePage(){this.wallet?.homepage&&this.openStore({href:this.wallet.homepage,type:"homepage"})}};ti=an([d("w3m-downloads-view")],ti);export{St as W3mAllWalletsView,xt as W3mConnectingWcBasicView,ti as W3mDownloadsView};
/*! Bundled license information:

lit-html/directive-helpers.js:
lit-html/directives/ref.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/async-directive.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
