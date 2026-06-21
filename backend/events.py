"""Named event markers — REST-facing service over EventStore."""
from __future__ import annotations

from .sinks.events import EventStore, build_event_store
from .state import store


class EventsService:
    def __init__(self):
        self._store: EventStore | None = None
        self._active_event: dict | None = None

    def _get_store(self) -> EventStore:
        if self._store is None:
            self._store = build_event_store(store.get_config())
        return self._store

    @property
    def active_event(self) -> dict | None:
        return self._active_event

    async def refresh_active(self) -> None:
        self._active_event = await self._get_store().active_event()

    async def start(self, name: str, tags: list[str], note: str | None) -> dict:
        ev = await self._get_store().start_event(name, tags, note)
        self._active_event = ev
        return ev

    async def stop(self, event_id: str) -> dict:
        ev = await self._get_store().stop_event(event_id)
        if self._active_event and self._active_event.get("id") == event_id:
            self._active_event = None
        return ev

    async def list(self, from_ns: int | None, to_ns: int | None) -> list[dict]:
        return await self._get_store().list_events(from_ns, to_ns)

    async def active(self) -> dict | None:
        return self._active_event


events = EventsService()
