import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import * as reader from '../../research/cb-sources/sfb-cb-workbook.mjs';

const sourceUrl='https://www.fsc.gov.tw/userfiles/file/1150915申報案件彙總表v2.xlsx';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
// Structural envelope only, deliberately not a workbook. No production fixture import.
function zipEnvelope({name='xl/worksheets/sheet1.xml',size=500,flag=0}={}) {
  const title=Buffer.from(name); const local=Buffer.alloc(30+title.length);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(flag,6); local.writeUInt16LE(title.length,26); title.copy(local,30);
  const central=Buffer.alloc(46+title.length); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(flag,8); central.writeUInt32LE(size,24); central.writeUInt16LE(title.length,28); title.copy(central,46);
  const end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10); end.writeUInt32LE(central.length,12); end.writeUInt32LE(local.length,16);
  return Buffer.concat([local,central,end]);
}

test('workbook envelope refuses HTML, altered hashes and oversized input before parsing', () => {
  assert.equal(typeof reader.validateSfbWorkbookBytes,'function');
  const html=Buffer.from('<html>unavailable</html>');
  assert.throws(()=>reader.validateSfbWorkbookBytes(html,digest(html)),/ZIP|xlsx/);
  const bytes=zipEnvelope();
  assert.throws(()=>reader.validateSfbWorkbookBytes(bytes,'0'.repeat(64)),/hash/);
  const large=Buffer.alloc(2_000_001);
  assert.throws(()=>reader.validateSfbWorkbookBytes(large,digest(large)),/size/);
});

test('workbook envelope bounds expanded data and rejects encrypted, macro and traversal entries', () => {
  assert.equal(typeof reader.validateSfbWorkbookBytes,'function');
  assert.doesNotThrow(()=>{const b=zipEnvelope(); reader.validateSfbWorkbookBytes(b,digest(b));});
  for (const options of [{size:50_000_000},{flag:1},{name:'xl/vbaProject.bin'},{name:'../outside.xml'},{name:'xl/externalLinks/externalLink1.xml'}]) {
    const bytes=zipEnvelope(options);
    assert.throws(()=>reader.validateSfbWorkbookBytes(bytes,digest(bytes)));
  }
});

test('workbook provenance accepts only dated official SFB attachment URLs', () => {
  assert.equal(typeof reader.validateSfbAttachmentProvenance,'function');
  assert.doesNotThrow(()=>reader.validateSfbAttachmentProvenance({sourceUrl,sourceDate:'2026-09-15'}));
  for (const bad of [sourceUrl.replace('www.fsc.gov.tw','evil.test'),sourceUrl.replace('https:','http:'),sourceUrl+'?redirect=1',sourceUrl.replace('www.fsc','user:secret@www.fsc'),sourceUrl.replace('gov.tw/','gov.tw:444/'),sourceUrl.replace('彙總表v2','會員')]) {
    assert.throws(()=>reader.validateSfbAttachmentProvenance({sourceUrl:bad,sourceDate:'2026-09-15'}));
  }
  assert.throws(()=>reader.validateSfbAttachmentProvenance({sourceUrl,sourceDate:'2026-09-14'}));
});
