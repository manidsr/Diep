import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeServer, serverSocket } from '../src/client/mobile';
test('Android connects to LAN or TLS WebSocket origin',()=>{
  assert.equal(normalizeServer('192.168.1.5:3000'),'http://192.168.1.5:3000');
  assert.equal(normalizeServer('192.168.1.5'),'http://192.168.1.5:3000');
  assert.equal(normalizeServer('https://arena.example.com'),'https://arena.example.com');
  assert.equal(normalizeServer('[::1]:3000'),'http://[::1]:3000');
  assert.equal(serverSocket('http://192.168.1.5:3000'),'ws://192.168.1.5:3000/ws');
  assert.equal(serverSocket('https://arena.example.com'),'wss://arena.example.com/ws');
});
test('server selection rejects credentials and non-origin URLs',()=>{
  for(const v of ['', 'javascript:alert(1)','file:///tmp/file','https://user:pass@example.com','https://example.com/path','https://example.com?a=1','https://example.com/#x','http://bad host:3000'])assert.equal(normalizeServer(v),null,v);
});
