"""The §10.8 server-side fixture (docs/project.md §16.4).

Every statement this runs is **extracted from the specification document**,
not copied from a file that might have drifted. The reference copies beside
this file are checked against the document on every run, so a change to the
document that has not been re-verified is reported rather than absorbed.

    python3 src/db/fixture/verify.py

The database comes from DATABASE_URL. The default is the local scratch
PostgreSQL; point it at the self-hosted Supabase instance to verify the
statements against the platform they will actually run on:

    DATABASE_URL=postgresql://... python3 src/db/fixture/verify.py

The schema is created by schema.sql, which reproduces the specification's own
§9 DDL in the fixture's own schema (`fixture`), so the fixture cannot touch
another schema's objects. `--reset-schema` drops that schema and rebuilds
it; the default path only creates what is missing.
"""
import pathlib, subprocess, sys, os, json, tempfile, atexit

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
sys.path.insert(0, str(HERE))
import extract as fixture_extract

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres@127.0.0.1:5432/auditsync"
)
DB = "auditsync"

# The fixture owns ONE schema - `fixture` - and every statement reaches it
# through the search path. Nothing else is visible to a statement, so it
# cannot touch another schema's tables by accident.
os.environ["PGOPTIONS"] = "-c search_path=fixture"

# The destructive path: drop the fixture's schema and rebuild it from
# schema.sql. It is opt-in, because dropping a schema is destructive.
RESET_SCHEMA = "--reset-schema" in sys.argv[1:]

def psql_args(extra):
    """psql arguments for the target database.

    `-X` keeps psql from reading the user's startup file. A `.psqlrc` that
    sets `search_path` would override the connection's `PGOPTIONS`, and the
    fixture's statements would run against another schema than the one it
    owns.
    """
    return ["psql", DATABASE_URL, "-X", "-t", "-A", "-F", "|"] + extra

# --- extract the statements from the document -----------------------------
# The extracted files live in a temp directory: the repository holds the
# reference copies, and nothing derived from the document is committed.
_WORK = pathlib.Path(tempfile.mkdtemp(prefix="sync-fixture-"))
_EXTRACTED = fixture_extract.extract()
for _name, _sql in _EXTRACTED.items():
    (_WORK / _name).write_text(_sql, encoding="utf-8")
ITEM_STMT = os.environ.get("ITEM_STMT", str(_WORK / "apply-item.sql"))
CREATE_STMT = os.environ.get("CREATE_STMT", str(_WORK / "apply-create.sql"))
LEDGER_STMT = os.environ.get("LEDGER_STMT", str(_WORK / "apply-ledger.sql"))

