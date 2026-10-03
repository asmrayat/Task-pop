"""Catch shell code that macOS's /bin/bash 3.2 can't parse.

bash 3.2 finds the end of a $( ... ) by counting parentheses (it doesn't parse the inside),
so a `case` pattern like `a)` inside $( ) ends the substitution early and the whole script
fails with a syntax error before it runs. This mimics that: every $( ) is matched the way
bash 3.2 does, replaced by a placeholder, and the result must still be valid shell; each
substitution's own text must be valid too.
Usage: lint_bash32.py FILE...   (exit 1 on problems)
"""
import subprocess, sys

def naive_end(s, i):
    """s[i:i+2] == '$('. Return index just past the ')' bash 3.2 would pick."""
    depth, j = 1, i + 2
    while j < len(s):
        ch = s[j]
        if ch == '\\':
            j += 2; continue
        if ch == "'":
            j = s.index("'", j + 1) + 1; continue
        if ch == '"':
            k = j + 1
            while s[k] != '"':
                k += 2 if s[k] == '\\' else 1
            j = k + 1; continue
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    raise ValueError('unterminated $(')

def check(text, name):
    problems, out, i = [], [], 0
    while True:
        k = text.find('$(', i)
        if k < 0 or text[k:k+3] == '$((':
            if k < 0:
                out.append(text[i:]); break
            out.append(text[i:k+3]); i = k + 3; continue
        end = naive_end(text, k)
        inner = text[k+2:end-1]
        r = subprocess.run(['bash', '-n', '-c', inner], capture_output=True, text=True)
        if r.returncode:
            line = text.count('\n', 0, k) + 1
            problems.append(f'{name}:{line}: bash 3.2 would read this $( ) as: {inner[:80]!r}')
        out.append(text[i:k] + '$(:)'); i = end
    r = subprocess.run(['bash', '-n', '-c', ''.join(out)], capture_output=True, text=True)
    if r.returncode:
        problems.append(f'{name}: syntax error as bash 3.2 would see it: {r.stderr.strip()[:200]}')
    return problems

if __name__ == '__main__':
    bad = []
    for f in sys.argv[1:]:
        bad += check(open(f).read(), f)
    for p in bad:
        print('BASH 3.2 PROBLEM:', p)
    print(f'bash 3.2 check: {len(sys.argv) - 1} file(s), {len(bad)} problem(s)')
    sys.exit(1 if bad else 0)
