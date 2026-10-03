"""Builds TaskPop's Mac installer: one small disk image for Apple Silicon and Intel.

    python3 installers/mac/build.py        ->  installers/mac/out/TaskPop-<version>.dmg

The disk image holds "Install TaskPop.pkg". The package carries TaskPop's own files; its
preinstall script downloads the matching Electron runtime from GitHub (checked against pinned
checksums) or reuses the one already installed, so the download stays around 1 MB.
Builds on Linux. Run tools/fetch-build-deps.sh first, and install mkfs.hfsplus
(Ubuntu: sudo apt install hfsprogs).
"""
import json, os, plistlib, shutil, subprocess, sys

N = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(N))
sys.path.insert(0, N)
sys.path.insert(0, os.path.dirname(N))
from xarpkg import build_xar  # noqa: E402
from assemble_app import assemble  # noqa: E402

TOOLS = os.path.join(REPO, ".build-tools", "bin")
HFS = f"{TOOLS}/hfsplus"; DMG = f"{TOOLS}/dmg"; MKBOM = f"{TOOLS}/mkbom"
VERSION = json.load(open(os.path.join(REPO, "app", "package.json")))["version"]
PKG_ID = "com.pixmint.taskpop.setup"
LOCATION = "/Library/Application Support/TaskPop Installer"