def q(sql):
    r = subprocess.run(psql_args(["-c",sql]), capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()

def acquire_lock():
    """Hold an advisory lock for as long as this run lasts.

    Two concurrent runs against one database would delete each other's rows
    between the scenarios, and the failures would say nothing about the
    statements. The lock is taken with pg_try_advisory_lock, so the second run
    refuses to start rather than waiting for the first one - a fixture run
    that waits is a fixture run nobody is watching.

    The holder is a psql session that reads its statements from a pipe and
    then waits for the next one: it holds the lock and nothing else. When the
    run ends, the pipe is closed, psql reads the end of it, exits, and the
    lock goes with the session. A run that is killed leaves no lock behind -
    a lock held by a session that is still sleeping is a lock the next run
    refuses to take.
    """
    holder = subprocess.Popen(
        ["psql", DATABASE_URL, "-X", "-q", "-t", "-A"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    holder.stdin.write("select pg_try_advisory_lock(874512302);\n")
    holder.stdin.flush()
    taken = holder.stdout.readline().strip()
    if taken != "t":
        release_lock(holder)
        print("Another fixture run holds the lock on this database.")
        print("Wait for it to finish, or point DATABASE_URL at another database.")
        sys.exit(1)
    atexit.register(release_lock, holder)
    return holder

def release_lock(holder):
    """End the holder's session: the pipe closes, psql exits, the lock goes."""
    try:
        holder.stdin.close()
    except (BrokenPipeError, ValueError):
        pass
    try:
        holder.wait(timeout=10)
    except subprocess.TimeoutExpired:
        holder.kill()

ITEM   = "11111111-1111-4111-8111-111111111111"
ITEM2  = "99999999-1111-4111-8111-111111111111"
CATEGORY = "cccccccc-1111-4111-8111-111111111111"
STORE  = "aaaaaaaa-1111-4111-8111-111111111111"
STORE2 = "aaaaaaaa-2222-4222-8222-222222222222"
DEV_A  = "22222222-2222-4222-8222-222222222222"
DEV_B  = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
OP_A   = "33333333-3333-4333-8333-333333333333"
HH     = "00000000-0000-4000-8000-000000000001"   # households.id
ACTOR  = "00000000-0000-4000-8000-0000000000aa"   # auth.users.id

def reset():
    # The destructive statements name their schema. The search path is set for
    # the extracted statements, which are the specification's own SQL; the
    # statements that DELETE rows must not depend on it, because a search
    # path that pointed somewhere else would empty the wrong table.
    q("DELETE FROM fixture.sync_changes; DELETE FROM fixture.sync_operations;"
      " DELETE FROM fixture.entity_conflicts;")
    q("DELETE FROM fixture.item_stores;")
    q("DELETE FROM fixture.items;")
    q("DELETE FROM fixture.categories;")
    q("DELETE FROM fixture.stores;")
    q("""INSERT INTO users (id, email, raw_user_meta_data)
           VALUES ('%s','t@example.com','{"name":"Tester"}'::jsonb)
           ON CONFLICT DO NOTHING;""" % ACTOR)
    q("""INSERT INTO households (id, name, created_by) VALUES ('%s','Household','%s')
           ON CONFLICT DO NOTHING;""" % (HH, ACTOR))
    q("""INSERT INTO stores (id, household_id, name) VALUES ('%s','%s','Costco'),('%s','%s','Aldi')
           ON CONFLICT DO NOTHING;""" % (STORE, HH, STORE2, HH))

def seed_item(version=1, field_meta="{}", **cols):
    vals = {"name": "'Old name'", "quantity": "NULL", "note": "'Old note'",
            "is_checked": "false", "deleted_at": "NULL", "archived_at": "NULL"}
    vals.update(cols)
    col_list = ", ".join(vals.keys())
    val_list = ", ".join(vals.values())
    set_list = ", ".join("%s = %s" % (k, v) for k, v in vals.items())
    fm = "'" + field_meta.replace("'", "''") + "'::jsonb"
    q("""INSERT INTO items (id, household_id, %s, version, field_meta)
           VALUES ('%s','%s',%s,%s,%s)
           ON CONFLICT (id) DO UPDATE SET %s, version=%s, field_meta=%s;""" % (
        col_list, ITEM, HH, val_list, version, fm, set_list, version, fm))

SUBS = {
 "$op_type":"'item.update'",
 "$fields":"'{name,quantity}'::text[]",
 "$payload":"'{\"name\":\"Milk\",\"quantity\":\"2 kg\"}'::jsonb",
 "$entity_id":"'%s'" % ITEM, "$entity_type":"'item'",
 "$household_id":"'%s'" % HH, "$cas_version":"1", "$op_base_version":"1", "$op_lamport":"10",
 "$op_id":"'%s'" % OP_A,
 "$device_id":"'%s'" % DEV_A,
 "$actor_id":"'%s'" % ACTOR,
}

ARCH_PAYLOAD = "'{\"versions\":{\"11111111-1111-4111-8111-111111111111\":6}}'::jsonb"

PG_OUT = psql_args(["-F","\x1f"])

def run(overrides=None, stmt=ITEM_STMT, ledger=True):
    """Apply one operation, then write its ledger row - what the request does.

    The ledger statement DERIVES its own envelope from the rows the batch
    wrote; nothing is assembled in the request layer and passed in.
    """
    sql = pathlib.Path(stmt).read_text(encoding="utf-8")
    subs = dict(SUBS); subs.update(overrides or {})
    for k,v in subs.items(): sql = sql.replace(k,v)
    path = pathlib.Path(_WORK / "run-item.sql"); path.write_text(sql, encoding="utf-8")
    r = subprocess.run(PG_OUT+["-v","ON_ERROR_STOP=1","-f",str(_WORK / "run-item.sql")], capture_output=True, text=True)
    out = (r.stdout+r.stderr).strip()
    if r.returncode != 0:
        return r.returncode, out
    if not r.stdout.strip():
        return r.returncode, out
    parts = r.stdout.strip().split("\x1f")
    if len(parts) < 4:
        return r.returncode, out
    entity_id, changed = parts[0], parts[1]
    # a multi-entity operation has no single entity id
    payload = subs.get("$payload", SUBS["$payload"])
    if '"versions"' in payload:
        entity_id = "NULL"
    if ledger:
        rc2, err = write_ledger(overrides, entity_id)
        if rc2 != 0:
            return rc2, err
    return r.returncode, out

def conflicts_of(out):
    """The conflicts the statement returned: the ones addressed to this device.

    Section 10.8.1 promises the statement returns the conflicts addressed to
    the device that made the request. The fixture has to assert them: a
    statement that always returned an empty array would pass every other
    check in this file.
    """
    parts = out.strip().split("\x1f")
    if len(parts) < 4:
        return None
    try:
        return json.loads(parts[3])
    except ValueError:
        return None

def write_ledger(overrides=None, entity_id=None):
    ls = pathlib.Path(LEDGER_STMT).read_text(encoding="utf-8")
    lsubs = dict(SUBS); lsubs.update(overrides or {})
    if entity_id is None:
        payload = lsubs.get("$payload", SUBS["$payload"])
        entity_id = "NULL" if '"versions"' in payload else None
    if entity_id is not None:
        # A multi-entity operation has no single entity: the ledger stores
        # SQL NULL, not the default id (schema.sql). The value is resolved
        # BEFORE the substitution, because the substitution replaces
        # $entity_id itself.
        lsubs["$entity_id"] = entity_id if entity_id == "NULL" else "'%s'" % entity_id
    for k,v in lsubs.items(): ls = ls.replace(k,v)
    path = pathlib.Path(_WORK / "run-ledger.sql"); path.write_text(ls, encoding="utf-8")
    rl = subprocess.run(PG_OUT+["-v","ON_ERROR_STOP=1","-f",str(_WORK / "run-ledger.sql")], capture_output=True, text=True)
    if rl.returncode != 0:
        return 99, "LEDGER INSERT FAILED: " + (rl.stdout+rl.stderr).strip()
    return 0, ""   

fails=[]
def check(label, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ")+label+("  "+detail if detail else ""))
    if not cond: fails.append(label)

def load_schema():
    """Create the schema this fixture runs against.

    schema.sql is the specification's own §9 DDL, in the fixture's own
    schema (`fixture`). The safe path only creates what is missing; the
    destructive path - dropping the fixture's schema and rebuilding it - is
    opt-in, because it is the one thing here that destroys rows.
    """
    args = ["psql", DATABASE_URL, "-X", "-v", "ON_ERROR_STOP=1"]
    if RESET_SCHEMA:
        args += ["-v", "fixture_reset=1"]
    args += ["-f", str(HERE / "schema.sql")]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("schema.sql failed:\n" + (r.stdout + r.stderr).strip()
                           + "\n(if the fixture's DDL changed, re-run with --reset-schema)")

print("LOCK - one fixture run at a time against one database")
acquire_lock()

print("\nSCHEMA - the specification's own DDL, in the fixture's own schema")
load_schema()
check("schema.sql applied", True)

print("\nDRIFT - the document's statements match the reference copies")
for _name, (_same, _sql) in fixture_extract.check_against_references().items():
    check(f"{_name} in docs/project.md matches the reference copy", _same,
          "" if _same else "THE DOCUMENT HAS CHANGED SINCE IT WAS VERIFIED")

def item_row():
    # The tombstone and the archive are markers, not the timestamp: a
    # timestamp starts with the year, and "del=20" in a row that reads
    # "del=2026-11-13" reads like a version assertion.
    return q("""SELECT name||' / '||coalesce(quantity,'-')||' / v'||version||' / ck='||is_checked
                 ||' / del='||CASE WHEN deleted_at IS NULL THEN 'none' ELSE 'set' END
                 ||' / arch='||CASE WHEN archived_at IS NULL THEN 'none' ELSE 'set' END
                 ||' / meta='||field_meta::text
               FROM items WHERE id='%s'""" % ITEM)

def pairs():
    return q("SELECT store_id||'/v'||version||'/l'||lamport||'/d'||device_id||'/del='||CASE WHEN deleted_at IS NULL THEN 'none' ELSE 'set' END FROM item_stores WHERE item_id='%s' ORDER BY store_id" % ITEM)

def note_and_category():
    # The note and the category are fields like any other, and the row
    # summary does not carry them - so they are read on their own.
    return q("""SELECT coalesce(note,'-')||' / cat='||coalesce(category_id::text,'-')
                 FROM items WHERE id='%s'""" % ITEM)

# ---------------------------------------------------------------- fields
print("FIELD 1 - normal update")
reset(); seed_item()
rc,out = run()
check("statement executes", rc==0, out[:200])
row = item_row()
check("name applied", "Milk" in row, row)
check("version advanced to 2", "/ v2 " in row, row)
check("field_meta holds only the won fields", '"name"' in row and '"quantity"' in row and '"note"' not in row, row)
check("one change-log row", q("SELECT count(*) FROM sync_changes")=="1")
check("one idempotency row", q("SELECT count(*) FROM sync_operations")=="1")

print("\nFIELD 2 - a field lost to a concurrent write")
reset(); seed_item(version=2, quantity="'9 kg'", field_meta='{"quantity":{"v":2,"lamport":20,"device":"%s"}}' % DEV_B)
rc,out = run({"$cas_version":"2","$op_base_version":"1"})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the won field applied", "Milk" in row, row)
check("the lost field kept the server value", "9 kg" in row, row)
c = q("SELECT field||'|'||local_value::text||'|'||server_value::text||'|'||resolution FROM entity_conflicts")
check("a conflict row was written", c.startswith("quantity|"), c)
check("the resolution is lww", c.endswith("lww"), c)

print("\nFIELD 3 - check-wins across a retry (the op keeps its ORIGINAL base version)")
reset(); seed_item(version=4, is_checked="true", field_meta='{"isChecked":{"v":4,"lamport":9,"device":"%s"}}' % DEV_B)
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb","$cas_version":"4","$op_base_version":"3","$op_lamport":"10"})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the item is STILL checked", "ck=true" in row, row)
check("the version did NOT advance", "/ v4 " in row, row)
check("no change-log row", q("SELECT count(*) FROM sync_changes")=="0")
check("the ledger row WAS written (the client is acknowledged)", q("SELECT count(*) FROM sync_operations")=="1")
c = q("SELECT field||'|'||resolution FROM entity_conflicts")
check("a conflict row was written", c.startswith("isChecked|"), c)
check("the resolution is check_wins", c.endswith("check_wins"), c)

print("\nFIELD 3b - a STALE uncheck does not reverse an archive")
# The item is archived and checked; B unchecks from an older base, so the
# uncheck loses to check-wins. The archive's premise (the item is checked)
# still holds, so the archive must stand.
reset(); seed_item(version=4, is_checked="true", archived_at="now()",
                   field_meta='{"isChecked":{"v":4,"lamport":9,"device":"%s"},'
                              '"archivedAt":{"v":4,"lamport":20,"device":"%s"}}' % (DEV_B, DEV_A))
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb","$cas_version":"4",
              "$op_base_version":"3","$op_lamport":"10","$device_id":"'%s'" % DEV_B})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the item is STILL checked", "ck=true" in row, row)
check("the archive was NOT reversed", "arch=set" in row, row)
check("the version did NOT advance", "/ v4 " in row, row)
check("no change-log row", q("SELECT count(*) FROM sync_changes")=="0")
check("the archiver is NOT told its archive was reversed",
      "archivedAt" not in q("SELECT field FROM entity_conflicts"),
      q("SELECT field FROM entity_conflicts"))

print("\nOVERRIDE 1 - an explicit override of isChecked beats check-wins")
# §11: overriding isChecked is allowed and beats check-wins, because an
# explicit user decision outranks a rule another user happened to trigger.
reset(); seed_item(version=4, is_checked="true",
                   field_meta='{"isChecked":{"v":4,"lamport":9,"device":"%s"}}' % DEV_B)
rc,out = run({"$op_type":"'item.override'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb","$cas_version":"4",
              "$op_base_version":"3","$op_lamport":"10","$device_id":"'%s'" % DEV_A})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the item is now UNCHECKED", "ck=false" in row, row)
check("the version advanced to 5", "/ v5 " in row, row)
check("one change-log row", q("SELECT count(*) FROM sync_changes")=="1")
check("the operation was NOT recorded as rejected",
      q("SELECT outcome FROM sync_operations")=="applied",
      q("SELECT outcome FROM sync_operations"))
c = q("SELECT field||'|'||resolution||'|'||device_id||'|'||winner_device_id"
      "||'|'||local_value::text||'|'||server_value::text FROM entity_conflicts")
check("the device whose check was replaced is told", c.startswith("isChecked|override|"), c)
check("the conflict is addressed to that device", "|"+DEV_B+"|" in c, c)
check("the winner is the overriding device", "|"+DEV_A+"|" in c, c)
check("the discarded value is recorded", "|true|" in c, c)
check("the value that replaced it is recorded", c.endswith("|false"), c)

print("\nOVERRIDE 2 - an override tells the device whose value it replaced")
reset(); seed_item(version=2, name="'Their name'",
                   field_meta='{"name":{"v":2,"lamport":20,"device":"%s"}}' % DEV_B)
rc,out = run({"$op_type":"'item.override'","$fields":"'{name}'::text[]",
              "$payload":"'{\"name\":\"My name\"}'::jsonb","$cas_version":"2",
              "$op_base_version":"1","$op_lamport":"30","$device_id":"'%s'" % DEV_A})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the override applied", "My name" in row, row)
check("the version advanced to 3", "/ v3 " in row, row)
check("one change-log row", q("SELECT count(*) FROM sync_changes")=="1")
check("exactly one conflict row", q("SELECT count(*) FROM entity_conflicts")=="1",
      q("SELECT count(*) FROM entity_conflicts"))
c = q("SELECT field||'|'||resolution||'|'||device_id||'|'||winner_device_id"
      "||'|'||local_value::text||'|'||server_value::text FROM entity_conflicts")
check("the conflict names the field", c.startswith("name|"), c)
check("the resolution is override", "|override|" in c, c)
check("the conflict is addressed to the other device", "|"+DEV_B+"|" in c, c)
check("the winner is the overriding device", "|"+DEV_A+"|" in c, c)
check("the discarded value is recorded", '"Their name"' in c, c)
check("the value that replaced it is recorded", '"My name"' in c, c)
check("the overriding device has no conflict of its own",
      q("SELECT count(*) FROM entity_conflicts WHERE device_id='%s'" % DEV_A)=="0",
      q("SELECT count(*) FROM entity_conflicts WHERE device_id='%s'" % DEV_A))

print("\nOVERRIDE 3 - a winning override that unchecks clears the archive")
# The archive's premise is that the item is checked. An override that wins
# and unchecks it takes the premise away, so the archive goes with it - and
# the archiver is told (§11).
reset(); seed_item(version=4, is_checked="true", archived_at="now()",
                   field_meta='{"isChecked":{"v":4,"lamport":9,"device":"%s"},'
                              '"archivedAt":{"v":4,"lamport":20,"device":"%s"}}' % (DEV_B, DEV_A))
rc,out = run({"$op_type":"'item.override'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb","$cas_version":"4",
              "$op_base_version":"3","$op_lamport":"10","$device_id":"'%s'" % DEV_B})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the item is UNCHECKED", "ck=false" in row, row)
check("the archive was cleared - its premise no longer holds", "arch=none" in row, row)
check("the version advanced to 5", "/ v5 " in row, row)
c = q("SELECT field||'|'||resolution||'|'||device_id FROM entity_conflicts")
check("the archiver is told its archive was reversed", c.startswith("archivedAt|rejected|"), c)
check("the loser is the archiving device", c.split("|")[2]==DEV_A, c)

print("\nFIELD 4 - a tombstoned row rejects every write (delete-wins, terminal)")
reset(); seed_item(version=4, deleted_at="now()")
rc,out = run({"$cas_version":"4","$op_base_version":"1"})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the name was NOT changed", "Old name" in row, row)
check("the version did NOT advance", "/ v4 " in row, row)
c = q("SELECT field||'|'||resolution FROM entity_conflicts")
check("a conflict row was written", c.startswith("name|"), c)
check("the resolution is delete_wins", c.endswith("delete_wins"), c)

print("\nFIELD 5 - undelete: an OLDER undelete is refused, a NEWER one clears the tombstone")
reset(); seed_item(version=7, deleted_at="now()",
                   field_meta='{"deletedAt":{"v":7,"lamport":20,"device":"%s"}}' % DEV_B)
rc,out = run({"$op_type":"'item.undelete'","$fields":"'{deletedAt}'::text[]",
              "$payload":ARCH_PAYLOAD,"$cas_version":"7","$op_base_version":"7","$op_lamport":"15"})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the tombstone STAYS", "del=set" in row, row)
c = q("SELECT field||'|'||resolution FROM entity_conflicts")
check("a conflict row was written", c.startswith("deletedAt|"), c)
check("the resolution is rejected", c.endswith("rejected"), c)

reset(); seed_item(version=7, deleted_at="now()",
                   field_meta='{"deletedAt":{"v":7,"lamport":20,"device":"%s"}}' % DEV_B)
rc,out = run({"$op_type":"'item.undelete'","$fields":"'{deletedAt}'::text[]",
              "$payload":ARCH_PAYLOAD,"$cas_version":"7","$op_base_version":"7","$op_lamport":"25",
              "$op_id":"'44444444-4444-4444-8444-444444444444'"})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the tombstone cleared", "del=none" in row, row)
check("the version advanced to 8", "/ v8 " in row, row)

print("\nFIELD 6 - the compare-and-swap is lost")
reset(); seed_item(version=9, name="'Someone else'")
rc,out = run({"$cas_version":"1"})
check("statement executes without error", rc==0, out[:200])
row = item_row()
check("the row was NOT written", "Someone else" in row, row)
check("no change-log row", q("SELECT count(*) FROM sync_changes")=="0")
check("no idempotency row", q("SELECT count(*) FROM sync_operations")=="0")

print("\nFIELD 7 - the note and the category are fields like any other")
reset(); seed_item(version=1)
q("""INSERT INTO categories (id, household_id, name) VALUES ('%s','%s','Produce')
       ON CONFLICT DO NOTHING;""" % (CATEGORY, HH))
rc,out = run({"$fields":"'{note,categoryId}'::text[]",
              "$payload":"""'{"note":"Remember milk","categoryId":"%s"}'::jsonb""" % CATEGORY,
              "$cas_version":"1","$op_base_version":"1"})
check("statement executes", rc==0, out[:200])
row = item_row()
nc = note_and_category()
check("the note applied", "Remember milk" in nc, nc)
check("the category applied", CATEGORY in nc, nc)
check("the version advanced to 2", "/ v2 " in row, row)
check("field_meta holds the note and the category",
      '"note"' in row and '"categoryId"' in row, row)
check("one change-log row", q("SELECT count(*) FROM sync_changes")=="1")

print("\nFIELD 8 - the note LOST to a concurrent write is reported as a conflict")
reset(); seed_item(version=2, note="'Their note'",
                   field_meta='{"note":{"v":2,"lamport":20,"device":"%s"}}' % DEV_B)
rc,out = run({"$fields":"'{note}'::text[]",
              "$payload":"'{\"note\":\"My note\"}'::jsonb",
              "$cas_version":"2","$op_base_version":"1"})
check("statement executes", rc==0, out[:200])
nc = note_and_category()
check("the server's note was kept", "Their note" in nc, nc)
c = q("SELECT field||'|'||local_value::text||'|'||server_value::text||'|'||resolution"
      " FROM entity_conflicts")
check("a conflict row was written", c.startswith("note|"), c)
check("the resolution is lww", c.endswith("lww"), c)
check("the conflict carries both values", '"My note"' in c and '"Their note"' in c, c)

print("\nFIELD 9 - a concurrent CHECK wins over an uncheck")
# The item is unchecked by B at version 4; A checks from the older base 3.
# The base-version gate belongs to the UNCHECK (§11): a check always applies.
reset(); seed_item(version=4, is_checked="false",
                   field_meta='{"isChecked":{"v":4,"lamport":20,"device":"%s"}}' % DEV_B)
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":true}'::jsonb","$cas_version":"4",
              "$op_base_version":"3","$op_lamport":"10","$device_id":"'%s'" % DEV_A})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the item is CHECKED", "ck=true" in row, row)
