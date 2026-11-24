import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../src/client/preferences';
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
  assert.equal(translate('fa','125 units'),'125 واحد');
  assert.equal(translate('en','125 units'),'125 units');
});
