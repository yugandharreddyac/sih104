"""
VOXSHIELD AI Service Configuration
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SERVICE_NAME: str = "voxshield-ai-service"
    SERVICE_VERSION: str = "1.0.0-phase1"
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    LOG_LEVEL: str = "INFO"
    AI_PHASE: str = "PHASE_1_FOUNDATION"

    class Config:
        env_prefix = "VOXSHIELD_AI_"
        extra = "ignore"


settings = Settings()
