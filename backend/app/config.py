"""Application configuration from environment variables."""
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


def _get_default_storage_path() -> str:
    """Compute absolute path to local-storage relative to this config file."""
    this_file = Path(__file__).resolve()
    backend_dir = this_file.parent.parent  # config.py -> app/ -> backend/
    return str(backend_dir / "local-storage")


class Settings(BaseSettings):
    # AWS Bedrock (used for all AI models including Claude)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_session_token: str = ""
    aws_region: str = "us-east-1"

    # Legacy: Anthropic API key (no longer needed - all models via Bedrock)
    anthropic_api_key: str = ""

    # Storage - will be set in get_settings() if not provided via env
    local_storage_path: str = ""
    credential_encryption_key: str = ""

    # Service URLs
    browser_sandbox_cdp: str = "http://browser-sandbox:9222"
    novnc_url: str = "http://browser-sandbox:6080"
    sandbox_recorder_url: str = "http://browser-sandbox:8888"

    # Database
    database_url: str = "sqlite:///./data/aethertest.db"

    # CORS
    frontend_url: str = "http://localhost:3001"

    # Agents
    max_turns: int = 100
    log_level: str = "INFO"
    use_strands: bool = False

    # Memory Layer Configuration
    # "local" = SQLite (development), "agentcore" = AWS Bedrock AgentCore Memory (production)
    memory_store_type: str = "local"
    memory_db_path: str = "./data/memory.db"
    # AWS AgentCore Memory settings (for production deployment)
    agentcore_memory_id: str = ""
    agentcore_memory_region: str = "us-west-2"

    model_config = {"env_file": (".env", "../.env"), "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # Set default storage path if not provided via environment
    if not settings.local_storage_path:
        object.__setattr__(settings, 'local_storage_path', _get_default_storage_path())
    return settings
