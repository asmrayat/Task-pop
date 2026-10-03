"""Build TaskPop's Microsoft Store package (.msix) on Linux.

Writes the same format as Microsoft's MakeAppx (checked against a Microsoft-built package):
  - ZIP entries with data descriptors (Zip64-style sizes), no extra fields, Zip64 end records
  - each file deflated in independent 64 KB blocks (full flush), then an empty final block
  - AppxBlockMap.xml: SHA-256 of every 64 KB block (and its compressed size)
  - [Content_Types].xml, AppxManifest.xml (full-trust desktop app with a start-up task)
The package is left unsigned: the Microsoft Store signs it after certification.

Usage: python3 installers/store/build_msix.py x64|arm64 identity.json out.msix
identity.json: {"name": ..., "publisher": "CN=...", "publisherDisplayName": ...} from Partner Center
(identity.placeholder.json shows the shape). Needs tools/fetch-build-deps.sh --store, Pillow and
Wine (rcedit, a Windows tool, gives TaskPop.exe its icon).
"""
import base64, hashlib, io, json, os, shutil, struct, subprocess, sys, time, zipfile, zlib
from xml.sax.saxutils import escape, quoteattr
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(REPO, 'app')
TOOLS = os.path.join(REPO, '.build-tools')
sys.path.insert(0, os.path.dirname(HERE))
from assemble_app import assemble  # noqa: E402
BLOCK = 65536
STORED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'zip', '7z', 'mp3', 'mp4', 'webp'}
CONTENT_TYPES = {
    'exe': 'application/x-msdownload', 'dll': 'application/x-msdownload', 'node': 'application/octet-stream',
    'png': 'image/png', 'ico': 'image/vnd.microsoft.icon', 'xml': 'text/xml', 'json': 'application/json',
    'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript', 'pak': 'application/octet-stream',
    'dat': 'application/octet-stream', 'bin': 'application/octet-stream', 'asar': 'application/octet-stream',
}


