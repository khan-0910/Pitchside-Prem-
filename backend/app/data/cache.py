"""Raw snapshots on disk. The last good copy survives any provider failure."""

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass(frozen=True)
class Snapshot:
    source_id: str
    key: str
    path: Path
    sha256: str
    retrieved_at: datetime
    etag: str | None = None
    last_modified: str | None = None
    from_cache: bool = False  # True when the network copy could not be reached
    error: str | None = None

    def read_bytes(self) -> bytes:
        return self.path.read_bytes()


class SnapshotCache:
    def __init__(self, root: Path):
        self.root = root

    def _paths(self, source_id: str, key: str) -> tuple[Path, Path]:
        safe = key.replace("/", "_")
        return self.root / source_id / safe, self.root / source_id / f"{safe}.meta.json"

    def get(self, source_id: str, key: str) -> Snapshot | None:
        body, meta = self._paths(source_id, key)
        if not body.exists() or not meta.exists():
            return None
        m = json.loads(meta.read_text(encoding="utf-8"))
        return Snapshot(
            source_id=source_id, key=key, path=body, sha256=m["sha256"],
            retrieved_at=datetime.fromisoformat(m["retrieved_at"]),
            etag=m.get("etag"), last_modified=m.get("last_modified"),
        )

    def put(
        self, source_id: str, key: str, content: bytes,
        etag: str | None = None, last_modified: str | None = None,
        retrieved_at: datetime | None = None,
    ) -> Snapshot:
        body, meta = self._paths(source_id, key)
        body.parent.mkdir(parents=True, exist_ok=True)
        when = retrieved_at or datetime.now(UTC)
        sha = hashlib.sha256(content).hexdigest()
        # Write then rename, so a crash cannot leave a half-written last-good copy.
        tmp = body.with_suffix(body.suffix + ".tmp")
        tmp.write_bytes(content)
        os.replace(tmp, body)
        meta.write_text(
            json.dumps({"sha256": sha, "retrieved_at": when.isoformat(),
                        "etag": etag, "last_modified": last_modified}),
            encoding="utf-8",
        )
        return Snapshot(source_id, key, body, sha, when, etag, last_modified)

    def touch(self, snapshot: Snapshot, retrieved_at: datetime | None = None) -> Snapshot:
        """Provider confirmed the copy is current (HTTP 304)."""
        when = retrieved_at or datetime.now(UTC)
        _, meta = self._paths(snapshot.source_id, snapshot.key)
        m = json.loads(meta.read_text(encoding="utf-8"))
        m["retrieved_at"] = when.isoformat()
        meta.write_text(json.dumps(m), encoding="utf-8")
        return Snapshot(snapshot.source_id, snapshot.key, snapshot.path, snapshot.sha256, when,
                        snapshot.etag, snapshot.last_modified)
