"""Checks an .msix the way Windows reads it: ZIP structure, CRCs, block map (every block's
SHA-256 and compressed size, each block decompressing on its own), content types, manifest.
Usage: verify_msix.py package.msix [reference.msix]"""
import base64, hashlib, re, struct, sys, zipfile, zlib
from urllib.parse import unquote
import xml.etree.ElementTree as ET

def check(path):
    problems = []
    data = open(path, 'rb').read()
    z = zipfile.ZipFile(path)
    if z.testzip() is not None:
        problems.append('CRC error')
    infos = z.infolist()
    names = [i.filename for i in infos]
    signed = {'AppxSignature.p7x', 'AppxMetadata/CodeIntegrity.cat'}
    tail = [n for n in names if n not in signed]
    if tail[-2:] != ['AppxBlockMap.xml', '[Content_Types].xml']:
        problems.append(f'unexpected order at end: {names[-3:]}')
    bm = z.read('AppxBlockMap.xml').decode('utf-8')
    root = ET.fromstring(bm)
    ns = '{http://schemas.microsoft.com/appx/2010/blockmap}'
    if root.get('HashMethod') != 'http://www.w3.org/2001/04/xmlenc#sha256':
        problems.append('hash method')
    by_name = {unquote(i.filename): i for i in infos}
    mapped = set()
    for f in root.findall(f'{ns}File'):
        name = f.get('Name')
        zname = name.replace('\\', '/')
        mapped.add(zname)
        zi = by_name.get(zname)
        if not zi:
            problems.append(f'blockmap file missing from zip: {name}'); continue
        off = zi.header_offset
        sig, ver, flags, meth = struct.unpack('<IHHH', data[off:off + 10])
        nl, el = struct.unpack('<HH', data[off + 26:off + 30])
        if sig != 0x04034b50 or ver != 45 or flags != 8 or el != 0:
            problems.append(f'{name}: local header ver={ver} flags={flags} extra={el}')
        if int(f.get('LfhSize')) != 30 + nl + el:
            problems.append(f'{name}: LfhSize')
        content = z.read(zi.filename)
        if int(f.get('Size')) != len(content):
            problems.append(f'{name}: Size')
        blocks = f.findall(f'{ns}Block')
        if len(blocks) != (len(content) + 65535) // 65536:
            problems.append(f'{name}: block count')
        start = off + 30 + nl + el
        raw = data[start:start + zi.compress_size]
        pos = 0
        for bi, b in enumerate(blocks):
            piece = content[bi * 65536:(bi + 1) * 65536]
            if base64.b64encode(hashlib.sha256(piece).digest()).decode() != b.get('Hash'):
                problems.append(f'{name}: block {bi} hash'); break
            if zi.compress_type == 8:
                s = int(b.get('Size'))
                if zlib.decompressobj(-15).decompress(raw[pos:pos + s]) != piece:
                    problems.append(f'{name}: block {bi} does not decompress on its own'); break
                pos += s
            elif b.get('Size') is not None:
                problems.append(f'{name}: stored block has Size'); break
        if zi.compress_type == 8 and raw[pos:] != b'\x03\x00':
            problems.append(f'{name}: tail {raw[pos:].hex()}')
        dd = data[start + zi.compress_size:start + zi.compress_size + 24]
        if struct.unpack('<IIQQ', dd) != (0x08074b50, zi.CRC, zi.compress_size, zi.file_size):
            problems.append(f'{name}: data descriptor')
    extra = {unquote(n) for n in names} - mapped - {'AppxBlockMap.xml', '[Content_Types].xml'} - signed
    if extra:
        problems.append(f'files not in block map: {sorted(extra)[:5]}')
    if 'AppxManifest.xml' not in mapped:
        problems.append('manifest not in block map')
    # content types cover every file
    ct = ET.fromstring(z.read('[Content_Types].xml'))
    cns = '{http://schemas.openxmlformats.org/package/2006/content-types}'
    defaults = {d.get('Extension').lower() for d in ct.findall(f'{cns}Default')}
    overrides = {o.get('PartName') for o in ct.findall(f'{cns}Override')}
    for n in names:
        if n == '[Content_Types].xml':
            continue
        base = n.rsplit('/', 1)[-1]
        ext = base.rsplit('.', 1)[-1].lower() if '.' in base else None
        if f'/{n}' not in overrides and ext not in defaults and n not in signed:
            problems.append(f'no content type for {n}')
    # Zip64 end records like MakeAppx
    eocd = data[-22:]
    if struct.unpack('<IHHHHIIH', eocd)[3:7] != (0xFFFF, 0xFFFF, 0xFFFFFFFF, 0xFFFFFFFF):
        problems.append('EOCD not in Zip64 form')
    if data.rfind(b'PK\x06\x06') == -1 or data.rfind(b'PK\x06\x07') == -1:
        problems.append('no Zip64 end record/locator')
    # manifest: well-formed, files it names exist
    man = z.read('AppxManifest.xml')
    mroot = ET.fromstring(man)
    for attr in re.findall(rb'(?:Logo|Square\w+Logo|Wide\w+Logo|Executable)="([^"]+)"', man) + re.findall(rb'<Logo>([^<]+)</Logo>', man):
        p = attr.decode().replace('\\', '/')
        # (with a resources.pri, Windows picks size-specific versions like Logo.scale-200.png instead)
        if p not in by_name and 'resources.pri' not in by_name:
            problems.append(f'manifest names a missing file: {p}')
    return problems, len(names), mroot

if __name__ == '__main__':
    problems, count, mroot = check(sys.argv[1])
    ident = mroot.find('{http://schemas.microsoft.com/appx/manifest/foundation/windows10}Identity')
    print(f'{sys.argv[1]}: {count} entries, identity {ident.get("Name")} {ident.get("Version")} {ident.get("ProcessorArchitecture")}')
    print('PROBLEMS:' if problems else 'OK: package structure matches the MSIX format', *problems[:20], sep='\n  ')
    if len(sys.argv) > 2:
        rp, rc, _ = check(sys.argv[2])
        print(f'reference {sys.argv[2]} (built by Microsoft): {rc} entries,', 'OK, passes the same checks' if not rp else rp[:5])
    sys.exit(1 if problems else 0)
