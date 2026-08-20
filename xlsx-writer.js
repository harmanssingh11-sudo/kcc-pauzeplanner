// Minimale, dependency-vrije .xlsx-schrijver. Geen CDN nodig (werkt dus ook offline of
// achter een strikte firewall): bouwt zelf een geldig OOXML-spreadsheet in een ZIP-container
// met platte opslag (geen compressie, method 0).
'use strict';

function crc32(bytes) {
  const table = crc32._table || (crc32._table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function strToBytes(str) { return new TextEncoder().encode(str); }
function u16(n) { return [n & 0xff, (n >> 8) & 0xff]; }
function u32(n) { return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]; }
function concatBytes(chunks) {
  let total = 0; chunks.forEach((c) => (total += c.length));
  const out = new Uint8Array(total); let offset = 0;
  chunks.forEach((c) => { out.set(c, offset); offset += c.length; }); return out;
}
function buildZipBytes(files) {
  const DOS_TIME = 0, DOS_DATE = 0x21, localChunks = [], centralChunks = [], offsets = [];
  let offset = 0;
  files.forEach(({ name, content }) => {
    const nameBytes = strToBytes(name), dataBytes = strToBytes(content), crc = crc32(dataBytes), size = dataBytes.length;
    const localHeader = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0)]);
    offsets.push(offset); localChunks.push(localHeader, nameBytes, dataBytes); offset += localHeader.length + nameBytes.length + dataBytes.length;
    const centralHeader = new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(size), ...u32(size), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offsets[offsets.length - 1])]);
    centralChunks.push(centralHeader, nameBytes);
  });
  const centralStart = offset, centralBytes = concatBytes(centralChunks);
  const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(centralBytes.length), ...u32(centralStart), ...u16(0)]);
  return concatBytes([...localChunks, centralBytes, eocd]);
}
function colLetter(i) { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
function escapeXml(str) { return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }
function sheetXml(rows) {
  const rowXml = rows.map((row, ri) => {
    const cells = row.map((val, ci) => val === '' || val === null || val === undefined ? '' : `<c r="${colLetter(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}
const WORKBOOK_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Pauzeplanning" sheetId="1" r:id="rId1"/></sheets></workbook>';
const WORKBOOK_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
function buildXlsxBytes(rows) {
  return buildZipBytes([
    { name: '[Content_Types].xml', content: CONTENT_TYPES },
    { name: '_rels/.rels', content: ROOT_RELS },
    { name: 'xl/workbook.xml', content: WORKBOOK_XML },
    { name: 'xl/_rels/workbook.xml.rels', content: WORKBOOK_RELS },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml(rows) },
  ]);
}
function downloadXlsx(rows, filename) {
  const bytes = buildXlsxBytes(rows);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const PauzeXlsx = { buildXlsxBytes, downloadXlsx };
if (typeof module !== 'undefined' && module.exports) module.exports = PauzeXlsx; else window.PauzeXlsx = PauzeXlsx;