check("the version advanced to 5", "/ v5 " in row, row)
check("one change-log row", q("SELECT count(*) FROM sync_changes")=="1")
check("no conflict - the check won", q("SELECT count(*) FROM entity_conflicts")=="0")

print("\nFIELD 10 - a winning concurrent update tells the device whose value it displaced")
# B wrote the name at version 4; A writes from the older base 3 at a higher
# lamport and wins. A's value is displaced, and A has to hear about it
# (FR-23): a losing edit is never discarded without a record.
reset(); seed_item(version=4, name="'Their name'",
                   field_meta='{"name":{"v":4,"lamport":20,"device":"%s"}}' % DEV_B)
rc,out = run({"$fields":"'{name}'::text[]",
              "$payload":"'{\"name\":\"My name\"}'::jsonb",
              "$cas_version":"4","$op_base_version":"3","$op_lamport":"30",
              "$device_id":"'%s'" % DEV_A})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the winner's value applied", "My name" in row, row)
check("the version advanced to 5", "/ v5 " in row, row)
c = q("SELECT field||'|'||resolution||'|'||device_id||'|'||local_value::text"
      " FROM entity_conflicts")
check("a conflict row was written", c.startswith("name|"), c)
check("the resolution is lww", "|lww|" in c, c)
check("the conflict is addressed to the displaced device", "|"+DEV_B+"|" in c, c)
check("the displaced value is recorded", "Their name" in c, c)
check("the winner's own response carries no conflict",
      conflicts_of(out)==[], str(conflicts_of(out))[:300])

