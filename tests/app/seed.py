# Seeds a userData folder for the regression suites. argv: kind dir
import json, os, sys, time, datetime
kind, ud = sys.argv[1], sys.argv[2]
os.makedirs(ud, exist_ok=True)
now = time.time() * 1000
yesterday = datetime.date.today() - datetime.timedelta(days=1)
ykey = f"{yesterday.year}-{yesterday.month}-{yesterday.day}"
def task(i, title, **kw):
    t = dict(id=i, title=title, done=False, createdAt=int(now) - 86400000, completedAt=None, important=False, repeat='none', remindAt=None, reminded=False)
    t.update(kw); return t
if kind == 'regress':
    future = int((datetime.datetime.now() + datetime.timedelta(days=3)).replace(hour=10, minute=0, second=0, microsecond=0).timestamp() * 1000)
    tasks = [task('t1', 'Reply to emails'), task('t2', 'Update website banner'), task('t3', 'Pay rent'), task('t4', 'Book flights'),
             task('t5', 'Morning workout', done=True, completedAt=int(now) - 86400000, repeat='daily'),
             task('t6', 'Weekly review', repeat='daily', remindAt=future)]
    json.dump(dict(firstRunDone=True, lastDay=ykey, lastSummaryDay=ykey, lastVersion='1.5.0'), open(f'{ud}/meta.json', 'w'))
    json.dump(dict(dailySummary=True, dailySummaryTime='00:00', notifications=True), open(f'{ud}/settings.json', 'w'))
    print(future)
else:
    tasks = [task('a', 'Call the dentist'), task('b', 'Send the invoice'), task('c', 'Record the demo video', done=True, completedAt=int(now))]
    json.dump(dict(firstRunDone=True, lastVersion='1.5.0'), open(f'{ud}/meta.json', 'w'))
json.dump(dict(version=1, tasks=tasks), open(f'{ud}/tasks.json', 'w'))
