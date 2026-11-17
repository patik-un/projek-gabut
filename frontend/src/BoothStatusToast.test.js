import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {parse}=require('@babel/parser');
const source=readFileSync(new URL('./BoothStatusToast.jsx',import.meta.url),'utf8');
const component=parse(source,{sourceType:'module',plugins:['jsx']}).program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration;
const effect=component.body.body.find(n=>n.type==='ExpressionStatement' && n.expression.callee.name==='useEffect').expression.arguments[0];
function mount(message){
  const timers=[];const context={message,visible:false,setVisible(value){context.visible=value;},window:{setTimeout(callback,delay){timers.push({callback,delay});return timers.length;},clearTimeout(id){timers[id-1].cancelled=true;}}};
  const cleanup=vm.runInNewContext(`(${source.slice(effect.start,effect.end)})`,context)();
  return {context,timers,cleanup};
}
test('a notification disappears after four seconds',()=>{
  const {context,timers}=mount('Foto ulang tersimpan');
  assert.equal(context.visible,true);assert.equal(timers[0].delay,4000);
  timers[0].callback();assert.equal(context.visible,false);
});
test('old timers cannot dismiss the next notification after cleanup',()=>{
  const {context,timers,cleanup}=mount('Mengambil foto');
  cleanup();context.visible=true;timers[0].callback();
  assert.equal(context.visible,true);assert.equal(timers[0].cancelled,true);
});
test('empty status creates no popup timer',()=>{
  const {context,timers}=mount('');assert.equal(context.visible,false);assert.equal(timers.length,0);
});