print("\nDELETE 1 - a delete tombstones the row")
reset(); seed_item(version=1)
rc,out = run({"$op_type":"'item.delete'","$fields":"'{deletedAt}'::text[]",
              "$payload":"'{}'::jsonb"})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the row is tombstoned", "del=set" in row, row)
check("the name was NOT changed", "Old name" in row, row)
check("the version advanced to 2", "/ v2 " in row, row)
check("field_meta records the tombstone", '"deletedAt"' in row, row)
check("one change-log row", q("SELECT count(*) FROM sync_changes")=="1")
check("the change-log row carries the tombstone", q("SELECT deleted FROM sync_changes")=="t")
check("the ledger row was written", q("SELECT count(*) FROM sync_operations")=="1")
check("no conflict row - the delete won", q("SELECT count(*) FROM entity_conflicts")=="0")

# ---------------------------------------------------------------- pairs
print("\nPAIR 1 - an addition whose payload key is `storeId`")
reset(); seed_item()
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":0,"present":true}]}'::jsonb""" % STORE})
check("statement executes", rc==0, out[:200])
p = pairs()
check("the pair row was written", STORE in p, p)
check("it is live", "/del=none" in p, p)
check("the item version advanced", "/ v2 " in item_row(), item_row())
check("the change-log carries storeIds", STORE in q("SELECT payload::text FROM sync_changes"))

print("\nPAIR 2 - a SEQUENTIAL removal wins and TOMBSTONES the pair")
reset(); seed_item()
q("""INSERT INTO item_stores (item_id, store_id, version, lamport, device_id)
       VALUES ('%s','%s',3,20,'%s')""" % (ITEM, STORE, DEV_B))
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":3,"present":false}]}'::jsonb""" % STORE,
              "$op_lamport":"25","$cas_version":"1"})
check("statement executes", rc==0, out[:200])
p = pairs()
check("the pair was NOT deleted, it was tombstoned", STORE in p, p)
check("the tombstone is set", "/del=set" in p, p)
check("the pair version advanced to 4", "/v4/" in p, p)
check("no conflict", q("SELECT count(*) FROM entity_conflicts")=="0")
check("the statement returned no conflicts - the caller won",
      conflicts_of(out)==[], str(conflicts_of(out))[:300])

print("\nPAIR 3 - a CONCURRENT removal still wins (removal_wins)")
reset(); seed_item()
q("""INSERT INTO item_stores (item_id, store_id, version, lamport, device_id)
       VALUES ('%s','%s',3,20,'%s')""" % (ITEM, STORE, DEV_B))
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":2,"present":false}]}'::jsonb""" % STORE,
              "$op_lamport":"15","$cas_version":"1"})
check("statement executes", rc==0, out[:200])
p = pairs()
check("the pair was tombstoned", STORE in p and "/del=set" in p, p)
check("the item version advanced", "/ v2 " in item_row(), item_row())
c = q("SELECT field||'|'||resolution||'|'||device_id||'|'||winner_device_id FROM entity_conflicts")
check("a conflict row was written", c.startswith("storeIds|"), c)
check("the resolution is removal_wins", "|removal_wins|" in c, c)
check("the conflict is addressed to the device whose add was discarded",
      "|"+DEV_B+"|" in c, c)
check("the remover's own response carries no conflict",
      conflicts_of(out)==[], str(conflicts_of(out))[:300])

print("\nPAIR 4 - a CONCURRENT re-add against a tombstone is REFUSED")
reset(); seed_item()
q("""INSERT INTO item_stores (item_id, store_id, version, lamport, device_id, deleted_at)
       VALUES ('%s','%s',4,20,'%s',now())""" % (ITEM, STORE, DEV_B))
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":2,"present":true}]}'::jsonb""" % STORE,
              "$op_lamport":"25","$cas_version":"1"})
check("statement executes", rc==0, out[:200])
p = pairs()
check("the pair STAYS tombstoned", "/del=set" in p, p)
check("the item version did NOT advance", "/ v1 " in item_row(), item_row())
check("no change-log row", q("SELECT count(*) FROM sync_changes")=="0")
check("the ledger row WAS written (the client is acknowledged)", q("SELECT count(*) FROM sync_operations")=="1")
c = q("SELECT field||'|'||store_id||'|'||resolution||'|'||device_id||'|'||winner_device_id FROM entity_conflicts")
check("a per-pair conflict row was written", c.startswith("storeIds|"), c)
check("the conflict names the pair", STORE in c, c)
check("the resolution is removal_wins", "removal_wins" in c, c)
check("the loser is the adding device", c.split("|")[3]==DEV_A, c)
check("the winner is the removing device", c.split("|")[4]==DEV_B, c)
conf = conflicts_of(out)
check("the statement returned the conflict addressed to this device",
      isinstance(conf, list) and len(conf)==1, str(conf)[:300])
check("the returned conflict names the pair",
      isinstance(conf, list) and conf and conf[0].get("storeId")==STORE, str(conf)[:300])
check("the returned conflict names the resolution",
      isinstance(conf, list) and conf and conf[0].get("resolution")=="removal_wins", str(conf)[:300])
check("the returned conflict names the winner",
      isinstance(conf, list) and conf and conf[0].get("winnerDeviceId")==DEV_B, str(conf)[:300])

