"""Puts the app together for one platform: app/ plus the native helper it needs (koffi).

TaskPop uses koffi to read modifier keys (double-tap) and, on Windows, to bring its panel to
the front. Only the koffi build for the target platform is included, trimmed to the files it
loads at run time, so the installers stay small.

    python3 installers/assemble_app.py mac|windows|store-x64|store-arm64 DEST

The koffi packages come from tools/fetch-build-deps.sh (npm pack, integrity checked by npm).
"""
import json
import os
import shutil
import sys
import tarfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(REPO, 'app')
NPM = os.path.join(REPO, '.build-tools', 'npm')
KOFFI_VERSION = '3.3.1'

TARGETS = {
    'mac': ['darwin-arm64', 'darwin-x64'],
    'windows': ['win32-x64', 'win32-arm64'],
    'store-x64': ['win32-x64'],
    'store-arm64': ['win32-arm64'],
}

# The parts of koffi's JavaScript package that are loaded at run time
KOFFI_KEEP = [
    'LICENSE.txt', 'README.md', 'index.cjs', 'index.js', 'indirect.cjs', 'indirect.js',
    'src/koffi/index.cjs', 'src/koffi/index.js', 'src/koffi/indirect.cjs', 'src/koffi/indirect.js',
    'src/koffi/src/static.cjs', 'src/koffi/src/static.js', 'src/koffi/src/trampolines.cjs',
]


def tarball(name):
    path = os.path.join(NPM, f'{name}-{KOFFI_VERSION}.tgz')
    if not os.path.exists(path):
        sys.exit(f'missing {path}: run tools/fetch-build-deps.sh first')
    return tarfile.open(path)


def extract(tar, wanted, dest):
    """Extracts package/<file> for each wanted file (or all files when wanted is None) into dest."""
    for member in tar.getmembers():
        if not member.isfile() or not member.name.startswith('package/'):
            continue
        rel = member.name[len('package/'):]
        if wanted is not None and not wanted(rel):
            continue
        out = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with tar.extractfile(member) as src, open(out, 'wb') as dst:
            shutil.copyfileobj(src, dst)


def assemble(target, dest):
    if target not in TARGETS:
        sys.exit(f'unknown target {target}; use one of {", ".join(TARGETS)}')
    shutil.rmtree(dest, ignore_errors=True)
    shutil.copytree(APP, dest, ignore=shutil.ignore_patterns('node_modules', '.DS_Store'))
    modules = os.path.join(dest, 'node_modules')

    # koffi's JavaScript side, without its build scripts or the list of every platform's binary
    koffi = os.path.join(modules, 'koffi')
    with tarball('koffi') as tar:
        extract(tar, lambda rel: rel in KOFFI_KEEP, koffi)
        meta = json.load(tar.extractfile('package/package.json'))
    meta.pop('scripts', None)
    meta.pop('optionalDependencies', None)
    with open(os.path.join(koffi, 'package.json'), 'w') as f:
        json.dump(meta, f, indent=4)

    # The native binary for each architecture of the target
    for platform in TARGETS[target]:
        pkg = os.path.join(modules, '@koromix', f'koffi-{platform}')
        with tarball(f'koromix-koffi-{platform}') as tar:
            if platform.startswith('win32'):
                # Windows: only the .node file is loaded (not the import library or readme)
                extract(tar, lambda rel: not rel.endswith(('.lib', '.exp')) and rel != 'README.md', pkg)
            else:
                extract(tar, None, pkg)
    return dest


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    print(assemble(sys.argv[1], os.path.abspath(sys.argv[2])))
