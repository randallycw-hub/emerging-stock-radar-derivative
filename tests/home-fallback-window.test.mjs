import test from 'node:test';
import assert from 'node:assert/strict';
import {buildV51HomeStaticFallback} from '../static-showcase/assets/home-static-fallback.js';
test('initial static homepage shares the seven-day window of the interactive homepage',()=>{
  const eventHtml=buildV51HomeStaticFallback({meta:{dataDate:'2026-09-04'},home:{latestEvents:{state:'ready',entries:[{date:'2026-09-22',route:'./ipo.html',code:'7856',title:'outside'},{date:'2026-09-07',route:'./ipo.html',code:'2938',title:'inside'}]}}}).eventHtml;
  assert.match(eventHtml,/inside/);
  assert.doesNotMatch(eventHtml,/outside/);
});