print("\nPAIR 5 - a SEQUENTIAL removal that loses on lamport keeps the tag")
reset(); seed_item()
q("""INSERT INTO item_stores (item_id, store_id, version, lamport, device_id)
       VALUES ('%s','%s',3,20,'%s')""" % (ITEM, STORE, DEV_B))
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":3,"present":false}]}'::jsonb""" % STORE,
              "$op_lamport":"15","$cas_version":"1"})
check("statement executes", rc==0, out[:200])
p = pairs()
check("the pair stays present", STORE in p and "/del=none" in p, p)
check("the stored ordering key was NOT overwritten", "/l20/" in p, p)
check("the item version did NOT advance", "/ v1 " in item_row(), item_row())
check("no change-log row", q("SELECT count(*) FROM sync_changes")=="0")
c = q("SELECT field||'|'||resolution||'|'||device_id||'|'||winner_device_id FROM entity_conflicts")
check("a conflict row was written", c.startswith("storeIds|"), c)
check("the resolution is lww", "|lww|" in c, c)

print("\nPAIR 6 - a stale ADD must not overwrite the stored ordering key")
reset(); seed_item()
q("""INSERT INTO item_stores (item_id, store_id, version, lamport, device_id)
       VALUES ('%s','%s',5,20,'%s')""" % (ITEM, STORE, DEV_B))
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":3,"present":true}]}'::jsonb""" % STORE,
              "$op_lamport":"15","$cas_version":"1"})
check("statement executes", rc==0, out[:200])
p = pairs()
check("the stored ordering key was NOT overwritten", "/l20/" in p, p)
check("the stored version was NOT bumped", "/v5/" in p, p)

print("\nPAIR 7 - two devices add different stores; both survive")
reset(); seed_item()
rc,_ = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
            "$payload":"""'{"storeIds":[{"storeId":"%s","version":0,"present":true}]}'::jsonb""" % STORE})
rc2,out2 = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
                "$payload":"""'{"storeIds":[{"storeId":"%s","version":0,"present":true}]}'::jsonb""" % STORE2,
                "$cas_version":"2","$op_base_version":"2","$op_lamport":"12",
                "$op_id":"'44444444-4444-4444-8444-444444444444'"})
check("statement executes", rc2==0, out2[:200])
p = pairs()
check("both tags are present", STORE in p and STORE2 in p, p)
check("no conflict", q("SELECT count(*) FROM entity_conflicts")=="0")
snap = q("SELECT payload::text FROM sync_changes ORDER BY seq DESC LIMIT 1")
check("the snapshot carries the tag this operation wrote", STORE2 in snap, snap[:300])
check("the snapshot carries the item's OTHER tag - the pair this operation did not touch",
      STORE in snap, snap[:300])

print("\nPAIR 8 - removing a tag that is not there is a no-op")
reset(); seed_item()
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":0,"present":false}]}'::jsonb""" % STORE})
check("statement executes", rc==0, out[:200])
check("no pair rows", pairs()=="", pairs())
check("no conflict", q("SELECT count(*) FROM entity_conflicts")=="0")

print("\nPAIR 9 - the snapshot carries a REMOVED tag, so the client can send its version back")
reset(); seed_item()
q("""INSERT INTO item_stores (item_id, store_id, version, lamport, device_id)
       VALUES ('%s','%s',3,20,'%s')""" % (ITEM, STORE, DEV_B))
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":3,"present":false}]}'::jsonb""" % STORE,
              "$op_lamport":"25","$cas_version":"1"})
check("statement executes", rc==0, out[:200])
snap = q("SELECT payload::text FROM sync_changes")
check("the snapshot carries the removed tag", STORE in snap, snap)
check("the snapshot marks it absent", '"present": false' in snap, snap)
check("the snapshot carries the removal's version", '"version": 4' in snap, snap)

# And now the client sends that version back: the pair it has seen is the
# tombstone, so its re-add is SEQUENTIAL - and a sequential write wins iff its
# (lamport, deviceId) is higher (section 11). This is the branch that updates
# the pair in place; without this step the statement would never run it.
rc,out = run({"$op_type":"'item.storeTags'","$fields":"'{}'::text[]",
              "$payload":"""'{"storeIds":[{"storeId":"%s","version":4,"present":true}]}'::jsonb""" % STORE,
              "$op_lamport":"30","$cas_version":"2"})
check("statement executes", rc==0, out[:200])
p = pairs()
check("the pair is LIVE again - the client re-added the tag it had seen",
      "/del=none" in p, p)
check("the pair version advanced to 5", "/v5/" in p, p)
check("the pair carries the client's ordering key", "/l30/" in p, p)
check("the pair is the client's", "/d"+DEV_A+"/" in p, p)
check("no conflict - the client won sequentially",
      q("SELECT count(*) FROM entity_conflicts")=="0")
check("the statement returned no conflicts - the caller won",
      conflicts_of(out)==[], str(conflicts_of(out))[:300])

# ---------------------------------------------------------------- archive ordering
print("\nARCHIVE 1 - the archive is skipped when the item is no longer checked")
reset(); seed_item(version=6, is_checked="false")
rc,out = run({"$op_type":"'item.archive'","$fields":"'{archivedAt}'::text[]",
              "$payload":ARCH_PAYLOAD,"$cas_version":"6","$op_base_version":"6"})
check("statement executes", rc==0, out[:200])
check("the item was NOT archived", "arch=none" in item_row(), item_row())
check("the version did NOT advance", "/ v6 " in item_row(), item_row())

print("\nARCHIVE 2 - the archive applies to a checked item")
reset(); seed_item(version=6, is_checked="true")
rc,out = run({"$op_type":"'item.archive'","$fields":"'{archivedAt}'::text[]",
              "$payload":ARCH_PAYLOAD,"$cas_version":"6","$op_base_version":"6"})
check("statement executes", rc==0, out[:200])
check("the item WAS archived", "arch=set" in item_row(), item_row())
check("the version advanced to 7", "/ v7 " in item_row(), item_row())

print("\nARCHIVE 3 - arrival order: the UNCHECK arrives first, the archive second")
# B unchecks (version 6 -> 7); then A's archive (base 6) arrives.
reset(); seed_item(version=6, is_checked="true")
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb",
              "$device_id":"'%s'" % DEV_B,"$cas_version":"6","$op_base_version":"6"})
check("the uncheck applies", rc==0, out[:200])
check("the item is unchecked", "ck=false" in item_row(), item_row())
rc,out = run({"$op_type":"'item.archive'","$fields":"'{archivedAt}'::text[]",
              "$payload":ARCH_PAYLOAD,"$cas_version":"7","$op_base_version":"6",
              "$op_lamport":"20","$op_id":"'44444444-4444-4444-8444-444444444444'"})
check("the archive is skipped (the version moved on)", rc==0, out[:200])
check("the item is NOT archived", "arch=none" in item_row(), item_row())
check("the item is NOT checked", "ck=false" in item_row(), item_row())

print("\nARCHIVE 4 - arrival order: the ARCHIVE arrives first, the uncheck second")
# A archives (version 6 -> 7); then B's concurrent uncheck (base 6) arrives.
reset(); seed_item(version=6, is_checked="true")
rc,out = run({"$op_type":"'item.archive'","$fields":"'{archivedAt}'::text[]",
              "$payload":ARCH_PAYLOAD,"$cas_version":"6","$op_base_version":"6","$op_lamport":"20"})
check("the archive applies", rc==0, out[:200])
check("the item IS archived", "arch=set" in item_row(), item_row())
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb",
              "$device_id":"'%s'" % DEV_B,"$cas_version":"7","$op_base_version":"6",
              "$op_lamport":"15","$op_id":"'44444444-4444-4444-8444-444444444444'"})
check("the uncheck applies", rc==0, out[:200])
check("the archive was REVERSED - the item is not archived", "arch=none" in item_row(), item_row())
check("the item is NOT checked", "ck=false" in item_row(), item_row())
c = q("SELECT field||'|'||resolution||'|'||device_id||'|'||winner_device_id FROM entity_conflicts")
check("the archiver is told its archive was reversed", c.startswith("archivedAt|rejected|"), c)
check("the loser is the archiving device", c.split("|")[2] == DEV_A, c)
check("the winner is the unchecking device", c.split("|")[3] == DEV_B, c)

