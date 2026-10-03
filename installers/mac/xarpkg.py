"""Minimal XAR writer (the container format of macOS .pkg installers)."""
import hashlib, os, struct, time, zlib
from xml.sax.saxutils import escape

def build_xar(src_dir, out_path):
    heap = bytearray(b"\x00" * 20)  # first 20 bytes: SHA-1 of the compressed table of contents
    next_id = [1]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def entry(path, name, depth):
        fid = next_id[0]; next_id[0] += 1
        pad = " " * depth
        is_dir = os.path.isdir(path)
        mode = "0755" if (is_dir or os.access(path, os.X_OK)) else "0644"
        parts = [f'{pad}<file id="{fid}">']
        if not is_dir:
            data = open(path, "rb").read()
            offset = len(heap); heap.extend(data)
            sha = hashlib.sha1(data).hexdigest()
            parts += [f"{pad} <data>", f"{pad}  <length>{len(data)}</length>",
                      f'{pad}  <encoding style="application/octet-stream"/>', f"{pad}  <offset>{offset}</offset>",
                      f"{pad}  <size>{len(data)}</size>", f'{pad}  <extracted-checksum style="sha1">{sha}</extracted-checksum>',
                      f'{pad}  <archived-checksum style="sha1">{sha}</archived-checksum>', f"{pad} </data>"]
        parts += [f"{pad} <ctime>{now}</ctime>", f"{pad} <mtime>{now}</mtime>", f"{pad} <atime>{now}</atime>",
                  f"{pad} <group>wheel</group>", f"{pad} <gid>0</gid>", f"{pad} <user>root</user>", f"{pad} <uid>0</uid>",
                  f"{pad} <mode>{mode}</mode>", f"{pad} <type>{'directory' if is_dir else 'file'}</type>",
                  f"{pad} <name>{escape(name)}</name>"]
        if is_dir:
            for child in sorted(os.listdir(path)):
                parts.append(entry(os.path.join(path, child), child, depth + 1))
        parts.append(f"{pad}</file>")
        return "\n".join(parts)

    body = "\n".join(entry(os.path.join(src_dir, n), n, 2) for n in sorted(os.listdir(src_dir)))
    toc = ('<?xml version="1.0" encoding="UTF-8"?>\n<xar>\n <toc>\n'
           '  <checksum style="sha1">\n   <offset>0</offset>\n   <size>20</size>\n  </checksum>\n'
           f"  <creation-time>{now}</creation-time>\n{body}\n </toc>\n</xar>\n").encode("utf-8")
    toc_z = zlib.compress(toc, 9)
    heap[0:20] = hashlib.sha1(toc_z).digest()
    with open(out_path, "wb") as f:
        f.write(struct.pack(">4sHHQQI", b"xar!", 28, 1, len(toc_z), len(toc), 1))
        f.write(toc_z); f.write(heap)