def run(cmd, shell=False, cwd=None):
    r = subprocess.run(cmd, shell=shell, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if r.returncode != 0: print(r.stdout[-3000:]); sys.exit(f"FAILED: {cmd}")
    return r.stdout

# macOS runs these with bash 3.2; refuse to build anything it can't parse.
for tool in (HFS, DMG, MKBOM):
    if not os.access(tool, os.X_OK):
        sys.exit(f"missing {tool}: run tools/fetch-build-deps.sh first")
run([sys.executable, f"{N}/lint_bash32.py", f"{N}/scripts/preinstall", f"{N}/scripts/postinstall"])
# Installer pages: macOS Installer shows HTML without a charset as Western (Latin-1), so any
# UTF-8 character (curly quotes, emoji, the "..." menu sign) came out as junk like "ðŸŽ‰".
# Keep them pure ASCII (use &entities;) and say UTF-8 anyway.
for page in ("welcome.html", "conclusion.html"):
    raw = open(f"{N}/{page}", "rb").read()
    bad = [i for i, b in enumerate(raw) if b > 0x7F]
    if bad:
        sys.exit(f"{page}: non-ASCII byte at offset {bad[0]}; write it as an HTML entity")
    if b'charset="utf-8"' not in raw.lower():
        sys.exit(f"{page}: missing <meta charset=\"utf-8\">")

work = os.path.join(REPO, ".build-tools", "work-mac"); shutil.rmtree(work, ignore_errors=True)
root = f"{work}/root"; os.makedirs(root)
# Payload: TaskPop's own files (everything except the downloaded runtime and model)
assemble("mac", f"{root}/app")
shutil.copy(os.path.join(REPO, "installers", "assets", "TaskPop.icns"), f"{root}/TaskPop.icns")
# The runtime's own Info.plist (Electron 44.4.5, the same for both architectures), branded below
with open(f"{N}/Electron-Info.plist", "rb") as f:
    p = plistlib.load(f)
p.update({
    "CFBundleName": "TaskPop", "CFBundleDisplayName": "TaskPop", "CFBundleExecutable": "TaskPop",
    "CFBundleIdentifier": "com.pixmint.taskpop", "CFBundleIconFile": "TaskPop.icns",
    "CFBundleShortVersionString": VERSION, "CFBundleVersion": VERSION,
    "LSApplicationCategoryType": "public.app-category.productivity", "LSUIElement": True,
    "NSHumanReadableCopyright": "© 2026 asmlab. Developed by asmlab.",
    # Keep TaskPop's timers (double-tap, reminders) running on time while it sits in the background.
    "NSAppSleepDisabled": True,
})
# TaskPop uses no camera, microphone or Bluetooth; don't carry the runtime's default permission texts.
for key in ("ElectronAsarIntegrity", "NSCameraUsageDescription", "NSMicrophoneUsageDescription", "NSAudioCaptureUsageDescription",
            "NSBluetoothAlwaysUsageDescription", "NSBluetoothPeripheralUsageDescription"):
    p.pop(key, None)
with open(f"{root}/Info.plist", "wb") as f: plistlib.dump(p, f)
run(["chmod", "-R", "u+rwX,go+rX,go-w", root])

flat = f"{work}/flat"; comp = f"{flat}/TaskPop.pkg"; os.makedirs(comp); os.makedirs(f"{flat}/Resources/en.lproj")
scripts = f"{work}/scripts"; shutil.copytree(f"{N}/scripts", scripts)
n_files = int(run("find . | wc -l", shell=True, cwd=root).strip())
install_kb = 330000  # what ends up on disk after the download (runtime + app)
run(f"find . | sort | cpio -o --quiet --format odc --owner 0:80 | gzip -9 -c > '{comp}/Payload'", shell=True, cwd=root)
run(f"find . | cpio -o --quiet --format odc --owner 0:80 | gzip -9 -c > '{comp}/Scripts'", shell=True, cwd=scripts)
run([MKBOM, "-u", "0", "-g", "80", root, f"{comp}/Bom"])
open(f"{comp}/PackageInfo", "w").write(f"""<?xml version="1.0" encoding="utf-8"?>
<pkg-info overwrite-permissions="true" relocatable="false" identifier="{PKG_ID}" postinstall-action="none" version="{VERSION}" format-version="2" generator-version="InstallCmds-502 (14B25)" install-location="{LOCATION}" auth="root">
    <payload numberOfFiles="{n_files}" installKBytes="{install_kb}"/>
    <scripts>
        <preinstall file="./preinstall"/>
        <postinstall file="./postinstall"/>
    </scripts>
</pkg-info>
""")
open(f"{flat}/Distribution", "w").write(f"""<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>TaskPop</title>
    <organization>asmlab</organization>
    <welcome file="welcome.html" mime-type="text/html"/>
    <conclusion file="conclusion.html" mime-type="text/html"/>
    <options customize="never" require-scripts="true" rootVolumeOnly="true" hostArchitectures="arm64,x86_64"/>
    <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
    <allowed-os-versions>
        <os-version min="13.0"/>
    </allowed-os-versions>
    <pkg-ref id="{PKG_ID}"/>
    <choices-outline>
        <line choice="default">
            <line choice="{PKG_ID}"/>
        </line>
    </choices-outline>
    <choice id="default"/>
    <choice id="{PKG_ID}" visible="false">
        <pkg-ref id="{PKG_ID}"/>
    </choice>
    <pkg-ref id="{PKG_ID}" version="{VERSION}" onConclusion="none" installKBytes="{install_kb}">#TaskPop.pkg</pkg-ref>
    <product id="{PKG_ID}" version="{VERSION}"/>
</installer-gui-script>
""")
shutil.copy(f"{N}/welcome.html", f"{flat}/Resources/en.lproj/welcome.html")
shutil.copy(f"{N}/conclusion.html", f"{flat}/Resources/en.lproj/conclusion.html")
stage = f"{work}/dmgstage"; os.makedirs(stage)
build_xar(flat, f"{stage}/Install TaskPop.pkg")

img = f"{work}/vol.hfs"
size_kb = int(run(["du", "-sk", stage]).split()[0])
run(["dd", "if=/dev/zero", f"of={img}", "bs=1M", f"count={int(size_kb / 1024 * 1.3) + 8}"])
run(["mkfs.hfsplus", "-v", "TaskPop Installer", img])
run([HFS, "-s", "clone_link", "-m", "no", img, "addall", stage])
os.makedirs(f"{N}/out", exist_ok=True)
out = f"{N}/out/TaskPop-{VERSION}.dmg"
if os.path.exists(out): os.remove(out)
run([DMG, "build", img, out])
print(f"{out}: {os.path.getsize(out) / 1e6:.1f} MB")