print("\nARCHIVE 5 - both arrival orders converge on the same state")
import subprocess as _sp
def end_state(order):
    reset(); seed_item(version=6, is_checked="true")
    if order == "uncheck-first":
        run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
             "$payload":"'{\"isChecked\":false}'::jsonb",
             "$device_id":"'%s'" % DEV_B,"$cas_version":"6","$op_base_version":"6"})
        run({"$op_type":"'item.archive'","$fields":"'{archivedAt}'::text[]","$payload":ARCH_PAYLOAD,
             "$cas_version":"7","$op_base_version":"6","$op_lamport":"20",
             "$op_id":"'44444444-4444-4444-8444-444444444444'"})
    else:
        run({"$op_type":"'item.archive'","$fields":"'{archivedAt}'::text[]","$payload":ARCH_PAYLOAD,
             "$cas_version":"6","$op_base_version":"6","$op_lamport":"20"})
        run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
             "$payload":"'{\"isChecked\":false}'::jsonb",
             "$device_id":"'%s'" % DEV_B,"$cas_version":"7","$op_base_version":"6",
             "$op_lamport":"15","$op_id":"'44444444-4444-4444-8444-444444444444'"})
    r = q("SELECT is_checked||'|'||CASE WHEN archived_at IS NULL THEN 'none' ELSE 'set' END FROM items WHERE id='%s'" % ITEM)
    return r
a = end_state("uncheck-first"); b = end_state("archive-first")
check("both orders leave the item unchecked and not archived", a == b, "uncheck-first=%s  archive-first=%s" % (a,b))
check("the converged state is unchecked and not archived", a == "false|none", a)

print("\nUNARCHIVE 1 - an unarchive clears the archive")
# The archive is what puts the item out of the active list; the unarchive
# puts it back. The check state is untouched - the item was checked when it
# was archived, and it still is.
reset(); seed_item(version=6, is_checked="true", archived_at="now()",
                   field_meta='{"archivedAt":{"v":6,"lamport":20,"device":"%s"}}' % DEV_A)
rc,out = run({"$op_type":"'item.unarchive'","$fields":"'{archivedAt}'::text[]",
              "$payload":"'{}'::jsonb","$cas_version":"6","$op_base_version":"6"})
check("statement executes", rc==0, out[:200])
row = item_row()
check("the archive was cleared", "arch=none" in row, row)
check("the item is STILL checked", "ck=true" in row, row)
check("the version advanced to 7", "/ v7 " in row, row)
check("one change-log row", q("SELECT count(*) FROM sync_changes")=="1")
check("the ledger row was written", q("SELECT count(*) FROM sync_operations")=="1")

print("\nBULKUNARCHIVE 1 - a bulk unarchive clears the archive on every candidate")
reset()
BULK3_IDS = ["eeeeeeee-0000-4000-8000-000000000001",
             "eeeeeeee-0000-4000-8000-000000000002"]
for iid in BULK3_IDS:
    q("""INSERT INTO items (id, household_id, name, quantity, note, version, field_meta, is_checked, archived_at)
           VALUES ('%s','%s','Item',NULL,NULL,3,'{}'::jsonb,true,now())""" % (iid, HH))
BULK3_PAYLOAD = """'{"versions":{"eeeeeeee-0000-4000-8000-000000000001":3,"eeeeeeee-0000-4000-8000-000000000002":3}}'::jsonb"""
for iid in BULK3_IDS:
    rc,out = run({"$op_type":"'item.bulkUnarchive'","$fields":"'{archivedAt}'::text[]",
                  "$payload":BULK3_PAYLOAD,"$cas_version":"3","$op_base_version":"3",
                  "$entity_id":"'%s'" % iid, "$op_id":"'77777777-7777-4777-8777-777777777777'"},
                 ledger=False)
    check("the statement for %s executes" % iid[-1], rc==0, out[:200])
rc,out = write_ledger({"$op_type":"'item.bulkUnarchive'","$fields":"'{archivedAt}'::text[]",
                        "$payload":BULK3_PAYLOAD, "$op_id":"'77777777-7777-4777-8777-777777777777'"})
check("the ledger insert does not raise", rc==0, out[:300])
check("both items are NOT archived",
      q("SELECT count(*) FROM items WHERE archived_at IS NULL")=="2",
      q("SELECT count(*) FROM items WHERE archived_at IS NULL"))
check("two change-log rows", q("SELECT count(*) FROM sync_changes")=="2",
      q("SELECT count(*) FROM sync_changes"))
check("ONE ledger row for the one operation",
      q("SELECT count(*) FROM sync_operations")=="1",
      q("SELECT count(*) FROM sync_operations"))

# ---------------------------------------------------------------- ledger safety
print("\nLEDGER 1 - a BULK operation: two items sharing one opId")
reset()
BULK1_PAYLOAD = """'{"versions":{"11111111-1111-4111-8111-111111111111":3,"22222222-2222-4222-8222-222222222222":3}}'::jsonb"""
seed_item(version=3, is_checked="true")
q("""INSERT INTO items (id, household_id, name, quantity, note, version, field_meta, is_checked)
       VALUES ('22222222-2222-4222-8222-222222222222','%s','Bread',NULL,NULL,3,'{}'::jsonb,true)""" % HH)
rc,out = run({"$op_type":"'item.bulkArchive'","$fields":"'{archivedAt}'::text[]",
              "$payload":BULK1_PAYLOAD,"$cas_version":"3","$op_base_version":"3",
              "$op_id":"'55555555-5555-4555-8555-555555555555'"}, ledger=False)
check("the first item's statement executes", rc==0, out[:200])
rc2,out2 = run({"$op_type":"'item.bulkArchive'","$fields":"'{archivedAt}'::text[]",
                "$payload":BULK1_PAYLOAD,"$cas_version":"3","$op_base_version":"3",
                "$entity_id":"'22222222-2222-4222-8222-222222222222'",
                "$op_id":"'55555555-5555-4555-8555-555555555555'"}, ledger=False)
check("the second item's statement executes", rc2==0, out2[:300])
# The ledger row is written ONCE, after both candidates: the envelope is
# derived from the rows the batch wrote, so it has to be derived after them.
rc3,out3 = write_ledger({"$op_type":"'item.bulkArchive'","$fields":"'{archivedAt}'::text[]",
                          "$payload":BULK1_PAYLOAD,"$op_id":"'55555555-5555-4555-8555-555555555555'"})
check("the ledger insert does not raise", rc3==0, out3[:300])
check("both items are archived",
      q("SELECT count(*) FROM items WHERE archived_at IS NOT NULL")=="2",
      q("SELECT count(*) FROM items WHERE archived_at IS NOT NULL"))
check("two change-log rows", q("SELECT count(*) FROM sync_changes")=="2",
      q("SELECT count(*) FROM sync_changes"))
check("ONE ledger row for the one operation",
      q("SELECT count(*) FROM sync_operations")=="1",
      q("SELECT count(*) FROM sync_operations"))
check("the ledger row has NO entity id - a bulk operation spans several entities",
      q("SELECT entity_id FROM sync_operations")=="",
      q("SELECT entity_id FROM sync_operations"))
res = q("SELECT result::text FROM sync_operations")
check("the envelope carries BOTH items",
      '"entityId": "11111111-1111-4111-8111-111111111111"' in res and
      '"entityId": "22222222-2222-4222-8222-222222222222"' in res, res[:400])

print("\nLEDGER 2 - a REPLAY of an operation that won nothing")
reset(); seed_item(version=4, is_checked="true",
                   field_meta='{"isChecked":{"v":4,"lamport":9,"device":"%s"}}' % DEV_B)
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb","$cas_version":"4",
              "$op_base_version":"3","$op_lamport":"10"})
check("the first attempt is refused, not applied", rc==0, out[:200])
check("one ledger row", q("SELECT count(*) FROM sync_operations")=="1")
check("no change-log row", q("SELECT count(*) FROM sync_changes")=="0")
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb","$cas_version":"4",
              "$op_base_version":"3","$op_lamport":"10"})
