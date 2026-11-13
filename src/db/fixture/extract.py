"""Extract §10.8's three statements from `docs/project.md`.

The statements are found **by content, not by block index** — the document has
other SQL blocks (the schema, the indexes, the RLS policies) and they move as
the document grows, so a positional extractor would silently pick up the wrong
one.

This is the point of the whole fixture: the SQL that is verified is the SQL
that is *specified*. There is no copy to drift.
"""
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
DOC = REPO / "docs" / "project.md"


def extract(doc_path=None):
    """Return {name: sql} for the three §10.8 statements."""
    doc = pathlib.Path(doc_path or DOC).read_text(encoding="utf-8")
    blocks = [m.group(1) for m in re.finditer(r"```sql\n(.*?)```", doc, re.S)]

    def find(pred, what):
        hits = [b for b in blocks if pred(b)]
        if len(hits) != 1:
            raise SystemExit(
                f"{what}: expected exactly one SQL block in the document, "
                f"found {len(hits)}"
            )
        return hits[0]

    return {
        "apply-item.sql": find(
            lambda b: b.lstrip().startswith("WITH before AS ("), "the item statement"
        ),
        "apply-create.sql": find(
            lambda b: b.lstrip().startswith("WITH created AS ("), "the create statement"
        ),
        "apply-ledger.sql": find(
            lambda b: "sync_operations (op_id" in b, "the ledger statement"
        ),
    }


def check_against_references():
    """Compare the document's statements with the checked-in reference copies.

    The reference copies are what a reviewer reads and what was last verified.
    If the document has changed since, that is worth saying out loud rather
    than discovering silently.
    """
    out = {}
    for name, sql in extract().items():
        reference = (HERE / name).read_text(encoding="utf-8")
        out[name] = (sql.strip() == reference.strip(), sql)
    return out


if __name__ == "__main__":
    import sys

    for name, (same, sql) in check_against_references().items():
        state = "identical to the reference copy" if same else "DIFFERS from the reference copy"
        print(f"{name}: {len(sql.strip())} bytes, {state}")
    sys.exit(0)
