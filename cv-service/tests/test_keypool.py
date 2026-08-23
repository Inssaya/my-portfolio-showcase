"""The key scheduler.

This is the piece most likely to fail subtly in production — under load, on a
provider's bad minute — so it is tested directly rather than only through the
HTTP layer. Concurrency is exercised with real threads: the lock either holds
or it does not, and a single-threaded test would never find out.
"""
from __future__ import annotations

import threading
import time

import pytest

from app.keypool import MAX_COOLDOWN_SECONDS, KeyPool, NoKeyAvailable


@pytest.fixture
def pool() -> KeyPool:
    return KeyPool(["sk-a", "sk-b", "sk-c"])


def test_duplicate_keys_are_collapsed() -> None:
    """A repeated key is not extra capacity — it shares one rate limit while
    making the pool look bigger than it is."""
    assert len(KeyPool(["sk-a", "sk-a", "sk-b", "  ", ""])) == 2


def test_acquire_spreads_across_idle_keys(pool: KeyPool) -> None:
    """A cold pool must fan out rather than stack everything on the first key."""
    labels = {pool.acquire().label for _ in range(3)}
    assert labels == {"key-1", "key-2", "key-3"}


def test_acquire_prefers_the_least_loaded(pool: KeyPool) -> None:
    busy = pool.acquire()          # key-1 now has 1 in flight
    other = pool.acquire()         # key-2
    pool.release(other)            # key-2 back to 0

    assert pool.acquire().label != busy.label


def test_sticky_key_is_reused_when_idle(pool: KeyPool) -> None:
    """Light load should not reshuffle a session between keys for no reason."""
    first = pool.acquire()
    pool.release(first)

    assert pool.acquire(sticky=first.label).label == first.label


def test_sticky_key_never_beats_load_balance(pool: KeyPool) -> None:
    """Stickiness is a hint. A loaded sticky key must lose to an idle one."""
    sticky = pool.acquire()
    pool.acquire(sticky=sticky.label)  # pile a second request onto it

    chosen = pool.acquire(sticky=sticky.label)
    assert chosen.label != sticky.label


def test_rate_limited_key_is_skipped(pool: KeyPool) -> None:
    first = pool.acquire()
    pool.release(first)
    pool.record_rate_limited(first, retry_after=30)

    for _ in range(5):
        assert pool.acquire().label != first.label


def test_provider_retry_after_is_honoured(pool: KeyPool) -> None:
    """Guessing shorter than the provider asked just earns another 429."""
    key = pool.acquire()
    pool.record_rate_limited(key, retry_after=45)

    assert key.snapshot(time.monotonic())["cooldown_remaining"] == pytest.approx(45, abs=1)


def test_backoff_grows_without_a_retry_after(pool: KeyPool) -> None:
    key = pool.acquire()
    pool.record_rate_limited(key, retry_after=None)
    first = key.cooldown_until

    pool.record_rate_limited(key, retry_after=None)
    second = key.cooldown_until

    assert second > first


def test_cooldown_is_capped(pool: KeyPool) -> None:
    """One bad minute must not park a key indefinitely."""
    key = pool.acquire()
    for _ in range(12):
        pool.record_rate_limited(key, retry_after=None)

    assert key.cooldown_until - time.monotonic() <= MAX_COOLDOWN_SECONDS + 1


def test_success_clears_the_cooldown_streak(pool: KeyPool) -> None:
    key = pool.acquire()
    pool.record_rate_limited(key, retry_after=None)
    pool.record_rate_limited(key, retry_after=None)
    pool.record_success(key)

    assert key.consecutive_limits == 0
    assert key.healthy_at(time.monotonic())


def test_disabled_key_never_returns(pool: KeyPool) -> None:
    """A 401 is permanent; left in rotation it poisons one request in three."""
    bad = pool.acquire()
    pool.release(bad)
    pool.disable(bad, "rejected by OpenAI (401)")

    for _ in range(10):
        assert pool.acquire().label != bad.label


def test_all_cooling_raises_with_a_wait(pool: KeyPool) -> None:
    for _ in range(3):
        key = pool.acquire()
        pool.release(key)
        pool.record_rate_limited(key, retry_after=20)

    with pytest.raises(NoKeyAvailable) as caught:
        pool.acquire()

    # The caller turns this into a 429 with Retry-After, so it must be real.
    assert 0 < caught.value.retry_after <= 20


def test_all_disabled_raises_without_a_wait(pool: KeyPool) -> None:
    """Waiting cannot fix revoked keys, so retry_after must be 0 — that is what
    separates a 429 (come back later) from a 503 (a human must act)."""
    for _ in range(3):
        key = pool.acquire()
        pool.release(key)
        pool.disable(key, "rejected by OpenAI (401)")

    with pytest.raises(NoKeyAvailable) as caught:
        pool.acquire()

    assert caught.value.retry_after == 0.0
    assert "disabled" in str(caught.value)


def test_empty_pool_reports_clearly() -> None:
    with pytest.raises(NoKeyAvailable, match="No OpenAI API keys"):
        KeyPool([]).acquire()


def test_snapshot_never_leaks_a_secret(pool: KeyPool) -> None:
    """The ops endpoint serves this; a leak there would be published."""
    blob = repr(pool.snapshot())

    assert "sk-a" not in blob and "sk-b" not in blob and "sk-c" not in blob
    assert "key-1" in blob


def test_key_state_repr_hides_the_secret(pool: KeyPool) -> None:
    """Logging a KeyState by accident must not print the key."""
    assert "sk-" not in repr(pool.acquire())


def test_concurrent_acquire_and_release_stays_consistent() -> None:
    """The lock either holds under real threads or it does not."""
    pool = KeyPool([f"sk-{i}" for i in range(4)])
    errors: list[Exception] = []

    def worker() -> None:
        try:
            for _ in range(200):
                key = pool.acquire()
                pool.release(key)
        except Exception as exc:  # noqa: BLE001 — recorded and re-raised below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert not errors
    # Every acquire was released, so nothing may be left checked out.
    assert all(entry["in_flight"] == 0 for entry in pool.snapshot())
    assert sum(entry["requests"] for entry in pool.snapshot()) == 8 * 200


def test_health_counts_each_state() -> None:
    pool = KeyPool(["sk-a", "sk-b", "sk-c"])
    cooling = pool.acquire()
    pool.release(cooling)
    pool.record_rate_limited(cooling, retry_after=30)
    dead = pool.acquire()
    pool.release(dead)
    pool.disable(dead, "rejected by OpenAI (401)")

    health = pool.health()
    assert health == {"total": 3, "ready": 1, "cooling": 1, "disabled": 1}
