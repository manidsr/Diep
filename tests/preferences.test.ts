import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, digits, ratio, isolate, eliminationText } from '../src/client/preferences';
import { CLASS_BY_ID, CLASS_IDS } from '../src/shared/config';
import { Game } from '../src/server/game';
import { seeded } from './helpers';

test('Persian tank names and descriptions cover the complete roster',()=>{
  for(const id of CLASS_IDS){
    const c=CLASS_BY_ID[id];
    assert.match(translate('fa',c.name),/[\u0600-\u06ff]/,id);
    assert.match(translate('fa',c.description),/[\u0600-\u06ff]/,id);
    assert.equal(translate('en',c.description),c.description);
  }
});
test('Persian shop covers every upgrade and live stat label',()=>{
  const game=new Game(seeded(55),0,'survival'),player=game.addPlayer('test')!;
  const offers=game.snapshotFor(player.id,true)!.me.shop!;
  assert.equal(offers.length,52);
  for(const o of offers){
    assert.match(translate('fa',o.title),/[\u0600-\u06ff]/,o.id);
    assert.match(translate('fa',o.description),/[\u0600-\u06ff]/,o.id);
    if(o.value)assert.match(translate('fa',o.value),/[\u0600-\u06ff]/,o.id);
  }
  assert.equal(translate('fa','Requires Chain Shot'),'پیش‌نیاز: شلیک زنجیره‌ای');
  assert.equal(translate('fa','125 units'),'۱۲۵ واحد');
  assert.equal(translate('en','125 units'),'125 units');
});


test('Persian formatting preserves logical number order and isolates mixed player names',()=>{
  assert.equal(digits('125.5%','fa'),'۱۲۵٫۵٪');
  assert.equal(digits('125.5%','en'),'125.5%');
  assert.equal(ratio(25,100,'fa'),'\u2066۲۵ / ۱۰۰\u2069');
  assert.equal(ratio(25,100,'en'),'25 / 100');
  assert.equal(eliminationText('fa','Player 12','علی'),isolate('Player 12')+'، '+isolate('علی')+' را حذف کرد.');
  assert.equal(eliminationText('fa','Player 12','علی',true,false),'شما، '+isolate('علی')+' را حذف کردید.');
  assert.equal(eliminationText('fa','Player 12','علی',false,true),isolate('Player 12')+'، شما را حذف کرد.');
  assert.equal(eliminationText('en','Player 12','علی'),'Player 12 eliminated علی');
});