check("the REPLAY does not raise", rc==0, out[:300])
check("still one ledger row", q("SELECT count(*) FROM sync_operations")=="1",
      q("SELECT count(*) FROM sync_operations"))
check("still no change-log row", q("SELECT count(*) FROM sync_changes")=="0")
check("no duplicate conflict row", q("SELECT count(*) FROM entity_conflicts")=="1",
      q("SELECT count(*) FROM entity_conflicts"))

print("\nLEDGER 3 - a REPLAY of an applied operation")
reset(); seed_item(version=1)
rc,out = run()
check("the first attempt applies", rc==0, out[:200])
rc,out = run()
check("the REPLAY does not raise", rc==0, out[:300])
check("still one ledger row", q("SELECT count(*) FROM sync_operations")=="1",
      q("SELECT count(*) FROM sync_operations"))
check("still one change-log row", q("SELECT count(*) FROM sync_changes")=="1",
      q("SELECT count(*) FROM sync_changes"))

print("\nLEDGER 4 - the outcome vocabulary")
reset(); seed_item(version=1)
rc,out = run()
check("an applied operation is recorded as 'applied'",
      q("SELECT outcome FROM sync_operations")=="applied", q("SELECT outcome FROM sync_operations"))
reset(); seed_item(version=4, is_checked="true",
                   field_meta='{"isChecked":{"v":4,"lamport":9,"device":"%s"}}' % DEV_B)
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb","$cas_version":"4","$op_base_version":"3"})
check("an operation that won nothing is recorded as 'rejected'",
      q("SELECT outcome FROM sync_operations")=="rejected", q("SELECT outcome FROM sync_operations"))

# ---------------------------------------------------------------- bulk outcomes
print("\nBULK 1 - a MIXED bulk operation: one archived, one skipped, one contested")
reset()
for iid, ver, chk in [("aaaaaaaa-0000-4000-8000-000000000001", 3, True),
                      ("aaaaaaaa-0000-4000-8000-000000000002", 3, True),
                      ("aaaaaaaa-0000-4000-8000-000000000003", 3, False)]:
    q("""INSERT INTO items (id, household_id, name, quantity, note, version, field_meta, is_checked)
           VALUES ('%s','%s','Item %s',NULL,NULL,%d,'{}'::jsonb,%s)""" % (iid, HH, iid[-1], ver, "true" if chk else "false"))
q("UPDATE items SET version = 9 WHERE id = 'aaaaaaaa-0000-4000-8000-000000000002'")  # B moved on
VERS = '{"versions":{"aaaaaaaa-0000-4000-8000-000000000001":3,"aaaaaaaa-0000-4000-8000-000000000002":3,"aaaaaaaa-0000-4000-8000-000000000003":3}}'
for iid, ver in [("aaaaaaaa-0000-4000-8000-000000000001", 3),
                 ("aaaaaaaa-0000-4000-8000-000000000002", 3),
                 ("aaaaaaaa-0000-4000-8000-000000000003", 3)]:
    rc,out = run({"$op_type":"'item.bulkArchive'","$fields":"'{archivedAt}'::text[]",
                  "$payload":"'%s'::jsonb" % VERS, "$cas_version":str(ver), "$op_base_version":str(ver),
                  "$entity_id":"'%s'" % iid, "$op_id":"'55555555-5555-4555-8555-555555555555'"},
                 ledger=False)
    check("the statement for %s executes" % iid[-1], rc==0, out[:200])
rc,out = write_ledger({"$op_type":"'item.bulkArchive'","$fields":"'{archivedAt}'::text[]",
                        "$payload":"'%s'::jsonb" % VERS, "$op_id":"'55555555-5555-4555-8555-555555555555'"})
check("the ledger insert does not raise", rc==0, out[:300])
res = q("SELECT result::text FROM sync_operations")
check("ONE ledger row", q("SELECT count(*) FROM sync_operations")=="1", q("SELECT count(*) FROM sync_operations"))
check("entities: 1 (only the archived item)", '"entityId": "aaaaaaaa-0000-4000-8000-000000000001"' in res, res[:300])
check("skipped: 1 (the lost compare-and-swap)", '"skipped": 1' in res, res[:300])
check("conflicts: 1 (the contested item)", '"field": "archivedAt"' in res, res[:300])
check("outcome: 'partial'", q("SELECT outcome FROM sync_operations")=="partial", q("SELECT outcome FROM sync_operations"))
check("one change-log row", q("SELECT count(*) FROM sync_changes")=="1", q("SELECT count(*) FROM sync_changes"))
check("one conflict row", q("SELECT count(*) FROM entity_conflicts")=="1", q("SELECT count(*) FROM entity_conflicts"))
check("the ledger row has NO entity id - a bulk operation spans several entities",
      q("SELECT entity_id FROM sync_operations")=="", q("SELECT entity_id FROM sync_operations"))

print("\nBULK 2 - a bulk operation where EVERY candidate was skipped")
reset()
q("""INSERT INTO items (id, household_id, name, quantity, note, version, field_meta, is_checked)
       VALUES ('bbbbbbbb-0000-4000-8000-000000000001','%s','A',NULL,NULL,9,'{}'::jsonb,true),
              ('bbbbbbbb-0000-4000-8000-000000000002','%s','B',NULL,NULL,9,'{}'::jsonb,true)""" % (HH, HH))
VERS2 = '{"versions":{"bbbbbbbb-0000-4000-8000-000000000001":3,"bbbbbbbb-0000-4000-8000-000000000002":3}}'
for iid in ["bbbbbbbb-0000-4000-8000-000000000001","bbbbbbbb-0000-4000-8000-000000000002"]:
    rc,out = run({"$op_type":"'item.bulkArchive'","$fields":"'{archivedAt}'::text[]",
                  "$payload":"'%s'::jsonb" % VERS2, "$cas_version":"3", "$op_base_version":"3",
                  "$entity_id":"'%s'" % iid, "$op_id":"'66666666-6666-4666-8666-666666666666'"},
                 ledger=False)
    check("the statement for %s executes" % iid[-1], rc==0, out[:200])
rc,out = write_ledger({"$op_type":"'item.bulkArchive'","$fields":"'{archivedAt}'::text[]",
                        "$payload":"'%s'::jsonb" % VERS2, "$op_id":"'66666666-6666-4666-8666-666666666666'"})
check("the ledger insert does not raise", rc==0, out[:300])
check("a ledger row IS written (the op was decided)", q("SELECT count(*) FROM sync_operations")=="1",
      q("SELECT count(*) FROM sync_operations"))
check("the ledger row has NO entity id - a bulk operation spans several entities",
      q("SELECT entity_id FROM sync_operations")=="", q("SELECT entity_id FROM sync_operations"))
res = q("SELECT result::text FROM sync_operations")
check("skipped: 2", '"skipped": 2' in res, res[:300])
check("outcome: 'rejected'", q("SELECT outcome FROM sync_operations")=="rejected", q("SELECT outcome FROM sync_operations"))

print("\nBULK 3 - a row archived BEFORE the sync model (no field_meta entry)")
reset()
q("""INSERT INTO items (id, household_id, name, quantity, note, version, field_meta, is_checked, archived_at)
       VALUES ('cccccccc-0000-4000-8000-000000000001','%s','Old',NULL,NULL,5,'{}'::jsonb,true,now())""" % HH)
rc,out = run({"$op_type":"'item.check'","$fields":"'{isChecked}'::text[]",
              "$payload":"'{\"isChecked\":false}'::jsonb","$cas_version":"5","$op_base_version":"5",
              "$entity_id":"'cccccccc-0000-4000-8000-000000000001'"})
check("the statement does NOT raise", rc==0, out[:300])
row = q("""SELECT is_checked||'|'||CASE WHEN archived_at IS NULL THEN 'none' ELSE 'set' END FROM items
             WHERE id='cccccccc-0000-4000-8000-000000000001'""")
