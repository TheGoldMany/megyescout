"""Validate vercel.json against Vercel's published JSON schema.

    python scripts/validate_vercel_json.py path/to/vercel.schema.json [vercel.json]

The published schema declares draft-04 but does not itself pass the draft-04 metaschema
(`functions.*.experimentalTriggers.items` uses a construct the metaschema rejects), so
`jsonschema.validate()` raises SchemaError before looking at our file. We therefore skip the
metaschema check and only validate the instance. A built-in negative case makes sure the
validator still rejects broken configs, so a green run is meaningful.
"""
from __future__ import annotations

import copy
import json
import sys

import jsonschema


def errors(validator: jsonschema.protocols.Validator, doc: dict) -> list[str]:
    return [f"{'/'.join(map(str, e.absolute_path)) or '<root>'}: {e.message}"
            for e in sorted(validator.iter_errors(doc), key=lambda e: list(e.absolute_path))]


def main() -> int:
    schema_path = sys.argv[1]
    doc_path = sys.argv[2] if len(sys.argv) > 2 else "vercel.json"
    with open(schema_path, encoding="utf-8") as fh:
        schema = json.load(fh)
    with open(doc_path, encoding="utf-8") as fh:
        doc = json.load(fh)

    cls = jsonschema.validators.validator_for(schema, default=jsonschema.Draft7Validator)
    validator = cls(schema)  # no check_schema(): see module docstring

    problems = errors(validator, doc)
    if problems:
        print(f"{doc_path} is INVALID:")
        print("\n".join(f"  - {p}" for p in problems))
        return 1

    # sanity check: a binding without "env" and an unknown service key must be rejected
    broken = copy.deepcopy(doc)
    first = next(iter(broken.get("services", {}).values()), None)
    if first is None:
        print("no services in vercel.json; nothing to sanity-check")
        return 1
    first["bindings"] = [{"type": "service", "service": "etl", "format": "url"}]
    first["notARealKey"] = True
    if not errors(validator, broken):
        print("validator accepted a deliberately broken config — schema check is not working")
        return 1

    print(f"{doc_path} OK ({cls.__name__}, {len(doc.get('services', {}))} services)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