def stage(arch, dest):
    shutil.rmtree(dest, ignore_errors=True)
    os.makedirs(dest)
    with zipfile.ZipFile(f'{TOOLS}/electron-win32-{arch}.zip') as z:
        z.extractall(dest)
    os.rename(f'{dest}/electron.exe', f'{dest}/TaskPop.exe')
    os.remove(f'{dest}/resources/default_app.asar')
    assemble(f'store-{arch}', f'{dest}/resources/app')  # app/ with koffi for this architecture only
    # Store copies are updated by the Store; the tiny updater code stays but is switched off at run time.
    shutil.copy(f'{SRC}/assets/TaskPop.ico', f'{dest}/TaskPop.ico')
    # Tiles and icons named in the manifest (exact 100% sizes; no resources.pri needed)
    src = Image.open(os.path.join(REPO, 'installers', 'assets', 'TaskPop-1024.png')).convert('RGBA')
    os.makedirs(f'{dest}/Images')
    def square(size, name, pad=0.0):
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        inner = round(size * (1 - 2 * pad))
        icon = src.resize((inner, inner), Image.LANCZOS)
        canvas.paste(icon, ((size - inner) // 2, (size - inner) // 2), icon)
        canvas.save(f'{dest}/Images/{name}')
    square(44, 'Square44x44Logo.png')
    square(150, 'Square150x150Logo.png', pad=0.16)
    square(50, 'StoreLogo.png')
    wide = Image.new('RGBA', (310, 150), (0, 0, 0, 0))
    icon = src.resize((100, 100), Image.LANCZOS)
    wide.paste(icon, (105, 25), icon)
    wide.save(f'{dest}/Images/Wide310x150Logo.png')


def set_exe_icon(dest, version):
    """Gives TaskPop.exe its icon and name with rcedit (a Windows tool, run through Wine)."""
    env = dict(os.environ, WINEDEBUG='-all')
    r = subprocess.run(['timeout', '120', 'wine64', f'{TOOLS}/bin/rcedit-x64.exe', f'{dest}/TaskPop.exe',
                        '--set-icon', f'{dest}/TaskPop.ico',
                        '--set-version-string', 'ProductName', 'TaskPop', '--set-version-string', 'FileDescription', 'TaskPop',
                        '--set-version-string', 'CompanyName', 'asmlab', '--set-version-string', 'LegalCopyright', 'Copyright 2026 asmlab',
                        '--set-version-string', 'OriginalFilename', 'TaskPop.exe', '--set-version-string', 'InternalName', 'TaskPop',
                        '--set-file-version', version, '--set-product-version', version],
                       env=env, capture_output=True, text=True)
    subprocess.run(['wineserver', '-w'], env=env)
    return r.returncode == 0


def manifest(identity, version, arch):
    desc = 'A small task list that slides in from the corner of your screen.'
    return f'''<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap desktop rescap">
  <Identity Name={quoteattr(identity["name"])} Publisher={quoteattr(identity["publisher"])} Version="{version}" ProcessorArchitecture="{arch}" />
  <Properties>
    <DisplayName>TaskPop</DisplayName>
    <PublisherDisplayName>{escape(identity["publisherDisplayName"])}</PublisherDisplayName>
    <Logo>Images\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="TaskPop" Executable="TaskPop.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="TaskPop" Description={quoteattr(desc)} BackgroundColor="transparent"
        Square150x150Logo="Images\\Square150x150Logo.png" Square44x44Logo="Images\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Images\\Wide310x150Logo.png" ShortName="TaskPop" />
      </uap:VisualElements>
      <Extensions>
        <desktop:Extension Category="windows.startupTask" Executable="TaskPop.exe" EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask TaskId="TaskPopStartup" Enabled="true" DisplayName="TaskPop" />
        </desktop:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
'''.encode('utf-8')


def dos_time(t=None):
    t = time.localtime(t or time.time())
    return ((t.tm_hour << 11) | (t.tm_min << 5) | (t.tm_sec // 2)), (((t.tm_year - 1980) << 9) | (t.tm_mon << 5) | t.tm_mday)


def deflate_blocks(data):
    """Each 64 KB block compressed on its own (full flush), then the empty final block."""
    comp = zlib.compressobj(9, zlib.DEFLATED, -15)
    out, sizes = [], []
    for i in range(0, len(data), BLOCK):
        chunk = comp.compress(data[i:i + BLOCK]) + comp.flush(zlib.Z_FULL_FLUSH)
        out.append(chunk)
        sizes.append(len(chunk))
    out.append(comp.flush(zlib.Z_FINISH))
    return b''.join(out), sizes


def part_name(rel):
    # All names here are plain ASCII letters, digits and . _ - @ / (checked), so they need no escaping.
    assert all(c.isalnum() or c in '._-@/[]' for c in rel), rel
    return rel.replace('[', '%5B').replace(']', '%5D')


def build(arch, identity, out):
    version = json.load(open(f'{SRC}/package.json'))['version'] + '.0'
    dest = os.path.join(TOOLS, f'msix-stage-{arch}')
    stage(arch, dest)
    icon_ok = set_exe_icon(dest, version[:-2])
    open(f'{dest}/AppxManifest.xml', 'wb').write(manifest(identity, version, arch))

    files = []
    for root, _, names in os.walk(dest):
        for n in names:
            rel = os.path.relpath(os.path.join(root, n), dest).replace(os.sep, '/')
            if rel != 'AppxManifest.xml':
                files.append(rel)
    files.sort(key=lambda p: (p.count('/'), p.lower()))
    files.append('AppxManifest.xml')  # MakeAppx puts the manifest after the payload

    buf = io.BytesIO()
    central = []
    blockmap = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
                '<BlockMap xmlns="http://schemas.microsoft.com/appx/2010/blockmap" HashMethod="http://www.w3.org/2001/04/xmlenc#sha256">']
    tm, dt = dos_time()

    def add(name, data, compress, with_descriptor=True, in_blockmap=True):
        zname = part_name(name).encode('ascii')
        offset = buf.tell()
        crc = zlib.crc32(data) & 0xffffffff
        if compress:
            body, sizes = deflate_blocks(data)
        else:
            body, sizes = data, None
        if with_descriptor:
            buf.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, 45, 0x8, 8 if compress else 0, tm, dt, 0, 0, 0, len(zname), 0))
        else:
            buf.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, 8 if compress else 0, tm, dt, crc, len(body), len(data), len(zname), 0))
        buf.write(zname)
        buf.write(body)
        if with_descriptor:
            buf.write(struct.pack('<IIQQ', 0x08074b50, crc, len(body), len(data)))
        central.append((zname, compress, crc, len(body), len(data), offset, with_descriptor))
        if in_blockmap:
            lines = [f'<File Name={quoteattr(name.replace("/", chr(92)))} Size="{len(data)}" LfhSize="{30 + len(zname)}">']
            for i in range(0, len(data), BLOCK):
                h = base64.b64encode(hashlib.sha256(data[i:i + BLOCK]).digest()).decode()
                lines.append(f'<Block Hash="{h}" Size="{sizes[i // BLOCK]}"/>' if compress else f'<Block Hash="{h}"/>')
            lines.append('</File>')
            blockmap.append(''.join(lines))

    exts = set()
    no_ext = []
    for rel in files:
        data = open(f'{dest}/{rel}', 'rb').read()
        base = rel.rsplit('/', 1)[-1]
        ext = base.rsplit('.', 1)[-1].lower() if '.' in base else ''
        if ext:
            exts.add(ext)
        else:
            no_ext.append(rel)
        add(rel, data, compress=ext not in STORED_EXT)

    blockmap.append('</BlockMap>')
    add('AppxBlockMap.xml', '\r\n'.join(blockmap).encode('utf-8'), compress=True, in_blockmap=False)
    types = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
             '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">']
    for e in sorted(exts):
        types.append(f'<Default Extension="{e}" ContentType="{CONTENT_TYPES.get(e, "application/octet-stream")}"/>')
    for rel in no_ext:
        types.append(f'<Override PartName="/{part_name(rel)}" ContentType="application/octet-stream"/>')
    types.append('<Override PartName="/AppxManifest.xml" ContentType="application/vnd.ms-appx.manifest+xml"/>')
    types.append('<Override PartName="/AppxBlockMap.xml" ContentType="application/vnd.ms-appx.blockmap+xml"/>')
    types.append('</Types>')
    ct = ''.join(types).encode('utf-8')
    # [Content_Types].xml is written like MakeAppx does: last, no data descriptor, deflated normally
    zname = b'[Content_Types].xml'
    offset = buf.tell()
    comp = zlib.compressobj(9, zlib.DEFLATED, -15)
    body = comp.compress(ct) + comp.flush()
    crc = zlib.crc32(ct) & 0xffffffff
    buf.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, 8, tm, dt, crc, len(body), len(ct), len(zname), 0))
    buf.write(zname)
    buf.write(body)
    central.append((zname, True, crc, len(body), len(ct), offset, False))

    cd_start = buf.tell()
    for zname, compress, crc, csize, usize, offset, desc in central:
        buf.write(struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 45, 45 if desc else 20, 0x8 if desc else 0,
                              8 if compress else 0, tm, dt, crc, csize, usize, len(zname), 0, 0, 0, 0, 0, offset))
        buf.write(zname)
    cd_size = buf.tell() - cd_start
    z64 = buf.tell()
    buf.write(struct.pack('<IQHHIIQQQQ', 0x06064b50, 44, 45, 45, 0, 0, len(central), len(central), cd_size, cd_start))
    buf.write(struct.pack('<IIQI', 0x07064b50, 0, z64, 1))
    buf.write(struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, 0xFFFF, 0xFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0))
    assert buf.tell() < 0xFFFFFFFF
    open(out, 'wb').write(buf.getvalue())
    return {'files': len(files), 'size': buf.tell(), 'icon': icon_ok, 'version': version}


if __name__ == '__main__':
    arch, identity_file, out = sys.argv[1:4]
    info = build(arch, json.load(open(identity_file)), out)
    print(f'{out}: {info["size"] / 1e6:.1f} MB, {info["files"]} files, version {info["version"]}, exe icon {"set" if info["icon"] else "NOT set"}')