check("the item is unchecked", row.startswith("false"), row)
check("the archive was cleared", row.endswith("|none"), row)
check("NO conflict row - the archiver is unknown, so there is no loser to notify",
      q("SELECT count(*) FROM entity_conflicts")=="0", q("SELECT count(*) FROM entity_conflicts"))

print("\nBULK 4 - a create whose id was already taken writes NO ledger row")
reset(); seed_item()
rc,out = run({"$op_type":"'item.create'","$fields":"'{}'::text[]",
              "$cas_version":"0",
              "$payload":"""'{"name":"Dupe","storeIds":["%s"]}'::jsonb""" % STORE},
             stmt=CREATE_STMT, ledger=False)
check("the statement executes", rc==0, out[:200])
rc,out = write_ledger({"$op_type":"'item.create'","$fields":"'{}'::text[]",
                        "$cas_version":"0",
                        "$payload":"""'{"name":"Dupe","storeIds":["%s"]}'::jsonb""" % STORE})
check("the ledger insert does not raise", rc==0, out[:300])
check("NO ledger row - the create was not decided, so the client is told DUPLICATE_ID",
      q("SELECT count(*) FROM sync_operations")=="0", q("SELECT count(*) FROM sync_operations"))

# ---------------------------------------------------------------- entity types
print("\nENTITY 1 - a CATEGORY operation is recorded in the ledger")
reset()
q("""INSERT INTO categories (id, household_id, name, version, field_meta, last_op_id, lamport)
       VALUES ('dddddddd-1111-4111-8111-111111111111','%s','Produce',1,'{}'::jsonb,
               '77777777-7777-4777-8777-777777777777',10)""" % HH)
rc,out = write_ledger({"$op_type":"'category.rename'","$entity_type":"'category'",
                        "$entity_id":"'dddddddd-1111-4111-8111-111111111111'",
                        "$op_id":"'77777777-7777-4777-8777-777777777777'"})
check("the ledger insert does not raise", rc==0, out[:300])
check("the category operation IS recorded", q("SELECT count(*) FROM sync_operations")=="1",
      q("SELECT count(*) FROM sync_operations"))
check("its entity_type is 'category'", q("SELECT entity_type FROM sync_operations")=="category",
      q("SELECT entity_type FROM sync_operations"))

print("\nENTITY 2 - a STORE operation is recorded in the ledger")
reset()
q("""INSERT INTO stores (id, household_id, name, version, field_meta, last_op_id, lamport)
       VALUES ('eeeeeeee-1111-4111-8111-111111111111','%s','Costco Express',1,'{}'::jsonb,
               '88888888-8888-4888-8888-888888888888',10)""" % HH)
rc,out = write_ledger({"$op_type":"'store.rename'","$entity_type":"'store'",
                        "$entity_id":"'eeeeeeee-1111-4111-8111-111111111111'",
                        "$op_id":"'88888888-8888-4888-8888-888888888888'"})
check("the ledger insert does not raise", rc==0, out[:300])
check("the store operation IS recorded", q("SELECT count(*) FROM sync_operations")=="1",
      q("SELECT count(*) FROM sync_operations"))

print("\nENTITY 3 - an operation whose compare-and-swap was LOST is still not recorded")
reset()
rc,out = write_ledger({"$op_type":"'item.update'","$entity_type":"'item'",
                        "$entity_id":"'11111111-1111-4111-8111-111111111111'",
                        "$op_id":"'99999999-9999-4999-8999-999999999999'"})
check("the ledger insert does not raise", rc==0, out[:300])
check("NO ledger row - the operation must stay retryable",
      q("SELECT count(*) FROM sync_operations")=="0", q("SELECT count(*) FROM sync_operations"))

# ---------------------------------------------------------------- create
# ------------------------------------------------------- the advisory lock (§10.8.4)
print("\nLOCK 1 - the per-household advisory lock takes a uuid")
reset()
# hashtextextended takes text, and household_id is a uuid (§9.1a), so the
# parameter is cast. The statement must succeed, must be deterministic for
# the same household, and must differ between households.
#
# The lock is taken and released in ONE session: the acquisition, the count
# while the transaction is open and the count after the commit have to be the
# same backend's, or the assertion says nothing about the lock it means to
# check. The count filters on this session's own pid, so the fixture's
# run-lock - a session-level lock in another session - is not counted.
lock_sql = (
    "BEGIN;"
    "SELECT 'key=' || hashtextextended('%s'::text, 0);"
    "SELECT pg_advisory_xact_lock(hashtextextended('%s'::text, 0));"
    "SELECT 'held=' || count(*) FROM pg_locks"
    " WHERE locktype='advisory' AND pid=pg_backend_pid();"
    "COMMIT;"
    "SELECT 'released=' || count(*) FROM pg_locks"
    " WHERE locktype='advisory' AND pid=pg_backend_pid();" % (HH, HH))
rc = subprocess.run(PG_OUT+["-q","-v","ON_ERROR_STOP=1","-c",lock_sql], capture_output=True, text=True)
check("the lock statement executes", rc.returncode==0, (rc.stdout+rc.stderr).strip()[:200])
lines = [l for l in rc.stdout.strip().split("\n") if l]
kv = dict(l.split("=", 1) for l in lines if "=" in l)
key = kv.get("key", "")
check("it yields a 64-bit lock key",
      key.lstrip("-").isdigit() and abs(int(key)) < 2**63, key)
same = subprocess.run(PG_OUT+["-c","SELECT hashtextextended('%s'::text, 0)" % HH], capture_output=True, text=True).stdout.strip()
check("the same household yields the same key", same == key, "%s vs %s" % (same, key))
other = subprocess.run(PG_OUT+["-c","SELECT hashtextextended('%s'::text, 0)" % "00000000-0000-4000-8000-000000000002"],
                        capture_output=True, text=True).stdout.strip()
check("a different household yields a different key", other != key, "%s vs %s" % (other, key))
check("the lock is held while the transaction is open", kv.get("held")=="1", kv.get("held",""))
check("the lock is transaction-scoped, so it is released on commit",
      kv.get("released")=="0", kv.get("released",""))

print("\nCREATE 1 - item.create writes the item AND its tags")
reset()
rc,out = run({"$op_type":"'item.create'","$fields":"'{}'::text[]",
              "$entity_id":"'%s'" % ITEM2, "$cas_version":"0",
              "$payload":"""'{"name":"Eggs","quantity":"12","categoryId":null,"storeIds":["%s","%s"]}'::jsonb""" % (STORE, STORE2),
              "$op_lamport":"10"}, stmt=CREATE_STMT)
check("statement executes", rc==0, out[:300])
row = q("""SELECT name||' / '||quantity||' / v'||version||' / meta='||field_meta::text
             FROM items WHERE id='%s'""" % ITEM2)
check("the item was created", "Eggs" in row, row)
check("the version is 1", "/ v1 " in row, row)
check("field_meta records the fields the create wrote", '"name"' in row and '"quantity"' in row, row)
p = q("SELECT store_id||'/v'||version FROM item_stores WHERE item_id='%s' ORDER BY store_id" % ITEM2)
check("BOTH tag rows were written (C.6)", STORE in p and STORE2 in p, p)
check("the change-log carries the tags", STORE in q("SELECT payload::text FROM sync_changes"))
check("one idempotency row", q("SELECT count(*) FROM sync_operations")=="1")

print("\nCREATE 2 - a create whose id is already taken writes nothing")
reset(); seed_item()
rc,out = run({"$op_type":"'item.create'","$fields":"'{}'::text[]",
              "$cas_version":"0",
              "$payload":"""'{"name":"Dupe","storeIds":["%s"]}'::jsonb""" % STORE},
             stmt=CREATE_STMT)
check("statement executes", rc==0, out[:200])
check("the pre-existing item was NOT overwritten", q("SELECT name FROM items WHERE id='%s'" % ITEM)=="Old name")
check("no orphan tag rows", q("SELECT count(*) FROM item_stores")=="0")
check("no change-log row", q("SELECT count(*) FROM sync_changes")=="0")

print("\n"+("ALL PASSED" if not fails else f"{len(fails)} FAILED: {fails}"))
sys.exit(1 if fails else 0)
