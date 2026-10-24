/** Run against a local Next server + CMS; no writes or customer data. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { base, launch, check, eventually, watchConsole, finish } from './lib/harness.mjs';
const browser=await launch();
const screenshots=process.env.SCREENSHOT_DIR;
if(screenshots)mkdirSync(screenshots,{recursive:true});
try {
 for(const width of [1440,1280,768,390,360]){
  const context=await browser.newContext({viewport:{width,height:1000},locale:'fa-IR',reducedMotion:'reduce'});
  const page=await context.newPage();watchConsole(page);
  await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(async()=>{document.querySelectorAll('img').forEach(i=>i.loading='eager');await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
  check(await page.locator('.home-hero h1').count()===1,`${width}: one server-rendered homepage heading`);
  check(await page.locator('html').getAttribute('dir')==='rtl',`${width}: RTL document`);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: no horizontal overflow`);
  check(await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)),`${width}: all artwork loaded`);
  check(await page.evaluate(()=>[...document.querySelectorAll('a')].every(a=>!/^javascript:/.test(a.href)&&a.getAttribute('href')!=='#')),`${width}: no dead placeholder links`);
  if(width===1440){
   const links=await page.locator('a').evaluateAll(nodes=>[...new Set(nodes.map(a=>a.getAttribute('href')).filter(h=>h?.startsWith('/')&&!h.startsWith('//')))]);
   for(const link of links){const response=await page.request.get(`${base}${link}`);check(response.ok(),`navigation ${link}: HTTP ${response.status()}`);}
  }
  const trigger=page.locator('.home-faq .marketing-faq-trigger').nth(1);
  await trigger.focus();await page.keyboard.press('Enter');
  check(await eventually(()=>trigger.getAttribute('aria-expanded').then(v=>v==='true')),`${width}: FAQ keyboard expand`);
  const panelId=await trigger.getAttribute('aria-controls');
  check(await page.locator(`[id="${panelId}"]`).getAttribute('aria-hidden')==='false',`${width}: FAQ accessible panel state`);
  await page.keyboard.press('Space');check(await eventually(()=>trigger.getAttribute('aria-expanded').then(v=>v==='false')),`${width}: FAQ keyboard collapse`);
  const reduced=await page.evaluate(()=>[...document.querySelectorAll('.home-float,.home-orbit-icon')].every(e=>getComputedStyle(e).animationName==='none'));
  check(reduced,`${width}: reduced motion disables continuous animation`);
  if(width<=768){
   const menu=page.locator('.marketing-menu-toggle');await menu.click();
   check(await menu.getAttribute('aria-expanded')==='true',`${width}: mobile menu opens`);
   await page.keyboard.press('Escape');check(await eventually(()=>menu.getAttribute('aria-expanded').then(v=>v==='false')),`${width}: Escape closes menu`);
   check(await menu.evaluate(e=>e===document.activeElement),`${width}: menu focus restored`);
   const quotes=page.locator('.home-quotes');const before=await quotes.evaluate(e=>e.scrollLeft);
   await page.getByRole('button',{name:'دیدگاه‌های بعدی'}).click();
   check(await eventually(()=>quotes.evaluate((e,b)=>e.scrollLeft!==b,before)),`${width}: testimonial navigation scrolls`);
  }
  await page.getByRole('button',{name:'نمایش وضعیت پیش‌نمایش محصول'}).click();
  check(await page.locator('.home-preview-status').isVisible(),`${width}: showcase preview state is functional`);
  await page.getByRole('button',{name:'نمایش وضعیت پیش‌نمایش محصول'}).click();
  if(screenshots&&[1440,390].includes(width)){await page.locator('.home-faq .marketing-faq-trigger').first().click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(screenshots,`homepage-${width}.png`),fullPage:true});}
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});const page=await context.newPage();watchConsole(page);
 await page.goto(base,{waitUntil:'networkidle'});
 check(await page.locator('.home-float').first().evaluate(e=>getComputedStyle(e).animationName==='home-float'),'desktop floating animation enabled');
 await page.mouse.move(1000,400);check(await eventually(()=>page.locator('.home-hero-stage').evaluate(e=>getComputedStyle(e).getPropertyValue('--parallax-x').trim()!=='0px')),'desktop pointer parallax responds');
 await page.evaluate(()=>scrollTo(0,900));check(await eventually(()=>page.locator('.marketing-header').getAttribute('class').then(v=>v.includes('is-scrolled'))),'sticky header responds to scroll');
 await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.home-float').first().evaluate(e=>getComputedStyle(e).animationName==='none'),'live reduced-motion change stops animation');
 await context.close();
 const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:1440,height:1000}});const serverPage=await noJs.newPage();await serverPage.goto(base);
 check(await serverPage.locator('.home-hero h1').isVisible(),'critical hero content visible without JavaScript');
 check(await serverPage.locator('script[type="application/ld+json"]').count()>0,'server-rendered structured data retained');
 check(await serverPage.locator('link[rel="canonical"]').count()===1,'canonical metadata retained');await noJs.close();
}catch(error){await browser.close();throw error;}
await finish(browser);
