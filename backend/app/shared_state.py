"""Shared in-process state for task tracking and inter-component communication."""
import asyncio
from typing import Dict

# session_id → running asyncio.Task (so we can cancel it)
running_tasks: Dict[str, "asyncio.Task[None]"] = {}

# session_id → asyncio.Queue (for mid-run user chat messages)
session_queues: Dict[str, asyncio.Queue] = {}
